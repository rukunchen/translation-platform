'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Eyebrow } from '@/components/ui/Eyebrow'

function validatePasswordPair(password: string, confirmPassword: string) {
  if (password.length < 6) return '密码至少需要 6 位，建议使用 8 位以上。'
  if (password !== confirmPassword) return '两次输入的密码不一致。'
  return ''
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasRecoverySession, setHasRecoverySession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let alive = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return
      if (event === 'PASSWORD_RECOVERY') {
        setHasRecoverySession(!!session)
        setError(session ? '' : '重置链接无效或已过期，请重新申请。')
        setCheckingSession(false)
      }
    })

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setHasRecoverySession(!!data.session)
      if (!data.session) setError('重置链接无效或已过期，请重新申请。')
      setCheckingSession(false)
    })

    return () => {
      alive = false
      subscription.unsubscribe()
    }
  }, [])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')

    if (!hasRecoverySession) {
      setError('重置链接无效或已过期，请重新申请。')
      return
    }

    const validationError = validatePasswordPair(password, confirmPassword)
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError('更新失败，请稍后重试。')
      return
    }

    setPassword('')
    setConfirmPassword('')
    setMessage('密码已重置，请重新登录。')
    await supabase.auth.signOut()
    window.setTimeout(() => router.replace('/'), 1200)
  }

  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center px-6 py-16">
      <section className="w-full max-w-md bg-white border border-line rounded-2xl shadow-[0_1px_2px_rgba(31,30,29,0.04),0_8px_24px_rgba(31,30,29,0.06)] p-8">
        <div className="mb-8">
          <Eyebrow className="mb-3">Account</Eyebrow>
          <h1 className="font-serif text-3xl text-ink-900 tracking-tight">重置密码</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-500">
            设置新的登录密码后，请回到登录页重新进入平台。
          </p>
        </div>

        {checkingSession ? (
          <p className="text-sm text-ink-500">正在验证重置链接...</p>
        ) : (
          <form onSubmit={handleResetPassword} className="flex flex-col gap-5">
            <Input
              label="新密码"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="至少 6 位，建议 8 位以上"
              disabled={!hasRecoverySession}
              style={{ height: 44, paddingTop: 0, paddingBottom: 0 }}
            />
            <Input
              label="确认新密码"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="再次输入新密码"
              disabled={!hasRecoverySession}
              style={{ height: 44, paddingTop: 0, paddingBottom: 0 }}
            />

            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {message}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              loading={loading}
              disabled={!hasRecoverySession}
              fullWidth
              className="h-11 py-0"
            >
              {loading ? '重置中' : '确认重置'}
            </Button>
            {!hasRecoverySession && (
              <Button
                type="button"
                variant="secondary"
                fullWidth
                className="h-11 py-0"
                onClick={() => router.push('/account/password')}
              >
                重新申请
              </Button>
            )}
          </form>
        )}
      </section>
    </main>
  )
}
