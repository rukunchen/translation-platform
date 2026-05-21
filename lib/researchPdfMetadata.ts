import type { ResearchItem } from './researchLibrary'
import { generateWith, providerConfigured } from './aiProviders'
import { DEFAULT_MODEL_BY_PROVIDER } from './modelPresets'

type ExtractedPdfMetadata = Partial<ResearchItem> & {
  metadata: Record<string, string | string[] | undefined>
}

type AiMetadata = {
  title?: string
  authors?: string
  year?: string
  source_title?: string
  publication_type?: string
  doi?: string
  abstract?: string
  abstractKeyPoints?: string
  keywords?: string[]
  tags?: string[]
  journalCategory?: string
  citationStyle?: string
}

function linesFrom(text: string): string[] {
  return text
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function clean(value?: string | null): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function firstMatch(text: string, re: RegExp): string {
  return clean(text.match(re)?.[1])
}

function extractYear(text: string): string {
  return text.match(/\b(19|20)\d{2}\b/)?.[0] || ''
}

function extractDoi(text: string): string {
  return clean(text.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i)?.[0])
}

function extractAbstract(text: string): string {
  const abstract = firstMatch(
    text,
    /(?:^|\n)\s*(?:abstract|摘要)\s*[:：]?\s*([\s\S]{80,2400}?)(?=\n\s*(?:keywords?|关键词|article history|introduction|1\.|i\.|摘\s*要)\b)/i
  )
  return abstract || firstMatch(text, /(?:^|\n)\s*(?:abstract|摘要)\s*[:：]?\s*([\s\S]{80,1500})/i)
}

function extractKeywords(text: string): string[] {
  const raw = firstMatch(text, /(?:keywords?|关键词)\s*[:：]\s*([^\n]{5,400})/i)
  if (!raw) return []
  return raw
    .split(/[;；,，、]/)
    .map(item => clean(item))
    .filter(Boolean)
    .slice(0, 12)
}

function extractTitle(lines: string[], fallback: string): string {
  const candidates = lines.slice(0, 80).filter(line => {
    const lower = line.toLowerCase()
    if (line.length < 18 || line.length > 220) return false
    if (/^(abstract|keywords?|issn|doi|http|www\.|article history|received|accepted|published)$/i.test(line)) return false
    if (lower.includes('routledge') || lower.includes('taylor') || lower.includes('journal homepage')) return false
    if (lower.includes('school of') || lower.includes('university')) return false
    if (/^\d+$/.test(line)) return false
    return true
  })
  const withColon = candidates.find(line => line.includes(':') && /[A-Za-z]{4}/.test(line))
  const longest = [...candidates].sort((a, b) => b.length - a.length)[0]
  return clean(withColon || longest || fallback)
}

function extractJournal(lines: string[]): string {
  const sourceLine = lines.slice(0, 50).find(line =>
    /journal|studies|perspectives|translator|translation|review|quarterly/i.test(line)
    && line.length < 120
    && !/homepage|doi|article|abstract/i.test(line)
  )
  if (sourceLine) return clean(sourceLine)
  return clean(lines.slice(0, 20).find(line => line.length > 4 && line.length < 80 && !/\d/.test(line)) || '')
}

function abstractKeyPoints(abstract: string): string {
  return abstract
    .split(/(?<=[。！？.!?])\s+/)
    .map(item => clean(item))
    .filter(Boolean)
    .slice(0, 2)
    .join(' ')
}

function parseJsonObject(text: string): AiMetadata | null {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0]) as AiMetadata
  } catch {
    return null
  }
}

