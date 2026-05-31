'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
  parent_id: string | null
  level: number | null
}

type PublicTerm = {
  id: string
  category_id: string | null
  source_text: string
  target_text: string
  definition: string | null
  example_sentence: string | null
  tags: string[] | null
  source: string | null
  difficulty: string | null
}

type TermForm = {
  parent_category_id: string
  category_id: string
  source_text: string
  target_text: string
  definition: string
  example_sentence: string
  tags: string
  source: string
  difficulty: string
}

type ImportPreviewRow = {
  lineNumber: number
  category_id: string
  category_name: string
  source_text: string
  target_text: string
  definition: string
  example_sentence: string
  tags: string[]
  source: string
  difficulty: string
  status: 'ready' | 'invalid' | 'duplicate' | 'unknown_category'
  message: string
}

type ImportMode = 'text' | 'excel'

export default function TermCategoryPage() {
  const router = useRouter()
  const params = useParams()
  const categoryId = String(params.categoryId ?? '')
  const [userId, setUserId] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [category, setCategory] = useState<TermCategory | null>(null)
  const [categories, setCategories] = useState<TermCategory[]>([])
  const [terms, setTerms] = useState<PublicTerm[]>([])
  const [addedTermIds, setAddedTermIds] = useState<Set<string>>(new Set())
  const [savingTermId, setSavingTermId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [query, setQuery] = useState('')
  const [adminNotice, setAdminNotice] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [termForm, setTermForm] = useState<TermForm>(() => createTermForm(''))
  const [savingAdminTerm, setSavingAdminTerm] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importMode, setImportMode] = useState<ImportMode>('text')
  const [importParentCategoryId, setImportParentCategoryId] = useState('')
  const [importCategoryId, setImportCategoryId] = useState('')
  const [importText, setImportText] = useState('')
  const [excelFileName, setExcelFileName] = useState('')
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([])
  const [parsingImport, setParsingImport] = useState(false)
  const [importingTerms, setImportingTerms] = useState(false)

  const isAdmin = userEmail.toLowerCase() === ADMIN_EMAIL

  const load = useCallback(async () => {
    if (!categoryId) return
    setLoading(true)
    setErrorMessage('')
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      router.push('/')
      return
    }
    setUserId(userData.user.id)
    const currentEmail = userData.user.email ?? ''
    const shouldOpenAdminImport = new URLSearchParams(window.location.search).get('adminImport') === '1'
    setUserEmail(currentEmail)

    const [categoryRes, categoriesRes, termsRes, termbookRes] = await Promise.all([
      supabase
        .from('term_categories')
        .select('id, name, description, parent_id, level')
        .eq('id', categoryId)
        .maybeSingle(),
      supabase
        .from('term_categories')
        .select('id, name, description, parent_id, level')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('public_terms')
        .select('id, category_id, source_text, target_text, definition, example_sentence, tags, source, difficulty')
        .eq('category_id', categoryId)
        .order('source_text', { ascending: true }),
      supabase
        .from('user_termbook_items')
        .select('public_term_id')
        .eq('user_id', userData.user.id),
    ])

    if (categoryRes.error || !categoryRes.data) {
      setCategory(null)
      setTerms([])
      setErrorMessage(categoryRes.error?.message ?? '分类不存在或无权访问。')
      setLoading(false)
      return
    }

    setCategory(categoryRes.data as TermCategory)
    setCategories(categoriesRes.error ? [categoryRes.data as TermCategory] : (categoriesRes.data ?? []) as TermCategory[])
    setTerms(termsRes.error ? [] : (termsRes.data ?? []) as PublicTerm[])
    setAddedTermIds(new Set((termbookRes.data ?? []).map(item => item.public_term_id).filter(Boolean) as string[]))
    const nextCategories = categoriesRes.error ? [categoryRes.data as TermCategory] : (categoriesRes.data ?? []) as TermCategory[]
    const currentSelection = createCategorySelection(categoryId, nextCategories)
    setTermForm(prev => prev.category_id ? prev : { ...prev, ...currentSelection })
    setImportParentCategoryId(prev => prev || currentSelection.parent_category_id)
    setImportCategoryId(prev => prev || currentSelection.category_id)
    if (currentEmail.toLowerCase() === ADMIN_EMAIL && shouldOpenAdminImport) {
      setAdminNotice('')
      setImportMode('text')
      setImportParentCategoryId(currentSelection.parent_category_id)
      setImportCategoryId(currentSelection.category_id)
      setImportText('')
      setExcelFileName('')
      setImportPreview([])
      setShowImportDialog(true)
      window.history.replaceState(null, '', `/practice/terms/category/${categoryId}`)
    }
    if (termsRes.error) setErrorMessage(termsRes.error.message)
    setLoading(false)
  }, [categoryId, router])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const filteredTerms = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return terms
    return terms.filter(term => {
      return [
        term.source_text,
        term.target_text,
        term.definition ?? '',
        ...(term.tags ?? []),
      ].join(' ').toLowerCase().includes(normalized)
    })
  }, [query, terms])

  async function addToTermbook(term: PublicTerm) {
    if (!userId) {
      router.push('/')
      return
    }
    if (addedTermIds.has(term.id)) {
      alert('已在你的词条本中。')
      return
    }

    setSavingTermId(term.id)
    const existingRes = await supabase
      .from('user_termbook_items')
      .select('id')
      .eq('user_id', userId)
      .eq('public_term_id', term.id)
      .maybeSingle()

    if (existingRes.error) {
      setSavingTermId(null)
      alert('检查词条本失败：' + existingRes.error.message)
      return
    }

    if (existingRes.data) {
      setAddedTermIds(prev => new Set(prev).add(term.id))
      setSavingTermId(null)
      alert('已在你的词条本中。')
      return
    }

    const { error } = await supabase.from('user_termbook_items').insert({
      user_id: userId,
      public_term_id: term.id,
      source_text: term.source_text,
      target_text: term.target_text,
      definition: term.definition,
      example_sentence: term.example_sentence,
      personal_tags: term.tags,
      mastery_status: 'new',
      review_count: 0,
    })
    setSavingTermId(null)

    if (error) {
      alert('加入词条本失败：' + error.message)
      return
    }

    setAddedTermIds(prev => new Set(prev).add(term.id))
  }

  function openStudy() {
    router.push(`/practice/terms/study?categoryId=${categoryId}`)
  }

  function openAddDialog() {
    setAdminNotice('')
    setTermForm(createTermForm(categoryId, categories))
    setShowAddDialog(true)
  }

  function openImportDialog() {
    setAdminNotice('')
    setImportMode('text')
    const selection = createCategorySelection(categoryId, categories)
    setImportParentCategoryId(selection.parent_category_id)
    setImportCategoryId(selection.category_id)
    setImportText('')
    setExcelFileName('')
    setImportPreview([])
    setShowImportDialog(true)
  }

  async function saveAdminTerm() {
    if (!isAdmin || !userId) return
    const nextCategoryId = termForm.category_id
    const sourceText = termForm.source_text.trim()
    const targetText = termForm.target_text.trim()
    if (!nextCategoryId || !sourceText || !targetText) {
      alert('最终分类、中文和英文为必填项。')
      return
    }

    setSavingAdminTerm(true)
    const existingTermRes = await supabase
      .from('public_terms')
      .select('id')
      .eq('category_id', nextCategoryId)
      .eq('source_text', sourceText)
      .eq('target_text', targetText)
      .limit(1)
    if (existingTermRes.error) {
      setSavingAdminTerm(false)
      alert('检查重复词条失败：' + existingTermRes.error.message)
      return
    }
    if ((existingTermRes.data ?? []).length > 0) {
      setSavingAdminTerm(false)
      alert('该分类下已存在相同中文和英文的词条。')
      return
    }

    const { error } = await supabase.from('public_terms').insert({
      category_id: nextCategoryId,
      source_text: sourceText,
      target_text: targetText,
      definition: nullableText(termForm.definition),
      example_sentence: nullableText(termForm.example_sentence),
      tags: parseTags(termForm.tags),
      source: nullableText(termForm.source),
      difficulty: nullableText(termForm.difficulty),
      created_by: userId,
    })
    setSavingAdminTerm(false)

    if (error) {
      alert('添加词条失败：' + error.message)
      return
    }

    setShowAddDialog(false)
    setTermForm(createTermForm(categoryId))
    if (nextCategoryId === categoryId) {
      await load()
      setAdminNotice('已添加 1 条词条。')
    } else {
      router.push(`/practice/terms/category/${nextCategoryId}`)
    }
  }

  async function parseImportText() {
    if (!isAdmin) return
    if (!importCategoryId) {
      alert('请先选择最终导入分类。')
      return
    }

    const fallbackCategory = findImportableCategoryById(categories, importCategoryId)
    const rows = importText
      .split(/\r?\n/)
      .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
      .filter(row => row.line.length > 0)
      .map(row => parseImportLine(row.line, row.lineNumber, fallbackCategory))

    await previewWithDuplicateCheck(rows)
  }

  async function parseExcelFile(file: File) {
    if (!isAdmin) return
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      alert('请上传 .xlsx 或 .xls 文件。')
      return
    }

    setParsingImport(true)
    setExcelFileName(file.name)
    let rawRows: Array<Record<string, unknown>> = []
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const sheet = sheetName ? workbook.Sheets[sheetName] : null
      rawRows = sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }) : []
    } catch (error) {
      setParsingImport(false)
      alert('Excel 解析失败：' + (error instanceof Error ? error.message : '未知错误'))
      return
    }
    setParsingImport(false)

    if (rawRows.length === 0) {
      setImportPreview([])
      alert('Excel 文件中没有可解析的数据。')
      return
    }

    const fallbackCategory = findImportableCategoryById(categories, importCategoryId)
    const rows = rawRows.map((row, index) => parseExcelRow(row, index + 2, categories, fallbackCategory))
    await previewWithDuplicateCheck(rows)
  }

  async function previewWithDuplicateCheck(rows: ImportPreviewRow[]) {
    setParsingImport(true)
    const categoryIds = Array.from(new Set(rows.filter(row => row.status === 'ready').map(row => row.category_id).filter(Boolean)))
    if (categoryIds.length === 0) {
      setImportPreview(rows)
      setParsingImport(false)
      return
    }

    const existingRes = await supabase
      .from('public_terms')
      .select('category_id, source_text, target_text')
      .in('category_id', categoryIds)
    setParsingImport(false)

    if (existingRes.error) {
      alert('读取已有词条失败：' + existingRes.error.message)
      return
    }

    setImportPreview(markDuplicateRows(rows, (existingRes.data ?? []) as Array<{ category_id: string | null; source_text: string; target_text: string }>))
  }

  async function confirmImport() {
    if (!isAdmin || !userId) return
    const readyRows = importPreview.filter(row => row.status === 'ready')
    if (readyRows.length === 0) {
      alert('没有可导入的有效词条。')
      return
    }

    setImportingTerms(true)
    const { error } = await supabase.from('public_terms').insert(readyRows.map(row => ({
      category_id: row.category_id,
      source_text: row.source_text,
      target_text: row.target_text,
      definition: nullableText(row.definition),
      example_sentence: nullableText(row.example_sentence),
      tags: row.tags,
      source: nullableText(row.source),
      difficulty: nullableText(row.difficulty),
      created_by: userId,
    })))
    setImportingTerms(false)

    if (error) {
      alert('批量导入失败：' + error.message)
      return
    }

    const stats = importStats(importPreview)
    setShowImportDialog(false)
    setImportText('')
    setExcelFileName('')
    setImportPreview([])
    await load()
    setAdminNotice(`成功导入 ${readyRows.length} 条，跳过重复 ${stats.duplicate} 条，格式错误 ${stats.invalid} 条，未识别分类 ${stats.unknownCategory} 条。`)
  }

  async function downloadExcelTemplate() {
    const XLSX = await import('xlsx')
    const templateCategory = categoryPathLabel(categories, importCategoryId) || category?.name || ''
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['分类', '中文', '英文', '解释', '例句', '标签', '来源', '难度'],
      [templateCategory, '高质量发展', 'high-quality development', '强调质量和效益的发展方式', 'The policy emphasizes high-quality development.', '经济,大会热词', '测试模板', '基础'],
    ])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '词条导入模板')
    XLSX.writeFile(workbook, '词条导入模板.xlsx')
  }

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="min-h-[calc(100vh-40px)] rounded-2xl border border-line bg-white">
          <MainContent size="wide">
            <PageHeader
              backHref="/practice/terms"
              backLabel="返回词条学习"
              eyebrow="Term Category"
              title={loading ? '词条分类' : category?.name ?? '词条分类'}
              description={category?.description || '用于积累公共热词、术语表达与翻译常用说法。'}
              actions={
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="secondary" onClick={() => router.push('/practice/terms')}>公共词条库</Button>
                  {isAdmin && <Button variant="secondary" onClick={openAddDialog}>添加词条</Button>}
                  {isAdmin && <Button variant="ghost" onClick={openImportDialog}>批量导入词条</Button>}
                  <Button variant="ghost" onClick={openStudy}>卡片学习</Button>
                </div>
              }
            />

            {adminNotice && (
              <div className="mb-5 rounded-xl border border-line bg-surface/70 px-4 py-3 text-sm text-ink-700">
                {adminNotice}
              </div>
            )}

            <Card padding="md" className="mb-7 border-line/80">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,1fr)_160px] lg:items-end">
                <Input
                  label="搜索"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="搜索中文、英文、解释或标签"
                />
                <div className="rounded-xl border border-line bg-canvas px-4 py-3">
                  <p className="mb-1 text-[11px] text-ink-500">当前结果</p>
                  <p className="font-mono text-sm text-ink-900">{filteredTerms.length} / {terms.length} 条</p>
                </div>
              </div>
            </Card>

            {loading ? (
              <Card padding="lg" className="text-center text-sm text-ink-500">加载中...</Card>
            ) : errorMessage && !category ? (
              <Card padding="lg" className="py-20 text-center">
                <h2 className="mb-3 font-serif text-xl text-ink-900">无法打开该分类</h2>
                <p className="mb-7 text-sm text-ink-600">{errorMessage}</p>
                <Button variant="secondary" onClick={() => router.push('/practice/terms')}>返回词条学习</Button>
              </Card>
            ) : errorMessage ? (
              <Card padding="lg" className="text-center text-sm text-ink-500">词条加载失败：{errorMessage}</Card>
            ) : terms.length === 0 ? (
              <Card padding="lg" className="py-20 text-center">
                <h2 className="mb-3 font-serif text-xl text-ink-900">该分类暂无公共词条。</h2>
                <p className="text-sm text-ink-600">请稍后由管理员补充词条内容。</p>
              </Card>
            ) : filteredTerms.length === 0 ? (
              <Card padding="lg" className="text-center text-sm text-ink-500">当前搜索条件下没有词条。</Card>
            ) : (
              <div className="space-y-4">
                {filteredTerms.map(term => (
                  <TermCard
                    key={term.id}
                    term={term}
                    isAdded={addedTermIds.has(term.id)}
                    saving={savingTermId === term.id}
                    onAdd={() => addToTermbook(term)}
                    onStudy={openStudy}
                  />
                ))}
              </div>
            )}

            {showAddDialog && isAdmin && (
              <AdminTermDialog
                categories={categories}
                form={termForm}
                saving={savingAdminTerm}
                onChange={patch => setTermForm(prev => ({ ...prev, ...patch }))}
                onClose={() => setShowAddDialog(false)}
                onSave={saveAdminTerm}
              />
            )}

            {showImportDialog && isAdmin && (
              <BatchImportDialog
                categories={categories}
                mode={importMode}
                parentCategoryId={importParentCategoryId}
                categoryId={importCategoryId}
                text={importText}
                excelFileName={excelFileName}
                rows={importPreview}
                parsing={parsingImport}
                importing={importingTerms}
                onModeChange={value => {
                  setImportMode(value)
                  setImportPreview([])
                }}
                onCategoryChange={value => {
                  setImportCategoryId(value)
                  setImportPreview([])
                }}
                onParentCategoryChange={value => {
                  setImportParentCategoryId(value)
                  const children = childCategoriesOf(categories, value)
                  setImportCategoryId(children.length > 0 ? '' : value)
                  setImportPreview([])
                }}
                onTextChange={value => {
                  setImportText(value)
                  setImportPreview([])
                }}
                onParse={parseImportText}
                onExcelFile={parseExcelFile}
                onConfirm={confirmImport}
                onDownloadTemplate={downloadExcelTemplate}
                onClose={() => setShowImportDialog(false)}
              />
            )}
          </MainContent>
        </div>
      </main>
    </div>
  )
}

