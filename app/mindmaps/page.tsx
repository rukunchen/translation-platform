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

type MindmapRow = {
  id: string
  user_id: string
  title: string
  description: string | null
  source_module: string | null
  content_json: unknown
  updated_at: string | null
}

const initialMindmapTree = {
  id: 'root',
  label: '中心主题',
  color: 'blue',
  children: [],
} as const

const sourceModuleLabel: Record<string, string> = {
  manual: '手动创建',
  reading: '深读室',
  frontier: '前沿文献',
  writing: '论文写作',
  terms: '术语学习',
}

function countNodes(node: unknown): number {
  if (!node || typeof node !== 'object') return 0
  const current = node as { children?: unknown[] }
  const children: unknown[] = Array.isArray(current.children) ? current.children : []
  let total = 1
  for (const child of children) total += countNodes(child)
  return total
}

function formatDateTime(value: string | null) {
  if (!value) return '暂无记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '暂无记录'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function MindmapsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [mindmaps, setMindmaps] = useState<MindmapRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<MindmapRow | null>(null)

  const loadMindmaps = useCallback(async (nextUserId: string) => {
    setError('')
    const { data, error: queryError } = await supabase
      .from('mindmaps')
      .select('id, user_id, title, description, source_module, content_json, updated_at')
      .eq('user_id', nextUserId)
      .order('updated_at', { ascending: false })

    if (queryError) {
      setMindmaps([])
      setError(queryError.message || '加载思维导图失败')
      return
    }

    setMindmaps((data ?? []) as MindmapRow[])
  }, [])

  useEffect(() => {
    let alive = true

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!alive) return
      if (!user) {
        router.push('/')
        return
      }

      setUserId(user.id)
      await loadMindmaps(user.id)
      if (alive) setLoading(false)
    })

    return () => { alive = false }
  }, [loadMindmaps, router])

  const createMindmap = useCallback(async () => {
    if (!userId) return
    setCreating(true)
    setError('')

    const { data, error: insertError } = await supabase
      .from('mindmaps')
      .insert({
        user_id: userId,
        title: '未命名导图',
        description: null,
        source_module: 'manual',
        visibility: 'private',
        content_json: initialMindmapTree,
      })
      .select('id')
      .single()

    setCreating(false)

    if (insertError || !data?.id) {
      setError(insertError?.message || '新建导图失败')
      return
    }

    router.push(`/mindmaps/${data.id}`)
  }, [router, userId])

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || !userId) return

    setDeletingId(deleteTarget.id)
    setError('')

    const { error: deleteError } = await supabase
      .from('mindmaps')
      .delete()
      .eq('id', deleteTarget.id)
      .eq('user_id', userId)

    setDeletingId(null)

    if (deleteError) {
      setError(deleteError.message || '删除导图失败')
      return
    }

    setDeleteTarget(null)
    await loadMindmaps(userId)
  }, [deleteTarget, loadMindmaps, userId])

  const rows = useMemo(() => (
    mindmaps.map(item => ({
      ...item,
      nodeCount: countNodes(item.content_json),
      sourceLabel: sourceModuleLabel[item.source_module ?? 'manual'] ?? (item.source_module || '未指定'),
    }))
  ), [mindmaps])

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="min-h-[calc(100vh-40px)] rounded-2xl border border-line bg-white">
          <MainContent size="wide">
            <PageHeader
              eyebrow="Mindmaps"
              title="思维导图"
              description="创建、整理和保存你的知识结构图，后续可与深读室、前沿文献和论文写作联动。"
              actions={
                <Button variant="brand" onClick={createMindmap} loading={creating}>
                  新建导图
                </Button>
              }
            />

            {error && (
              <Card padding="sm" className="mb-6 border border-red-100 bg-red-50 text-sm text-red-700">
                {error}
              </Card>
            )}

            {loading ? (
              <Card padding="lg" className="text-center text-sm text-ink-500">
                正在加载思维导图...
              </Card>
            ) : rows.length === 0 ? (
              <Card padding="lg" className="py-20 text-center">
                <h2 className="mb-3 font-serif text-xl text-ink-900">暂无思维导图。</h2>
                <p className="mx-auto mb-7 max-w-xl text-sm leading-relaxed text-ink-600">
                  点击“新建导图”创建第一张。
                </p>
                <Button variant="brand" onClick={createMindmap} loading={creating}>新建导图</Button>
              </Card>
            ) : (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {rows.map(item => (
                  <Card
                    key={item.id}
                    padding="md"
                    className="flex h-full flex-col justify-between rounded-3xl border border-line"
                  >
                    <div>
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate font-serif text-xl text-ink-900">{item.title}</h2>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-ink-400">
                            {item.sourceLabel}
                          </p>
                        </div>
                        <span className="rounded-full border border-line bg-canvas px-3 py-1 text-[11px] text-ink-500">
                          {item.nodeCount} 个节点
                        </span>
                      </div>

                      <p className={cn(
                        'min-h-12 text-sm leading-relaxed text-ink-600',
                        !item.description && 'text-ink-400'
                      )}>
                        {item.description || '暂无描述'}
                      </p>

                      <div className="mt-5 space-y-2 text-xs text-ink-500">
                        <div className="flex items-center justify-between gap-3">
                          <span>来源</span>
                          <span className="truncate text-ink-700">{item.sourceLabel}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>最近更新</span>
                          <span className="truncate text-ink-700">{formatDateTime(item.updated_at)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-7 flex items-center gap-3">
                      <Button variant="secondary" fullWidth onClick={() => router.push(`/mindmaps/${item.id}`)}>
                        打开编辑
                      </Button>
                      <Button
                        variant="ghost"
                        fullWidth
                        onClick={() => setDeleteTarget(item)}
                        loading={deletingId === item.id}
                        disabled={creating}
                      >
                        删除
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </MainContent>
        </div>
      </main>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-[var(--shadow-modal)]" style={{ padding: 40 }}>
            <h3 className="font-serif text-2xl text-ink-900">确定删除这张思维导图吗？</h3>
            <p className="mt-3 text-sm leading-relaxed text-ink-500">
              删除后无法恢复。
            </p>
            <div className="mt-8 flex gap-3">
              <Button variant="secondary" fullWidth onClick={() => setDeleteTarget(null)} disabled={deletingId === deleteTarget.id}>
                取消
              </Button>
              <Button variant="danger" fullWidth onClick={() => { void confirmDelete() }} loading={deletingId === deleteTarget.id}>
                确认删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