async function extractWithAi(text: string): Promise<AiMetadata | null> {
  if (!providerConfigured('openai')) return null
  const prompt = `你是学术文献元数据抽取助手。请根据下面 PDF 前几页文本抽取文献信息，只输出 JSON，不要解释。

JSON 字段：
{
  "title": "",
  "authors": "",
  "year": "",
  "source_title": "",
  "publication_type": "article",
  "doi": "",
  "abstract": "",
  "abstractKeyPoints": "",
  "keywords": [],
  "tags": [],
  "journalCategory": "",
  "citationStyle": "APA"
}

要求：
1. 不确定的字段留空，不要编造；
2. authors 多位作者用中文分号“；”分隔；
3. tags 用 3-6 个学科或主题标签；
4. abstractKeyPoints 用中文概括摘要重点，1-3 句；
5. 发表期刊填入 source_title，不能把出版社或网页页眉误作期刊。

PDF 文本：
${text.slice(0, 12000)}`
  const result = await generateWith('openai', {
    model: DEFAULT_MODEL_BY_PROVIDER.openai,
    temperature: 0.1,
    prompt,
  })
  if (result.error || !result.text) return null
  return parseJsonObject(result.text)
}

export async function extractPdfMetadata(file: File, fallbackTitle: string): Promise<ExtractedPdfMetadata> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: buffer })
  const [textResult, infoResult] = await Promise.all([
    parser.getText({ partial: [1, 2, 3] }),
    parser.getInfo().catch(() => null),
  ])
  await parser.destroy()
  const text = clean(textResult.text || '')
  const lines = linesFrom(textResult.text || '')
  const info = infoResult?.info as Record<string, string | undefined> | undefined

  const title = clean(info?.Title) || extractTitle(lines, fallbackTitle)
  const authors = clean(info?.Author)
  const year = extractYear(text)
  const doi = extractDoi(text)
  const abstract = extractAbstract(textResult.text || '')
  const keywords = extractKeywords(textResult.text || '')
  const sourceTitle = extractJournal(lines)
  const ai = await extractWithAi(text)
  const nextTitle = clean(ai?.title) || title
  const nextAuthors = clean(ai?.authors) || authors
  const nextYear = clean(ai?.year) || year
  const nextDoi = clean(ai?.doi) || doi
  const nextAbstract = clean(ai?.abstract) || abstract
  const nextKeywords = Array.isArray(ai?.keywords) && ai.keywords.length > 0 ? ai.keywords.map(clean).filter(Boolean) : keywords
  const nextTags = Array.isArray(ai?.tags) && ai.tags.length > 0 ? ai.tags.map(clean).filter(Boolean) : (nextKeywords.length > 0 ? nextKeywords.slice(0, 4) : ['待归类'])
  const nextSourceTitle = clean(ai?.source_title) || sourceTitle
  const nextAbstractKeyPoints = clean(ai?.abstractKeyPoints) || abstractKeyPoints(nextAbstract)
  const missingFields = [
    !nextAuthors && '作者',
    !nextSourceTitle && '发表期刊/来源',
    !nextYear && '发表时间',
    !nextAbstract && '摘要',
    !nextDoi && 'DOI',
    '影响因子',
    '期刊分区',
  ].filter(Boolean) as string[]

  return {
    title: nextTitle,
    authors: nextAuthors,
    year: nextYear,
    source_title: nextSourceTitle,
    publication_type: clean(ai?.publication_type) || 'article',
    doi: nextDoi,
    abstract: nextAbstract,
    keywords: nextKeywords,
    tags: nextTags,
    metadata: {
      abstractKeyPoints: nextAbstractKeyPoints,
      citationStyle: clean(ai?.citationStyle) || 'APA',
      impactFactor: '',
      journalQuartile: '',
      journalCategory: clean(ai?.journalCategory),
      autoClassifiedAs: nextTags,
      missingFields,
      recognitionSource: ai ? 'pdf-first-pages-ai' : 'pdf-first-pages',
      recognitionConfidence: [nextTitle, nextYear, nextSourceTitle, nextAbstract].filter(Boolean).length >= 3 ? (ai ? 'high' : 'medium') : 'low',
      originalFileName: file.name,
      fileSize: String(file.size),
    },
  }
}
