import { NextRequest, NextResponse } from 'next/server'
import { isPlatformAdmin } from '@/lib/platformAdmin'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

const ADMIN_EMAIL = 'rukunchen@hotmail.com'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type PublicTermPayload = {
  category_id: string
  source_text: string
  target_text: string
  definition: string | null
  example_sentence: string | null
  tags: string[] | null
  source: string | null
  difficulty: string | null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ termId: string }> }
) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = supabaseAdmin()
  const isEmailAdmin = user.email?.toLowerCase() === ADMIN_EMAIL
  if (!isEmailAdmin && !(await isPlatformAdmin(user, admin))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { termId } = await params
  if (!UUID_PATTERN.test(termId)) {
    return NextResponse.json({ error: '词条 ID 无效' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const payload = parsePayload(body)
  if (!payload) {
    return NextResponse.json({ error: '最终分类、中文和英文为必填项。' }, { status: 400 })
  }
  if (!UUID_PATTERN.test(payload.category_id)) {
    return NextResponse.json({ error: '分类 ID 无效' }, { status: 400 })
  }

  const [termRes, categoryRes] = await Promise.all([
    admin.from('public_terms').select('id').eq('id', termId).maybeSingle(),
    admin.from('term_categories').select('id').eq('id', payload.category_id).maybeSingle(),
  ])
  if (termRes.error) return NextResponse.json({ error: termRes.error.message }, { status: 500 })
  if (!termRes.data) return NextResponse.json({ error: '词条不存在' }, { status: 404 })
  if (categoryRes.error) return NextResponse.json({ error: categoryRes.error.message }, { status: 500 })
  if (!categoryRes.data) return NextResponse.json({ error: '分类不存在' }, { status: 404 })

  const { data: duplicates, error: duplicateError } = await admin
    .from('public_terms')
    .select('id')
    .eq('category_id', payload.category_id)
    .eq('source_text', payload.source_text)
    .eq('target_text', payload.target_text)
    .neq('id', termId)
    .limit(1)
  if (duplicateError) return NextResponse.json({ error: duplicateError.message }, { status: 500 })
  if ((duplicates ?? []).length > 0) {
    return NextResponse.json({ error: '该分类下已存在相同中文和英文的词条。' }, { status: 400 })
  }

  const { data: updatedTerm, error: updateError } = await admin
    .from('public_terms')
    .update(payload)
    .eq('id', termId)
    .select('id, category_id, source_text, target_text, definition, example_sentence, tags, source, difficulty')
    .single()
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const { data: syncedRows, error: syncError } = await admin
    .from('user_termbook_items')
    .update({
      source_text: payload.source_text,
      target_text: payload.target_text,
      definition: payload.definition,
      example_sentence: payload.example_sentence,
    })
    .eq('public_term_id', termId)
    .select('id')
  if (syncError) return NextResponse.json({ error: syncError.message }, { status: 500 })

  return NextResponse.json({
    term: updatedTerm,
    syncedTermbookItems: syncedRows?.length ?? 0,
  })
}

function parsePayload(body: unknown): PublicTermPayload | null {
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>
  const categoryId = textValue(record.category_id)
  const sourceText = textValue(record.source_text)
  const targetText = textValue(record.target_text)
  if (!categoryId || !sourceText || !targetText) return null

  return {
    category_id: categoryId,
    source_text: sourceText,
    target_text: targetText,
    definition: nullableText(record.definition),
    example_sentence: nullableText(record.example_sentence),
    tags: nullableTags(record.tags),
    source: nullableText(record.source),
    difficulty: nullableText(record.difficulty),
  }
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function nullableText(value: unknown) {
  const text = textValue(value)
  return text || null
}

function nullableTags(value: unknown) {
  const tags = Array.isArray(value)
    ? value.map(item => textValue(item)).filter(Boolean)
    : typeof value === 'string'
      ? value.split(',').map(item => item.trim()).filter(Boolean)
      : []
  return tags.length > 0 ? tags : null
}
