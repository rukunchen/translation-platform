import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { logAdminAudit } from '@/lib/adminAudit'
import { sendInviteEmail } from '@/lib/email'
import { isPlatformAdmin } from '@/lib/platformAdmin'
import { getInviteUrl } from '@/lib/siteUrl'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

type InvitationRow = {
  id: string
  project_id: string
  inviter_user_id: string
  invitee_email: string
  assigned_role: 'translator' | 'reviewer'
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  token: string
  expires_at: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const admin = supabaseAdmin()
  if (!(await isPlatformAdmin(user, admin))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: '邀请 ID 无效' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const action = body.action === 'revoke' || body.action === 'resend' ? body.action : ''
  if (!action) return NextResponse.json({ error: '操作无效' }, { status: 400 })

  const { data: invitationData, error: invitationError } = await admin
    .from('invitations')
    .select('id, project_id, inviter_user_id, invitee_email, assigned_role, status, token, expires_at')
    .eq('id', id)
    .maybeSingle()
  if (invitationError) return NextResponse.json({ error: invitationError.message }, { status: 500 })
  if (!invitationData) return NextResponse.json({ error: '邀请不存在' }, { status: 404 })

  const invitation = invitationData as InvitationRow
  if (action === 'revoke') {
    return revokeInvitation(admin, user, invitation)
  }
  return resendInvitation(admin, user, invitation)
}

async function revokeInvitation(
  admin: ReturnType<typeof supabaseAdmin>,
  user: NonNullable<Awaited<ReturnType<typeof supabaseFromRequest>>['user']>,
  invitation: InvitationRow
) {
  if (invitation.status !== 'pending') {
    return NextResponse.json({ error: '只能撤销待接受邀请' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { error } = await admin
    .from('invitations')
    .update({
      status: 'expired',
      expires_at: now,
      accepted_at: null,
      accepted_by: null,
    })
    .eq('id', invitation.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAudit(admin, {
    actor: user,
    action: 'admin.invitation.revoke',
    targetType: 'invitation',
    targetId: invitation.id,
    targetLabel: invitation.invitee_email,
    projectId: invitation.project_id,
    metadata: {
      inviteeEmail: invitation.invitee_email,
      role: invitation.assigned_role,
      oldStatus: invitation.status,
      newStatus: 'expired',
    },
  })

  return NextResponse.json({ ok: true })
}

async function resendInvitation(
  admin: ReturnType<typeof supabaseAdmin>,
  user: NonNullable<Awaited<ReturnType<typeof supabaseFromRequest>>['user']>,
  invitation: InvitationRow
) {
  if (invitation.status === 'accepted') {
    return NextResponse.json({ error: '已接受的邀请不能重发' }, { status: 400 })
  }
  try {
    getInviteUrl('site-url-check')
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '生成邀请链接失败' }, { status: 500 })
  }

  const [{ data: project }, { data: inviterProfile }, { data: existingProfile }] = await Promise.all([
    admin.from('projects').select('name').eq('id', invitation.project_id).maybeSingle(),
    admin.from('profiles').select('name, email').eq('id', user.id).maybeSingle(),
    admin.from('profiles').select('id').eq('email', invitation.invitee_email).maybeSingle(),
  ])
  if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 })

  if (existingProfile) {
    const { data: existingMember, error: memberError } = await admin
      .from('project_members')
      .select('id')
      .eq('project_id', invitation.project_id)
      .eq('user_id', existingProfile.id)
      .maybeSingle()
    if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 })
    if (existingMember) return NextResponse.json({ error: '该用户已在项目中，不能重发邀请' }, { status: 400 })
  }

  const token = crypto.randomBytes(24).toString('base64url')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { error: updateError } = await admin
    .from('invitations')
    .update({
      inviter_user_id: user.id,
      status: 'pending',
      token,
      expires_at: expiresAt,
      accepted_at: null,
      accepted_by: null,
      created_at: new Date().toISOString(),
    })
    .eq('id', invitation.id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const emailResult = await sendInviteEmail({
    to: invitation.invitee_email,
    projectName: project.name,
    inviterName: inviterProfile?.name || inviterProfile?.email || user.email || '平台管理员',
    role: invitation.assigned_role === 'translator' ? '译员' : '审校',
    token,
  })

  await logAdminAudit(admin, {
    actor: user,
    action: 'admin.invitation.resend',
    targetType: 'invitation',
    targetId: invitation.id,
    targetLabel: invitation.invitee_email,
    projectId: invitation.project_id,
    metadata: {
      inviteeEmail: invitation.invitee_email,
      projectName: project.name,
      role: invitation.assigned_role,
      oldStatus: invitation.status,
      newStatus: 'pending',
      expiresAt,
      emailSent: emailResult.ok,
      emailError: emailResult.error,
    },
  })

  return NextResponse.json({
    ok: true,
    acceptUrl: getInviteUrl(token),
    emailSent: emailResult.ok,
    emailError: emailResult.error,
  })
}
