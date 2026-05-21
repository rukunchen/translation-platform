export type ReadingStatus = 'unread' | 'reading' | 'read' | 'excerpted'
export type CitationStyle = 'apa' | 'gbt7714' | 'mla'

export type ResearchItem = {
  id: string
  user_id: string
  title: string
  authors: string
  year: string
  source_title: string
  publication_type: string
  doi: string
  url: string
  abstract: string
  keywords: string[]
  tags: string[]
  reading_status: ReadingStatus
  file_url: string | null
  metadata?: Record<string, string | string[] | undefined> | null
  created_at: string
  updated_at: string
}

export type ResearchNote = {
  id: string
  item_id: string
  user_id: string
  note_type: string
  content: string
  page_number: number | null
  selected_text: string
  related_writing_project_id: string | null
  created_at: string
  updated_at: string
}

export const READING_STATUS_LABEL: Record<ReadingStatus, string> = {
  unread: '未读',
  reading: '阅读中',
  read: '已读',
  excerpted: '已摘录',
}

export const NOTE_TYPES = [
  '核心观点',
  '理论框架',
  '研究方法',
  '数据来源',
  '主要发现',
  '可引用句子',
  '批评与不足',
  '我的评论',
  'AI 生成笔记',
]

export function splitList(value: string): string[] {
  return value
    .split(/[;；,，、\n]/)
    .map(v => v.trim())
    .filter(Boolean)
}

