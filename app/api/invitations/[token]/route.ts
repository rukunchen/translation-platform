// GET /api/invitations/[token]   查邀请详情（公开，给接受页用）

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'

type ProjectJoin = { name?: string | null; description?: string | null }
type ProfileJoin = { name?: string | null; email?: string | null }

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const admin = supabaseAdmin()

  const { data, error } = await admin
    .from('invitations')
    .select(`
      id, project_id, invitee_email, assigned_role, status, expires_at, created_at,
      projects:project_id ( name, description ),
      profiles:inviter_user_id ( name, email )
    `)
    .eq('token', token)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '邀请不存在' }, { status: 404 })

  const expired = new Date(data.expires_at).getTime() < Date.now()
  const effectiveStatus = expired && data.status === 'pending' ? 'expired' : data.status
  const project = Array.isArray(data.projects) ? data.projects[0] as ProjectJoin | undefined : data.projects as ProjectJoin | null
  const inviter = Array.isArray(data.profiles) ? data.profiles[0] as ProfileJoin | undefined : data.profiles as ProfileJoin | null

  return NextResponse.json({
    projectId: data.project_id,
    projectName: project?.name,
    projectDescription: project?.description,
    inviterName: inviter?.name || inviter?.email,
    inviteeEmail: data.invitee_email,
    role: data.assigned_role,
    status: effectiveStatus,
    expiresAt: data.expires_at,
  })
}
