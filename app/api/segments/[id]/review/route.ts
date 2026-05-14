// POST   /api/segments/[id]/review   标记已审校（manager 或 reviewer）
// DELETE /api/segments/[id]/review   取消已审校（manager 或 reviewer）

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole, canReview } from '@/lib/permissions'

async function getCtx(segmentId: string) {
  const admin = supabaseAdmin()
  const { data: seg } = await admin
    .from('segments')
    .select(`id, status, target, document_id, documents:document_id ( project_id )`)
    .eq('id', segmentId)
    .maybeSingle()
  if (!seg) return null
  const projectId = (seg.documents as any)?.project_id as string | undefined
  if (!projectId) return null
  return { segment: seg as any, projectId, admin }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const ctx = await getCtx(id)
  if (!ctx) return NextResponse.json({ error: 'segment not found' }, { status: 404 })

  const myRole = await getMyRole(client, ctx.projectId, user.id)
  if (!canReview(myRole)) {
    return NextResponse.json({ error: '只有审校或经理可以标记已审校' }, { status: 403 })
  }
  if (!ctx.segment.target?.trim()) {
    return NextResponse.json({ error: '该句段还没有译文' }, { status: 400 })
  }
  if (ctx.segment.status === 'locked') {
    return NextResponse.json({ error: '该句段已锁定，无法操作' }, { status: 400 })
  }

  const { data, error } = await ctx.admin
    .from('segments')
    .update({
      status: 'reviewed',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ segment: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const ctx = await getCtx(id)
  if (!ctx) return NextResponse.json({ error: 'segment not found' }, { status: 404 })

  const myRole = await getMyRole(client, ctx.projectId, user.id)
  if (!canReview(myRole)) {
    return NextResponse.json({ error: '权限不足' }, { status: 403 })
  }
  if (ctx.segment.status === 'locked') {
    return NextResponse.json({ error: '该句段已锁定，无法操作' }, { status: 400 })
  }

  const { data, error } = await ctx.admin
    .from('segments')
    .update({
      status: 'draft',
      reviewed_by: null,
      reviewed_at: null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ segment: data })
}