export function firstAuthor(authors: string): string {
  const first = splitList(authors)[0] || authors.trim()
  if (!first) return 'Author'
  const parts = first.split(/\s+/)
  return parts.length > 1 && /^[A-Za-z .'-]+$/.test(first) ? parts[parts.length - 1] : first
}

function clean(value?: string | null): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function metaValue(item: Partial<ResearchItem>, key: string): string {
  const value = item.metadata?.[key]
  if (Array.isArray(value)) return value.join('；')
  return clean(value)
}

function yearFrom(value: string): string {
  return clean(value).match(/\d{4}/)?.[0] || ''
}

function normalizePages(pages: string): string {
  return clean(pages).replace(/--/g, '-')
}

export function formatCitation(item: Pick<ResearchItem, 'authors' | 'year' | 'title' | 'source_title'> & Partial<ResearchItem>, style: CitationStyle, index = 1) {
  const authors = item.authors?.trim() || '作者'
  const year = yearFrom(item.year || metaValue(item, 'date')) || 'n.d.'
  const title = item.title?.trim() || 'Untitled'
  const source = item.source_title?.trim() || ''
  const volume = metaValue(item, 'volume')
  const issue = metaValue(item, 'issue') || metaValue(item, 'number')
  const pages = normalizePages(metaValue(item, 'pages'))
  const publisher = metaValue(item, 'publisher')
  const doi = item.doi || metaValue(item, 'doi')
  const url = item.url || metaValue(item, 'url')
  const publicationType = clean(item.publication_type).toLowerCase()
  const sourceSuffix = [source, volume && (issue ? `${volume}(${issue})` : volume), pages].filter(Boolean).join(', ')

  if (style === 'gbt7714') {
    const marker = publicationType.includes('book') ? '[M]' : publicationType.includes('chapter') ? '[A]' : publicationType.includes('thesis') ? '[D]' : '[J]'
    const placePublisher = publisher ? `${publisher}, ` : ''
    const detail = [sourceSuffix, placePublisher ? `${placePublisher}${year}` : year].filter(Boolean).join(', ')
    const access = doi ? ` DOI: ${doi}.` : url ? ` ${url}.` : ''
    return {
      inText: `[${index}]`,
      reference: `[${index}] ${authors}. ${title}${marker}. ${detail}.${access}`.replace(/\s+\./g, '.'),
    }
  }
  if (style === 'mla') {
    const detail = [source, volume && `vol. ${volume}`, issue && `no. ${issue}`, year, pages && `pp. ${pages}`].filter(Boolean).join(', ')
    const access = doi ? ` doi:${doi}.` : url ? ` ${url}.` : ''
    return {
      inText: `(${firstAuthor(authors)})`,
      reference: `${authors}. "${title}." ${detail}.${access}`.replace(/\s+\./g, '.'),
    }
  }
  const apaSource = source
    ? [source, volume && (issue ? `${volume}(${issue})` : volume), pages].filter(Boolean).join(', ')
    : publisher
  const access = doi ? ` https://doi.org/${doi.replace(/^https?:\/\/doi\.org\//i, '')}` : url ? ` ${url}` : ''
  return {
    inText: `(${firstAuthor(authors)}, ${year})`,
    reference: `${authors}. (${year}). ${title}.${apaSource ? ` ${apaSource}.` : ''}${access}`.replace(/\s+\./g, '.'),
  }
}

export function parseBibTeX(input: string): Array<Partial<ResearchItem>> {
  const entries = input.match(/@\w+\s*\{[\s\S]*?(?=\n@\w+\s*\{|$)/g) || []
  return entries.map(entry => {
    const typeMatch = entry.match(/^@(\w+)/)
    const fields: Record<string, string> = {}
    const body = entry.replace(/^@\w+\s*\{[^,]*,?/, '').replace(/\}\s*$/, '')
    const fieldRe = /(\w+)\s*=\s*(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|[^,\n]+)\s*,?/g
    let match: RegExpExecArray | null
    while ((match = fieldRe.exec(body)) !== null) {
      const key = match[1].toLowerCase()
      fields[key] = match[2]
        .replace(/^["{]+|["}]+$/g, '')
        .replace(/[{}]/g, '')
        .replace(/\\&/g, '&')
        .replace(/\s+/g, ' ')
        .trim()
    }
    const field = (...names: string[]) => names.map(name => fields[name.toLowerCase()]).find(Boolean) || ''
    const metadata = {
      editor: field('editor').replace(/\s+and\s+/gi, '；'),
      date: field('date'),
      journal: field('journal', 'journaltitle'),
      booktitle: field('booktitle'),
      publisher: field('publisher'),
      volume: field('volume'),
      number: field('number'),
      issue: field('issue'),
      pages: field('pages'),
      isbn: field('isbn'),
      issn: field('issn'),
      language: field('language', 'langid'),
      doi: field('doi'),
      url: field('url'),
    }
    return {
      publication_type: typeMatch?.[1] || 'article',
      title: field('title'),
      authors: field('author').replace(/\s+and\s+/gi, '；'),
      year: yearFrom(field('year') || field('date')),
      source_title: field('journal', 'journaltitle') || field('booktitle') || field('publisher'),
      doi: field('doi'),
      url: field('url'),
      abstract: field('abstract'),
      keywords: splitList(field('keywords')),
      tags: [],
      reading_status: 'unread' as ReadingStatus,
      metadata,
    }
  }).filter(item => item.title || item.authors)
}

export function parseRIS(input: string): Array<Partial<ResearchItem>> {
  const chunks = input.split(/\nER\s+-/i).map(s => s.trim()).filter(Boolean)
  return chunks.map(chunk => {
    const lines = chunk.split(/\r?\n/)
    const values = (...tags: string[]) => lines
      .filter(line => tags.some(tag => line.toUpperCase().startsWith(`${tag.toUpperCase()}  -`)))
      .map(line => line.slice(6).replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    const startPage = values('SP')[0] || ''
    const endPage = values('EP')[0] || ''
    const pages = startPage && endPage ? `${startPage}-${endPage}` : startPage
    const metadata = {
      editor: values('ED').join('；'),
      date: values('PY', 'Y1', 'DA')[0] || '',
      journal: values('JO', 'JF', 'T2')[0] || '',
      publisher: values('PB')[0] || '',
      volume: values('VL')[0] || '',
      issue: values('IS')[0] || '',
      pages,
      isbn: values('SN')[0] || '',
      issn: values('SN')[0] || '',
      language: values('LA')[0] || '',
      doi: values('DO')[0] || '',
      url: values('UR')[0] || '',
    }
    return {
      publication_type: values('TY')[0] || 'article',
      title: values('TI', 'T1')[0] || '',
      authors: values('AU', 'A1').join('；'),
      year: yearFrom(values('PY', 'Y1', 'DA')[0] || ''),
      source_title: values('JO', 'JF', 'T2')[0] || '',
      doi: values('DO')[0] || '',
      url: values('UR')[0] || '',
      abstract: values('AB')[0] || '',
      keywords: values('KW'),
      tags: [],
      reading_status: 'unread' as ReadingStatus,
      metadata,
    }
  }).filter(item => item.title || item.authors)
}
