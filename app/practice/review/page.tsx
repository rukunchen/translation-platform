'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { PageHeader } from '@/components/ui/PageHeader'
import { MainContent } from '@/components/ui/MainContent'
import { cn } from '@/components/ui/cn'
import { supabase } from '@/lib/supabase'
import {
  familiarityLevel,
  familiarityMeta,
  formatPracticeDate,
  nextReviewDate,
  tagsToText,
  type ExpressionCard,
  type ReviewResult,
  type TranslationPracticeIssue,
  type TranslationPracticeItem,
  type TranslationPracticeSegment,
} from '@/lib/translationPractice'

type ReviewIssue = TranslationPracticeIssue & {
  segment: TranslationPracticeSegment | null
  practiceItem: TranslationPracticeItem | null
  reviewDueAt: string | null
}

type ReviewTask =
  | { kind: 'expression_card'; id: string; dueAt: string; card: ExpressionCard }
  | { kind: 'issue_segment'; id: string; dueAt: string; issue: ReviewIssue }
  | { kind: 'practice_item'; id: string; dueAt: string; item: TranslationPracticeItem }

type ReviewLogRow = {
  target_id: string
  next_review_at: string
  created_at: string
}

export default function PracticeReviewPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [cards, setCards] = useState<ExpressionCard[]>([])
  const [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>([])
  const [reviewItems, setReviewItems] = useState<TranslationPracticeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [savingResult, setSavingResult] = useState<ReviewResult | null>(null)
  const [completedCount, setCompletedCount] = useState(0)

  const load = useCallback(async (uid: string) => {
    setLoading(true)
    setLoadError('')
    setCompletedCount(0)
    const now = new Date().toISOString()
    const [cardRes, issueRes, itemRes] = await Promise.all([
      supabase
        .from('expression_cards')
        .select('*')
        .eq('user_id', uid)
        .lte('next_review_at', now)
        .order('next_review_at', { ascending: true }),
      supabase
        .from('translation_practice_issues')
        .select('*')
        .eq('is_added_to_review', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('translation_practice_items')
        .select('*')
        .eq('user_id', uid)
        .eq('status', 'review_due')
        .lte('next_review_at', now)
        .order('next_review_at', { ascending: true }),
    ])

    const firstError = cardRes.error || issueRes.error || itemRes.error
    if (firstError) {
      setLoadError(firstError.message)
      setCards([])
      setReviewIssues([])
      setReviewItems([])
      setLoading(false)
      return
    }

    const issueRows = (issueRes.data ?? []) as TranslationPracticeIssue[]
    const issueIds = issueRows.map(issue => issue.id)
    const segmentIds = Array.from(new Set(issueRows.map(issue => issue.segment_id).filter(Boolean))) as string[]
    const issuePracticeItemIds = Array.from(new Set(issueRows.map(issue => issue.practice_item_id)))

    const [segmentRes, issueItemRes, issueLogRes] = await Promise.all([
      segmentIds.length > 0
        ? supabase.from('translation_practice_segments').select('*').in('id', segmentIds)
        : Promise.resolve({ data: [] as TranslationPracticeSegment[], error: null }),
      issuePracticeItemIds.length > 0
        ? supabase.from('translation_practice_items').select('*').eq('user_id', uid).in('id', issuePracticeItemIds)
        : Promise.resolve({ data: [] as TranslationPracticeItem[], error: null }),
      issueIds.length > 0
        ? supabase
            .from('practice_review_logs')
            .select('target_id, next_review_at, created_at')
            .eq('user_id', uid)
            .eq('review_type', 'issue_segment')
            .in('target_id', issueIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as ReviewLogRow[], error: null }),
    ])

    const relationError = segmentRes.error || issueItemRes.error || issueLogRes.error
    if (relationError) {
      setLoadError(relationError.message)
      setCards([])
      setReviewIssues([])
      setReviewItems([])
      setLoading(false)
      return
    }

    const segmentsById = new Map(
      ((segmentRes.data ?? []) as TranslationPracticeSegment[]).map(segment => [segment.id, segment])
    )
    const itemsById = new Map(
      ((issueItemRes.data ?? []) as TranslationPracticeItem[]).map(item => [item.id, item])
    )
    const latestIssueLogs = new Map<string, ReviewLogRow>()
    for (const log of (issueLogRes.data ?? []) as ReviewLogRow[]) {
      if (!latestIssueLogs.has(log.target_id)) latestIssueLogs.set(log.target_id, log)
    }
    const nowMs = Date.now()
    const dueIssues = issueRows
      .filter(issue => {
        const log = latestIssueLogs.get(issue.id)
        return !log || new Date(log.next_review_at).getTime() <= nowMs
      })
      .map(issue => {
        const log = latestIssueLogs.get(issue.id)
        return {
          ...issue,
          segment: issue.segment_id ? segmentsById.get(issue.segment_id) ?? null : null,
          practiceItem: itemsById.get(issue.practice_item_id) ?? null,
          reviewDueAt: log?.next_review_at ?? null,
        }
      })

    setCards((cardRes.data ?? []) as ExpressionCard[])
    setReviewIssues(dueIssues)
    setReviewItems((itemRes.data ?? []) as TranslationPracticeItem[])
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      setUserId(user.id)
      void load(user.id)
    })
  }, [load, router])

  const reviewQueue = useMemo<ReviewTask[]>(() => {
    return [
      ...cards.map(card => ({
        kind: 'expression_card' as const,
        id: card.id,
        dueAt: card.next_review_at || card.created_at,
        card,
      })),
      ...reviewIssues.map(issue => ({
        kind: 'issue_segment' as const,
        id: issue.id,
        dueAt: issue.reviewDueAt || issue.created_at,
        issue,
      })),
      ...reviewItems.map(item => ({
        kind: 'practice_item' as const,
        id: item.id,
        dueAt: item.next_review_at || item.updated_at,
        item,
      })),
    ].sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  }, [cards, reviewIssues, reviewItems])

  const currentTask = reviewQueue[0]

  async function recordResult(result: ReviewResult) {
    if (!currentTask || !userId) return
    setSavingResult(result)
    const nextReview = nextReviewDate(result)

    let errorMessage = ''
    if (currentTask.kind === 'expression_card') {
      const current = currentTask.card
      const nextStreak = result === 'remembered' ? (current.remembered_streak ?? 0) + 1 : 0
      const nextFamiliarity = nextStreak >= 3
        ? 'mastered'
        : current.familiarity_level === 'new' || result !== 'remembered'
          ? 'learning'
          : familiarityLevel(current.familiarity_level)
      const { error } = await supabase
        .from('expression_cards')
        .update({
          next_review_at: nextReview,
          review_count: (current.review_count ?? 0) + 1,
          remembered_streak: nextStreak,
          familiarity_level: nextFamiliarity,
        })
        .eq('id', current.id)
      if (error) {
        errorMessage = error.message
      } else {
        const { error: logError } = await supabase.from('practice_review_logs').insert({
          user_id: userId,
          review_type: 'expression_card',
          target_id: current.id,
          result,
          next_review_at: nextReview,
        })
        if (logError) errorMessage = logError.message
      }
      if (!errorMessage) setCards(prev => prev.filter(card => card.id !== current.id))
    } else if (currentTask.kind === 'issue_segment') {
      const { error } = await supabase.from('practice_review_logs').insert({
        user_id: userId,
        review_type: 'issue_segment',
        target_id: currentTask.issue.id,
        result,
        next_review_at: nextReview,
      })
      if (error) errorMessage = error.message
      if (!errorMessage) setReviewIssues(prev => prev.filter(issue => issue.id !== currentTask.issue.id))
    } else {
      const { error } = await supabase
        .from('translation_practice_items')
        .update({ status: 'review_due', next_review_at: nextReview })
        .eq('id', currentTask.item.id)
      if (error) {
        errorMessage = error.message
      } else {
        const { error: logError } = await supabase.from('practice_review_logs').insert({
          user_id: userId,
          review_type: 'practice_item',
          target_id: currentTask.item.id,
          result,
          next_review_at: nextReview,
        })
        if (logError) errorMessage = logError.message
      }
      if (!errorMessage) setReviewItems(prev => prev.filter(item => item.id !== currentTask.item.id))
    }

    setSavingResult(null)
    if (errorMessage) {
      alert('复习结果保存失败：' + errorMessage)
      return
    }
    setCompletedCount(count => count + 1)
    setRevealed(false)
  }

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="bg-white rounded-2xl border border-line min-h-[calc(100vh-40px)]">
          <MainContent size="wide">
            <PageHeader
              backHref="/practice"
              backLabel="返回译训库"
              eyebrow="Daily Review"
              title="今日复习"
              description="按间隔处理表达卡片、问题句段和待重译篇章。"
              actions={
                <>
                  <Button variant="secondary" onClick={() => router.push('/practice/cards')}>表达卡片</Button>
                  <Button variant="ghost" onClick={() => router.push('/practice')}>练习篇章</Button>
                </>
              }
            />

            <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
              <div>
                {loading ? (
                  <Card padding="lg" className="text-center text-sm text-ink-500">加载中...</Card>
                ) : loadError ? (
                  <Card padding="lg" className="text-center text-sm text-red-700">{loadError}</Card>
                ) : !currentTask ? (
                  <Card padding="lg" variant="surface" className="text-center py-20">
                    <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                      <span className="font-serif text-2xl text-brand">复</span>
                    </div>
                    <h2 className="font-serif text-xl text-ink-900 mb-3">今天没有待复习内容</h2>
                    <p className="text-sm text-ink-600 leading-relaxed max-w-lg mx-auto mb-7">
                      可以回到句段对比继续积累表达、标记问题，或把篇章加入复习。
                    </p>
                    <Button variant="primary" onClick={() => router.push('/practice/cards')}>查看表达卡片</Button>
                  </Card>
                ) : (
                  <Card padding="lg" className="min-h-[520px] flex flex-col">
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5 mb-8">
                      <div>
                        <Eyebrow tone="muted" className="mb-2">{taskEyebrow(currentTask)}</Eyebrow>
                        <h2 className="font-serif text-2xl text-ink-900">{taskTitle(currentTask)}</h2>
                      </div>
                      <span className={cn('rounded-full border px-2.5 py-1 text-[11px]', taskBadge(currentTask).cls)}>
                        {taskBadge(currentTask).label}
                      </span>
                    </div>
                    <button
                      className="flex-1 rounded-2xl border border-line bg-surface text-left transition-colors hover:border-brand/40"
                      style={{ padding: '36px' }}
                      onClick={() => setRevealed(value => !value)}
                    >
                      <p className="text-xs uppercase tracking-[0.18em] text-ink-500 mb-5">{revealed ? '背面' : '正面'}</p>
                      <TaskFace task={currentTask} revealed={revealed} />
                    </button>
                    {taskPracticeHref(currentTask) && (
                      <Button
                        className="mt-4"
                        variant="ghost"
                        onClick={() => router.push(taskPracticeHref(currentTask) || '/practice')}
                      >
                        {currentTask.kind === 'issue_segment' ? '打开句段所在篇章' : '打开篇章重译'}
                      </Button>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
                      <Button variant="secondary" loading={savingResult === 'forgot'} onClick={() => recordResult('forgot')}>完全忘了</Button>
                      <Button variant="secondary" loading={savingResult === 'fuzzy'} onClick={() => recordResult('fuzzy')}>有点模糊</Button>
                      <Button variant="primary" loading={savingResult === 'remembered'} onClick={() => recordResult('remembered')}>记住了</Button>
                    </div>
                  </Card>
                )}
              </div>

              <div className="space-y-5">
                <Card padding="md" variant="surface">
                  <Card.Header>
                    <div>
                      <Eyebrow tone="muted" className="mb-2">Review Queue</Eyebrow>
                      <h2 className="font-serif text-lg text-ink-900">今日队列</h2>
                    </div>
                  </Card.Header>
                  <div className="space-y-3">
                    <QueueLine label="表达卡片" value={cards.length} />
                    <QueueLine label="问题句段" value={reviewIssues.length} />
                    <QueueLine label="待重译篇章" value={reviewItems.length} />
                    {completedCount > 0 && <QueueLine label="本轮已处理" value={completedCount} />}
                  </div>
                </Card>
                <Card padding="md">
                  <Eyebrow tone="muted" className="mb-2">Interval</Eyebrow>
                  <h2 className="font-serif text-lg text-ink-900 mb-4">间隔规则</h2>
                  <div className="space-y-3 text-sm text-ink-700">
                    <p>完全忘了：1 天后复习</p>
                    <p>有点模糊：3 天后复习</p>
                    <p>记住了：7 天后复习</p>
                    <p className="text-ink-500 leading-relaxed">连续 3 次记住后，表达卡熟练度自动标为已掌握。</p>
                  </div>
                </Card>
                {currentTask && (
                  <Card padding="md">
                    <p className="text-xs text-ink-500 mb-2">当前任务</p>
                    <p className="text-sm text-ink-900 leading-relaxed break-words mb-3">{taskSidebarText(currentTask)}</p>
                    <p className="text-xs text-ink-500">原复习时间：{formatPracticeDate(currentTask.dueAt)}</p>
                  </Card>
                )}
              </div>
            </section>
          </MainContent>
        </div>
      </main>
    </div>
  )
}

