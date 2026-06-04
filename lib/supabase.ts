import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const hasSupabaseBrowserEnv = Boolean(supabaseUrl && supabasePublishableKey)

function createMissingSupabaseClient(): SupabaseClient {
  const message = '当前环境未配置 Supabase，暂时无法登录平台。'

  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
      signInWithPassword: async () => ({
        data: { session: null, user: null },
        error: { message },
      }),
    },
  } as unknown as SupabaseClient
}

export const supabase = hasSupabaseBrowserEnv
  ? createClient(supabaseUrl!, supabasePublishableKey!)
  : createMissingSupabaseClient()
