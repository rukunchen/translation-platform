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
  { name: '中国新闻网·时政', url: 'https://www.chinanews.com.cn/rss/china.xml' },
  { name: '中国新闻网·财经', url: 'https://www.chinanews.com.cn/rss/finance.xml' },
  { name: '中国新闻网·社会', url: 'https://www.chinanews.com.cn/rss/society.xml' },
  { name: '中国新闻网·生活', url: 'https://www.chinanews.com.cn/rss/life.xml' },
]

const INTERNATIONAL_FEEDS: FeedSource[] = [
  { name: 'BBC News·US', url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml' },
  { name: 'The Guardian·US', url: 'https://www.theguardian.com/us-news/rss' },
  { name: 'UN News', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' },
]

const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' }

let twelveHourCache: { key: string; payload: NewsHotspotsPayload } | null = null

function shanghaiTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date)
  return Object.fromEntries(parts.map(part => [part.type, part.value]))
}

function shanghaiDateKey(date = new Date()): string {
  const values = shanghaiTimeParts(date)
  return `${values.year}-${values.month}-${values.day}`
}

function shanghaiTwelveHourKey(date = new Date()): string {
  const values = shanghaiTimeParts(date)
  const parsedHour = Number(values.hour || '0')
  const hour = parsedHour === 24 ? 0 : parsedHour
  return `${values.year}-${values.month}-${values.day}-${hour < 12 ? '00' : '12'}`
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
  const batches = await Promise.all(sources.map(async source => ({
    source,
    items: await fetchFeed(source),
  })))
  const seen = new Set<string>()
  const merged: NewsHotspotItem[] = []

  for (let index = 0; merged.length < 10; index += 1) {
    let added = false

    for (const batch of batches) {
      const item = batch.items[index]
      if (!item) continue

      const key = item.title.toLowerCase()
      if (seen.has(key)) continue

      seen.add(key)
      merged.push(item)
      added = true
      if (merged.length >= 10) break
    }

    if (!added) break
  }

  return merged
}

export async function GET() {
  const today = shanghaiDateKey()
  const cacheKey = shanghaiTwelveHourKey()

  if (twelveHourCache?.key === cacheKey) {
    return NextResponse.json(twelveHourCache.payload, {
      headers: NO_CACHE_HEADERS,
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
    twelveHourCache = { key: cacheKey, payload }
  }

  return NextResponse.json(payload, {
    headers: NO_CACHE_HEADERS,
  })
}
