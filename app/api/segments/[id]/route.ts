// PATCH /api/segments/[id]    更新译文（任何成员，已锁定除外）

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole, canManage } from '@/lib/permissions'

async function getSegmentContext(segmentId: string) {
  const admin = supabaseAdmin()
  const { data: seg } = await admin
    .from('segments')
    .select(`id, status, document_id, documents:document_id ( project_id )`)
    .eq('id', segmentId)
    .maybeSingle()
  if (!seg) return null
  const projectId = (seg.documents as any)?.project_id as string | undefined
  if (!projectId) return null
  return { segment: seg as any, projectId }
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
  if (target === null) {
    return NextResponse.json({ error: 'target required' }, { status: 400 })
  }

  // 状态流转规则：编辑会把 reviewed 退回 draft（除非 manager 编辑 locked 的）
  let newStatus = ctx.segment.status
  if (ctx.segment.status === 'locked') {
    // manager 编辑 locked → 仍保持 locked（管理员修订）
    newStatus = 'locked'
  } else {
    newStatus = target.trim() ? 'draft' : 'untranslated'
  }

  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('segments')
    .update({
      target,
      status: newStatus,
      last_edited_by: user.id,
      // 编辑后清掉审校信息（因为内容变了）
      ...(ctx.segment.status === 'reviewed' ? { reviewed_by: null, reviewed_at: null } : {}),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ segment: data })
}
