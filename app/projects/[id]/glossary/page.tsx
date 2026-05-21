'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { apiJSON } from '@/lib/apiFetch'
import Sidebar from '@/components/Sidebar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { PageHeader } from '@/components/ui/PageHeader'
import { MainContent } from '@/components/ui/MainContent'
import { cn } from '@/components/ui/cn'

type Term = {
  id: string
  project_id: string
  source_term: string
  translated_term: string
  category: string
  note: string
  definition?: string | null
  revision_term: string
  revision_reason: string
  part_of_speech: string
  source_evidence: string
  project_context: string
  status: string
  is_questionable: boolean
  match_status: 'matched' | 'possibly_inconsistent' | 'not_found' | 'unknown'
  created_at: string
  updated_at: string
}

type MatchFilter = 'all' | 'matched' | 'possibly_inconsistent' | 'not_found' | 'unknown'
type QuestionFilter = 'all' | 'questionable' | 'clean'

const GLOSSARY_META_PREFIX = '__GLOSSARY_META_V1__\n'

type GlossaryMeta = {
  revision_term: string
  revision_reason: string
  part_of_speech: string
  source_evidence: string
  project_context: string
  status: string
}

function emptyMeta(): GlossaryMeta {
  return {
    revision_term: '',
    revision_reason: '',
    part_of_speech: '',
    source_evidence: '',
    project_context: '',
    status: '',
  }
}

function parseGlossaryMeta(note?: string | null, definition?: string | null, category?: string | null): GlossaryMeta {
  const raw = note || definition || ''
  if (raw.startsWith(GLOSSARY_META_PREFIX)) {
    try {
      return { ...emptyMeta(), ...JSON.parse(raw.slice(GLOSSARY_META_PREFIX.length)) }
    } catch {
      return emptyMeta()
    }
  }
  return {
    ...emptyMeta(),
    part_of_speech: category || '',
    source_evidence: definition || '',
    project_context: note || '',
  }
}

function serializeGlossaryMeta(meta: GlossaryMeta): string {
  return GLOSSARY_META_PREFIX + JSON.stringify(meta)
}

