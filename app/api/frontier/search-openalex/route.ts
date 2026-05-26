import { NextRequest, NextResponse } from 'next/server'

type OpenAlexInvertedIndex = Record<string, number[]>

type OpenAlexWork = {
  title?: string | null
  display_name?: string | null
  publication_year?: number | null
  doi?: string | null
  primary_location?: {
    landing_page_url?: string | null
    source?: {
      display_name?: string | null
    } | null
  } | null
  authorships?: {
    author?: {
      display_name?: string | null
    } | null
  }[]
  abstract_inverted_index?: OpenAlexInvertedIndex | null
  concepts?: {
    display_name?: string | null
  }[]
}

type OpenAlexResponse = {
  results?: OpenAlexWork[]
}

function parseLimit(value: string | null) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return 10
  return Math.min(Math.floor(parsed), 30)
}

function parseYear(value: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  if (!/^\d{4}$/.test(trimmed)) return null
  return Number(trimmed)
}

function abstractFromInvertedIndex(index: OpenAlexInvertedIndex | null | undefined) {
  if (!index) return ''

  const words: Array<[number, string]> = []
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) {
      if (Number.isFinite(position)) words.push([position, word])
    }
  }

  return words
    .sort(([left], [right]) => left - right)
    .map(([, word]) => word)
    .join(' ')
}

function normalizeDoi(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/, '')
    .replace(/\/$/, '')
}

function normalizeUrl(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
}

function normalizeTitle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function mapWork(work: OpenAlexWork, field: string, region: string) {
  const landingPage = work.primary_location?.landing_page_url || ''
  const doi = work.doi || ''

  return {
    title: work.title || work.display_name || '',
    authors: (work.authorships || [])
      .map(authorship => authorship.author?.display_name || '')
      .filter(Boolean)
      .join(', '),
    year: work.publication_year || null,
    source: work.primary_location?.source?.display_name || '',
    region,
    field,
    method_summary: '',
    conclusion_summary: '',
    abstract: abstractFromInvertedIndex(work.abstract_inverted_index),
    doi,
    url: doi || landingPage,
    tags: (work.concepts || [])
      .map(concept => concept.display_name || '')
      .filter(Boolean)
      .slice(0, 5),
  }
}

type MappedWork = ReturnType<typeof mapWork>

function duplicateKeys(item: MappedWork) {
  const keys: string[] = []
  const doi = normalizeDoi(item.doi)
  if (doi) keys.push(`doi:${doi}`)

  const url = normalizeUrl(item.url)
  if (url) keys.push(`url:${url}`)

  const title = normalizeTitle(item.title)
  if (title) keys.push(`title:${title}:${item.year || ''}`)

  return keys
}

function dedupeItems(items: MappedWork[]) {
  const seen = new Set<string>()
  const deduped: MappedWork[] = []

  for (const item of items) {
    const keys = duplicateKeys(item)
    if (keys.some(key => seen.has(key))) continue

    deduped.push(item)
    keys.forEach(key => seen.add(key))
  }

  return deduped
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const query = (params.get('query') || '').trim()
  if (!query) return NextResponse.json({ error: '请输入搜索关键词。' }, { status: 400 })

  const field = (params.get('field') || '').trim()
  const region = (params.get('region') || '').trim()
  const fromYear = parseYear(params.get('fromYear'))
  const toYear = parseYear(params.get('toYear'))
  const limit = parseLimit(params.get('limit'))

  const openAlexUrl = new URL('https://api.openalex.org/works')
  openAlexUrl.searchParams.set('search', query)
  openAlexUrl.searchParams.set('per-page', String(limit))
  openAlexUrl.searchParams.set('sort', 'publication_year:desc')
  openAlexUrl.searchParams.set(
    'select',
    'title,display_name,publication_year,primary_location,doi,authorships,abstract_inverted_index,concepts'
  )

  const filters: string[] = []
  if (fromYear && toYear) {
    filters.push(`publication_year:${Math.min(fromYear, toYear)}-${Math.max(fromYear, toYear)}`)
  } else if (fromYear) {
    filters.push(`from_publication_date:${fromYear}-01-01`)
  } else if (toYear) {
    filters.push(`to_publication_date:${toYear}-12-31`)
  }
  if (filters.length > 0) openAlexUrl.searchParams.set('filter', filters.join(','))

  try {
    const response = await fetch(openAlexUrl, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `OpenAlex 搜索失败，请稍后再试。状态码：${response.status}` },
        { status: 502 }
      )
    }

    const data = await response.json() as OpenAlexResponse
    const items = dedupeItems((data.results || []).map(work => mapWork(work, field, region)))

    return NextResponse.json({ items })
  } catch {
    return NextResponse.json(
      { error: 'OpenAlex 暂时无法连接，请稍后再试。' },
      { status: 502 }
    )
  }
}
