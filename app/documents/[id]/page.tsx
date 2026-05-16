'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { apiJSON } from '@/lib/apiFetch'
import { splitSentences, type Segment, type SegmentStatus } from '@/lib/sentenceSplit'
import { exportBilingualDoc, type ExportMode } from '@/lib/exportBilingual'
import { type Role, canManage, canReview } from '@/lib/permissions'
import ChatPanel from '@/components/ChatPanel'
import ChatToggleButton from '@/components/ChatToggleButton'
import Logo from '@/components/Logo'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

// ─── Types ────────────────────────────────────────────────────────────────────

type EditorMode = 'translate' | 'review'
type DisplayStatus = 'draft' | 'pending_review' | 'reviewing' | 'reviewed' | 'locked' | 'needs_revision'

type Doc = {
  id: string; title: string
  source_text: string; source_language: string; target_language: string
  project_id: string
}
type GlossaryTerm = { id: string; source_term: string; translated_term: string; definition: string }

// ─── Constants ────────────────────────────────────────────────────────────────

// 审校意见与译者备注用此分隔符共存于 notes 字段（不破坏旧数据：旧 notes 当作纯译者备注）
const COMMENT_SEP = '\n———审校意见———\n'
const REVIEW_BACK_MARKER = '【退回修改】'
const REVIEW_ISSUE_TYPES = ['意义问题', '风格问题', '文化问题', '术语问题', '自然度问题', '格式问题', '其他']

const LANG_NAMES: Record<string, string> = {
  en: '英语', zh: '中文', ja: '日语', ko: '韩语',
  fr: '法语', de: '德语', es: '西班牙语', ru: '俄语',
}

