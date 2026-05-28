// 客户端发起带 Authorization 头的 fetch（用于调自家 /api 路由）
// 检测到 401 会自动登出 + 跳回登录页（避免 UI 卡在 "unable to connect" 假象）
import { isPublic } from './publicPaths'
import { supabase } from './supabase'

let handlingAuthFailure = false
async function handleAuthFailure() {
  if (handlingAuthFailure) return
  if (typeof window === 'undefined') return
  if (isPublic(window.location.pathname)) return
  handlingAuthFailure = true
  try {
    await supabase.auth.signOut()
  } catch { /* 忽略：可能 token 已经无效，signOut 也会出错 */ }
  window.location.replace('/')
}

export async function apiFetch(input: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = new Headers(init.headers || {})
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(input, { ...init, headers })
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function jsonError(json: unknown): string | null {
  if (json && typeof json === 'object' && 'error' in json) {
    const value = (json as { error?: unknown }).error
    return typeof value === 'string' ? value : null
  }
  return null
}

export async function apiJSON<T = unknown>(input: string, init: RequestInit = {}): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await apiFetch(input, init)
    if (res.status === 401) {
      // 会话过期或被服务端拒绝 → 立刻登出回首页（兜底）
      void handleAuthFailure()
      return { data: null, error: '会话已失效，请重新登录' }
    }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { data: null, error: jsonError(json) || `HTTP ${res.status}` }
    return { data: json as T, error: null }
  } catch (e: unknown) {
    return { data: null, error: errorMessage(e, '网络错误') }
  }
}
