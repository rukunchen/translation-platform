'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { PageHeader } from '@/components/ui/PageHeader'
import { MainContent } from '@/components/ui/MainContent'
import { supabase } from '@/lib/supabase'

type StudyScope = 'category' | 'my-termbook'
type StudyDirection = 'zh-en' | 'en-zh' | 'random'
type ResolvedDirection = 'zh-en' | 'en-zh'
type StudyOrder = 'sequential' | 'random'
type StatusFilter = 'all' | 'unmastered' | 'learning' | 'mastered'

type TermCategory = {
  id: string
  name: string
  description: string | null
}

type PublicTerm = {
  id: string
  source_text: string
  target_text: string
  definition: string | null
  example_sentence: string | null
  tags: string[] | null
}

type TermbookItem = {
  id: string
  public_term_id: string | null
  source_text: string
  target_text: string
  definition: string | null
  example_sentence: string | null
  personal_tags: string[] | null
  mastery_status: string | null
  review_count: number | null
}

type StudyTerm = {
  key: string
  publicTermId: string | null
  termbookItemId: string | null
  source_text: string
  target_text: string
  definition: string | null
  example_sentence: string | null
  tags: string[] | null
  mastery_status: string | null
  review_count: number | null
}

type StudyCard = {
  term: StudyTerm
  direction: ResolvedDirection
}

