'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Eyebrow } from '@/components/ui/Eyebrow'
import Logo from '@/components/Logo'

function friendlyAuthError(message: string) {
  if (/invalid login credentials/i.test(message)) return '邮箱或密码错误，请重试。'
  if (/email not confirmed/i.test(message)) return '邮箱尚未验证，请先打开验证邮件完成确认后再登录。'
  if (/password/i.test(message)) return '密码不符合要求，请确认至少 6 位。'
  return message || '操作失败，请稍后重试。'
}

function loginDestination(): string {
  if (typeof window === 'undefined') return '/dashboard'

  const next = new URLSearchParams(window.location.search).get('next')
  return next && next.startsWith('/') && !next.startsWith('//')
    ? next
    : '/dashboard'
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      if (data.session) {
        router.replace(loginDestination())
        return
      }
      if (error && /refresh token|invalid token|expired/i.test(error.message)) {
        void supabase.auth.signOut()
      }
    })
    return () => { alive = false }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(friendlyAuthError(error.message))
    else router.push(loginDestination())
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* 左侧：暖米色 — 品牌叙述 */}
      <section className="lg:w-1/2 bg-canvas relative flex items-center justify-center px-10 sm:px-12 lg:px-16 py-24 min-h-screen">
        {/* 顶部 logo */}
        <div className="absolute top-10 left-10 sm:top-10 sm:left-12 lg:top-12 lg:left-16 flex items-center gap-3">
          <Logo size={40} priority className="flex-shrink-0" />
          <span className="brand-wordmark text-ink-900 text-[30px]">译境</span>
        </div>

        {/* 中部主内容 */}
        <div className="w-full max-w-xl" style={{ transform: 'translateY(18px)' }}>
          {/* 头图 — mix-blend-multiply 让米白底融入 canvas 色 */}
          <div className="mb-10 -mx-2">
            <Image
              src="/image2.png"
              alt="MTI 同学协作翻译"
              width={1536}
              height={1024}
              priority
              className="w-full h-auto rounded-2xl mix-blend-multiply select-none pointer-events-none"
              style={{
                maskImage: 'radial-gradient(ellipse at center, #000 60%, transparent 100%)',
                WebkitMaskImage: 'radial-gradient(ellipse at center, #000 60%, transparent 100%)',
              }}
            />
          </div>

          <h1 className="font-serif text-ink-900"
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'clamp(28px, 3.4vw, 44px)',
              lineHeight: 1.15,
              letterSpacing: '-0.01em',
              textAlign: 'center',
              margin: 0,
            }}>
            为{' '}
            <span
              style={{
                fontFamily: '"Chalkboard SE", "Marker Felt", "Comic Sans MS", "Segoe Print", system-ui, sans-serif',
                fontWeight: 700,
                color: 'var(--color-brand)',
                fontSize: '1.4em',
                letterSpacing: '0.03em',
                margin: '0 0.1em',
                verticalAlign: 'baseline',
                display: 'inline-block',
                transform: 'rotate(-2deg)',
              }}>
              MTI
            </span>{' '}
            翻译项目而建
          </h1>
          <p style={{
            marginTop: 22,
            marginLeft: 'auto',
            marginRight: 'auto',
            maxWidth: 560,
            textAlign: 'center',
            fontSize: 15,
            lineHeight: 1.75,
            fontFamily: '"Avenir Next", "Inter", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
            fontWeight: 400,
            letterSpacing: 0,
            color: 'var(--color-ink-500)',
          }}>
            Built for sentence-level translation, collaborative review, multi-model AI comparison,
            prompt and temperature experiments, and research-ready data export.
          </p>

        </div>

        {/* 底部版权 */}
        <p className="absolute bottom-6 left-6 sm:bottom-8 sm:left-10 lg:bottom-10 lg:left-16 text-[11px] text-ink-500 font-mono">
          © 2026 译境 · Built for MTI translation collaboration and research
        </p>
      </section>

      {/* 右侧：纯白 — 居中表单 card */}
      <section className="lg:w-1/2 bg-white relative flex items-center justify-center px-10 sm:px-12 lg:px-16 py-24 min-h-screen">
        {/* 顶部说明：私域平台、不开放公开注册 */}
        <div className="absolute top-8 right-6 sm:top-10 sm:right-10 lg:top-12 lg:right-16">
          <p className="text-ink-400 text-xs">新成员？联系平台管理员</p>
        </div>

        {/* 表单 card：固定 420px，padding 32px，rounded-2xl，border + 轻微阴影 */}
        <div
          className="w-full bg-white border border-line rounded-2xl shadow-[0_1px_2px_rgba(31,30,29,0.04),0_8px_24px_rgba(31,30,29,0.06)]"
          style={{ maxWidth: 440, padding: '40px' }}
        >
          <div className="mb-10">
            <Eyebrow className="mb-3">Sign in</Eyebrow>
            <h2 className="font-serif text-3xl text-ink-900 tracking-tight leading-tight">
              欢迎回来
            </h2>
            <p className="text-ink-500 mt-2.5 text-sm leading-relaxed">
              登录后进入你的翻译项目、审校任务和 AI 实验记录。
            </p>
          </div>

          <form onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Input
              label="邮箱"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              style={{ height: 44, paddingTop: 0, paddingBottom: 0 }}
            />
            <Input
              label="密码"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="至少 6 位"
              required
              style={{ height: 44, paddingTop: 0, paddingBottom: 0 }}
            />

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl"
                style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 12, fontSize: 13 }}>
                {error}
              </div>
            )}
            {/* 按钮上方留出明显空隙，与密码框分开 */}
            <div style={{ marginTop: 14 }}>
              <Button variant="primary" type="submit" loading={loading} fullWidth className="h-11 py-0">
                {loading ? '处理中' : '登录'}
              </Button>
            </div>
          </form>

          <div className="flex items-center justify-between" style={{ marginTop: 40 }}>
            <button
              type="button"
              onClick={() => router.push('/account/password')}
              className="text-xs font-medium text-ink-400 transition-colors hover:text-ink-600"
            >
              找回/更改密码
            </button>
            <button
              type="button"
              onClick={() => router.push('/admin')}
              className="text-xs font-medium text-ink-400 transition-colors hover:text-ink-600"
            >
              管理员入口
            </button>
          </div>
        </div>

        {/* 底部 */}
        <p className="absolute bottom-6 right-6 sm:bottom-8 sm:right-10 lg:bottom-10 lg:right-16 text-[11px] text-ink-400">
          内部研究与协作平台 · 仅限授权成员使用
        </p>
      </section>
    </div>
  )
}