export default function GlossaryPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [terms, setTerms] = useState<Term[]>([])
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [matching, setMatching] = useState(false)
  const [lastMatchSnapshot, setLastMatchSnapshot] = useState<Record<string, Term['match_status']> | null>(null)
  const [undoingMatch, setUndoingMatch] = useState(false)
  const [importing, setImporting] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newSrc, setNewSrc] = useState('')
  const [newTgt, setNewTgt] = useState('')
  const [newCat, setNewCat] = useState('')
  const [newNote, setNewNote] = useState('')
  const [adding, setAdding] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // 筛选与搜索
  const [q, setQ] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterMatch, setFilterMatch] = useState<MatchFilter>('all')
  const [filterQ, setFilterQ] = useState<QuestionFilter>('all')

  // 行内编辑：focus 基线
  const baselineRef = useRef<Record<string, Record<string, string>>>({})

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      void load(user.id)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function load(userId: string) {
    setLoading(true)
    const { data: memberRow } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle()
    if (!memberRow) {
      setAccessDenied(true)
      setProjectName(''); setTerms([]); setLoading(false)
      return
    }
    setAccessDenied(false)

    const [{ data: proj }, { data: rows }] = await Promise.all([
      supabase.from('projects').select('name').eq('id', projectId).maybeSingle(),
      supabase.from('glossary_terms').select('*').eq('project_id', projectId)
        .order('created_at', { ascending: false }),
    ])
    setProjectName((proj?.name as string) ?? '')
    // 防御：旧行可能缺新字段（虽然 DB default 会回填，但 select 投影后类型上是 unknown）
    const normalized = (rows ?? []).map(r => {
      const row = r as Record<string, unknown>
      const meta = parseGlossaryMeta(String(row.note ?? ''), String(row.definition ?? ''), String(row.category ?? ''))
      return {
        ...row,
        category: String(row.category ?? ''),
        note: String(row.note ?? row.definition ?? ''),
        revision_term: meta.revision_term,
        revision_reason: meta.revision_reason,
        part_of_speech: meta.part_of_speech,
        source_evidence: meta.source_evidence,
        project_context: meta.project_context,
        status: meta.status || String(row.status ?? 'active'),
        is_questionable: Boolean(row.is_questionable ?? false),
        match_status: (row.match_status as Term['match_status']) ?? 'unknown',
      } as Term
    })
    setTerms(normalized)
    setLoading(false)
  }

  // —— 行内编辑 ——
  function captureBaseline(t: Term, field: keyof Term) {
    if (!baselineRef.current[t.id]) baselineRef.current[t.id] = {}
    baselineRef.current[t.id][field as string] = String((t as Record<string, unknown>)[field] ?? '')
  }

  function patchLocal(id: string, patch: Partial<Term>) {
    setTerms(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  }

  async function saveField(id: string, field: keyof Term, value: unknown) {
    const baseline = baselineRef.current[id]?.[field as string]
    if (baseline !== undefined && baseline === String(value ?? '')) return
    const { data, error } = await apiJSON<{ term: Term }>(`/api/glossary/${id}`, {
      method: 'PATCH', body: JSON.stringify({ [field]: value }),
    })
    if (error) { alert('保存失败：' + error); return }
    if (data?.term) patchLocal(id, data.term)
  }

  async function saveMetaField(id: string, field: keyof GlossaryMeta, value: string) {
    const current = terms.find(t => t.id === id)
    if (!current) return
    const baseline = baselineRef.current[id]?.[field]
    if (baseline !== undefined && baseline === value) return
    const nextMeta: GlossaryMeta = {
      revision_term: current.revision_term || '',
      revision_reason: current.revision_reason || '',
      part_of_speech: current.part_of_speech || '',
      source_evidence: current.source_evidence || '',
      project_context: current.project_context || '',
      status: current.status || '',
      [field]: value,
    }
    const patch: Partial<Term> = {
      ...nextMeta,
      note: serializeGlossaryMeta(nextMeta),
      definition: serializeGlossaryMeta(nextMeta),
      category: nextMeta.part_of_speech,
    }
    patchLocal(id, patch)
    const { error } = await apiJSON(`/api/glossary/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        definition: serializeGlossaryMeta(nextMeta),
      }),
    })
    if (error) { alert('保存失败：' + error); return }
  }

  async function deleteTerm(t: Term) {
    if (!confirm(`确认删除术语「${t.source_term} → ${t.translated_term}」？`)) return
    const { error } = await apiJSON(`/api/glossary/${t.id}`, { method: 'DELETE' })
    if (error) { alert('删除失败：' + error); return }
    setTerms(prev => prev.filter(x => x.id !== t.id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.delete(t.id)
      return next
    })
  }

  async function deleteSelectedTerms() {
    const existingIds = new Set(terms.map(t => t.id))
    const ids = Array.from(selectedIds).filter(id => existingIds.has(id))
    if (ids.length === 0) { alert('请先选择要删除的术语。'); return }
    if (!confirm(`确认删除选中的 ${ids.length} 条术语？此操作无法撤销。`)) return

    setBulkDeleting(true)
    const deletedIds: string[] = []
    let failed = 0
    for (const id of ids) {
      const { error } = await apiJSON(`/api/glossary/${id}`, { method: 'DELETE' })
      if (error) failed += 1
      else deletedIds.push(id)
    }
    setBulkDeleting(false)

    if (deletedIds.length > 0) {
      const deleted = new Set(deletedIds)
      setTerms(prev => prev.filter(t => !deleted.has(t.id)))
      setSelectedIds(prev => {
        const next = new Set(prev)
        deletedIds.forEach(id => next.delete(id))
        return next
      })
    }
    if (failed > 0) alert(`${failed} 条术语删除失败，请刷新后重试。`)
  }

  async function addTerm(e: React.FormEvent) {
    e.preventDefault()
    if (!newSrc.trim() || !newTgt.trim()) { alert('原文术语与译文术语必填'); return }
    setAdding(true)
    const { data: { user } } = await supabase.auth.getUser()
    const meta = {
      ...emptyMeta(),
      part_of_speech: newCat.trim(),
      project_context: newNote.trim(),
      status: 'active',
    }
    const { data, error } = await supabase.from('glossary_terms').insert({
      project_id: projectId, created_by: user?.id,
      source_term: newSrc.trim(), translated_term: newTgt.trim(),
      definition: serializeGlossaryMeta(meta),
    }).select().single()
    setAdding(false)
    if (error) { alert('新增失败：' + error.message); return }
    setTerms(prev => [{ ...(data as Term), ...meta, category: meta.part_of_speech, note: serializeGlossaryMeta(meta), status: 'active', is_questionable: false, match_status: 'unknown' }, ...prev])
    setShowAdd(false); setNewSrc(''); setNewTgt(''); setNewCat(''); setNewNote('')
  }

  // —— 导入 ——
  function pickFile() { fileInputRef.current?.click() }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setImporting(true)
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      // 映射字段
      const mapped = rows.map(mapRowToTerm).filter(r => r.source_term)
      if (mapped.length === 0) { alert('未识别到任何有效行。请确认表头包含中文 / 原文术语字段。'); return }
      const { data, error } = await apiJSON<{ inserted: number; skipped: number; total: number }>(
        '/api/glossary/import',
        { method: 'POST', body: JSON.stringify({ projectId, terms: mapped }) }
      )
      if (error) { alert('导入失败：' + error); return }
      alert(`导入完成：新增 ${data?.inserted ?? 0} 条，跳过重复 ${data?.skipped ?? 0} 条`)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) await load(user.id)
    } catch (err) {
      alert('解析文件失败：' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setImporting(false)
    }
  }

  async function runMatch() {
    if (!confirm('全文匹配只会更新术语表的匹配状态，不会修改任何译文。是否继续？')) return
    const snapshot = Object.fromEntries(terms.map(t => [t.id, t.match_status])) as Record<string, Term['match_status']>
    setMatching(true)
    const { data, error } = await apiJSON<{ summary: Record<string, number>; total: number }>(
      '/api/glossary/match',
      { method: 'POST', body: JSON.stringify({ projectId }) }
    )
    setMatching(false)
    if (error) { alert('匹配失败：' + error); return }
    setLastMatchSnapshot(snapshot)
    const s = data?.summary
    if (s) {
      alert(`匹配完成（共 ${data?.total ?? 0} 条）：\n· 已匹配 ${s.matched}\n· 可能未统一 ${s.possibly_inconsistent}\n· 未出现 ${s.not_found}\n\n如果是误点，可以点击「撤销本次匹配」恢复之前的匹配状态。`)
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await load(user.id)
  }

  async function undoLastMatch() {
    if (!lastMatchSnapshot) return
    const ids = Object.keys(lastMatchSnapshot)
    if (ids.length === 0) return
    if (!confirm('确认撤销本次全文匹配？这只会恢复术语表的匹配状态，不会修改术语内容或译文。')) return
    setUndoingMatch(true)
    let failed = 0
    await Promise.all(ids.map(async id => {
      const { error } = await apiJSON(`/api/glossary/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ match_status: lastMatchSnapshot[id] }),
      })
      if (error) failed++
    }))
    setUndoingMatch(false)
    if (failed > 0) {
      alert(`${failed} 条术语匹配状态恢复失败，请刷新后检查。`)
    } else {
      alert('已撤销本次全文匹配，匹配状态已恢复。')
      setLastMatchSnapshot(null)
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await load(user.id)
  }

  // 筛选 & 搜索
  const categories = useMemo(() => {
    const set = new Set<string>()
    terms.forEach(t => t.part_of_speech && set.add(t.part_of_speech))
    return Array.from(set).sort()
  }, [terms])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return terms.filter(t => {
      if (filterCategory !== 'all' && t.part_of_speech !== filterCategory) return false
      if (filterMatch !== 'all' && t.match_status !== filterMatch) return false
      if (filterQ === 'questionable' && !t.is_questionable) return false
      if (filterQ === 'clean' && t.is_questionable) return false
      if (needle && !`${t.source_term} ${t.translated_term} ${t.revision_term} ${t.project_context}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [terms, q, filterCategory, filterMatch, filterQ])

  const visibleIds = useMemo(() => visible.map(t => t.id), [visible])
  const selectedVisibleCount = visibleIds.filter(id => selectedIds.has(id)).length
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length

  function toggleTermSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleVisibleSelected() {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allVisibleSelected) visibleIds.forEach(id => next.delete(id))
      else visibleIds.forEach(id => next.add(id))
      return next
    })
  }

  if (accessDenied) return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="bg-white rounded-2xl border border-line min-h-[calc(100vh-40px)] flex items-center justify-center">
          <Card padding="lg" className="text-center max-w-sm">
            <h3 className="font-serif text-xl text-ink-900 mb-2">无权访问</h3>
            <Button onClick={() => router.push('/dashboard')}>返回工作台</Button>
          </Card>
        </div>
      </main>
    </div>
  )

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="bg-white rounded-2xl border border-line min-h-[calc(100vh-40px)]">
          <MainContent size="wide">

            <PageHeader
              backHref={`/projects/${projectId}`}
              backLabel="返回项目"
              eyebrow="Glossary"
              title={`${projectName ? projectName + ' · ' : ''}术语库`}
              description="统一管理项目术语：手动新增、Excel/CSV 导入、AI 生成、全文匹配，让译文术语保持一致。"
              actions={
                <div className="flex items-center gap-2">
                  <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,text/csv"
                    onChange={handleFile} className="hidden" />
                  <Button size="sm" variant="ghost" onClick={pickFile} loading={importing}>
                    {importing ? '导入中...' : '导入 Excel/CSV'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={runMatch} loading={matching}>
                    {matching ? '匹配中...' : '全文匹配'}
                  </Button>
                  {lastMatchSnapshot && (
                    <Button size="sm" variant="ghost" onClick={undoLastMatch} loading={undoingMatch}>
                      {undoingMatch ? '撤销中...' : '撤销本次匹配'}
                    </Button>
                  )}
                  <Button size="sm" variant="brand" onClick={() => setShowAdd(true)} leftIcon={<span>+</span>}>
                    新增术语
                  </Button>
                </div>
              }
            />

            {/* 搜索 + 筛选条 */}
            <Card padding="md" className="mb-6">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
                <Input
                  label="搜索（原文或译文）"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="输入关键字..."
                />
                <FilterSelect label="词性" value={filterCategory}
                  onChange={setFilterCategory}
                  options={[['all', '全部词性'], ...categories.map(c => [c, c] as [string, string])]}
                />
                <FilterSelect label="疑点" value={filterQ}
                  onChange={v => setFilterQ(v as QuestionFilter)}
                  options={[['all', '全部'], ['questionable', '仅有疑点'], ['clean', '已澄清']]}
                />
                <FilterSelect label="匹配状态" value={filterMatch}
                  onChange={v => setFilterMatch(v as MatchFilter)}
                  options={[['all','全部'],['matched','已匹配'],['possibly_inconsistent','可能未统一'],['not_found','未出现'],['unknown','未检查']]}
                />
              </div>
              <p className="mt-4 text-xs text-ink-500">
                共 <span className="text-ink-900 font-medium">{terms.length}</span> 条 · 当前显示 <span className="text-ink-900 font-medium">{visible.length}</span> 条
                {selectedIds.size > 0 && <> · 已选择 <span className="text-ink-900 font-medium">{selectedIds.size}</span> 条</>}
              </p>
              {selectedIds.size > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="danger" onClick={deleteSelectedTerms} loading={bulkDeleting}>
                    {bulkDeleting ? '删除中...' : `删除选中（${selectedIds.size}）`}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} disabled={bulkDeleting}>
                    取消选择
                  </Button>
                </div>
              )}
            </Card>

            {/* 术语表格 */}
            <Card padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
              <div className="min-w-[1530px] grid grid-cols-[44px_56px_minmax(130px,1fr)_minmax(130px,1fr)_minmax(130px,1fr)_minmax(160px,1.1fr)_100px_minmax(160px,1.1fr)_minmax(180px,1.2fr)_110px_84px] bg-canvas border-b border-line text-[11px]">
                <div className="px-3 py-3 flex justify-center">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleVisibleSelected}
                    disabled={visible.length === 0 || bulkDeleting}
                    aria-label="全选当前显示的术语"
                    className="h-4 w-4 rounded border-line text-brand focus:ring-brand"
                  />
                </div>
                <div className="px-4 py-3 flex justify-center"><Eyebrow tone="muted">#</Eyebrow></div>
                <div className="px-4 py-3"><Eyebrow>中文</Eyebrow></div>
                <div className="px-4 py-3 border-l border-line"><Eyebrow tone="brand">推荐译名</Eyebrow></div>
                <div className="px-4 py-3 border-l border-line"><Eyebrow>修改译名</Eyebrow></div>
                <div className="px-4 py-3 border-l border-line"><Eyebrow>修改原因</Eyebrow></div>
                <div className="px-4 py-3 border-l border-line"><Eyebrow>词性</Eyebrow></div>
                <div className="px-4 py-3 border-l border-line"><Eyebrow>溯源依据</Eyebrow></div>
                <div className="px-4 py-3 border-l border-line"><Eyebrow>项目内应用上下文</Eyebrow></div>
                <div className="px-3 py-3 border-l border-line"><Eyebrow tone="muted">状态</Eyebrow></div>
                <div className="px-3 py-3 border-l border-line flex justify-center"><Eyebrow tone="muted">操作</Eyebrow></div>
              </div>

              {loading ? (
                <div className="py-20 text-center text-sm text-ink-500">加载中...</div>
              ) : visible.length === 0 ? (
                <div className="py-20 text-center">
                  <p className="text-ink-500 text-sm mb-4">{terms.length === 0 ? '术语库还是空的' : '没有符合筛选条件的术语'}</p>
                  {terms.length === 0 && (
                    <Button size="sm" variant="brand" onClick={() => setShowAdd(true)}>添加第一个术语</Button>
                  )}
                </div>
              ) : (
                visible.map((t, i) => (
                  <div key={t.id}
                    className={cn(
                      'min-w-[1530px] grid grid-cols-[44px_56px_minmax(130px,1fr)_minmax(130px,1fr)_minmax(130px,1fr)_minmax(160px,1.1fr)_100px_minmax(160px,1.1fr)_minmax(180px,1.2fr)_110px_84px] border-b border-line last:border-b-0 transition-colors',
                      t.is_questionable ? 'bg-amber-50/30' : 'hover:bg-canvas/30'
                    )}>
                    <div className="px-3 py-3 flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(t.id)}
                        onChange={() => toggleTermSelected(t.id)}
                        disabled={bulkDeleting}
                        aria-label={`选择术语 ${t.source_term}`}
                        className="h-4 w-4 rounded border-line text-brand focus:ring-brand"
                      />
                    </div>
                    <div className="px-4 py-3 flex items-center justify-center text-[11px] font-mono text-ink-400">
                      {String(i + 1).padStart(2, '0')}
                    </div>

                    <CellInput
                      value={t.source_term}
                      onFocus={() => captureBaseline(t, 'source_term')}
                      onChange={v => patchLocal(t.id, { source_term: v })}
                      onBlur={() => saveField(t.id, 'source_term', terms.find(x => x.id === t.id)?.source_term ?? '')}
                    />
                    <CellInput
                      borderLeft
                      brand
                      value={t.translated_term}
                      onFocus={() => captureBaseline(t, 'translated_term')}
                      onChange={v => patchLocal(t.id, { translated_term: v })}
                      onBlur={() => saveField(t.id, 'translated_term', terms.find(x => x.id === t.id)?.translated_term ?? '')}
                    />
                    <CellInput
                      borderLeft
                      brand
                      placeholder="可选"
                      value={t.revision_term}
                      onFocus={() => captureBaseline(t, 'revision_term')}
                      onChange={v => patchLocal(t.id, { revision_term: v })}
                      onBlur={() => saveMetaField(t.id, 'revision_term', terms.find(x => x.id === t.id)?.revision_term ?? '')}
                    />
                    <CellInput
                      borderLeft
                      multiline
                      placeholder="说明为什么修改"
                      value={t.revision_reason}
                      onFocus={() => captureBaseline(t, 'revision_reason')}
                      onChange={v => patchLocal(t.id, { revision_reason: v })}
                      onBlur={() => saveMetaField(t.id, 'revision_reason', terms.find(x => x.id === t.id)?.revision_reason ?? '')}
                    />
                    <CellInput
                      borderLeft
                      placeholder="名词/动词..."
                      value={t.part_of_speech}
                      onFocus={() => captureBaseline(t, 'part_of_speech')}
                      onChange={v => patchLocal(t.id, { part_of_speech: v, category: v })}
                      onBlur={() => saveMetaField(t.id, 'part_of_speech', terms.find(x => x.id === t.id)?.part_of_speech ?? '')}
                    />
                    <CellInput
                      borderLeft
                      multiline
                      placeholder="出处、原文依据..."
                      value={t.source_evidence}
                      onFocus={() => captureBaseline(t, 'source_evidence')}
                      onChange={v => patchLocal(t.id, { source_evidence: v })}
                      onBlur={() => saveMetaField(t.id, 'source_evidence', terms.find(x => x.id === t.id)?.source_evidence ?? '')}
                    />
                    <CellInput
                      borderLeft
                      multiline
                      placeholder="项目内使用语境..."
                      value={t.project_context}
                      onFocus={() => captureBaseline(t, 'project_context')}
                      onChange={v => patchLocal(t.id, { project_context: v })}
                      onBlur={() => saveMetaField(t.id, 'project_context', terms.find(x => x.id === t.id)?.project_context ?? '')}
                    />
                    <CellInput
                      borderLeft
                      placeholder="active"
                      value={t.status}
                      onFocus={() => captureBaseline(t, 'status')}
                      onChange={v => patchLocal(t.id, { status: v })}
                      onBlur={() => saveMetaField(t.id, 'status', terms.find(x => x.id === t.id)?.status ?? '')}
                    />

                    {/* 删除 */}
                    <div className="px-3 py-3 border-l border-line flex items-center justify-center">
                      <button onClick={() => deleteTerm(t)}
                        title="删除术语"
                        className="p-1.5 rounded-lg text-ink-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
              </div>
            </Card>

          </MainContent>
        </div>
      </main>

      {showAdd && (
        <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-lg p-10 lg:p-12 shadow-[var(--shadow-modal)]">
            <h3 className="font-serif text-2xl text-ink-900 mb-2 tracking-tight">新增术语</h3>
            <p className="text-ink-500 text-sm mb-7">手动添加一条术语到当前项目库。</p>
            <form onSubmit={addTerm} className="space-y-4">
              <Input label="中文" value={newSrc} onChange={e => setNewSrc(e.target.value)} required />
              <Input label="推荐译名" value={newTgt} onChange={e => setNewTgt(e.target.value)} required />
              <Input label="词性（可选）" value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="例：名词 / 动词 / 短语" />
              <Input label="项目内应用上下文（可选）" value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="说明在本项目中的使用语境..." />
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" fullWidth type="button" onClick={() => setShowAdd(false)}>取消</Button>
                <Button variant="primary" fullWidth type="submit" loading={adding}>{adding ? '添加中...' : '添加'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// —— 单元格组件：focus 编辑、blur 自动保存 ——
function CellInput({
  value, onChange, onFocus, onBlur,
  multiline, brand, borderLeft, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onFocus?: () => void
  onBlur?: () => void
  multiline?: boolean
  brand?: boolean
  borderLeft?: boolean
  placeholder?: string
}) {
  const cls = cn(
    'px-3 py-3 border-l border-line',
    !borderLeft && 'border-l-0'
  )
  const inputCls = cn(
    'w-full text-sm leading-6 bg-transparent rounded-md px-2 py-1.5 focus:outline-none transition-colors',
    'placeholder-ink-300 hover:bg-canvas/40 focus:bg-white focus:ring-2 focus:ring-brand/30',
    brand ? 'text-brand font-medium' : 'text-ink-900',
  )
  if (multiline) {
    return (
      <div className={cls}>
        <textarea
          value={value} placeholder={placeholder}
          rows={2}
          onFocus={onFocus}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          className={cn(inputCls, 'resize-none min-h-[44px]')}
        />
      </div>
    )
  }
  return (
    <div className={cls}>
      <input
        type="text"
        value={value} placeholder={placeholder}
        onFocus={onFocus}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        className={inputCls}
      />
    </div>
  )
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<[string, string]>
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-ink-500 mb-1.5 uppercase tracking-wider">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-sm border-2 border-line rounded-xl px-3 py-2 text-ink-900 focus:outline-none focus:border-brand bg-white min-w-[140px]"
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}

function mapRowToTerm(row: Record<string, unknown>): {
  source_term: string; translated_term: string;
  category: string; note: string; status: string;
} {
  // 列名同义词归一
  const keyMap: Record<string, string> = {}
  for (const k of Object.keys(row)) {
    const norm = k.trim().toLowerCase()
    if (['中文', '原文术语', '原文', '术语', 'sourceterm', 'source_term', 'source'].includes(norm)) keyMap.source_term = k
    else if (['推荐译名', '译文术语', '译文', 'targetterm', 'target_term', 'target', 'translation', 'translated_term'].includes(norm)) keyMap.translated_term = k
    else if (['修改译名', '修订译名', 'revision_term', 'revised term'].includes(norm)) keyMap.revision_term = k
    else if (['修改原因', '修订原因', 'revision_reason', 'reason'].includes(norm)) keyMap.revision_reason = k
    else if (['词性', 'part_of_speech', 'pos', '类别', '分类', 'category', 'type'].includes(norm)) keyMap.part_of_speech = k
    else if (['溯源依据', '出处', '来源', 'source_evidence', 'evidence', 'definition'].includes(norm)) keyMap.source_evidence = k
    else if (['项目内应用上下文', '应用上下文', '上下文', '语境', 'project_context', 'context', '备注', '说明', '注释', 'note', 'remark', 'comment'].includes(norm)) keyMap.project_context = k
    else if (['状态', 'status'].includes(norm)) keyMap.status = k
  }
  const pick = (k: string) => String(keyMap[k] ? row[keyMap[k]] ?? '' : '').trim()
  const meta: GlossaryMeta = {
    revision_term: pick('revision_term'),
    revision_reason: pick('revision_reason'),
    part_of_speech: pick('part_of_speech'),
    source_evidence: pick('source_evidence'),
    project_context: pick('project_context'),
    status: pick('status') || 'active',
  }
  return {
    source_term: pick('source_term'),
    translated_term: pick('translated_term'),
    category: meta.part_of_speech,
    note: serializeGlossaryMeta(meta),
    status: meta.status,
  }
}
