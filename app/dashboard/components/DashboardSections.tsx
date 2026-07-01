'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { cn } from '@/components/ui/cn'
import { DashboardSection } from './DashboardSection'

type Role = 'manager' | 'translator' | 'reviewer'
type TodoKind = 'translate' | 'review' | 'confirm' | 'export' | 'experiment'
type TodoPriority = 'high' | 'medium' | 'low'

type Project = {
  id: string
  name: string
  description: string | null
  created_at: string
  type?: string | null
  metadata?: Record<string, unknown> | null
}

type DocumentRow = {
  id: string
  project_id: string
  title: string
  source_language: string
  target_language: string
  updated_at?: string | null
  created_at: string
  document_type?: string | null
}

type SegmentRow = {
  id: string
  document_id: string
  status?: string | null
  metadata?: Record<string, unknown> | null
  [key: string]: unknown
}

type PracticeOverview = {
  practicedItems: number
  reviewDue: number
  expressionCards: number
  frequentIssueType: string
  frequentIssueCount: number
}

type ProjectStats = {
  project: Project
  docs: DocumentRow[]
  segments: SegmentRow[]
  myRole: Role | null
  memberCount: number
  langPair: string | null
  total: number
  translated: number
  reviewed: number
  locked: number
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

type Experiment = {
  docId: string
  docTitle: string
  projectId: string
  projectName: string
  modelCount: number
  tempRange: string
  status: string
  lastUpdated: string
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

const priorityMeta: Record<TodoPriority, { label: string; cls: string }> = {
  high: { label: '高', cls: 'bg-rose-50/60 text-rose-800 border-rose-100' },
  medium: { label: '中', cls: 'bg-amber-50/60 text-amber-800 border-amber-100' },
  low: { label: '低', cls: 'bg-canvas text-ink-600 border-line' },
}

const dashboardPrimaryButtonClass = 'dashboard-action-primary'
const dashboardButtonClass = 'dashboard-action'
const dashboardDangerButtonClass = 'dashboard-action-danger'
const PPT_FALLBACK_PREFIX = '__PPT_SLIDE_TRANSLATION_META__'
type DashboardLinkVariant = 'brand' | 'secondary' | 'ghost'

const dashboardLinkVariantClass: Record<DashboardLinkVariant, string> = {
  brand: 'bg-brand text-white hover:bg-brand-600 active:bg-brand-700',
  secondary: 'bg-white text-ink-900 border-2 border-ink-900 hover:bg-ink-900 hover:text-white',
  ghost: 'bg-transparent text-ink-500 hover:bg-canvas hover:text-ink-900',
}

const dashboardLinkStyle = { paddingLeft: 12, paddingRight: 12, paddingTop: 7, paddingBottom: 7 }

function DashboardLink({
  href,
  children,
  variant = 'ghost',
  className,
}: {
  href: string
  children: ReactNode
  variant?: DashboardLinkVariant
  className?: string
}) {
  return (
    <Link
      href={href}
      style={dashboardLinkStyle}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors',
        dashboardLinkVariantClass[variant],
        className
      )}
    >
      {children}
    </Link>
  )
}

function DashboardLinkVisual({
  children,
  variant = 'ghost',
  className,
}: {
  children: ReactNode
  variant?: DashboardLinkVariant
  className?: string
}) {
  return (
    <span
      style={dashboardLinkStyle}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors',
        dashboardLinkVariantClass[variant],
        className
      )}
    >
      {children}
    </span>
  )
}

function isPptProject(project: Project): boolean {
  return project.type === 'ppt_slide_translation'
    || Boolean(project.description?.startsWith(PPT_FALLBACK_PREFIX))
}

