'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Eyebrow } from '@/components/ui/Eyebrow'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validatePasswordPair(password: string, confirmPassword: string) {
  if (password.length < 6) return '密码至少需要 6 位，建议使用 8 位以上。'
  if (password !== confirmPassword) return '两次输入的密码不一致。'
  return ''
}

export default function AccountPasswordPage() {
  const router = useRouter()
  const [checkingUser, setCheckingUser] = useState(true)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [changeLoading, setChangeLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState('')
  const [changeMessage, setChangeMessage] = useState('')
  const [resetError, setResetError] = useState('')
  const [changeError, setChangeError] = useState('')

  useEffect(() => {
    let alive = true
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return
      setIsLoggedIn(!!data.user)
      setCheckingUser(false)
    })
    return () => { alive = false }
  }, [])

  const handleSendReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetError('')
    setResetMessage('')

    const email = resetEmail.trim()
    if (!email) {
      setResetError('请输入邮箱。')
      return
    }
    if (!emailPattern.test(email)) {
      setResetError('邮箱格式不正确。')
      return
    }

    setResetLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/account/reset-password`,
    })
    setResetLoading(false)

    if (error) {
      setResetError('发送失败，请稍后重试。')
      return
    }
    setResetMessage('如果该邮箱已注册，系统会发送一封密码重置邮件，请前往邮箱查看。')
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setChangeError('')
    setChangeMessage('')

    const validationError = validatePasswordPair(newPassword, confirmPassword)
    if (validationError) {
      setChangeError(validationError)
      return
    }

    setChangeLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setChangeLoading(false)

    if (error) {
      setChangeError('更新失败，请稍后重试。')
      return
    }
    setNewPassword('')
    setConfirmPassword('')
    setChangeMessage('密码已更新。')
  }

  return (
    <main
      className="min-h-screen bg-canvas flex items-center justify-center"
      style={{ padding: '72px 24px' }}
    >
      <div className="w-full" style={{ maxWidth: 1120 }}>
        <div className="text-center" style={{ marginBottom: 36 }}>
          <Eyebrow className="mb-3">Account</Eyebrow>
          <h1 className="font-serif text-3xl text-ink-900 tracking-tight">账户密码</h1>
          <p className="mt-3 text-sm text-ink-500">找回密码或修改当前账号密码</p>
        </div>

        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 32 }}
        >
          <section
            className="bg-white border border-line rounded-2xl shadow-[0_1px_2px_rgba(31,30,29,0.04),0_8px_24px_rgba(31,30,29,0.06)]"
            style={{ padding: 36 }}
          >
            <div style={{ marginBottom: 30 }}>
              <h2 className="font-serif text-2xl text-ink-900 tracking-tight">找回密码</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                输入账号邮箱，系统会发送密码重置邮件。
              </p>
            </div>

            <form onSubmit={handleSendReset} className="flex flex-col" style={{ gap: 24 }}>
              <Input
                label="邮箱"
                type="email"
                value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                placeholder="your@email.com"
                style={{ height: 48, paddingTop: 0, paddingBottom: 0 }}
              />

              {resetError && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {resetError}
                </div>
              )}
              {resetMessage && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {resetMessage}
                </div>
              )}

              <div style={{ paddingTop: 4 }}>
                <Button type="submit" variant="primary" loading={resetLoading} fullWidth className="h-11 py-0">
                  {resetLoading ? '发送中' : '发送重置邮件'}
                </Button>
              </div>
            </form>
          </section>

          <section
            className="bg-white border border-line rounded-2xl shadow-[0_1px_2px_rgba(31,30,29,0.04),0_8px_24px_rgba(31,30,29,0.06)]"
            style={{ padding: 36 }}
          >
            <div style={{ marginBottom: 30 }}>
              <h2 className="font-serif text-2xl text-ink-900 tracking-tight">更改密码</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                已登录用户可直接保存新的账号密码。
              </p>
            </div>

            {checkingUser ? (
              <p className="text-sm text-ink-500">正在检查登录状态...</p>
            ) : !isLoggedIn ? (
              <div>
                <div className="rounded-xl border border-line bg-canvas px-4 py-3 text-sm text-ink-600">
                  请先登录后再更改密码。
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  className="mt-5 h-11 py-0"
                  onClick={() => router.push('/?next=/account/password')}
                >
                  返回登录
                </Button>
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="flex flex-col" style={{ gap: 24 }}>
                <Input
                  label="新密码"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="至少 6 位，建议 8 位以上"
                  style={{ height: 48, paddingTop: 0, paddingBottom: 0 }}
                />
                <Input
                  label="确认新密码"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                  style={{ height: 48, paddingTop: 0, paddingBottom: 0 }}
                />

                {changeError && (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {changeError}
                  </div>
                )}
                {changeMessage && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {changeMessage}
                  </div>
                )}

                <div style={{ paddingTop: 4 }}>
                  <Button type="submit" variant="primary" loading={changeLoading} fullWidth className="h-11 py-0">
                    {changeLoading ? '保存中' : '保存新密码'}
                  </Button>
                </div>
              </form>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
