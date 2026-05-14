// 服务端 Supabase 客户端
// 两种使用场景：
//   1. 校验当前请求的用户身份（使用 Authorization header 里的 access token）
//   2. 用 service role key 做绕过 RLS 的操作（如发送邀请前查邮箱、写邀请记录等）

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

// service-role 客户端（用于服务端、绕过 RLS）
// ⚠️ 仅在 API 路由内使用，不要暴露给前端
export function supabaseAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// 从请求头里解析 access token，返回带身份的客户端 + user 对象
// 用于 API 路由里以"当前用户"身份执行 RLS 校验过的查询
export async function supabaseFromRequest(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    }
  )

  if (!token) return { client, user: null }

  const { data: { user }, error } = await client.auth.getUser(token)
  if (error) return { client, user: null }
  return { client, user }
}
