'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { MainContent } from '@/components/ui/MainContent'
import { cn } from '@/components/ui/cn'

// ---------- 类型 ----------
type Role = 'manager' | 'translator' | 'reviewer'
type SegmentStatus = 'untranslated' | 'draft' | 'reviewed' | 'locked'

type Project = { id: string; name: string; description: string | null; created_at: string }
type DocumentRow = {
  id: string; project_id: string; title: string
  source_language: string; target_language: string
  updated_at?: string | null; created_at: string
}
type SegmentRow = { id: string; document_id: string; status: SegmentStatus; target: string }
type MemberRow = { project_id: string; user_id: string; role: Role }
type ParallelRow = {
  id: string; document_id: string; segment_id: string
  provider: string; model: string; temperature: number | null
  status: 'pending' | 'running' | 'success' | 'failed'
  updated_at?: string | null
}

type UserMeta = { name?: string }

// ---------- 派生：项目维度的聚合 ----------
type ProjectStats = {
  project: Project
  docs: DocumentRow[]
  segments: SegmentRow[]
  myRole: Role | null
  memberCount: number
  langPair: string | null
  // 进度
  total: number
  translated: number      // status != untranslated
  reviewed: number        // reviewed + locked
  locked: number
  // 最新动态
  lastUpdated: string | null
}

type Todo = {
  kind: 'translate' | 'review' | 'confirm' | 'export' | 'experiment'
  projectId: string
  projectName: string
  documentId?: string
  documentTitle?: string
  count: number
  detail?: string
}

// 中文语言名映射
const langNames: Record<string, string> = {
  en: '英', zh: '中', ja: '日', ko: '韩', fr: '法', de: '德', es: '西', ru: '俄',
}

