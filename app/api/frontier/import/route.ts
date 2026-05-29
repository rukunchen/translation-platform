import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

type FrontierImportItem = {
  title?: string
  authors?: string
  year?: number | null
  source?: string
  region?: string
  field?: string
  abstract?: string
  doi?: string
  url?: string
  tags?: string[]
}

const VALID_REGIONS = new Set(['国内', '国外'])
const VALID_FIELDS = new Set([
  '翻译',
  '翻译科技',
  '语料库',
  '人工智能',
  '心理学',
  '区域国别研究',
  '语言学',
  '教育学',
  '传播学',
  '文学文化',
  '数字人文',
  '其他',
])
const MAX_IMPORT_ITEMS = 30

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanYear(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function cleanTags(value: unknown) {
  return Array.isArray(value)
    ? value.map(tag => cleanText(tag)).filter(Boolean)
    : []
}

function cleanRegion(value: unknown) {
  const region = cleanText(value)
  return VALID_REGIONS.has(region) ? region : null
}

function cleanField(value: unknown) {
  const field = cleanText(value)
  return VALID_FIELDS.has(field) ? field : '其他'
}

export async function POST(req: NextRequest) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { items?: FrontierImportItem[] }
  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_IMPORT_ITEMS) : []
  const rows = items
    .map(item => ({
      user_id: user.id,
      title: cleanText(item.title),
      authors: cleanText(item.authors) || null,
      year: cleanYear(item.year),
      source: cleanText(item.source) || null,
      region: cleanRegion(item.region),
      field: cleanField(item.field),
      method_summary: null,
      conclusion_summary: null,
      abstract: cleanText(item.abstract) || null,
      doi: cleanText(item.doi) || null,
      url: cleanText(item.url) || null,
      tags: cleanTags(item.tags),
    }))
    .filter(row => row.title)

  if (rows.length === 0) {
    return NextResponse.json({ error: '没有可导入的文献。' }, { status: 400 })
  }

  const { error } = await supabaseAdmin()
    .from('frontier_literature_items')
    .insert(rows)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ inserted: rows.length })
}