function taskEyebrow(task: ReviewTask): string {
  if (task.kind === 'expression_card') return 'Expression Review'
  if (task.kind === 'issue_segment') return 'Issue Segment'
  return 'Retranslation'
}

function taskTitle(task: ReviewTask): string {
  if (task.kind === 'expression_card') return '表达卡片复习'
  if (task.kind === 'issue_segment') return '问题句段复盘'
  return '待重译篇章'
}

function taskBadge(task: ReviewTask): { label: string; cls: string } {
  if (task.kind === 'expression_card') {
    return familiarityMeta[familiarityLevel(task.card.familiarity_level)]
  }
  if (task.kind === 'issue_segment') {
    const severityClass = {
      轻微: 'border-blue-100 bg-blue-50 text-blue-800',
      中等: 'border-amber-100 bg-amber-50 text-amber-800',
      严重: 'border-red-100 bg-red-50 text-red-700',
    }[task.issue.severity] || 'border-line bg-canvas text-ink-600'
    return { label: task.issue.severity || '问题', cls: severityClass }
  }
  return { label: task.item.text_type || task.item.exam_type || '篇章', cls: 'border-rose-100 bg-rose-50 text-rose-800' }
}

function taskPracticeHref(task: ReviewTask): string | null {
  if (task.kind === 'issue_segment') return task.issue.practiceItem ? `/practice/${task.issue.practiceItem.id}` : null
  if (task.kind === 'practice_item') return `/practice/${task.item.id}`
  return null
}

