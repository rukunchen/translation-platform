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
  parent_id: string | null
  level: number | null
  color: string | null
  group_key: string | null
  is_featured: boolean | null
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

type CategoryMindmapGroup = {
  parent: TermCategory
  children: TermCategory[]
  nodeCount: number
  totalTerms: number
  color: CategoryColorKey
}

type CategoryForm = {
  level: '1' | '2'
  parent_id: string
  name: string
  description: string
  color: string
  sort_order: string
}

type CategoryEditForm = {
  parent_id: string
  name: string
  description: string
  color: string
  sort_order: string
}

const CATEGORY_COLORS = [
  { value: 'morandi_terracotta', label: '陶土橙' },
  { value: 'morandi_rose', label: '豆沙粉' },
  { value: 'morandi_sage', label: '鼠尾草绿' },
  { value: 'morandi_olive', label: '橄榄灰绿' },
  { value: 'morandi_blue', label: '雾霾蓝' },
  { value: 'morandi_teal', label: '灰青色' },
  { value: 'morandi_lavender', label: '灰紫色' },
  { value: 'morandi_taupe', label: '暖灰褐' },
  { value: 'morandi_stone', label: '石灰色' },
] as const

type CategoryColorKey = typeof CATEGORY_COLORS[number]['value']

const DEFAULT_CATEGORY_COLOR: CategoryColorKey = 'morandi_stone'

const LEGACY_CATEGORY_COLOR_MAP: Record<string, CategoryColorKey> = {
  orange: 'morandi_terracotta',
  purple: 'morandi_lavender',
  blue: 'morandi_blue',
  green: 'morandi_sage',
  cyan: 'morandi_teal',
  rose: 'morandi_rose',
  slate: 'morandi_blue',
  gray: 'morandi_stone',
}

const CATEGORY_TONES: Record<CategoryColorKey, {
  solid: string
  softBg: string
  softBorder: string
  line: string
  text: string
  shadow: string
}> = {
  morandi_terracotta: {
    solid: 'rgb(171 112 84)',
    softBg: 'rgb(251 242 236 / 0.78)',
    softBorder: 'rgb(219 171 145)',
    line: 'rgb(219 171 145)',
    text: 'rgb(137 80 56)',
    shadow: 'rgb(171 112 84 / 0.16)',
  },
  morandi_rose: {
    solid: 'rgb(172 119 126)',
    softBg: 'rgb(247 238 238 / 0.78)',
    softBorder: 'rgb(206 166 171)',
    line: 'rgb(206 166 171)',
    text: 'rgb(128 80 86)',
    shadow: 'rgb(172 119 126 / 0.15)',
  },
  morandi_sage: {
    solid: 'rgb(125 143 117)',
    softBg: 'rgb(241 245 238 / 0.78)',
    softBorder: 'rgb(176 194 168)',
    line: 'rgb(176 194 168)',
    text: 'rgb(83 105 75)',
    shadow: 'rgb(125 143 117 / 0.15)',
  },
  morandi_olive: {
    solid: 'rgb(139 139 101)',
    softBg: 'rgb(244 242 231 / 0.78)',
    softBorder: 'rgb(190 187 143)',
    line: 'rgb(190 187 143)',
    text: 'rgb(105 103 70)',
    shadow: 'rgb(139 139 101 / 0.14)',
  },
  morandi_blue: {
    solid: 'rgb(109 132 151)',
    softBg: 'rgb(238 243 246 / 0.78)',
    softBorder: 'rgb(164 184 199)',
    line: 'rgb(164 184 199)',
    text: 'rgb(73 94 112)',
    shadow: 'rgb(109 132 151 / 0.15)',
  },
  morandi_teal: {
    solid: 'rgb(103 139 135)',
    softBg: 'rgb(237 244 242 / 0.78)',
    softBorder: 'rgb(157 190 185)',
    line: 'rgb(157 190 185)',
    text: 'rgb(65 104 100)',
    shadow: 'rgb(103 139 135 / 0.15)',
  },
  morandi_lavender: {
    solid: 'rgb(142 128 155)',
    softBg: 'rgb(243 240 245 / 0.78)',
    softBorder: 'rgb(186 176 198)',
    line: 'rgb(186 176 198)',
    text: 'rgb(96 81 112)',
    shadow: 'rgb(142 128 155 / 0.15)',
  },
  morandi_taupe: {
    solid: 'rgb(139 126 111)',
    softBg: 'rgb(244 240 235 / 0.78)',
    softBorder: 'rgb(190 176 158)',
    line: 'rgb(190 176 158)',
    text: 'rgb(104 89 74)',
    shadow: 'rgb(139 126 111 / 0.14)',
  },
  morandi_stone: {
    solid: 'rgb(126 123 116)',
    softBg: 'rgb(242 241 238 / 0.78)',
    softBorder: 'rgb(183 180 170)',
    line: 'rgb(183 180 170)',
    text: 'rgb(88 86 80)',
    shadow: 'rgb(126 123 116 / 0.13)',
  },
}

