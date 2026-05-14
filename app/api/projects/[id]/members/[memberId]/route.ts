// PATCH /api/projects/[id]/members/[memberId]   改角色（manager only）
// DELETE /api/projects/[id]/members/[memberId]  移除成员（manager 或本人）

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole, canManage, countManagers, type Role } from '@/lib/permissions'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id: projectId, memberId } = await params
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const myRole = await getMyRole(client, projectId, user.id)
  if (!canManage(myRole)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const newRole = body.role as Role
  if (!['manager', 'translator', 'reviewer'].includes(newRole)) {
    return NextResponse.json({ error: 'invalid role' }, { status: 400 })
  }

  const admin = supabaseAdmin()

  // 取出目标成员
  const { data: target } = await admin
    .from('project_members').select('id, user_id, role')
    .eq('id', memberId).eq('project_id', projectId).maybeSingle()
  if (!target) return NextResponse.json({ error: 'member not found' }, { status: 404 })

  // 防止把最后一个 manager 降级
  if (target.role === 'manager' && newRole !== 'manager') {
    const mgrCount = await countManagers(admin, projectId)
    if (mgrCount <= 1) {
      return NextResponse.json(
        { error: '至少要保留一个项目经理。请先把其他成员提升为经理。' },
        { status: 400 }
      )
    }
  }

  const { error } = await admin
    .from('project_members')
    .update({ role: newRole })
    .eq('id', memberId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id: projectId, memberId } = await params
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const myRole = await getMyRole(client, projectId, user.id)

  const admin = supabaseAdmin()
  const { data: target } = await admin
    .from('project_members').select('id, user_id, role')
    .eq('id', memberId).eq('project_id', projectId).maybeSingle()
  if (!target) return NextResponse.json({ error: 'member not found' }, { status: 404 })

  const isSelf = target.user_id === user.id
  if (!canManage(myRole) && !isSelf) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // 防止最后一个 manager 退出
  if (target.role === 'manager') {
    const mgrCount = await countManagers(admin, projectId)
    if (mgrCount <= 1) {
      return NextResponse.json(
        { error: '你是项目唯一的经理，请先把其他成员提升为经理再退出。' },
        { status: 400 }
      )
    }
  }

  const { error } = await admin
    .from('project_members')
    .delete()
    .eq('id', memberId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