function AdminTermDialog({
  categories,
  form,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  categories: TermCategory[]
  form: TermForm
  saving: boolean
  onChange: (patch: Partial<TermForm>) => void
  onClose: () => void
  onSave: () => Promise<void>
}) {
  return (
    <AdminModal title="添加词条" onClose={onClose}>
      <form className="space-y-5" onSubmit={event => { event.preventDefault(); void onSave() }}>
        <CategoryHierarchySelect
          categories={categories}
          parentCategoryId={form.parent_category_id}
          categoryId={form.category_id}
          onParentChange={parentId => {
            const children = childCategoriesOf(categories, parentId)
            onChange({ parent_category_id: parentId, category_id: children.length > 0 ? '' : parentId })
          }}
          onCategoryChange={categoryId => onChange({ category_id: categoryId })}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="中文" value={form.source_text} onChange={event => onChange({ source_text: event.target.value })} required />
          <Input label="英文" value={form.target_text} onChange={event => onChange({ target_text: event.target.value })} required />
        </div>
        <Textarea label="解释" value={form.definition} onChange={event => onChange({ definition: event.target.value })} rows={3} />
        <Textarea label="例句" value={form.example_sentence} onChange={event => onChange({ example_sentence: event.target.value })} rows={3} />
        <Input label="标签" hint="多个标签用逗号分隔" value={form.tags} onChange={event => onChange({ tags: event.target.value })} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="来源" value={form.source} onChange={event => onChange({ source: event.target.value })} />
          <Input label="难度" value={form.difficulty} onChange={event => onChange({ difficulty: event.target.value })} />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant="primary" type="submit" loading={saving}>保存词条</Button>
        </div>
      </form>
    </AdminModal>
  )
}

