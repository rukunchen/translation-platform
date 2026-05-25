import { NextRequest, NextResponse } from 'next/server'
import { isPlatformAdmin } from '@/lib/platformAdmin'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

export async function GET(req: NextRequest) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const admin = supabaseAdmin()
  if (!(await isPlatformAdmin(user, admin))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const now = new Date().toISOString()
  const [members, projects, documents, pendingInvitations] = await Promise.all([
    admin.from('profiles').select('id', { count: 'exact', head: true }),
    admin.from('projects').select('id', { count: 'exact', head: true }),
    admin.from('documents').select('id', { count: 'exact', head: true }),
    admin
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gt('expires_at', now),
  ])

  const countError = [members, projects, documents, pendingInvitations].find(result => result.error)?.error
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })

  return NextResponse.json({
    overview: {
      members: members.count || 0,
      projects: projects.count || 0,
      documents: documents.count || 0,
      pendingInvitations: pendingInvitations.count || 0,
    },
  })
}
