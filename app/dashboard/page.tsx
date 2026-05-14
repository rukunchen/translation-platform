'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { MainContent } from '@/components/ui/MainContent'

type Project = {
  id: string
  name: string
  description: string | null
  created_at: string
}

type UserMeta = { name?: string }

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ email?: string; user_metadata?: UserMeta } | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    setUser(user)
    await loadProjects()
    setLoading(false)
  }

  const loadProjects = async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
    if (data) setProjects(data)
  }

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('projects')
      .insert({ name, description, created_by: user?.id })
      .select().single()
    setCreating(false)
    if (error) { alert('创建失败：' + error.message); return }
    if (data) {
      setShowModal(false)
      setName(''); setDescription('')
      router.push(`/projects/${data.id}`)
    }
  }

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 6) return '夜深了'
    if (h < 12) return '早上好'
    if (h < 18) return '下午好'
    return '晚上好'
  })()

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-canvas">
      <div className="flex items-center gap-3 text-ink-500">
        <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">加载中...</span>
      </div>
    </div>
  )

  const userName = user?.user_metadata?.name || (user?.email ? user.email.split('@')[0] : '同学')

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />

      <main className="flex-1 overflow-auto p-[19px]">
        <div className="bg-white rounded-2xl border border-line min-h-[calc(100vh-38px)]">
        <MainContent size="wide" className="!py-12 lg:!py-16 !px-10 sm:!px-12 lg:!px-16">

          {/* 顶部欢迎栏 */}
          <header className="mb-14">
            <Eyebrow tone="muted" className="mb-3">
              {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            </Eyebrow>
            <h1 className="font-serif text-4xl text-ink-900 tracking-tight leading-tight">
              {greeting}，<span className="text-brand">{userName}</span>
            </h1>
            <p className="text-ink-500 text-sm mt-3 max-w-xl leading-relaxed">
              {projects.length === 0
                ? '欢迎来到译境。这里是你的翻译工作空间，从创建第一个项目开始。'
                : `当前你有 ${projects.length} 个翻译项目。继续未完成的工作，或开启新的篇章。`}
            </p>
          </header>

          {/* 项目区头部 */}
          <div className="flex items-center justify-between mb-8 pb-5 border-b border-line">
            <div>
              <Eyebrow tone="muted" className="mb-1.5">Projects</Eyebrow>
              <h2 className="font-serif text-2xl text-ink-900 leading-tight">所有项目</h2>
            </div>
            <Button variant="primary" onClick={() => setShowModal(true)} leftIcon={
              <span className="text-base leading-none">+</span>
            }>
              新建项目
            </Button>
          </div>

          {projects.length === 0 ? (
            <Card padding="lg" className="text-center py-16">
              <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <svg className="w-6 h-6 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <h3 className="font-serif text-xl text-ink-900 mb-2">开启你的第一个项目</h3>
              <p className="text-ink-500 text-sm max-w-sm mx-auto mb-6 leading-relaxed">
                每一个翻译项目都从这里开始。点击下方按钮，给它起个名字。
              </p>
              <Button variant="brand" onClick={() => setShowModal(true)}>
                创建第一个项目
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {projects.map((p, i) => (
                <Card
                  key={p.id}
                  interactive
                  onClick={() => router.push(`/projects/${p.id}`)}
                  padding="md"
                  className="group"
                >
                  <div className="flex items-start justify-between mb-6">
                    <Eyebrow tone="muted">
                      {String(i + 1).padStart(2, '0')}
                    </Eyebrow>
                    <div className="w-9 h-9 bg-canvas rounded-xl flex items-center justify-center group-hover:bg-brand-50 transition-colors">
                      <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    </div>
                  </div>
                  <h3 className="font-serif text-lg text-ink-900 mb-2 line-clamp-1 tracking-tight">{p.name}</h3>
                  <p className="text-sm text-ink-500 line-clamp-2 min-h-[40px] mb-6 leading-relaxed">
                    {p.description || '暂无描述'}
                  </p>
                  <div className="flex items-center justify-between pt-4 border-t border-line">
                    <p className="text-[11px] text-ink-400 font-mono">
                      {new Date(p.created_at).toLocaleDateString('zh-CN')}
                    </p>
                    <span className="text-[11px] text-brand font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      进入
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <p className="mt-16 text-center text-[11px] text-ink-400 font-mono">
            译境 · 技大25级MTIer翻译平台
          </p>
        </MainContent>
        </div>
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-[var(--shadow-modal)]" style={{ padding: '48px' }}>
            <h3 className="font-serif text-2xl text-ink-900 mb-2 tracking-tight">新建翻译项目</h3>
            <p className="text-ink-500 text-sm mb-7">为新的翻译工作起一个名字。</p>
            <form onSubmit={createProject} className="space-y-5">
              <Input
                label="项目名称"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="例如：联合国可持续发展报告"
                required
              />
              <Textarea
                label="项目描述（可选）"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="简单描述一下这个项目..."
                rows={3}
              />
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" fullWidth onClick={() => setShowModal(false)} type="button">
                  取消
                </Button>
                <Button variant="primary" fullWidth type="submit" loading={creating}>
                  {creating ? '创建中...' : '创建项目'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
