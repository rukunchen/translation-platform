import { NextRequest, NextResponse } from 'next/server'
import { logAdminAudit } from '@/lib/adminAudit'
import { isPlatformAdmin } from '@/lib/platformAdmin'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanEmail(value: unknown): string {
  return cleanText(value).toLowerCase()
}

function hasOwn(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key)
}

function isDisabledUntil(value: string | null | undefined): boolean {
  return Boolean(value && new Date(value).getTime() > Date.now())
}

async function getActivePlatformAdmin(
  admin: ReturnType<typeof supabaseAdmin>,
  id: string
): Promise<{ role: string } | null> {
  const { data, error } = await admin
    .from('platform_admins')
    .select('role')
    .eq('user_id', id)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as { role: string } | null
}

async function getSoleManagedProjectNames(
  admin: ReturnType<typeof supabaseAdmin>,
  userId: string
): Promise<string[]> {
  const { data: managerRows, error: managerError } = await admin
    .from('project_members')
    .select('project_id')
    .eq('user_id', userId)
    .eq('role', 'manager')
  if (managerError) throw new Error(managerError.message)

  const projectIds = Array.from(new Set((managerRows || []).map(row => row.project_id as string)))
  if (projectIds.length === 0) return []

  const { data: allManagers, error: allManagersError } = await admin
    .from('project_members')
    .select('project_id')
    .in('project_id', projectIds)
    .eq('role', 'manager')
  if (allManagersError) throw new Error(allManagersError.message)

  const managerCounts = new Map<string, number>()
  for (const row of allManagers || []) {
    const projectId = row.project_id as string
    managerCounts.set(projectId, (managerCounts.get(projectId) || 0) + 1)
  }

  const soleProjectIds = projectIds.filter(projectId => (managerCounts.get(projectId) || 0) <= 1)
  if (soleProjectIds.length === 0) return []

  const { data: projects, error: projectsError } = await admin
    .from('projects')
    .select('id, name')
    .in('id', soleProjectIds)
  if (projectsError) throw new Error(projectsError.message)
  return (projects || []).map(project => project.name as string)
}

