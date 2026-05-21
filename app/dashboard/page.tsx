'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { apiJSON } from '@/lib/apiFetch'
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

type Project = {
  id: string
  name: string
  description: string | null
  created_at: string
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

const priorityMeta: Record<TodoPriority, { label: string; cls: string }> = {
  high: { label: '高', cls: 'bg-rose-50/60 text-rose-800 border-rose-100' },
  medium: { label: '中', cls: 'bg-amber-50/60 text-amber-800 border-amber-100' },
  low: { label: '低', cls: 'bg-canvas text-ink-600 border-line' },
}

const dashboardPrimaryButtonClass = 'dashboard-action-primary'
const dashboardButtonClass = 'dashboard-action'
const dashboardDangerButtonClass = 'dashboard-action-danger'

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

function displayProjectDescription(project: Project): string {
  const description = project.description || ''
  if (!description.startsWith(PPT_FALLBACK_PREFIX)) return description || '暂无描述'
  return description.split('\n').slice(1).join('\n').trim() || '暂无描述'
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

function taskSubject(todo: Todo): string {
  return todo.documentTitle ? `${todo.projectName} · ${todo.documentTitle}` : todo.projectName
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

  const loadAll = useCallback(async (userId: string) => {
    const { data: myMemberships } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', userId)
    const ids = Array.from(new Set((myMemberships ?? []).map(m => m.project_id as string).filter(Boolean)))

    if (ids.length === 0) {
      setProjects([]); setDocuments([]); setSegments([]); setMembers([]); setParallel([])
      return
    }

    const { data: ps } = await supabase
      .from('projects').select('*').in('id', ids).order('created_at', { ascending: false })
    const projectsList = (ps ?? []) as Project[]
    setProjects(projectsList)

    if (projectsList.length === 0) {
      setDocuments([]); setSegments([]); setMembers([]); setParallel([])
      return
    }
    const projectIds = projectsList.map(p => p.id)

    const [initialDocsRes, membersRes] = await Promise.all([
      supabase.from('documents').select('id, project_id, title, source_language, target_language, document_type, updated_at, created_at').in('project_id', projectIds),
      supabase.from('project_members').select('project_id, user_id, role').in('project_id', projectIds),
    ])
    let docsData: unknown = initialDocsRes.data
    if (initialDocsRes.error && /document_type|schema cache|column/i.test(initialDocsRes.error.message)) {
      const fallbackDocsRes = await supabase
        .from('documents')
        .select('id, project_id, title, source_language, target_language, updated_at, created_at')
        .in('project_id', projectIds)
      docsData = fallbackDocsRes.data
    }
    const docs = (docsData ?? []) as DocumentRow[]
    setDocuments(docs)
    setMembers((membersRes.data ?? []) as MemberRow[])

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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    setUser(user as typeof user & { id: string })
    await Promise.all([loadAll(user.id), loadPracticeOverview(user.id)])
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
    if (user?.id) await loadAll(user.id)
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

  useEffect(() => {
    if (loading) return
    const sectionId = window.location.hash.slice(1)
    if (!sectionId) return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [loading])

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
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between border-b border-line" style={{ marginBottom: 32, paddingBottom: 24 }}>
                  <div>
                    <Eyebrow tone="muted" className="mb-2">My todos</Eyebrow>
                    <h2 className="font-serif text-xl text-ink-900 leading-tight">我的待办</h2>
                  </div>
                  <span className="text-sm text-ink-600 whitespace-nowrap">
                    {todoCount === 0 ? '共 0 项任务，0 条段/文档' : `共 ${todos.length} 项任务，${todoCount} 条段/文档`}
                  </span>
                </div>

                {todoCount === 0 ? (
                  <TodoEmptyState
                    onCreateProject={() => setShowModal(true)}
                    onOpenExperiment={() => {
                      const firstDoc = documents[0]
                      if (firstDoc) router.push(`/documents/${firstDoc.id}/parallel`)
                      else router.push('/dashboard')
                    }}
                  />
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4" style={{ marginBottom: 28 }}>
                      {todoStatusSummaries.map(summary => (
                        <TodoStatusCard key={summary.kind} summary={summary} />
                      ))}
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)] gap-6" style={{ marginBottom: 28 }}>
                      <PriorityTasksCard
                        tasks={priorityTodos}
                        projects={projects}
                        onOpen={(href) => router.push(href)}
                      />
                      <ProjectProgressCard rows={projectProgressRows} onOpen={(href) => router.push(href)} />
                    </div>
                  </>
                )}
              </section>
            )}

            {/* === 三、项目卡片 === */}
            <section id="projects" style={{ marginBottom: 96, scrollMarginTop: 32 }}>
              <div className="flex items-end justify-between border-b border-line" style={{ marginBottom: 40, paddingBottom: 24 }}>
                <div>
                  <Eyebrow tone="muted" className="mb-2">Projects</Eyebrow>
                  <h2 className="font-serif text-xl text-ink-900 leading-tight">
                    我的项目 <span className="text-sm text-ink-500 font-sans font-normal ml-1">{projects.length} 个</span>
                  </h2>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <Button variant="brand" className={dashboardPrimaryButtonClass} onClick={() => setShowModal(true)} leftIcon={<span className="text-base leading-none">+</span>}>
                    新建项目
                  </Button>
                  <Button variant="secondary" className={dashboardButtonClass} onClick={() => router.push('/projects/new-ppt')} leftIcon={<span className="text-base leading-none">+</span>}>
                    新增 PPT 翻译项目
                  </Button>
                </div>
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
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="brand" className={dashboardPrimaryButtonClass} onClick={() => setShowModal(true)}>创建第一个项目</Button>
                    <Button variant="secondary" className={dashboardButtonClass} onClick={() => router.push('/projects/new-ppt')}>新增 PPT 翻译项目</Button>
                  </div>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-7">
                  {stats.map(s => (
                    <ProjectCard
                      key={s.project.id}
                      s={s}
                      router={router}
                      deleting={deletingProjectId === s.project.id}
                      onDelete={() => deleteProject(s.project)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* === 四、译训库 === */}
            <section style={{ marginBottom: 96 }}>
              <div className="flex items-end justify-between border-b border-line" style={{ marginBottom: 40, paddingBottom: 24 }}>
                <div>
                  <Eyebrow tone="muted" className="mb-2">Translation Practice Lab</Eyebrow>
                  <h2 className="font-serif text-xl text-ink-900 leading-tight">译训库</h2>
                </div>
                <Button size="sm" variant="ghost" className={dashboardButtonClass} onClick={() => router.push('/practice')}>
                  进入题库 →
                </Button>
              </div>

              <PracticeLabEntry overview={practiceOverview} onOpen={() => router.push('/practice')} />
            </section>

            {/* === 五、最近 AI 翻译实验 === */}
            <section id="ai-experiments" style={{ marginBottom: 96, scrollMarginTop: 32 }}>
              <div className="flex items-end justify-between border-b border-line" style={{ marginBottom: 40, paddingBottom: 24 }}>
                <div>
                  <Eyebrow tone="muted" className="mb-2">AI experiments</Eyebrow>
                  <h2 className="font-serif text-xl text-ink-900 leading-tight">最近 AI 翻译实验</h2>
                </div>
                <span className="text-xs text-ink-500">{experiments.length > 0 ? '最近 5 条' : '实验记录'}</span>
              </div>

              {experiments.length > 0 ? (
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
                      <div className="text-center text-sm text-ink-700 whitespace-nowrap">
                        {e.modelCount} 个
                      </div>
                      <div className="text-center text-sm text-ink-700 whitespace-nowrap">
                        {e.tempRange}
                      </div>
                      <div className="text-center">
                        <span className={cn(
                          'text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap uppercase tracking-wider',
                          e.status === 'success' && 'bg-emerald-50/60 text-emerald-800 border border-emerald-100',
                          e.status === 'failed'  && 'bg-rose-50/60 text-rose-800 border border-rose-100',
                          e.status === 'running' && 'bg-amber-50/60 text-amber-800 border border-amber-100',
                        )}>
                          {e.status === 'success' ? '已完成' : e.status === 'failed' ? '有失败' : '进行中'}
                        </span>
                      </div>
                      <div className="text-right">
                        <Button size="sm" variant="ghost" className={dashboardButtonClass} onClick={() => router.push(`/documents/${e.docId}/parallel`)}>
                          查看 →
                        </Button>
                      </div>
                    </div>
                  ))}
                </Card>
              ) : (
                <Card padding="md" variant="surface">
                  <p className="text-sm text-ink-600 leading-relaxed">
                    当前还没有可展示的 AI 翻译实验。进入已有项目文档后，可以开启多模型翻译实验。
                  </p>
                </Card>
              )}
            </section>

            {/* === 六、论文写作工坊 === */}
            <section style={{ marginBottom: 96 }}>
              <div className="flex items-end justify-between border-b border-line" style={{ marginBottom: 40, paddingBottom: 24 }}>
                <div>
                  <Eyebrow tone="muted" className="mb-2">Academic Writing</Eyebrow>
                  <h2 className="font-serif text-xl text-ink-900 leading-tight">论文写作工坊</h2>
                </div>
                <Button size="sm" variant="ghost" className={dashboardButtonClass} onClick={() => router.push('/writing')}>
                  进入工坊 →
                </Button>
              </div>

              <Card padding="md" variant="surface" className="mb-6">
                <p className="text-sm text-ink-600 leading-relaxed max-w-3xl">
                  用于创建中文论文和英文论文，选择预设格式模板，按章节写作，并一键导出符合模板格式的 Word 文档。
                </p>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card padding="md" interactive onClick={() => router.push('/writing')} className="h-full flex flex-col">
                  <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center mb-5">
                    <span className="text-brand font-serif text-xl">新</span>
                  </div>
                  <h3 className="font-serif text-xl text-ink-900 mb-2">新建论文</h3>
                  <p className="text-sm text-ink-600 leading-relaxed mb-7 flex-1">
                    选择中文或英文论文模板，快速生成论文结构。
                  </p>
                  <div className="mt-auto">
                  <Button size="sm" variant="secondary" className={dashboardButtonClass} onClick={(e) => { e.stopPropagation(); router.push('/writing') }}>
                    新建论文
                  </Button>
                  </div>
                </Card>

                <Card padding="md" interactive onClick={() => router.push('/writing')} className="h-full flex flex-col">
                  <div className="w-10 h-10 bg-canvas rounded-xl flex items-center justify-center mb-5">
                    <span className="text-ink-700 font-serif text-xl">稿</span>
                  </div>
                  <h3 className="font-serif text-xl text-ink-900 mb-2">我的论文</h3>
                  <p className="text-sm text-ink-600 leading-relaxed mb-7 flex-1">
                    继续编辑已有论文项目，检查格式并导出。
                  </p>
                  <div className="mt-auto">
                  <Button size="sm" variant="secondary" className={dashboardButtonClass} onClick={(e) => { e.stopPropagation(); router.push('/writing') }}>
                    查看论文
                  </Button>
                  </div>
                </Card>

                <Card padding="md" interactive onClick={() => router.push('/writing')} className="h-full flex flex-col">
                  <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center mb-5">
                    <span className="text-brand font-serif text-xl">式</span>
                  </div>
                  <h3 className="font-serif text-xl text-ink-900 mb-2">模板库</h3>
                  <p className="text-sm text-ink-600 leading-relaxed mb-7 flex-1">
                    查看中文论文、英文论文、开题报告、翻译实践报告、APA 等预设模板。
                  </p>
                  <div className="mt-auto">
                  <Button size="sm" variant="secondary" className={dashboardButtonClass} onClick={(e) => { e.stopPropagation(); router.push('/writing/templates') }}>
                    查看模板
                  </Button>
                  </div>
                </Card>
              </div>
            </section>

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

function CountNumber({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    let frame = 0
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      frame = requestAnimationFrame(() => setDisplay(value))
      return () => cancelAnimationFrame(frame)
    }
    const start = performance.now()
    const from = 0
    const duration = 520
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(from + (value - from) * eased))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return <span className={className}>{display}</span>
}

function AnimatedProgressBar({ pct, color, className }: {
  pct: number
  color: string
  className?: string
}) {
  const [width, setWidth] = useState(0)
  const safePct = Math.max(0, Math.min(100, pct))

  useEffect(() => {
    const frame = requestAnimationFrame(() => setWidth(safePct))
    return () => cancelAnimationFrame(frame)
  }, [safePct])

  return (
    <div className={cn('h-1.5 bg-canvas rounded-full overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-500 ease-out', color)}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

function TodoStatusCard({ summary }: { summary: StatusSummary }) {
  const meta = todoMeta[summary.kind]
  return (
    <div className={cn('rounded-2xl border transition-all duration-300', meta.softCls)} style={{ padding: '18px 20px' }}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] uppercase tracking-wider font-medium text-ink-600">{meta.label}</p>
        <span className={cn('w-2 h-2 rounded-full mt-1.5', meta.barCls)} />
      </div>
      <p className={cn('font-serif text-3xl mt-4 leading-none', meta.textCls)}>
        <CountNumber value={summary.total} />
      </p>
      <div className="flex items-center justify-between text-[11px] text-ink-500 mt-4 mb-2">
        <span>占全部</span>
        <span className="text-ink-700">{summary.percent}%</span>
      </div>
      <AnimatedProgressBar pct={summary.percent} color={meta.barCls} />
    </div>
  )
}

function ProjectProgressCard({ rows, onOpen }: {
  rows: ProjectProgressRow[]
  onOpen: (href: string) => void
}) {
  return (
    <Card padding="md" className="h-full">
      <Card.Header>
        <div>
          <Eyebrow tone="muted" className="mb-1">Project progress</Eyebrow>
          <h3 className="font-serif text-lg text-ink-900">项目进度</h3>
        </div>
        <span className="text-[11px] text-ink-500">前 {rows.length} 项</span>
      </Card.Header>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-500 py-6 text-center">暂无需要推进的项目。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {rows.map(row => (
            <div key={row.id} className="rounded-xl border border-line bg-surface/60" style={{ padding: '16px' }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-ink-900 font-medium truncate">{row.title}</p>
                  <p className="text-xs text-ink-500 mt-1 truncate">{row.subtitle}</p>
                </div>
                <div className="flex items-center gap-3 sm:justify-end">
                  <span className="text-xs text-ink-600 whitespace-nowrap">待处理 {row.pendingCount} 条</span>
                  <Button size="sm" variant="ghost" className={dashboardButtonClass} onClick={() => onOpen(row.href)}>
                    {row.action} →
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <MiniProgressRow label="翻译" pct={row.translationPct} color="bg-amber-200" />
                <MiniProgressRow label="审校" pct={row.reviewPct} color="bg-blue-200" />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function PriorityTasksCard({ tasks, projects, onOpen }: {
  tasks: PriorityTodo[]
  projects: Project[]
  onOpen: (href: string) => void
}) {
  return (
    <Card padding="md" className="h-full">
      <Card.Header>
        <div>
          <Eyebrow tone="muted" className="mb-1">Priority tasks</Eyebrow>
          <h3 className="font-serif text-lg text-ink-900">优先处理任务</h3>
        </div>
        <span className="text-[11px] text-ink-500">前 {tasks.length} 项</span>
      </Card.Header>
      {tasks.length === 0 ? (
        <p className="text-sm text-ink-500 py-6 text-center">暂无需要优先处理的任务。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {tasks.map((task, index) => {
            const status = todoMeta[task.kind]
            const priority = priorityMeta[task.priority]
            return (
              <div
                key={`${task.kind}-${task.projectId}-${task.documentId ?? ''}-${index}`}
                className="rounded-xl border border-line bg-surface/60 transition-all duration-200 hover:bg-surface"
                style={{ padding: '16px' }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn('inline-flex h-6 min-w-6 items-center justify-center rounded-md border text-[11px] font-medium', priority.cls)}>
                        {priority.label}
                      </span>
                      <span className="text-xs text-ink-600 truncate">
                        {status.label} · {task.count} 条
                      </span>
                    </div>
                    <p className="text-sm text-ink-900 font-medium truncate">{taskSubject(task)}</p>
                    <p className="text-xs text-ink-500 mt-1 truncate">{task.suggestion}</p>
                  </div>
                  <Button size="sm" variant="ghost" className={dashboardButtonClass} onClick={() => onOpen(todoHref(task, projects))}>
                    {status.action} →
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function TodoEmptyState({ onCreateProject, onOpenExperiment }: {
  onCreateProject: () => void
  onOpenExperiment: () => void
}) {
  return (
    <Card padding="lg" variant="surface" className="text-center">
      <div className="w-12 h-12 bg-white border border-line rounded-2xl flex items-center justify-center mx-auto mb-5">
        <span className="font-serif text-brand text-xl">译</span>
      </div>
      <h3 className="font-serif text-xl text-ink-900 mb-3">今天没有待办任务</h3>
      <p className="text-sm text-ink-600 leading-relaxed max-w-lg mx-auto mb-7">
        你可以继续完善术语库、创建新的翻译项目，或开启 AI 翻译实验。
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="brand" className={dashboardPrimaryButtonClass} onClick={onCreateProject}>新建项目</Button>
        <Button variant="secondary" className={dashboardButtonClass} onClick={onOpenExperiment}>开启 AI 翻译实验</Button>
      </div>
    </Card>
  )
}

function MiniProgressRow({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1.5">
        <span className="text-ink-600">{label}</span>
        <span className="text-ink-700">{pct}%</span>
      </div>
      <AnimatedProgressBar pct={pct} color={color} />
    </div>
  )
}

function PracticeLabEntry({ overview, onOpen }: {
  overview: PracticeOverview
  onOpen: () => void
}) {
  const metrics = [
    { label: '已练篇章', value: overview.practicedItems, note: '篇' },
    { label: '今日待复习', value: overview.reviewDue, note: '项' },
    { label: '表达卡片', value: overview.expressionCards, note: '张' },
    { label: '高频问题', value: overview.frequentIssueCount, note: overview.frequentIssueType },
  ]

  return (
    <Card padding="lg" interactive onClick={onOpen} className="overflow-hidden">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(460px,0.95fr)] gap-8 items-center">
        <div>
          <div className="w-11 h-11 rounded-2xl border border-brand-200 bg-brand-50 flex items-center justify-center mb-5">
            <span className="font-serif text-brand text-xl">训</span>
          </div>
          <h3 className="font-serif text-2xl text-ink-900 mb-3">译训库</h3>
          <p className="text-sm text-ink-600 leading-relaxed max-w-2xl mb-6">
            整理 CATTI、MTI、课程和商务翻译练习，支持原文、我的译文、参考译文对比，问题标记，表达积累和间隔复习。
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="brand" className={dashboardPrimaryButtonClass} onClick={onOpen}>开始练习</Button>
            <Button variant="secondary" className={dashboardButtonClass} onClick={onOpen}>进入题库</Button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {metrics.map(metric => (
            <div key={metric.label} className="rounded-2xl border border-line bg-surface/70" style={{ padding: '20px' }}>
              <p className="text-xs text-ink-500 mb-3">{metric.label}</p>
              <div className="flex items-end gap-2">
                <span className="font-serif text-3xl text-ink-900 leading-none">{metric.value}</span>
                <span className="text-xs text-ink-600 truncate pb-0.5">{metric.note}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

// ====== 项目卡片：带进度条、文档数、成员数、操作 ======
function ProjectCard({ s, router, deleting, onDelete }: {
  s: ProjectStats
  router: ReturnType<typeof useRouter>
  deleting: boolean
  onDelete: () => void
}) {
  const { project, total, translated, reviewed, locked, docs, memberCount, langPair, lastUpdated } = s
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0
  const pptProject = isPptProject(project)
  const projectHref = pptProject ? `/projects/${project.id}/ppt` : `/projects/${project.id}`
  const glossaryHref = `/projects/${project.id}/glossary`
  const experimentHref = docs.length > 0 ? `/documents/${docs[0].id}/parallel` : ''
  const slideCount = pptProject
    ? new Set(s.segments.map(seg => {
        const value = seg.metadata?.slide_number
        return typeof value === 'number' || typeof value === 'string' ? String(value) : ''
      }).filter(Boolean)).size
    : 0
  const prefetchProjectRoutes = () => {
    router.prefetch(projectHref)
    if (!pptProject) {
      router.prefetch(glossaryHref)
      if (experimentHref) router.prefetch(experimentHref)
    }
  }

  return (
    <article className="group bg-white border border-line rounded-2xl hover:border-brand/40 hover:shadow-[var(--shadow-card-hover)] transition-all flex flex-col"
      onMouseEnter={prefetchProjectRoutes}
      onFocus={prefetchProjectRoutes}
      style={{ padding: '32px' }}>

      {/* 标题 + 语言对 badge */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="font-serif text-lg text-ink-900 leading-tight tracking-tight line-clamp-1 flex-1 min-w-0">
          {project.name}
        </h3>
        <div className="flex flex-col items-end gap-1">
          {pptProject && (
            <span className="text-[10px] font-medium text-brand bg-brand-50 border border-brand-200 rounded-md whitespace-nowrap"
              style={{ paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}>
              PPT 分页翻译
            </span>
          )}
          {langPair && (
            <span className="text-[10px] text-ink-600 bg-canvas border border-line rounded-md whitespace-nowrap"
              style={{ paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}>
              {langPair}
            </span>
          )}
        </div>
      </div>
      <p className="text-xs text-ink-600 line-clamp-2 min-h-[32px] mb-5 leading-relaxed">
        {displayProjectDescription(project)}
      </p>

      {/* 三档进度 */}
      <div className="space-y-3 mb-5">
        <ProgressRow label="翻译" value={translated} total={total} pct={pct(translated)} color="bg-amber-200" />
        <ProgressRow label="审校" value={reviewed}   total={total} pct={pct(reviewed)}   color="bg-blue-200" />
        <ProgressRow label="锁定" value={locked}     total={total} pct={pct(locked)}     color="bg-emerald-200" />
      </div>

      {/* 元信息 */}
      <div className="flex items-center gap-3 text-[11px] text-ink-600 mb-5">
        <span className="inline-flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          {pptProject ? `${slideCount} 页 Slide` : `${docs.length} 个文档`}
        </span>
        <span className="text-ink-300">·</span>
        {pptProject && (
          <>
            <span className="inline-flex items-center gap-1">
              {total} 条目
            </span>
            <span className="text-ink-300">·</span>
          </>
        )}
        <span className="inline-flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          {memberCount} 人
        </span>
        <span className="text-ink-300">·</span>
        <span>
          {lastUpdated ? new Date(lastUpdated).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '—'}
        </span>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 mt-auto border-t border-line" style={{ paddingTop: 20 }}>
        <Button size="sm" variant="brand" className={dashboardPrimaryButtonClass} onClick={() => router.push(projectHref)}>
          进入项目
        </Button>
        {!pptProject && (
          <Button size="sm" variant="ghost" className={dashboardButtonClass} onClick={() => router.push(glossaryHref)}>
            术语库
          </Button>
        )}
        {!pptProject && docs.length > 0 && (
          <Button size="sm" variant="ghost" className={dashboardButtonClass} onClick={() => router.push(experimentHref)}>
            实验
          </Button>
        )}
        {s.myRole === 'manager' && (
          <Button size="sm" variant="danger" className={dashboardDangerButtonClass} onClick={onDelete} loading={deleting} disabled={deleting}>
            删除
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
        <span className="text-ink-700">
          {value}/{total} · {pct}%
        </span>
      </div>
      <div className="h-1.5 bg-canvas rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
