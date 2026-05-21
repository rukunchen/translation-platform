import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { extractPdfMetadata } from '@/lib/researchPdfMetadata'

export const maxDuration = 60

const BUCKET = 'research-pdfs'

export async function POST(req: NextRequest) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { itemId } = await req.json().catch(() => ({})) as { itemId?: string }
  if (!itemId) return NextResponse.json({ error: '缺少 itemId' }, { status: 400 })

  const admin = supabaseAdmin()
  const { data: item } = await admin
    .from('research_library_items')
    .select('*')
    .eq('id', itemId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!item) return NextResponse.json({ error: '文献不存在或无权访问' }, { status: 404 })
  if (!item.file_url) return NextResponse.json({ error: '该文献没有 PDF，无法重新识别' }, { status: 400 })

  const { data: blob, error: downloadError } = await admin.storage.from(BUCKET).download(item.file_url)
  if (downloadError || !blob) return NextResponse.json({ error: downloadError?.message || '下载 PDF 失败' }, { status: 500 })

  const fileName = String(item.metadata?.originalFileName || item.title || 'paper.pdf')
  const file = new File([blob], fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`, { type: 'application/pdf' })
  const extracted = await extractPdfMetadata(file, item.title || fileName.replace(/\.pdf$/i, ''))
  const metadata = { ...(item.metadata || {}), ...(extracted.metadata || {}) }

  const { data, error } = await admin
    .from('research_library_items')
    .update({
      title: extracted.title || item.title || '',
      authors: extracted.authors || item.authors || '',
      year: extracted.year || item.year || '',
      source_title: extracted.source_title || item.source_title || '',
      publication_type: extracted.publication_type || item.publication_type || 'article',
      doi: extracted.doi || item.doi || '',
      abstract: extracted.abstract || item.abstract || '',
      keywords: extracted.keywords?.length ? extracted.keywords : item.keywords || [],
      tags: extracted.tags?.length ? extracted.tags : item.tags || [],
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .eq('user_id', user.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ item: data })
}
