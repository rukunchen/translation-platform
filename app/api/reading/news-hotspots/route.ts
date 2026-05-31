import { NextResponse } from 'next/server'

type FeedSource = {
  name: string
  url: string
}

type NewsHotspotItem = {
  title: string
  source: string
  url: string
  publishedAt: string
}

type NewsHotspotsPayload = {
  date: string
  updatedAt: string
  domestic: NewsHotspotItem[]
  international: NewsHotspotItem[]
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DOMESTIC_FEEDS: FeedSource[] = [
  { name: '中国新闻网', url: 'https://www.chinanews.com.cn/rss/china.xml' },
]

const INTERNATIONAL_FEEDS: FeedSource[] = [
  { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss' },
  { name: 'NPR', url: 'https://feeds.npr.org/1004/rss.xml' },
]

let dailyCache: NewsHotspotsPayload | null = null

function shanghaiDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, ' ')
}

function decodeHtml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => {
      try {
        return String.fromCodePoint(parseInt(code, 16))
      } catch {
        return ''
      }
    })
    .replace(/&#(\d+);/g, (_, code: string) => {
      try {
        return String.fromCodePoint(parseInt(code, 10))
      } catch {
        return ''
      }
    })
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, entity: string) => {
      const map: Record<string, string> = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
        nbsp: ' ',
      }
      return map[entity.toLowerCase()] || ''
    })
}

function cleanText(value: string): string {
  return decodeHtml(stripTags(value)).replace(/\s+/g, ' ').trim()
}

function readTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match ? cleanText(match[1]) : ''
}

function readAtomLink(block: string): string {
  const match = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)
  return match ? decodeHtml(match[1]).trim() : ''
}

async function fetchFeed(source: FeedSource): Promise<NewsHotspotItem[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(source.url, {
      cache: 'no-store',
      headers: {
        accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        'user-agent': 'Yijing Reading Room/1.0',
      },
      signal: controller.signal,
    })

    if (!response.ok) return []

    const xml = await response.text()
    const itemBlocks = Array.from(xml.matchAll(/<item\b[\s\S]*?<\/item>/gi), match => match[0])
    const entryBlocks = itemBlocks.length
      ? itemBlocks
      : Array.from(xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi), match => match[0])

    return entryBlocks
      .map(block => {
        const title = readTag(block, 'title')
        const link = readTag(block, 'link') || readAtomLink(block)
        const publishedAt = readTag(block, 'pubDate') || readTag(block, 'updated') || readTag(block, 'dc:date')
        return { title, source: source.name, url: link, publishedAt }
      })
      .filter(item => item.title)
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

async function collectFeeds(sources: FeedSource[]): Promise<NewsHotspotItem[]> {
  const batches = await Promise.all(sources.map(fetchFeed))
  const seen = new Set<string>()
  const merged: NewsHotspotItem[] = []

  for (const item of batches.flat()) {
    const key = item.title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
    if (merged.length >= 10) break
  }

  return merged
}

export async function GET() {
  const today = shanghaiDateKey()

  if (dailyCache?.date === today) {
    return NextResponse.json(dailyCache, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400' },
    })
  }

  const [domestic, international] = await Promise.all([
    collectFeeds(DOMESTIC_FEEDS),
    collectFeeds(INTERNATIONAL_FEEDS),
  ])

  if (!domestic.length && !international.length) {
    return NextResponse.json({ error: '新闻热点暂时无法加载' }, { status: 502 })
  }

  const payload = {
    date: today,
    updatedAt: new Date().toISOString(),
    domestic,
    international,
  }
  const isComplete = domestic.length > 0 && international.length > 0

  if (isComplete) {
    dailyCache = payload
  }

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': isComplete
        ? 'public, max-age=300, stale-while-revalidate=86400'
        : 'public, max-age=60',
    },
  })
}
