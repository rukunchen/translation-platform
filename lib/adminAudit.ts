import type { SupabaseClient, User } from '@supabase/supabase-js'

type AuditMetadata = Record<string, unknown>

export async function logAdminAudit(
  admin: SupabaseClient,
  input: {
    actor: User
    action: string
    targetType: string
    targetId?: string | null
    targetLabel?: string | null
    projectId?: string | null
    metadata?: AuditMetadata
  }
) {
  const { error } = await admin.from('admin_audit_logs').insert({
    actor_id: input.actor.id,
    actor_email: input.actor.email || null,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId || null,
    target_label: input.targetLabel || null,
    project_id: input.projectId || null,
    metadata: input.metadata || {},
  })

  if (error) {
    console.error('[admin-audit] failed to write log:', error.message)
  }
}
