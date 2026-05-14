'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Eyebrow } from '@/components/ui/Eyebrow'

const features = [
  { zh: 'AI 一键初翻', en: 'One-click AI draft' },
  { zh: '术语自动对照', en: 'Auto glossary' },
  { zh: '多人协作翻译', en: 'Team collaboration' },
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
          <div className="w-9 h-9 bg-brand rounded-xl flex items-center justify-center">
            <span className="text-white font-bold">译</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-ink-900 font-semibold text-base tracking-tight">译境</span>
            <span className="hidden sm:inline text-ink-500 text-xs">— 技大25级MTIer翻译平台</span>
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

          <h1 className="font-serif text-3xl lg:text-4xl leading-[1.15] text-ink-900 tracking-tight">
            专为25级<span className="text-brand">深技大MTI</span>同学<br />
            打造的翻译平台
          </h1>

          <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {features.map(f => (
              <li key={f.zh} className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-brand" />
                <span className="text-ink-900">{f.zh}</span>
                <span className="text-ink-400 text-xs italic">{f.en}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 底部版权 */}
        <p className="absolute bottom-6 left-6 sm:bottom-8 sm:left-10 lg:bottom-10 lg:left-16 text-[11px] text-ink-500 font-mono">
          © 2026 译境 · Powered by DeepSeek · Claude · Supabase
        </p>
      </section>

      {/* 右侧：纯白 — 居中表单 card */}
      <section className="lg:w-1/2 bg-white relative flex items-center justify-center px-10 sm:px-12 lg:px-16 py-24 min-h-screen">
        {/* 顶部切换链接 */}
        <div className="absolute top-8 right-6 sm:top-10 sm:right-10 lg:top-12 lg:right-16">
          <p className="text-ink-500 text-sm">
            {isLogin ? '还没有账号？' : '已有账号？'}
            <button onClick={() => { setIsLogin(!isLogin); setError(''); setMessage('') }}
              className="text-brand hover:text-brand-600 font-medium ml-1.5 underline-offset-4 hover:underline">
              {isLogin ? '立即注册' : '去登录'}
            </button>
          </p>
        </div>

        {/* 表单 card：固定 420px，padding 32px，rounded-2xl，border + 轻微阴影 */}
        <div
          className="w-full bg-white border border-line rounded-2xl shadow-[0_1px_2px_rgba(31,30,29,0.04),0_8px_24px_rgba(31,30,29,0.06)]"
          style={{ maxWidth: 440, padding: '40px' }}
        >
          <div className="mb-10">
            <Eyebrow className="mb-3">{isLogin ? 'Sign in' : 'Get started'}</Eyebrow>
            <h2 className="font-serif text-3xl text-ink-900 tracking-tight leading-tight">
              {isLogin ? '欢迎回来' : '创建账号'}
            </h2>
            <p className="text-ink-500 mt-2.5 text-sm">
              {isLogin ? '登录以继续你的翻译工作' : '加入你的翻译团队'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <Input
                label="姓名"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="请输入姓名"
                required={!isLogin}
                inputClassName="h-11 py-0"
              />
            )}
            <Input
              label="邮箱"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              inputClassName="h-11 py-0"
            />
            <Input
              label="密码"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="至少 6 位"
              required
              inputClassName="h-11 py-0"
            />

            {error && <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
            {message && <div className="bg-green-50 border border-green-100 text-green-700 rounded-xl px-4 py-3 text-sm">{message}</div>}

            <div className="pt-2">
              <Button variant="primary" type="submit" loading={loading} fullWidth className="h-11 py-0">
                {loading ? '处理中' : isLogin ? '登录' : '创建账号'}
              </Button>
            </div>
          </form>
        </div>

        {/* 底部 */}
        <p className="absolute bottom-6 right-6 sm:bottom-8 sm:right-10 lg:bottom-10 lg:right-16 text-[11px] text-ink-400">
          继续即表示同意使用本平台进行翻译协作
        </p>
      </section>
    </div>
  )
}
