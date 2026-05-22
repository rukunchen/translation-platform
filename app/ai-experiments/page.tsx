'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { MainContent } from '@/components/ui/MainContent'
import { PageHeader } from '@/components/ui/PageHeader'
import { cn } from '@/components/ui/cn'
import { supabase } from '@/lib/supabase'

type Project = { id: string; name: string }
type DocumentRow = { id: string; project_id: string; title: string }
type ParallelRow = {
  id: string
  document_id: string
  provider: string
  model: string
  temperature: number | null
  status: 'pending' | 'running' | 'success' | 'failed'
  updated_at?: string | null
}

type Experiment = {
  docId: string
  docTitle: string
  projectName: string
  modelCount: number
  tempRange: string
  status: 'success' | 'failed' | 'running'
  lastUpdated: string
}

export default function AiExperimentsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [parallel, setParallel] = useState<ParallelRow[]>([])
  const [loading, setLoading] = useState(true)

  const loadExperiments = useCallback(async (userId: string) => {
    const { data: memberships } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', userId)
    const ids = Array.from(new Set((memberships ?? []).map(row => row.project_id as string).filter(Boolean)))
    if (ids.length === 0) {
      setProjects([])
      setDocuments([])
      setParallel([])
      return
    }

    const [{ data: projectRows }, { data: documentRows }] = await Promise.all([
      supabase.from('projects').select('id, name').in('id', ids),
      supabase.from('documents').select('id, project_id, title').in('project_id', ids),
    ])
    const docs = (documentRows ?? []) as DocumentRow[]
    setProjects((projectRows ?? []) as Project[])
    setDocuments(docs)

    const docIds = docs.map(doc => doc.id)
    if (docIds.length === 0) {
      setParallel([])
      return
    }
    const { data: rows } = await supabase
      .from('parallel_translations')
      .select('id, document_id, provider, model, temperature, status, updated_at')
      .in('document_id', docIds)
      .neq('provider', '__config__')
      .order('updated_at', { ascending: false })
      .limit(60)
    setParallel((rows ?? []) as ParallelRow[])
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push('/')
        return
      }
      await loadExperiments(user.id)
      setLoading(false)
    })
  }, [loadExperiments, router])

  const experiments: Experiment[] = useMemo(() => {
    const groups = new Map<string, ParallelRow[]>()
    for (const row of parallel) {
      const list = groups.get(row.document_id) ?? []
      list.push(row)
      groups.set(row.document_id, list)
    }

    const rows: Experiment[] = []
    for (const [docId, group] of groups) {
      const doc = documents.find(item => item.id === docId)
      if (!doc) continue
      const project = projects.find(item => item.id === doc.project_id)
      if (!project) continue
      const temperatures = group.map(item => Number(item.temperature ?? 0))
      const min = Math.min(...temperatures)
      const max = Math.max(...temperatures)
      const statusCounts = group.reduce<Record<string, number>>((counts, item) => {
        counts[item.status] = (counts[item.status] ?? 0) + 1
        return counts
      }, {})
      rows.push({
        docId,
        docTitle: doc.title,
        projectName: project.name,
        modelCount: new Set(group.map(item => `${item.provider}/${item.model}`)).size,
        tempRange: min === max ? `T=${min.toFixed(1)}` : `T ${min.toFixed(1)}-${max.toFixed(1)}`,
        status: statusCounts.failed ? 'failed' : statusCounts.pending || statusCounts.running ? 'running' : 'success',
        lastUpdated: group.map(item => item.updated_at ?? '').filter(Boolean).sort().pop() ?? '',
      })
    }
    return rows.sort((a, b) => (b.lastUpdated > a.lastUpdated ? 1 : -1))
  }, [documents, parallel, projects])

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="bg-white rounded-2xl border border-line min-h-[calc(100vh-40px)]">
          <MainContent size="wide">
            <PageHeader
              backHref="/dashboard"
              backLabel="返回工作台"
              eyebrow="AI experiments"
              title="最近 AI 翻译实验"
              description="查看当前项目中的多模型翻译实验记录，并进入文档继续比较结果。"
              actions={<Button variant="secondary" onClick={() => router.push('/projects')}>查看项目</Button>}
            />

            {loading ? (
              <Card padding="lg" className="text-center text-sm text-ink-500">加载中...</Card>
            ) : experiments.length === 0 ? (
              <Card padding="lg" className="text-center py-20">
                <h2 className="font-serif text-xl text-ink-900 mb-3">还没有 AI 翻译实验。</h2>
                <p className="text-sm text-ink-600 leading-relaxed max-w-xl mx-auto mb-7">
                  进入已有项目和文档后，可以开启多模型翻译实验。
                </p>
                <Button variant="brand" onClick={() => router.push('/projects')}>前往我的项目</Button>
              </Card>
            ) : (
              <Card padding="none" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <div
                    className="grid min-w-[760px] grid-cols-[minmax(240px,1fr)_auto_auto_auto_auto] gap-5 border-b border-line bg-canvas/60 text-[11px] font-medium uppercase tracking-wider text-ink-500"
                    style={{ paddingLeft: 42, paddingRight: 28, paddingTop: 16, paddingBottom: 16 }}
                  >
                    <div>实验 / 项目 · 文档</div>
                    <div className="text-center">模型</div>
                    <div className="text-center">Temperature</div>
                    <div className="text-center">状态</div>
                    <div className="text-right">操作</div>
                  </div>
                  {experiments.map((experiment, index) => (
                    <div
                      key={experiment.docId}
                      className={cn('grid min-w-[760px] grid-cols-[minmax(240px,1fr)_auto_auto_auto_auto] items-center gap-5', index > 0 && 'border-t border-line')}
                      style={{ paddingLeft: 42, paddingRight: 28, paddingTop: 20, paddingBottom: 20 }}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-900 truncate">{experiment.docTitle}</p>
                        <p className="text-xs text-ink-500 mt-1 truncate">{experiment.projectName}</p>
                      </div>
                      <div className="text-center text-sm text-ink-700 whitespace-nowrap">{experiment.modelCount} 个</div>
                      <div className="text-center text-sm text-ink-700 whitespace-nowrap">{experiment.tempRange}</div>
                      <div className="text-center">
                        <span className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider whitespace-nowrap',
                          experiment.status === 'success' && 'bg-emerald-50/60 text-emerald-800 border-emerald-100',
                          experiment.status === 'failed' && 'bg-rose-50/60 text-rose-800 border-rose-100',
                          experiment.status === 'running' && 'bg-amber-50/60 text-amber-800 border-amber-100',
                        )}>
                          {experiment.status === 'success' ? '已完成' : experiment.status === 'failed' ? '有失败' : '进行中'}
                        </span>
                      </div>
                      <div className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => router.push(`/documents/${experiment.docId}/parallel`)}>查看</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </MainContent>
        </div>
      </main>
    </div>
  )
}
