'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { apiJSON } from '@/lib/apiFetch'
import { type Role } from '@/lib/permissions'
import {
  makeDefaultConfig, loadConfigsFromLocal, saveConfigsToLocal, windowLabel,
  type WindowConfig,
} from '@/lib/modelPresets'
import type { Segment } from '@/lib/sentenceSplit'
import ModelConfigPanel from '@/components/ModelConfigPanel'
import ParallelTranslationCell, { type ParallelResult } from '@/components/ParallelTranslationCell'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { cn } from '@/components/ui/cn'

type Doc = {
  id: string
  title: string
  source_language: string
  target_language: string
  project_id: string
}

const langNames: Record<string, string> = {
  en: '英语', zh: '中文', ja: '日语', ko: '韩语',
  fr: '法语', de: '德语', es: '西班牙语', ru: '俄语'
}

type ResultMap = Map<string, ParallelResult>
function makeKey(segmentId: string, provider: string, model: string) {
  return `${segmentId}:${provider}:${model}`
}

export default function ParallelWorkbenchPage() {
  const params = useParams()
  const router = useRouter()
  const documentId = params.id as string

  const [userId, setUserId] = useState<string | null>(null)
  const [doc, setDoc] = useState<Doc | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [myRole, setMyRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)

  const [configs, setConfigs] = useState<WindowConfig[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<ResultMap>(new Map())
  const [, setTranslatingCells] = useState<Set<string>>(new Set())
  const [adoptingIds, setAdoptingIds] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  const segmentsRef = useRef<Segment[]>([])
  useEffect(() => { segmentsRef.current = segments }, [segments])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setUserId(user.id)

      const { data: d } = await supabase.from('documents').select('*').eq('id', documentId).single()
      if (!d) { setLoading(false); return }
      setDoc(d)

      const [{ data: segs }, roleRes, resultsRes] = await Promise.all([
        supabase.from('segments').select('*').eq('document_id', documentId).order('position'),
        apiJSON<{ myRole: Role }>(`/api/projects/${d.project_id}/members`),
        apiJSON<{ results: ParallelResult[] }>(`/api/parallel-translate/results?documentId=${documentId}`),
      ])
      setSegments(segs || [])
      setMyRole(roleRes.data?.myRole || null)

      const m: ResultMap = new Map()
      for (const r of resultsRes.data?.results || []) {
        m.set(makeKey(r.segment_id, r.provider, r.model), r)
      }
      setResults(m)

      const stored = loadConfigsFromLocal(documentId)
      if (stored && stored.length === 4) setConfigs(stored)
      else setConfigs([0, 1, 2, 3].map(i => makeDefaultConfig(i)))

      setLoading(false)
    })()
  }, [documentId])

  useEffect(() => {
    if (configs.length === 4) saveConfigsToLocal(documentId, configs)
  }, [configs, documentId])

  const enabledConfigs = useMemo(() => configs.filter(c => c.enabled), [configs])

  const updateConfig = (idx: number, next: WindowConfig) => {
    setConfigs(prev => prev.map((c, i) => i === idx ? next : c))
  }
  const toggleEnabled = (idx: number) => {
    setConfigs(prev => prev.map((c, i) => i === idx ? { ...c, enabled: !c.enabled } : c))
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const selectAll = () => setSelectedIds(new Set(segments.map(s => s.id)))
  const clearSelection = () => setSelectedIds(new Set())

  const translateOne = async (seg: Segment, cfg: WindowConfig) => {
    if (!doc) return
    const cellKey = makeKey(seg.id, cfg.provider, cfg.model)
    setTranslatingCells(prev => new Set(prev).add(cellKey))

    setResults(prev => {
      const m = new Map(prev)
      const existing = m.get(cellKey)
      m.set(cellKey, {
        id: existing?.id || `tmp-${cellKey}`,
        segment_id: seg.id, provider: cfg.provider, model: cfg.model,
        translated_text: '', status: 'running', error_message: null,
      })
      return m
    })

    const { data, error } = await apiJSON<{ result: ParallelResult }>('/api/parallel-translate', {
      method: 'POST',
      body: JSON.stringify({
        documentId: doc.id, segmentId: seg.id,
        provider: cfg.provider, model: cfg.model,
        temperature: cfg.temperature, prompt: cfg.prompt,
        sourceLang: doc.source_language, targetLang: doc.target_language,
      }),
    })

    setResults(prev => {
      const m = new Map(prev)
      if (data?.result) m.set(cellKey, data.result)
      else {
        const existing = m.get(cellKey)
        m.set(cellKey, {
          id: existing?.id || `tmp-${cellKey}`,
          segment_id: seg.id, provider: cfg.provider, model: cfg.model,
          translated_text: '', status: 'failed', error_message: error || '请求失败',
        })
      }
      return m
    })

    setTranslatingCells(prev => { const s = new Set(prev); s.delete(cellKey); return s })
  }

  const handleTranslateSelected = async () => {
    if (!doc) return
    if (enabledConfigs.length === 0) { alert('请至少启用一个模型窗口'); return }
    if (selectedIds.size === 0) { alert('请先勾选要翻译的句子'); return }

    const targetSegs = segments.filter(s => selectedIds.has(s.id))
    setRunning(true)
    setProgress({ done: 0, total: targetSegs.length * enabledConfigs.length })

    let done = 0
    const update = () => { done++; setProgress(p => ({ ...p, done })) }

    const workers = enabledConfigs.map(async cfg => {
      for (const seg of targetSegs) {
        await translateOne(seg, cfg)
        update()
      }
    })
    await Promise.all(workers)
    setRunning(false)
  }

  const handleTranslateAll = async () => {
    if (segments.length === 0) return
    if (!confirm(`将用 ${enabledConfigs.length} 个模型翻译全部 ${segments.length} 个句子，共 ${segments.length * enabledConfigs.length} 次 API 调用，确定继续？`)) return
    setSelectedIds(new Set(segments.map(s => s.id)))
    setTimeout(() => handleTranslateSelected(), 50)
  }

  const handleRetry = async (seg: Segment, cfg: WindowConfig) => {
    await translateOne(seg, cfg)
  }

  const handleAdopt = async (resultId: string, segmentId: string, newText: string) => {
    const seg = segments.find(s => s.id === segmentId)
    if (!seg) return
    if (seg.target?.trim() && seg.target.trim() !== newText.trim()) {
      if (!confirm('该句段已有译文，采用此候选会覆盖现有译文，确定继续？')) return
    }
    setAdoptingIds(prev => new Set(prev).add(resultId))
    const { data, error } = await apiJSON<{ segment: Segment }>('/api/parallel-translate/adopt', {
      method: 'POST', body: JSON.stringify({ parallelTranslationId: resultId }),
    })
    setAdoptingIds(prev => { const s = new Set(prev); s.delete(resultId); return s })
    if (error) { alert('采用失败：' + error); return }
    if (data?.segment) setSegments(prev => prev.map(s => s.id === segmentId ? { ...s, ...data.segment } : s))
  }

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-canvas">
      <div className="flex items-center gap-3 text-ink-500">
        <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">加载中...</span>
      </div>
    </div>
  )

  if (!doc) return (
    <div className="h-screen flex items-center justify-center bg-canvas">
      <p className="text-ink-500">文档不存在</p>
    </div>
  )

  if (!myRole) return (
    <div className="h-screen flex items-center justify-center bg-canvas">
      <Card padding="lg" className="text-center max-w-sm">
        <h3 className="font-serif text-xl text-ink-900 mb-2">无权访问</h3>
        <Button onClick={() => router.push('/dashboard')}>返回工作台</Button>
      </Card>
    </div>
  )

  if (segments.length === 0) return (
    <div className="h-screen flex items-center justify-center bg-canvas px-6">
      <Card padding="lg" className="text-center max-w-md">
        <h3 className="font-serif text-2xl text-ink-900 mb-3">还没有分句</h3>
        <p className="text-ink-500 text-sm mb-6">请先回到文档页执行「分句」，再回来使用并行翻译。</p>
        <Button variant="primary" onClick={() => router.push(`/documents/${doc.id}`)}>
          回到文档页
        </Button>
      </Card>
    </div>
  )

  // grid 自适应
  const cols = Math.max(enabledConfigs.length, 1)
  const gridCols = cols === 1 ? 'grid-cols-1'
    : cols === 2 ? 'grid-cols-1 lg:grid-cols-2'
    : cols === 3 ? 'grid-cols-1 lg:grid-cols-3'
    : 'grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4'

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      {/* 顶栏 */}
      <header className="bg-white border-b border-line px-8 lg:px-10 py-4 flex items-center gap-4 flex-shrink-0">
        <button onClick={() => router.push(`/documents/${doc.id}`)}
          className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回文档
        </button>
        <div className="w-px h-5 bg-line" />
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-7 h-7 bg-brand rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">⚡</span>
          </div>
          <Eyebrow>Parallel Workbench</Eyebrow>
          <h1 className="font-serif text-lg text-ink-900 truncate">{doc.title}</h1>
          <span className="text-xs text-ink-500 bg-canvas px-2.5 py-1 rounded-full font-mono flex-shrink-0">
            {langNames[doc.source_language]} → {langNames[doc.target_language]}
          </span>
        </div>
        <span className="text-xs text-ink-500 flex-shrink-0">
          启用 <span className="text-brand font-semibold">{enabledConfigs.length}</span> / 4
        </span>
      </header>

      {/* 工具栏 */}
      <div className="bg-white border-b border-line px-8 lg:px-10 py-3 flex items-center gap-3 flex-wrap flex-shrink-0">
        <span className="text-xs text-ink-500">
          已选 <span className="text-ink-900 font-semibold">{selectedIds.size}</span> / {segments.length} 句
        </span>
        <button onClick={selectAll}
          className="text-xs text-ink-500 hover:text-ink-900 px-2 py-1 transition-colors">全选</button>
        <button onClick={clearSelection}
          className="text-xs text-ink-500 hover:text-ink-900 px-2 py-1 transition-colors">清空</button>

        <div className="w-px h-5 bg-line" />

        <Button
          size="sm" variant="brand"
          onClick={handleTranslateSelected}
          disabled={running || selectedIds.size === 0 || enabledConfigs.length === 0}
          loading={running}
        >
          {running ? `翻译中 ${progress.done}/${progress.total}` : `▶ 翻译选中（${selectedIds.size}×${enabledConfigs.length}）`}
        </Button>
        <Button
          size="sm" variant="primary"
          onClick={handleTranslateAll}
          disabled={running || enabledConfigs.length === 0}
        >
          ▶▶ 全文翻译
        </Button>
      </div>

      {/* 主体 */}
      <main className="flex-1 overflow-hidden flex">
        {/* 左侧：原文列表 */}
        <aside className="w-[340px] flex-shrink-0 border-r border-line bg-white overflow-y-auto">
          <div className="px-6 py-4 border-b border-line sticky top-0 bg-white z-10">
            <Eyebrow className="mb-1">Source · 原文</Eyebrow>
            <h3 className="font-serif text-base text-ink-900">分句列表</h3>
          </div>
          <div>
            {segments.map((seg, i) => {
              const selected = selectedIds.has(seg.id)
              const adopted = !!seg.target?.trim()
              return (
                <label key={seg.id}
                  className={cn(
                    'flex gap-3 px-6 py-4 border-b border-line cursor-pointer transition-colors',
                    selected ? 'bg-brand-50/70' : 'hover:bg-canvas/40'
                  )}>
                  <input type="checkbox" checked={selected} onChange={() => toggleSelect(seg.id)}
                    className="mt-1 w-4 h-4 accent-brand cursor-pointer flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Eyebrow tone="muted">{String(i + 1).padStart(2, '0')}</Eyebrow>
                      {adopted && (
                        <span className="text-[10px] font-mono uppercase tracking-[0.12em] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">已采用</span>
                      )}
                      {seg.status === 'locked' && (
                        <span className="text-[10px] font-mono uppercase tracking-[0.12em] px-1.5 py-0.5 bg-ink-900 text-white rounded">锁定</span>
                      )}
                    </div>
                    <p className="text-xs text-ink-900 leading-relaxed whitespace-pre-wrap break-words">{seg.source}</p>
                    {seg.target && (
                      <p className="text-[11px] text-ink-500 mt-2 leading-relaxed whitespace-pre-wrap break-words border-l-2 border-brand/30 pl-2.5">{seg.target}</p>
                    )}
                  </div>
                </label>
              )
            })}
          </div>
        </aside>

        {/* 右侧：模型矩阵 */}
        <section className="flex-1 overflow-auto">
          {/* 配置卡片行 */}
          <div className="px-6 lg:px-8 py-5 border-b border-line bg-surface">
            <Eyebrow className="mb-4">Models</Eyebrow>
            <div className={cn('grid gap-4', gridCols)}>
              {configs.map((cfg, i) => (
                <ModelConfigPanel
                  key={cfg.id}
                  idx={i}
                  config={cfg}
                  onChange={next => updateConfig(i, next)}
                  onToggleEnabled={() => toggleEnabled(i)}
                />
              ))}
            </div>
          </div>

          {/* 结果矩阵 */}
          <div className="px-6 lg:px-8 py-6">
            {selectedIds.size === 0 && Array.from(results.values()).length === 0 ? (
              <Card padding="lg" className="text-center py-16">
                <h3 className="font-serif text-xl text-ink-900 mb-2">还没有翻译结果</h3>
                <p className="text-ink-500 text-sm">
                  在左侧勾选要翻译的句子，调整模型配置，然后点「翻译选中」
                </p>
              </Card>
            ) : (
              <div className="space-y-5">
                {segments
                  .filter(seg => selectedIds.has(seg.id) || enabledConfigs.some(c => results.has(makeKey(seg.id, c.provider, c.model))))
                  .map(seg => (
                    <Card key={seg.id} padding="none" className="overflow-hidden">
                      {/* 行头：原文 */}
                      <div className="px-6 py-4 bg-surface border-b border-line">
                        <div className="flex items-baseline gap-2 mb-1.5">
                          <Eyebrow tone="muted">SEG {String(segments.indexOf(seg) + 1).padStart(2, '0')}</Eyebrow>
                          {seg.target && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-green-100 text-green-700 rounded truncate max-w-md">
                              主译文: {seg.target.slice(0, 30)}{seg.target.length > 30 ? '...' : ''}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-ink-900 leading-relaxed">{seg.source}</p>
                      </div>
                      {/* 矩阵 */}
                      <div className={cn('grid gap-4 p-5', gridCols)}>
                        {enabledConfigs.map(cfg => {
                          const key = makeKey(seg.id, cfg.provider, cfg.model)
                          const result = results.get(key) || null
                          return (
                            <div key={cfg.id} className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <Eyebrow tone="muted">{windowLabel(configs.indexOf(cfg))}</Eyebrow>
                                <span className="text-[10px] font-mono text-ink-500">{cfg.model}</span>
                              </div>
                              <ParallelTranslationCell
                                result={result}
                                segmentTarget={seg.target}
                                onRetry={() => handleRetry(seg, cfg)}
                                onAdopt={() => result && handleAdopt(result.id, seg.id, result.translated_text)}
                                adopting={result ? adoptingIds.has(result.id) : false}
                              />
                            </div>
                          )
                        })}
                      </div>
                    </Card>
                  ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