function taskSidebarText(task: ReviewTask): string {
  if (task.kind === 'expression_card') return tagsToText(task.card.tags) || task.card.category
  if (task.kind === 'issue_segment') {
    const itemTitle = task.issue.practiceItem?.title || '未知篇章'
    return `${itemTitle} · ${task.issue.issue_type}`
  }
  return `${task.item.title} · ${tagsToText(task.item.tags) || task.item.text_type}`
}

function TaskFace({ task, revealed }: { task: ReviewTask; revealed: boolean }) {
  if (task.kind === 'expression_card') {
    return (
      <>
        <p className="font-serif text-3xl text-ink-900 leading-relaxed break-words">{task.card.source_expression}</p>
        {revealed ? (
          <div className="mt-8 space-y-5 border-t border-line pt-7">
            <ReviewDetail label="推荐译法" value={task.card.target_expression || '待补充'} />
            <ReviewDetail label="例句" value={task.card.context_sentence || '未记录'} />
            <ReviewDetail label="笔记" value={task.card.note || '未记录'} />
          </div>
        ) : (
          <p className="text-sm text-ink-500 mt-8">点击卡片查看译法、例句和笔记。</p>
        )}
      </>
    )
  }

  if (task.kind === 'issue_segment') {
    const issue = task.issue
    const segment = issue.segment
    return (
      <>
        <div className="space-y-5">
          <ReviewDetail label="问题类型" value={`${issue.issue_type}${issue.severity ? ` · ${issue.severity}` : ''}`} />
          <ReviewDetail label="原文句段" value={segment?.source_text || '未记录句段原文'} />
          <ReviewDetail label="我的译文" value={segment?.my_translation || '未记录我的译文'} />
          <ReviewDetail label="问题说明" value={issue.description || '句段待复盘'} />
        </div>
        {revealed ? (
          <div className="mt-8 space-y-5 border-t border-line pt-7">
            <ReviewDetail label="修改建议" value={issue.suggestion || '未记录'} />
            <ReviewDetail label="参考译文" value={segment?.reference_translation || '未记录'} />
            <ReviewDetail label="AI 译文" value={segment?.ai_translation || '未记录'} />
            <ReviewDetail label="句段笔记" value={segment?.note || '未记录'} />
          </div>
        ) : (
          <p className="text-sm text-ink-500 mt-8">点击卡片查看建议、参考译文和句段笔记。</p>
        )}
      </>
    )
  }

  return (
    <>
      <div className="space-y-5">
        <p className="font-serif text-2xl text-ink-900 leading-relaxed break-words">{task.item.title}</p>
        <ReviewDetail label="原文" value={task.item.source_text || '未记录原文'} />
        <ReviewDetail label="我的译文" value={task.item.my_translation || '未记录我的译文'} />
      </div>
      {revealed ? (
        <div className="mt-8 space-y-5 border-t border-line pt-7">
          <ReviewDetail label="参考译文" value={task.item.reference_translation || '未记录'} />
          <ReviewDetail label="AI 译文" value={task.item.ai_translation || '未记录'} />
          <ReviewDetail label="来源说明" value={task.item.source_note || '未记录'} />
          <ReviewDetail label="标签" value={tagsToText(task.item.tags) || '未记录'} />
        </div>
      ) : (
        <p className="text-sm text-ink-500 mt-8">点击卡片查看参考译文、AI 译文和来源说明。</p>
      )}
    </>
  )
}

function ReviewDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ink-500 mb-1">{label}</p>
      <p className="text-base text-ink-800 leading-relaxed break-words">{value}</p>
    </div>
  )
}

function QueueLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-line bg-white" style={{ padding: '13px 15px' }}>
      <span className="text-sm text-ink-600">{label}</span>
      <span className="font-mono text-lg text-ink-900">{value}</span>
    </div>
  )
}
