// POST /api/invitations/[token]/decline    拒绝邀请

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
    .select('id, invitee_email, status, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!invite) return NextResponse.json({ error: '邀请不存在' }, { status: 404 })
  if (invite.status !== 'pending') {
    return NextResponse.json({ error: '邀请状态已变更' }, { status: 400 })
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await admin.from('invitations').update({ status: 'expired' }).eq('id', invite.id)
    return NextResponse.json({ error: '邀请已过期' }, { status: 400 })
  }
  if (user.email?.toLowerCase() !== invite.invitee_email.toLowerCase()) {
    return NextResponse.json({ error: '只能由受邀邮箱对应的账号拒绝邀请' }, { status: 403 })
  }

  await admin
    .from('invitations')
    .update({ status: 'declined' })
    .eq('id', invite.id)

  return NextResponse.json({ ok: true })
}
