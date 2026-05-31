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
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'rukunchen@hotmail.com'

type TermCategory = {
  id: string
  name: string
  description: string | null
  sort_order: number | null
  updated_at: string | null
}

type PublicTermIndex = {
  id: string
  category_id: string | null
  updated_at: string | null
}

type UserTermbookIndex = {
  id: string
  public_term_id: string | null
  source_text: string
  target_text: string
  definition: string | null
  example_sentence: string | null
  personal_note: string | null
  personal_tags: string[] | null
  mastery_status: string | null
  review_count: number | null
  updated_at: string | null
}

type CategoryStats = {
  termCount: number
  savedCount: number
  latestUpdatedAt: string | null
}

type CategoryForm = {
  name: string
  description: string
  sort_order: string
}

export default function TermLearningPage() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [categories, setCategories] = useState<TermCategory[]>([])
  const [publicTerms, setPublicTerms] = useState<PublicTermIndex[]>([])
  const [termbookItems, setTermbookItems] = useState<UserTermbookIndex[]>([])
  const [activeView, setActiveView] = useState<'library' | 'termbook'>('library')
  const [termbookStatusFilter, setTermbookStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)
  const [showCategoryDialog, setShowCategoryDialog] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(() => createCategoryForm(10))

  const isAdmin = userEmail.toLowerCase() === ADMIN_EMAIL

  const load = useCallback(async (uid: string) => {
    setLoading(true)
    setErrorMessage('')
    const [categoryRes, termRes, termbookRes] = await Promise.all([
      supabase
        .from('term_categories')
        .select('id, name, description, sort_order, updated_at')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('public_terms')
        .select('id, category_id, updated_at'),
      supabase
        .from('user_termbook_items')
        .select('id, public_term_id, source_text, target_text, definition, example_sentence, personal_note, personal_tags, mastery_status, review_count, updated_at')
        .eq('user_id', uid)
        .order('updated_at', { ascending: false }),
    ])

    if (categoryRes.error) {
      setCategories([])
      setPublicTerms([])
      setTermbookItems([])
      setErrorMessage(categoryRes.error.message)
      setLoading(false)
      return
    }

    setCategories((categoryRes.data ?? []) as TermCategory[])
    setPublicTerms(termRes.error ? [] : (termRes.data ?? []) as PublicTermIndex[])
    setTermbookItems(termbookRes.error ? [] : (termbookRes.data ?? []) as UserTermbookIndex[])
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/')
        return
      }
      setUserId(user.id)
      setUserEmail(user.email ?? '')
      void load(user.id)
    })
  }, [load, router])

  useEffect(() => {
    function syncViewFromHash() {
      if (window.location.hash === '#my-termbook') setActiveView('termbook')
      if (window.location.hash === '#term-categories') setActiveView('library')
    }

    syncViewFromHash()
    window.addEventListener('hashchange', syncViewFromHash)
    return () => window.removeEventListener('hashchange', syncViewFromHash)
  }, [])

  const categoryStats = useMemo(() => {
    const stats: Record<string, CategoryStats> = {}
    const termCategoryById = new Map<string, string>()

    for (const term of publicTerms) {
      if (!term.category_id) continue
      termCategoryById.set(term.id, term.category_id)
      const current = stats[term.category_id] ?? { termCount: 0, savedCount: 0, latestUpdatedAt: null }
      current.termCount += 1
      current.latestUpdatedAt = latestDate(current.latestUpdatedAt, term.updated_at)
      stats[term.category_id] = current
    }

    for (const item of termbookItems) {
      if (!item.public_term_id) continue
      const categoryId = termCategoryById.get(item.public_term_id)
      if (!categoryId) continue
      const current = stats[categoryId] ?? { termCount: 0, savedCount: 0, latestUpdatedAt: null }
      current.savedCount += 1
      stats[categoryId] = current
    }

    for (const category of categories) {
      const current = stats[category.id] ?? { termCount: 0, savedCount: 0, latestUpdatedAt: null }
      current.latestUpdatedAt = latestDate(current.latestUpdatedAt, category.updated_at)
      stats[category.id] = current
    }

    return stats
  }, [categories, publicTerms, termbookItems])

  const totalTerms = publicTerms.length
  const savedTerms = termbookItems.length
  const filteredTermbookItems = useMemo(() => {
    if (termbookStatusFilter === 'all') return termbookItems
    return termbookItems.filter(item => (item.mastery_status || 'new') === termbookStatusFilter)
  }, [termbookItems, termbookStatusFilter])

  function openLibraryView() {
    setActiveView('library')
    window.setTimeout(() => document.getElementById('term-categories')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  function openTermbookView() {
    setActiveView('termbook')
    window.setTimeout(() => document.getElementById('my-termbook')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  async function removeTermbookItem(item: UserTermbookIndex) {
    if (!userId) return
    if (!confirm('确定从我的词条本中移除该词条吗？')) return
    const { error } = await supabase
      .from('user_termbook_items')
      .delete()
      .eq('id', item.id)
      .eq('user_id', userId)
    if (error) {
      alert('移除失败：' + error.message)
      return
    }
    setTermbookItems(prev => prev.filter(row => row.id !== item.id))
  }

  async function removeCategory(category: TermCategory) {
    if (!userId || !isAdmin) return
    if (!confirm(`确定删除“${category.name}”分类吗？该分类下的公共词条也会一并删除。`)) return
    setDeletingCategoryId(category.id)
    const { error } = await supabase
      .from('term_categories')
      .delete()
      .eq('id', category.id)
    setDeletingCategoryId(null)
    if (error) {
      alert('删除分类失败：' + error.message)
      return
    }
    await load(userId)
  }

  function openAdminImport() {
    if (categories.length === 0) {
      alert('请先新建分类，再导入词条。')
      openCreateCategoryDialog()
      return
    }
    router.push(`/practice/terms/category/${categories[0].id}?adminImport=1`)
  }

  function openCreateCategoryDialog() {
    const nextSortOrder = categories.reduce((max, category) => Math.max(max, category.sort_order ?? 0), 0) + 10
    setCategoryForm(createCategoryForm(nextSortOrder))
    setShowCategoryDialog(true)
  }

  async function createCategory() {
    if (!userId || !isAdmin) return
    const name = categoryForm.name.trim()
    if (!name) {
      alert('请填写分类名称。')
      return
    }
    setSavingCategory(true)
    const { error } = await supabase.from('term_categories').insert({
      name,
      description: nullableText(categoryForm.description),
      sort_order: Number(categoryForm.sort_order) || 0,
    })
    setSavingCategory(false)
    if (error) {
      alert('新建分类失败：' + error.message)
      return
    }
    setShowCategoryDialog(false)
    await load(userId)
  }

  function openTermbookStudy() {
    router.push('/practice/terms/study?scope=my-termbook')
  }

  function openTermTest() {
    router.push('/practice/terms/test')
  }

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="min-h-[calc(100vh-40px)] rounded-2xl border border-line bg-white">
          <MainContent size="wide">
            <PageHeader
              backHref="/practice"
              backLabel="返回译训库"
              eyebrow="Term Learning"
              title="词条学习"
              description="大会热词、国际组织、经济、法律、社会与科技词条分类记忆"
              actions={
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="secondary" onClick={() => router.push('/practice')}>练习篇章</Button>
                  <Button variant="ghost" onClick={() => router.push('/practice/cards')}>表达卡片</Button>
                </div>
              }
            />

            <section className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <TermPortalCard
                eyebrow="Public Library"
                title="公共词条库"
                description="按公共分类浏览热词、术语和常用表达。"
                metric={`${categories.length} 个分类`}
                buttonLabel="浏览公共词条库"
                toneStyle={{ backgroundColor: 'rgb(255 251 235 / 0.62)', borderColor: 'rgb(254 243 199)' }}
                accentClass="text-amber-800"
                onOpen={openLibraryView}
              />
              <TermPortalCard
                eyebrow="My Termbook"
                title="我的词条本"
                description="已加入个人词条本的公共词条。"
                metric={`${savedTerms} 条词条`}
                buttonLabel="查看我的词条本"
                toneStyle={{ backgroundColor: 'rgb(239 246 255 / 0.58)', borderColor: 'rgb(219 234 254)' }}
                accentClass="text-blue-800"
                onOpen={openTermbookView}
              />
              <TermPortalCard
                eyebrow="Term Test"
                title="词条测试"
                description="分类抽题、选择题训练与错译识别"
                metric="设置测试"
                buttonLabel="进入词条测试"
                toneStyle={{ backgroundColor: 'rgb(245 243 255 / 0.58)', borderColor: 'rgb(237 233 254)' }}
                accentClass="text-violet-800"
                onOpen={openTermTest}
              />
            </section>

            {isAdmin && (
              <section className="mb-8 rounded-2xl border border-line bg-surface/70 px-6 py-5">
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="max-w-xl">
                    <Eyebrow tone="muted" className="mb-2">Admin</Eyebrow>
                    <h2 className="font-serif text-xl text-ink-900">管理员工具</h2>
                    <p className="mt-2 text-sm text-ink-600">公共词条分类与词条维护入口。</p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="secondary" onClick={openAdminImport}>管理员导入词条</Button>
                    <Button variant="ghost" onClick={openCreateCategoryDialog}>新建分类</Button>
                  </div>
                </div>
              </section>
            )}

            <section className="mb-12 mt-12 flex flex-wrap gap-3 py-3">
              <Button variant={activeView === 'library' ? 'primary' : 'secondary'} onClick={openLibraryView}>公共词条库</Button>
              <Button variant={activeView === 'termbook' ? 'primary' : 'secondary'} onClick={openTermbookView}>我的词条本</Button>
            </section>

            {activeView === 'library' && <section id="term-categories">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <Eyebrow tone="muted" className="mb-2">Categories</Eyebrow>
                  <h2 className="font-serif text-xl text-ink-900">公共分类</h2>
                </div>
                <p className="text-xs text-ink-500">共 {totalTerms} 条公共词条</p>
              </div>

              {loading ? (
                <Card padding="lg" className="text-center text-sm text-ink-500">加载中...</Card>
              ) : errorMessage ? (
                <Card padding="lg" className="text-center text-sm text-ink-500">词条分类加载失败：{errorMessage}</Card>
              ) : categories.length === 0 ? (
                <Card padding="lg" className="py-20 text-center">
                  <h2 className="mb-3 font-serif text-xl text-ink-900">暂无词条分类。请管理员先创建分类。</h2>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {categories.map(category => {
                    const stats = categoryStats[category.id] ?? { termCount: 0, savedCount: 0, latestUpdatedAt: null }
                    return (
                      <CategoryCard
                        key={category.id}
                        category={category}
                        stats={stats}
                        onOpen={() => router.push(`/practice/terms/category/${category.id}`)}
                        onDelete={isAdmin ? () => removeCategory(category) : undefined}
                        deleting={deletingCategoryId === category.id}
                      />
                    )
                  })}
                </div>
              )}
            </section>}

            {activeView === 'termbook' && <section id="my-termbook">
              <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <Eyebrow tone="muted" className="mb-2">My Termbook</Eyebrow>
                  <h2 className="font-serif text-xl text-ink-900">我的词条本</h2>
                  <p className="mt-2 text-sm text-ink-600">当前用户已加入的公共词条。</p>
                </div>
                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end lg:w-auto">
                  <div className="w-full sm:w-56">
                    <Select label="掌握状态" value={termbookStatusFilter} onChange={event => setTermbookStatusFilter(event.target.value)}>
                      <option value="all">全部</option>
                      <option value="new">新加入</option>
                      <option value="learning">学习中</option>
                      <option value="mastered">已掌握</option>
                    </Select>
                  </div>
                  <Button variant="secondary" onClick={openTermbookStudy}>开始卡片学习</Button>
                </div>
              </div>

              {loading ? (
                <Card padding="lg" className="text-center text-sm text-ink-500">加载中...</Card>
              ) : termbookItems.length === 0 ? (
                <Card padding="lg" className="py-20 text-center">
                  <h2 className="mb-3 font-serif text-xl text-ink-900">你的词条本还没有词条。</h2>
                  <p className="mb-7 text-sm text-ink-600">先从公共分类中选择词条加入词条本。</p>
                  <Button variant="secondary" onClick={openLibraryView}>浏览公共词条库</Button>
                </Card>
              ) : filteredTermbookItems.length === 0 ? (
                <Card padding="lg" className="text-center text-sm text-ink-500">当前筛选条件下没有词条。</Card>
              ) : (
                <div className="space-y-4">
                  {filteredTermbookItems.map(item => (
                    <TermbookItemCard
                      key={item.id}
                      item={item}
                      onRemove={() => removeTermbookItem(item)}
                      onStudy={openTermbookStudy}
                    />
                  ))}
                </div>
              )}
            </section>}

            {showCategoryDialog && isAdmin && (
              <CategoryDialog
                form={categoryForm}
                saving={savingCategory}
                onChange={patch => setCategoryForm(prev => ({ ...prev, ...patch }))}
                onClose={() => setShowCategoryDialog(false)}
                onSave={createCategory}
              />
            )}
          </MainContent>
        </div>
      </main>
    </div>
  )
}

function CategoryDialog({
  form,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  form: CategoryForm
  saving: boolean
  onChange: (patch: Partial<CategoryForm>) => void
  onClose: () => void
  onSave: () => Promise<void>
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white shadow-[var(--shadow-modal)]" style={{ padding: 32 }}>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h3 className="font-serif text-2xl text-ink-900">新建分类</h3>
          <button type="button" onClick={onClose} className="text-sm text-ink-400 hover:text-ink-900">关闭</button>
        </div>
        <form className="space-y-5" onSubmit={event => { event.preventDefault(); void onSave() }}>
          <Input label="分类名称" value={form.name} onChange={event => onChange({ name: event.target.value })} required />
          <Textarea label="分类说明" value={form.description} onChange={event => onChange({ description: event.target.value })} rows={3} />
          <Input label="排序" type="number" value={form.sort_order} onChange={event => onChange({ sort_order: event.target.value })} />
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose}>取消</Button>
            <Button variant="primary" type="submit" loading={saving}>保存分类</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TermPortalCard({
  eyebrow,
  title,
  description,
  metric,
  buttonLabel,
  toneStyle,
  accentClass,
  onOpen,
  disabled,
}: {
  eyebrow: string
  title: string
  description: string
  metric: string
  buttonLabel: string
  toneStyle?: { backgroundColor: string; borderColor: string }
  accentClass?: string
  onOpen?: () => void
  disabled?: boolean
}) {
  return (
    <div className="rounded-2xl border transition-all duration-300" style={{ padding: 28, ...(toneStyle || {}) }}>
      <div className="flex h-full flex-col justify-between gap-6">
        <div>
          <Eyebrow tone="muted" className="mb-2">{eyebrow}</Eyebrow>
          <h2 className="font-serif text-xl text-ink-900">{title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">{description}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className={['font-mono text-sm', accentClass || 'text-ink-700'].join(' ')}>{metric}</span>
          <Button variant="secondary" onClick={onOpen} disabled={disabled}>{buttonLabel}</Button>
        </div>
      </div>
    </div>
  )
}

function CategoryCard({
  category,
  stats,
  onOpen,
  onDelete,
  deleting,
}: {
  category: TermCategory
  stats: CategoryStats
  onOpen: () => void
  onDelete?: () => void
  deleting?: boolean
}) {
  return (
    <Card padding="md" className="flex min-h-[230px] flex-col justify-between border-line/80">
      <div>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-serif text-xl text-ink-900">{category.name}</h3>
            <p className="mt-2 min-h-[40px] text-sm leading-relaxed text-ink-600">
              {category.description || '公共词条分类'}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-line bg-canvas px-2.5 py-1 font-mono text-xs text-ink-600">
            {category.sort_order ?? 0}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-line pt-4">
          <CategoryStat label="词条数量" value={String(stats.termCount)} />
          <CategoryStat label="已加入" value={String(stats.savedCount)} />
          <CategoryStat label="最近更新" value={formatDate(stats.latestUpdatedAt)} compact />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        {onDelete && <Button variant="danger" onClick={onDelete} loading={deleting}>删除分类</Button>}
        <Button variant="ghost" onClick={onOpen}>进入学习</Button>
      </div>
    </Card>
  )
}

function CategoryStat({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-[11px] text-ink-500">{label}</p>
      <p className={compact ? 'text-xs text-ink-700' : 'font-mono text-sm text-ink-900'}>{value}</p>
    </div>
  )
}

function TermbookItemCard({
  item,
  onRemove,
  onStudy,
}: {
  item: UserTermbookIndex
  onRemove: () => void
  onStudy: () => void
}) {
  return (
    <Card padding="md" className="border-line/80">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(220px,0.85fr)_minmax(260px,1fr)_220px] xl:items-start">
        <div className="min-w-0">
          <Eyebrow tone="muted" className="mb-2">Termbook</Eyebrow>
          <h3 className="break-words font-serif text-2xl leading-snug text-ink-900">{item.source_text}</h3>
          <p className="mt-3 break-words text-base leading-relaxed text-ink-800">{item.target_text}</p>
        </div>

        <div className="min-w-0 space-y-4">
          <TermbookField label="解释" value={item.definition || '暂无解释'} />
          <TermbookField label="例句" value={item.example_sentence || '暂无例句'} />
          <TermbookField label="我的笔记" value={item.personal_note || '暂无笔记'} />
          <div>
            <p className="mb-2 text-[11px] text-ink-500">个人标签</p>
            {item.personal_tags && item.personal_tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {item.personal_tags.map(tag => (
                  <span key={tag} className="rounded-full border border-line bg-canvas px-2.5 py-1 text-xs text-ink-600">{tag}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-500">未标记</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface/70 p-4">
          <div className="grid grid-cols-2 gap-3">
            <TermbookMeta label="掌握状态" value={masteryStatusLabel(item.mastery_status)} />
            <TermbookMeta label="复习次数" value={String(item.review_count ?? 0)} />
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="secondary" onClick={onStudy}>开始卡片学习</Button>
            <Button variant="ghost" onClick={onRemove}>移除</Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

function TermbookField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[11px] text-ink-500">{label}</p>
      <p className="break-words text-sm leading-relaxed text-ink-600">{value}</p>
    </div>
  )
}

function TermbookMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[11px] text-ink-500">{label}</p>
      <p className="text-sm text-ink-800">{value}</p>
    </div>
  )
}

function masteryStatusLabel(value: string | null) {
  if (value === 'learning') return '学习中'
  if (value === 'mastered') return '已掌握'
  return '新加入'
}

function latestDate(current: string | null, next: string | null) {
  if (!current) return next
  if (!next) return current
  return new Date(next).getTime() > new Date(current).getTime() ? next : current
}

function formatDate(value: string | null) {
  if (!value) return '暂无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '暂无'
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function createCategoryForm(sortOrder: number): CategoryForm {
  return {
    name: '',
    description: '',
    sort_order: String(sortOrder),
  }
}

function nullableText(value: string) {
  const trimmed = value.trim()
  return trimmed || null
}
