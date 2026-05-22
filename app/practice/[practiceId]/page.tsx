'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { PageHeader } from '@/components/ui/PageHeader'
import { MainContent } from '@/components/ui/MainContent'
import { cn } from '@/components/ui/cn'
import { apiJSON } from '@/lib/apiFetch'
import { supabase } from '@/lib/supabase'
import {
  EXPRESSION_CARD_CATEGORIES,
  PRACTICE_ISSUE_SEVERITIES,
  PRACTICE_ISSUE_TYPES,
  PRACTICE_STATUSES,
  countPracticeWords,
  displayDirection,
  practiceStatus,
  practiceStatusMeta,
  splitPracticeText,
  tagsFromText,
  tagsToText,
  type SplitMode,
  type TranslationPracticeIssue,
  type TranslationPracticeItem,
  type TranslationPracticeSegment,
} from '@/lib/translationPractice'

type IssueDraft = {
  segment: TranslationPracticeSegment
  issue_type: string
  severity: string
  description: string
  suggestion: string
  is_added_to_review: boolean
}

type ExpressionDraft = {
  segment: TranslationPracticeSegment | null
  source_expression: string
  target_expression: string
  context_sentence: string
  usage_context: string
  category: string
  tags: string
  note: string
}

type PracticeAiAnalysis = {
  summary: string
  issues: string[]
  suggestions: string[]
  improvedTranslation: string
}

const PRACTICE_EXPRESSION_CATEGORIES = ['专有名词', '重点名词', '动词', '形容词'] as const

type PracticeExpressionCategory = typeof PRACTICE_EXPRESSION_CATEGORIES[number]

type PracticeAiExpression = {
  category: PracticeExpressionCategory
  sourceExpression: string
  referenceTranslation: string
  note: string
}

type PracticeAiExpressions = {
  expressions: PracticeAiExpression[]
}

type PracticeAiTranslation = {
  translation: string
}

