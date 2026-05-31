'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Input'
import { MainContent } from '@/components/ui/MainContent'
import { PageHeader } from '@/components/ui/PageHeader'
import { apiJSON } from '@/lib/apiFetch'
import { supabase } from '@/lib/supabase'

type Project = {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at?: string | null
  type?: string | null
}

type DocumentRow = {
  id: string
  project_id: string
  title: string
  source_language: string
  target_language: string
  created_at: string
  updated_at?: string | null
}

type MemberRow = {
  project_id: string
  user_id: string
  role: string
}

type SegmentRow = {
  id: string
  document_id: string
  status?: string | null
  target?: string | null
  translator_target?: string | null
  review_target?: string | null
  reviewed_at?: string | null
  metadata?: Record<string, unknown> | null
  [key: string]: unknown
}

const langNames: Record<string, string> = {
  en: '英', zh: '中', ja: '日', ko: '韩', fr: '法', de: '德', es: '西', ru: '俄',
}

const PPT_FALLBACK_PREFIX = '__PPT_SLIDE_TRANSLATION_META__'

function isPptProject(project: Project): boolean {
  return project.type === 'ppt_slide_translation'
    || Boolean(project.description?.startsWith(PPT_FALLBACK_PREFIX))
}

function projectHref(project: Project): string {
  return isPptProject(project) ? `/projects/${project.id}/ppt` : `/projects/${project.id}`
}

