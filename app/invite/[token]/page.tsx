'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { apiJSON } from '@/lib/apiFetch'
import { roleLabel, type Role } from '@/lib/permissions'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Card } from '@/components/ui/Card'
import { cn } from '@/components/ui/cn'
import Logo from '@/components/Logo'

type Invite = {
  projectId: string
  projectName: string
  projectDescription: string | null
  inviterName: string
  inviteeEmail: string
  role: Role
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  expiresAt: string
}

type User = { id: string; email?: string }

export default function AcceptInvitePage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [invite, setInvite] = useState<Invite | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [user, setUser] = useState<User | null>(null)

  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [authError, setAuthError] = useState('')
  const [acceptedProjectId, setAcceptedProjectId] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const [{ data: inv, error: invErr }, { data: { user: u } }] = await Promise.all([
        apiJSON<Invite>(`/api/invitations/${token}`),
        supabase.auth.getUser(),
      ])
      if (invErr || !inv) { setError(invErr || '邀请不存在'); setLoading(false); return }
      setInvite(inv)
      setUser(u as User | null)
      setLoading(false)
    })()
  }, [token])

  const accept = async () => {
    if (!user) return
    setSubmitting(true)
    const { data, error: err } = await apiJSON<{ projectId: string }>(`/api/invitations/${token}/accept`, { method: 'POST' })
    setSubmitting(false)
    if (err || !data) { setAuthError(err || '接受失败'); return }
    setAcceptedProjectId(data.projectId)
  }

  const decline = async () => {
    if (!confirm('确定拒绝这个邀请？')) return
    const { error } = await apiJSON(`/api/invitations/${token}/decline`, { method: 'POST' })
    if (error) { setAuthError(error); return }
    setInvite(prev => prev ? { ...prev, status: 'declined' } : prev)
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invite) return
    setSubmitting(true); setAuthError('')

    const { error: err } = await supabase.auth.signInWithPassword({
      email: invite.inviteeEmail, password,
    })
    if (err) { setAuthError('登录失败：' + err.message); setSubmitting(false); return }
    const { data: { user: u } } = await supabase.auth.getUser()
    setUser(u as User)
    setSubmitting(false)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-canvas">
      <div className="flex items-center gap-3 text-ink-500">
        <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">加载邀请信息…</span>
      </div>
    </div>
  )

  if (error || !invite) return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-6">
      <Card padding="lg" className="text-center max-w-md">
        <h1 className="font-serif text-2xl text-ink-900 mb-3">邀请无效</h1>
        <p className="text-ink-500 text-sm mb-6">{error || '邀请不存在或已被删除'}</p>
        <Button onClick={() => router.push('/')}>返回首页</Button>
      </Card>
    </div>
  )

  if (invite.status !== 'pending') {
    const statusText = {
      accepted: '✅ 你已经接受过这个邀请',
      declined: '已拒绝邀请',
      expired: '⏳ 邀请已过期',
    }[invite.status]
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas px-6">
        <Card padding="lg" className="text-center max-w-md">
          <h1 className="font-serif text-2xl text-ink-900 mb-3">{statusText}</h1>
          {invite.status === 'accepted' && (
            <Button onClick={() => router.push(`/projects/${invite.projectId}`)} className="mt-2">
              进入项目
            </Button>
          )}
        </Card>
      </div>
    )
  }

  if (acceptedProjectId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas px-6">
        <Card padding="lg" className="text-center max-w-md">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="font-serif text-2xl text-ink-900 mb-3">欢迎加入！</h1>
          <p className="text-ink-500 text-sm mb-6">
            你已成功以「{roleLabel[invite.role]}」身份加入项目「{invite.projectName}」
          </p>
          <Button variant="primary" onClick={() => router.push(`/projects/${acceptedProjectId}`)}>
            进入项目 →
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-10 py-12">
      <div className="bg-white rounded-3xl p-10 lg:p-12 max-w-lg w-full shadow-[var(--shadow-card)]">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <Logo size={40} priority />
          <div className="flex flex-col leading-tight">
            <span className="brand-wordmark text-ink-900 text-sm">译境</span>
            <span className="text-ink-500 text-xs">技大25级MTIer翻译平台</span>
          </div>
        </div>

        <Eyebrow className="mb-3">You&apos;re invited</Eyebrow>
        <h1 className="font-serif text-3xl text-ink-900 tracking-tight leading-tight mb-5">
          <span className="text-brand">{invite.inviterName}</span> 邀请你加入
        </h1>

        {/* 项目信息块 */}
        <div className="bg-canvas rounded-2xl p-5 mb-6">
          <p className="font-medium text-ink-900 text-base">{invite.projectName}</p>
          {invite.projectDescription && (
            <p className="text-ink-500 text-sm mt-1.5 leading-relaxed">{invite.projectDescription}</p>
          )}
          <div className="flex items-center gap-2 mt-4 text-xs flex-wrap">
            <span className="text-ink-500">作为</span>
            <span className={cn(
              'px-2 py-1 rounded-full font-medium',
              invite.role === 'reviewer'
                ? 'bg-[var(--color-status-info-bg)] text-[var(--color-status-info-text)]'
                : 'bg-brand-50 text-brand'
            )}>
              {roleLabel[invite.role]}
            </span>
            <span className="text-ink-400">·</span>
            <span className="text-ink-500">收件人 {invite.inviteeEmail}</span>
          </div>
        </div>

        {user ? (
          <>
            {user.email?.toLowerCase() !== invite.inviteeEmail.toLowerCase() ? (
              <div className="bg-amber-50 border border-amber-100 text-amber-800 rounded-xl px-5 py-4 text-sm mb-5">
                当前登录的是 <strong>{user.email}</strong>，但此邀请发给 <strong>{invite.inviteeEmail}</strong>。
                请先退出，再用 {invite.inviteeEmail} 登录。
              </div>
            ) : (
              <p className="text-ink-500 text-sm mb-5">
                当前登录：<strong className="text-ink-900">{user.email}</strong>
              </p>
            )}
            {authError && <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-5 py-3 text-sm mb-4">{authError}</div>}
            <div className="flex gap-3">
              <Button
                variant="secondary"
                fullWidth
                onClick={decline}
                disabled={submitting || user.email?.toLowerCase() !== invite.inviteeEmail.toLowerCase()}
              >
                拒绝
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={accept}
                disabled={submitting || user.email?.toLowerCase() !== invite.inviteeEmail.toLowerCase()}
                loading={submitting}
              >
                {submitting ? '处理中...' : '接受邀请'}
              </Button>
            </div>
            {user.email?.toLowerCase() !== invite.inviteeEmail.toLowerCase() && (
              <button
                onClick={async () => { await supabase.auth.signOut(); window.location.reload() }}
                className="w-full mt-3 text-sm text-ink-500 hover:text-ink-900 underline-offset-4 hover:underline"
              >
                退出当前账号
              </button>
            )}
          </>
        ) : (
          <>
            <p className="text-ink-500 text-sm mb-5">
              请使用平台管理员已创建的账号登录。尚未开通账号时，请联系平台管理员。
            </p>
            <form onSubmit={handleAuth} className="space-y-4">
              <Input
                label="邮箱"
                type="email"
                value={invite.inviteeEmail}
                readOnly
                disabled
              />
              <Input
                label="密码"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="输入你的密码"
                required
              />
              {authError && <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-5 py-3 text-sm">{authError}</div>}
              <Button variant="primary" size="lg" fullWidth type="submit" loading={submitting}>
                {submitting ? '处理中...' : '登录并加入项目'}
              </Button>
            </form>
          </>
        )}

        <p className="text-[10px] text-ink-400 mt-8 text-center">
          此邀请将在 {new Date(invite.expiresAt).toLocaleDateString('zh-CN')} 过期
        </p>
      </div>
    </div>
  )
}
