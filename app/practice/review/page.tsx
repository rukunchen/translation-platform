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
} from '@/lib/translationPractice'

export default function PracticeReviewPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [cards, setCards] = useState<ExpressionCard[]>([])
  const [reviewIssues, setReviewIssues] = useState<TranslationPracticeIssue[]>([])
  const [reviewItems, setReviewItems] = useState<TranslationPracticeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [revealed, setRevealed] = useState(false)
  const [savingResult, setSavingResult] = useState<ReviewResult | null>(null)

  const load = useCallback(async (uid: string) => {
    setLoading(true)
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
        .order('next_review_at', { ascending: true }),
    ])
    setCards((cardRes.data ?? []) as ExpressionCard[])
    setReviewIssues((issueRes.data ?? []) as TranslationPracticeIssue[])
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

  const current = cards[0]
  const completedCount = useMemo(() => Math.max(0, cards.length - (current ? 1 : 0)), [cards.length, current])

  async function recordResult(result: ReviewResult) {
    if (!current || !userId) return
    setSavingResult(result)
    const nextReview = nextReviewDate(result)
    const nextStreak = result === 'remembered' ? (current.remembered_streak ?? 0) + 1 : 0
    const nextFamiliarity = nextStreak >= 3
      ? 'mastered'
      : current.familiarity_level === 'new' || result !== 'remembered'
        ? 'learning'
        : familiarityLevel(current.familiarity_level)
    const { data, error } = await supabase
      .from('expression_cards')
      .update({
        next_review_at: nextReview,
        review_count: (current.review_count ?? 0) + 1,
        remembered_streak: nextStreak,
        familiarity_level: nextFamiliarity,
      })
      .eq('id', current.id)
      .select()
      .single()
    if (!error) {
      await supabase.from('practice_review_logs').insert({
        user_id: userId,
        review_type: 'expression_card',
        target_id: current.id,
        result,
        next_review_at: nextReview,
      })
    }
    setSavingResult(null)
    if (error || !data) {
      alert('复习结果保存失败：' + (error?.message ?? '未知错误'))
      return
    }
    setCards(prev => prev.filter(card => card.id !== current.id))
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
              description="MVP 先处理表达卡片。问题句段和待重译篇章保留队列，后续可继续扩展为专门复盘题。"
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
                ) : !current ? (
                  <Card padding="lg" variant="surface" className="text-center py-20">
                    <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                      <span className="font-serif text-2xl text-brand">复</span>
                    </div>
                    <h2 className="font-serif text-xl text-ink-900 mb-3">今天没有待复习表达卡</h2>
                    <p className="text-sm text-ink-600 leading-relaxed max-w-lg mx-auto mb-7">
                      可以回到句段对比继续积累表达，或在表达卡片页把已有卡片加入今日复习。
                    </p>
                    <Button variant="primary" onClick={() => router.push('/practice/cards')}>查看表达卡片</Button>
                  </Card>
                ) : (
                  <Card padding="lg" className="min-h-[520px] flex flex-col">
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5 mb-8">
                      <div>
                        <Eyebrow tone="muted" className="mb-2">Expression Review</Eyebrow>
                        <h2 className="font-serif text-2xl text-ink-900">表达卡片 {cards.length} 张待复习</h2>
                      </div>
                      <span className={cn('rounded-full border px-2.5 py-1 text-[11px]', familiarityMeta[familiarityLevel(current.familiarity_level)].cls)}>
                        {familiarityMeta[familiarityLevel(current.familiarity_level)].label}
                      </span>
                    </div>
                    <button
                      className="flex-1 rounded-2xl border border-line bg-surface text-left transition-colors hover:border-brand/40"
                      style={{ padding: '36px' }}
                      onClick={() => setRevealed(value => !value)}
                    >
                      <p className="text-xs uppercase tracking-[0.18em] text-ink-500 mb-5">{revealed ? '背面' : '正面'}</p>
                      <p className="font-serif text-3xl text-ink-900 leading-relaxed break-words">{current.source_expression}</p>
                      {revealed ? (
                        <div className="mt-8 space-y-5 border-t border-line pt-7">
                          <ReviewDetail label="推荐译法" value={current.target_expression || '待补充'} />
                          <ReviewDetail label="例句" value={current.context_sentence || '未记录'} />
                          <ReviewDetail label="笔记" value={current.note || '未记录'} />
                        </div>
                      ) : (
                        <p className="text-sm text-ink-500 mt-8">点击卡片查看译法、例句和笔记。</p>
                      )}
                    </button>
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
                {current && (
                  <Card padding="md">
                    <p className="text-xs text-ink-500 mb-2">当前卡片</p>
                    <p className="text-sm text-ink-900 leading-relaxed break-words mb-3">{tagsToText(current.tags) || current.category}</p>
                    <p className="text-xs text-ink-500">原复习时间：{formatPracticeDate(current.next_review_at)}</p>
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
