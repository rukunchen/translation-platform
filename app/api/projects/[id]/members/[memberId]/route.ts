// PATCH /api/projects/[id]/members/[memberId]   改角色（platform admin 或 manager）
// DELETE /api/projects/[id]/members/[memberId]  移除成员（platform admin + manager，或本人）

import { NextRequest, NextResponse } from 'next/server'
import { logAdminAudit } from '@/lib/adminAudit'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole, canManage, countManagers, type Role } from '@/lib/permissions'
import { isPlatformAdmin } from '@/lib/platformAdmin'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id: projectId, memberId } = await params
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const admin = supabaseAdmin()
  const platformAdmin = await isPlatformAdmin(user, admin)

  const myRole = await getMyRole(client, projectId, user.id)
  if (!platformAdmin && !canManage(myRole)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const newRole = body.role as Role
  if (!['manager', 'translator', 'reviewer'].includes(newRole)) {
    return NextResponse.json({ error: 'invalid role' }, { status: 400 })
  }

  // 取出目标成员
  const { data: target } = await admin
    .from('project_members').select('id, user_id, role')
    .eq('id', memberId).eq('project_id', projectId).maybeSingle()
  if (!target) return NextResponse.json({ error: 'member not found' }, { status: 404 })
  if (target.role === newRole) return NextResponse.json({ ok: true })

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

  const [profileResult, projectResult] = await Promise.all([
    admin.from('profiles').select('email, name').eq('id', target.user_id).maybeSingle(),
    admin.from('projects').select('name').eq('id', projectId).maybeSingle(),
  ])
  const targetProfile = profileResult.data as { email: string | null; name: string | null } | null
  const project = projectResult.data as { name: string | null } | null
  await logAdminAudit(admin, {
    actor: user,
    action: 'admin.project_member.update_role',
    targetType: 'project_member',
    targetId: memberId,
    targetLabel: targetProfile?.name || targetProfile?.email || target.user_id,
    projectId,
    metadata: {
      projectName: project?.name || null,
      userId: target.user_id,
      oldRole: target.role,
      newRole,
    },
  })

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
  const platformAdmin = await isPlatformAdmin(user, admin)
  if (!isSelf && (!platformAdmin || !canManage(myRole))) {
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