function displayDescription(project: Project): string {
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

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [members, setMembers] = useState<MemberRow[]>([])
  const [segments, setSegments] = useState<SegmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const loadProjects = useCallback(async () => {
    setErrorMessage('')
    const { data, error } = await apiJSON<{
      projects: Project[]
      documents: DocumentRow[]
      members: MemberRow[]
    }>('/api/projects')

    if (error || !data) {
      setProjects([])
      setDocuments([])
      setMembers([])
      setSegments([])
      setErrorMessage(error || '项目加载失败')
      return
    }

    const docs = data.documents ?? []
    setProjects(data.projects ?? [])
    setDocuments(docs)
    setMembers(data.members ?? [])

    const docIds = docs.map(doc => doc.id)
    if (docIds.length === 0) {
      setSegments([])
      return
    }

    const segmentRes = await supabase
      .from('segments')
      .select('id, document_id, status, target, translator_target, review_target, reviewed_at, metadata')
      .in('document_id', docIds)

    if (segmentRes.error && /translator_target|review_target|reviewed_at|metadata|schema cache|column/i.test(segmentRes.error.message)) {
      const fallbackRes = await supabase
        .from('segments')
        .select('id, document_id, status, target')
        .in('document_id', docIds)
      setSegments((fallbackRes.data ?? []) as SegmentRow[])
      return
    }

    setSegments((segmentRes.data ?? []) as SegmentRow[])
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user
      if (!user) {
        router.push('/')
        return
      }
      await loadProjects()
      setLoading(false)
    })
  }, [loadProjects, router])

  async function createProject(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    const { data, error } = await apiJSON<{ project: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    })
    setCreating(false)
    if (error || !data?.project) {
      alert('创建失败：' + (error || '未知错误'))
      return
    }
    router.push(`/projects/${data.project.id}`)
  }

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="bg-white rounded-2xl border border-line min-h-[calc(100vh-40px)]">
          <MainContent size="wide">
            <PageHeader
              backHref="/dashboard"
              backLabel="返回工作台"
              eyebrow="Projects"
              title="我的项目"
              description="集中进入翻译项目、术语库和文档实验。"
              actions={
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="brand" onClick={() => setShowModal(true)}>新建项目</Button>
                  <Button variant="secondary" onClick={() => router.push('/projects/new-ppt')}>新增 PPT 翻译项目</Button>
                </div>
              }
            />

            {errorMessage && (
              <Card padding="md" className="mb-5 border-red-200 bg-red-50 text-sm text-red-700">
                项目加载失败：{errorMessage}
              </Card>
            )}

            {loading ? (
              <Card padding="lg" className="text-center text-sm text-ink-500">加载中...</Card>
            ) : projects.length === 0 ? (
              <Card padding="lg" className="text-center py-20">
                <h2 className="font-serif text-xl text-ink-900 mb-3">还没有翻译项目。</h2>
                <p className="text-sm text-ink-600 leading-relaxed max-w-xl mx-auto mb-7">
                  创建一个项目开始文档协作，或先创建 PPT 分页翻译项目。
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Button variant="brand" onClick={() => setShowModal(true)}>创建第一个项目</Button>
                  <Button variant="secondary" onClick={() => router.push('/projects/new-ppt')}>新增 PPT 翻译项目</Button>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-3">
                {projects.map(project => {
                  const docs = documents.filter(doc => doc.project_id === project.id)
                  const docIds = new Set(docs.map(doc => doc.id))
                  const projectSegments = segments.filter(segment => docIds.has(segment.document_id))
                  const memberCount = members.filter(member => member.project_id === project.id).length
                  const latest = docs.map(doc => doc.updated_at ?? doc.created_at).filter(Boolean).sort().pop()
                  const firstDoc = docs[0]
                  const langPair = firstDoc
                    ? `${langNames[firstDoc.source_language] ?? firstDoc.source_language} → ${langNames[firstDoc.target_language] ?? firstDoc.target_language}`
                    : '待添加文档'
                  const total = projectSegments.length
                  const translated = projectSegments.filter(isSegmentTranslated).length
                  const reviewed = projectSegments.filter(isSegmentReviewed).length
                  const locked = projectSegments.filter(segment => segmentStatus(segment) === 'locked').length
                  return (
                    <article
                      key={project.id}
                      className="group flex h-full min-h-[300px] flex-col rounded-2xl border border-line bg-white transition-all hover:border-brand/40 hover:shadow-[var(--shadow-card-hover)]"
                      style={{ padding: 32 }}
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <h2 className="min-w-0 flex-1 font-serif text-xl leading-tight tracking-tight text-ink-900 line-clamp-1">{project.name}</h2>
                        <div className="flex flex-col items-end gap-1">
                          {isPptProject(project) && (
                            <span className="rounded-md border border-brand-200 bg-brand-50 px-2 py-1 text-[10px] font-medium text-brand whitespace-nowrap">PPT 分页翻译</span>
                          )}
                          <span className="rounded-md border border-line bg-canvas px-2 py-1 text-[10px] text-ink-600 whitespace-nowrap">{langPair}</span>
                        </div>
                      </div>
                      <p className="mb-5 min-h-[36px] text-xs leading-relaxed text-ink-600 line-clamp-2">{displayDescription(project)}</p>
                      <div className="mb-5 space-y-3">
                        <ProjectProgress label="翻译" value={translated} total={total} pct={percent(translated, total)} color="bg-amber-200" />
                        <ProjectProgress label="审校" value={reviewed} total={total} pct={percent(reviewed, total)} color="bg-blue-200" />
                        <ProjectProgress label="锁定" value={locked} total={total} pct={percent(locked, total)} color="bg-emerald-200" />
                      </div>
                      <div className="mb-5 flex flex-wrap items-center gap-3 text-[11px] text-ink-600">
                        <span>{docs.length} 个文档</span>
                        <span className="text-ink-300">·</span>
                        <span>{memberCount} 位成员</span>
                        <span className="text-ink-300">·</span>
                        <span>{latest ? new Date(latest).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '暂无更新'}</span>
                      </div>
                      <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-5">
                        <Button size="sm" variant="brand" onClick={() => router.push(projectHref(project))}>进入项目</Button>
                        {!isPptProject(project) && <Button size="sm" variant="ghost" onClick={() => router.push(`/projects/${project.id}/glossary`)}>术语库</Button>}
                        {!isPptProject(project) && firstDoc && <Button size="sm" variant="ghost" onClick={() => router.push(`/documents/${firstDoc.id}/parallel`)}>实验</Button>}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </MainContent>
        </div>
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-[var(--shadow-modal)]" style={{ padding: 48 }}>
            <h2 className="font-serif text-2xl text-ink-900 mb-2 tracking-tight">新建翻译项目</h2>
            <p className="text-ink-600 text-sm mb-7">为新的翻译工作起一个名字。</p>
            <form onSubmit={createProject} className="space-y-5">
              <Input label="项目名称" value={name} onChange={e => setName(e.target.value)} placeholder="例如：联合国可持续发展报告" required />
              <Textarea label="项目描述（可选）" value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="简单描述一下这个项目..." />
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" fullWidth onClick={() => setShowModal(false)} type="button">取消</Button>
                <Button variant="brand" fullWidth type="submit" loading={creating}>{creating ? '创建中...' : '创建项目'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectProgress({ label, value, total, pct, color }: { label: string; value: number; total: number; pct: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-ink-600">{label}</span>
        <span className="text-ink-700">{value}/{total} · {pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-canvas">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
