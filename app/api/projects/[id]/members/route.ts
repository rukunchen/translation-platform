// GET /api/projects/[id]/members          列成员（project members）
// POST /api/projects/[id]/members         发送邀请（platform admin + manager）

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole, canManage } from '@/lib/permissions'
import { sendInviteEmail } from '@/lib/email'
import { getInviteUrl } from '@/lib/siteUrl'
import { isPlatformAdmin } from '@/lib/platformAdmin'

function linkErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '生成邀请链接失败'
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const role = await getMyRole(client, projectId, user.id)
  if (!role) return NextResponse.json({ error: 'not_a_member' }, { status: 403 })

  // 用 admin 查（避免 RLS 二次过滤），JOIN profiles 拿用户信息
  const admin = supabaseAdmin()
  const platformAdmin = await isPlatformAdmin(user, admin)
  const { data, error } = await admin
    .from('project_members')
    .select(`
      id, user_id, role, added_at,
      profiles:user_id ( email, name, avatar_url )
    `)
    .eq('project_id', projectId)
    .order('added_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ members: data, myRole: role, isPlatformAdmin: platformAdmin })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const admin = supabaseAdmin()
  if (!(await isPlatformAdmin(user, admin))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const role = await getMyRole(client, projectId, user.id)
  if (!canManage(role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const assignedRole = body.role as 'translator' | 'reviewer'

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: '邮箱格式无效' }, { status: 400 })
  }
  if (assignedRole !== 'translator' && assignedRole !== 'reviewer') {
    return NextResponse.json({ error: '角色必须是 translator 或 reviewer' }, { status: 400 })
  }

  try {
    getInviteUrl('site-url-check')
  } catch (error: unknown) {
    return NextResponse.json({ error: linkErrorMessage(error) }, { status: 500 })
  }

  // 1) 检查该邮箱是否已是项目成员
  const { data: existingProfile } = await admin
    .from('profiles').select('id').eq('email', email).maybeSingle()
  if (existingProfile) {
    const { data: existingMember } = await admin
      .from('project_members')
      .select('id').eq('project_id', projectId).eq('user_id', existingProfile.id).maybeSingle()
    if (existingMember) {
      return NextResponse.json({ error: '该用户已在项目中' }, { status: 400 })
    }
  }

  // 2) 检查是否有未过期的 pending 邀请
  const { data: existingInvite } = await admin
    .from('invitations')
    .select('id, token, expires_at')
    .eq('project_id', projectId)
    .eq('invitee_email', email)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  // 3) 获取项目信息和邀请人信息（用于邮件正文）
  const [{ data: project }, { data: inviterProfile }] = await Promise.all([
    admin.from('projects').select('name').eq('id', projectId).single(),
    admin.from('profiles').select('name, email').eq('id', user.id).single(),
  ])
  if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 })

  // 4) 生成 token + 写入 invitation（已有 pending 的就复用）
  let token: string
  let inviteId: string
  if (existingInvite) {
    token = existingInvite.token
    inviteId = existingInvite.id
    const { error: updateErr } = await admin
      .from('invitations')
      .update({ assigned_role: assignedRole })
      .eq('id', inviteId)
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }
  } else {
    token = crypto.randomBytes(24).toString('base64url')
    const { data: created, error: createErr } = await admin
      .from('invitations')
      .insert({
        project_id: projectId,
        inviter_user_id: user.id,
        invitee_email: email,
        assigned_role: assignedRole,
        token,
      })
      .select('id, token')
      .single()
    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 500 })
    }
    inviteId = created.id
    token = created.token
  }

  const acceptUrl = getInviteUrl(token)

  // 5) 发邮件
  const emailResult = await sendInviteEmail({
    to: email,
    projectName: project.name,
    inviterName: inviterProfile?.name || inviterProfile?.email || '某位老师',
    role: assignedRole === 'translator' ? '译员' : '审校',
    token,
  })

  return NextResponse.json({
    inviteId,
    token,
    acceptUrl,
    emailSent: emailResult.ok,
    emailError: emailResult.error,
  })
}
