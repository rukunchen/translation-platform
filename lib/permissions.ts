// 权限校验工具（服务端 + 客户端共用）
import { SupabaseClient } from '@supabase/supabase-js'

export type Role = 'manager' | 'translator' | 'reviewer'

// 服务端：拿到当前用户在某项目中的角色（null = 不是成员）
export async function getMyRole(
  client: SupabaseClient,
  projectId: string,
  userId: string
): Promise<Role | null> {
  const { data } = await client
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  return (data?.role as Role) || null
}

// 服务端：检查项目里 manager 数量（用于"最后一个 manager 不能退出"逻辑）
export async function countManagers(
  client: SupabaseClient,
  projectId: string
): Promise<number> {
  const { count } = await client
    .from('project_members')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('role', 'manager')
  return count || 0
}

// 客户端 + 服务端：角色判断
export const canManage = (role: Role | null) => role === 'manager'
export const canReview = (role: Role | null) => role === 'manager' || role === 'reviewer'
export const canEdit   = (role: Role | null) => role !== null  // 任何成员都能编辑（除 locked 句段）

export const roleLabel: Record<Role, string> = {
  manager: '项目经理',
  translator: '译员',
  reviewer: '审校',
}

export const roleBadgeStyle: Record<Role, string> = {
  manager: 'bg-[#1F1E1D] text-white',
  translator: 'bg-[#D97757] text-white',
  reviewer: 'bg-[#5470D6] text-white',
}