export default function TranslationPracticeEditorPage() {
  const router = useRouter()
  const params = useParams()
  const practiceId = params.practiceId as string
  const [item, setItem] = useState<TranslationPracticeItem | null>(null)
  const [segments, setSegments] = useState<TranslationPracticeSegment[]>([])
  const [issues, setIssues] = useState<TranslationPracticeIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [splitting, setSplitting] = useState(false)
  const [savingSegmentId, setSavingSegmentId] = useState<string | null>(null)
  const [issueDraft, setIssueDraft] = useState<IssueDraft | null>(null)
  const [expressionDraft, setExpressionDraft] = useState<ExpressionDraft | null>(null)
  const [modalSaving, setModalSaving] = useState(false)
  const [aiTranslating, setAiTranslating] = useState(false)
  const [aiTranslationError, setAiTranslationError] = useState('')
  const [aiAnalyzing, setAiAnalyzing] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<PracticeAiAnalysis | null>(null)
  const [aiAnalysisError, setAiAnalysisError] = useState('')
  const [aiExpressionExtracting, setAiExpressionExtracting] = useState(false)
  const [aiExpressions, setAiExpressions] = useState<PracticeAiExpressions | null>(null)
  const [aiExpressionError, setAiExpressionError] = useState('')
  const aiAnalysisRef = useRef<HTMLElement | null>(null)
  const aiExpressionsRef = useRef<HTMLElement | null>(null)

  const [sourceText, setSourceText] = useState('')
  const [myTranslation, setMyTranslation] = useState('')
  const [referenceTranslation, setReferenceTranslation] = useState('')
  const [aiTranslation, setAiTranslation] = useState('')
  const [status, setStatus] = useState('unpracticed')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      router.push('/')
      return
    }
    const [itemRes, segmentRes, issueRes] = await Promise.all([
      supabase.from('translation_practice_items').select('*').eq('id', practiceId).maybeSingle(),
      supabase.from('translation_practice_segments').select('*').eq('practice_item_id', practiceId).order('segment_order'),
      supabase.from('translation_practice_issues').select('*').eq('practice_item_id', practiceId).order('created_at', { ascending: false }),
    ])
    if (itemRes.error || !itemRes.data) {
      setLoading(false)
      alert('练习不存在或无权访问。')
      router.push('/practice')
      return
    }
    const practice = itemRes.data as TranslationPracticeItem
    setItem(practice)
    setSourceText(practice.source_text || '')
    setMyTranslation(practice.my_translation || '')
    setReferenceTranslation(practice.reference_translation || '')
    setAiTranslation(practice.ai_translation || '')
    setStatus(practiceStatus(practice.status))
    setSegments((segmentRes.data ?? []) as TranslationPracticeSegment[])
    setIssues((issueRes.data ?? []) as TranslationPracticeIssue[])
    setLoading(false)
  }, [practiceId, router])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const issuesBySegment = useMemo(() => {
    return issues.reduce<Record<string, TranslationPracticeIssue[]>>((out, issue) => {
      if (!issue.segment_id) return out
      const list = out[issue.segment_id] ?? []
      list.push(issue)
      out[issue.segment_id] = list
      return out
    }, {})
  }, [issues])

  const pageStatus = practiceStatus(status)
  const selectedStatus = practiceStatusMeta[pageStatus]

  async function savePractice() {
    if (!item) return
    setSaving(true)
    const nextStatus = status === 'unpracticed' && myTranslation.trim() ? 'drafted' : practiceStatus(status)
    const { data, error } = await supabase
      .from('translation_practice_items')
      .update({
        source_text: sourceText,
        my_translation: myTranslation,
        reference_translation: referenceTranslation,
        ai_translation: aiTranslation,
        status: nextStatus,
      })
      .eq('id', item.id)
      .select()
      .single()
    setSaving(false)
    if (error || !data) {
      alert('保存失败：' + (error?.message ?? '未知错误'))
      return
    }
    const nextItem = data as TranslationPracticeItem
    setItem(nextItem)
    setStatus(practiceStatus(nextItem.status))
  }

  async function schedulePracticeReview() {
    if (!item) return
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('translation_practice_items')
      .update({ status: 'review_due', next_review_at: now })
      .eq('id', item.id)
      .select()
      .single()
    if (error || !data) {
      alert('加入复习失败：' + (error?.message ?? '未知错误'))
      return
    }
    setItem(data as TranslationPracticeItem)
    setStatus('review_due')
  }

  async function splitSegments(mode: SplitMode) {
    if (!item) return
    const sourceParts = splitPracticeText(sourceText, mode)
    if (sourceParts.length === 0) {
      alert('原文为空，无法切分。')
      return
    }
    if (segments.length > 0 && !confirm('重新切分会覆盖现有句段和句段问题标记。继续吗？')) return
    setSplitting(true)
    if (segments.length > 0) {
      const { error: deleteError } = await supabase
        .from('translation_practice_segments')
        .delete()
        .eq('practice_item_id', item.id)
      if (deleteError) {
        setSplitting(false)
        alert('重新切分失败：' + deleteError.message)
        return
      }
    }
    const myParts = splitPracticeText(myTranslation, mode)
    const referenceParts = splitPracticeText(referenceTranslation, mode)
    const aiParts = splitPracticeText(aiTranslation, mode)
    const { data, error } = await supabase
      .from('translation_practice_segments')
      .insert(sourceParts.map((part, index) => ({
        practice_item_id: item.id,
        segment_order: index + 1,
        source_text: part,
        my_translation: myParts[index] ?? '',
        reference_translation: referenceParts[index] ?? '',
        ai_translation: aiParts[index] ?? '',
      })))
      .select()
    if (!error) {
      await supabase
        .from('translation_practice_items')
        .update({ status: myTranslation.trim() ? 'compared' : 'unpracticed' })
        .eq('id', item.id)
    }
    setSplitting(false)
    if (error) {
      alert('切分失败：' + error.message)
      return
    }
    setSegments(((data ?? []) as TranslationPracticeSegment[]).sort((a, b) => a.segment_order - b.segment_order))
    setIssues([])
    setStatus(myTranslation.trim() ? 'compared' : 'unpracticed')
    window.setTimeout(() => document.getElementById('practice-compare')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  function patchSegment(segmentId: string, patch: Partial<TranslationPracticeSegment>) {
    setSegments(prev => prev.map(segment => segment.id === segmentId ? { ...segment, ...patch } : segment))
  }

  async function saveSegment(segment: TranslationPracticeSegment) {
    setSavingSegmentId(segment.id)
    const { data, error } = await supabase
      .from('translation_practice_segments')
      .update({
        source_text: segment.source_text,
        my_translation: segment.my_translation,
        reference_translation: segment.reference_translation,
        note: segment.note,
      })
      .eq('id', segment.id)
      .select()
      .single()
    setSavingSegmentId(null)
    if (error || !data) {
      alert('句段保存失败：' + (error?.message ?? '未知错误'))
      return
    }
    patchSegment(segment.id, data as TranslationPracticeSegment)
  }

  async function handleAiAnalyze() {
    if (!item || aiAnalyzing) return
    if (!sourceText.trim() || !myTranslation.trim()) {
      setAiAnalysisError('请先填写原文和我的译文。')
      return
    }
    setAiAnalyzing(true)
    setAiAnalysisError('')
    try {
      const { data, error } = await apiJSON<PracticeAiAnalysis>('/api/practice/ai-analyze', {
        method: 'POST',
        body: JSON.stringify({
          sourceText,
          userTranslation: myTranslation,
          practiceType: item.text_type || item.exam_type || '翻译练习',
        }),
      })
      if (error || !data) {
        setAiAnalysisError(error || 'AI 分析暂时不可用。')
        return
      }
      setAiAnalysis(data)
      window.setTimeout(() => aiAnalysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
    } finally {
      setAiAnalyzing(false)
    }
  }

  async function handleAiTranslate() {
    if (!item || aiTranslating) return
    if (!sourceText.trim()) {
      setAiTranslationError('请先填写原文。')
      return
    }

    setAiTranslating(true)
    setAiTranslationError('')
    try {
      const { data, error } = await apiJSON<PracticeAiTranslation>('/api/practice/ai-translation', {
        method: 'POST',
        body: JSON.stringify({
          sourceText,
          direction: item.direction,
          practiceType: item.text_type || item.exam_type || '翻译练习',
        }),
      })
      if (error || !data) {
        setAiTranslationError(error || 'AI 参考译文暂时不可用。')
        return
      }
      setAiTranslation(data.translation)
    } finally {
      setAiTranslating(false)
    }
  }

  async function handleAiExtractExpressions() {
    if (!item || aiExpressionExtracting) return
    if (!sourceText.trim() || !referenceTranslation.trim()) {
      setAiExpressionError('请先填写原文和参考译文。')
      return
    }
    setAiExpressionExtracting(true)
    setAiExpressionError('')
    try {
      const { data, error } = await apiJSON<PracticeAiExpressions>('/api/practice/ai-expressions', {
        method: 'POST',
        body: JSON.stringify({
          sourceText,
          referenceTranslation,
          practiceType: item.text_type || item.exam_type || '翻译练习',
        }),
      })
      if (error || !data) {
        setAiExpressionError(error || '高频表达提取暂时不可用。')
        return
      }
      setAiExpressions(data)
      window.setTimeout(() => aiExpressionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
    } finally {
      setAiExpressionExtracting(false)
    }
  }

  function openIssue(segment: TranslationPracticeSegment) {
    setIssueDraft({
      segment,
      issue_type: PRACTICE_ISSUE_TYPES[0],
      severity: '中等',
      description: '',
      suggestion: '',
      is_added_to_review: true,
    })
  }

  async function createIssue(e: React.FormEvent) {
    e.preventDefault()
    if (!issueDraft || !item) return
    setModalSaving(true)
    const { data, error } = await supabase
      .from('translation_practice_issues')
      .insert({
        practice_item_id: item.id,
        segment_id: issueDraft.segment.id,
        issue_type: issueDraft.issue_type,
        severity: issueDraft.severity,
        description: issueDraft.description.trim(),
        suggestion: issueDraft.suggestion.trim(),
        is_added_to_review: issueDraft.is_added_to_review,
      })
      .select()
      .single()
    setModalSaving(false)
    if (error || !data) {
      alert('问题保存失败：' + (error?.message ?? '未知错误'))
      return
    }
    setIssues(prev => [data as TranslationPracticeIssue, ...prev])
    setIssueDraft(null)
  }

  async function scheduleSegmentReview(segment: TranslationPracticeSegment) {
    if (!item) return
    const segmentIssues = issuesBySegment[segment.id] ?? []
    if (segmentIssues.length > 0) {
      const { error } = await supabase
        .from('translation_practice_issues')
        .update({ is_added_to_review: true })
        .in('id', segmentIssues.map(issue => issue.id))
      if (error) {
        alert('加入复习失败：' + error.message)
        return
      }
      setIssues(prev => prev.map(issue => issue.segment_id === segment.id ? { ...issue, is_added_to_review: true } : issue))
    } else {
      const { data, error } = await supabase
        .from('translation_practice_issues')
        .insert({
          practice_item_id: item.id,
          segment_id: segment.id,
          issue_type: '其他',
          severity: '轻微',
          description: '句段待复盘',
          is_added_to_review: true,
        })
        .select()
        .single()
      if (error || !data) {
        alert('加入复习失败：' + (error?.message ?? '未知错误'))
        return
      }
      setIssues(prev => [data as TranslationPracticeIssue, ...prev])
    }
    await schedulePracticeReview()
  }

  function openExpression(segment: TranslationPracticeSegment) {
    setExpressionDraft({
      segment,
      source_expression: '',
      target_expression: '',
      context_sentence: segment.source_text,
      usage_context: '',
      category: EXPRESSION_CARD_CATEGORIES[0],
      tags: tagsToText(item?.tags),
      note: '',
    })
  }

  function openAiExpression(expression: PracticeAiExpression) {
    const segment = segments.find(row => expressionTextIncludes(row.source_text, expression.sourceExpression)) ?? null
    const contextSentence = segment?.source_text
      || splitPracticeText(sourceText, 'sentence').find(part => expressionTextIncludes(part, expression.sourceExpression))
      || sourceText.trim()

    setExpressionDraft({
      segment,
      source_expression: expression.sourceExpression,
      target_expression: expression.referenceTranslation,
      context_sentence: contextSentence,
      usage_context: item?.text_type || item?.exam_type || '',
      category: expressionCardCategory(expression.category),
      tags: tagsToText(item?.tags),
      note: expression.note,
    })
  }

  async function createExpressionCard(e: React.FormEvent) {
    e.preventDefault()
    if (!expressionDraft || !item) return
    if (!expressionDraft.source_expression.trim()) {
      alert('请填写原文表达。')
      return
    }
    setModalSaving(true)
    const { error } = await supabase
      .from('expression_cards')
      .insert({
        user_id: item.user_id,
        practice_item_id: item.id,
        segment_id: expressionDraft.segment?.id ?? null,
        source_expression: expressionDraft.source_expression.trim(),
        target_expression: expressionDraft.target_expression.trim(),
        context_sentence: expressionDraft.context_sentence.trim(),
        usage_context: expressionDraft.usage_context.trim(),
        category: expressionDraft.category,
        tags: tagsFromText(expressionDraft.tags),
        note: expressionDraft.note.trim(),
        next_review_at: new Date().toISOString(),
      })
    setModalSaving(false)
    if (error) {
      alert('表达卡保存失败：' + error.message)
      return
    }
    setExpressionDraft(null)
  }

  if (loading) {
    return (
      <div className="h-screen bg-canvas flex items-center justify-center text-sm text-ink-600">
        加载中...
      </div>
    )
  }

  if (!item) return null

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="bg-white rounded-2xl border border-line min-h-[calc(100vh-40px)]">
          <MainContent size="full" className="!px-6 sm:!px-10 xl:!px-14">
            <PageHeader
              backHref="/practice"
              backLabel="返回译训库"
              eyebrow="Practice Session"
              title={item.title}
              description={
                <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span>{displayDirection(item.direction)}</span>
                  <span>{item.exam_type}</span>
                  <span>{item.text_type}</span>
                  <span>难度 {item.difficulty}</span>
                  <span className={cn('rounded-full border px-2 py-0.5 text-[11px]', selectedStatus.cls)}>{selectedStatus.label}</span>
                </span>
              }
              actions={
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="primary" loading={saving} onClick={savePractice}>保存</Button>
                  <Button variant="secondary" onClick={() => splitSegments('paragraph')} loading={splitting}>开始对比</Button>
                  <Button variant="secondary" onClick={schedulePracticeReview}>加入复习</Button>
                  <Button variant="ghost" onClick={() => router.push('/practice')}>返回译训库</Button>
                </div>
              }
            />

            <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-6 mb-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <TextPane
                  eyebrow="Source"
                  title="原文"
                  value={sourceText}
                  onChange={setSourceText}
                  words={countPracticeWords(sourceText)}
                  placeholder="在这里整理原文"
                />
                <TextPane
                  eyebrow="My Draft"
                  title="我的译文"
                  value={myTranslation}
                  onChange={setMyTranslation}
                  words={countPracticeWords(myTranslation)}
                  placeholder="完成初译后再开始对照"
                />
                <Card padding="md" className="min-h-[420px]">
                  <Eyebrow tone="muted" className="mb-2">Reference</Eyebrow>
                  <h2 className="font-serif text-xl text-ink-900 mb-4">参考译文 / AI 译文</h2>
                  <Textarea
                    label={`参考译文 · ${countPracticeWords(referenceTranslation)} 字`}
                    value={referenceTranslation}
                    onChange={e => setReferenceTranslation(e.target.value)}
                    rows={8}
                    placeholder="粘贴参考译文"
                  />
                  <Textarea
                    className="mt-4"
                    label={`AI 译文 · ${countPracticeWords(aiTranslation)} 字`}
                    value={aiTranslation}
                    onChange={e => setAiTranslation(e.target.value)}
                    rows={5}
                    placeholder="生成 AI 参考译文后可继续修改并保存"
                  />
                </Card>
              </div>

              <Card padding="md" variant="surface" className="h-fit">
                <Card.Header>
                  <div>
                    <Eyebrow tone="muted" className="mb-2">Session</Eyebrow>
                    <h2 className="font-serif text-lg text-ink-900">练习设置</h2>
                  </div>
                </Card.Header>
                <div className="space-y-4">
                  <Select label="状态" value={status} onChange={e => setStatus(e.target.value)}>
                    {PRACTICE_STATUSES.map(value => <option key={value} value={value}>{practiceStatusMeta[value].label}</option>)}
                  </Select>
                  <div className="rounded-xl border border-line bg-white" style={{ padding: 16 }}>
                    <p className="text-xs text-ink-500 mb-1">标签</p>
                    <p className="text-sm text-ink-800 leading-relaxed">{tagsToText(item.tags) || '未添加标签'}</p>
                  </div>
                  <div className="rounded-xl border border-line bg-white" style={{ padding: 16 }}>
                    <p className="text-xs text-ink-500 mb-1">句段对比</p>
                    <p className="font-mono text-2xl text-ink-900">{segments.length}</p>
                  </div>
                  <div className="space-y-2 pt-1">
                    <Button variant="secondary" fullWidth loading={splitting} onClick={() => splitSegments('paragraph')}>按段落切分</Button>
                    <Button variant="secondary" fullWidth loading={splitting} onClick={() => splitSegments('sentence')}>按句号切分</Button>
                  </div>
                  <div className="border-t border-line pt-4">
                    <p className="text-xs text-ink-500 mb-3">AI 辅助</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="ghost" loading={aiTranslating} onClick={handleAiTranslate}>生成 AI 参考译文</Button>
                      <Button size="sm" variant="ghost" loading={aiAnalyzing} onClick={handleAiAnalyze}>分析我的译文问题</Button>
                      <Button size="sm" variant="ghost" loading={aiExpressionExtracting} onClick={handleAiExtractExpressions}>提取高频表达</Button>
                    </div>
                    {aiTranslationError && <p className="mt-3 text-xs text-red-600">{aiTranslationError}</p>}
                    {aiAnalysisError && <p className="mt-3 text-xs text-red-600">{aiAnalysisError}</p>}
                    {aiExpressionError && <p className="mt-3 text-xs text-red-600">{aiExpressionError}</p>}
                  </div>
                </div>
              </Card>
            </section>

            {aiAnalysis && (
              <section ref={aiAnalysisRef} className="mb-8 scroll-mt-6">
                <Card padding="lg" variant="surface">
                  <div className="flex flex-col gap-5 border-b border-line pb-5 mb-6 md:flex-row md:items-start md:justify-between">
                    <div>
                      <Eyebrow tone="brand" className="mb-2">AI Analysis</Eyebrow>
                      <h2 className="font-serif text-xl text-ink-900">译文问题分析</h2>
                    </div>
                    <p className="max-w-3xl text-sm text-ink-700 leading-relaxed">{aiAnalysis.summary}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(320px,1.2fr)]">
                    <AiResultList title="问题" items={aiAnalysis.issues} />
                    <AiResultList title="建议" items={aiAnalysis.suggestions} />
                    <div>
                      <p className="text-xs text-ink-500 mb-2">改写参考</p>
                      <p className="rounded-xl border border-line bg-white text-sm text-ink-800 leading-relaxed whitespace-pre-wrap" style={{ padding: 18 }}>
                        {aiAnalysis.improvedTranslation}
                      </p>
                    </div>
                  </div>
                </Card>
              </section>
            )}

            {aiExpressions && (
              <section ref={aiExpressionsRef} className="mb-8 scroll-mt-6">
                <Card padding="lg" variant="surface">
                  <div className="flex flex-col gap-5 border-b border-line pb-5 mb-6 md:flex-row md:items-start md:justify-between">
                    <div>
                      <Eyebrow tone="brand" className="mb-2">AI Expressions</Eyebrow>
                      <h2 className="font-serif text-xl text-ink-900">高频表达提取</h2>
                    </div>
                    <p className="max-w-3xl text-sm text-ink-700 leading-relaxed">
                      从原文筛选专有名词、重点名词、动词和形容词，译法按参考译文对齐。
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
                    {PRACTICE_EXPRESSION_CATEGORIES.map(category => (
                      <AiExpressionGroup
                        key={category}
                        category={category}
                        items={aiExpressions.expressions.filter(expression => expression.category === category)}
                        onCreateCard={openAiExpression}
                      />
                    ))}
                  </div>
                </Card>
              </section>
            )}

            <section id="practice-compare">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-line pb-5 mb-6">
                <div>
                  <Eyebrow tone="muted" className="mb-2">Segment Review</Eyebrow>
                  <h2 className="font-serif text-xl text-ink-900">句段切分与对比</h2>
                </div>
                <p className="text-xs text-ink-500">句段可单独改译文、参考译文、笔记，并沉淀问题与表达卡。</p>
              </div>

              {segments.length === 0 ? (
                <Card padding="lg" variant="surface" className="text-center py-16">
                  <h3 className="font-serif text-xl text-ink-900 mb-3">尚未切分句段</h3>
                  <p className="text-sm text-ink-600 mb-6">先保存篇章内容，再选择按段落或按句号切分进入对比模式。</p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" loading={splitting} onClick={() => splitSegments('paragraph')}>按段落切分</Button>
                    <Button variant="secondary" loading={splitting} onClick={() => splitSegments('sentence')}>按句号切分</Button>
                  </div>
                </Card>
              ) : (
                <SegmentTable
                  segments={segments}
                  issuesBySegment={issuesBySegment}
                  savingSegmentId={savingSegmentId}
                  onPatch={patchSegment}
                  onSave={saveSegment}
                  onIssue={openIssue}
                  onExpression={openExpression}
                  onReview={scheduleSegmentReview}
                />
              )}
            </section>
          </MainContent>
        </div>
      </main>

      {issueDraft && (
        <PracticeModal title="问题标记" description={`句段 ${issueDraft.segment.segment_order} 的复盘问题。`} onClose={() => setIssueDraft(null)}>
          <form onSubmit={createIssue} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="问题类型" value={issueDraft.issue_type} onChange={e => setIssueDraft(prev => prev && ({ ...prev, issue_type: e.target.value }))}>
                {PRACTICE_ISSUE_TYPES.map(value => <option key={value} value={value}>{value}</option>)}
              </Select>
              <Select label="严重程度" value={issueDraft.severity} onChange={e => setIssueDraft(prev => prev && ({ ...prev, severity: e.target.value }))}>
                {PRACTICE_ISSUE_SEVERITIES.map(value => <option key={value} value={value}>{value}</option>)}
              </Select>
            </div>
            <Textarea label="描述" value={issueDraft.description} onChange={e => setIssueDraft(prev => prev && ({ ...prev, description: e.target.value }))} rows={3} placeholder="哪里理解、术语或表达处理得不稳" />
            <Textarea label="建议" value={issueDraft.suggestion} onChange={e => setIssueDraft(prev => prev && ({ ...prev, suggestion: e.target.value }))} rows={3} placeholder="下次复盘时要检查什么" />
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={issueDraft.is_added_to_review}
                onChange={e => setIssueDraft(prev => prev && ({ ...prev, is_added_to_review: e.target.checked }))}
              />
              加入问题句段复习
            </label>
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="secondary" type="button" onClick={() => setIssueDraft(null)}>取消</Button>
              <Button variant="primary" type="submit" loading={modalSaving}>保存问题</Button>
            </div>
          </form>
        </PracticeModal>
      )}

      {expressionDraft && (
        <PracticeModal title="加入表达卡片" description="检查原文表达、推荐译法和使用场景后加入复习。" onClose={() => setExpressionDraft(null)}>
          <form onSubmit={createExpressionCard} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Textarea label="原文表达" value={expressionDraft.source_expression} onChange={e => setExpressionDraft(prev => prev && ({ ...prev, source_expression: e.target.value }))} rows={3} placeholder="复制原文中的表达" />
              <Textarea label="推荐译法" value={expressionDraft.target_expression} onChange={e => setExpressionDraft(prev => prev && ({ ...prev, target_expression: e.target.value }))} rows={3} placeholder="写下推荐译法" />
            </div>
            <Textarea label="例句" value={expressionDraft.context_sentence} onChange={e => setExpressionDraft(prev => prev && ({ ...prev, context_sentence: e.target.value }))} rows={3} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input label="使用场景" value={expressionDraft.usage_context} onChange={e => setExpressionDraft(prev => prev && ({ ...prev, usage_context: e.target.value }))} placeholder="政经综述、商务邮件..." />
              <Select label="分类" value={expressionDraft.category} onChange={e => setExpressionDraft(prev => prev && ({ ...prev, category: e.target.value }))}>
                {EXPRESSION_CARD_CATEGORIES.map(value => <option key={value} value={value}>{value}</option>)}
              </Select>
              <Input label="标签" value={expressionDraft.tags} onChange={e => setExpressionDraft(prev => prev && ({ ...prev, tags: e.target.value }))} placeholder="政策，固定搭配" />
            </div>
            <Textarea label="笔记" value={expressionDraft.note} onChange={e => setExpressionDraft(prev => prev && ({ ...prev, note: e.target.value }))} rows={3} placeholder="记录适用限制或替代表达" />
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="secondary" type="button" onClick={() => setExpressionDraft(null)}>取消</Button>
              <Button variant="primary" type="submit" loading={modalSaving}>保存并加入今日复习</Button>
            </div>
          </form>
        </PracticeModal>
      )}
    </div>
  )
}

function AiResultList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs text-ink-500 mb-1">{title}</p>
      <ul className="space-y-1 text-sm text-ink-800 list-disc pl-4">
        {items.map(item => <li key={item}>{item}</li>)}
      </ul>
    </div>
  )
}

