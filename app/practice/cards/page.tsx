'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { PageHeader } from '@/components/ui/PageHeader'
import { MainContent } from '@/components/ui/MainContent'
import { cn } from '@/components/ui/cn'
import { supabase } from '@/lib/supabase'
import {
  EXPRESSION_CARD_CATEGORIES,
  familiarityLevel,
  familiarityMeta,
  formatPracticeDate,
  tagsFromText,
  tagsToText,
  type ExpressionCard,
} from '@/lib/translationPractice'

type CardDraft = {
  card: ExpressionCard
  source_expression: string
  target_expression: string
  context_sentence: string
  usage_context: string
  category: string
  tags: string
  note: string
  familiarity_level: string
}

export default function ExpressionCardsPage() {
  const router = useRouter()
  const [cards, setCards] = useState<ExpressionCard[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [familiarityFilter, setFamiliarityFilter] = useState('all')
  const [draft, setDraft] = useState<CardDraft | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      router.push('/')
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('expression_cards')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('updated_at', { ascending: false })
    if (error) {
      setCards([])
      setLoading(false)
      return
    }
    setCards((data ?? []) as ExpressionCard[])
    setLoading(false)
  }, [router])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const filteredCards = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return cards.filter(card => {
      if (categoryFilter !== 'all' && card.category !== categoryFilter) return false
      if (familiarityFilter !== 'all' && card.familiarity_level !== familiarityFilter) return false
      if (!normalized) return true
      return [
        card.source_expression,
        card.target_expression,
        card.category,
        card.note,
        ...(card.tags ?? []),
      ].join(' ').toLowerCase().includes(normalized)
    })
  }, [cards, categoryFilter, familiarityFilter, query])

  function editCard(card: ExpressionCard) {
    setDraft({
      card,
      source_expression: card.source_expression,
      target_expression: card.target_expression,
      context_sentence: card.context_sentence,
      usage_context: card.usage_context || '',
      category: card.category,
      tags: tagsToText(card.tags),
      note: card.note,
      familiarity_level: familiarityLevel(card.familiarity_level),
    })
  }

  async function saveCard(e: React.FormEvent) {
    e.preventDefault()
    if (!draft) return
    if (!draft.source_expression.trim()) {
      alert('请填写原文表达。')
      return
    }
    setSaving(true)
    const { data, error } = await supabase
      .from('expression_cards')
      .update({
        source_expression: draft.source_expression.trim(),
        target_expression: draft.target_expression.trim(),
        context_sentence: draft.context_sentence.trim(),
        usage_context: draft.usage_context.trim(),
        category: draft.category,
        tags: tagsFromText(draft.tags),
        note: draft.note.trim(),
        familiarity_level: familiarityLevel(draft.familiarity_level),
      })
      .eq('id', draft.card.id)
      .select()
      .single()
    setSaving(false)
    if (error || !data) {
      alert('表达卡保存失败：' + (error?.message ?? '未知错误'))
      return
    }
    setCards(prev => prev.map(card => card.id === draft.card.id ? data as ExpressionCard : card))
    setDraft(null)
  }

  async function deleteCard(card: ExpressionCard) {
    if (!confirm(`确认删除表达卡「${card.source_expression}」？`)) return
    const { error } = await supabase.from('expression_cards').delete().eq('id', card.id)
    if (error) {
      alert('删除失败：' + error.message)
      return
    }
    setCards(prev => prev.filter(row => row.id !== card.id))
  }

  async function addToday(card: ExpressionCard) {
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('expression_cards')
      .update({ next_review_at: now })
      .eq('id', card.id)
      .select()
      .single()
    if (error || !data) {
      alert('加入今日复习失败：' + (error?.message ?? '未知错误'))
      return
    }
    setCards(prev => prev.map(row => row.id === card.id ? data as ExpressionCard : row))
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
              eyebrow="Expression Cards"
              title="表达卡片"
              description="整理练习中值得反复记忆的表达、译法和使用场景。"
              actions={
                <>
                  <Button variant="secondary" onClick={() => router.push('/practice/review')}>今日复习</Button>
                  <Button variant="ghost" onClick={() => router.push('/practice')}>练习篇章</Button>
                </>
              }
            />

            <Card padding="md" className="mb-7">
              <div className="grid grid-cols-1 md:grid-cols-[minmax(280px,1fr)_220px_220px] gap-4 items-end">
                <Input label="搜索" value={query} onChange={e => setQuery(e.target.value)} placeholder="原文、译法、分类、标签或笔记" />
                <Select label="分类" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                  <option value="all">全部</option>
                  {EXPRESSION_CARD_CATEGORIES.map(value => <option key={value} value={value}>{value}</option>)}
                </Select>
                <Select label="熟练度" value={familiarityFilter} onChange={e => setFamiliarityFilter(e.target.value)}>
                  <option value="all">全部</option>
                  <option value="new">新卡</option>
                  <option value="learning">学习中</option>
                  <option value="mastered">已掌握</option>
                </Select>
              </div>
            </Card>

            {loading ? (
              <Card padding="lg" className="text-center text-sm text-ink-500">加载中...</Card>
            ) : cards.length === 0 ? (
              <Card padding="lg" variant="surface" className="text-center py-20">
                <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <span className="font-serif text-2xl text-brand">卡</span>
                </div>
                <h2 className="font-serif text-xl text-ink-900 mb-3">还没有表达卡片</h2>
                <p className="text-sm text-ink-600 mb-7">在句段对比中截取原文表达和推荐译法，卡片会自动进入复习队列。</p>
                <Button variant="primary" onClick={() => router.push('/practice')}>回到练习篇章</Button>
              </Card>
            ) : filteredCards.length === 0 ? (
              <Card padding="lg" className="text-center text-sm text-ink-500">当前筛选条件下没有表达卡片。</Card>
            ) : (
              <Card padding="none" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <div className="min-w-[1080px]">
                    <div className="grid grid-cols-[minmax(210px,1fr)_minmax(210px,1fr)_120px_minmax(160px,0.8fr)_100px_150px_210px] gap-4 bg-canvas/60 border-b border-line text-[11px] uppercase tracking-wider text-ink-500" style={{ padding: '16px 24px' }}>
                      <span>原文表达</span><span>推荐译法</span><span>分类</span><span>标签</span><span>熟练度</span><span>下次复习</span><span className="text-right">操作</span>
                    </div>
                    {filteredCards.map((card, index) => {
                      const meta = familiarityMeta[familiarityLevel(card.familiarity_level)]
                      return (
                        <div key={card.id} className={cn('grid grid-cols-[minmax(210px,1fr)_minmax(210px,1fr)_120px_minmax(160px,0.8fr)_100px_150px_210px] gap-4 items-center text-sm', index > 0 && 'border-t border-line')} style={{ padding: '20px 24px' }}>
                          <div className="min-w-0">
                            <p className="text-ink-900 font-medium leading-relaxed break-words">{card.source_expression}</p>
                            {card.usage_context && <p className="text-xs text-ink-500 mt-1 truncate">{card.usage_context}</p>}
                          </div>
                          <p className="text-ink-700 leading-relaxed break-words">{card.target_expression || '待补充'}</p>
                          <span className="text-ink-700">{card.category}</span>
                          <span className="text-xs text-ink-600 truncate">{tagsToText(card.tags) || '未标记'}</span>
                          <span className={cn('inline-flex w-fit rounded-full border px-2 py-1 text-[11px]', meta.cls)}>{meta.label}</span>
                          <span className="text-xs text-ink-600">{formatPracticeDate(card.next_review_at)}</span>
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => editCard(card)}>编辑</Button>
                            <Button size="sm" variant="ghost" onClick={() => addToday(card)}>加入今日复习</Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteCard(card)}>删除</Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </Card>
            )}
          </MainContent>
        </div>
      </main>

      {draft && (
        <div className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-[var(--shadow-modal)] w-full max-w-3xl max-h-[calc(100vh-32px)] overflow-auto" style={{ padding: 40 }}>
            <div className="flex items-start justify-between gap-4 mb-7">
              <div>
                <Eyebrow tone="muted" className="mb-2">Edit Card</Eyebrow>
                <h2 className="font-serif text-2xl text-ink-900">编辑表达卡片</h2>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>关闭</Button>
            </div>
            <form onSubmit={saveCard} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Textarea label="原文表达" value={draft.source_expression} onChange={e => setDraft(prev => prev && ({ ...prev, source_expression: e.target.value }))} rows={3} />
                <Textarea label="推荐译法" value={draft.target_expression} onChange={e => setDraft(prev => prev && ({ ...prev, target_expression: e.target.value }))} rows={3} />
              </div>
              <Textarea label="例句" value={draft.context_sentence} onChange={e => setDraft(prev => prev && ({ ...prev, context_sentence: e.target.value }))} rows={3} />
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Input label="使用场景" value={draft.usage_context} onChange={e => setDraft(prev => prev && ({ ...prev, usage_context: e.target.value }))} />
                <Select label="分类" value={draft.category} onChange={e => setDraft(prev => prev && ({ ...prev, category: e.target.value }))}>
                  {EXPRESSION_CARD_CATEGORIES.map(value => <option key={value} value={value}>{value}</option>)}
                </Select>
                <Select label="熟练度" value={draft.familiarity_level} onChange={e => setDraft(prev => prev && ({ ...prev, familiarity_level: e.target.value }))}>
                  <option value="new">新卡</option>
                  <option value="learning">学习中</option>
                  <option value="mastered">已掌握</option>
                </Select>
                <Input label="标签" value={draft.tags} onChange={e => setDraft(prev => prev && ({ ...prev, tags: e.target.value }))} />
              </div>
              <Textarea label="笔记" value={draft.note} onChange={e => setDraft(prev => prev && ({ ...prev, note: e.target.value }))} rows={3} />
              <div className="flex justify-end gap-3 pt-1">
                <Button variant="secondary" type="button" onClick={() => setDraft(null)}>取消</Button>
                <Button variant="primary" type="submit" loading={saving}>保存</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
