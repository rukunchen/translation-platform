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
  status: string
  is_questionable: boolean
  match_status: 'matched' | 'possibly_inconsistent' | 'not_found' | 'unknown'
  created_at: string
  updated_at: string
}

type MatchFilter = 'all' | 'matched' | 'possibly_inconsistent' | 'not_found' | 'unknown'
type QuestionFilter = 'all' | 'questionable' | 'clean'

const matchMeta: Record<Term['match_status'], { label: string; cls: string }> = {
  matched:               { label: '✓ 已匹配',     cls: 'bg-green-50 text-green-700 border border-green-100' },
  possibly_inconsistent: { label: '⚠ 可能未统一', cls: 'bg-amber-50 text-amber-700 border border-amber-100' },
  not_found:             { label: '○ 未出现',     cls: 'bg-canvas text-ink-500 border border-line' },
  unknown:               { label: '· 未检查',     cls: 'bg-canvas text-ink-400 border border-line' },
}

export default function GlossaryPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [terms, setTerms] = useState<Term[]>([])
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading] = useState(true)
  const [matching, setMatching] = useState(false)
  const [importing, setImporting] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newSrc, setNewSrc] = useState('')
  const [newTgt, setNewTgt] = useState('')
  const [newCat, setNewCat] = useState('')
  const [newNote, setNewNote] = useState('')
  const [adding, setAdding] = useState(false)

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
    })
    void load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function load() {
    setLoading(true)
    const [{ data: proj }, { data: rows }] = await Promise.all([
      supabase.from('projects').select('name').eq('id', projectId).maybeSingle(),
      supabase.from('glossary_terms').select('*').eq('project_id', projectId)
        .order('created_at', { ascending: false }),
    ])
    setProjectName((proj?.name as string) ?? '')
    // 防御：旧行可能缺新字段（虽然 DB default 会回填，但 select 投影后类型上是 unknown）
    const normalized = (rows ?? []).map(r => {
      const row = r as Record<string, unknown>
      return {
        ...row,
        category: String(row.category ?? ''),
        note: String(row.note ?? row.definition ?? ''),
        status: String(row.status ?? 'active'),
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

  async function toggleQuestionable(t: Term) {
    const next = !t.is_questionable
    patchLocal(t.id, { is_questionable: next })
    const { error } = await apiJSON(`/api/glossary/${t.id}`, {
      method: 'PATCH', body: JSON.stringify({ is_questionable: next }),
    })
    if (error) { alert('保存失败：' + error); patchLocal(t.id, { is_questionable: !next }) }
  }

  async function deleteTerm(t: Term) {
    if (!confirm(`确认删除术语「${t.source_term} → ${t.translated_term}」？`)) return
    const { error } = await apiJSON(`/api/glossary/${t.id}`, { method: 'DELETE' })
    if (error) { alert('删除失败：' + error); return }
    setTerms(prev => prev.filter(x => x.id !== t.id))
  }

  async function addTerm(e: React.FormEvent) {
    e.preventDefault()
    if (!newSrc.trim() || !newTgt.trim()) { alert('原文术语与译文术语必填'); return }
    setAdding(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('glossary_terms').insert({
      project_id: projectId, created_by: user?.id,
      source_term: newSrc.trim(), translated_term: newTgt.trim(),
      category: newCat.trim(), note: newNote.trim(),
      status: 'active', is_questionable: false, match_status: 'unknown',
    }).select().single()
    setAdding(false)
    if (error) { alert('新增失败：' + error.message); return }
    setTerms(prev => [data as Term, ...prev])
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
      const mapped = rows.map(mapRowToTerm).filter(r => r.source_term && r.translated_term)
      if (mapped.length === 0) { alert('未识别到任何有效行。请确认表头包含原文术语 / 译文术语字段。'); return }
      const { data, error } = await apiJSON<{ inserted: number; skipped: number; total: number }>(
        '/api/glossary/import',
        { method: 'POST', body: JSON.stringify({ projectId, terms: mapped }) }
      )
      if (error) { alert('导入失败：' + error); return }
      alert(`导入完成：新增 ${data?.inserted ?? 0} 条，跳过重复 ${data?.skipped ?? 0} 条`)
      await load()
    } catch (err) {
      alert('解析文件失败：' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setImporting(false)
    }
  }

  async function runMatch() {
    setMatching(true)
    const { data, error } = await apiJSON<{ summary: Record<string, number>; total: number }>(
      '/api/glossary/match',
      { method: 'POST', body: JSON.stringify({ projectId }) }
    )
    setMatching(false)
    if (error) { alert('匹配失败：' + error); return }
    const s = data?.summary
    if (s) {
      alert(`匹配完成（共 ${data?.total ?? 0} 条）：\n· 已匹配 ${s.matched}\n· 可能未统一 ${s.possibly_inconsistent}\n· 未出现 ${s.not_found}`)
    }
    await load()
  }

  // 筛选 & 搜索
  const categories = useMemo(() => {
    const set = new Set<string>()
    terms.forEach(t => t.category && set.add(t.category))
    return Array.from(set).sort()
  }, [terms])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return terms.filter(t => {
      if (filterCategory !== 'all' && t.category !== filterCategory) return false
      if (filterMatch !== 'all' && t.match_status !== filterMatch) return false
      if (filterQ === 'questionable' && !t.is_questionable) return false
      if (filterQ === 'clean' && t.is_questionable) return false
      if (needle && !`${t.source_term} ${t.translated_term}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [terms, q, filterCategory, filterMatch, filterQ])

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
                <FilterSelect label="类别" value={filterCategory}
                  onChange={setFilterCategory}
                  options={[['all', '全部类别'], ...categories.map(c => [c, c] as [string, string])]}
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
              </p>
            </Card>

            {/* 术语表格 */}
            <Card padding="none" className="overflow-hidden">
              <div className="grid grid-cols-[48px_minmax(0,1.2fr)_minmax(0,1.2fr)_120px_minmax(0,1fr)_110px_110px_84px] bg-canvas border-b border-line text-[11px]">
                <div className="px-4 py-3 flex justify-center"><Eyebrow tone="muted">#</Eyebrow></div>
                <div className="px-4 py-3"><Eyebrow>原文术语</Eyebrow></div>
                <div className="px-4 py-3 border-l border-line"><Eyebrow tone="brand">译文术语</Eyebrow></div>
                <div className="px-4 py-3 border-l border-line"><Eyebrow>类别</Eyebrow></div>
                <div className="px-4 py-3 border-l border-line"><Eyebrow>备注</Eyebrow></div>
                <div className="px-3 py-3 border-l border-line"><Eyebrow tone="muted">疑点</Eyebrow></div>
                <div className="px-3 py-3 border-l border-line"><Eyebrow tone="muted">匹配</Eyebrow></div>
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
                      'grid grid-cols-[48px_minmax(0,1.2fr)_minmax(0,1.2fr)_120px_minmax(0,1fr)_110px_110px_84px] border-b border-line last:border-b-0 transition-colors',
                      t.is_questionable ? 'bg-amber-50/30' : 'hover:bg-canvas/30'
                    )}>
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
                      placeholder="—"
                      value={t.category}
                      onFocus={() => captureBaseline(t, 'category')}
                      onChange={v => patchLocal(t.id, { category: v })}
                      onBlur={() => saveField(t.id, 'category', terms.find(x => x.id === t.id)?.category ?? '')}
                    />
                    <CellInput
                      borderLeft
                      multiline
                      placeholder="备注 / 处理说明"
                      value={t.note || t.definition || ''}
                      onFocus={() => captureBaseline(t, 'note')}
                      onChange={v => patchLocal(t.id, { note: v })}
                      onBlur={() => saveField(t.id, 'note', terms.find(x => x.id === t.id)?.note ?? '')}
                    />

                    {/* 疑点 */}
                    <div className="px-3 py-3 border-l border-line flex items-center justify-center">
                      <button
                        onClick={() => toggleQuestionable(t)}
                        className={cn(
                          'text-[10px] font-medium rounded-full px-2 py-1 transition-colors uppercase tracking-wider',
                          t.is_questionable
                            ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-200'
                            : 'bg-canvas text-ink-400 hover:bg-canvas-2 border border-line'
                        )}
                        title={t.is_questionable ? '点击取消标注' : '点击标注为有疑点'}
                      >
                        {t.is_questionable ? '⚠ 有疑点' : '○ 标记'}
                      </button>
                    </div>

                    {/* 匹配状态 */}
                    <div className="px-3 py-3 border-l border-line flex items-center justify-center">
                      {(() => {
                        const meta = matchMeta[t.match_status] ?? matchMeta.unknown
                        return (
                          <span className={cn('text-[10px] font-medium rounded-full px-2 py-1 uppercase tracking-wider', meta.cls)}>
                            {meta.label}
                          </span>
                        )
                      })()}
                    </div>

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
              <Input label="原文术语" value={newSrc} onChange={e => setNewSrc(e.target.value)} required />
              <Input label="译文术语" value={newTgt} onChange={e => setNewTgt(e.target.value)} required />
              <Input label="类别（可选）" value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="例：法律 / 学术 / 业务" />
              <Input label="备注（可选）" value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="说明、出处、用法注意..." />
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
    if (['原文术语', '原文', '术语', 'sourceterm', 'source_term', 'source'].includes(norm)) keyMap.source_term = k
    else if (['译文术语', '译文', 'targetterm', 'target_term', 'target', 'translation', 'translated_term'].includes(norm)) keyMap.translated_term = k
    else if (['类别', '分类', 'category', 'type'].includes(norm)) keyMap.category = k
    else if (['备注', '说明', '注释', 'note', 'remark', 'comment', 'definition'].includes(norm)) keyMap.note = k
    else if (['状态', 'status'].includes(norm)) keyMap.status = k
  }
  const pick = (k: string) => String(keyMap[k] ? row[keyMap[k]] ?? '' : '').trim()
  return {
    source_term: pick('source_term'),
    translated_term: pick('translated_term'),
    category: pick('category'),
    note: pick('note'),
    status: pick('status') || 'active',
  }
}