const todoMeta = {
  translate:  { label: '待翻译',         action: '去翻译',   cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  review:     { label: '待审校',         action: '去审校',   cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  confirm:    { label: '待最终确认',     action: '去确认',   cls: 'bg-violet-50 text-violet-800 border-violet-200' },
  export:     { label: '待导出',         action: '去导出',   cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  experiment: { label: 'AI 实验待标注',  action: '查看实验', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
} as const

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string; email?: string; user_metadata?: UserMeta } | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [segments, setSegments] = useState<SegmentRow[]>([])
  const [members, setMembers] = useState<MemberRow[]>([])
  const [parallel, setParallel] = useState<ParallelRow[]>([])
  const [loading, setLoading] = useState(true)

  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const loadAll = useCallback(async () => {
    // 仅拉用户能看到的项目（RLS 自动过滤）
    const { data: ps } = await supabase
      .from('projects').select('*').order('created_at', { ascending: false })
    const projectsList = (ps ?? []) as Project[]
    setProjects(projectsList)

    if (projectsList.length === 0) {
      setDocuments([]); setSegments([]); setMembers([]); setParallel([])
      return
    }
    const ids = projectsList.map(p => p.id)

    const [docsRes, membersRes] = await Promise.all([
      supabase.from('documents').select('id, project_id, title, source_language, target_language, updated_at, created_at').in('project_id', ids),
      supabase.from('project_members').select('project_id, user_id, role').in('project_id', ids),
    ])
    const docs = (docsRes.data ?? []) as DocumentRow[]
    setDocuments(docs)
    setMembers((membersRes.data ?? []) as MemberRow[])

    // segments / parallel 通过 document_id 拉
    const docIds = docs.map(d => d.id)
    if (docIds.length > 0) {
      const [segRes, ptRes] = await Promise.all([
        supabase.from('segments').select('id, document_id, status, target').in('document_id', docIds),
        supabase.from('parallel_translations')
          .select('id, document_id, segment_id, provider, model, temperature, status, updated_at')
          .in('document_id', docIds)
          .order('updated_at', { ascending: false })
          .limit(60),
      ])
      setSegments((segRes.data ?? []) as SegmentRow[])
      setParallel((ptRes.data ?? []) as ParallelRow[])
    } else {
      setSegments([]); setParallel([])
    }
  }, [])

  const init = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    setUser(user as typeof user & { id: string })
    await loadAll()
    setLoading(false)
  }, [loadAll, router])

  useEffect(() => {
    const timer = window.setTimeout(() => { void init() }, 0)
    return () => window.clearTimeout(timer)
  }, [init])

  async function createProject(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('projects')
      .insert({ name, description, created_by: user?.id })
      .select().single()
    setCreating(false)
    if (error) { alert('创建失败：' + error.message); return }
    if (data) {
      setShowModal(false); setName(''); setDescription('')
      router.push(`/projects/${data.id}`)
    }
  }

  const userName = user?.user_metadata?.name || (user?.email ? user.email.split('@')[0] : '同学')
  const userId = user?.id

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 6) return '夜深了'
    if (h < 12) return '早上好'
    if (h < 18) return '下午好'
    return '晚上好'
  })()

  // ---------- 项目维度聚合 ----------
  const stats: ProjectStats[] = useMemo(() => {
    return projects.map(p => {
      const pDocs = documents.filter(d => d.project_id === p.id)
      const pDocIds = new Set(pDocs.map(d => d.id))
      const pSegs = segments.filter(s => pDocIds.has(s.document_id))
      const pMembers = members.filter(m => m.project_id === p.id)
      const myMember = userId ? pMembers.find(m => m.user_id === userId) : null
      const total = pSegs.length
      const translated = pSegs.filter(s => s.status !== 'untranslated').length
      const reviewed   = pSegs.filter(s => s.status === 'reviewed' || s.status === 'locked').length
      const locked     = pSegs.filter(s => s.status === 'locked').length

      // 取首个文档的语言对作代表（项目内通常一致）
      const firstDoc = pDocs[0]
      const langPair = firstDoc
        ? `${langNames[firstDoc.source_language] ?? firstDoc.source_language} → ${langNames[firstDoc.target_language] ?? firstDoc.target_language}`
        : null

      const lastUpdated = pDocs
        .map(d => d.updated_at ?? d.created_at)
        .filter(Boolean)
        .sort()
        .pop() ?? null

      return {
        project: p, docs: pDocs, segments: pSegs,
        myRole: (myMember?.role ?? null) as Role | null,
        memberCount: pMembers.length,
        langPair,
        total, translated, reviewed, locked, lastUpdated,
      }
    })
  }, [projects, documents, segments, members, userId])

  // ---------- 待办派生 ----------
  const todos: Todo[] = useMemo(() => {
    const out: Todo[] = []
    for (const s of stats) {
      const role = s.myRole
      // 待翻译
      const untrans = s.segments.filter(x => x.status === 'untranslated').length
      if (untrans > 0) {
        out.push({ kind: 'translate', projectId: s.project.id, projectName: s.project.name, count: untrans })
      }
      // 待审校（reviewer/manager）
      if (role === 'manager' || role === 'reviewer') {
        const drafts = s.segments.filter(x => x.status === 'draft').length
        if (drafts > 0) out.push({ kind: 'review', projectId: s.project.id, projectName: s.project.name, count: drafts })
      }
      // 待确认（manager 锁定）
      if (role === 'manager') {
        const toLock = s.segments.filter(x => x.status === 'reviewed').length
        if (toLock > 0) out.push({ kind: 'confirm', projectId: s.project.id, projectName: s.project.name, count: toLock })
      }
      // 待导出：每个文档若 100% 锁定，可以导出
      for (const d of s.docs) {
        const segs = s.segments.filter(x => x.document_id === d.id)
        if (segs.length > 0 && segs.every(x => x.status === 'locked')) {
          out.push({
            kind: 'export', projectId: s.project.id, projectName: s.project.name,
            documentId: d.id, documentTitle: d.title, count: segs.length, detail: '全部锁定',
          })
        }
      }
    }
    // AI 实验待标注：parallel 里 success 但未被采用（target 与候选不一致或为空）
    const segById = new Map(segments.map(s => [s.id, s] as const))
    const adoptedByDoc = new Map<string, number>()
    const pendingByDoc = new Map<string, number>()
    for (const p of parallel) {
      if (p.status !== 'success') continue
      const seg = segById.get(p.segment_id)
      const isAdopted = !!seg && !!seg.target.trim()
      const k = p.document_id
      if (isAdopted) adoptedByDoc.set(k, (adoptedByDoc.get(k) ?? 0) + 1)
      else pendingByDoc.set(k, (pendingByDoc.get(k) ?? 0) + 1)
    }
    for (const [docId, n] of pendingByDoc) {
      const doc = documents.find(d => d.id === docId)
      if (!doc) continue
      const proj = projects.find(p => p.id === doc.project_id)
      if (!proj) continue
      out.push({
        kind: 'experiment', projectId: proj.id, projectName: proj.name,
        documentId: doc.id, documentTitle: doc.title, count: n,
      })
    }
    return out
  }, [stats, parallel, segments, documents, projects])

  const todoCount = useMemo(() => todos.reduce((a, t) => a + t.count, 0), [todos])

  // ---------- 最近 AI 实验：按文档分组 ----------
  type Experiment = {
    docId: string; docTitle: string; projectId: string; projectName: string
    modelCount: number; tempRange: string; status: string; lastUpdated: string
  }
  const experiments: Experiment[] = useMemo(() => {
    const groups = new Map<string, ParallelRow[]>()
    for (const p of parallel) {
      const list = groups.get(p.document_id) ?? []
      list.push(p); groups.set(p.document_id, list)
    }
    const arr: Experiment[] = []
    for (const [docId, rows] of groups) {
      const doc = documents.find(d => d.id === docId)
      if (!doc) continue
      const proj = projects.find(p => p.id === doc.project_id)
      if (!proj) continue
      const models = new Set(rows.map(r => `${r.provider}/${r.model}`))
      const temps = rows.map(r => Number(r.temperature ?? 0))
      const tMin = Math.min(...temps), tMax = Math.max(...temps)
      const statusCounts = rows.reduce<Record<string, number>>((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a }, {})
      const overall = statusCounts.failed ? 'failed'
        : statusCounts.running || statusCounts.pending ? 'running'
        : 'success'
      const lastUpdated = rows.map(r => r.updated_at ?? '').filter(Boolean).sort().pop() ?? ''
      arr.push({
        docId, docTitle: doc.title, projectId: proj.id, projectName: proj.name,
        modelCount: models.size,
        tempRange: tMin === tMax ? `T=${tMin.toFixed(1)}` : `T ${tMin.toFixed(1)}–${tMax.toFixed(1)}`,
        status: overall,
        lastUpdated,
      })
    }
    arr.sort((a, b) => (b.lastUpdated > a.lastUpdated ? 1 : -1))
    return arr.slice(0, 5)
  }, [parallel, documents, projects])

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-canvas">
      <div className="flex items-center gap-3 text-ink-600">
        <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">加载中...</span>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />

      <main className="flex-1 overflow-auto p-5">
        <div className="bg-white rounded-2xl border border-line min-h-[calc(100vh-40px)]">
          <MainContent size="wide" className="!py-14 lg:!py-16 !px-12 sm:!px-14 lg:!px-20">

            {/* === 一、欢迎区 === */}
            <header className="mb-14 pb-10 border-b border-line">
              <Eyebrow tone="muted" className="mb-2.5">
                {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
              </Eyebrow>
              <h1 className="font-serif text-3xl lg:text-4xl text-ink-900 tracking-tight leading-tight">
                {greeting}，<span className="text-brand">{userName}</span>
              </h1>
              <p className="text-ink-600 text-[15px] mt-3 leading-relaxed">
                {projects.length === 0
                  ? '欢迎来到译境工作台。新建一个项目，开始小组协作或 AI 翻译实验。'
                  : (<>当前有 <span className="text-ink-900 font-semibold">{projects.length}</span> 个翻译项目，
                     <span className="text-ink-900 font-semibold ml-1">{todoCount}</span> 项待办任务。
                     继续未完成的工作，或开启新的 AI 翻译实验。</>)}
              </p>
            </header>

            {/* === 二、我的待办 === */}
            {projects.length > 0 && (
              <section style={{ marginBottom: 96 }}>
                <div className="flex items-baseline justify-between border-b border-line" style={{ marginBottom: 40, paddingBottom: 24 }}>
                  <div>
                    <Eyebrow tone="muted" className="mb-2">My todos</Eyebrow>
                    <h2 className="font-serif text-xl text-ink-900 leading-tight">我的待办</h2>
                  </div>
                  <span className="text-sm text-ink-600">
                    {todoCount === 0 ? '当前没有待办任务，干得漂亮 ✓' : `共 ${todos.length} 项任务（${todoCount} 条句段/文档）`}
                  </span>
                </div>

                {/* 类型计数 chip 行 */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4" style={{ marginBottom: 40 }}>
                  {(Object.keys(todoMeta) as Array<keyof typeof todoMeta>).map(k => {
                    const total = todos.filter(t => t.kind === k).reduce((a, t) => a + t.count, 0)
                    const meta = todoMeta[k]
                    return (
                      <div key={k} className={cn('rounded-xl border', meta.cls)} style={{ padding: '16px 20px' }}>
                        <p className="text-[11px] uppercase tracking-wider font-medium opacity-80">{meta.label}</p>
                        <p className="font-serif text-2xl mt-2">{total}</p>
                      </div>
                    )
                  })}
                </div>

                {/* 待办列表 */}
                {todos.length === 0 ? (
                  <Card padding="md" variant="surface">
                    <p className="text-ink-600 text-sm text-center py-6">所有项目都进展顺利 — 暂无待办</p>
                  </Card>
                ) : (
                  <Card padding="none" className="overflow-hidden">
                    {todos.slice(0, 10).map((t, i) => {
                      const meta = todoMeta[t.kind]
                      return (
                        <div key={`${t.kind}-${t.projectId}-${t.documentId ?? ''}-${i}`}
                          className={cn('flex items-center gap-5', i > 0 && 'border-t border-line')}
                          style={{ paddingLeft: 28, paddingRight: 28, paddingTop: 20, paddingBottom: 20 }}>
                          <span className={cn('text-[11px] font-medium rounded-md border whitespace-nowrap', meta.cls)}
                            style={{ paddingLeft: 10, paddingRight: 10, paddingTop: 4, paddingBottom: 4 }}>
                            {meta.label}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-ink-900 font-medium truncate">
                              {t.documentTitle ? `${t.projectName} · ${t.documentTitle}` : t.projectName}
                            </p>
                            <p className="text-xs text-ink-500 mt-1">
                              {t.detail ?? `${t.count} 条`}
                            </p>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => {
                            if (t.kind === 'experiment' && t.documentId) router.push(`/documents/${t.documentId}/parallel`)
                            else if (t.documentId) router.push(`/documents/${t.documentId}`)
                            else router.push(`/projects/${t.projectId}`)
                          }}>
                            {meta.action} →
                          </Button>
                        </div>
                      )
                    })}
                    {todos.length > 10 && (
                      <div className="bg-canvas/50 text-center text-xs text-ink-500 border-t border-line"
                        style={{ paddingLeft: 28, paddingRight: 28, paddingTop: 16, paddingBottom: 16 }}>
                        还有 {todos.length - 10} 项待办 · 进入对应项目查看
                      </div>
                    )}
                  </Card>
                )}
              </section>
            )}

            {/* === 三、项目卡片 === */}
            <section style={{ marginBottom: 96 }}>
              <div className="flex items-end justify-between border-b border-line" style={{ marginBottom: 40, paddingBottom: 24 }}>
                <div>
                  <Eyebrow tone="muted" className="mb-2">Projects</Eyebrow>
                  <h2 className="font-serif text-xl text-ink-900 leading-tight">
                    我的项目 <span className="text-sm text-ink-500 font-sans font-normal ml-1">{projects.length} 个</span>
                  </h2>
                </div>
                <Button variant="primary" onClick={() => setShowModal(true)} leftIcon={<span className="text-base leading-none">+</span>}>
                  新建项目
                </Button>
              </div>

              {projects.length === 0 ? (
                <Card padding="lg" className="text-center py-20">
                  <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <svg className="w-6 h-6 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  </div>
                  <h3 className="font-serif text-xl text-ink-900 mb-3">开启你的第一个项目</h3>
                  <p className="text-ink-600 text-sm max-w-sm mx-auto mb-7 leading-relaxed">
                    每一个翻译项目都从这里开始。点击下方按钮，给它起个名字。
                  </p>
                  <Button variant="brand" onClick={() => setShowModal(true)}>创建第一个项目</Button>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-7">
                  {stats.map(s => <ProjectCard key={s.project.id} s={s} router={router} />)}
                </div>
              )}
            </section>

            {/* === 四、最近 AI 翻译实验 === */}
            {experiments.length > 0 && (
              <section style={{ marginBottom: 96 }}>
                <div className="flex items-end justify-between border-b border-line" style={{ marginBottom: 40, paddingBottom: 24 }}>
                  <div>
                    <Eyebrow tone="muted" className="mb-2">AI experiments</Eyebrow>
                    <h2 className="font-serif text-xl text-ink-900 leading-tight">最近 AI 翻译实验</h2>
                  </div>
                  <span className="text-xs text-ink-500">最近 5 条</span>
                </div>

                <Card padding="none" className="overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-5 bg-canvas/60 border-b border-line text-[11px] uppercase tracking-wider text-ink-500 font-medium"
                    style={{ paddingLeft: 28, paddingRight: 28, paddingTop: 16, paddingBottom: 16 }}>
                    <div>实验 / 项目 · 文档</div>
                    <div className="text-center">模型</div>
                    <div className="text-center">Temperature</div>
                    <div className="text-center">状态</div>
                    <div className="text-right">操作</div>
                  </div>
                  {experiments.map((e, i) => (
                    <div key={e.docId}
                      className={cn('grid grid-cols-[1fr_auto_auto_auto_auto] gap-5 items-center', i > 0 && 'border-t border-line')}
                      style={{ paddingLeft: 28, paddingRight: 28, paddingTop: 20, paddingBottom: 20 }}>
                      <div className="min-w-0">
                        <p className="text-sm text-ink-900 font-medium truncate">{e.docTitle}</p>
                        <p className="text-xs text-ink-500 mt-1 truncate">{e.projectName}</p>
                      </div>
                      <div className="text-center text-sm text-ink-700 font-mono whitespace-nowrap">
                        {e.modelCount} 个
                      </div>
                      <div className="text-center text-sm text-ink-700 font-mono whitespace-nowrap">
                        {e.tempRange}
                      </div>
                      <div className="text-center">
                        <span className={cn(
                          'text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap uppercase tracking-wider',
                          e.status === 'success' && 'bg-green-50 text-green-700 border border-green-100',
                          e.status === 'failed'  && 'bg-red-50 text-red-700 border border-red-100',
                          e.status === 'running' && 'bg-amber-50 text-amber-700 border border-amber-100',
                        )}>
                          {e.status === 'success' ? '已完成' : e.status === 'failed' ? '有失败' : '进行中'}
                        </span>
                      </div>
                      <div className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => router.push(`/documents/${e.docId}/parallel`)}>
                          查看 →
                        </Button>
                      </div>
                    </div>
                  ))}
                </Card>
              </section>
            )}

            <p className="mt-12 text-center text-[11px] text-ink-500 font-mono">
              译境 · 内部研究与协作平台
            </p>
          </MainContent>
        </div>
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-[var(--shadow-modal)]" style={{ padding: '48px' }}>
            <h3 className="font-serif text-2xl text-ink-900 mb-2 tracking-tight">新建翻译项目</h3>
            <p className="text-ink-600 text-sm mb-7">为新的翻译工作起一个名字。</p>
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
                <Button variant="secondary" fullWidth onClick={() => setShowModal(false)} type="button">取消</Button>
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

