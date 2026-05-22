import type { User } from '@supabase/supabase-js'

export const PLATFORM_ADMIN_EMAIL = 'rukunchen@hotmail.com'

type PlatformAdminUser = Pick<User, 'email'> | null | undefined

export function isPlatformAdmin(user: PlatformAdminUser): boolean {
  return user?.email?.trim().toLowerCase() === PLATFORM_ADMIN_EMAIL
}
