// PATCH / DELETE /api/glossary/[id]
// 单条术语：编辑、标注疑点、删除（仅项目成员）

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole } from '@/lib/permissions'

const ALLOWED_FIELDS = new Set([
  'source_term', 'translated_term', 'category', 'note',
  'status', 'is_questionable', 'match_status',
])

async function loadProjectId(termId: string): Promise<string | null> {
  const admin = supabaseAdmin()
  const { data } = await admin
    .from('glossary_terms')
    .select('project_id')
    .eq('id', termId)
    .maybeSingle()
  return (data?.project_id as string) ?? null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const projectId = await loadProjectId(id)
  if (!projectId) return NextResponse.json({ error: 'term not found' }, { status: 404 })

  const role = await getMyRole(client, projectId, user.id)
  if (!role) return NextResponse.json({ error: 'not a member' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const payload: Record<string, unknown> = {}
  for (const k of Object.keys(body)) {
    if (ALLOWED_FIELDS.has(k)) payload[k] = body[k]
  }
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: 'no editable fields' }, { status: 400 })
  }

  // 改了原文/译文后，匹配状态置为 unknown，待重新匹配
  if ('source_term' in payload || 'translated_term' in payload) {
    payload.match_status = 'unknown'
  }

  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('glossary_terms')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ term: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const projectId = await loadProjectId(id)
  if (!projectId) return NextResponse.json({ error: 'term not found' }, { status: 404 })

  const role = await getMyRole(client, projectId, user.id)
  if (!role) return NextResponse.json({ error: 'not a member' }, { status: 403 })

  const admin = supabaseAdmin()
  const { error } = await admin.from('glossary_terms').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