async function loadPublicTermIndexes() {
  const pageSize = 1000
  const rows: PublicTermIndex[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('public_terms')
      .select('id, category_id, updated_at')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) return { data: rows, error }
    rows.push(...((data ?? []) as PublicTermIndex[]))
    if (!data || data.length < pageSize) return { data: rows, error: null }
  }
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
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(() => createCategoryForm())
  const [editingCategory, setEditingCategory] = useState<TermCategory | null>(null)
  const [editCategoryForm, setEditCategoryForm] = useState<CategoryEditForm>(() => createCategoryEditForm(null))
  const [savingEditedCategory, setSavingEditedCategory] = useState(false)

  const isAdmin = userEmail.toLowerCase() === ADMIN_EMAIL

  const load = useCallback(async (uid: string) => {
    setLoading(true)
    setErrorMessage('')
    const [categoryRes, termRes, termbookRes] = await Promise.all([
      supabase
        .from('term_categories')
        .select('id, name, description, sort_order, parent_id, level, color, group_key, is_featured, updated_at')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      loadPublicTermIndexes(),
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
  const parentCategories = useMemo(() => {
    return categories.filter(category => !category.parent_id || (category.level ?? 1) === 1)
  }, [categories])
  const categoryMindmapGroups = useMemo(() => {
    return buildCategoryMindmapGroups(categories, categoryStats)
  }, [categories, categoryStats])

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
    const hasChildren = categories.some(child => child.parent_id === category.id)
    if (hasChildren) {
      alert('该分类下仍有子分类，不能直接删除。请先处理子分类。')
      return
    }
    const stats = categoryStats[category.id] ?? { termCount: 0, savedCount: 0, latestUpdatedAt: null }
    if (stats.termCount > 0) {
      alert('该分类下仍有词条，不能直接删除。请先移动或删除词条。')
      return
    }
    if (!confirm(`确定删除“${category.name}”分类吗？`)) {
      return
    }
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

  function openEditCategoryDialog(category: TermCategory) {
    if (!isAdmin) return
    setEditingCategory(category)
    setEditCategoryForm(createCategoryEditForm(category))
  }

  async function updateCategory() {
    if (!userId || !isAdmin || !editingCategory) return
    const name = editCategoryForm.name.trim()
    const parentId = editCategoryForm.parent_id || null
    const parentCategory = parentId ? parentCategories.find(category => category.id === parentId) : null

    if (!name) {
      alert('请填写分类名称。')
      return
    }
    if (parentId === editingCategory.id) {
      alert('不能把分类设置为自己的父级。')
      return
    }
    if (parentId && !parentCategory) {
      alert('请选择有效的父级分类。')
      return
    }
    if (parentId && categories.some(category => category.parent_id === editingCategory.id)) {
      alert('该分类下仍有子分类，不能改为二级分类。请先处理子分类。')
      return
    }

    const duplicateInCurrentList = categories.some(category => {
      if (category.id === editingCategory.id || category.name !== name) return false
      return (category.parent_id ?? null) === parentId
    })
    if (duplicateInCurrentList) {
      alert('该父级下已存在同名分类。')
      return
    }

    setSavingEditedCategory(true)
    let duplicateQuery = supabase
      .from('term_categories')
      .select('id')
      .eq('name', name)
      .neq('id', editingCategory.id)
      .limit(1)

    duplicateQuery = parentId ? duplicateQuery.eq('parent_id', parentId) : duplicateQuery.is('parent_id', null)
    const { data: duplicateRows, error: duplicateError } = await duplicateQuery
    if (duplicateError) {
      setSavingEditedCategory(false)
      alert('检查重复分类失败：' + duplicateError.message)
      return
    }
    if ((duplicateRows ?? []).length > 0) {
      setSavingEditedCategory(false)
      alert('该父级下已存在同名分类。')
      return
    }

    const { error } = await supabase
      .from('term_categories')
      .update({
        name,
        description: nullableText(editCategoryForm.description),
        color: normalizeCategoryColor(editCategoryForm.color || parentCategory?.color),
        parent_id: parentId,
        level: parentId ? 2 : 1,
        group_key: parentId ? parentCategory?.group_key || inferGroupKey(name) : inferGroupKey(name),
        is_featured: !parentId,
        sort_order: nullableSortOrder(editCategoryForm.sort_order),
      })
      .eq('id', editingCategory.id)
    setSavingEditedCategory(false)

    if (error) {
      alert('编辑分类失败：' + error.message)
      return
    }
    setEditingCategory(null)
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
    setCategoryForm(createCategoryForm())
    setShowCategoryDialog(true)
  }

  async function createCategory() {
    if (!userId || !isAdmin) return
    const name = categoryForm.name.trim()
    const level = categoryForm.level === '2' ? 2 : 1
    const parentId = level === 2 ? categoryForm.parent_id : ''
    const parentCategory = parentId ? parentCategories.find(category => category.id === parentId) : null
    if (!name) {
      alert('请填写分类名称。')
      return
    }
    if (level === 2 && !parentCategory) {
      alert('请选择父级分类。')
      return
    }
    const duplicateInCurrentList = categories.some(category => {
      if (category.name !== name) return false
      if (level === 1) return !category.parent_id
      return category.parent_id === parentId
    })
    if (duplicateInCurrentList) {
      alert('该父级下已存在同名分类。')
      return
    }
    setSavingCategory(true)
    let duplicateQuery = supabase
      .from('term_categories')
      .select('id')
      .eq('name', name)
      .limit(1)

    duplicateQuery = level === 1 ? duplicateQuery.is('parent_id', null) : duplicateQuery.eq('parent_id', parentId)
    const { data: duplicateRows, error: duplicateError } = await duplicateQuery
    if (duplicateError) {
      setSavingCategory(false)
      alert('检查重复分类失败：' + duplicateError.message)
      return
    }
    if ((duplicateRows ?? []).length > 0) {
      setSavingCategory(false)
      alert('该父级下已存在同名分类。')
      return
    }

    const sortOrder = parseSortOrder(categoryForm.sort_order, categories, level === 1 ? null : parentId)
    const color = normalizeCategoryColor(categoryForm.color || parentCategory?.color)
    const groupKey = level === 2 ? parentCategory?.group_key || inferGroupKey(name) : inferGroupKey(name)
    const { error } = await supabase.from('term_categories').insert({
      name,
      description: nullableText(categoryForm.description),
      sort_order: sortOrder,
      parent_id: level === 1 ? null : parentId,
      level,
      color,
      group_key: groupKey,
      is_featured: level === 1,
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
                <CategoryMindmap
                  groups={categoryMindmapGroups}
                  stats={categoryStats}
                  onOpen={category => router.push(`/practice/terms/category/${category.id}`)}
                  isAdmin={isAdmin}
                  onEdit={openEditCategoryDialog}
                  onDelete={removeCategory}
                  deletingCategoryId={deletingCategoryId}
                />
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
                parentCategories={parentCategories}
                onChange={patch => setCategoryForm(prev => ({ ...prev, ...patch }))}
                onClose={() => setShowCategoryDialog(false)}
                onSave={createCategory}
              />
            )}

            {editingCategory && isAdmin && (
              <CategoryEditDialog
                category={editingCategory}
                form={editCategoryForm}
                saving={savingEditedCategory}
                parentCategories={parentCategories}
                onChange={patch => setEditCategoryForm(prev => ({ ...prev, ...patch }))}
                onClose={() => setEditingCategory(null)}
                onSave={updateCategory}
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
  parentCategories,
  onChange,
  onClose,
  onSave,
}: {
  form: CategoryForm
  saving: boolean
  parentCategories: TermCategory[]
  onChange: (patch: Partial<CategoryForm>) => void
  onClose: () => void
  onSave: () => Promise<void>
}) {
  const selectedParent = parentCategories.find(category => category.id === form.parent_id)
  const colorHint = form.level === '2' && !form.color && selectedParent?.color
    ? `留空时继承父级颜色：${categoryColorLabel(selectedParent.color)}`
    : undefined

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white shadow-[var(--shadow-modal)]" style={{ padding: 32 }}>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h3 className="font-serif text-2xl text-ink-900">新建分类</h3>
          <button type="button" onClick={onClose} className="text-sm text-ink-400 hover:text-ink-900">关闭</button>
        </div>
        <form className="space-y-5" onSubmit={event => { event.preventDefault(); void onSave() }}>
          <Select
            label="分类层级"
            value={form.level}
            onChange={event => onChange({ level: event.target.value as CategoryForm['level'], parent_id: '', color: event.target.value === '2' ? '' : form.color || DEFAULT_CATEGORY_COLOR })}
          >
            <option value="1">一级分类</option>
            <option value="2">二级分类</option>
          </Select>
          {form.level === '2' && (
            <Select
              label="父级分类"
              value={form.parent_id}
              onChange={event => onChange({ parent_id: event.target.value })}
              required
            >
              <option value="">请选择父级分类</option>
              {parentCategories.map(category => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </Select>
          )}
          <Input label="分类名称" value={form.name} onChange={event => onChange({ name: event.target.value })} required />
          <Textarea label="分类说明" value={form.description} onChange={event => onChange({ description: event.target.value })} rows={3} />
          <Select
            label="分类颜色"
            value={form.color}
            onChange={event => onChange({ color: event.target.value })}
            hint={colorHint}
          >
            {form.level === '2' && <option value="">继承父级颜色</option>}
            {CATEGORY_COLORS.map(color => (
              <option key={color.value} value={color.value}>{color.label}</option>
            ))}
          </Select>
          <Input
            label="排序"
            type="number"
            value={form.sort_order}
            onChange={event => onChange({ sort_order: event.target.value })}
            placeholder="留空自动排序"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose}>取消</Button>
            <Button variant="primary" type="submit" loading={saving}>保存分类</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CategoryEditDialog({
  category,
  form,
  saving,
  parentCategories,
  onChange,
  onClose,
  onSave,
}: {
  category: TermCategory
  form: CategoryEditForm
  saving: boolean
  parentCategories: TermCategory[]
  onChange: (patch: Partial<CategoryEditForm>) => void
  onClose: () => void
  onSave: () => Promise<void>
}) {
  const parentOptions = parentCategories.filter(parent => parent.id !== category.id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white shadow-[var(--shadow-modal)]" style={{ padding: 32 }}>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h3 className="font-serif text-2xl text-ink-900">编辑分类</h3>
          <button type="button" onClick={onClose} className="text-sm text-ink-400 hover:text-ink-900">关闭</button>
        </div>
        <form className="space-y-5" onSubmit={event => { event.preventDefault(); void onSave() }}>
          <Input label="分类名称" value={form.name} onChange={event => onChange({ name: event.target.value })} required />
          <Textarea label="分类说明" value={form.description} onChange={event => onChange({ description: event.target.value })} rows={3} />
          <Select label="分类颜色" value={form.color} onChange={event => onChange({ color: event.target.value })}>
            {CATEGORY_COLORS.map(color => (
              <option key={color.value} value={color.value}>{color.label}</option>
            ))}
          </Select>
          <Select label="父级分类" value={form.parent_id} onChange={event => onChange({ parent_id: event.target.value })}>
            <option value="">无父级，作为一级分类</option>
            {parentOptions.map(parent => (
              <option key={parent.id} value={parent.id}>{parent.name}</option>
            ))}
          </Select>
          <Input
            label="排序"
            type="number"
            value={form.sort_order}
            onChange={event => onChange({ sort_order: event.target.value })}
            placeholder="留空不设置排序"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose}>取消</Button>
            <Button variant="primary" type="submit" loading={saving}>保存修改</Button>
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

function CategoryMindmap({
  groups,
  stats,
  onOpen,
  isAdmin,
  onEdit,
  onDelete,
  deletingCategoryId,
}: {
  groups: CategoryMindmapGroup[]
  stats: Record<string, CategoryStats>
  onOpen: (category: TermCategory) => void
  isAdmin: boolean
  onEdit: (category: TermCategory) => void
  onDelete: (category: TermCategory) => void
  deletingCategoryId: string | null
}) {
  return (
    <div>
      {groups.map((group, index) => {
        const tone = CATEGORY_TONES[group.color]
        return (
          <div
            key={group.parent.id}
            className="p-4 xl:grid xl:grid-cols-[220px_64px_minmax(0,1fr)] xl:items-center xl:gap-0"
            style={{ marginTop: index === 0 ? 0 : 40 }}
          >
            <div
              className="relative rounded-2xl text-white shadow-sm"
              style={{
                backgroundColor: tone.solid,
                boxShadow: `0 18px 36px ${tone.shadow}`,
                padding: '22px 24px 20px',
              }}
            >
              {isAdmin && (
                <CategoryNodeMenu
                  category={group.parent}
                  light
                  deleting={deletingCategoryId === group.parent.id}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              )}
              <p className="mb-2 break-words pr-12 text-[10px] uppercase leading-relaxed tracking-[0.08em] text-white/70">Level 1</p>
              <h3 className="break-words pr-3 font-serif leading-snug" style={{ fontSize: 'clamp(1rem, 1.1vw, 1.16rem)', overflowWrap: 'anywhere' }}>{group.parent.name}</h3>
              <p className="mt-2 line-clamp-2 min-h-[34px] pr-2 text-xs leading-relaxed text-white/78">
                {group.parent.description || '公共词条一级分类'}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/25 pt-3">
                <MindmapMeta label="子节点" value={String(group.nodeCount)} light />
                <MindmapMeta label="词条" value={String(group.totalTerms)} light />
              </div>
            </div>

            <div className="flex items-center justify-center py-3 xl:py-0" aria-hidden="true">
              <div className="hidden w-full items-center xl:flex">
                <div className="h-px flex-1" style={{ backgroundColor: tone.line }} />
                <span className="mx-1.5 text-base" style={{ color: tone.text }}>▶</span>
              </div>
              <div className="flex flex-col items-center xl:hidden">
                <div className="h-6 w-px" style={{ backgroundColor: tone.line }} />
                <span className="text-base" style={{ color: tone.text }}>↓</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.children.map(child => {
                const childStats = stats[child.id] ?? { termCount: 0, savedCount: 0, latestUpdatedAt: null }
                return (
                  <div
                    key={child.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(child)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onOpen(child)
                      }
                    }}
                    className="group relative min-h-[112px] cursor-pointer rounded-2xl border text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-4 focus:ring-brand/10"
                    style={{
                      backgroundColor: tone.softBg,
                      borderColor: tone.softBorder,
                      padding: '18px 22px 16px',
                    }}
                  >
                    {isAdmin && (
                      <CategoryNodeMenu
                        category={child}
                        deleting={deletingCategoryId === child.id}
                        onEdit={onEdit}
                        onDelete={onDelete}
                      />
                    )}
                    <div className="flex h-full flex-col justify-between gap-3">
                      <div>
                        <p className="mb-1.5 break-words pr-10 text-[10px] uppercase leading-relaxed tracking-[0.06em]" style={{ color: tone.text }}>Level 2</p>
                        <h4 className="line-clamp-2 break-words pr-2 font-serif leading-snug text-ink-900" style={{ fontSize: 'clamp(0.92rem, 0.9vw, 1rem)', overflowWrap: 'anywhere' }}>{child.name}</h4>
                      </div>
                      <div className="grid grid-cols-3 gap-2 border-t pt-2.5" style={{ borderColor: tone.softBorder }}>
                        <MindmapMeta label="词条" value={String(childStats.termCount)} />
                        <MindmapMeta label="已加入" value={String(childStats.savedCount)} />
                        <div>
                          <p className="mb-1 text-[11px] text-ink-500">操作</p>
                          <p className="text-xs font-medium transition-colors group-hover:text-ink-900" style={{ color: tone.text }}>进入学习</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MindmapMeta({ label, value, light }: { label: string; value: string; light?: boolean }) {
  return (
    <div>
      <p className={light ? 'mb-1 text-[11px] text-white/65' : 'mb-1 text-[11px] text-ink-500'}>{label}</p>
      <p className={light ? 'font-mono text-sm text-white' : 'font-mono text-sm text-ink-900'}>{value}</p>
    </div>
  )
}

function CategoryNodeMenu({
  category,
  light,
  deleting,
  onEdit,
  onDelete,
}: {
  category: TermCategory
  light?: boolean
  deleting?: boolean
  onEdit: (category: TermCategory) => void
  onDelete: (category: TermCategory) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="absolute right-3 top-3 z-10">
      <button
        type="button"
        aria-label="分类管理"
        onClick={event => {
          event.stopPropagation()
          setOpen(prev => !prev)
        }}
        className={[
          'flex h-8 w-8 items-center justify-center rounded-full border text-sm transition-colors',
          light
            ? 'border-white/20 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white'
            : 'border-line bg-white/80 text-ink-500 hover:border-ink-300 hover:text-ink-900',
        ].join(' ')}
      >
        ···
      </button>

      {open && (
        <div
          className="absolute right-0 top-10 w-32 overflow-hidden rounded-xl border border-line bg-white py-1 text-sm shadow-[var(--shadow-modal)]"
          onClick={event => event.stopPropagation()}
        >
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-ink-700 hover:bg-canvas hover:text-ink-900"
            onClick={() => {
              setOpen(false)
              onEdit(category)
            }}
          >
            编辑分类
          </button>
          <button
            type="button"
            disabled={deleting}
            className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
            onClick={() => {
              setOpen(false)
              onDelete(category)
            }}
          >
            {deleting ? '删除中...' : '删除分类'}
          </button>
        </div>
      )}
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

function createCategoryForm(): CategoryForm {
  return {
    level: '1',
    parent_id: '',
    name: '',
    description: '',
    color: DEFAULT_CATEGORY_COLOR,
    sort_order: '',
  }
}

function createCategoryEditForm(category: TermCategory | null): CategoryEditForm {
  return {
    parent_id: category?.parent_id ?? '',
    name: category?.name ?? '',
    description: category?.description ?? '',
    color: normalizeCategoryColor(category?.color),
    sort_order: category?.sort_order === null || category?.sort_order === undefined ? '' : String(category.sort_order),
  }
}

function nullableText(value: string) {
  const trimmed = value.trim()
  return trimmed || null
}

function nullableSortOrder(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function parseSortOrder(value: string, categories: TermCategory[], parentId: string | null) {
  const trimmed = value.trim()
  if (trimmed) {
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) return parsed
  }
  return categories
    .filter(category => (category.parent_id ?? null) === parentId)
    .reduce((max, category) => Math.max(max, category.sort_order ?? 0), 0) + 10
}

function inferGroupKey(name: string) {
  if (name.includes('大会热词') || name.includes('大会议热词')) return 'congress_terms'
  if (name.includes('中华思想文化')) return 'chinese_culture'
  if (name.includes('专题词条')) return 'topic_terms'
  return null
}

function buildCategoryMindmapGroups(categories: TermCategory[], stats: Record<string, CategoryStats>): CategoryMindmapGroup[] {
  const categoryById = new Map(categories.map(category => [category.id, category]))
  const parents = categories
    .filter(category => !category.parent_id || (category.level ?? 1) === 1 || !categoryById.has(category.parent_id))
    .sort(sortCategories)

  return parents.map(parent => {
    const realChildren = categories
      .filter(category => category.parent_id === parent.id && category.id !== parent.id && category.level !== 1)
      .sort(sortCategories)
    const children = realChildren.length > 0 ? realChildren : [parent]
    const totalCategories = realChildren.length > 0 ? [parent, ...realChildren] : [parent]
    return {
      parent,
      children,
      nodeCount: children.length,
      totalTerms: totalCategories.reduce((sum, category) => sum + (stats[category.id]?.termCount ?? 0), 0),
      color: categoryColorKey(parent.color),
    }
  })
}

function sortCategories(a: TermCategory, b: TermCategory) {
  const sortDelta = (a.sort_order ?? 0) - (b.sort_order ?? 0)
  if (sortDelta !== 0) return sortDelta
  return a.name.localeCompare(b.name, 'zh-CN')
}

function categoryColorKey(value: string | null): CategoryColorKey {
  return normalizeCategoryColor(value)
}

function normalizeCategoryColor(value: string | null | undefined): CategoryColorKey {
  if (value && value in CATEGORY_TONES) return value as CategoryColorKey
  if (value && value in LEGACY_CATEGORY_COLOR_MAP) return LEGACY_CATEGORY_COLOR_MAP[value]
  return DEFAULT_CATEGORY_COLOR
}

function categoryColorLabel(value: string | null | undefined): string {
  const color = normalizeCategoryColor(value)
  return CATEGORY_COLORS.find(option => option.value === color)?.label || '石灰色'
}
