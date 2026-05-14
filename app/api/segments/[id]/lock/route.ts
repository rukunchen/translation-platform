// POST   /api/segments/[id]/lock   最终确认/锁定（仅 manager）
// DELETE /api/segments/[id]/lock   解锁（仅 manager），状态回到 draft

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole, canManage } from '@/lib/permissions'

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
  if (!canManage(myRole)) {
    return NextResponse.json({ error: '只有项目经理可以最终确认' }, { status: 403 })
  }
  if (!ctx.segment.target?.trim()) {
    return NextResponse.json({ error: '该句段还没有译文' }, { status: 400 })
  }

  const { data, error } = await ctx.admin
    .from('segments')
    .update({
      status: 'locked',
      locked_by: user.id,
      locked_at: new Date().toISOString(),
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
  if (!canManage(myRole)) {
    return NextResponse.json({ error: '只有项目经理可以解锁' }, { status: 403 })
  }

  const { data, error } = await ctx.admin
    .from('segments')
    .update({
      status: 'draft',
      locked_by: null,
      locked_at: null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ segment: data })
}
