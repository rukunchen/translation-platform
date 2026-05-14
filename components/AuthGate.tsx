'use client'

// 全局认证守卫：
//   · 监听 supabase auth 状态变化
//   · refresh token 失效 / 用户主动登出 → 自动清掉本地残留并跳回登录页
//   · 拦截控制台里 "Invalid Refresh Token" 的报错状态
//
// 挂载在 RootLayout 的 body 里即可（不渲染任何可视 UI）

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// 这些路径不需要登录 → SIGNED_OUT 时不必再跳转
const PUBLIC_PATHS = ['/', '/invite']

function isPublic(pathname: string) {
  if (!pathname) return false
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

export default function AuthGate() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // 1) 监听 supabase 内部状态：登出 / token 失效都会触发 SIGNED_OUT
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        if (!isPublic(pathname)) router.replace('/')
      }
    })

    // 2) 兜底：补一次手动检查 —— 如果首次加载时 refresh 已经失败，session 会是 null
    supabase.auth.getSession().then(({ data, error }) => {
      const sessionMissing = !data?.session
      const looksLikeBadToken =
        !!error && /refresh token|invalid token|expired/i.test(error.message)
      if ((sessionMissing || looksLikeBadToken) && !isPublic(pathname)) {
        // 主动签退一次，清掉残留 token，避免下一次还是同样错误
        supabase.auth.signOut().finally(() => router.replace('/'))
      }
    })

    return () => { subscription.unsubscribe() }
  }, [pathname, router])

  return null
}
