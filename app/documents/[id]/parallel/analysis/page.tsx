'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { apiJSON } from '@/lib/apiFetch'
import type { Segment } from '@/lib/sentenceSplit'
import type { ProviderId } from '@/lib/translateShared'
import { DEFAULT_MODEL_BY_PROVIDER, loadConfigsFromLocal, saveConfigsToLocal, type WindowConfig } from '@/lib/modelPresets'
import { parallelConfigRunKey, parallelRunKey } from '@/lib/parallelKeys'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Eyebrow } from '@/components/ui/Eyebrow'

type Doc = {
  id: string
  title: string
  project_id: string
  source_language: string
  target_language: string
}

type Project = { id: string; name: string }

type ParallelResult = {
  id: string
  segment_id: string
  provider: string
  model: string
  temperature?: number | null
  prompt?: string | null
  translated_text: string
  status: string
  updated_at?: string | null
}

type TranslationSnapshot = {
  provider: string
  model: string
  modelLabel: string
  translatedText: string
}

type AnalysisRow = {
  analysisText: string
  principlesPrompt: string
  analysisModelProvider: ProviderId
  analysisModelName: string
  selectedForExport: boolean
  savedText: string
}

const ANALYSIS_MODELS: Array<{ provider: ProviderId; label: string; model: string }> = [
  { provider: 'openai', label: 'OpenAI GPT 高级模型', model: DEFAULT_MODEL_BY_PROVIDER.openai },
  { provider: 'claude', label: 'Claude 高级模型', model: DEFAULT_MODEL_BY_PROVIDER.claude },
  { provider: 'deepseek', label: 'DeepSeek 高级模型', model: DEFAULT_MODEL_BY_PROVIDER.deepseek },
  { provider: 'doubao', label: 'Doubao 高级模型', model: DEFAULT_MODEL_BY_PROVIDER.doubao },
]

const DEFAULT_PROMPTS = [
  {
    label: '忠实与流畅分析',
    prompt: '请从忠实与流畅两个维度分析译文是否准确传达原文意义、逻辑关系和语气，同时评价目标语表达是否自然、连贯、符合读者期待。',
  },
  {
    label: '文学风格分析',
    prompt: '请从文学翻译角度分析译文对叙述视角、语体、节奏、意象和情感色彩的再现效果，重点比较不同译文的风格保留与表达得失。',
  },
  {
    label: '游戏本地化分析',
    prompt: '请从游戏本地化角度分析译文在角色口吻、玩家体验、文化适配、界面语境和可玩性方面的表现，关注译文是否符合目标玩家的接受习惯。',
  },
  {
    label: '文化负载词分析',
    prompt: '请重点分析文化负载词、典故、社会文化信息或隐含背景在不同译文中的处理方式，比较直译、意译、补偿和归化异化策略的效果。',
  },
  {
    label: '术语一致性分析',
    prompt: '请从术语一致性和专业准确性角度分析不同译文，关注关键词、专名和核心概念是否统一、准确，并指出可能影响理解的术语问题。',
  },
  {
    label: 'MTPE 审校分析',
    prompt: '请以机器翻译译后编辑 MTPE 的视角分析译文，判断其是否存在意义偏差、漏译误译、语序不自然、术语问题和需要人工审校优化的表达。',
  },
  { label: '自定义', prompt: '' },
]

const STORAGE_PREFIX = 'translation-case-analysis:'

