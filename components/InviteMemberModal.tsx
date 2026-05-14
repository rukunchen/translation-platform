'use client'

import { useState } from 'react'
import { apiJSON } from '@/lib/apiFetch'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Eyebrow } from './ui/Eyebrow'
import { cn } from './ui/cn'

type Props = {
  projectId: string
  onClose: () => void
  onInvited: () => void
}

export default function InviteMemberModal({ projectId, onClose, onInvited }: Props) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'translator' | 'reviewer'>('translator')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ acceptUrl: string; emailSent: boolean; emailError: string | null } | null>(null)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true); setError('')
    const { data, error: err } = await apiJSON<{ acceptUrl: string; emailSent: boolean; emailError: string | null }>(
      `/api/projects/${projectId}/members`,
      { method: 'POST', body: JSON.stringify({ email, role }) }
    )
    setSending(false)
    if (err || !data) { setError(err || '邀请失败'); return }
    setResult(data)
    onInvited()
  }

  const copyLink = async () => {
    if (!result?.acceptUrl) return
    await navigator.clipboard.writeText(result.acceptUrl)
    alert('邀请链接已复制')
  }

  return (
    <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl w-full max-w-lg p-10 lg:p-12 shadow-[var(--shadow-modal)]">
        <Eyebrow className="mb-3">Invite</Eyebrow>
        <h3 className="font-serif text-2xl text-ink-900 mb-2 tracking-tight">邀请成员加入项目</h3>
        <p className="text-ink-500 text-sm mb-8">输入对方邮箱，选择角色，我们会自动发邀请邮件。</p>

        {!result ? (
          <form onSubmit={submit} className="space-y-5">
            <Input
              label="对方邮箱"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="translator@example.com"
              required
            />

            <div>
              <label className="block text-[11px] font-medium text-ink-700 mb-2 uppercase tracking-[0.14em]">分配角色</label>
              <div className="grid grid-cols-2 gap-3">
                <RoleCard
                  selected={role === 'translator'}
                  onClick={() => setRole('translator')}
                  title="译员"
                  desc="可翻译、编辑、用 AI"
                  accent="brand"
                />
                <RoleCard
                  selected={role === 'reviewer'}
                  onClick={() => setRole('reviewer')}
                  title="审校"
                  desc="可标记「已审校」"
                  accent="blue"
                />
              </div>
            </div>

            {error && <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-5 py-3 text-sm">{error}</div>}

            <div className="flex gap-3 pt-3">
              <Button variant="secondary" fullWidth type="button" onClick={onClose}>取消</Button>
              <Button variant="primary" fullWidth type="submit" loading={sending}>
                {sending ? '发送中...' : '发送邀请'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-5">
            <div className={cn(
              'rounded-xl px-5 py-4 text-sm',
              result.emailSent
                ? 'bg-green-50 border border-green-100 text-green-700'
                : 'bg-amber-50 border border-amber-100 text-amber-800'
            )}>
              {result.emailSent
                ? '邀请邮件已发送'
                : `邮件发送失败：${result.emailError}。可以手动把下面链接发给对方。`}
            </div>
            <div>
              <label className="block text-[11px] font-medium text-ink-700 mb-2 uppercase tracking-[0.14em]">邀请链接</label>
              <div className="flex gap-2">
                <input
                  readOnly value={result.acceptUrl}
                  className="flex-1 bg-canvas border-2 border-line rounded-xl px-4 py-3 text-xs font-mono text-ink-900 focus:outline-none"
                />
                <Button variant="primary" onClick={copyLink}>复制</Button>
              </div>
              <p className="text-[11px] text-ink-400 mt-2">链接 7 天后过期</p>
            </div>
            <Button variant="secondary" fullWidth onClick={onClose}>完成</Button>
          </div>
        )}
      </div>
    </div>
  )
}

function RoleCard({
  selected, onClick, title, desc, accent,
}: { selected: boolean; onClick: () => void; title: string; desc: string; accent: 'brand' | 'blue' }) {
  const accentBorder = accent === 'brand' ? 'border-brand bg-brand-50' : 'border-[#5470D6] bg-[#EEF4FF]'
  return (
    <button type="button" onClick={onClick}
      className={cn(
        'p-4 rounded-xl border-2 text-left transition-all',
        selected ? accentBorder : 'border-line bg-white hover:bg-canvas'
      )}>
      <div className="font-medium text-ink-900">{title}</div>
      <div className="text-xs text-ink-500 mt-1">{desc}</div>
    </button>
  )
}
