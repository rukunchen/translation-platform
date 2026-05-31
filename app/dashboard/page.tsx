'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { apiJSON } from '@/lib/apiFetch'
import Sidebar from '@/components/Sidebar'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { MainContent } from '@/components/ui/MainContent'
import {
  DashboardHeader,
  TodoOverviewSection,
  ProjectsSection,
  PracticeEntrySection,
  RecentExperimentsSection,
  KnowledgeEntrySection,
  WritingEntrySection,
} from './components/DashboardSections'

// ---------- 类型 ----------
type Role = 'manager' | 'translator' | 'reviewer'
type SegmentStatus = 'untranslated' | 'draft' | 'reviewed' | 'locked'

type Project = {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at?: string | null
  type?: string | null
  metadata?: Record<string, unknown> | null
}
type DocumentRow = {
  id: string; project_id: string; title: string
  source_language: string; target_language: string
  updated_at?: string | null; created_at: string
  document_type?: string | null
}
type SegmentRow = {
  id: string
  document_id: string
  status?: SegmentStatus | string | null
  target?: string | null
  translator_target?: string | null
  review_target?: string | null
  reviewed_at?: string | null
  metadata?: Record<string, unknown> | null
  [key: string]: unknown
}
type MemberRow = { project_id: string; user_id: string; role: Role }
type ParallelRow = {
  id: string; document_id: string; segment_id: string
  provider: string; model: string; temperature: number | null
  status: 'pending' | 'running' | 'success' | 'failed'
  updated_at?: string | null
}

type UserMeta = { name?: string }
type TodoKind = 'translate' | 'review' | 'confirm' | 'export' | 'experiment'
type TodoPriority = 'high' | 'medium' | 'low'
type PracticeOverview = {
  practicedItems: number
  reviewDue: number
  expressionCards: number
  frequentIssueType: string
  frequentIssueCount: number
}

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
  kind: TodoKind
  projectId: string
  projectName: string
  documentId?: string
  documentTitle?: string
  count: number
  detail?: string
}

type StatusSummary = {
  kind: TodoKind
  total: number
  percent: number
}

type PriorityTodo = Todo & {
  priority: TodoPriority
  score: number
  suggestion: string
}

type ProjectProgressRow = {
  id: string
  title: string
  subtitle: string
  translationPct: number
  reviewPct: number
  pendingCount: number
  nextKind: TodoKind
  href: string
  action: string
}

// 中文语言名映射
const langNames: Record<string, string> = {
  en: '英', zh: '中', ja: '日', ko: '韩', fr: '法', de: '德', es: '西', ru: '俄',
}

const todoMeta: Record<TodoKind, {
  label: string
  shortLabel: string
  action: string
  cls: string
  softCls: string
  barCls: string
  textCls: string
}> = {
  translate: {
    label: '待翻译',
    shortLabel: '待翻译',
    action: '去翻译',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
    softCls: 'bg-amber-50/50 border-amber-100',
    barCls: 'bg-amber-200',
    textCls: 'text-amber-800',
  },
  review: {
    label: '待审校',
    shortLabel: '待审校',
    action: '去审校',
    cls: 'bg-blue-50 text-blue-800 border-blue-200',
    softCls: 'bg-blue-50/45 border-blue-100',
    barCls: 'bg-blue-200',
    textCls: 'text-blue-800',
  },
  confirm: {
    label: '待最终确认',
    shortLabel: '待确认',
    action: '去确认',
    cls: 'bg-violet-50 text-violet-800 border-violet-200',
    softCls: 'bg-violet-50/45 border-violet-100',
    barCls: 'bg-violet-200',
    textCls: 'text-violet-800',
  },
  export: {
    label: '待导出',
    shortLabel: '待导出',
    action: '去导出',
    cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    softCls: 'bg-emerald-50/45 border-emerald-100',
    barCls: 'bg-emerald-200',
    textCls: 'text-emerald-800',
  },
  experiment: {
    label: 'AI 实验待标注',
    shortLabel: 'AI 标注',
    action: '查看实验',
    cls: 'bg-rose-50 text-rose-800 border-rose-200',
    softCls: 'bg-rose-50/45 border-rose-100',
    barCls: 'bg-rose-200',
    textCls: 'text-rose-800',
  },
} as const

const todoKinds: TodoKind[] = ['translate', 'review', 'confirm', 'export', 'experiment']

const dashboardPrimaryButtonClass = 'dashboard-action-primary'
const dashboardButtonClass = 'dashboard-action'

const emptyPracticeOverview: PracticeOverview = {
  practicedItems: 0,
  reviewDue: 0,
  expressionCards: 0,
  frequentIssueType: '暂无',
  frequentIssueCount: 0,
}

