'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Eyebrow } from '@/components/ui/Eyebrow'
import Logo from '@/components/Logo'

const features = [
  { zh: '小组翻译与审校协作', en: 'In-team translation & review' },
  { zh: '多模型 AI 翻译实验', en: 'Multi-model translation experiments' },
  { zh: '术语库、版本记录与数据导出', en: 'Glossary, history & research export' },
]

export default function LoginPage() {
  const router = useRouter()
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(''); setMessage('')
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError('邮箱或密码错误，请重试')
      else router.push('/dashboard')
    } else {
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { name } } })
      if (error) setError('注册失败：' + error.message)
      else { setMessage('注册成功！请登录。'); setIsLogin(true) }
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* 左侧：暖米色 — 品牌叙述 */}
      <section className="lg:w-1/2 bg-canvas relative flex items-center justify-center px-10 sm:px-12 lg:px-16 py-24 min-h-screen">
        {/* 顶部 logo */}
        <div className="absolute top-10 left-10 sm:top-10 sm:left-12 lg:top-12 lg:left-16 flex items-center gap-3">
          <Logo size={40} priority className="flex-shrink-0" />
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-ink-900 font-semibold text-base tracking-tight">译境</span>
            <span className="hidden sm:inline text-ink-500 text-[11px] mt-0.5 truncate">深技大25级 MTI 翻译协作与研究平台</span>
          </div>
        </div>

        {/* 中部主内容 */}
        <div className="w-full max-w-xl">
          {/* 头图 — mix-blend-multiply 让米白底融入 canvas 色 */}
          <div className="mb-10 -mx-2">
            <Image
              src="/page1.png"
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
                fontFamily: '"Bodoni 72", "Didot", "Playfair Display", "Times New Roman", Georgia, serif',
                fontStyle: 'italic',
                fontWeight: 700,
                color: 'var(--color-brand)',
                fontSize: '1.35em',
                letterSpacing: '0.02em',
                margin: '0 0.08em',
                verticalAlign: 'baseline',
              }}>
              MTI
            </span>{' '}
            <span style={{ color: 'var(--color-brand)' }}>小组</span>{' '}
            翻译项目而建
          </h1>
          <p className="mt-5 text-ink-500 text-sm lg:text-[15px] leading-relaxed text-center max-w-md mx-auto">
            支持分句翻译、多人审校、多模型 AI 译文对比、Prompt 与 Temperature 实验记录，以及研究数据导出。
          </p>

          <div className="mt-8 mx-auto max-w-md pt-6 border-t border-ink-900/10">
            <ul className="space-y-3 text-sm">
              {features.map(f => (
                <li key={f.zh} className="flex items-center gap-3 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" />
                  <span className="text-ink-900">{f.zh}</span>
                  <span className="text-ink-400 text-[11px] italic ml-auto">{f.en}</span>
                </li>
              ))}
            </ul>
          </div>
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
          {isLogin ? (
            <p className="text-ink-400 text-xs">新成员？联系项目管理员</p>
          ) : (
            <p className="text-ink-400 text-xs">
              已有账号？
              <button onClick={() => { setIsLogin(true); setError(''); setMessage('') }}
                className="text-ink-700 hover:text-ink-900 font-medium ml-1.5 underline underline-offset-4">
                返回登录
              </button>
            </p>
          )}
        </div>

        {/* 表单 card：固定 420px，padding 32px，rounded-2xl，border + 轻微阴影 */}
        <div
          className="w-full bg-white border border-line rounded-2xl shadow-[0_1px_2px_rgba(31,30,29,0.04),0_8px_24px_rgba(31,30,29,0.06)]"
          style={{ maxWidth: 440, padding: '40px' }}
        >
          <div className="mb-10">
            <Eyebrow className="mb-3">{isLogin ? 'Sign in' : 'Admin sign-up'}</Eyebrow>
            <h2 className="font-serif text-3xl text-ink-900 tracking-tight leading-tight">
              {isLogin ? '欢迎回来' : '创建账号'}
            </h2>
            <p className="text-ink-500 mt-2.5 text-sm leading-relaxed">
              {isLogin
                ? '登录后进入你的翻译项目、审校任务和 AI 实验记录。'
                : '此入口仅供项目管理员为新成员创建账号。'}
            </p>
          </div>

          <form onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {!isLogin && (
              <Input
                label="姓名"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="请输入姓名"
                required={!isLogin}
                style={{ height: 44, paddingTop: 0, paddingBottom: 0 }}
              />
            )}
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
            {message && (
              <div className="bg-green-50 border border-green-100 text-green-700 rounded-xl"
                style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 12, paddingBottom: 12, fontSize: 13 }}>
                {message}
              </div>
            )}

            {/* 按钮上方留出明显空隙，与密码框分开 */}
            <div style={{ marginTop: 14 }}>
              <Button variant="primary" type="submit" loading={loading} fullWidth className="h-11 py-0">
                {loading ? '处理中' : isLogin ? '登录' : '创建账号'}
              </Button>
            </div>
          </form>

          {/* 弱化的管理员注册入口：仅供需要时手动切换 */}
          {isLogin && (
            <p className="mt-6 pt-5 border-t border-line text-center text-[11px] text-ink-400">
              管理员可在此
              <button
                type="button"
                onClick={() => { setIsLogin(false); setError(''); setMessage('') }}
                className="text-ink-500 hover:text-ink-900 underline underline-offset-4 ml-1"
              >
                为成员创建账号
              </button>
            </p>
          )}
        </div>

        {/* 底部 */}
        <p className="absolute bottom-6 right-6 sm:bottom-8 sm:right-10 lg:bottom-10 lg:right-16 text-[11px] text-ink-400">
          内部研究与协作平台 · 仅限授权成员使用
        </p>
      </section>
    </div>
  )
}