export default function TranslationCaseAnalysisPage() {
  const params = useParams()
  const router = useRouter()
  const documentId = params.id as string

  const [doc, setDoc] = useState<Doc | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [results, setResults] = useState<ParallelResult[]>([])
  const [configs, setConfigs] = useState<WindowConfig[]>([])
  const [configured, setConfigured] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set())

  const [analysisProvider, setAnalysisProvider] = useState<ProviderId>('openai')
  const [promptPreset, setPromptPreset] = useState(DEFAULT_PROMPTS[0].label)
  const [principlesPrompt, setPrinciplesPrompt] = useState(DEFAULT_PROMPTS[0].prompt)
  const [rows, setRows] = useState<Record<string, AnalysisRow>>({})

  const storageKey = `${STORAGE_PREFIX}${documentId}`
  const currentModel = ANALYSIS_MODELS.find(m => m.provider === analysisProvider) ?? ANALYSIS_MODELS[0]

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data: d } = await supabase.from('documents').select('*').eq('id', documentId).single()
      if (!d) { setLoading(false); return }
      setDoc(d as Doc)

      const { data: memberRow } = await supabase
        .from('project_members')
        .select('role')
        .eq('project_id', d.project_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!memberRow) { setLoading(false); return }

      const [{ data: p }, { data: segs }, resultsRes, providersRes, configsRes] = await Promise.all([
        supabase.from('projects').select('id, name').eq('id', d.project_id).single(),
        supabase.from('segments').select('*').eq('document_id', documentId).order('position'),
        apiJSON<{ results: ParallelResult[] }>(`/api/parallel-translate/results?documentId=${documentId}`),
        apiJSON<{ configured: Record<string, boolean> }>('/api/case-analysis/providers'),
        apiJSON<{ configs: WindowConfig[] }>(`/api/parallel-translate/configs?documentId=${documentId}`),
      ])

      setProject((p as Project) || null)
      setSegments((segs || []) as Segment[])
      setResults(resultsRes.data?.results || [])
      setConfigured(providersRes.data?.configured || {})
      const serverConfigs = configsRes.data?.configs || []
      if (serverConfigs.length === 4) {
        setConfigs(serverConfigs)
        saveConfigsToLocal(documentId, serverConfigs)
      } else {
        setConfigs(loadConfigsFromLocal(documentId) || [])
      }

      try {
        const saved = localStorage.getItem(storageKey)
        if (saved) setRows(JSON.parse(saved))
      } catch { /* ignore bad local cache */ }
      setLoading(false)
    })()
  }, [documentId, router, storageKey])

  const translationsBySegment = useMemo(() => {
    const latestByRun = new Map<string, ParallelResult>()
    const activeRunKeys = new Set(
      configs.filter(c => c.enabled).map(c => parallelConfigRunKey(c))
    )
    for (const r of results) {
      if (r.status !== 'success' || !r.translated_text?.trim()) continue
      const runKey = parallelRunKey(r)
      if (activeRunKeys.size > 0 && !activeRunKeys.has(runKey)) continue
      const dedupeKey = `${r.segment_id}:${runKey}`
      const existing = latestByRun.get(dedupeKey)
      if (!existing || String(r.updated_at || '') > String(existing.updated_at || '')) {
        latestByRun.set(dedupeKey, r)
      }
    }

    const grouped = new Map<string, TranslationSnapshot[]>()
    for (const r of latestByRun.values()) {
      const list = grouped.get(r.segment_id) ?? []
      list.push({
        provider: r.provider,
        model: r.model,
        modelLabel: `${providerLabel(r.provider)} / ${r.model}`,
        translatedText: r.translated_text,
      })
      grouped.set(r.segment_id, list)
    }
    for (const [key, list] of grouped) grouped.set(key, list.slice(0, 4))
    return grouped
  }, [configs, results])

  const persistRows = (next: Record<string, AnalysisRow>) => {
    setRows(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* ignore quota */ }
  }

  const updateRow = (segmentId: string, patch: Partial<AnalysisRow>) => {
    const current = rows[segmentId] ?? emptyRow(analysisProvider, currentModel.model, principlesPrompt)
    persistRows({ ...rows, [segmentId]: { ...current, ...patch } })
  }

  const generateAnalysis = async (seg: Segment) => {
    const translations = translationsBySegment.get(seg.id) || []
    if (translations.length === 0) {
      alert('该句段还没有可用 AI 译文，请先在 AI 翻译实验页面生成译文。')
      return
    }
    if (!configured[analysisProvider]) {
      alert(`${currentModel.label} 未配置 API，无法生成分析。`)
      return
    }
    setGeneratingIds(prev => new Set(prev).add(seg.id))
    const { data, error } = await apiJSON<{ analysisText: string }>('/api/case-analysis/generate', {
      method: 'POST',
      body: JSON.stringify({
        documentId,
        segmentId: seg.id,
        provider: analysisProvider,
        model: currentModel.model,
        principlesPrompt,
        sourceText: seg.source,
        translations,
      }),
    })
    setGeneratingIds(prev => { const next = new Set(prev); next.delete(seg.id); return next })
    if (error) { alert('生成失败：' + error); return }
    const analysisText = data?.analysisText || ''
    updateRow(seg.id, {
      analysisText,
      principlesPrompt,
      analysisModelProvider: analysisProvider,
      analysisModelName: currentModel.model,
    })
  }

  const saveRow = (segId: string) => {
    const current = rows[segId] ?? emptyRow(analysisProvider, currentModel.model, principlesPrompt)
    persistRows({
      ...rows,
      [segId]: {
        ...current,
        savedText: current.analysisText,
        principlesPrompt: current.principlesPrompt || principlesPrompt,
        analysisModelProvider: current.analysisModelProvider || analysisProvider,
        analysisModelName: current.analysisModelName || currentModel.model,
      },
    })
  }

  const exportRows = async (mode: 'selected' | 'all') => {
    const selected = segments.filter(seg => {
      const row = rows[seg.id]
      if (!row?.analysisText?.trim()) return false
      return mode === 'all' || row.selectedForExport
    })
    if (selected.length === 0) {
      alert(mode === 'all' ? '还没有可导出的分析内容。' : '请先勾选要导出的分析句段。')
      return
    }
    const XLSX = await import('xlsx')
    const data = selected.map((seg, i) => {
      const translations = translationsBySegment.get(seg.id) || []
      const row = rows[seg.id]
      const out: Record<string, string | number> = {
        句段编号: i + 1,
        原文句子: seg.source,
      }
      for (let n = 0; n < 4; n++) {
        out[`AI 模型 ${n + 1} 名称`] = translations[n]?.modelLabel || ''
        out[`AI 模型 ${n + 1} 译文`] = translations[n]?.translatedText || ''
      }
      out['分析理论和原则'] = row.principlesPrompt || principlesPrompt
      out['分析模型'] = `${providerLabel(row.analysisModelProvider)} / ${row.analysisModelName}`
      out['分析段落文字'] = row.analysisText
      return out
    })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), '翻译案例分析')
    XLSX.writeFile(wb, `${safeFileName(doc?.title || '翻译案例分析')}_案例分析.xlsx`)
  }

  if (loading) return <CenteredText text="加载翻译案例分析..." />
  if (!doc) return <CenteredText text="文档不存在或无权访问" />

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-white border-b border-line" style={{ padding: '22px 48px' }}>
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <Eyebrow>Translation Case Analysis / 翻译案例分析</Eyebrow>
            <h1 className="font-serif text-ink-900 mt-2 truncate" style={{ fontSize: 24, fontFamily: 'var(--font-serif)' }}>
              {doc.title} · 翻译案例分析
            </h1>
            <div className="flex flex-wrap gap-2 mt-3 text-xs text-ink-500">
              <InfoPill label="项目" value={project?.name || '—'} />
              <InfoPill label="文档" value={doc.title} />
              <InfoPill label="实验" value={`${doc.title} · 多模型 AI 翻译实验`} />
              <InfoPill label="句段数量" value={String(segments.length)} />
            </div>
          </div>
          <Button variant="secondary" onClick={() => router.push(`/documents/${doc.id}/parallel`)}>
            返回 AI 翻译实验
          </Button>
        </div>
      </header>

      <main style={{ padding: '28px 48px 48px' }}>
        <Card padding="md" className="mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-[260px_260px_minmax(0,1fr)] gap-4 items-start">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-ink-600">分析模型选择</span>
              <select value={analysisProvider} onChange={e => setAnalysisProvider(e.target.value as ProviderId)}
                className="border border-line rounded-xl bg-white text-sm text-ink-900 px-3 py-2">
                {ANALYSIS_MODELS.map(m => (
                  <option key={m.provider} value={m.provider}>
                    {m.label}{configured[m.provider] ? '' : '（未配置）'}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-ink-500">Temperature: 0.3</span>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-ink-600">default prompts</span>
              <select value={promptPreset} onChange={e => {
                const preset = DEFAULT_PROMPTS.find(p => p.label === e.target.value) || DEFAULT_PROMPTS[0]
                setPromptPreset(preset.label)
                setPrinciplesPrompt(preset.prompt)
              }} className="border border-line rounded-xl bg-white text-sm text-ink-900 px-3 py-2">
                {DEFAULT_PROMPTS.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-ink-600">分析理论和原则</span>
              <textarea value={principlesPrompt} onChange={e => {
                setPrinciplesPrompt(e.target.value)
                if (promptPreset !== '自定义') setPromptPreset('自定义')
              }} rows={4}
                className="border border-line rounded-xl bg-white text-sm text-ink-900 px-3 py-2 resize-y leading-relaxed"
                placeholder="填写分析理论、原则或课程论文分析角度..." />
            </label>
          </div>
          <p className="text-xs text-ink-500 mt-4">
            MVP 保存方式：当前版本将分析结果保存在本浏览器 localStorage，刷新后仍可恢复；暂未写入数据库。
          </p>
        </Card>

        <div className="flex items-center justify-between mb-4">
          <Eyebrow>Export</Eyebrow>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => exportRows('selected')}>导出已选择分析</Button>
            <Button size="sm" variant="primary" onClick={() => exportRows('all')}>导出全部有分析的句段</Button>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          {segments.map((seg, idx) => {
            const translations = translationsBySegment.get(seg.id) || []
            const row = rows[seg.id] ?? emptyRow(analysisProvider, currentModel.model, principlesPrompt)
            const saved = row.analysisText.trim() && row.analysisText === row.savedText
            const generating = generatingIds.has(seg.id)
            return (
              <Card key={seg.id} padding="none" className="overflow-hidden">
                <div className="bg-surface border-b border-line" style={{ padding: 20 }}>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <Eyebrow tone="muted">SEG {String(idx + 1).padStart(2, '0')}</Eyebrow>
                    <label className="inline-flex items-center gap-2 text-xs text-ink-600">
                      <input type="checkbox" checked={row.selectedForExport}
                        onChange={e => updateRow(seg.id, { selectedForExport: e.target.checked })}
                        className="accent-brand" />
                      选择导出
                    </label>
                  </div>
                  <p className="text-sm text-ink-900 leading-relaxed whitespace-pre-wrap">{seg.source}</p>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)] gap-0">
                  <div style={{ padding: 20 }} className="border-b xl:border-b-0 xl:border-r border-line">
                    <Eyebrow tone="muted">AI Translations</Eyebrow>
                    <div className="mt-3 flex flex-col gap-3">
                      {translations.length > 0 ? translations.map((t, i) => (
                        <div key={`${t.modelLabel}-${i}`} className="rounded-xl border border-line bg-white" style={{ padding: 12 }}>
                          <div className="text-[11px] font-mono text-ink-500 mb-2">{t.modelLabel}</div>
                          <p className="text-sm text-ink-800 leading-relaxed whitespace-pre-wrap">{t.translatedText}</p>
                        </div>
                      )) : (
                        <p className="text-sm text-ink-500">暂无 AI 译文。</p>
                      )}
                    </div>
                  </div>

                  <div style={{ padding: 20 }}>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <Eyebrow tone="muted">Analysis</Eyebrow>
                      <span className="text-xs text-ink-500">{saved ? '已保存' : '未保存'}</span>
                    </div>
                    <textarea value={row.analysisText}
                      onChange={e => updateRow(seg.id, { analysisText: e.target.value })}
                      rows={8}
                      className="w-full border border-line rounded-xl bg-white text-sm text-ink-900 px-3 py-3 resize-y leading-relaxed"
                      placeholder="生成或手动填写本句翻译案例分析..." />
                    <div className="flex justify-end gap-2 mt-3">
                      <Button size="sm" variant="secondary" onClick={() => generateAnalysis(seg)} loading={generating}>
                        {generating ? '生成中...' : '生成本句分析'}
                      </Button>
                      <Button size="sm" variant="primary" onClick={() => saveRow(seg.id)}>保存</Button>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </main>
    </div>
  )
}

function emptyRow(provider: ProviderId, model: string, prompt: string): AnalysisRow {
  return {
    analysisText: '',
    principlesPrompt: prompt,
    analysisModelProvider: provider,
    analysisModelName: model,
    selectedForExport: false,
    savedText: '',
  }
}

function providerLabel(provider: string) {
  if (provider === 'openai') return 'OpenAI'
  if (provider === 'claude') return 'Claude'
  if (provider === 'deepseek') return 'DeepSeek'
  if (provider === 'doubao') return 'Doubao'
  return provider
}

function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-canvas border border-line px-3 py-1">
      <span className="text-ink-400 mr-1.5">{label}</span>
      <span className="text-ink-700">{value}</span>
    </span>
  )
}

function CenteredText({ text }: { text: string }) {
  return (
    <div className="h-screen flex items-center justify-center bg-canvas">
      <p className="text-sm text-ink-500">{text}</p>
    </div>
  )
}
