import { NextRequest, NextResponse } from 'next/server'
import { isPlatformAdmin } from '@/lib/platformAdmin'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

type AuditLogRow = {
  id: string
  actor_id: string | null
  actor_email: string | null
  action: string
  target_type: string
  target_id: string | null
  target_label: string | null
  project_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export async function GET(req: NextRequest) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const admin = supabaseAdmin()
  if (!(await isPlatformAdmin(user, admin))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const requestedLimit = Number(req.nextUrl.searchParams.get('limit') || '50')
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50

  const { data, error } = await admin
    .from('admin_audit_logs')
    .select('id, actor_id, actor_email, action, target_type, target_id, target_label, project_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data || []) as AuditLogRow[]
  return NextResponse.json({
    logs: rows.map(log => ({
      id: log.id,
      actorId: log.actor_id,
      actorEmail: log.actor_email,
      action: log.action,
      targetType: log.target_type,
      targetId: log.target_id,
      targetLabel: log.target_label,
      projectId: log.project_id,
      metadata: log.metadata || {},
      createdAt: log.created_at,
    })),
  })
}
