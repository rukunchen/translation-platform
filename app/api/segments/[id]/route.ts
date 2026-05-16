// PATCH /api/segments/[id]    更新译文（任何成员，已锁定除外）

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole, canManage } from '@/lib/permissions'

type SegmentContext = {
  id: string
  status: 'untranslated' | 'draft' | 'reviewed' | 'locked'
  document_id: string
  documents?: { project_id?: string | null } | { project_id?: string | null }[] | null
}

async function getSegmentContext(segmentId: string) {
  const admin = supabaseAdmin()
  const { data: seg } = await admin
    .from('segments')
    .select(`id, status, document_id, documents:document_id ( project_id )`)
    .eq('id', segmentId)
    .maybeSingle()
  if (!seg) return null
  const row = seg as SegmentContext
  const document = Array.isArray(row.documents) ? row.documents[0] : row.documents
  const projectId = document?.project_id || undefined
  if (!projectId) return null
  return { segment: row, projectId }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const ctx = await getSegmentContext(id)
  if (!ctx) return NextResponse.json({ error: 'segment not found' }, { status: 404 })

  const myRole = await getMyRole(client, ctx.projectId, user.id)
  if (!myRole) return NextResponse.json({ error: 'not a member' }, { status: 403 })

  // 已锁定的句段：只有 manager 能改
  if (ctx.segment.status === 'locked' && !canManage(myRole)) {
    return NextResponse.json({ error: '该句段已锁定，请联系项目经理' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const target = typeof body.target === 'string' ? body.target : null
  const source = typeof body.source === 'string' ? body.source : null
  const notes = typeof body.notes === 'string' ? body.notes : null
  if (target === null && source === null && notes === null) {
    return NextResponse.json({ error: 'target / source / notes required' }, { status: 400 })
  }
  if (source !== null && !source.trim()) {
    return NextResponse.json({ error: '原文不能为空' }, { status: 400 })
  }

  // 状态流转规则：
  //   - 改 target：locked 维持；空 target → untranslated；其他 → draft
  //   - 改 source：locked 维持；reviewed → draft（译文可能已不匹配新原文）
  //   - 仅改 notes：状态不变，审校信息也保留
  let newStatus = ctx.segment.status
  const contentChanged = target !== null || source !== null
  if (ctx.segment.status !== 'locked') {
    if (target !== null) {
      newStatus = target.trim() ? 'draft' : 'untranslated'
    } else if (source !== null && ctx.segment.status === 'reviewed') {
      newStatus = 'draft'
    }
  }

  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    last_edited_by: user.id,
  }
  if (target !== null) updatePayload.target = target
  if (source !== null) updatePayload.source = source
  if (notes !== null) updatePayload.notes = notes
  if (contentChanged && ctx.segment.status === 'reviewed') {
    updatePayload.reviewed_by = null
    updatePayload.reviewed_at = null
  }

  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('segments')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ segment: data })
}

// DELETE /api/segments/[id]    删除单个句段
// 规则：locked 段仅 manager 可删；其他成员可删自己有写权限的段
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const ctx = await getSegmentContext(id)
  if (!ctx) return NextResponse.json({ error: 'segment not found' }, { status: 404 })

  const myRole = await getMyRole(client, ctx.projectId, user.id)
  if (!myRole) return NextResponse.json({ error: 'not a member' }, { status: 403 })

  if (ctx.segment.status === 'locked' && !canManage(myRole)) {
    return NextResponse.json({ error: '该句段已锁定，仅项目经理可删除' }, { status: 403 })
  }

  const admin = supabaseAdmin()
  const { error } = await admin.from('segments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
