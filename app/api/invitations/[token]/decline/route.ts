// POST /api/invitations/[token]/decline    拒绝邀请

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const admin = supabaseAdmin()

  const { data: invite } = await admin
    .from('invitations')
    .select('id, status')
    .eq('token', token)
    .maybeSingle()

  if (!invite) return NextResponse.json({ error: '邀请不存在' }, { status: 404 })
  if (invite.status !== 'pending') {
    return NextResponse.json({ error: '邀请状态已变更' }, { status: 400 })
  }

  await admin
    .from('invitations')
    .update({ status: 'declined' })
    .eq('id', invite.id)

  return NextResponse.json({ ok: true })
}