const PPT_FALLBACK_PREFIX = '__PPT_SLIDE_TRANSLATION_META__'

function isPptProject(project: Project): boolean {
  return project.type === 'ppt_slide_translation'
    || Boolean(project.description?.startsWith(PPT_FALLBACK_PREFIX))
}

function percent(value: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

function valueOf(row: SegmentRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function segmentStatus(row: SegmentRow): string {
  return String(row.status || '').toLowerCase()
}

function isSegmentTranslated(row: SegmentRow): boolean {
  return Boolean(valueOf(row, [
    'human_translation',
    'manual_translation',
    'translator_translation',
    'translator_target',
    'target_text',
    'translation',
    'target',
  ]))
}

function isSegmentReviewed(row: SegmentRow): boolean {
  const status = segmentStatus(row)
  const reviewedText = valueOf(row, ['reviewed_translation', 'review_translation', 'review_target'])
  return ['reviewed', 'locked', 'approved', 'passed', '已审校', '已锁定'].includes(status)
    || Boolean(row.reviewed_at)
    || (Boolean(reviewedText) && ['reviewed', 'locked', 'approved', 'passed', '通过'].includes(status))
}

function isPendingTranslation(row: SegmentRow): boolean {
  return !isSegmentTranslated(row)
}

function isPendingReview(row: SegmentRow): boolean {
  const status = segmentStatus(row)
  return status === 'draft' || (isSegmentTranslated(row) && !isSegmentReviewed(row) && status !== 'untranslated')
}

function projectHref(project: Project): string {
  return isPptProject(project) ? `/projects/${project.id}/ppt` : `/projects/${project.id}`
}

function todoHref(todo: Todo, projects: Project[]): string {
  const project = projects.find(p => p.id === todo.projectId)
  if (todo.kind === 'experiment' && todo.documentId) return `/documents/${todo.documentId}/parallel`
  if (todo.documentId && todo.kind !== 'translate' && todo.kind !== 'review') return `/documents/${todo.documentId}`
  return project ? projectHref(project) : `/projects/${todo.projectId}`
}

function priorityOf(todo: Todo): TodoPriority {
  if (todo.count >= 100 || (todo.kind === 'review' && todo.count >= 50) || (todo.kind === 'experiment' && todo.count >= 50)) {
    return 'high'
  }
  if (todo.count >= 10) return 'medium'
  return 'low'
}

function priorityScore(todo: Todo): number {
  const priorityWeight = priorityOf(todo) === 'high' ? 3000 : priorityOf(todo) === 'medium' ? 1000 : 0
  const kindWeight: Record<TodoKind, number> = {
    review: 70,
    translate: 60,
    experiment: 50,
    confirm: 40,
    export: 30,
  }
  return priorityWeight + todo.count + kindWeight[todo.kind]
}

function taskSuggestion(todo: Todo, projects: Project[]): string {
  const project = projects.find(p => p.id === todo.projectId)
  const ppt = project ? isPptProject(project) : false
  if (todo.kind === 'translate' && ppt) return '优先完成 PPT 分页翻译'
  if (todo.kind === 'translate') return '先完成基础译文'
  if (todo.kind === 'review') return '统一术语和风格'
  if (todo.kind === 'confirm') return '确认后锁定最终稿'
  if (todo.kind === 'export') return '检查后导出交付'
  return '标注可采用译文'
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string; email?: string; user_metadata?: UserMeta } | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [segments, setSegments] = useState<SegmentRow[]>([])
  const [members, setMembers] = useState<MemberRow[]>([])
  const [parallel, setParallel] = useState<ParallelRow[]>([])
  const [practiceOverview, setPracticeOverview] = useState<PracticeOverview>(emptyPracticeOverview)
  const [loading, setLoading] = useState(true)

  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    const { data, error } = await apiJSON<{ projects: Project[]; documents: DocumentRow[]; members: MemberRow[] }>('/api/projects')
    if (error || !data) {
      setProjects([]); setDocuments([]); setSegments([]); setMembers([]); setParallel([])
      return
    }

    const projectsList = data.projects ?? []
    const docs = data.documents ?? []
    setProjects(projectsList)
    setDocuments(docs)
    setMembers(data.members ?? [])

    if (projectsList.length === 0) {
      setSegments([]); setParallel([])
      return
    }

    // segments / parallel 通过 document_id 拉
    const docIds = docs.map(d => d.id)
    if (docIds.length > 0) {
      const [initialSegRes, ptRes] = await Promise.all([
        supabase.from('segments').select('id, document_id, status, target, translator_target, review_target, reviewed_at, metadata').in('document_id', docIds),
        supabase.from('parallel_translations')
          .select('id, document_id, segment_id, provider, model, temperature, status, updated_at')
          .in('document_id', docIds)
          .neq('provider', '__config__')
          .order('updated_at', { ascending: false })
          .limit(60),
      ])
      let segmentsData: unknown = initialSegRes.data
      if (initialSegRes.error && /translator_target|review_target|reviewed_at|metadata|schema cache|column/i.test(initialSegRes.error.message)) {
        const fallbackSegRes = await supabase
          .from('segments')
          .select('id, document_id, status, target')
          .in('document_id', docIds)
        segmentsData = fallbackSegRes.data
      }
      setSegments((segmentsData ?? []) as SegmentRow[])
      setParallel((ptRes.data ?? []) as ParallelRow[])
    } else {
      setSegments([]); setParallel([])
    }
  }, [])

  const loadPracticeOverview = useCallback(async (userId: string) => {
    const [itemRes, cardRes, issueRes] = await Promise.all([
      supabase.from('translation_practice_items').select('id, status').eq('user_id', userId),
      supabase.from('expression_cards').select('id, next_review_at').eq('user_id', userId),
      supabase.from('translation_practice_issues').select('issue_type'),
    ])
    if (itemRes.error || cardRes.error || issueRes.error) {
      setPracticeOverview(emptyPracticeOverview)
      return
    }
    const now = new Date()
    const todayEnd = new Date(now)
    todayEnd.setHours(23, 59, 59, 999)
    const cards = (cardRes.data ?? []) as Array<{ id: string; next_review_at?: string | null }>
    const issueCounts = ((issueRes.data ?? []) as Array<{ issue_type?: string | null }>).reduce<Record<string, number>>((out, issue) => {
      const label = issue.issue_type?.trim()
      if (label) out[label] = (out[label] ?? 0) + 1
      return out
    }, {})
    const frequentIssue = Object.entries(issueCounts).sort((a, b) => b[1] - a[1])[0]
    setPracticeOverview({
      practicedItems: (itemRes.data ?? []).filter(item => item.status !== 'unpracticed').length,
      reviewDue: cards.filter(card => card.next_review_at && new Date(card.next_review_at) <= todayEnd).length,
      expressionCards: cards.length,
      frequentIssueType: frequentIssue?.[0] ?? '暂无',
      frequentIssueCount: frequentIssue?.[1] ?? 0,
    })
  }, [])

  const init = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { router.push('/'); return }
    setUser(user as typeof user & { id: string })
    await Promise.all([loadAll(), loadPracticeOverview(user.id)])
    setLoading(false)
  }, [loadAll, loadPracticeOverview, router])

  useEffect(() => {
    const timer = window.setTimeout(() => { void init() }, 0)
    return () => window.clearTimeout(timer)
  }, [init])

  async function createProject(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    const { data, error } = await apiJSON<{ project: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    })
    setCreating(false)
    if (error || !data?.project) { alert('创建失败：' + (error || '未知错误')); return }
    if (data.project) {
      setShowModal(false); setName(''); setDescription('')
      router.push(`/projects/${data.project.id}`)
    }
  }

  async function deleteProject(project: Project) {
    if (!confirm('是否确定要删除？')) return
    setDeletingProjectId(project.id)
    const { error } = await apiJSON(`/api/projects/${project.id}`, { method: 'DELETE' })
    setDeletingProjectId(null)
    if (error) { alert('删除失败：' + error); return }
    if (user?.id) await loadAll()
  }

  const userName = user?.user_metadata?.name || (user?.email ? user.email.split('@')[0] : '同学')
  const userId = user?.id
  const firstExperimentHref = documents[0] ? `/documents/${documents[0].id}/parallel` : '/dashboard'

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
      const translated = pSegs.filter(isSegmentTranslated).length
      const reviewed   = pSegs.filter(isSegmentReviewed).length
      const locked     = pSegs.filter(s => segmentStatus(s) === 'locked').length

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
      const untrans = s.segments.filter(isPendingTranslation).length
      if (untrans > 0) {
        out.push({ kind: 'translate', projectId: s.project.id, projectName: s.project.name, count: untrans })
      }
      // 待审校（reviewer/manager）
      if (role === 'manager' || role === 'reviewer') {
        const drafts = s.segments.filter(isPendingReview).length
        if (drafts > 0) out.push({ kind: 'review', projectId: s.project.id, projectName: s.project.name, count: drafts })
      }
      // 待确认（manager 锁定）
      if (role === 'manager') {
        const toLock = s.segments.filter(x => segmentStatus(x) === 'reviewed').length
        if (toLock > 0) out.push({ kind: 'confirm', projectId: s.project.id, projectName: s.project.name, count: toLock })
      }
      // 待导出：每个文档若 100% 锁定，可以导出
      for (const d of s.docs) {
        const segs = s.segments.filter(x => x.document_id === d.id)
        if (segs.length > 0 && segs.every(x => segmentStatus(x) === 'locked')) {
          out.push({
            kind: 'export', projectId: s.project.id, projectName: s.project.name,
            documentId: d.id, documentTitle: d.title, count: segs.length, detail: '全部锁定',
          })
        }
      }
    }
    // AI 实验待标注：parallel 里 success 但未被采用（target 与候选不一致或为空）
    const segById = new Map(segments.map(s => [s.id, s] as const))
    const pendingByDoc = new Map<string, number>()
    for (const p of parallel) {
      if (p.status !== 'success') continue
      const seg = segById.get(p.segment_id)
      const isAdopted = !!seg && isSegmentTranslated(seg)
      const k = p.document_id
      if (!isAdopted) pendingByDoc.set(k, (pendingByDoc.get(k) ?? 0) + 1)
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
  const todoStatusSummaries: StatusSummary[] = useMemo(() => {
    return todoKinds.map(kind => {
      const total = todos.filter(t => t.kind === kind).reduce((sum, t) => sum + t.count, 0)
      return { kind, total, percent: percent(total, todoCount) }
    })
  }, [todos, todoCount])
  const priorityTodos: PriorityTodo[] = useMemo(() => {
    return todos
      .map(todo => ({
        ...todo,
        priority: priorityOf(todo),
        score: priorityScore(todo),
        suggestion: taskSuggestion(todo, projects),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
  }, [todos, projects])
  const projectProgressRows: ProjectProgressRow[] = useMemo(() => {
    return stats
      .map(s => {
        const projectTodos = todos.filter(t => t.projectId === s.project.id)
        if (projectTodos.length === 0) return null
        const sortedTodos = projectTodos.slice().sort((a, b) => priorityScore(b) - priorityScore(a))
        const lead = sortedTodos[0]
        const pendingCount = projectTodos.reduce((sum, t) => sum + t.count, 0)
        const docCountLabel = isPptProject(s.project) ? 'PPT 分页翻译' : `${s.docs.length} 个文档`
        return {
          id: s.project.id,
          title: lead.documentTitle || s.project.name,
          subtitle: lead.documentTitle ? s.project.name : [docCountLabel, s.langPair].filter(Boolean).join(' · '),
          translationPct: percent(s.translated, s.total),
          reviewPct: percent(s.reviewed, s.total),
          pendingCount,
          nextKind: lead.kind,
          href: todoHref(lead, projects),
          action: todoMeta[lead.kind].action,
        }
      })
      .filter((row): row is ProjectProgressRow => Boolean(row))
      .sort((a, b) => b.pendingCount - a.pendingCount)
      .slice(0, 5)
  }, [stats, todos, projects])
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
    <div className="dashboard-surface h-screen flex items-center justify-center bg-canvas">
      <div className="flex items-center gap-3 text-ink-600">
        <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">加载中...</span>
      </div>
    </div>
  )

  return (
    <div className="dashboard-surface flex h-screen bg-canvas">
      <Sidebar />

      <main className="flex-1 overflow-auto p-2 sm:p-4 lg:p-5">
        <div className="bg-white rounded-2xl border border-line min-h-[calc(100vh-40px)]">
          <MainContent size="wide" className="!py-8 sm:!py-12 lg:!py-16 !px-4 sm:!px-8 lg:!px-20">

            <DashboardHeader
              dateLabel={new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
              greeting={greeting}
              userName={userName}
              projectCount={projects.length}
              todoCount={todoCount}
            />

            <TodoOverviewSection
              projectCount={projects.length}
              todoCount={todoCount}
              todoListCount={todos.length}
              todoStatusSummaries={todoStatusSummaries}
              priorityTodos={priorityTodos}
              projects={projects}
              projectProgressRows={projectProgressRows}
              onCreateProject={() => setShowModal(true)}
              experimentHref={firstExperimentHref}
            />

            <ProjectsSection
              stats={stats}
              projectCount={projects.length}
              deletingProjectId={deletingProjectId}
              onCreateProject={() => setShowModal(true)}
              onPrefetch={(href) => router.prefetch(href)}
              onDelete={(project) => { void deleteProject(project) }}
            />

            <PracticeEntrySection
              overview={practiceOverview}
            />

            <RecentExperimentsSection
              experiments={experiments}
            />

            <KnowledgeEntrySection />

            <WritingEntrySection />

            <p className="mt-12 text-center text-[11px] text-ink-500">
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
                <Button variant="secondary" className={dashboardButtonClass} fullWidth onClick={() => setShowModal(false)} type="button">取消</Button>
                <Button variant="brand" className={dashboardPrimaryButtonClass} fullWidth type="submit" loading={creating}>
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