export default function TermStudyPage() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [category, setCategory] = useState<TermCategory | null>(null)
  const [categoryTerms, setCategoryTerms] = useState<PublicTerm[]>([])
  const [termbookItems, setTermbookItems] = useState<TermbookItem[]>([])
  const [scope, setScope] = useState<StudyScope>('my-termbook')
  const [direction, setDirection] = useState<StudyDirection>('zh-en')
  const [order, setOrder] = useState<StudyOrder>('sequential')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [deck, setDeck] = useState<StudyCard[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [knownCount, setKnownCount] = useState(0)
  const [unsureCount, setUnsureCount] = useState(0)
  const [completed, setCompleted] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')
    const search = new URLSearchParams(window.location.search)
    const nextCategoryId = search.get('categoryId') || ''
    const nextScope: StudyScope = search.get('scope') === 'my-termbook' ? 'my-termbook' : nextCategoryId ? 'category' : 'my-termbook'
    setCategoryId(nextCategoryId)
    setScope(nextScope)

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      router.push('/')
      return
    }
    setUserId(userData.user.id)

    const termbookRes = await supabase
      .from('user_termbook_items')
      .select('id, public_term_id, source_text, target_text, definition, example_sentence, personal_tags, mastery_status, review_count')
      .eq('user_id', userData.user.id)
      .order('updated_at', { ascending: false })

    if (termbookRes.error) {
      setErrorMessage(termbookRes.error.message)
      setLoading(false)
      return
    }

    setTermbookItems((termbookRes.data ?? []) as TermbookItem[])

    if (nextCategoryId) {
      const [categoryRes, termsRes] = await Promise.all([
        supabase
          .from('term_categories')
          .select('id, name, description')
          .eq('id', nextCategoryId)
          .maybeSingle(),
        supabase
          .from('public_terms')
          .select('id, source_text, target_text, definition, example_sentence, tags')
          .eq('category_id', nextCategoryId)
          .order('source_text', { ascending: true }),
      ])

      if (categoryRes.error || !categoryRes.data) {
        setErrorMessage(categoryRes.error?.message ?? '分类不存在或无权访问。')
        setLoading(false)
        return
      }
      if (termsRes.error) {
        setErrorMessage(termsRes.error.message)
        setLoading(false)
        return
      }

      setCategory(categoryRes.data as TermCategory)
      setCategoryTerms((termsRes.data ?? []) as PublicTerm[])
    }

    setLoading(false)
  }, [router])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const termbookByPublicTermId = useMemo(() => {
    const out = new Map<string, TermbookItem>()
    for (const item of termbookItems) {
      if (item.public_term_id) out.set(item.public_term_id, item)
    }
    return out
  }, [termbookItems])

  const availableTerms = useMemo(() => {
    const terms: StudyTerm[] = scope === 'category'
      ? categoryTerms.map(term => {
        const item = termbookByPublicTermId.get(term.id)
        return {
          key: term.id,
          publicTermId: term.id,
          termbookItemId: item?.id ?? null,
          source_text: term.source_text,
          target_text: term.target_text,
          definition: term.definition,
          example_sentence: term.example_sentence,
          tags: term.tags,
          mastery_status: item?.mastery_status ?? null,
          review_count: item?.review_count ?? 0,
        }
      })
      : termbookItems.map(item => ({
        key: item.id,
        publicTermId: item.public_term_id,
        termbookItemId: item.id,
        source_text: item.source_text,
        target_text: item.target_text,
        definition: item.definition,
        example_sentence: item.example_sentence,
        tags: item.personal_tags,
        mastery_status: item.mastery_status ?? 'new',
        review_count: item.review_count ?? 0,
      }))

    if (statusFilter === 'all') return terms
    if (statusFilter === 'unmastered') return terms.filter(term => term.mastery_status !== 'mastered')
    return terms.filter(term => term.mastery_status === statusFilter)
  }, [categoryTerms, scope, statusFilter, termbookByPublicTermId, termbookItems])

  const currentCard = deck[currentIndex] ?? null

  function startRound() {
    const nextDeck = availableTerms.map(term => ({
      term,
      direction: direction === 'random' ? randomDirection() : direction,
    }))
    setDeck(order === 'random' ? shuffle(nextDeck) : nextDeck)
    setCurrentIndex(0)
    setIsFlipped(false)
    setKnownCount(0)
    setUnsureCount(0)
    setCompleted(nextDeck.length === 0)
  }

  function advanceCard() {
    if (currentIndex + 1 >= deck.length) {
      setCompleted(true)
      setIsFlipped(false)
      return
    }
    setCurrentIndex(index => index + 1)
    setIsFlipped(false)
  }

  async function markCurrent(nextStatus: 'mastered' | 'learning') {
    if (!currentCard || !userId) return
    setReviewing(true)
    const updated = await updateReviewState(currentCard.term, nextStatus)
    setReviewing(false)
    if (!updated) return

    if (nextStatus === 'mastered') setKnownCount(count => count + 1)
    if (nextStatus === 'learning') setUnsureCount(count => count + 1)
    advanceCard()
  }

  async function updateReviewState(term: StudyTerm, nextStatus: 'mastered' | 'learning') {
    const now = new Date().toISOString()
    const nextReviewCount = (term.review_count ?? 0) + 1

    if (term.termbookItemId) {
      const { error } = await supabase
        .from('user_termbook_items')
        .update({
          mastery_status: nextStatus,
          review_count: nextReviewCount,
          last_reviewed_at: now,
        })
        .eq('id', term.termbookItemId)
        .eq('user_id', userId)
      if (error) {
        alert('更新复习状态失败：' + error.message)
        return false
      }
      applyLocalReviewUpdate(term, nextStatus, nextReviewCount, term.termbookItemId)
      return true
    }

    if (!term.publicTermId || !confirm('该词条尚未加入我的词条本。是否加入并记录本次复习？')) {
      return false
    }

    const { data, error } = await supabase
      .from('user_termbook_items')
      .insert({
        user_id: userId,
        public_term_id: term.publicTermId,
        source_text: term.source_text,
        target_text: term.target_text,
        definition: term.definition,
        example_sentence: term.example_sentence,
        personal_tags: term.tags,
        mastery_status: nextStatus,
        review_count: 1,
        last_reviewed_at: now,
      })
      .select('id, public_term_id, source_text, target_text, definition, example_sentence, personal_tags, mastery_status, review_count')
      .single()

    if (error || !data) {
      alert('加入词条本失败：' + (error?.message ?? '未知错误'))
      return false
    }

    const newItem = data as TermbookItem
    setTermbookItems(prev => [newItem, ...prev])
    applyLocalReviewUpdate(term, nextStatus, 1, newItem.id)
    return true
  }

  function applyLocalReviewUpdate(term: StudyTerm, nextStatus: 'mastered' | 'learning', nextReviewCount: number, termbookItemId: string) {
    setDeck(prev => prev.map(card => card.term.key === term.key ? {
      ...card,
      term: {
        ...card.term,
        termbookItemId,
        mastery_status: nextStatus,
        review_count: nextReviewCount,
      },
    } : card))
    setTermbookItems(prev => prev.map(item => item.id === termbookItemId ? {
      ...item,
      mastery_status: nextStatus,
      review_count: nextReviewCount,
    } : item))
  }

  function exitHref() {
    if (scope === 'category' && categoryId) return `/practice/terms/category/${categoryId}`
    return '/practice/terms'
  }

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="min-h-[calc(100vh-40px)] rounded-2xl border border-line bg-white">
          <MainContent size="wide">
            <PageHeader
              backHref={exitHref()}
              backLabel="退出学习"
              eyebrow="Term Cards"
              title="卡片学习"
              description={scope === 'category' ? category?.name ?? '当前分类' : '我的词条本'}
              actions={<Button variant="secondary" onClick={() => router.push(exitHref())}>退出学习</Button>}
            />

            <Card padding="md" className="mb-8 border-line/80">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:items-end">
                <Select label="学习范围" value={scope} onChange={event => setScope(event.target.value as StudyScope)}>
                  <option value="category" disabled={!categoryId}>当前分类</option>
                  <option value="my-termbook">我的词条本</option>
                </Select>
                <Select label="学习方向" value={direction} onChange={event => setDirection(event.target.value as StudyDirection)}>
                  <option value="zh-en">中文 → 英文</option>
                  <option value="en-zh">英文 → 中文</option>
                  <option value="random">随机</option>
                </Select>
                <Select label="卡片顺序" value={order} onChange={event => setOrder(event.target.value as StudyOrder)}>
                  <option value="sequential">顺序</option>
                  <option value="random">随机</option>
                </Select>
                <Select label="掌握状态" value={statusFilter} onChange={event => setStatusFilter(event.target.value as StatusFilter)}>
                  <option value="all">全部</option>
                  <option value="unmastered">未掌握</option>
                  <option value="learning">学习中</option>
                  <option value="mastered">已掌握</option>
                </Select>
                <Button variant="primary" onClick={startRound} disabled={loading || availableTerms.length === 0}>开始学习</Button>
              </div>
            </Card>

            {loading ? (
              <Card padding="lg" className="text-center text-sm text-ink-500">加载中...</Card>
            ) : errorMessage ? (
              <Card padding="lg" className="py-20 text-center">
                <h2 className="mb-3 font-serif text-xl text-ink-900">无法开始学习</h2>
                <p className="mb-7 text-sm text-ink-600">{errorMessage}</p>
                <Button variant="secondary" onClick={() => router.push('/practice/terms')}>返回词条学习</Button>
              </Card>
            ) : availableTerms.length === 0 ? (
              <Card padding="lg" className="py-20 text-center">
                <h2 className="mb-3 font-serif text-xl text-ink-900">当前范围没有可学习词条。</h2>
                <p className="text-sm text-ink-600">请调整掌握状态筛选，或先加入词条本。</p>
              </Card>
            ) : completed && deck.length > 0 ? (
              <StudyComplete
                total={deck.length}
                knownCount={knownCount}
                unsureCount={unsureCount}
                onRestart={startRound}
                onBackTermbook={() => router.push('/practice/terms')}
                onBackCategory={() => router.push(categoryId ? `/practice/terms/category/${categoryId}` : '/practice/terms')}
                showCategoryButton={!!categoryId}
              />
            ) : currentCard ? (
              <section className="mx-auto flex min-h-[calc(100dvh-190px)] max-w-3xl flex-col justify-center md:min-h-0">
                <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
                  <ProgressPill label="进度" value={`第 ${currentIndex + 1} / ${deck.length} 张`} />
                  <ProgressPill label="已掌握" value={`${knownCount}`} />
                  <ProgressPill label="学习中" value={`${unsureCount}`} />
                </div>
                <StudyCardView card={currentCard} isFlipped={isFlipped} />
                <div className="sticky bottom-[92px] z-10 mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-line bg-white/95 p-2 shadow-[0_-12px_30px_rgba(31,30,29,0.08)] backdrop-blur md:static md:flex md:flex-wrap md:justify-center md:border-0 md:bg-transparent md:p-0 md:shadow-none">
                  <Button className="col-span-2 md:col-span-1" variant="secondary" onClick={() => setIsFlipped(flipped => !flipped)}>翻面</Button>
                  <Button variant="primary" onClick={() => markCurrent('mastered')} loading={reviewing}>认识</Button>
                  <Button variant="secondary" onClick={() => markCurrent('learning')} disabled={reviewing}>不熟</Button>
                  <Button variant="ghost" onClick={advanceCard} disabled={reviewing}>下一张</Button>
                  <Button variant="ghost" onClick={() => router.push(exitHref())}>退出学习</Button>
                </div>
              </section>
            ) : (
              <Card padding="lg" className="py-20 text-center">
                <h2 className="mb-3 font-serif text-xl text-ink-900">准备开始本轮学习。</h2>
                <p className="mb-7 text-sm text-ink-600">当前设置下共有 {availableTerms.length} 条词条。</p>
                <Button variant="primary" onClick={startRound}>开始学习</Button>
              </Card>
            )}
          </MainContent>
        </div>
      </main>
    </div>
  )
}

