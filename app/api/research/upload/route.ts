import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { extractPdfMetadata } from '@/lib/researchPdfMetadata'
import crypto from 'crypto'

const BUCKET = 'research-pdfs'
const MAX_SIZE = 50 * 1024 * 1024
export const maxDuration = 60

type UploadMetadata = {
  title: string
  authors: string
  year: string
  source_title: string
  publication_type: string
  doi: string
  abstract: string
  keywords: string[]
  tags: string[]
  metadata: Record<string, string | string[] | undefined>
}

function safeFileName(name: string): string {
  return (name || 'paper.pdf').replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_')
}

export async function POST(req: NextRequest) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: '请选择 PDF 文件' }, { status: 400 })
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'MVP 阶段仅支持 PDF 上传' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'PDF 不能超过 50MB' }, { status: 400 })

  const admin = supabaseAdmin()
  const path = `${user.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: 'application/pdf', upsert: false })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const fallbackTitle = String(form.get('title') || file.name.replace(/\.pdf$/i, '')).trim()
  let extracted: UploadMetadata = {
    title: fallbackTitle,
    authors: '',
    year: '',
    source_title: '',
    publication_type: 'article',
    doi: '',
    abstract: '',
    keywords: [] as string[],
    tags: [] as string[],
    metadata: {
      originalFileName: file.name,
      fileSize: String(file.size),
      recognitionSource: 'filename-only',
      recognitionConfidence: 'low',
      impactFactor: '',
      journalQuartile: '',
      journalCategory: '',
      citationStyle: 'APA',
      missingFields: ['作者', '发表时间', '摘要', '发表期刊/来源', '影响因子', '期刊分区'],
    },
  }
  try {
    extracted = { ...extracted, ...(await extractPdfMetadata(file, fallbackTitle)) }
  } catch (error) {
    console.warn('PDF metadata extraction failed:', error)
  }

  const { data, error } = await admin
    .from('research_library_items')
    .insert({
      user_id: user.id,
      title: String(form.get('title') || extracted.title || fallbackTitle),
      authors: String(form.get('authors') || extracted.authors || ''),
      year: String(form.get('year') || extracted.year || ''),
      source_title: String(form.get('source_title') || extracted.source_title || ''),
      publication_type: String(form.get('publication_type') || extracted.publication_type || 'article'),
      doi: String(form.get('doi') || extracted.doi || ''),
      url: String(form.get('url') || ''),
      abstract: String(form.get('abstract') || extracted.abstract || ''),
      keywords: String(form.get('keywords') || '').split(/[;；,，、]/).map(s => s.trim()).filter(Boolean).concat(extracted.keywords || []).filter(Boolean),
      tags: String(form.get('tags') || '').split(/[;；,，、]/).map(s => s.trim()).filter(Boolean).concat(extracted.tags || []).filter(Boolean),
      reading_status: 'unread',
      file_url: path,
      metadata: extracted.metadata,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ item: data })
}

export async function DELETE(req: NextRequest) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const itemId = req.nextUrl.searchParams.get('itemId')
  const body = await req.json().catch(() => ({})) as { itemIds?: string[] }
  const itemIds = Array.from(new Set([...(body.itemIds || []), ...(itemId ? [itemId] : [])].filter(Boolean)))
  if (itemIds.length === 0) return NextResponse.json({ error: '缺少 itemId' }, { status: 400 })

  const admin = supabaseAdmin()
  const { data: items } = await admin
    .from('research_library_items')
    .select('id, file_url')
    .in('id', itemIds)
    .eq('user_id', user.id)
  if (!items || items.length === 0) return NextResponse.json({ error: '文献不存在或无权删除' }, { status: 404 })

  const { error } = await admin
    .from('research_library_items')
    .delete()
    .in('id', items.map(item => item.id))
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filePaths = items.map(item => item.file_url).filter(Boolean) as string[]
  if (filePaths.length > 0) {
    await admin.storage.from(BUCKET).remove(filePaths)
  }

  return NextResponse.json({ ok: true, deleted: items.length })
}