function BatchImportDialog({
  categories,
  mode,
  parentCategoryId,
  categoryId,
  text,
  excelFileName,
  rows,
  parsing,
  importing,
  onModeChange,
  onParentCategoryChange,
  onCategoryChange,
  onTextChange,
  onParse,
  onExcelFile,
  onConfirm,
  onDownloadTemplate,
  onClose,
}: {
  categories: TermCategory[]
  mode: ImportMode
  parentCategoryId: string
  categoryId: string
  text: string
  excelFileName: string
  rows: ImportPreviewRow[]
  parsing: boolean
  importing: boolean
  onModeChange: (value: ImportMode) => void
  onParentCategoryChange: (value: string) => void
  onCategoryChange: (value: string) => void
  onTextChange: (value: string) => void
  onParse: () => Promise<void>
  onExcelFile: (file: File) => Promise<void>
  onConfirm: () => Promise<void>
  onDownloadTemplate: () => Promise<void>
  onClose: () => void
}) {
  const stats = importStats(rows)

  return (
    <AdminModal title="批量导入词条" onClose={onClose} wide>
      <div className="space-y-5">
        <div className="inline-flex rounded-xl border border-line bg-canvas p-1">
          <button
            type="button"
            onClick={() => onModeChange('text')}
            className={`rounded-lg px-4 py-2 text-sm ${mode === 'text' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900'}`}
          >
            文本导入
          </button>
          <button
            type="button"
            onClick={() => onModeChange('excel')}
            className={`rounded-lg px-4 py-2 text-sm ${mode === 'excel' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900'}`}
          >
            Excel 导入
          </button>
        </div>

        <CategoryHierarchySelect
          categories={categories}
          parentCategoryId={parentCategoryId}
          categoryId={categoryId}
          onParentChange={onParentCategoryChange}
          onCategoryChange={onCategoryChange}
        />

        {mode === 'text' ? (
          <>
            <Textarea
              label="词条文本"
              hint="每行一个词条，字段用 | 分隔：中文 | 英文 | 解释 | 例句 | 标签"
              value={text}
              onChange={event => onTextChange(event.target.value)}
              rows={9}
              inputClassName="font-mono text-sm"
              placeholder="全过程人民民主 | whole-process people's democracy | 指民主参与覆盖选举、协商、决策、管理、监督等全过程 | We should develop whole-process people's democracy. | 政治,大会热词"
            />

            <div className="rounded-xl border border-line bg-canvas px-4 py-3 text-xs leading-relaxed text-ink-600">
              格式：中文 | 英文 | 解释 | 例句 | 标签。空行会忽略，标签用逗号分隔。
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-line bg-surface/70 p-5">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-ink-900">上传 Excel 文件</p>
                <p className="mt-1 text-xs text-ink-500">支持 .xlsx 和 .xls。分类列为空时使用上方选择的分类。</p>
              </div>
              <Button variant="ghost" onClick={() => { void onDownloadTemplate() }}>下载 Excel 模板</Button>
            </div>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-white px-6 py-8 text-center transition-colors hover:border-ink-400">
              <span className="text-sm text-ink-900">{excelFileName || '选择 .xlsx / .xls 文件'}</span>
              <span className="mt-2 text-xs text-ink-500">上传后自动解析并生成预览</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={event => {
                  const file = event.target.files?.[0]
                  if (file) void onExcelFile(file)
                  event.currentTarget.value = ''
                }}
              />
            </label>
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <ImportStat label="总行数" value={stats.total} />
              <ImportStat label="有效词条数" value={stats.ready} />
              <ImportStat label="格式错误数" value={stats.invalid} />
              <ImportStat label="重复数" value={stats.duplicate} />
              <ImportStat label="未识别分类数" value={stats.unknownCategory} />
            </div>
            <ImportPreviewTable rows={rows} />
          </>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          {mode === 'text' && <Button variant="ghost" onClick={() => { void onParse() }} loading={parsing}>解析预览</Button>}
          <Button variant="primary" onClick={() => { void onConfirm() }} loading={importing} disabled={stats.ready === 0}>
            确认导入有效词条
          </Button>
        </div>
      </div>
    </AdminModal>
  )
}

function CategoryHierarchySelect({
  categories,
  parentCategoryId,
  categoryId,
  onParentChange,
  onCategoryChange,
}: {
  categories: TermCategory[]
  parentCategoryId: string
  categoryId: string
  onParentChange: (value: string) => void
  onCategoryChange: (value: string) => void
}) {
  const parentCategories = parentCategoryOptions(categories)
  const childCategories = childCategoriesOf(categories, parentCategoryId)
  const selectedParent = findCategoryById(categories, parentCategoryId)
  const finalPath = categoryPathLabel(categories, categoryId)

  return (
    <div className="space-y-4">
      <Select label="一级分类" value={parentCategoryId} onChange={event => onParentChange(event.target.value)} required>
        <option value="">请选择一级分类</option>
        {parentCategories.map(category => (
          <option key={category.id} value={category.id}>{category.name}</option>
        ))}
      </Select>

      {parentCategoryId && childCategories.length > 0 && (
        <Select label="二级分类" value={categoryId} onChange={event => onCategoryChange(event.target.value)} required>
          <option value="">请选择二级分类</option>
          {childCategories.map(category => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </Select>
      )}

      <div className="rounded-xl border border-line bg-surface/70 px-4 py-3 text-xs leading-relaxed text-ink-600">
        最终导入位置：{finalPath || (selectedParent && childCategories.length === 0 ? selectedParent.name : '请选择分类')}
      </div>
    </div>
  )
}

function AdminModal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm">
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-3xl bg-white shadow-[var(--shadow-modal)] ${wide ? 'max-w-5xl' : 'max-w-2xl'}`} style={{ padding: 32 }}>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h3 className="font-serif text-2xl text-ink-900">{title}</h3>
          <button type="button" onClick={onClose} className="text-sm text-ink-400 hover:text-ink-900">关闭</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ImportStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface/70 px-4 py-3">
      <p className="mb-1 text-[11px] text-ink-500">{label}</p>
      <p className="font-mono text-sm text-ink-900">{value}</p>
    </div>
  )
}

function ImportPreviewTable({ rows }: { rows: ImportPreviewRow[] }) {
  return (
    <div className="max-h-[360px] overflow-auto rounded-xl border border-line">
      <table className="min-w-[1040px] w-full text-left text-sm">
        <thead className="sticky top-0 bg-canvas text-[11px] text-ink-500">
          <tr>
            <th className="px-3 py-2 font-medium">行</th>
            <th className="px-3 py-2 font-medium">分类</th>
            <th className="px-3 py-2 font-medium">中文</th>
            <th className="px-3 py-2 font-medium">英文</th>
            <th className="px-3 py-2 font-medium">解释</th>
            <th className="px-3 py-2 font-medium">例句</th>
            <th className="px-3 py-2 font-medium">标签</th>
            <th className="px-3 py-2 font-medium">状态</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(row => (
            <tr key={row.lineNumber} className="align-top">
              <td className="px-3 py-3 font-mono text-xs text-ink-500">{row.lineNumber}</td>
              <td className="max-w-[140px] px-3 py-3 text-ink-700">{row.category_name || '-'}</td>
              <td className="max-w-[180px] px-3 py-3 text-ink-900">{row.source_text || '-'}</td>
              <td className="max-w-[180px] px-3 py-3 text-ink-900">{row.target_text || '-'}</td>
              <td className="max-w-[220px] px-3 py-3 text-ink-600">{row.definition || '-'}</td>
              <td className="max-w-[240px] px-3 py-3 text-ink-600">{row.example_sentence || '-'}</td>
              <td className="px-3 py-3 text-ink-600">{row.tags.length > 0 ? row.tags.join(', ') : '-'}</td>
              <td className="px-3 py-3">
                <span className={previewStatusClass(row.status)}>{previewStatusText(row)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TermCard({
  term,
  isAdded,
  saving,
  onAdd,
  onStudy,
}: {
  term: PublicTerm
  isAdded: boolean
  saving: boolean
  onAdd: () => void
  onStudy: () => void
}) {
  return (
    <Card padding="md" className="border-line/80">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(220px,0.85fr)_minmax(260px,1fr)_220px] xl:items-start">
        <div className="min-w-0">
          <Eyebrow tone="muted" className="mb-2">Chinese</Eyebrow>
          <h2 className="break-words font-serif text-2xl leading-snug text-ink-900">{term.source_text}</h2>
          <p className="mt-3 break-words text-base leading-relaxed text-ink-800">{term.target_text}</p>
        </div>

        <div className="min-w-0 space-y-4">
          <TermField label="解释" value={term.definition || '暂无解释'} />
          <TermField label="例句" value={term.example_sentence || '暂无例句'} />
          <div>
            <p className="mb-2 text-[11px] text-ink-500">标签</p>
            {term.tags && term.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {term.tags.map(tag => (
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
            <TermMeta label="来源" value={term.source || '未注明'} />
            <TermMeta label="难度" value={term.difficulty || '未标注'} />
          </div>
          <div className="flex flex-col gap-2">
            <Button variant={isAdded ? 'ghost' : 'secondary'} onClick={onAdd} disabled={isAdded || saving} loading={saving}>
              {isAdded ? '已加入词条本' : '加入我的词条本'}
            </Button>
            <Button variant="ghost" onClick={onStudy}>卡片学习</Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

function TermField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[11px] text-ink-500">{label}</p>
      <p className="break-words text-sm leading-relaxed text-ink-600">{value}</p>
    </div>
  )
}

function TermMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[11px] text-ink-500">{label}</p>
      <p className="min-w-0 truncate text-sm text-ink-800">{value}</p>
    </div>
  )
}

function createTermForm(categoryId: string, categories: TermCategory[] = []): TermForm {
  const selection = createCategorySelection(categoryId, categories)
  return {
    parent_category_id: selection.parent_category_id,
    category_id: selection.category_id,
    source_text: '',
    target_text: '',
    definition: '',
    example_sentence: '',
    tags: '',
    source: '',
    difficulty: '',
  }
}

function createCategorySelection(categoryId: string, categories: TermCategory[]) {
  const selected = findCategoryById(categories, categoryId)
  if (!selected) return { parent_category_id: '', category_id: categoryId }
  if (selected.parent_id) return { parent_category_id: selected.parent_id, category_id: selected.id }

  const children = childCategoriesOf(categories, selected.id)
  return {
    parent_category_id: selected.id,
    category_id: children.length > 0 ? '' : selected.id,
  }
}

function parseImportLine(
  line: string,
  lineNumber: number,
  fallbackCategory: TermCategory | null
): ImportPreviewRow {
  const parts = line.split('|').map(part => part.trim())
  const [sourceText = '', targetText = '', definition = '', exampleSentence = '', tagText = ''] = parts

  if (parts.length > 5) {
    return makePreviewRow(lineNumber, fallbackCategory, sourceText, targetText, definition, exampleSentence, tagText, '', '', 'invalid', '字段超过 5 个')
  }

  if (!sourceText || !targetText) {
    return makePreviewRow(lineNumber, fallbackCategory, sourceText, targetText, definition, exampleSentence, tagText, '', '', 'invalid', '中文和英文必填')
  }

  if (!fallbackCategory) {
    return makePreviewRow(lineNumber, null, sourceText, targetText, definition, exampleSentence, tagText, '', '', 'unknown_category', '未识别分类')
  }

  return makePreviewRow(lineNumber, fallbackCategory, sourceText, targetText, definition, exampleSentence, tagText, '', '', 'ready', '可导入')
}

function parseExcelRow(
  row: Record<string, unknown>,
  lineNumber: number,
  categories: TermCategory[],
  fallbackCategory: TermCategory | null
): ImportPreviewRow {
  const sourceText = pickExcelCell(row, ['中文', 'source_text'])
  const targetText = pickExcelCell(row, ['英文', 'target_text'])
  const definition = pickExcelCell(row, ['解释', 'definition'])
  const exampleSentence = pickExcelCell(row, ['例句', 'example_sentence'])
  const tagText = pickExcelCell(row, ['标签', 'tags'])
  const source = pickExcelCell(row, ['来源', 'source'])
  const difficulty = pickExcelCell(row, ['难度', 'difficulty'])
  const categoryText = pickExcelCell(row, ['分类', 'category'])
  const matchedCategory = categoryText ? findImportableCategoryByName(categories, categoryText) : fallbackCategory

  if (!sourceText || !targetText) {
    const row = makePreviewRow(lineNumber, matchedCategory, sourceText, targetText, definition, exampleSentence, tagText, source, difficulty, 'invalid', '中文和英文必填')
    return categoryText && !matchedCategory ? { ...row, category_name: categoryText } : row
  }

  if (!matchedCategory) {
    const matchedParent = categoryText ? findCategoryByName(categories, categoryText) : null
    const message = matchedParent && childCategoriesOf(categories, matchedParent.id).length > 0
      ? '该一级分类下有二级分类，请指定二级分类'
      : categoryText
        ? '未识别分类'
        : '请先选择最终导入分类'
    return {
      ...makePreviewRow(lineNumber, null, sourceText, targetText, definition, exampleSentence, tagText, source, difficulty, 'unknown_category', message),
      category_name: categoryText || '',
    }
  }

  return makePreviewRow(lineNumber, matchedCategory, sourceText, targetText, definition, exampleSentence, tagText, source, difficulty, 'ready', '可导入')
}

function makePreviewRow(
  lineNumber: number,
  category: TermCategory | null,
  sourceText: string,
  targetText: string,
  definition: string,
  exampleSentence: string,
  tagText: string,
  source: string,
  difficulty: string,
  status: ImportPreviewRow['status'],
  message: string
): ImportPreviewRow {
  return {
    lineNumber,
    category_id: category?.id ?? '',
    category_name: category?.name ?? '',
    source_text: sourceText,
    target_text: targetText,
    definition,
    example_sentence: exampleSentence,
    tags: parseTags(tagText),
    source,
    difficulty,
    status,
    message,
  }
}

function markDuplicateRows(
  rows: ImportPreviewRow[],
  existingTerms: Array<{ category_id: string | null; source_text: string; target_text: string }>
) {
  const existingKeys = new Set(existingTerms.map(row => categoryTermKey(row.category_id ?? '', row.source_text, row.target_text)))
  const seenKeys = new Set<string>()

  return rows.map(row => {
    if (row.status !== 'ready') return row
    const key = categoryTermKey(row.category_id, row.source_text, row.target_text)
    if (existingKeys.has(key)) return { ...row, status: 'duplicate' as const, message: '同分类已存在' }
    if (seenKeys.has(key)) return { ...row, status: 'duplicate' as const, message: '本次导入重复' }
    seenKeys.add(key)
    return row
  })
}

function previewStatusText(row: ImportPreviewRow) {
  if (row.status === 'ready') return '可导入'
  if (row.status === 'unknown_category') return row.message || '未识别分类'
  return row.message
}

function previewStatusClass(status: ImportPreviewRow['status']) {
  if (status === 'ready') return 'inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700'
  if (status === 'duplicate') return 'inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-700'
  if (status === 'unknown_category') return 'inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs text-violet-700'
  return 'inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700'
}

function importStats(rows: ImportPreviewRow[]) {
  return {
    total: rows.length,
    ready: rows.filter(row => row.status === 'ready').length,
    invalid: rows.filter(row => row.status === 'invalid').length,
    duplicate: rows.filter(row => row.status === 'duplicate').length,
    unknownCategory: rows.filter(row => row.status === 'unknown_category').length,
  }
}

function parseTags(value: string) {
  return value.split(',').map(tag => tag.trim()).filter(Boolean)
}

function nullableText(value: string) {
  const trimmed = value.trim()
  return trimmed || null
}

function categoryTermKey(categoryId: string, sourceText: string, targetText: string) {
  return `${categoryId}::${sourceText.trim().toLowerCase()}::${targetText.trim().toLowerCase()}`
}

function findCategoryById(categories: TermCategory[], id: string) {
  return categories.find(category => category.id === id) ?? null
}

function findCategoryByName(categories: TermCategory[], name: string) {
  const normalized = normalizeText(name)
  return categories.find(category => {
    return normalizeText(category.name) === normalized || normalizeText(categoryPathLabel(categories, category.id)) === normalized
  }) ?? null
}

function findImportableCategoryById(categories: TermCategory[], id: string) {
  const matched = findCategoryById(categories, id)
  if (!matched) return null
  return childCategoriesOf(categories, matched.id).length > 0 ? null : matched
}

function findImportableCategoryByName(categories: TermCategory[], name: string) {
  const matched = findCategoryByName(categories, name)
  if (!matched) return null
  return childCategoriesOf(categories, matched.id).length > 0 ? null : matched
}

function parentCategoryOptions(categories: TermCategory[]) {
  return categories.filter(category => !category.parent_id || (category.level ?? 1) === 1)
}

function childCategoriesOf(categories: TermCategory[], parentId: string) {
  return categories.filter(category => category.parent_id === parentId)
}

function categoryPathLabel(categories: TermCategory[], categoryId: string) {
  const selected = findCategoryById(categories, categoryId)
  if (!selected) return ''
  const parent = selected.parent_id ? findCategoryById(categories, selected.parent_id) : null
  return parent ? `${parent.name} / ${selected.name}` : selected.name
}

function pickExcelCell(row: Record<string, unknown>, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeText)
  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.includes(normalizeText(key))) return cellToText(value)
  }
  return ''
}

function cellToText(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizeText(value: string) {
  return value.trim().toLowerCase()
}
