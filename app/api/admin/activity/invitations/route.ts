import { NextRequest, NextResponse } from 'next/server'
import { isPlatformAdmin } from '@/lib/platformAdmin'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

type InvitationRow = {
  id: string
  project_id: string
  inviter_user_id: string
  invitee_email: string
  assigned_role: 'translator' | 'reviewer'
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  created_at: string
  expires_at: string
  accepted_at: string | null
}

type ProjectRow = {
  id: string
  name: string
}

type ProfileRow = {
  id: string
  email: string | null
  name: string | null
}

export async function GET(req: NextRequest) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isPlatformAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const admin = supabaseAdmin()
  const { data: invitationData, error: invitationError } = await admin
    .from('invitations')
    .select('id, project_id, inviter_user_id, invitee_email, assigned_role, status, created_at, expires_at, accepted_at')
    .order('created_at', { ascending: false })
    .limit(12)

  if (invitationError) return NextResponse.json({ error: invitationError.message }, { status: 500 })

  const invitations = (invitationData || []) as InvitationRow[]
  const projectIds = Array.from(new Set(invitations.map(invitation => invitation.project_id)))
  const inviterIds = Array.from(new Set(invitations.map(invitation => invitation.inviter_user_id)))

  const [projectResult, inviterResult] = await Promise.all([
    projectIds.length > 0
      ? admin.from('projects').select('id, name').in('id', projectIds)
      : Promise.resolve({ data: [] as ProjectRow[], error: null }),
    inviterIds.length > 0
      ? admin.from('profiles').select('id, email, name').in('id', inviterIds)
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
  ])

  const queryError = projectResult.error || inviterResult.error
  if (queryError) return NextResponse.json({ error: queryError.message }, { status: 500 })

  const projectNames = new Map(
    ((projectResult.data || []) as ProjectRow[]).map(project => [project.id, project.name])
  )
  const inviters = new Map(
    ((inviterResult.data || []) as ProfileRow[]).map(inviter => [inviter.id, inviter])
  )
  const now = Date.now()

  return NextResponse.json({
    invitations: invitations.map(invitation => {
      const inviter = inviters.get(invitation.inviter_user_id)
      const expired = invitation.status === 'pending'
        && new Date(invitation.expires_at).getTime() < now

      return {
        id: invitation.id,
        inviteeEmail: invitation.invitee_email,
        role: invitation.assigned_role,
        status: expired ? 'expired' : invitation.status,
        projectName: projectNames.get(invitation.project_id) || '未知项目',
        inviter: inviter ? { email: inviter.email, name: inviter.name } : null,
        createdAt: invitation.created_at,
        expiresAt: invitation.expires_at,
        acceptedAt: invitation.accepted_at,
      }
    }),
  })
}