function StudyCardView({ card, isFlipped }: { card: StudyCard; isFlipped: boolean }) {
  const front = card.direction === 'zh-en' ? card.term.source_text : card.term.target_text
  const backPrimary = card.direction === 'zh-en' ? card.term.target_text : card.term.source_text

  return (
    <Card padding="lg" className="min-h-[320px] border-line/80 sm:min-h-[360px]">
      <div className="flex min-h-[240px] flex-col justify-center sm:min-h-[280px]">
        <Eyebrow tone="muted" className="mb-5">{isFlipped ? 'Back' : 'Front'}</Eyebrow>
        {!isFlipped ? (
          <h2 className="break-words text-center font-serif text-[clamp(2.25rem,10vw,3.4rem)] leading-tight text-ink-900">{front}</h2>
        ) : (
          <div className="space-y-6">
            <h2 className="break-words text-center font-serif text-[clamp(2rem,8vw,3rem)] leading-tight text-ink-900">{backPrimary}</h2>
            <div className="space-y-4 border-t border-line pt-5">
              <StudyDetail label="解释" value={card.term.definition || '暂无解释'} />
              <StudyDetail label="例句" value={card.term.example_sentence || '暂无例句'} />
              <div>
                <p className="mb-2 text-[11px] text-ink-500">标签</p>
                {card.term.tags && card.term.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {card.term.tags.map(tag => (
                      <span key={tag} className="rounded-full border border-line bg-canvas px-2.5 py-1 text-xs text-ink-600">{tag}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-500">未标记</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

function StudyComplete({
  total,
  knownCount,
  unsureCount,
  onRestart,
  onBackTermbook,
  onBackCategory,
  showCategoryButton,
}: {
  total: number
  knownCount: number
  unsureCount: number
  onRestart: () => void
  onBackTermbook: () => void
  onBackCategory: () => void
  showCategoryButton: boolean
}) {
  return (
    <Card padding="lg" className="mx-auto max-w-2xl py-20 text-center">
      <h2 className="mb-4 font-serif text-3xl text-ink-900">本轮学习完成</h2>
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ProgressPill label="本轮词条数" value={`${total}`} />
        <ProgressPill label="标记认识" value={`${knownCount}`} />
        <ProgressPill label="标记不熟" value={`${unsureCount}`} />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={onRestart}>再来一轮</Button>
        <Button variant="secondary" onClick={onBackTermbook}>返回词条本</Button>
        {showCategoryButton && <Button variant="ghost" onClick={onBackCategory}>返回分类</Button>}
      </div>
    </Card>
  )
}

function StudyDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[11px] text-ink-500">{label}</p>
      <p className="break-words text-sm leading-relaxed text-ink-700">{value}</p>
    </div>
  )
}

function ProgressPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface/70 px-4 py-3 text-center">
      <p className="mb-1 text-[11px] text-ink-500">{label}</p>
      <p className="font-mono text-sm text-ink-900">{value}</p>
    </div>
  )
}

function randomDirection(): ResolvedDirection {
  return Math.random() > 0.5 ? 'zh-en' : 'en-zh'
}

function shuffle<T>(items: T[]) {
  const out = [...items]
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = out[index]
    out[index] = out[swapIndex]
    out[swapIndex] = current
  }
  return out
}