async function serializeMember(
  admin: ReturnType<typeof supabaseAdmin>,
  id: string,
  bannedUntil: string | null | undefined
) {
  const { data: member, error } = await admin
    .from('profiles')
    .select('id, email, name, avatar_url, created_at, updated_at')
    .eq('id', id)
    .single()
  if (error) throw new Error(error.message)

  const platformAdmin = await getActivePlatformAdmin(admin, id)
  return {
    ...member,
    isPlatformAdmin: Boolean(platformAdmin),
    platformAdminRole: platformAdmin?.role || null,
    isDisabled: isDisabledUntil(bannedUntil),
    bannedUntil: bannedUntil || null,
    authExists: true,
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const admin = supabaseAdmin()
  if (!(await isPlatformAdmin(user, admin))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: '成员 ID 无效' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const wantsNameUpdate = hasOwn(body, 'name')
  const hasEmailField = hasOwn(body, 'email')
  const password = typeof body.password === 'string' ? body.password : ''
  const wantsPasswordReset = hasOwn(body, 'password') && password.length > 0
  const wantsDisabledUpdate = typeof body.disabled === 'boolean'
  if (!wantsNameUpdate && !hasEmailField && !wantsPasswordReset && !wantsDisabledUpdate) {
    return NextResponse.json({ error: '没有可更新的成员资料' }, { status: 400 })
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, name')
    .eq('id', id)
    .maybeSingle()

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })
  if (!profile) return NextResponse.json({ error: '成员不存在' }, { status: 404 })

  const { data: authData, error: authReadError } = await admin.auth.admin.getUserById(id)
  if (authReadError) return NextResponse.json({ error: authReadError.message }, { status: 400 })
  if (!authData.user) return NextResponse.json({ error: '成员账号不存在' }, { status: 404 })

  let latestBannedUntil: string | null | undefined = authData.user.banned_until
  const previousBannedUntil = authData.user.banned_until || null
  const previousEmail = cleanEmail(authData.user.email || profile.email)
  const previousName = cleanText(profile.name)
  const nextEmail = hasEmailField ? cleanEmail(body.email) : ''
  const wantsEmailUpdate = hasEmailField && nextEmail !== previousEmail
  const authUpdates: {
    user_metadata?: object
    email?: string
    email_confirm?: boolean
    password?: string
  } = {}
  const profileUpdates: { name?: string; email?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  }

  if (wantsNameUpdate) {
    const name = cleanText(body.name)
    if (!name) return NextResponse.json({ error: '姓名不能为空' }, { status: 400 })
    if (name.length > 80) return NextResponse.json({ error: '姓名过长（最多 80 字）' }, { status: 400 })
    authUpdates.user_metadata = {
      ...authData.user.user_metadata,
      name,
    }
    profileUpdates.name = name
  }

  if (wantsEmailUpdate || wantsPasswordReset) {
    if (id === user.id) {
      return NextResponse.json({ error: '不能在管理控制台修改自己的邮箱或密码' }, { status: 400 })
    }
    const targetAdmin = await getActivePlatformAdmin(admin, id)
    if (targetAdmin) {
      return NextResponse.json({ error: '不能修改平台管理员的邮箱或密码。' }, { status: 400 })
    }
  }

  if (hasEmailField) {
    if (!nextEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nextEmail)) {
      return NextResponse.json({ error: '邮箱格式无效' }, { status: 400 })
    }
    if (wantsEmailUpdate) {
      authUpdates.email = nextEmail
      authUpdates.email_confirm = true
      profileUpdates.email = nextEmail
    }
  }

  if (wantsPasswordReset) {
    if (password.length < 6) {
      return NextResponse.json({ error: '新密码至少需要 6 位' }, { status: 400 })
    }
    authUpdates.password = password
  }

  if (Object.keys(authUpdates).length > 0) {
    const { data: authUpdateData, error: authUpdateError } = await admin.auth.admin.updateUserById(id, authUpdates)
    if (authUpdateError) return NextResponse.json({ error: authUpdateError.message }, { status: 400 })
    latestBannedUntil = authUpdateData.user?.banned_until || latestBannedUntil
  }

  if (Object.keys(profileUpdates).length > 1) {
    const { error: updateError } = await admin
      .from('profiles')
      .update(profileUpdates)
      .eq('id', id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  if (wantsDisabledUpdate) {
    if (id === user.id) {
      return NextResponse.json({ error: '不能禁用自己的管理员账号' }, { status: 400 })
    }
    const targetAdmin = await getActivePlatformAdmin(admin, id)
    if (targetAdmin) {
      return NextResponse.json({ error: '不能禁用平台管理员。请先移除其管理员身份。' }, { status: 400 })
    }
    const { data: disabledData, error: disabledError } = await admin.auth.admin.updateUserById(id, {
      ban_duration: body.disabled ? '876000h' : 'none',
    })
    if (disabledError) return NextResponse.json({ error: disabledError.message }, { status: 400 })
    latestBannedUntil = disabledData.user?.banned_until || null
  }

  const auditTargetLabel = profileUpdates.name || previousName || nextEmail || previousEmail || id
  const auditLogs: Array<Promise<void>> = []
  if (wantsNameUpdate && profileUpdates.name && profileUpdates.name !== previousName) {
    auditLogs.push(logAdminAudit(admin, {
      actor: user,
      action: 'admin.user.update_profile',
      targetType: 'user',
      targetId: id,
      targetLabel: auditTargetLabel,
      metadata: {
        oldName: previousName || null,
        newName: profileUpdates.name,
      },
    }))
  }
  if (wantsEmailUpdate) {
    auditLogs.push(logAdminAudit(admin, {
      actor: user,
      action: 'admin.user.update_email',
      targetType: 'user',
      targetId: id,
      targetLabel: auditTargetLabel,
      metadata: {
        oldEmail: previousEmail || null,
        newEmail: nextEmail,
      },
    }))
  }
  if (wantsPasswordReset) {
    auditLogs.push(logAdminAudit(admin, {
      actor: user,
      action: 'admin.user.reset_password',
      targetType: 'user',
      targetId: id,
      targetLabel: auditTargetLabel,
      metadata: {
        passwordReset: true,
      },
    }))
  }
  if (wantsDisabledUpdate) {
    auditLogs.push(logAdminAudit(admin, {
      actor: user,
      action: body.disabled ? 'admin.user.disable' : 'admin.user.enable',
      targetType: 'user',
      targetId: id,
      targetLabel: auditTargetLabel,
      metadata: {
        disabled: body.disabled,
        oldBannedUntil: previousBannedUntil,
        newBannedUntil: latestBannedUntil || null,
      },
    }))
  }
  await Promise.all(auditLogs)

  try {
    const member = await serializeMember(admin, id, latestBannedUntil)
    return NextResponse.json({ member })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '读取成员资料失败' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const admin = supabaseAdmin()
  if (!(await isPlatformAdmin(user, admin))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: '成员 ID 无效' }, { status: 400 })
  if (id === user.id) return NextResponse.json({ error: '不能删除自己的管理员账号' }, { status: 400 })

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, name')
    .eq('id', id)
    .maybeSingle()
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })
  if (!profile) return NextResponse.json({ error: '成员不存在' }, { status: 404 })

  try {
    const targetAdmin = await getActivePlatformAdmin(admin, id)
    if (targetAdmin) {
      return NextResponse.json({ error: '不能删除平台管理员。请先移除其管理员身份。' }, { status: 400 })
    }

    const soleProjectNames = await getSoleManagedProjectNames(admin, id)
    if (soleProjectNames.length > 0) {
      return NextResponse.json({
        error: `不能删除项目唯一经理。请先转移这些项目的经理角色：${soleProjectNames.slice(0, 3).join('、')}`,
      }, { status: 400 })
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '删除前检查失败' }, { status: 500 })
  }

  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await logAdminAudit(admin, {
    actor: user,
    action: 'admin.user.delete',
    targetType: 'user',
    targetId: id,
    targetLabel: cleanText(profile.name) || cleanEmail(profile.email) || id,
    metadata: {
      email: cleanEmail(profile.email) || null,
      name: cleanText(profile.name) || null,
    },
  })

  return NextResponse.json({ ok: true })
}
