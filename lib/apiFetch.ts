// 客户端发起带 Authorization 头的 fetch（用于调自家 /api 路由）
import { supabase } from './supabase'

export async function apiFetch(input: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = new Headers(init.headers || {})
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(input, { ...init, headers })
}

export async function apiJSON<T = any>(input: string, init: RequestInit = {}): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await apiFetch(input, init)
    const json = await res.json()
    if (!res.ok) return { data: null, error: json.error || `HTTP ${res.status}` }
    return { data: json as T, error: null }
  } catch (e: any) {
    return { data: null, error: e?.message || '网络错误' }
  }
}