function AiExpressionGroup({
  category,
  items,
  onCreateCard,
}: {
  category: PracticeExpressionCategory
  items: PracticeAiExpression[]
  onCreateCard: (item: PracticeAiExpression) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-canvas/60" style={{ padding: '14px 16px' }}>
        <p className="text-sm font-medium text-ink-900">{category}</p>
        <span className="rounded-full border border-line bg-white px-2 py-0.5 font-mono text-[11px] text-ink-500">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-ink-500" style={{ padding: 16 }}>未提取到合适表达</p>
      ) : (
        <div className="divide-y divide-line">
          {items.map((item, index) => (
            <article key={`${item.sourceExpression}-${item.referenceTranslation}-${index}`} style={{ padding: 16 }}>
              <p className="text-sm font-medium text-ink-900 leading-relaxed break-words">{item.sourceExpression}</p>
              <p className="mt-2 text-sm text-ink-700 leading-relaxed break-words">
                <span className="mr-2 text-xs text-ink-500">参考译法</span>
                {item.referenceTranslation}
              </p>
              {item.note && <p className="mt-2 text-xs text-ink-500 leading-relaxed">{item.note}</p>}
              <Button className="mt-3" size="sm" variant="ghost" onClick={() => onCreateCard(item)}>加入表达卡片</Button>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function expressionCardCategory(category: PracticeExpressionCategory) {
  return category === '动词' || category === '形容词' ? '高频词组' : '术语表达'
}

function expressionTextIncludes(text: string, expression: string) {
  return compactExpressionText(text).includes(compactExpressionText(expression))
}

function compactExpressionText(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}

function TextPane({
  eyebrow,
  title,
  value,
  words,
  placeholder,
  onChange,
}: {
  eyebrow: string
  title: string
  value: string
  words: number
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <Card padding="md" className="min-h-[420px] flex flex-col">
      <Eyebrow tone="muted" className="mb-2">{eyebrow}</Eyebrow>
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="font-serif text-xl text-ink-900">{title}</h2>
        <span className="text-xs text-ink-500 font-mono">{words} 字</span>
      </div>
      <Textarea value={value} onChange={e => onChange(e.target.value)} rows={18} placeholder={placeholder} className="flex-1" inputClassName="min-h-[330px]" />
    </Card>
  )
}

function SegmentTable({
  segments,
  issuesBySegment,
  savingSegmentId,
  onPatch,
  onSave,
  onIssue,
  onExpression,
  onReview,
}: {
  segments: TranslationPracticeSegment[]
  issuesBySegment: Record<string, TranslationPracticeIssue[]>
  savingSegmentId: string | null
  onPatch: (id: string, patch: Partial<TranslationPracticeSegment>) => void
  onSave: (segment: TranslationPracticeSegment) => void
  onIssue: (segment: TranslationPracticeSegment) => void
  onExpression: (segment: TranslationPracticeSegment) => void
  onReview: (segment: TranslationPracticeSegment) => void
}) {
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[1440px]">
          <div className="grid grid-cols-[56px_minmax(250px,1fr)_minmax(250px,1fr)_minmax(250px,1fr)_180px_220px_180px] gap-4 bg-canvas/60 border-b border-line text-[11px] uppercase tracking-wider text-ink-500" style={{ padding: '16px 22px' }}>
            <span>编号</span><span>原文</span><span>我的译文</span><span>参考译文</span><span>问题标记</span><span>笔记</span><span className="text-right">操作</span>
          </div>
          {segments.map((segment, index) => (
            <div key={segment.id} className={cn('grid grid-cols-[56px_minmax(250px,1fr)_minmax(250px,1fr)_minmax(250px,1fr)_180px_220px_180px] gap-4 items-start', index > 0 && 'border-t border-line')} style={{ padding: '18px 22px' }}>
              <span className="font-mono text-sm text-ink-500 pt-4">{segment.segment_order}</span>
              <Textarea value={segment.source_text} onChange={e => onPatch(segment.id, { source_text: e.target.value })} rows={5} inputClassName="text-sm" />
              <Textarea value={segment.my_translation} onChange={e => onPatch(segment.id, { my_translation: e.target.value })} rows={5} inputClassName="text-sm" placeholder="我的句段译文" />
              <Textarea value={segment.reference_translation} onChange={e => onPatch(segment.id, { reference_translation: e.target.value })} rows={5} inputClassName="text-sm" placeholder="参考句段译文" />
              <div className="space-y-2 pt-1">
                {(issuesBySegment[segment.id] ?? []).length === 0 ? (
                  <span className="text-xs text-ink-400">未标记</span>
                ) : (
                  (issuesBySegment[segment.id] ?? []).map(issue => (
                    <div key={issue.id} className="rounded-lg border border-line bg-surface text-xs text-ink-700" style={{ padding: '8px 10px' }}>
                      <p className="font-medium text-ink-900">{issue.issue_type}</p>
                      <p className="mt-1">{issue.severity}{issue.is_added_to_review ? ' · 待复习' : ''}</p>
                    </div>
                  ))
                )}
              </div>
              <Textarea value={segment.note} onChange={e => onPatch(segment.id, { note: e.target.value })} rows={5} inputClassName="text-sm" placeholder="复盘笔记" />
              <div className="flex flex-col items-stretch gap-2">
                <Button size="sm" variant="primary" loading={savingSegmentId === segment.id} onClick={() => onSave(segment)}>保存句段</Button>
                <Button size="sm" variant="secondary" onClick={() => onIssue(segment)}>标记问题</Button>
                <Button size="sm" variant="ghost" onClick={() => onExpression(segment)}>加入表达卡片</Button>
                <Button size="sm" variant="ghost" onClick={() => onReview(segment)}>加入复习</Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

function PracticeModal({
  title,
  description,
  children,
  onClose,
}: {
  title: string
  description: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-[var(--shadow-modal)] max-h-[calc(100vh-32px)] overflow-auto w-full max-w-3xl" style={{ padding: 40 }}>
        <div className="flex items-start justify-between gap-5 mb-7">
          <div>
            <h2 className="font-serif text-2xl text-ink-900 mb-2">{title}</h2>
            <p className="text-sm text-ink-600 leading-relaxed">{description}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} title="关闭">关闭</Button>
        </div>
        {children}
      </div>
    </div>
  )
}
