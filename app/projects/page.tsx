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

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const loadProjects = useCallback(async (userId: string) => {
    const { data: memberships } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', userId)
    const ids = Array.from(new Set((memberships ?? []).map(row => row.project_id as string).filter(Boolean)))
    if (ids.length === 0) {
      setProjects([])
      setDocuments([])
      setMembers([])
      return
    }

    const [{ data: projectRows }, { data: documentRows }, { data: memberRows }] = await Promise.all([
      supabase.from('projects').select('*').in('id', ids).order('created_at', { ascending: false }),
      supabase.from('documents').select('id, project_id, title, source_language, target_language, updated_at, created_at').in('project_id', ids),
      supabase.from('project_members').select('project_id, user_id, role').in('project_id', ids),
    ])
    setProjects((projectRows ?? []) as Project[])
    setDocuments((documentRows ?? []) as DocumentRow[])
    setMembers((memberRows ?? []) as MemberRow[])
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push('/')
        return
      }
      await loadProjects(user.id)
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
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {projects.map(project => {
                  const docs = documents.filter(doc => doc.project_id === project.id)
                  const latest = docs.map(doc => doc.updated_at ?? doc.created_at).filter(Boolean).sort().pop()
                  const firstDoc = docs[0]
                  const langPair = firstDoc
                    ? `${langNames[firstDoc.source_language] ?? firstDoc.source_language} -> ${langNames[firstDoc.target_language] ?? firstDoc.target_language}`
                    : '待添加文档'
                  return (
                    <Card key={project.id} padding="md" as="article" className="h-full flex flex-col">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <h2 className="font-serif text-xl text-ink-900 leading-tight">{project.name}</h2>
                        {isPptProject(project) && <span className="rounded-md border border-brand-200 bg-brand-50 px-2 py-1 text-[10px] font-medium text-brand whitespace-nowrap">PPT</span>}
                      </div>
                      <p className="text-sm text-ink-600 leading-relaxed line-clamp-3 mb-6">{displayDescription(project)}</p>
                      <div className="grid grid-cols-2 gap-3 text-xs text-ink-600 mb-6">
                        <div className="rounded-xl bg-canvas px-3 py-2">{docs.length} 个文档</div>
                        <div className="rounded-xl bg-canvas px-3 py-2">{members.filter(member => member.project_id === project.id).length} 位成员</div>
                        <div className="rounded-xl bg-canvas px-3 py-2 col-span-2">{langPair}</div>
                      </div>
                      <p className="text-[11px] text-ink-500 mb-5">
                        最近更新：{latest ? new Date(latest).toLocaleDateString('zh-CN') : '暂无文档更新'}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-auto border-t border-line pt-5">
                        <Button size="sm" variant="brand" onClick={() => router.push(projectHref(project))}>进入项目</Button>
                        {!isPptProject(project) && <Button size="sm" variant="ghost" onClick={() => router.push(`/projects/${project.id}/glossary`)}>术语库</Button>}
                        {!isPptProject(project) && firstDoc && <Button size="sm" variant="ghost" onClick={() => router.push(`/documents/${firstDoc.id}/parallel`)}>实验</Button>}
                      </div>
                    </Card>
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
