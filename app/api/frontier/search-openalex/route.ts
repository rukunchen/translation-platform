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

type SearchMode = 'keyword' | 'precise'

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'for',
  'from',
  'in',
  'is',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
])

function parseLimit(value: string | null) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return 20
  return Math.min(Math.floor(parsed), 30)
}

function parseMode(value: string | null): SearchMode {
  return value === 'precise' ? 'precise' : 'keyword'
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

function searchText(value: string) {
  return value.trim().toLowerCase()
}

function tokenize(value: string) {
  return Array.from(new Set(
    searchText(value)
      .split(/[^\p{L}\p{N}.]+/u)
      .map(term => term.trim())
      .filter(term => term.length > 1 && !STOP_WORDS.has(term))
  ))
}

function termMatchesText(term: string, text: string) {
  if (text.includes(term)) return true
  if (term === 'llm' || term === 'llms') return /large language models?/.test(text)
  if (term === 'nmt') return text.includes('neural machine translation')
  return false
}

function itemSearchText(item: MappedWork) {
  return searchText([
    item.title,
    item.authors,
    item.source,
    item.abstract,
    item.doi,
    item.url,
    ...item.tags,
  ].join(' '))
}

function termCoverage(terms: string[], text: string) {
  if (terms.length === 0) return 0
  const matched = terms.filter(term => termMatchesText(term, text)).length
  return matched / terms.length
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

function relevanceScore(item: MappedWork, query: string, subject: string, mode: SearchMode) {
  const title = searchText(item.title)
  const abstract = searchText(item.abstract)
  const tags = searchText(item.tags.join(' '))
  const source = searchText(item.source)
  const authors = searchText(item.authors)
  const allText = itemSearchText(item)
  const queryText = searchText(query)
  const queryTerms = tokenize(query)
  const subjectTerms = tokenize(subject)
  const subjectCoverage = termCoverage(subjectTerms, `${title} ${abstract} ${tags} ${source}`)

  if (mode === 'precise') {
    const queryDoi = normalizeDoi(query)
    if (queryDoi && /^10\.\S+\/\S+$/i.test(queryDoi)) {
      const itemDoi = normalizeDoi(item.doi || item.url)
      return itemDoi === queryDoi ? 1000 : -1
    }

    const normalizedQueryTitle = normalizeTitle(query)
    const normalizedItemTitle = normalizeTitle(item.title)
    if (normalizedQueryTitle && normalizedItemTitle === normalizedQueryTitle) return 900
    if (normalizedQueryTitle && normalizedItemTitle.includes(normalizedQueryTitle)) return 760
    if (queryText && title.includes(queryText)) return 720

    const coverage = termCoverage(queryTerms, title)
    if (queryTerms.length > 0 && coverage >= 0.85) return 650 + Math.round(coverage * 100)
    return -1
  }

  const queryCoverage = termCoverage(queryTerms, allText)
  const requiredCoverage = queryTerms.length <= 4 ? 1 : 0.8
  if (queryTerms.length > 0 && queryCoverage < requiredCoverage) return -1

  let score = 0
  if (queryText && title.includes(queryText)) score += 40
  if (queryText && abstract.includes(queryText)) score += 18
  if (queryText && tags.includes(queryText)) score += 18

  for (const term of queryTerms) {
    if (termMatchesText(term, title)) score += 8
    if (termMatchesText(term, tags)) score += 6
    if (termMatchesText(term, abstract)) score += 3
    if (termMatchesText(term, source) || termMatchesText(term, authors)) score += 1
  }

  if (subjectTerms.length > 0) {
    const requiredSubjectCoverage = subjectTerms.length <= 3 ? 1 : 0.75
    if (subjectCoverage < requiredSubjectCoverage) return -1
    score += Math.round(subjectCoverage * 30)
  }

  score += Math.round(queryCoverage * 20)
  return score
}

function rankItems(items: MappedWork[], query: string, subject: string, mode: SearchMode, limit: number) {
  const minimumScore = mode === 'precise' ? 0 : 10
  return items
    .map(item => ({ item, score: relevanceScore(item, query, subject, mode) }))
    .filter(entry => entry.score >= minimumScore)
    .sort((left, right) => (
      right.score - left.score ||
      (right.item.year || 0) - (left.item.year || 0)
    ))
    .slice(0, limit)
    .map(entry => entry.item)
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const query = (params.get('query') || '').trim()
  if (!query) return NextResponse.json({ error: '请输入搜索关键词。' }, { status: 400 })

  const mode = parseMode(params.get('mode'))
  const subject = (params.get('subject') || '').trim()
  const field = (params.get('field') || '').trim()
  const region = (params.get('region') || '').trim()
  const fromYear = parseYear(params.get('fromYear'))
  const toYear = parseYear(params.get('toYear'))
  const limit = parseLimit(params.get('limit'))

  const openAlexUrl = new URL('https://api.openalex.org/works')
  openAlexUrl.searchParams.set('search', query)
  openAlexUrl.searchParams.set('per-page', String(Math.min(Math.max(limit * 5, 50), 100)))
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
    const items = rankItems(
      dedupeItems((data.results || []).map(work => mapWork(work, field, region))),
      query,
      subject,
      mode,
      limit
    )

    return NextResponse.json({ items })
  } catch {
    return NextResponse.json(
      { error: 'OpenAlex 暂时无法连接，请稍后再试。' },
      { status: 502 }
    )
  }
}
