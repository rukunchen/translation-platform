import type { SupabaseClient, User } from '@supabase/supabase-js'
import { supabaseAdmin } from './supabaseServer'

export type PlatformAdminRecord = {
  user_id: string
  email: string | null
  role: 'owner' | 'admin'
  is_active: boolean
}

type PlatformAdminUser = Pick<User, 'id'> | null | undefined

export async function getPlatformAdmin(
  user: PlatformAdminUser,
  admin: SupabaseClient = supabaseAdmin()
): Promise<PlatformAdminRecord | null> {
  if (!user?.id) return null

  const { data, error } = await admin
    .from('platform_admins')
    .select('user_id, email, role, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (error) return null
  return data as PlatformAdminRecord | null
}

export async function isPlatformAdmin(
  user: PlatformAdminUser,
  admin?: SupabaseClient
): Promise<boolean> {
  return Boolean(await getPlatformAdmin(user, admin))
}
