// POST /api/parallel-translate/adopt
// 把某条候选译文写回 segments.target（即"采用"该模型的译文为最终译文）
//
// body: { parallelTranslationId: string }
// 返回: { segment: {...} }
//
// 权限：项目成员；但若目标 segment 已 locked，仅 manager 可以采用

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole, canManage } from '@/lib/permissions'

export async function POST(req: NextRequest) {
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { parallelTranslationId } = body as { parallelTranslationId?: string }
  if (!parallelTranslationId) return NextResponse.json({ error: '缺少 parallelTranslationId' }, { status: 400 })

  const admin = supabaseAdmin()

  // 1) 取候选 + 关联 segment + project
  const { data: pt } = await admin
    .from('parallel_translations')
    .select(`
      id, segment_id, translated_text, status, document_id,
      segments:segment_id ( id, status, target ),
      documents:document_id ( project_id )
    `)
    .eq('id', parallelTranslationId)
    .maybeSingle()

  if (!pt) return NextResponse.json({ error: '候选译文不存在' }, { status: 404 })
  if (pt.status !== 'success' || !pt.translated_text?.trim()) {
    return NextResponse.json({ error: '该候选译文为空或失败状态，无法采用' }, { status: 400 })
  }

  const segment = pt.segments as any
  const projectId = (pt.documents as any)?.project_id as string | undefined
  if (!segment || !projectId) return NextResponse.json({ error: '关联数据缺失' }, { status: 500 })

  // 2) 权限校验
  const myRole = await getMyRole(client, projectId, user.id)
  if (!myRole) return NextResponse.json({ error: '你不是该项目的成员' }, { status: 403 })

  if (segment.status === 'locked' && !canManage(myRole)) {
    return NextResponse.json({ error: '该句段已锁定，仅项目经理可以修改' }, { status: 403 })
  }

  // 3) 状态流转：locked 保持 locked；其余一律置 draft
  const newStatus = segment.status === 'locked' ? 'locked' : 'draft'

  // 4) 写回 segments.target
  const { data: updated, error } = await admin
    .from('segments')
    .update({
      target: pt.translated_text,
      status: newStatus,
      last_edited_by: user.id,
      // 编辑后如果之前是 reviewed 状态会因为已经切到 draft 不需要单独清；
      // 但保险起见显式清掉
      ...(segment.status === 'reviewed' ? { reviewed_by: null, reviewed_at: null } : {}),
    })
    .eq('id', pt.segment_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ segment: updated })
}
