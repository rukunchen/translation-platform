'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import MembersPanel from '@/components/MembersPanel'
import ChatPanel from '@/components/ChatPanel'
import ChatToggleButton from '@/components/ChatToggleButton'
import { type Role } from '@/lib/permissions'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { MainContent } from '@/components/ui/MainContent'
import { cn } from '@/components/ui/cn'
import { splitSentences } from '@/lib/sentenceSplit'

// ---------- 类型 ----------
type Document = {
  id: string; title: string
  source_language: string; target_language: string
  created_at: string; updated_at?: string
  created_by?: string | null
}
type Project = { id: string; name: string; description: string }
type SegmentRow = { id: string; document_id: string; status: SegmentStatus; target: string }
type Profile = { id: string; name: string | null; email: string }
type ParallelRow = {
  id: string; document_id: string; segment_id: string
  provider: string; model: string; temperature: number | null; prompt?: string | null
  status: 'pending' | 'running' | 'success' | 'failed'
  created_by?: string | null; created_at?: string; updated_at?: string | null
}

type SegmentStatus = 'untranslated' | 'draft' | 'reviewed' | 'locked'

// 文档级状态：从该文档的所有 segments 派生
type DocStatus = 'not_started' | 'translating' | 'pending_review' | 'reviewing' | 'reviewed' | 'locked'
const docStatusMeta: Record<DocStatus, { label: string; cls: string }> = {
  not_started:    { label: '未开始',  cls: 'bg-canvas text-ink-600 border-line' },
  translating:    { label: '翻译中',  cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  pending_review: { label: '待审校',  cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  reviewing:      { label: '审校中',  cls: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  reviewed:       { label: '已审校',  cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  locked:         { label: '已锁定',  cls: 'bg-ink-900 text-white border-ink-900' },
}

function deriveDocStatus(segs: SegmentRow[]): DocStatus {
  if (segs.length === 0) return 'not_started'
  const total = segs.length
  const untrans  = segs.filter(s => s.status === 'untranslated').length
  const draft    = segs.filter(s => s.status === 'draft').length
  const reviewed = segs.filter(s => s.status === 'reviewed').length
  const locked   = segs.filter(s => s.status === 'locked').length
  if (locked === total) return 'locked'
  if (reviewed + locked === total) return 'reviewed'
  if (reviewed > 0) return 'reviewing'
  if (untrans === 0) return 'pending_review'   // 全部翻译完但都没审过
  if (draft > 0 || reviewed > 0 || locked > 0) return 'translating'
  return 'not_started'
}

type Tab = 'collab' | 'experiment'
type FilterKey = 'all' | DocStatus | 'mine'
type SortKey = 'updated_desc' | 'created_desc' | 'index_asc' | 'status' | 'owner_asc'

const langNames: Record<string, string> = {
  en: '英语', zh: '中文', ja: '日语', ko: '韩语',
  fr: '法语', de: '德语', es: '西班牙语', ru: '俄语'
}

// 粗略判断 CJK / Latin
function detectScript(text: string): 'cjk' | 'latin' | 'unknown' {
  const sample = text.slice(0, 600)
  let cjk = 0, latin = 0
  for (const ch of sample) {
    const code = ch.codePointAt(0) ?? 0
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0xac00 && code <= 0xd7af)
    ) cjk++
    else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) latin++
  }
  if (cjk + latin < 8) return 'unknown'
  return cjk > latin ? 'cjk' : 'latin'
}
const langScript = (lang: string): 'cjk' | 'latin' => (['zh','ja','ko'].includes(lang) ? 'cjk' : 'latin')

export default function ProjectPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [userId, setUserId] = useState<string | null>(null)
  const [, setMyRole] = useState<Role | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [segments, setSegments] = useState<SegmentRow[]>([])
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [parallel, setParallel] = useState<ParallelRow[]>([])

  // ---- 新建文档 modal ----
  const [showModal, setShowModal] = useState(false)
  const [title, setTitle] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [targetText, setTargetText] = useState('')
  const [sourceLang, setSourceLang] = useState('en')
  const [targetLang, setTargetLang] = useState('zh')
  const [loading, setLoading] = useState(false)
  const [importHint, setImportHint] = useState('')

  // ---- 聊天 ----
  const [chatOpen, setChatOpen] = useState(false)
  const [unread, setUnread] = useState(0)

  // ---- 编辑 / 删除 ----
  const [editingDoc, setEditingDoc] = useState<Document | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editSrc, setEditSrc] = useState('en')
  const [editTgt, setEditTgt] = useState('zh')
  const [editSaving, setEditSaving] = useState(false)
  const [deletingDoc, setDeletingDoc] = useState<Document | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [menuOpenForDoc, setMenuOpenForDoc] = useState<string | null>(null)

  // ---- Tab / 筛选 / 排序 ----
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'collab'
    try {
      const t = localStorage.getItem('proj-tab') as Tab | null
      return t === 'collab' || t === 'experiment' ? t : 'collab'
    } catch { return 'collab' }
  })
  const [filter, setFilter] = useState<FilterKey>('all')
  const [sort, setSort] = useState<SortKey>(() => {
    if (typeof window === 'undefined') return 'updated_desc'
    try {
      return (localStorage.getItem('doc-sort') as SortKey | null) || 'updated_desc'
    } catch { return 'updated_desc' }
  })
  useEffect(() => { try { localStorage.setItem('proj-tab', tab) } catch {} }, [tab])
  useEffect(() => { try { localStorage.setItem('doc-sort', sort) } catch {} }, [sort])

  const loadAll = useCallback(async () => {
    const [{ data: proj }, { data: docs }] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('documents').select('id, title, source_language, target_language, created_at, updated_at, created_by').eq('project_id', projectId),
    ])
    if (proj) setProject(proj as Project)
    const docsList = (docs ?? []) as Document[]
    setDocuments(docsList)

    if (docsList.length === 0) {
      setSegments([]); setParallel([]); setProfiles({})
      return
    }
    const docIds = docsList.map(d => d.id)
    const creatorIds = Array.from(new Set(docsList.map(d => d.created_by).filter(Boolean) as string[]))

    const [segRes, ptRes, profRes] = await Promise.all([
      supabase.from('segments').select('id, document_id, status, target').in('document_id', docIds),
      supabase.from('parallel_translations').select('id, document_id, segment_id, provider, model, temperature, prompt, status, created_by, created_at, updated_at').in('document_id', docIds).order('updated_at', { ascending: false }).limit(60),
      creatorIds.length > 0
        ? supabase.from('profiles').select('id, name, email').in('id', creatorIds)
        : Promise.resolve({ data: [] }),
    ])
    setSegments((segRes.data ?? []) as SegmentRow[])
    setParallel((ptRes.data ?? []) as ParallelRow[])
    const profMap: Record<string, Profile> = {}
    for (const p of (profRes.data ?? []) as Profile[]) profMap[p.id] = p
    setProfiles(profMap)
  }, [projectId])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      setUserId(user.id)
    })
    const timer = window.setTimeout(() => { void loadAll() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadAll, router])

  // ---- 文档维度聚合 ----
  type DocInfo = {
    doc: Document
    segs: SegmentRow[]
    total: number
    translated: number
    reviewed: number
    locked: number
    status: DocStatus
    ownerName: string
    ownerId: string | null
  }

  const docInfos: DocInfo[] = useMemo(() => {
    return documents.map(d => {
      const segs = segments.filter(s => s.document_id === d.id)
      const total = segs.length
      const translated = segs.filter(s => s.status !== 'untranslated').length
      const reviewed   = segs.filter(s => s.status === 'reviewed' || s.status === 'locked').length
      const locked     = segs.filter(s => s.status === 'locked').length
      const status     = deriveDocStatus(segs)
      const owner = d.created_by ? profiles[d.created_by] : null
      const ownerName = owner?.name || owner?.email?.split('@')[0] || '—'
      return { doc: d, segs, total, translated, reviewed, locked, status, ownerName, ownerId: d.created_by ?? null }
    })
  }, [documents, segments, profiles])

  // ---- 筛选 + 排序 ----
  const visibleDocs: DocInfo[] = useMemo(() => {
    let list = [...docInfos]
    if (filter === 'mine') {
      list = list.filter(d => d.ownerId === userId)
    } else if (filter !== 'all') {
      list = list.filter(d => d.status === filter)
    }
    const cmpStr = (a: string | null | undefined, b: string | null | undefined) => {
      const av = a ?? '', bv = b ?? ''
      return av < bv ? -1 : av > bv ? 1 : 0
    }
    switch (sort) {
      case 'updated_desc': list.sort((a, b) => cmpStr(b.doc.updated_at ?? b.doc.created_at, a.doc.updated_at ?? a.doc.created_at)); break
      case 'created_desc': list.sort((a, b) => cmpStr(b.doc.created_at, a.doc.created_at)); break
      case 'index_asc':    list.sort((a, b) => cmpStr(a.doc.created_at, b.doc.created_at)); break
      case 'status':       list.sort((a, b) => a.status.localeCompare(b.status)); break
      case 'owner_asc':    list.sort((a, b) => a.ownerName.localeCompare(b.ownerName, 'zh')); break
    }
    return list
  }, [docInfos, filter, sort, userId])

  // ---- 项目整体进度 ----
  const projectProgress = useMemo(() => {
    const total = docInfos.reduce((a, d) => a + d.total, 0)
    const translated = docInfos.reduce((a, d) => a + d.translated, 0)
    const reviewed = docInfos.reduce((a, d) => a + d.reviewed, 0)
    const locked = docInfos.reduce((a, d) => a + d.locked, 0)
    return { total, translated, reviewed, locked }
  }, [docInfos])

  // ---- AI 实验：按文档分组 ----
  type ExpRow = {
    docId: string; docTitle: string
    modelCount: number; promptCount: number; tempRange: string
    status: 'draft' | 'generating' | 'completed' | 'pending_annotation' | 'exported'
    ownerName: string; createdAt: string
    runRefId: string | null  // 用于查看实验，跳到 parallel 页
  }
  const experiments: ExpRow[] = useMemo(() => {
    const groups = new Map<string, ParallelRow[]>()
    for (const r of parallel) {
      const list = groups.get(r.document_id) ?? []
      list.push(r); groups.set(r.document_id, list)
    }
    const arr: ExpRow[] = []
    for (const [docId, rows] of groups) {
      const doc = documents.find(d => d.id === docId)
      if (!doc) continue
      const models = new Set(rows.map(r => `${r.provider}/${r.model}`))
      const prompts = new Set(rows.map(r => (r.prompt ?? '').trim()).filter(Boolean))
      const temps = rows.map(r => Number(r.temperature ?? 0))
      const tMin = Math.min(...temps), tMax = Math.max(...temps)
      const sc = rows.reduce<Record<string, number>>((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a }, {})
      let status: ExpRow['status']
      if (sc.pending || sc.running) status = 'generating'
      else if (sc.failed) status = 'pending_annotation'
      else {
        // 判断是否所有 success 都已被采用：检查 segment.target 是否为空
        const segIds = rows.map(r => r.segment_id)
        const segByDoc = segments.filter(s => segIds.includes(s.id))
        const anyEmpty = segByDoc.some(s => !s.target.trim())
        status = anyEmpty ? 'pending_annotation' : 'completed'
      }
      const owner = rows[0].created_by ? profiles[rows[0].created_by] : null
      const ownerName = owner?.name || owner?.email?.split('@')[0] || '—'
      arr.push({
        docId, docTitle: doc.title,
        modelCount: models.size,
        promptCount: Math.max(1, prompts.size),
        tempRange: tMin === tMax ? `T=${tMin.toFixed(1)}` : `${tMin.toFixed(1)}–${tMax.toFixed(1)}`,
        status,
        ownerName,
        createdAt: rows.map(r => r.created_at ?? '').filter(Boolean).sort()[0] ?? '',
        runRefId: rows[0].id,
      })
    }
    arr.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
    return arr
  }, [parallel, documents, profiles, segments])

  async function createDocument(e: React.FormEvent) {
    e.preventDefault()
    let src = sourceText, tgt = targetText
    if (tgt.trim()) {
      const srcScript = detectScript(src), tgtScript = detectScript(tgt)
      const expSrc = langScript(sourceLang), expTgt = langScript(targetLang)
      if (srcScript !== 'unknown' && tgtScript !== 'unknown' && srcScript === expTgt && tgtScript === expSrc) {
        if (confirm('检测到原文与译文位置对调了，是否自动互换？')) {
          [src, tgt] = [tgt, src]
          setSourceText(src); setTargetText(tgt)
        }
      }
    }
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('documents')
      .insert({ title, source_text: src, project_id: projectId, source_language: sourceLang, target_language: targetLang, created_by: user?.id })
      .select().single()
    if (error || !data) { setLoading(false); alert('创建失败：' + (error?.message ?? '未知错误')); return }
    if (tgt.trim()) {
      const srcSegs = splitSentences(src, sourceLang)
      const tgtSegs = splitSentences(tgt, targetLang)
      const N = Math.max(srcSegs.length, tgtSegs.length)
      if (srcSegs.length !== tgtSegs.length) {
        const proceed = confirm(`原文切出 ${srcSegs.length} 句，译文切出 ${tgtSegs.length} 句。\n将按顺序对齐前 ${Math.min(srcSegs.length, tgtSegs.length)} 句，多出的部分留空。\n\n继续？`)
        if (!proceed) { await supabase.from('documents').delete().eq('id', data.id); setLoading(false); return }
      }
      const rows = Array.from({ length: N }, (_, i) => ({
        document_id: data.id,
        position: i,
        source: srcSegs[i]?.source ?? '',
        target: tgtSegs[i]?.source ?? '',
        status: (tgtSegs[i]?.source?.trim() ? 'draft' : 'untranslated'),
      }))
      for (const r of rows) if (!r.source.trim() && r.target.trim()) { r.source = '[待补充]' }
      await supabase.from('segments').insert(rows)
    }
    setLoading(false)
    router.push(`/documents/${data.id}`)
  }

  function reconcileImport(which: 'source' | 'target') {
    const text = which === 'source' ? sourceText : targetText
    if (!text.trim()) return
    const script = detectScript(text)
    if (script === 'unknown') return
    const expected = which === 'source' ? langScript(sourceLang) : langScript(targetLang)
    if (script === expected) return
    const otherEmpty = which === 'source' ? !targetText.trim() : !sourceText.trim()
    const otherExpected = which === 'source' ? langScript(targetLang) : langScript(sourceLang)
    if (otherEmpty && script === otherExpected) {
      if (which === 'source') { setTargetText(text); setSourceText('') }
      else { setSourceText(text); setTargetText('') }
      setImportHint('已自动识别并归位到正确位置')
      setTimeout(() => setImportHint(''), 2500)
    }
  }

  function openEdit(doc: Document) {
    setEditingDoc(doc); setEditTitle(doc.title); setEditSrc(doc.source_language); setEditTgt(doc.target_language)
    setMenuOpenForDoc(null)
  }
  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingDoc) return
    if (editSrc === editTgt) { alert('原文语言与目标语言不能相同'); return }
    setEditSaving(true)
    const { error } = await supabase.from('documents').update({ title: editTitle, source_language: editSrc, target_language: editTgt }).eq('id', editingDoc.id)
    setEditSaving(false)
    if (error) { alert('保存失败：' + error.message); return }
    setEditingDoc(null); await loadAll()
  }
  async function confirmDelete() {
    if (!deletingDoc) return
    setDeleteBusy(true)
    const { error } = await supabase.from('documents').delete().eq('id', deletingDoc.id)
    setDeleteBusy(false)
    if (error) { alert('删除失败：' + error.message); return }
    setDeletingDoc(null); await loadAll()
  }

  const langPair = (() => {
    const d = documents[0]
    if (!d) return null
    return `${langNames[d.source_language] ?? d.source_language} → ${langNames[d.target_language] ?? d.target_language}`
  })()

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="bg-white rounded-2xl border border-line min-h-[calc(100vh-40px)]">
        <MainContent size="wide">

          {/* PageHeader：标题 / 描述 + 工具区按钮 */}
          <PageHeader
            backHref="/dashboard"
            backLabel="返回项目列表"
            eyebrow="Project"
            title={project?.name || '加载中...'}
            description={
              <span>
                {project?.description || '暂无描述'}
                {langPair && <span className="ml-3 text-[11px] font-mono text-ink-600 bg-canvas border border-line rounded-md" style={{ paddingLeft: 8, paddingRight: 8, paddingTop: 3, paddingBottom: 3 }}>{langPair}</span>}
              </span>
            }
            actions={
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost"
                  onClick={() => router.push(`/projects/${projectId}/glossary`)}
                  leftIcon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  }>
                  术语库
                </Button>
                <ChatToggleButton unread={unread} active={chatOpen} onClick={() => setChatOpen(true)} />
                <Button size="sm" variant="brand" onClick={() => setShowModal(true)} leftIcon={<span className="text-base leading-none">+</span>}>
                  新建文档
                </Button>
              </div>
            }
          />

          {/* 项目整体进度小条 */}
          {projectProgress.total > 0 && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs" style={{ marginTop: 8, marginBottom: 32 }}>
              <span className="text-ink-500">整体进度</span>
              <ProgressInline label="翻译" value={projectProgress.translated} total={projectProgress.total} color="bg-amber-400" />
              <ProgressInline label="审校" value={projectProgress.reviewed}   total={projectProgress.total} color="bg-blue-500" />
              <ProgressInline label="锁定" value={projectProgress.locked}     total={projectProgress.total} color="bg-emerald-500" />
            </div>
          )}

          {/* Tab 切换 */}
          <div className="border-b border-line" style={{ marginBottom: 40 }}>
            <div className="flex gap-1">
              <TabButton active={tab === 'collab'} onClick={() => setTab('collab')}>
                翻译协作 <span className="text-[11px] font-mono text-ink-400 ml-1.5">{documents.length}</span>
              </TabButton>
              <TabButton active={tab === 'experiment'} onClick={() => setTab('experiment')}>
                AI 翻译实验 <span className="text-[11px] font-mono text-ink-400 ml-1.5">{experiments.length}</span>
              </TabButton>
            </div>
          </div>

          {/* 主体两栏：左 1fr + 右 320px 固定栏（在 xl 以上才并排，避免挤压表格） */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-8 items-start">

            <section className="min-w-0">
              {tab === 'collab' ? (
                <CollaborationTab
                  docInfos={docInfos}
                  visibleDocs={visibleDocs}
                  filter={filter} setFilter={setFilter}
                  sort={sort} setSort={setSort}
                  documents={documents}
                  onOpenDoc={(id) => router.push(`/documents/${id}`)}
                  onOpenExport={(id) => router.push(`/documents/${id}`)}
                  onEdit={openEdit}
                  onDelete={(d) => { setDeletingDoc(d); setMenuOpenForDoc(null) }}
                  menuOpenForDoc={menuOpenForDoc}
                  setMenuOpenForDoc={setMenuOpenForDoc}
                  onCreate={() => setShowModal(true)}
                />
              ) : (
                <ExperimentTab
                  experiments={experiments}
                  onView={(docId) => router.push(`/documents/${docId}/parallel`)}
                  onPickDoc={() => setTab('collab')}
                />
              )}
            </section>

            <aside className="xl:sticky xl:top-0">
              <MembersPanel projectId={projectId} currentUserId={userId} onRoleChanged={setMyRole} />
            </aside>
          </div>
        </MainContent>
        </div>
      </main>

      <ChatPanel projectId={projectId} currentUserId={userId} open={chatOpen} onClose={() => setChatOpen(false)} onUnreadChange={setUnread} />

      {/* 新建文档 modal */}
      {showModal && (
        <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-[var(--shadow-modal)] max-h-[90vh] overflow-y-auto" style={{ padding: '48px' }}>
            <h3 className="font-serif text-2xl text-ink-900 mb-2 tracking-tight">新建翻译文档</h3>
            <p className="text-ink-600 text-sm mb-7">粘贴原文；如已有译文也可一同导入，系统会按句对齐。</p>
            <form onSubmit={createDocument} className="space-y-5">
              <Input label="文档标题" value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：第一章" required />
              <div className="grid grid-cols-2 gap-3">
                <Select label="原文语言" value={sourceLang} onChange={e => setSourceLang(e.target.value)}>
                  {Object.entries(langNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
                <Select label="目标语言" value={targetLang} onChange={e => setTargetLang(e.target.value)}>
                  {Object.entries(langNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </div>
              <Textarea
                label={`原文 · ${langNames[sourceLang]}`}
                value={sourceText}
                onChange={e => setSourceText(e.target.value)}
                onBlur={() => reconcileImport('source')}
                placeholder={`在这里粘贴 ${langNames[sourceLang]} 原文...`}
                rows={6}
                required
              />
              <Textarea
                label={`译文 · ${langNames[targetLang]}（可选）`}
                value={targetText}
                onChange={e => setTargetText(e.target.value)}
                onBlur={() => reconcileImport('target')}
                placeholder={`如已有 ${langNames[targetLang]} 译文，粘贴这里。`}
                rows={6}
              />
              {importHint && (
                <p className="text-xs text-brand bg-brand-50 border border-brand/20 rounded-lg px-3 py-2">✓ {importHint}</p>
              )}
              <button type="button"
                onClick={() => { const a = sourceText; setSourceText(targetText); setTargetText(a) }}
                className="text-xs text-brand hover:text-brand-600 font-medium inline-flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                互换原文与译文
              </button>
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" fullWidth type="button" onClick={() => { setShowModal(false); setTargetText(''); setImportHint('') }}>取消</Button>
                <Button variant="primary" fullWidth type="submit" loading={loading}>
                  {loading ? '创建中...' : '创建并开始翻译'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 编辑文档 modal */}
      {editingDoc && (
        <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-[var(--shadow-modal)]" style={{ padding: '48px' }}>
            <h3 className="font-serif text-2xl text-ink-900 mb-2 tracking-tight">编辑文档</h3>
            <p className="text-ink-600 text-sm mb-7">可以修改标题或重新选择语言对（不影响已翻译的内容）。</p>
            <form onSubmit={saveEdit} className="space-y-5">
              <Input label="文档标题" value={editTitle} onChange={e => setEditTitle(e.target.value)} required />
              <div className="grid grid-cols-2 gap-3">
                <Select label="原文语言" value={editSrc} onChange={e => setEditSrc(e.target.value)}>
                  {Object.entries(langNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
                <Select label="目标语言" value={editTgt} onChange={e => setEditTgt(e.target.value)}>
                  {Object.entries(langNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </div>
              <button type="button"
                onClick={() => { const a = editSrc; setEditSrc(editTgt); setEditTgt(a) }}
                className="text-xs text-brand hover:text-brand-600 font-medium inline-flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                互换语言方向
              </button>
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" fullWidth type="button" onClick={() => setEditingDoc(null)}>取消</Button>
                <Button variant="primary" fullWidth type="submit" loading={editSaving}>
                  {editSaving ? '保存中...' : '保存修改'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 删除确认 modal */}
      {deletingDoc && (
        <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-[var(--shadow-modal)]" style={{ padding: '48px' }}>
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mb-5">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="font-serif text-2xl text-ink-900 mb-2 tracking-tight">删除文档？</h3>
            <p className="text-ink-600 text-sm mb-7 leading-relaxed">
              文档 <span className="text-ink-900 font-medium">「{deletingDoc.title}」</span> 及其所有翻译内容、术语对照都将被永久删除，无法恢复。
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" fullWidth type="button" onClick={() => setDeletingDoc(null)}>取消</Button>
              <Button variant="danger" fullWidth type="button" loading={deleteBusy} onClick={confirmDelete}>
                {deleteBusy ? '删除中...' : '确认删除'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ====== 小组件 ======

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 12, paddingBottom: 12 }}
      className={cn(
        'text-sm font-medium border-b-2 -mb-px transition-colors',
        active
          ? 'border-brand text-ink-900'
          : 'border-transparent text-ink-500 hover:text-ink-900'
      )}>
      {children}
    </button>
  )
}

function ProgressInline({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-ink-600">{label}</span>
      <div className="w-20 h-1.5 bg-canvas rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-ink-700">{value}/{total} · {pct}%</span>
    </div>
  )
}

// ----- 翻译协作 Tab -----
type CollabProps = {
  docInfos: Array<{ doc: Document; status: DocStatus; ownerId: string | null; ownerName: string; total: number; translated: number; reviewed: number; locked: number }>
  visibleDocs: CollabProps['docInfos']
  filter: FilterKey
  setFilter: (k: FilterKey) => void
  sort: SortKey
  setSort: (k: SortKey) => void
  documents: Document[]
  onOpenDoc: (id: string) => void
  onOpenExport: (id: string) => void
  onEdit: (d: Document) => void
  onDelete: (d: Document) => void
  menuOpenForDoc: string | null
  setMenuOpenForDoc: (id: string | null) => void
  onCreate: () => void
}
function CollaborationTab(p: CollabProps) {
  const filterChips: Array<[FilterKey, string]> = [
    ['all', '全部'],
    ['not_started', '未开始'],
    ['translating', '翻译中'],
    ['pending_review', '待审校'],
    ['reviewing', '审校中'],
    ['reviewed', '已审校'],
    ['locked', '已锁定'],
    ['mine', '我负责的'],
  ]
  // 每个 filter 项的数量
  const counts: Partial<Record<FilterKey, number>> = {}
  counts.all = p.docInfos.length
  counts.mine = p.docInfos.filter(d => d.ownerId && d.ownerId === (typeof window !== 'undefined' ? null : null) ? false : false).length  // 不在这里算 mine
  // (mine 需要外部 userId — 直接在父组件已经做了筛选，但筛选 chip 用 docInfos 数即可不显示精确数；保持简单)
  for (const k of ['not_started','translating','pending_review','reviewing','reviewed','locked'] as DocStatus[]) {
    counts[k] = p.docInfos.filter(d => d.status === k).length
  }

  return (
    <>
      {/* 筛选 + 排序 */}
      <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 24 }}>
        {filterChips.map(([k, label]) => {
          const active = p.filter === k
          const count = counts[k]
          return (
            <button key={k}
              onClick={() => p.setFilter(k)}
              style={{ paddingLeft: 12, paddingRight: 12, paddingTop: 6, paddingBottom: 6 }}
              className={cn(
                'text-xs font-medium rounded-full border transition-colors',
                active ? 'bg-ink-900 text-white border-ink-900' : 'bg-white text-ink-700 border-line hover:border-ink-300'
              )}>
              {label}
              {typeof count === 'number' && count > 0 && (
                <span className={cn('ml-1.5 text-[10px]', active ? 'opacity-70' : 'text-ink-400')}>{count}</span>
              )}
            </button>
          )
        })}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-ink-500">排序</span>
          <select value={p.sort} onChange={e => p.setSort(e.target.value as SortKey)}
            style={{ paddingLeft: 10, paddingRight: 10, paddingTop: 6, paddingBottom: 6 }}
            className="text-sm border-2 border-line rounded-lg text-ink-900 bg-white focus:outline-none focus:border-brand font-medium">
            <option value="updated_desc">最近更新</option>
            <option value="created_desc">创建时间</option>
            <option value="index_asc">文档编号</option>
            <option value="status">状态</option>
            <option value="owner_asc">负责人</option>
          </select>
        </div>
      </div>

      {p.documents.length === 0 ? (
        <Card padding="lg" className="text-center py-16">
          <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <svg className="w-6 h-6 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <h3 className="font-serif text-xl text-ink-900 mb-2">还没有文档</h3>
          <p className="text-ink-600 text-sm mb-6">点击右上角「新建文档」上传原文开始翻译</p>
          <Button variant="brand" onClick={p.onCreate}>新建文档</Button>
        </Card>
      ) : p.visibleDocs.length === 0 ? (
        <Card padding="md" variant="surface">
          <p className="text-center text-sm text-ink-600 py-6">没有符合当前筛选条件的文档</p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-x-auto">
          {/* 表头 */}
          <div className="grid grid-cols-[36px_minmax(220px,2fr)_108px_minmax(96px,1fr)_84px_140px_60px_84px] gap-3 bg-canvas/60 border-b border-line text-[11px] uppercase tracking-wider text-ink-500 font-medium min-w-[920px]"
            style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 12, paddingBottom: 12 }}>
            <div className="text-center">#</div>
            <div>文档</div>
            <div>方向</div>
            <div>负责人</div>
            <div className="text-center">状态</div>
            <div>进度（翻译 / 审校 / 锁定）</div>
            <div className="text-right">更新</div>
            <div className="text-center">操作</div>
          </div>

          {p.visibleDocs.map((info, i) => {
            const d = info.doc
            const meta = docStatusMeta[info.status]
            return (
              <div key={d.id} className="grid grid-cols-[36px_minmax(220px,2fr)_108px_minmax(96px,1fr)_84px_140px_60px_84px] gap-3 items-start border-t border-line hover:bg-canvas/30 transition-colors min-w-[920px]"
                style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 16, paddingBottom: 16 }}>
                <div className="text-[11px] font-mono text-ink-400 text-center">{String(i + 1).padStart(2, '0')}</div>

                {/* 名称（可点击进入） */}
                <button
                  type="button"
                  onClick={() => p.onOpenDoc(d.id)}
                  className="text-left transition-colors hover:opacity-80"
                  style={{ display: 'block', width: '100%', minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: 16,
                      lineHeight: 1.35,
                      fontWeight: 500,
                      color: d.title?.trim() ? '#1F1E1D' : '#A8A29E',
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                      marginBottom: 4,
                    }}
                    title={d.title || '（未命名）'}>
                    {d.title?.trim() || '（未命名）'}
                  </div>
                  <div style={{ fontSize: 11, color: '#7A7872', fontFamily: 'var(--font-sans)' }}>
                    {info.total > 0 ? `${info.total} 句段` : '尚未分句'}
                  </div>
                </button>

                {/* 语言方向 */}
                <div className="text-xs text-ink-700">
                  <span className="font-mono">{langNames[d.source_language] ?? d.source_language}</span>
                  <span className="text-ink-400 mx-1">→</span>
                  <span className="font-mono text-brand font-medium">{langNames[d.target_language] ?? d.target_language}</span>
                </div>

                {/* 负责人 */}
                <div className="text-xs text-ink-700 truncate">{info.ownerName}</div>

                {/* 状态 */}
                <div className="text-center">
                  <span className={cn('text-[10px] font-medium rounded-full uppercase tracking-wider border whitespace-nowrap', meta.cls)}
                    style={{ paddingLeft: 8, paddingRight: 8, paddingTop: 3, paddingBottom: 3 }}>
                    {meta.label}
                  </span>
                </div>

                {/* 三档进度迷你条 */}
                <div className="space-y-1">
                  <MiniBar value={info.translated} total={info.total} color="bg-amber-400" />
                  <MiniBar value={info.reviewed}   total={info.total} color="bg-blue-500" />
                  <MiniBar value={info.locked}     total={info.total} color="bg-emerald-500" />
                </div>

                {/* 最近更新 */}
                <div className="text-right text-[11px] text-ink-600 font-mono">
                  {new Date(d.updated_at ?? d.created_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                </div>

                {/* 操作：进入 + 更多（编辑/导出/删除 都收进菜单） */}
                <div className="flex items-center justify-end relative" style={{ gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => p.onOpenDoc(d.id)}
                    title="进入翻译工作台"
                    className="inline-flex items-center justify-center rounded-lg bg-brand text-white hover:bg-brand-600 active:bg-brand-700 transition-colors flex-shrink-0"
                    style={{ width: 32, height: 32 }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => p.setMenuOpenForDoc(p.menuOpenForDoc === d.id ? null : d.id)}
                    title="更多"
                    className="rounded-lg text-ink-500 hover:bg-canvas transition-colors flex-shrink-0 inline-flex items-center justify-center"
                    style={{ width: 32, height: 32 }}>
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
                    </svg>
                  </button>
                  {p.menuOpenForDoc === d.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => p.setMenuOpenForDoc(null)} />
                      <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-white border border-line rounded-xl shadow-[var(--shadow-card)] overflow-hidden text-sm">
                        <MenuItem onClick={() => { p.onEdit(d); p.setMenuOpenForDoc(null) }}>编辑标题 / 语言</MenuItem>
                        <MenuItem onClick={() => { p.onOpenExport(d.id); p.setMenuOpenForDoc(null) }}>导出译文</MenuItem>
                        <MenuItem onClick={() => p.onDelete(d)} danger>删除文档</MenuItem>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </Card>
      )}
    </>
  )
}

function MiniBar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-canvas rounded-full overflow-hidden">
        <div className={cn('h-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-ink-500 font-mono w-10 text-right">{pct}%</span>
    </div>
  )
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 10, paddingBottom: 10 }}
      className={cn(
        'block w-full text-left transition-colors',
        danger ? 'text-red-600 hover:bg-red-50' : 'text-ink-700 hover:bg-canvas',
      )}>
      {children}
    </button>
  )
}

// ----- AI 翻译实验 Tab -----
function ExperimentTab({ experiments, onView, onPickDoc }: {
  experiments: Array<{ docId: string; docTitle: string; modelCount: number; promptCount: number; tempRange: string; status: 'draft' | 'generating' | 'completed' | 'pending_annotation' | 'exported'; ownerName: string; createdAt: string }>
  onView: (docId: string) => void
  onPickDoc: () => void
}) {
  if (experiments.length === 0) {
    return (
      <Card padding="lg" className="text-center py-16">
        <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <svg className="w-6 h-6 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        </div>
        <h3 className="font-serif text-xl text-ink-900 mb-3">还没有 AI 翻译实验</h3>
        <p className="text-ink-600 text-sm max-w-md mx-auto mb-6 leading-relaxed">
          你可以从某个文档中选择句段，创建多模型翻译实验，用于译文对比、人工标注和研究数据导出。
        </p>
        <Button variant="brand" onClick={onPickDoc}>选择文档开始实验</Button>
      </Card>
    )
  }

  const statusMeta: Record<string, { label: string; cls: string }> = {
    draft:               { label: '草稿',     cls: 'bg-canvas text-ink-600 border-line' },
    generating:          { label: '生成中',   cls: 'bg-amber-50 text-amber-800 border-amber-200' },
    completed:           { label: '已完成',   cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    pending_annotation:  { label: '待标注',   cls: 'bg-rose-50 text-rose-800 border-rose-200' },
    exported:            { label: '已导出',   cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  }

  return (
    <Card padding="none" className="overflow-x-auto">
      <div className="grid grid-cols-[minmax(220px,2fr)_72px_72px_112px_104px_112px_120px] gap-3 px-5 py-3 bg-canvas/60 border-b border-line text-[11px] uppercase tracking-wider text-ink-500 font-medium min-w-[900px]">
        <div>实验 · 关联文档</div>
        <div className="text-center">模型</div>
        <div className="text-center">Prompt</div>
        <div className="text-center">Temperature</div>
        <div className="text-center">状态</div>
        <div>创建者</div>
        <div className="text-right">操作</div>
      </div>
      {experiments.map((e, i) => (
        <div key={e.docId} className={cn('grid grid-cols-[minmax(220px,2fr)_72px_72px_112px_104px_112px_120px] gap-3 px-5 py-4 items-center min-w-[900px]', i > 0 && 'border-t border-line')}>
          <div className="min-w-0">
            <p className="font-serif text-[15px] text-ink-900 tracking-tight leading-tight break-words">{e.docTitle} · 多模型对比</p>
            <p className="text-[11px] text-ink-500 mt-1 font-mono">
              {e.createdAt ? new Date(e.createdAt).toLocaleDateString('zh-CN') : '—'}
            </p>
          </div>
          <div className="text-center text-sm text-ink-700 font-mono">{e.modelCount}</div>
          <div className="text-center text-sm text-ink-700 font-mono">{e.promptCount}</div>
          <div className="text-center text-sm text-ink-700 font-mono">{e.tempRange}</div>
          <div className="text-center">
            <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider border', statusMeta[e.status].cls)}>
              {statusMeta[e.status].label}
            </span>
          </div>
          <div className="text-xs text-ink-700 truncate">{e.ownerName}</div>
          <div className="flex items-center justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => onView(e.docId)}>查看结果</Button>
            <button type="button"
              onClick={() => onView(e.docId)}
              title="导出数据（即将上线）"
              className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-canvas transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </Card>
  )
}