const STATUS_META: Record<DisplayStatus, { label: string; bg: string; color: string; border: string }> = {
  draft:          { label: '草稿',   bg: '#F3F2EE', color: '#7A7872', border: '#E0DDD3' },
  pending_review: { label: '待审校', bg: '#FFF7F4', color: '#C46340', border: '#FBD9C7' },
  reviewing:      { label: '审校中', bg: '#F5F0FF', color: '#7C5BD9', border: '#DDD0F5' },
  reviewed:       { label: '已审校', bg: '#EEF4FF', color: '#5470D6', border: '#C7D5F8' },
  locked:         { label: '已锁定', bg: '#1F1E1D', color: '#FFFFFF', border: '#1F1E1D' },
  needs_revision: { label: '需修改', bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseNotes(raw: string | undefined | null): { translator: string; reviewType: string; reviewText: string; sentBack: boolean } {
  const r = raw || ''
  const idx = r.indexOf(COMMENT_SEP)
  if (idx === -1) return { translator: r, reviewType: '', reviewText: '', sentBack: false }
  const translator = r.slice(0, idx)
  let after = r.slice(idx + COMMENT_SEP.length)
  let sentBack = false
  if (after.startsWith(REVIEW_BACK_MARKER + '\n')) { sentBack = true; after = after.slice(REVIEW_BACK_MARKER.length + 1) }
  else if (after.startsWith(REVIEW_BACK_MARKER)) { sentBack = true; after = after.slice(REVIEW_BACK_MARKER.length) }
  const tm = after.match(/^类型: (.+)\n?/)
  if (tm) return { translator, reviewType: tm[1].trim(), reviewText: after.slice(tm[0].length).trimStart(), sentBack }
  return { translator, reviewType: '', reviewText: after, sentBack }
}

function buildNotes(translator: string, reviewType: string, reviewText: string, sendBack: boolean): string {
  const t = (translator || '').trim()
  const hasReview = reviewType || reviewText.trim()
  if (!hasReview) return t
  const back = sendBack ? `${REVIEW_BACK_MARKER}\n` : ''
  const type = reviewType ? `类型: ${reviewType}\n` : ''
  return `${t}${COMMENT_SEP}${back}${type}${reviewText}`
}

function deriveDisplayStatus(seg: Segment, comments?: { type: string; text: string; dirty?: boolean } | null): DisplayStatus {
  if (seg.status === 'locked') return 'locked'
  if (seg.status === 'reviewed') return 'reviewed'
  const { sentBack, reviewType, reviewText } = parseNotes(seg.notes)
  if (sentBack) return 'needs_revision'
  // 审校中：本地有未保存的审校意见，或已保存了非退回的审校意见但未通过
  const localHasComment = comments && (comments.type || comments.text)
  const savedHasComment = !sentBack && (reviewType || reviewText)
  if (localHasComment || savedHasComment) return 'reviewing'
  if (!seg.target?.trim()) return 'draft'
  return 'pending_review'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DocumentPage() {
  const params = useParams()
  const router = useRouter()
  const documentId = params.id as string

  const [userId, setUserId] = useState<string | null>(null)
  const [myRole, setMyRole] = useState<Role | null>(null)
  const [doc, setDoc] = useState<Doc | null>(null)
  const [loading, setLoading] = useState(true)
  const [segments, setSegments] = useState<Segment[]>([])
  const [glossary, setGlossary] = useState<GlossaryTerm[]>([])
  const [showGlossary, setShowGlossary] = useState(false)

  const [editorMode, setEditorMode] = useState<EditorMode>('translate')

  // AI 初译缓存（本次会话内，由「重译/一键翻译」填充）
  const [aiDrafts, setAiDrafts] = useState<Record<string, string>>({})
  // 进入审校模式时的「译者译文」快照
  const [origTargets, setOrigTargets] = useState<Record<string, string>>({})
  // 审校意见本地态：{ type, text }
  const [reviewComments, setReviewComments] = useState<Record<string, { type: string; text: string }>>({})
  // 按行 hover 显示主要操作按钮
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const [model, setModel] = useState<'deepseek' | 'claude'>('deepseek')
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set())
  const [batchTranslating, setBatchTranslating] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 })
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [splitting, setSplitting] = useState(false)

  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [generatingGlossary, setGeneratingGlossary] = useState(false)

  const [chatOpen, setChatOpen] = useState(false)
  const [unread, setUnread] = useState(0)

  const segmentsRef = useRef<Segment[]>([])
  const editorModeRef = useRef<EditorMode>(editorMode)
  const sourceFocusRef = useRef<Record<string, string>>({})
  const notesFocusRef = useRef<Record<string, string>>({})

  useEffect(() => { segmentsRef.current = segments }, [segments])
  useEffect(() => { editorModeRef.current = editorMode }, [editorMode])

  // ─── Data ───────────────────────────────────────────────────────────────────

  const addMissingOrigTargets = useCallback((segs: Segment[]) => {
    if (segs.length === 0) return
    setOrigTargets(prev => {
      const snap = { ...prev }
      let changed = false
      segs.forEach(s => {
        if (!(s.id in snap)) {
          snap[s.id] = s.target
          changed = true
        }
      })
      return changed ? snap : prev
    })
  }, [])

  const loadGlossary = useCallback(async (projectId: string) => {
    const { data } = await supabase.from('glossary_terms').select('*')
      .eq('project_id', projectId).order('created_at', { ascending: false })
    if (data) setGlossary(data)
  }, [])

  const loadSegments = useCallback(async (documentId: string) => {
    const { data } = await supabase.from('segments').select('*')
      .eq('document_id', documentId).order('position', { ascending: true })
    const segs = (data || []) as Segment[]
    setSegments(segs)
    // 初始化「译者译文」快照（首次）
    const snap: Record<string, string> = {}
    segs.forEach(s => { snap[s.id] = s.target })
    setOrigTargets(snap)
    if (editorModeRef.current === 'review') addMissingOrigTargets(segs)
    // 把已有的审校意见同步到本地态，便于编辑
    const rc: Record<string, { type: string; text: string }> = {}
    segs.forEach(s => {
      const { reviewType, reviewText } = parseNotes(s.notes)
      if (reviewType || reviewText) rc[s.id] = { type: reviewType, text: reviewText }
    })
    setReviewComments(rc)
  }, [addMissingOrigTargets])

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    setUserId(user.id)
    const { data: docData } = await supabase.from('documents').select('*').eq('id', documentId).single()
    if (docData) {
      setDoc(docData)
      const { data: memberRow } = await supabase.from('project_members')
        .select('role').eq('project_id', docData.project_id).eq('user_id', user.id).maybeSingle()
      setMyRole((memberRow?.role as Role) || null)
      await loadSegments(docData.id)
      loadGlossary(docData.project_id)
    }
    setLoading(false)
  }, [documentId, loadGlossary, loadSegments, router])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadData])

  const switchEditorMode = (mode: EditorMode) => {
    if (mode === 'review') addMissingOrigTargets(segmentsRef.current)
    setEditorMode(mode)
  }

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const patchLocal = (id: string, partial: Partial<Segment>) =>
    setSegments(prev => prev.map(s => s.id === id ? { ...s, ...partial } : s))

  const markSaving = (id: string, ms = 800) => {
    setSavingIds(prev => new Set(prev).add(id))
    setTimeout(() => setSavingIds(prev => { const n = new Set(prev); n.delete(id); return n }), ms)
  }

  const handleSplit = async () => {
    if (!doc) return
    if (segments.length > 0 && !confirm('已存在分句结果，重新切分将删除所有现有译文，是否继续？')) return
    setSplitting(true)
    await supabase.from('segments').delete().eq('document_id', doc.id)
    const newInputs = splitSentences(doc.source_text, doc.source_language)
    if (newInputs.length > 0) {
      await supabase.from('segments').insert(newInputs.map(s => ({
        document_id: doc.id, position: s.position, source: s.source, target: '', status: 'untranslated' as SegmentStatus,
      })))
    }
    await loadSegments(doc.id)
    setSplitting(false)
  }

  const translateOne = async (seg: Segment) => {
    if (!doc) return ''
    const res = await apiJSON<{ translation: string }>('/api/translate', {
      method: 'POST',
      body: JSON.stringify({ text: seg.source, sourceLang: doc.source_language, targetLang: doc.target_language, model, documentId: doc.id }),
    })
    if (res.error) throw new Error(res.error)
    return res.data?.translation ?? ''
  }

  const patchSegment = async (segId: string, body: Partial<Pick<Segment, 'target' | 'source' | 'notes'>>) => {
    const { data, error } = await apiJSON<{ segment: Segment }>(`/api/segments/${segId}`, {
      method: 'PATCH', body: JSON.stringify(body),
    })
    return { segment: data?.segment, error }
  }

  // 单行重译：把结果存入 AI 初译缓存；若 target 还为空，则同时写入 target 作为初值
  const handleTranslateRow = async (seg: Segment) => {
    if (seg.status === 'locked') { alert('该句段已锁定，无法翻译'); return }
    setTranslatingIds(prev => new Set(prev).add(seg.id))
    try {
      const translation = await translateOne(seg)
      if (translation) setAiDrafts(prev => ({ ...prev, [seg.id]: translation }))
      if (!seg.target?.trim() && translation) {
        const r = await patchSegment(seg.id, { target: translation })
        if (r.segment) patchLocal(seg.id, r.segment)
      }
    } catch (e: unknown) {
      alert('翻译失败：' + (e instanceof Error ? e.message : '未知错误'))
    } finally {
      setTranslatingIds(prev => { const n = new Set(prev); n.delete(seg.id); return n })
    }
  }

  // 采用 AI 译文 → 写入 target
  const adoptAiDraft = async (seg: Segment) => {
    const ai = aiDrafts[seg.id]
    if (!ai) return
    patchLocal(seg.id, { target: ai })
    markSaving(seg.id)
    const r = await patchSegment(seg.id, { target: ai })
    if (r.segment) patchLocal(seg.id, r.segment)
    else if (r.error) alert('采用失败：' + r.error)
  }

  const runBatchTranslate = async (segs: Segment[]) => {
    setBatchTranslating(true)
    setBatchProgress({ done: 0, total: segs.length })
    let done = 0, cursor = 0
    const worker = async () => {
      while (cursor < segs.length) {
        const seg = segs[cursor++]; if (!seg) break
        setTranslatingIds(prev => new Set(prev).add(seg.id))
        try {
          const translation = await translateOne(seg)
          if (translation) setAiDrafts(prev => ({ ...prev, [seg.id]: translation }))
          // 空译文 → 直接写入 target；已有译文 → 只更新 AI 初译缓存
          if (!seg.target?.trim() && translation) {
            const r = await patchSegment(seg.id, { target: translation })
            if (r.segment) patchLocal(seg.id, r.segment)
          }
        } catch { /* 跳过失败 */ }
        finally {
          setTranslatingIds(prev => { const n = new Set(prev); n.delete(seg.id); return n })
          done++; setBatchProgress({ done, total: segs.length })
        }
      }
    }
    await Promise.all(Array.from({ length: 3 }, worker))
    setBatchTranslating(false)
  }

  const handleTranslateAll = () => {
    const empty = segmentsRef.current.filter(s => !s.target.trim() && s.status !== 'locked')
    if (empty.length === 0) { alert('所有句子都已翻译或被锁定'); return }
    void runBatchTranslate(empty)
  }

  const handleTranslateSelected = () => {
    const segs = segmentsRef.current.filter(s => selectedIds.has(s.id) && s.status !== 'locked')
    if (segs.length === 0) { alert('请先勾选要翻译的句段'); return }
    void runBatchTranslate(segs)
  }

  // ── Target edits (人工译文 / 审校译文 同一字段) ──
  const handleEditTarget = (id: string, value: string) => patchLocal(id, { target: value })

  const handleBlurTarget = async (seg: Segment) => {
    if (seg.status === 'locked' && !canManage(myRole)) return
    const current = segmentsRef.current.find(s => s.id === seg.id); if (!current) return
    markSaving(seg.id)
    const r = await patchSegment(seg.id, { target: current.target })
    if (r.segment) patchLocal(seg.id, r.segment)
    else if (r.error) alert('保存失败：' + r.error)
  }

  // ── Source edits ──
  const handleEditSource = (id: string, value: string) => patchLocal(id, { source: value })
  const handleBlurSource = async (seg: Segment) => {
    if (seg.status === 'locked' && !canManage(myRole)) return
    const current = segmentsRef.current.find(s => s.id === seg.id); if (!current) return
    const baseline = sourceFocusRef.current[seg.id] ?? current.source
    if (!current.source.trim()) {
      patchLocal(seg.id, { source: baseline }); alert('原文不能为空'); return
    }
    if (current.source === baseline) return
    markSaving(seg.id)
    const r = await patchSegment(seg.id, { source: current.source })
    if (r.segment) patchLocal(seg.id, r.segment)
    else if (r.error) alert('保存原文失败：' + r.error)
  }

  // ── Translator notes (备注) ──
  const handleEditTranslatorNotes = (id: string, value: string) => {
    setSegments(prev => prev.map(s => {
      if (s.id !== id) return s
      const parsed = parseNotes(s.notes)
      return { ...s, notes: buildNotes(value, parsed.reviewType, parsed.reviewText, parsed.sentBack) }
    }))
  }
  const handleBlurNotes = async (seg: Segment) => {
    const current = segmentsRef.current.find(s => s.id === seg.id); if (!current) return
    const baseline = notesFocusRef.current[seg.id] ?? (seg.notes || '')
    if ((current.notes || '') === baseline) return
    markSaving(seg.id)
    const r = await patchSegment(seg.id, { notes: current.notes || '' })
    if (r.segment) patchLocal(seg.id, r.segment)
    else if (r.error) alert('保存备注失败：' + r.error)
  }

  // ── Review actions ──
  const handleReview = async (seg: Segment, mark: boolean) => {
    const { data, error } = await apiJSON<{ segment: Segment }>(`/api/segments/${seg.id}/review`, { method: mark ? 'POST' : 'DELETE' })
    if (error) { alert(error); return null }
    if (data?.segment) patchLocal(seg.id, data.segment)
    return data?.segment ?? null
  }
  const handleLock = async (seg: Segment, lock: boolean) => {
    const { data, error } = await apiJSON<{ segment: Segment }>(`/api/segments/${seg.id}/lock`, { method: lock ? 'POST' : 'DELETE' })
    if (error) { alert(error); return }
    if (data?.segment) patchLocal(seg.id, data.segment)
  }

  // 保存审校意见（不改 status）
  const saveReviewComment = async (segId: string, sendBack: boolean) => {
    const seg = segmentsRef.current.find(s => s.id === segId); if (!seg) return
    const { translator } = parseNotes(seg.notes)
    const rc = reviewComments[segId] ?? { type: '', text: '' }
    const newNotes = buildNotes(translator, rc.type, rc.text, sendBack)
    markSaving(segId)
    const r = await patchSegment(segId, { notes: newNotes })
    if (r.segment) patchLocal(segId, r.segment)
  }

  // 「通过」：标记 reviewed；保留已写的审校意见（不带退回标记）
  const handleApprove = async (seg: Segment) => {
    if (!seg.target?.trim()) { alert('该句段尚无译文，无法通过'); return }
    await saveReviewComment(seg.id, false)
    await handleReview(seg, true)
  }
  // 「退回修改」：写入退回标记，不标 reviewed
  const handleSendBack = async (seg: Segment) => {
    const rc = reviewComments[seg.id]
    if (!rc || (!rc.type && !rc.text.trim())) { alert('请先填写审校意见再退回'); return }
    if (seg.status === 'reviewed') await handleReview(seg, false)
    await saveReviewComment(seg.id, true)
  }
  // 「修改并通过」：保存当前 target（审校译文）+ 审校意见 + reviewed
  const handleEditAndApprove = async (seg: Segment) => {
    const current = segmentsRef.current.find(s => s.id === seg.id); if (!current) return
    if (!current.target?.trim()) { alert('审校译文不能为空'); return }
    await patchSegment(seg.id, { target: current.target })
    await saveReviewComment(seg.id, false)
    await handleReview({ ...seg, target: current.target }, true)
  }

  const handleApproveAll = async () => {
    const pending = segments.filter(s => s.target?.trim() && s.status !== 'reviewed' && s.status !== 'locked' && !parseNotes(s.notes).sentBack)
    if (pending.length === 0) { alert('没有可一键通过的句段'); return }
    if (!confirm(`将 ${pending.length} 个句段标记为「已审校」？`)) return
    for (const s of pending) await handleReview(s, true)
  }

  const handleSubmitForReview = async () => {
    // 译者：把所有有译文但还未审校/锁定的句段，本地状态保持为 draft 即可（draft + 有 target = 待审校）
    // 这里只做一个提示反馈，让译者知道审校者可以在审校模式看到。
    const pending = segments.filter(s => s.target?.trim() && s.status !== 'reviewed' && s.status !== 'locked')
    alert(pending.length === 0 ? '当前没有待审校的句段' : `已就绪：${pending.length} 个句段处于「待审校」，审校者可在审校模式处理。`)
  }

  // ── Batch select ──
  const toggleSelectMode = () => setSelectMode(prev => { if (prev) setSelectedIds(new Set()); return !prev })
  const toggleSelectOne = (id: string) => setSelectedIds(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const selectAllVisible = () => setSelectedIds(new Set(
    segmentsRef.current.filter(s => s.status !== 'locked' || canManage(myRole)).map(s => s.id)
  ))
  const bulkDelete = async () => {
    const ids = Array.from(selectedIds); if (ids.length === 0) return
    if (!confirm(`确认删除选中的 ${ids.length} 个句段？此操作无法撤销。`)) return
    setBulkDeleting(true); let failed = 0
    await Promise.all(ids.map(async id => {
      const { error } = await apiJSON(`/api/segments/${id}`, { method: 'DELETE' })
      if (error) failed++
    }))
    setBulkDeleting(false)
    if (failed > 0) alert(`${failed} 个句段删除失败（可能已锁定且你无权限）`)
    setSelectedIds(new Set()); setSelectMode(false)
    if (doc) await loadSegments(doc.id)
  }

  // ── Export ──
  const handleExport = (mode: ExportMode) => {
    if (!doc || segments.length === 0) { alert('请先切分原文'); return }
    setExportMenuOpen(false)
    exportBilingualDoc({ title: doc.title, sourceLang: doc.source_language, targetLang: doc.target_language, segments, mode })
  }

  // ── Glossary ──
  const handleGenerateGlossary = async () => {
    if (!doc) return
    const fullTrans = segments.map(s => s.target).filter(Boolean).join('\n')
    if (!fullTrans.trim()) { alert('请先翻译再生成术语表'); return }
    setGeneratingGlossary(true)
    try {
      const res = await apiJSON<{ terms: GlossaryTerm[] }>('/api/glossary', {
        method: 'POST',
        body: JSON.stringify({ sourceText: doc.source_text, translatedText: fullTrans, sourceLang: doc.source_language, targetLang: doc.target_language, projectId: doc.project_id }),
      })
      if (res.error) { alert('生成失败：' + res.error); return }
      const terms = res.data?.terms || []
      const { data: { user: u } } = await supabase.auth.getUser()
      for (const term of terms) await supabase.from('glossary_terms').insert({ ...term, project_id: doc.project_id, created_by: u?.id })
      loadGlossary(doc.project_id)
    } catch { alert('生成术语表失败') }
    setGeneratingGlossary(false)
  }

  // ─── Early returns ──────────────────────────────────────────────────────────

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-canvas">
      <div className="flex items-center gap-3 text-ink-500">
        <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        <span style={{ fontSize: 14 }}>加载中...</span>
      </div>
    </div>
  )
  if (!doc) return (
    <div className="h-screen flex items-center justify-center bg-canvas">
      <p style={{ color: 'var(--color-ink-500)' }}>文档不存在</p>
    </div>
  )

  // ─── Derived ────────────────────────────────────────────────────────────────

  const total = segments.length
  const translatedCount = segments.filter(s => s.target?.trim()).length
  const reviewedCount = segments.filter(s => s.status === 'reviewed' || s.status === 'locked').length
  const lockedCount = segments.filter(s => s.status === 'locked').length

  const SIDE = 64
  const canReviewerAct = canReview(myRole)

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      {/* ── Top header ── */}
      <header className="bg-white border-b border-line flex-shrink-0"
        style={{ paddingLeft: SIDE, paddingRight: SIDE, paddingTop: 14, paddingBottom: 14 }}>
        <div className="flex items-center" style={{ gap: 14 }}>
          <button onClick={() => router.back()}
            className="inline-flex items-center hover:text-ink-900 transition-colors flex-shrink-0"
            style={{ fontSize: 13, color: 'var(--color-ink-500)', gap: 6 }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回
          </button>
          <div style={{ width: 1, height: 18, background: 'var(--color-line)' }} />
          <div className="flex items-center flex-1 min-w-0" style={{ gap: 10 }}>
            <Logo size={28} className="flex-shrink-0" />
            <h1 className="truncate"
              style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-ink-900)', letterSpacing: '-0.01em' }}>
              {doc.title}
            </h1>
            <span className="rounded-full font-mono flex-shrink-0"
              style={{ fontSize: 11, color: 'var(--color-ink-500)', background: 'var(--color-canvas)', paddingLeft: 10, paddingRight: 10, paddingTop: 3, paddingBottom: 3 }}>
              {LANG_NAMES[doc.source_language]} → {LANG_NAMES[doc.target_language]}
            </span>
          </div>

          {/* Mode toggle */}
          <div className="flex items-center rounded-xl" style={{ background: 'var(--color-canvas)', padding: 3, gap: 2 }}>
            {(['translate', 'review'] as EditorMode[]).map(mode => {
              const active = editorMode === mode
              return (
                <button key={mode} onClick={() => switchEditorMode(mode)}
                  className="transition-all"
                  style={{
                    fontSize: 13, fontWeight: 500, paddingLeft: 14, paddingRight: 14, paddingTop: 7, paddingBottom: 7,
                    borderRadius: 9, background: active ? '#FFFFFF' : 'transparent',
                    color: active ? 'var(--color-ink-900)' : 'var(--color-ink-500)',
                    boxShadow: active ? '0 1px 3px rgba(31,30,29,0.12)' : 'none',
                  }}>
                  {mode === 'translate' ? '✏️ 翻译模式' : '✓ 审校模式'}
                </button>
              )
            })}
          </div>

          {/* Role */}
          <span className="rounded-full font-medium uppercase flex-shrink-0"
            style={{
              fontSize: 10, letterSpacing: '0.12em', paddingLeft: 10, paddingRight: 10, paddingTop: 4, paddingBottom: 4,
              background: myRole === 'manager' ? '#1F1E1D' : myRole === 'reviewer' ? '#EEF4FF' : '#FFF7F4',
              color: myRole === 'manager' ? '#FFF' : myRole === 'reviewer' ? '#5470D6' : '#D97757',
            }}>
            {myRole === 'manager' ? '项目经理' : myRole === 'reviewer' ? '审校' : myRole === 'translator' ? '译员' : '访客'}
          </span>
          <ChatToggleButton unread={unread} active={chatOpen} onClick={() => setChatOpen(true)} />
        </div>
      </header>

      {/* ── Progress strip ── */}
      {total > 0 && (
        <div className="flex items-center flex-shrink-0 border-b border-line"
          style={{ background: 'var(--color-canvas-2)', paddingLeft: SIDE, paddingRight: SIDE, paddingTop: 10, paddingBottom: 10, gap: 32 }}>
          {[
            { label: '翻译', value: translatedCount, color: '#D97757' },
            { label: '审校', value: reviewedCount, color: '#5470D6' },
            { label: '锁定', value: lockedCount, color: '#1F1E1D' },
          ].map(({ label, value, color }) => {
            const pct = total ? Math.round((value / total) * 100) : 0
            return (
              <div key={label} className="flex items-center" style={{ gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--color-ink-500)' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color }}>
                  {value}<span style={{ color: 'var(--color-ink-400)', fontWeight: 400 }}>/{total}</span>
                </span>
                <div style={{ width: 70, height: 4, background: '#E7E2D8', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--color-ink-400)', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
              </div>
            )
          })}
          <div className="ml-auto" style={{ fontSize: 12, color: 'var(--color-ink-500)' }}>
            总句段 <span style={{ color: 'var(--color-ink-900)', fontWeight: 600 }}>{total}</span>
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="bg-white border-b border-line flex-shrink-0 flex items-center flex-wrap"
        style={{ paddingLeft: SIDE, paddingRight: SIDE, paddingTop: 12, paddingBottom: 12, gap: 8 }}>
        {editorMode === 'translate' ? (
          <>
            <Button size="sm" variant="ghost" onClick={handleSplit}
              disabled={splitting || !canManage(myRole)} loading={splitting}
              title={canManage(myRole) ? '' : '只有项目经理可以重新分句'}>
              {segments.length > 0 ? '重新分句' : '分句'}
            </Button>
            <div style={{ width: 1, height: 18, background: 'var(--color-line)' }} />
            <select value={model} onChange={e => setModel(e.target.value as 'deepseek' | 'claude')}
              className="border-2 border-line rounded-xl bg-white font-medium focus:outline-none focus:border-brand"
              style={{ fontSize: 13, color: 'var(--color-ink-900)', paddingLeft: 10, paddingRight: 10, paddingTop: 6, paddingBottom: 6 }}>
              <option value="deepseek">DeepSeek · 快速</option>
              <option value="claude">Claude · 高质量</option>
            </select>
            <Button size="sm" variant="brand" onClick={handleTranslateAll}
              disabled={batchTranslating || segments.length === 0} loading={batchTranslating}>
              {batchTranslating ? `翻译中 ${batchProgress.done}/${batchProgress.total}` : '一键翻译全部'}
            </Button>
            <Button size="sm" variant="secondary"
              onClick={handleTranslateSelected}
              disabled={batchTranslating || !selectMode || selectedIds.size === 0}>
              翻译选中{selectMode && selectedIds.size > 0 ? `（${selectedIds.size}）` : ''}
            </Button>
            <div style={{ width: 1, height: 18, background: 'var(--color-line)' }} />
            <Button size="sm" variant={selectMode ? 'brand' : 'ghost'} onClick={toggleSelectMode}
              disabled={segments.length === 0}>
              {selectMode ? '退出选择' : '批量选择'}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleSubmitForReview}
              disabled={segments.length === 0}>
              提交审校
            </Button>
            <div className="ml-auto flex items-center" style={{ gap: 8 }}>
              <Button size="sm" variant="secondary"
                onClick={() => router.push(`/documents/${doc.id}/parallel`)}
                disabled={segments.length === 0}>⚡ 多模型并行</Button>
              <ExportMenu open={exportMenuOpen} onToggle={() => setExportMenuOpen(o => !o)} onExport={handleExport} />
            </div>
          </>
        ) : (
          <>
            {canReviewerAct && (
              <Button size="sm" variant="secondary" onClick={handleApproveAll}
                disabled={segments.length === 0}>✓ 全部通过</Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setShowGlossary(g => !g)} disabled={glossary.length === 0}>
              {showGlossary ? '隐藏术语表' : `术语表（${glossary.length}）`}
            </Button>
            <div className="ml-auto">
              <ExportMenu open={exportMenuOpen} onToggle={() => setExportMenuOpen(o => !o)} onExport={handleExport} />
            </div>
          </>
        )}
      </div>

      {/* ── Main ── */}
      <main className="flex-1 overflow-auto"
        style={{ paddingLeft: SIDE, paddingRight: SIDE, paddingTop: 28, paddingBottom: 48 }}>
        {segments.length === 0 ? (
          <EmptyState doc={doc} canManage={canManage(myRole)} splitting={splitting} onSplit={handleSplit} />
        ) : (
          <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {selectMode && (
              <div className="bg-white rounded-2xl flex items-center sticky"
                style={{
                  top: 8, zIndex: 20, border: '1px solid rgba(217,119,87,0.3)',
                  boxShadow: 'var(--shadow-card)', paddingLeft: 20, paddingRight: 20, paddingTop: 12, paddingBottom: 12, gap: 16,
                }}>
                <span className="flex items-center" style={{ fontSize: 13, gap: 8 }}>
                  <span className="inline-flex items-center justify-center bg-brand text-white rounded-lg font-semibold"
                    style={{ width: 26, height: 26, fontSize: 12 }}>{selectedIds.size}</span>
                  已选中
                </span>
                <div style={{ width: 1, height: 18, background: 'var(--color-line)' }} />
                <button onClick={selectAllVisible} className="hover:text-brand font-medium" style={{ fontSize: 13, color: 'var(--color-ink-700)' }}>全选可编辑</button>
                <button onClick={() => setSelectedIds(new Set())} disabled={selectedIds.size === 0}
                  className="hover:text-ink-900 font-medium disabled:opacity-40" style={{ fontSize: 13, color: 'var(--color-ink-500)' }}>清除选择</button>
                <div className="ml-auto flex items-center" style={{ gap: 8 }}>
                  <Button size="sm" variant="danger" onClick={bulkDelete}
                    disabled={selectedIds.size === 0 || bulkDeleting} loading={bulkDeleting}>
                    {bulkDeleting ? '删除中...' : `删除选中（${selectedIds.size}）`}
                  </Button>
                </div>
              </div>
            )}

            <Card padding="none" className="overflow-hidden">
              {editorMode === 'translate' ? (
                <TranslateTable
                  segments={segments}
                  aiDrafts={aiDrafts}
                  myRole={myRole}
                  hoveredId={hoveredId} setHoveredId={setHoveredId}
                  translatingIds={translatingIds} savingIds={savingIds}
                  selectMode={selectMode} selectedIds={selectedIds} onToggleSelectOne={toggleSelectOne}
                  onEditSource={handleEditSource} onBlurSource={handleBlurSource}
                  onFocusSource={(id, v) => { sourceFocusRef.current[id] = v }}
                  onEditTarget={handleEditTarget} onBlurTarget={handleBlurTarget}
                  onEditNotes={handleEditTranslatorNotes} onBlurNotes={handleBlurNotes}
                  onFocusNotes={(id, v) => { notesFocusRef.current[id] = v }}
                  onTranslateRow={handleTranslateRow} onAdoptAi={adoptAiDraft}
                />
              ) : (
                <ReviewTable
                  segments={segments}
                  origTargets={origTargets}
                  reviewComments={reviewComments} setReviewComments={setReviewComments}
                  myRole={myRole}
                  canReviewerAct={canReviewerAct}
                  hoveredId={hoveredId} setHoveredId={setHoveredId}
                  savingIds={savingIds}
                  onEditTarget={handleEditTarget} onBlurTarget={handleBlurTarget}
                  onApprove={handleApprove} onSendBack={handleSendBack}
                  onEditAndApprove={handleEditAndApprove}
                  onLock={(s) => handleLock(s, s.status !== 'locked')}
                  onSaveComment={saveReviewComment}
                />
              )}
            </Card>

            {/* Glossary panel */}
            {glossary.length > 0 && showGlossary && (
              <Card padding="md">
                <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                  <h3 className="font-serif" style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-ink-900)' }}>
                    术语表（{glossary.length}）
                  </h3>
                  <button onClick={() => setShowGlossary(false)} style={{ fontSize: 12, color: 'var(--color-ink-500)' }}>收起</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                  {glossary.map(g => (
                    <div key={g.id} className="rounded-lg" style={{ background: 'var(--color-canvas)', padding: 10 }}>
                      <div className="flex items-center" style={{ gap: 6, fontSize: 13 }}>
                        <span style={{ color: 'var(--color-ink-900)', fontWeight: 500 }}>{g.source_term}</span>
                        <span style={{ color: 'var(--color-ink-400)' }}>→</span>
                        <span style={{ color: 'var(--color-brand)' }}>{g.translated_term}</span>
                      </div>
                      {g.definition && <p style={{ fontSize: 11, color: 'var(--color-ink-500)', marginTop: 4 }}>{g.definition}</p>}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {editorMode === 'translate' && canManage(myRole) && glossary.length === 0 && (
              <div className="text-center">
                <Button size="sm" variant="ghost" onClick={handleGenerateGlossary} loading={generatingGlossary}>
                  {generatingGlossary ? '生成中...' : '🪄 AI 生成术语表'}
                </Button>
              </div>
            )}
          </div>
        )}
      </main>

      {doc && (
        <ChatPanel projectId={doc.project_id} currentUserId={userId} open={chatOpen} onClose={() => setChatOpen(false)} onUnreadChange={setUnread} />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Translate Table
// ═══════════════════════════════════════════════════════════════════════════════

function TranslateTable(props: {
  segments: Segment[]
  aiDrafts: Record<string, string>
  myRole: Role | null
  hoveredId: string | null
  setHoveredId: (id: string | null) => void
  translatingIds: Set<string>
  savingIds: Set<string>
  selectMode: boolean
  selectedIds: Set<string>
  onToggleSelectOne: (id: string) => void
  onEditSource: (id: string, v: string) => void
  onBlurSource: (s: Segment) => void
  onFocusSource: (id: string, v: string) => void
  onEditTarget: (id: string, v: string) => void
  onBlurTarget: (s: Segment) => void
  onEditNotes: (id: string, v: string) => void
  onBlurNotes: (s: Segment) => void
  onFocusNotes: (id: string, v: string) => void
  onTranslateRow: (s: Segment) => void
  onAdoptAi: (s: Segment) => void
}) {
  const cols = props.selectMode
    ? '40px 56px minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,0.8fr) 96px'
    : '56px minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,0.8fr) 96px'

  return (
    <div>
      {/* Header */}
      <div className="border-b border-line uppercase font-medium"
        style={{
          display: 'grid', gridTemplateColumns: cols, columnGap: 14, alignItems: 'center',
          background: 'var(--color-canvas-2)',
          paddingLeft: 20, paddingRight: 20, paddingTop: 12, paddingBottom: 12,
          fontSize: 11, letterSpacing: '0.08em', color: 'var(--color-ink-500)',
        }}>
        {props.selectMode && <div />}
        <div style={{ textAlign: 'center' }}>#</div>
        <div>原文</div>
        <div>AI 初译</div>
        <div>人工译文</div>
        <div>备注</div>
        <div style={{ textAlign: 'center' }}>状态 / 操作</div>
      </div>

      {props.segments.map((seg, idx) => {
        const parsed = parseNotes(seg.notes)
        const translatorNotes = parsed.translator
        const ai = props.aiDrafts[seg.id] || ''
        const status = deriveDisplayStatus(seg)
        const meta = STATUS_META[status]
        const isTranslating = props.translatingIds.has(seg.id)
        const isSaving = props.savingIds.has(seg.id)
        const isHover = props.hoveredId === seg.id
        const isLocked = seg.status === 'locked'
        const editable = !isLocked || canManage(props.myRole)

        return (
          <div key={seg.id}
            onMouseEnter={() => props.setHoveredId(seg.id)}
            onMouseLeave={() => { if (props.hoveredId === seg.id) props.setHoveredId(null) }}
            className="border-b border-line transition-colors"
            style={{
              display: 'grid', gridTemplateColumns: cols, columnGap: 14, alignItems: 'start',
              paddingLeft: 20, paddingRight: 20, paddingTop: 18, paddingBottom: 18,
              background: isHover ? 'rgba(217,119,87,0.025)' : '#FFFFFF',
            }}>
            {props.selectMode && (
              <input type="checkbox" checked={props.selectedIds.has(seg.id)}
                disabled={isLocked && !canManage(props.myRole)}
                onChange={() => props.onToggleSelectOne(seg.id)}
                style={{ marginTop: 6, width: 16, height: 16, accentColor: '#D97757' }} />
            )}
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-ink-400)', textAlign: 'center', paddingTop: 6 }}>
              {String(idx + 1).padStart(2, '0')}
            </div>

            {/* 原文 */}
            <textarea value={seg.source}
              onChange={e => props.onEditSource(seg.id, e.target.value)}
              onFocus={() => props.onFocusSource(seg.id, seg.source)}
              onBlur={() => props.onBlurSource(seg)}
              disabled={!editable}
              rows={Math.max(2, Math.ceil(seg.source.length / 28))}
              style={cellTextarea({ bg: 'var(--color-canvas-2)', border: '#E7E2D8', editable })} />

            {/* AI 初译 */}
            <div className="rounded-lg relative" style={{ background: '#F9F6FF', border: '1px solid #E5DDF5', padding: 10, minHeight: 60 }}>
              {ai ? (
                <p style={{ fontSize: 13, lineHeight: 1.6, color: '#4A3B7A', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-serif)' }}>{ai}</p>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--color-ink-400)', fontStyle: 'italic' }}>
                  {isTranslating ? '翻译中...' : '点击「重译」获取 AI 译文'}
                </p>
              )}
            </div>

            {/* 人工译文 */}
            <textarea value={seg.target}
              onChange={e => props.onEditTarget(seg.id, e.target.value)}
              onBlur={() => props.onBlurTarget(seg)}
              disabled={!editable}
              rows={Math.max(2, Math.ceil((seg.target || '').length / 28) || 2)}
              placeholder="在这里输入或编辑译文..."
              style={cellTextarea({ bg: '#FFFFFF', border: '#D97757', editable, accent: true })} />

            {/* 备注 */}
            <textarea value={translatorNotes}
              onChange={e => props.onEditNotes(seg.id, e.target.value)}
              onFocus={() => props.onFocusNotes(seg.id, seg.notes || '')}
              onBlur={() => props.onBlurNotes(seg)}
              disabled={!editable}
              rows={2}
              placeholder="可写疑问、术语、上下文..."
              style={cellTextarea({ bg: '#FFFBEF', border: '#EDE4C8', editable })} />

            {/* 状态 / 操作 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 4 }}>
              <StatusPill meta={meta} />
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 4, width: '100%',
                opacity: isHover ? 1 : 0,
                pointerEvents: isHover ? 'auto' : 'none',
                transition: 'opacity 0.15s',
              }}>
                <RowMicroBtn label={isTranslating ? '...' : '重译'} onClick={() => props.onTranslateRow(seg)} disabled={isTranslating || isLocked} />
                {ai && ai !== seg.target && (
                  <RowMicroBtn label="采用 AI" onClick={() => props.onAdoptAi(seg)} disabled={!editable} variant="primary" />
                )}
                {isSaving && <span style={{ fontSize: 10, color: 'var(--color-ink-400)', textAlign: 'center' }}>保存中…</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Review Table
// ═══════════════════════════════════════════════════════════════════════════════

function ReviewTable(props: {
  segments: Segment[]
  origTargets: Record<string, string>
  reviewComments: Record<string, { type: string; text: string }>
  setReviewComments: React.Dispatch<React.SetStateAction<Record<string, { type: string; text: string }>>>
  myRole: Role | null
  canReviewerAct: boolean
  hoveredId: string | null
  setHoveredId: (id: string | null) => void
  savingIds: Set<string>
  onEditTarget: (id: string, v: string) => void
  onBlurTarget: (s: Segment) => void
  onApprove: (s: Segment) => void
  onSendBack: (s: Segment) => void
  onEditAndApprove: (s: Segment) => void
  onLock: (s: Segment) => void
  onSaveComment: (segId: string, sendBack: boolean) => void
}) {
  const cols = '56px minmax(0,1.1fr) minmax(0,1.1fr) minmax(0,1.1fr) minmax(0,1.3fr) 110px'

  return (
    <div>
      <div className="border-b border-line uppercase font-medium"
        style={{
          display: 'grid', gridTemplateColumns: cols, columnGap: 14, alignItems: 'center',
          background: 'var(--color-canvas-2)',
          paddingLeft: 20, paddingRight: 20, paddingTop: 12, paddingBottom: 12,
          fontSize: 11, letterSpacing: '0.08em', color: 'var(--color-ink-500)',
        }}>
        <div style={{ textAlign: 'center' }}>#</div>
        <div>原文</div>
        <div>译者译文</div>
        <div>审校译文</div>
        <div>审校意见</div>
        <div style={{ textAlign: 'center' }}>状态 / 操作</div>
      </div>

      {props.segments.map((seg, idx) => {
        const orig = props.origTargets[seg.id] ?? seg.target
        const rc = props.reviewComments[seg.id] ?? { type: '', text: '' }
        const status = deriveDisplayStatus(seg, rc)
        const meta = STATUS_META[status]
        const isHover = props.hoveredId === seg.id
        const isSaving = props.savingIds.has(seg.id)
        const isLocked = seg.status === 'locked'
        const canEditTarget = props.canReviewerAct && !isLocked

        const updateComment = (patch: Partial<{ type: string; text: string }>) => {
          props.setReviewComments(prev => ({ ...prev, [seg.id]: { ...rc, ...patch } }))
        }

        return (
          <div key={seg.id}
            onMouseEnter={() => props.setHoveredId(seg.id)}
            onMouseLeave={() => { if (props.hoveredId === seg.id) props.setHoveredId(null) }}
            className="border-b border-line transition-colors"
            style={{
              display: 'grid', gridTemplateColumns: cols, columnGap: 14, alignItems: 'start',
              paddingLeft: 20, paddingRight: 20, paddingTop: 18, paddingBottom: 18,
              background: isHover ? 'rgba(84,112,214,0.025)' : '#FFFFFF',
            }}>
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-ink-400)', textAlign: 'center', paddingTop: 6 }}>
              {String(idx + 1).padStart(2, '0')}
            </div>

            {/* 原文 */}
            <div className="rounded-lg" style={{ background: 'var(--color-canvas-2)', border: '1px solid #E7E2D8', padding: 10, minHeight: 60 }}>
              <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--color-ink-700)', whiteSpace: 'pre-wrap' }}>{seg.source}</p>
            </div>

            {/* 译者译文（只读快照） */}
            <div className="rounded-lg" style={{ background: '#FFF7F4', border: '1px solid #FBD9C7', padding: 10, minHeight: 60 }}>
              {orig?.trim() ? (
                <p style={{ fontSize: 13, lineHeight: 1.7, color: '#6B3F2A', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-serif)' }}>{orig}</p>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--color-ink-400)', fontStyle: 'italic' }}>译者尚未提交</p>
              )}
            </div>

            {/* 审校译文（可编辑 = 当前 target） */}
            <textarea value={seg.target}
              onChange={e => props.onEditTarget(seg.id, e.target.value)}
              onBlur={() => props.onBlurTarget(seg)}
              disabled={!canEditTarget}
              rows={Math.max(2, Math.ceil((seg.target || '').length / 28) || 2)}
              placeholder={canEditTarget ? '可直接修改译文，然后点「修改并通过」' : '无审校权限'}
              style={cellTextarea({ bg: '#FFFFFF', border: '#5470D6', editable: canEditTarget, accent: true })} />

            {/* 审校意见 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select value={rc.type} onChange={e => updateComment({ type: e.target.value })}
                disabled={!props.canReviewerAct}
                style={{
                  fontSize: 12, color: 'var(--color-ink-900)', background: '#FFFFFF',
                  border: '1px solid #E7E2D8', borderRadius: 8,
                  paddingLeft: 10, paddingRight: 10, paddingTop: 6, paddingBottom: 6,
                }}>
                <option value="">选择问题类型...</option>
                {REVIEW_ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <textarea value={rc.text}
                onChange={e => updateComment({ text: e.target.value })}
                onBlur={() => props.onSaveComment(seg.id, false)}
                disabled={!props.canReviewerAct}
                rows={2}
                placeholder="审校意见..."
                style={cellTextarea({ bg: '#EEF4FF', border: '#C7D5F8', editable: props.canReviewerAct })} />
            </div>

            {/* 状态 / 操作 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 4 }}>
              <StatusPill meta={meta} />
              {props.canReviewerAct && (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 4, width: '100%',
                  opacity: isHover ? 1 : 0,
                  pointerEvents: isHover ? 'auto' : 'none',
                  transition: 'opacity 0.15s',
                }}>
                  {seg.status !== 'reviewed' && !isLocked && (
                    <RowMicroBtn label="通过" variant="primary" onClick={() => props.onApprove(seg)} />
                  )}
                  {!isLocked && (
                    <RowMicroBtn label="退回" onClick={() => props.onSendBack(seg)} />
                  )}
                  {!isLocked && (
                    <RowMicroBtn label="修改并通过" onClick={() => props.onEditAndApprove(seg)} />
                  )}
                  {canManage(props.myRole) && (
                    <RowMicroBtn label={isLocked ? '解锁' : '锁定'} onClick={() => props.onLock(seg)} />
                  )}
                  {isSaving && <span style={{ fontSize: 10, color: 'var(--color-ink-400)', textAlign: 'center' }}>保存中…</span>}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pieces
// ═══════════════════════════════════════════════════════════════════════════════

function cellTextarea(opts: { bg: string; border: string; editable: boolean; accent?: boolean }): React.CSSProperties {
  return {
    width: '100%', minHeight: 60, resize: 'vertical',
    fontSize: 14, lineHeight: 1.65, fontFamily: 'var(--font-serif)',
    color: opts.editable ? 'var(--color-ink-900)' : 'var(--color-ink-500)',
    background: opts.bg, border: `1px solid ${opts.border}`, borderRadius: 10,
    paddingLeft: 12, paddingRight: 12, paddingTop: 10, paddingBottom: 10,
    outline: 'none', boxShadow: opts.accent ? '0 0 0 0 transparent' : undefined,
    transition: 'border-color 0.15s, box-shadow 0.15s',
    cursor: opts.editable ? 'text' : 'not-allowed',
  }
}

function StatusPill({ meta }: { meta: { label: string; bg: string; color: string; border: string } }) {
  return (
    <span className="font-medium uppercase rounded-full whitespace-nowrap"
      style={{
        fontSize: 10, letterSpacing: '0.08em',
        background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
        paddingLeft: 9, paddingRight: 9, paddingTop: 4, paddingBottom: 4,
      }}>
      {meta.label}
    </span>
  )
}

function RowMicroBtn({ label, onClick, disabled, variant = 'ghost' }: {
  label: string; onClick: () => void; disabled?: boolean; variant?: 'ghost' | 'primary'
}) {
  const isPrimary = variant === 'primary'
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        fontSize: 11, fontWeight: 500,
        paddingLeft: 8, paddingRight: 8, paddingTop: 5, paddingBottom: 5,
        borderRadius: 7, border: `1px solid ${isPrimary ? '#D97757' : '#E7E2D8'}`,
        background: isPrimary ? '#D97757' : '#FFFFFF',
        color: isPrimary ? '#FFFFFF' : 'var(--color-ink-700)',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'opacity 0.15s, background 0.15s',
      }}>
      {label}
    </button>
  )
}

function EmptyState({ doc, canManage, splitting, onSplit }: { doc: Doc; canManage: boolean; splitting: boolean; onSplit: () => void }) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <Card padding="lg">
        <div style={{ marginBottom: 32 }}>
          <p className="uppercase font-medium" style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--color-ink-400)', marginBottom: 8 }}>SOURCE · 原文</p>
          <p style={{ fontSize: 14, lineHeight: 1.85, color: 'var(--color-ink-900)', whiteSpace: 'pre-wrap', maxHeight: 384, overflow: 'auto' }}>{doc.source_text}</p>
        </div>
        <div className="border-t border-line text-center" style={{ paddingTop: 32 }}>
          <h3 className="font-serif" style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--color-ink-900)', marginBottom: 10 }}>开始你的翻译工作</h3>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--color-ink-500)', maxWidth: 400, margin: '0 auto 24px' }}>
            {canManage
              ? '点击「分句」，将原文按句子切分为表格。每一句都可以单独 AI 翻译并自由编辑。'
              : '项目经理还没切分原文，请联系项目经理操作。'}
          </p>
          {canManage && (
            <Button variant="primary" size="lg" onClick={onSplit} loading={splitting}>
              {splitting ? '分句中...' : '分句开始翻译'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

function ExportMenu({ open, onToggle, onExport }: { open: boolean; onToggle: () => void; onExport: (m: ExportMode) => void }) {
  return (
    <div style={{ position: 'relative' }}>
      <Button size="sm" variant="ghost" onClick={onToggle}>导出 ▾</Button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '110%', zIndex: 30,
          background: '#FFFFFF', border: '1px solid var(--color-line)', borderRadius: 12,
          boxShadow: 'var(--shadow-card)', minWidth: 200, padding: 6,
        }}>
          {([
            ['bilingual', '双语对照（默认）'],
            ['target', '仅译文'],
            ['bilingual_notes', '双语 + 备注'],
          ] as Array<[ExportMode, string]>).map(([m, label]) => (
            <button key={m} onClick={() => onExport(m)}
              className="w-full text-left rounded-lg hover:bg-canvas"
              style={{ fontSize: 13, color: 'var(--color-ink-900)', paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8 }}>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
