// POST /api/invitations/[token]/accept    接受邀请（必须登录）

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = supabaseAdmin()

  const { data: invite } = await admin
    .from('invitations')
    .select('id, project_id, inviter_user_id, invitee_email, assigned_role, status, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!invite) return NextResponse.json({ error: '邀请不存在' }, { status: 404 })
  if (invite.status !== 'pending') {
    return NextResponse.json({ error: `邀请已${invite.status === 'accepted' ? '接受' : invite.status === 'declined' ? '拒绝' : '失效'}` }, { status: 400 })
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await admin.from('invitations').update({ status: 'expired' }).eq('id', invite.id)
    return NextResponse.json({ error: '邀请已过期' }, { status: 400 })
  }

  // 校验邮箱匹配（防止 A 转发给 B，B 用自己账号接受）
  if (user.email?.toLowerCase() !== invite.invitee_email.toLowerCase()) {
    return NextResponse.json(
      { error: `此邀请发给 ${invite.invitee_email}，请使用该邮箱对应的平台账号登录后接受。当前登录 ${user.email}` },
      { status: 403 }
    )
  }

  // 加入项目（幂等）
  const { error: insertErr } = await admin
    .from('project_members')
    .upsert({
      project_id: invite.project_id,
      user_id: user.id,
      role: invite.assigned_role,
      added_by: invite.inviter_user_id as string,
    }, { onConflict: 'project_id,user_id' })

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  await admin
    .from('invitations')
    .update({ status: 'accepted', accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq('id', invite.id)

  return NextResponse.json({ ok: true, projectId: invite.project_id })
}
