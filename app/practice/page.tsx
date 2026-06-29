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
  PRACTICE_DIFFICULTIES,
  PRACTICE_DIRECTIONS,
  PRACTICE_EXAM_TYPES,
  PRACTICE_STATUSES,
  PRACTICE_TEXT_TYPES,
  countPracticeWords,
  displayDirection,
  formatPracticeDate,
  practiceStatus,
  practiceStatusMeta,
  tagsFromText,
  tagsToText,
  toPracticeDirection,
  type ExpressionCard,
  type TranslationPracticeIssue,
  type TranslationPracticeItem,
} from '@/lib/translationPractice'

type CreateMode = 'practice' | 'import' | null

function titleIncludes(item: TranslationPracticeItem, query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return `${item.title} ${item.source_note} ${(item.tags ?? []).join(' ')}`.toLowerCase().includes(normalized)
}

export default function TranslationPracticeHomePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [items, setItems] = useState<TranslationPracticeItem[]>([])
  const [issues, setIssues] = useState<TranslationPracticeIssue[]>([])
  const [cards, setCards] = useState<ExpressionCard[]>([])
  const [loading, setLoading] = useState(true)
  const [createMode, setCreateMode] = useState<CreateMode>(null)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [directionFilter, setDirectionFilter] = useState('all')
  const [examFilter, setExamFilter] = useState('all')
  const [textTypeFilter, setTextTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [difficultyFilter, setDifficultyFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')

  const [title, setTitle] = useState('')
  const [direction, setDirection] = useState('E-C')
  const [examType, setExamType] = useState('CATTI')
  const [textType, setTextType] = useState('政治')
  const [difficulty, setDifficulty] = useState('3')
  const [sourceText, setSourceText] = useState('')
  const [referenceTranslation, setReferenceTranslation] = useState('')
  const [sourceNote, setSourceNote] = useState('')
  const [tags, setTags] = useState('')

  const load = useCallback(async (uid: string) => {
    setLoading(true)
    const [itemRes, issueRes, cardRes] = await Promise.all([
      supabase.from('translation_practice_items').select('*').eq('user_id', uid).order('updated_at', { ascending: false }),
      supabase.from('translation_practice_issues').select('*').order('created_at', { ascending: false }),
      supabase.from('expression_cards').select('*').eq('user_id', uid).order('updated_at', { ascending: false }),
    ])
    if (itemRes.error) {
      setItems([])
      setIssues([])
      setCards([])
      setLoading(false)
      return
    }
    setItems((itemRes.data ?? []) as TranslationPracticeItem[])
    setIssues((issueRes.data ?? []) as TranslationPracticeIssue[])
    setCards((cardRes.data ?? []) as ExpressionCard[])
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user
      if (!user) { router.push('/'); return }
      setUserId(user.id)
      void load(user.id)
    })
  }, [load, router])

  const issueCounts = useMemo(() => {
    return issues.reduce<Record<string, number>>((out, issue) => {
      out[issue.practice_item_id] = (out[issue.practice_item_id] ?? 0) + 1
      return out
    }, {})
  }, [issues])

  const cardCounts = useMemo(() => {
    return cards.reduce<Record<string, number>>((out, card) => {
      if (card.practice_item_id) out[card.practice_item_id] = (out[card.practice_item_id] ?? 0) + 1
      return out
    }, {})
  }, [cards])

  const topIssue = useMemo(() => {
    const counts = issues.reduce<Record<string, number>>((out, issue) => {
      out[issue.issue_type] = (out[issue.issue_type] ?? 0) + 1
      return out
    }, {})
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  }, [issues])

  const today = new Date()
  const dueCards = cards.filter(card => card.next_review_at && new Date(card.next_review_at) <= today).length
  const dueItems = items.filter(item => item.next_review_at && new Date(item.next_review_at) <= today).length
  const practicedCount = items.filter(item => practiceStatus(item.status) !== 'unpracticed').length
  const tagsInUse = useMemo(
    () => Array.from(new Set(items.flatMap(item => item.tags ?? []))).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [items]
  )

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (!titleIncludes(item, query)) return false
      if (directionFilter !== 'all' && item.direction !== directionFilter) return false
      if (examFilter !== 'all' && item.exam_type !== examFilter) return false
      if (textTypeFilter !== 'all' && item.text_type !== textTypeFilter) return false
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (difficultyFilter !== 'all' && String(item.difficulty) !== difficultyFilter) return false
      if (tagFilter !== 'all' && !(item.tags ?? []).includes(tagFilter)) return false
      return true
    })
  }, [difficultyFilter, directionFilter, examFilter, items, query, statusFilter, tagFilter, textTypeFilter])

  function resetCreateForm() {
    setTitle('')
    setDirection('E-C')
    setExamType('CATTI')
    setTextType('政治')
    setDifficulty('3')
    setSourceText('')
    setReferenceTranslation('')
    setSourceNote('')
    setTags('')
  }

  async function createPractice(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    if (!title.trim() || !sourceText.trim()) {
      alert('请填写标题和原文。')
      return
    }
    setCreating(true)
    const { data, error } = await supabase
      .from('translation_practice_items')
      .insert({
        user_id: userId,
        title: title.trim(),
        direction: toPracticeDirection(direction),
        exam_type: examType,
        text_type: textType,
        difficulty: Number(difficulty),
        source_text: sourceText.trim(),
        reference_translation: referenceTranslation.trim(),
        source_note: sourceNote.trim(),
        tags: tagsFromText(tags),
      })
      .select()
      .single()
    setCreating(false)
    if (error || !data) {
      alert('创建失败：' + (error?.message ?? '未知错误'))
      return
    }
    setCreateMode(null)
    resetCreateForm()
    router.push(`/practice/${data.id}`)
  }

  async function deletePractice(item: TranslationPracticeItem) {
    if (!confirm(`确认删除练习「${item.title}」？其句段和问题标记也会删除，已保存的表达卡片会保留。`)) return
    const { error } = await supabase.from('translation_practice_items').delete().eq('id', item.id)
    if (error) {
      alert('删除失败：' + error.message)
      return
    }
    setItems(prev => prev.filter(row => row.id !== item.id))
    setIssues(prev => prev.filter(row => row.practice_item_id !== item.id))
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
              eyebrow="Translation Practice Lab"
              title="译训库"
              description="翻译备考练习与篇章复盘。保存练习材料，完成原文、我的译文与参考译文对照，再把问题和表达带入复习。"
              actions={
                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:w-auto md:flex-wrap md:justify-end">
                  <Button className="w-full md:w-auto" variant="primary" onClick={() => setCreateMode('practice')}>新建练习</Button>
                  <Button className="w-full md:w-auto" variant="secondary" onClick={() => setCreateMode('import')}>导入材料</Button>
                  <Button className="w-full md:w-auto" variant="secondary" onClick={() => router.push('/practice/review')}>今日复习</Button>
                  <Button className="w-full md:w-auto" variant="ghost" onClick={() => router.push('/practice/cards')}>表达卡片</Button>
                </div>
              }
            />

            <section className="mb-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <PracticeEntryCard
                eyebrow="Exam Center"
                title="CATTI 模考中心"
                description="二笔、二口实务训练与模考报告。"
                buttonLabel="进入模考中心"
                tone="rose"
                onOpen={() => router.push('/practice/catti')}
              />
              <PracticeEntryCard
                eyebrow="Term Learning"
                title="词条学习"
                description="热词分类、卡片记忆与个人词条本"
                buttonLabel="进入词条学习"
                tone="cyan"
                onOpen={() => router.push('/practice/terms')}
              />
            </section>

            <section className="mb-12 overflow-hidden rounded-[30px] border border-line bg-gradient-to-br from-white via-surface/70 to-white shadow-[0_20px_70px_rgba(39,35,28,0.08)]">
              <div className="flex flex-col gap-4 border-b border-line/80 px-7 py-6 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <Eyebrow tone="muted" className="mb-2">Practice Overview</Eyebrow>
                  <h2 className="font-serif text-2xl text-ink-900">学习概览</h2>
                  <p className="mt-2 text-sm leading-relaxed text-ink-500">
                    把练习进度、复盘任务、表达沉淀和高频问题分开统计，方便判断下一步该做什么。
                  </p>
                </div>
                <div className="inline-flex w-fit items-center rounded-full border border-line bg-white px-4 py-2 text-xs text-ink-500 shadow-sm">
                  今日待处理：{dueCards + dueItems} 项
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 p-7 sm:grid-cols-2 xl:grid-cols-4">
                <PracticeMetric label="已练篇章" value={practicedCount} note={`共 ${items.length} 篇材料`} tone="amber" />
                <PracticeMetric label="待复习" value={dueCards + dueItems} note={`${dueCards} 张表达卡`} tone="blue" />
                <PracticeMetric label="表达卡片" value={cards.length} note="复盘中可继续补充" tone="violet" />
                <PracticeMetric label="高频问题类型" value={topIssue?.[1] ?? 0} note={topIssue?.[0] ?? '暂无问题标记'} tone="emerald" />
              </div>
            </section>

            <section className="mb-9">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <Eyebrow tone="muted" className="mb-2">Practice Library</Eyebrow>
                  <h2 className="font-serif text-2xl text-ink-900">练习篇章</h2>
                </div>
                <p className="text-xs text-ink-500">{filteredItems.length} / {items.length} 篇材料</p>
              </div>
              <Card padding="none" className="overflow-hidden border-line/80 shadow-[0_18px_55px_rgba(39,35,28,0.06)]">
                <div className="flex flex-col gap-3 border-b border-line bg-surface/60 px-7 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-ink-900">筛选条件</h3>
                    <p className="mt-1 text-xs text-ink-500">先按来源和考试类型定位材料，再用状态、难度和标签缩小范围。</p>
                  </div>
                  <button
                    type="button"
                    className="w-fit rounded-full border border-line bg-white px-3.5 py-1.5 text-xs text-ink-500 shadow-sm transition-colors hover:border-ink-300 hover:text-ink-900"
                    onClick={() => {
                      setQuery('')
                      setDirectionFilter('all')
                      setExamFilter('all')
                      setTextTypeFilter('all')
                      setStatusFilter('all')
                      setDifficultyFilter('all')
                      setTagFilter('all')
                    }}
                  >
                    清空筛选
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-x-5 gap-y-6 px-7 py-7 sm:grid-cols-2 xl:grid-cols-4">
                  <Input
                    label="搜索 / 标签"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="标题、来源或标签"
                  />
                  <Select label="语言方向" value={directionFilter} onChange={e => setDirectionFilter(e.target.value)}>
                    <option value="all">全部</option>
                    <option value="E-C">E-C</option>
                    <option value="C-E">C-E</option>
                    <option value="custom">自定义</option>
                  </Select>
                  <Select label="考试类型" value={examFilter} onChange={e => setExamFilter(e.target.value)}>
                    <option value="all">全部</option>
                    {PRACTICE_EXAM_TYPES.map(value => <option key={value} value={value}>{value}</option>)}
                  </Select>
                  <Select label="文本类型" value={textTypeFilter} onChange={e => setTextTypeFilter(e.target.value)}>
                    <option value="all">全部</option>
                    {PRACTICE_TEXT_TYPES.map(value => <option key={value} value={value}>{value}</option>)}
                  </Select>
                  <Select label="状态" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="all">全部</option>
                    {PRACTICE_STATUSES.map(value => <option key={value} value={value}>{practiceStatusMeta[value].label}</option>)}
                  </Select>
                  <Select label="难度" value={difficultyFilter} onChange={e => setDifficultyFilter(e.target.value)}>
                    <option value="all">全部</option>
                    {PRACTICE_DIFFICULTIES.map(value => <option key={value} value={String(value)}>{value}</option>)}
                  </Select>
                  <Select label="标签" value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
                    <option value="all">全部</option>
                    {tagsInUse.map(value => <option key={value} value={value}>{value}</option>)}
                  </Select>
                </div>
              </Card>
            </section>

            <div className="mt-8">
              {loading ? (
                <Card padding="lg" className="text-center text-sm text-ink-500">加载中...</Card>
              ) : items.length === 0 ? (
                <Card padding="lg" className="text-center py-20">
                  <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <span className="font-serif text-2xl text-brand">训</span>
                  </div>
                  <h2 className="font-serif text-xl text-ink-900 mb-3">还没有翻译练习。</h2>
                  <p className="text-sm text-ink-600 leading-relaxed max-w-xl mx-auto mb-7">
                    先粘贴一篇 CATTI、MTI、课程或商务材料，完成初译后再切分句段做对照复盘。
                  </p>
                  <Button variant="primary" onClick={() => setCreateMode('practice')}>创建第一篇练习</Button>
                </Card>
              ) : filteredItems.length === 0 ? (
                <Card padding="lg" className="text-center text-sm text-ink-500">当前筛选条件下没有练习篇章。</Card>
              ) : (
                <PracticeTable
                  items={filteredItems}
                  issueCounts={issueCounts}
                  cardCounts={cardCounts}
                  onOpen={id => router.push(`/practice/${id}`)}
                  onDelete={deletePractice}
                />
              )}
            </div>
          </MainContent>
        </div>
      </main>

      {createMode && (
        <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[calc(100vh-32px)] overflow-auto shadow-[var(--shadow-modal)]" style={{ padding: 42 }}>
            <h2 className="font-serif text-2xl text-ink-900 mb-2">
              {createMode === 'import' ? '导入练习材料' : '新建翻译练习'}
            </h2>
            <p className="text-sm text-ink-600 leading-relaxed mb-7">
              {createMode === 'import'
                ? 'MVP 先支持粘贴文本导入。保存后可在编辑页补充我的译文、切分句段和标记问题。'
                : '记录原文与可选参考译文，创建后进入篇章练习页。'}
            </p>
            <form onSubmit={createPractice} className="space-y-5">
              <Input label="标题" value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：CATTI 政府报告练习 01" required />
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Select label="语言方向" value={direction} onChange={e => setDirection(e.target.value)}>
                  {PRACTICE_DIRECTIONS.map(value => (
                    <option key={value} value={value === '自定义' ? 'custom' : value}>{value}</option>
                  ))}
                </Select>
                <Select label="考试类型" value={examType} onChange={e => setExamType(e.target.value)}>
                  {PRACTICE_EXAM_TYPES.map(value => <option key={value} value={value}>{value}</option>)}
                </Select>
                <Select label="文本类型" value={textType} onChange={e => setTextType(e.target.value)}>
                  {PRACTICE_TEXT_TYPES.map(value => <option key={value} value={value}>{value}</option>)}
                </Select>
                <Select label="难度" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                  {PRACTICE_DIFFICULTIES.map(value => <option key={value} value={String(value)}>{value}</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Textarea label="原文" value={sourceText} onChange={e => setSourceText(e.target.value)} rows={9} placeholder="粘贴练习原文" required />
                <Textarea label="参考译文（可选）" value={referenceTranslation} onChange={e => setReferenceTranslation(e.target.value)} rows={9} placeholder="可稍后在编辑页补充" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="来源说明（可选）" value={sourceNote} onChange={e => setSourceNote(e.target.value)} placeholder="书目、课程或题库来源" />
                <Input label="标签（可选）" value={tags} onChange={e => setTags(e.target.value)} placeholder="CATTI，政经，长难句" />
              </div>
              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <Button variant="secondary" type="button" onClick={() => { setCreateMode(null); resetCreateForm() }}>取消</Button>
                <Button variant="primary" type="submit" loading={creating}>{creating ? '创建中...' : '创建并开始练习'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function PracticeEntryCard({
  eyebrow,
  title,
  description,
  buttonLabel,
  tone,
  onOpen,
}: {
  eyebrow: string
  title: string
  description: string
  buttonLabel: string
  tone: keyof typeof practiceMetricTone
  onOpen: () => void
}) {
  const entryTone = practiceMetricTone[tone]
  return (
    <div
      className="group relative overflow-hidden rounded-[28px] border shadow-[0_16px_45px_rgba(39,35,28,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(39,35,28,0.10)]"
      style={{ padding: 30, ...entryTone.style }}
    >
      <div className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-white/55 blur-2xl transition-transform duration-500 group-hover:scale-125" />
      <div className="relative flex h-full min-h-[132px] flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 max-w-xl">
          <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/70 bg-white/70 font-serif text-lg text-ink-800 shadow-sm">
            {title.slice(0, 1)}
          </div>
          <Eyebrow tone="muted" className="mb-2">{eyebrow}</Eyebrow>
          <h2 className="font-serif text-2xl text-ink-900">{title}</h2>
          <p className="mt-3 text-sm leading-7 text-ink-600">{description}</p>
        </div>
        <Button variant="secondary" className="shrink-0" onClick={onOpen}>{buttonLabel}</Button>
      </div>
    </div>
  )
}

const practiceMetricTone = {
  rose: {
    style: { backgroundColor: 'rgb(255 241 242 / 0.56)', borderColor: 'rgb(255 228 230)' },
    valueClass: 'text-rose-800',
  },
  cyan: {
    style: { backgroundColor: 'rgb(236 254 255 / 0.58)', borderColor: 'rgb(207 250 254)' },
    valueClass: 'text-cyan-800',
  },
  amber: {
    style: { backgroundColor: 'rgb(255 251 235 / 0.62)', borderColor: 'rgb(254 243 199)' },
    valueClass: 'text-amber-800',
  },
  blue: {
    style: { backgroundColor: 'rgb(239 246 255 / 0.58)', borderColor: 'rgb(219 234 254)' },
    valueClass: 'text-blue-800',
  },
  violet: {
    style: { backgroundColor: 'rgb(245 243 255 / 0.58)', borderColor: 'rgb(237 233 254)' },
    valueClass: 'text-violet-800',
  },
  emerald: {
    style: { backgroundColor: 'rgb(236 253 245 / 0.58)', borderColor: 'rgb(209 250 229)' },
    valueClass: 'text-emerald-800',
  },
}

function PracticeMetric({ label, value, note, tone }: { label: string; value: number; note: string; tone: keyof typeof practiceMetricTone }) {
  const metricTone = practiceMetricTone[tone]
  return (
    <div className="rounded-2xl border px-5 py-5 shadow-sm" style={metricTone.style}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-500">{label}</p>
        <span className={cn('h-2 w-2 rounded-full bg-current opacity-35', metricTone.valueClass)} />
      </div>
      <div className="flex items-end justify-between gap-4">
        <p className={cn('font-serif text-4xl leading-none', metricTone.valueClass)}>{value}</p>
        <p className="min-w-0 truncate pb-1 text-right text-xs text-ink-600">{note}</p>
      </div>
    </div>
  )
}

function PracticeTable({
  items,
  issueCounts,
  cardCounts,
  onOpen,
  onDelete,
}: {
  items: TranslationPracticeItem[]
  issueCounts: Record<string, number>
  cardCounts: Record<string, number>
  onOpen: (id: string) => void
  onDelete: (item: TranslationPracticeItem) => void
}) {
  return (
    <Card padding="none" className="overflow-hidden shadow-[0_18px_55px_rgba(39,35,28,0.06)]">
      <div className="overflow-x-auto">
        <div className="min-w-[1180px]">
          <div
            className="grid grid-cols-[minmax(220px,1.5fr)_80px_100px_90px_64px_86px_74px_70px_84px_130px_150px] gap-4 bg-canvas/60 border-b border-line text-[11px] uppercase tracking-wider text-ink-500"
            style={{ padding: '16px 24px' }}
          >
            <span>标题</span><span>语言</span><span>考试</span><span>文本</span><span>难度</span><span>状态</span><span>字数</span><span>问题</span><span>表达卡</span><span>下次复习</span><span className="text-right">操作</span>
          </div>
          {items.map((item, index) => {
            const status = practiceStatus(item.status)
            return (
              <div
                key={item.id}
                className={cn(
                  'grid grid-cols-[minmax(220px,1.5fr)_80px_100px_90px_64px_86px_74px_70px_84px_130px_150px] gap-4 items-center text-sm',
                  index > 0 && 'border-t border-line'
                )}
                style={{ padding: '20px 24px' }}
              >
                <div className="min-w-0">
                  <button className="text-left font-medium text-ink-900 hover:text-brand truncate block max-w-full" onClick={() => onOpen(item.id)}>
                    {item.title}
                  </button>
                  <p className="text-xs text-ink-500 truncate mt-1">{tagsToText(item.tags) || item.source_note || '未添加来源与标签'}</p>
                </div>
                <span className="text-ink-700">{displayDirection(item.direction)}</span>
                <span className="text-ink-700 truncate">{item.exam_type}</span>
                <span className="text-ink-700 truncate">{item.text_type}</span>
                <span className="font-mono text-ink-700">{item.difficulty}</span>
                <span className={cn('inline-flex w-fit rounded-full border px-2 py-1 text-[11px] whitespace-nowrap', practiceStatusMeta[status].cls)}>
                  {practiceStatusMeta[status].label}
                </span>
                <span className="font-mono text-ink-700">{countPracticeWords(item.source_text)}</span>
                <span className="font-mono text-ink-700">{issueCounts[item.id] ?? 0}</span>
                <span className="font-mono text-ink-700">{cardCounts[item.id] ?? 0}</span>
                <span className="text-xs text-ink-600 whitespace-nowrap">{formatPracticeDate(item.next_review_at)}</span>
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => onOpen(item.id)}>继续练习</Button>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(item)}>删除</Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}