// ====== 项目卡片：带进度条、文档数、成员数、操作 ======
function ProjectCard({ s, router }: {
  s: ProjectStats
  router: ReturnType<typeof useRouter>
}) {
  const { project, total, translated, reviewed, locked, docs, memberCount, langPair, lastUpdated } = s
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0

  return (
    <article className="group bg-white border border-line rounded-2xl hover:border-brand/40 hover:shadow-[var(--shadow-card-hover)] transition-all flex flex-col"
      style={{ padding: '32px' }}>

      {/* 标题 + 语言对 badge */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="font-serif text-lg text-ink-900 leading-tight tracking-tight line-clamp-1 flex-1 min-w-0">
          {project.name}
        </h3>
        {langPair && (
          <span className="text-[10px] font-mono text-ink-600 bg-canvas border border-line rounded-md whitespace-nowrap"
            style={{ paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}>
            {langPair}
          </span>
        )}
      </div>
      <p className="text-xs text-ink-600 line-clamp-2 min-h-[32px] mb-5 leading-relaxed">
        {project.description || '暂无描述'}
      </p>

      {/* 三档进度 */}
      <div className="space-y-3 mb-5">
        <ProgressRow label="翻译" value={translated} total={total} pct={pct(translated)} color="bg-amber-400" />
        <ProgressRow label="审校" value={reviewed}   total={total} pct={pct(reviewed)}   color="bg-blue-500" />
        <ProgressRow label="锁定" value={locked}     total={total} pct={pct(locked)}     color="bg-emerald-500" />
      </div>

      {/* 元信息 */}
      <div className="flex items-center gap-3 text-[11px] text-ink-600 mb-5">
        <span className="inline-flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          {docs.length} 个文档
        </span>
        <span className="text-ink-300">·</span>
        <span className="inline-flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          {memberCount} 人
        </span>
        <span className="text-ink-300">·</span>
        <span className="font-mono">
          {lastUpdated ? new Date(lastUpdated).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '—'}
        </span>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 mt-auto border-t border-line" style={{ paddingTop: 20 }}>
        <Button size="sm" variant="primary" onClick={() => router.push(`/projects/${project.id}`)}>
          进入项目
        </Button>
        <Button size="sm" variant="ghost" onClick={() => router.push(`/projects/${project.id}/glossary`)}>
          术语库
        </Button>
        {docs.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => router.push(`/documents/${docs[0].id}/parallel`)}>
            实验
          </Button>
        )}
      </div>
    </article>
  )
}

function ProgressRow({ label, value, total, pct, color }: {
  label: string; value: number; total: number; pct: number; color: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-ink-600">{label}</span>
        <span className="text-ink-700 font-mono">
          {value}/{total} · {pct}%
        </span>
      </div>
      <div className="h-1.5 bg-canvas rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