function displayProjectDescription(project: Project): string {
  const description = project.description || ''
  if (!description.startsWith(PPT_FALLBACK_PREFIX)) return description || '暂无描述'
  return description.split('\n').slice(1).join('\n').trim() || '暂无描述'
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

function taskSubject(todo: Todo): string {
  return todo.documentTitle ? `${todo.projectName} · ${todo.documentTitle}` : todo.projectName
}

export function DashboardHeader({
  dateLabel,
  greeting,
  userName,
  projectCount,
  todoCount,
}: {
  dateLabel: string
  greeting: string
  userName: string
  projectCount: number
  todoCount: number
}) {
  return (
    <header className="mb-14 pb-10 border-b border-line">
      <Eyebrow tone="muted" className="mb-2.5">
        {dateLabel}
      </Eyebrow>
      <h1 className="font-serif text-3xl lg:text-4xl text-ink-900 tracking-tight leading-tight">
        {greeting}，<span className="text-brand">{userName}</span>
      </h1>
      <p className="text-ink-600 text-[15px] mt-3 leading-relaxed">
        {projectCount === 0
          ? '欢迎来到译境工作台。新建一个项目，开始小组协作或 AI 翻译实验。'
          : (<>当前有 <span className="text-ink-900 font-semibold">{projectCount}</span> 个翻译项目，
             <span className="text-ink-900 font-semibold ml-1">{todoCount}</span> 项待办任务。
             继续未完成的工作，或开启新的 AI 翻译实验。</>)}
      </p>
    </header>
  )
}

export function TodoOverviewSection({
  projectCount,
  todoCount,
  todoListCount,
  todoStatusSummaries,
  priorityTodos,
  projects,
  projectProgressRows,
  onCreateProject,
  experimentHref,
}: {
  projectCount: number
  todoCount: number
  todoListCount: number
  todoStatusSummaries: StatusSummary[]
  priorityTodos: PriorityTodo[]
  projects: Project[]
  projectProgressRows: ProjectProgressRow[]
  onCreateProject: () => void
  experimentHref: string
}) {
  if (projectCount === 0) return null

  return (
    <DashboardSection
      eyebrow="My todos"
      title="我的待办"
      action={
        <span className="text-sm text-ink-600 whitespace-nowrap">
          {todoCount === 0 ? '共 0 项任务，0 条段/文档' : `共 ${todoListCount} 项任务，${todoCount} 条段/文档`}
        </span>
      }
    >
      {todoCount === 0 ? (
        <TodoEmptyState onCreateProject={onCreateProject} experimentHref={experimentHref} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4" style={{ marginBottom: 28 }}>
            {todoStatusSummaries.map(summary => (
              <TodoStatusCard key={summary.kind} summary={summary} />
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)] gap-6" style={{ marginBottom: 28 }}>
            <PriorityTasksCard tasks={priorityTodos} projects={projects} />
            <ProjectProgressCard rows={projectProgressRows} />
          </div>
        </>
      )}
    </DashboardSection>
  )
}

export function ProjectsSection({
  stats,
  projectCount,
  deletingProjectId,
  onCreateProject,
  onPrefetch,
  onDelete,
}: {
  stats: ProjectStats[]
  projectCount: number
  deletingProjectId: string | null
  onCreateProject: () => void
  onPrefetch: (href: string) => void
  onDelete: (project: Project) => void
}) {
  return (
    <DashboardSection
      id="projects"
      eyebrow="Projects"
      title={<>我的项目 <span className="text-sm text-ink-500 font-sans font-normal ml-1">{projectCount} 个</span></>}
      action={
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button variant="brand" className={dashboardPrimaryButtonClass} onClick={onCreateProject} leftIcon={<span className="text-base leading-none">+</span>}>
            新建项目
          </Button>
          <DashboardLink href="/projects/new-ppt" variant="secondary" className={dashboardButtonClass}>
            <span className="text-base leading-none">+</span>
            新增 PPT 翻译项目
          </DashboardLink>
        </div>
      }
    >
      {projectCount === 0 ? (
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
            <Button variant="brand" className={dashboardPrimaryButtonClass} onClick={onCreateProject}>创建第一个项目</Button>
            <DashboardLink href="/projects/new-ppt" variant="secondary" className={dashboardButtonClass}>新增 PPT 翻译项目</DashboardLink>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-7">
          {stats.map(s => (
            <ProjectCard
              key={s.project.id}
              s={s}
              deleting={deletingProjectId === s.project.id}
              onPrefetch={onPrefetch}
              onDelete={() => onDelete(s.project)}
            />
          ))}
        </div>
      )}
    </DashboardSection>
  )
}

export function PracticeEntrySection({
  overview,
}: {
  overview: PracticeOverview
}) {
  return (
    <DashboardSection
      eyebrow="Translation Practice Lab"
      title="译训库"
      action={
        <DashboardLink href="/practice" variant="ghost" className={dashboardButtonClass}>
          进入题库 →
        </DashboardLink>
      }
    >
      <PracticeLabEntry overview={overview} />
    </DashboardSection>
  )
}

export function RecentExperimentsSection({
  experiments,
}: {
  experiments: Experiment[]
}) {
  return (
    <DashboardSection
      id="ai-experiments"
      eyebrow="AI experiments"
      title="最近 AI 翻译实验"
      action={
        <span className="text-xs text-ink-500">{experiments.length > 0 ? '最近 5 条' : '实验记录'}</span>
      }
    >
      {experiments.length > 0 ? (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="grid min-w-[720px] grid-cols-[1fr_auto_auto_auto_auto] gap-5 bg-canvas/60 border-b border-line text-[11px] uppercase tracking-wider text-ink-500 font-medium"
              style={{ paddingLeft: 42, paddingRight: 28, paddingTop: 16, paddingBottom: 16 }}>
              <div>实验 / 项目 · 文档</div>
              <div className="text-center">模型</div>
              <div className="text-center">Temperature</div>
              <div className="text-center">状态</div>
              <div className="text-right">操作</div>
            </div>
            {experiments.map((e, i) => (
              <div key={e.docId}
                className={cn('grid min-w-[720px] grid-cols-[1fr_auto_auto_auto_auto] gap-5 items-center', i > 0 && 'border-t border-line')}
                style={{ paddingLeft: 42, paddingRight: 28, paddingTop: 20, paddingBottom: 20 }}>
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
                  <DashboardLink href={`/documents/${e.docId}/parallel`} variant="ghost" className={dashboardButtonClass}>
                    查看 →
                  </DashboardLink>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card padding="md" variant="surface">
          <p className="text-sm text-ink-600 leading-relaxed">
            当前还没有可展示的 AI 翻译实验。进入已有项目文档后，可以开启多模型翻译实验。
          </p>
        </Card>
      )}
    </DashboardSection>
  )
}

export function WritingEntrySection() {
  return (
    <DashboardSection
      eyebrow="Academic Writing"
      title="论文写作工坊"
      action={
        <DashboardLink href="/writing" variant="ghost" className={dashboardButtonClass}>
          进入工坊 →
        </DashboardLink>
      }
    >
      <Card padding="md" variant="surface" className="mb-6">
        <p className="text-sm text-ink-600 leading-relaxed max-w-3xl">
          用于创建中文论文和英文论文，选择预设格式模板，按章节写作，并一键导出符合模板格式的 Word 文档。
        </p>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/writing" className="block h-full">
          <Card padding="md" interactive className="h-full flex flex-col">
            <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center mb-5">
              <span className="text-brand font-serif text-xl">新</span>
            </div>
            <h3 className="font-serif text-xl text-ink-900 mb-2">新建论文</h3>
            <p className="text-sm text-ink-600 leading-relaxed mb-7 flex-1">
              选择中文或英文论文模板，快速生成论文结构。
            </p>
            <div className="mt-auto">
              <DashboardLinkVisual variant="secondary" className={dashboardButtonClass}>
              新建论文
              </DashboardLinkVisual>
            </div>
          </Card>
        </Link>

        <Link href="/writing" className="block h-full">
          <Card padding="md" interactive className="h-full flex flex-col">
            <div className="w-10 h-10 bg-canvas rounded-xl flex items-center justify-center mb-5">
              <span className="text-ink-700 font-serif text-xl">稿</span>
            </div>
            <h3 className="font-serif text-xl text-ink-900 mb-2">我的论文</h3>
            <p className="text-sm text-ink-600 leading-relaxed mb-7 flex-1">
              继续编辑已有论文项目，检查格式并导出。
            </p>
            <div className="mt-auto">
              <DashboardLinkVisual variant="secondary" className={dashboardButtonClass}>
              查看论文
              </DashboardLinkVisual>
            </div>
          </Card>
        </Link>

        <Link href="/writing/templates" className="block h-full">
          <Card padding="md" interactive className="h-full flex flex-col">
            <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center mb-5">
              <span className="text-brand font-serif text-xl">式</span>
            </div>
            <h3 className="font-serif text-xl text-ink-900 mb-2">模板库</h3>
            <p className="text-sm text-ink-600 leading-relaxed mb-7 flex-1">
              查看中文论文、英文论文、开题报告、翻译实践报告、APA 等预设模板。
            </p>
            <div className="mt-auto">
              <DashboardLinkVisual variant="secondary" className={dashboardButtonClass}>
              查看模板
              </DashboardLinkVisual>
            </div>
          </Card>
        </Link>
      </div>
    </DashboardSection>
  )
}

export function KnowledgeEntrySection() {
  return (
    <DashboardSection
      eyebrow="Reading & Research"
      title="阅读与前沿"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/frontier" className="block h-full">
          <Card padding="md" interactive className="h-full flex flex-col">
            <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center mb-5">
              <span className="text-brand font-serif text-xl">前</span>
            </div>
            <h3 className="font-serif text-xl text-ink-900 mb-2">前沿文献</h3>
            <p className="text-sm text-ink-600 leading-relaxed mb-7 flex-1">
              跟踪翻译、语言、AI 与学术研究方向的前沿文献，整理阅读线索和研究素材。
            </p>
            <div className="mt-auto">
              <DashboardLinkVisual variant="secondary" className={dashboardButtonClass}>
              进入前沿文献
              </DashboardLinkVisual>
            </div>
          </Card>
        </Link>

        <Link href="/reading" className="block h-full">
          <Card padding="md" interactive className="h-full flex flex-col">
            <div className="w-10 h-10 bg-canvas rounded-xl flex items-center justify-center mb-5">
              <span className="text-ink-700 font-serif text-xl">读</span>
            </div>
            <h3 className="font-serif text-xl text-ink-900 mb-2">精读室</h3>
            <p className="text-sm text-ink-600 leading-relaxed mb-7 flex-1">
              进入长文精读和阅读笔记空间，沉淀原文理解、术语、论证结构和表达积累。
            </p>
            <div className="mt-auto">
              <DashboardLinkVisual variant="secondary" className={dashboardButtonClass}>
              进入精读室
              </DashboardLinkVisual>
            </div>
          </Card>
        </Link>
      </div>
    </DashboardSection>
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
  const visiblePct = safePct > 0 ? Math.max(safePct, 2) : 0

  useEffect(() => {
    const frame = requestAnimationFrame(() => setWidth(visiblePct))
    return () => cancelAnimationFrame(frame)
  }, [visiblePct])

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

function ProjectProgressCard({ rows }: {
  rows: ProjectProgressRow[]
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
                  <DashboardLink href={row.href} variant="ghost" className={dashboardButtonClass}>
                    {row.action} →
                  </DashboardLink>
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

function PriorityTasksCard({ tasks, projects }: {
  tasks: PriorityTodo[]
  projects: Project[]
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
                  <DashboardLink href={todoHref(task, projects)} variant="ghost" className={dashboardButtonClass}>
                    {status.action} →
                  </DashboardLink>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function TodoEmptyState({ onCreateProject, experimentHref }: {
  onCreateProject: () => void
  experimentHref: string
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
        <DashboardLink href={experimentHref} variant="secondary" className={dashboardButtonClass}>开启 AI 翻译实验</DashboardLink>
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

function PracticeLabEntry({ overview }: {
  overview: PracticeOverview
}) {
  const metrics = [
    { label: '已练篇章', value: overview.practicedItems, note: '篇', style: { backgroundColor: 'rgb(255 251 235 / 0.62)', borderColor: 'rgb(254 243 199)' }, valueCls: 'text-amber-800' },
    { label: '今日待复习', value: overview.reviewDue, note: '项', style: { backgroundColor: 'rgb(239 246 255 / 0.58)', borderColor: 'rgb(219 234 254)' }, valueCls: 'text-blue-800' },
    { label: '表达卡片', value: overview.expressionCards, note: '张', style: { backgroundColor: 'rgb(245 243 255 / 0.58)', borderColor: 'rgb(237 233 254)' }, valueCls: 'text-violet-800' },
    { label: '高频问题', value: overview.frequentIssueCount, note: overview.frequentIssueType, style: { backgroundColor: 'rgb(236 253 245 / 0.58)', borderColor: 'rgb(209 250 229)' }, valueCls: 'text-emerald-800' },
  ]

  return (
    <Link href="/practice" className="block">
      <Card padding="lg" interactive className="overflow-hidden">
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
              <DashboardLinkVisual variant="brand" className={dashboardPrimaryButtonClass}>开始练习</DashboardLinkVisual>
              <DashboardLinkVisual variant="secondary" className={dashboardButtonClass}>进入题库</DashboardLinkVisual>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {metrics.map(metric => (
              <div key={metric.label} className="rounded-2xl border transition-all duration-300" style={{ padding: '20px', ...metric.style }}>
                <p className="text-xs text-ink-500 mb-3">{metric.label}</p>
                <div className="flex items-end gap-2">
                  <span className={cn('font-serif text-3xl leading-none', metric.valueCls)}>{metric.value}</span>
                  <span className="text-xs text-ink-600 truncate pb-0.5">{metric.note}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </Link>
  )
}

function ProjectCard({ s, deleting, onPrefetch, onDelete }: {
  s: ProjectStats
  deleting: boolean
  onPrefetch: (href: string) => void
  onDelete: () => void
}) {
  const { project, total, translated, reviewed, locked, docs, memberCount, langPair, lastUpdated } = s
  const pct = (n: number) => {
    if (total <= 0 || n <= 0) return 0
    const raw = (n / total) * 100
    if (raw < 1) return Math.max(0.1, Number(raw.toFixed(1)))
    return Math.round(raw)
  }
  const pptProject = isPptProject(project)
  const projectUrl = pptProject ? `/projects/${project.id}/ppt` : `/projects/${project.id}`
  const glossaryHref = `/projects/${project.id}/glossary`
  const experimentHref = docs.length > 0 ? `/documents/${docs[0].id}/parallel` : ''
  const slideCount = pptProject
    ? new Set(s.segments.map(seg => {
        const value = seg.metadata?.slide_number
        return typeof value === 'number' || typeof value === 'string' ? String(value) : ''
      }).filter(Boolean)).size
    : 0
  const prefetchProjectRoutes = () => {
    onPrefetch(projectUrl)
    if (!pptProject) {
      onPrefetch(glossaryHref)
      if (experimentHref) onPrefetch(experimentHref)
    }
  }

  return (
    <article className="group bg-white border border-line rounded-2xl hover:border-brand/40 hover:shadow-[var(--shadow-card-hover)] transition-all flex flex-col"
      onMouseEnter={prefetchProjectRoutes}
      onFocus={prefetchProjectRoutes}
      style={{ padding: '32px' }}>

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

      <div className="space-y-3 mb-5">
        <ProgressRow label="翻译" value={translated} total={total} pct={pct(translated)} color="bg-amber-200" />
        <ProgressRow label="审校" value={reviewed}   total={total} pct={pct(reviewed)}   color="bg-blue-200" />
        <ProgressRow label="锁定" value={locked}     total={total} pct={pct(locked)}     color="bg-emerald-200" />
      </div>

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

      <div className="flex flex-wrap items-center gap-2 mt-auto border-t border-line" style={{ paddingTop: 20 }}>
        <DashboardLink href={projectUrl} variant="brand" className={dashboardPrimaryButtonClass}>
          进入项目
        </DashboardLink>
        {!pptProject && (
          <DashboardLink href={glossaryHref} variant="ghost" className={dashboardButtonClass}>
            术语库
          </DashboardLink>
        )}
        {!pptProject && docs.length > 0 && (
          <DashboardLink href={experimentHref} variant="ghost" className={dashboardButtonClass}>
            实验
          </DashboardLink>
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
  label: string
  value: number
  total: number
  pct: number
  color: string
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
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: pct > 0 ? `${Math.max(pct, 2)}%` : '0%' }} />
      </div>
    </div>
  )
}
