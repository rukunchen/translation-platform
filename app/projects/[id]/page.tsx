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
import { Eyebrow } from '@/components/ui/Eyebrow'
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
type SegmentRow = {
  id: string
  document_id: string
  status?: SegmentStatus | string | null
  target?: string | null
  source?: string | null
  translator_target?: string | null
  review_target?: string | null
  reviewed_at?: string | null
  notes?: string | null
  [key: string]: unknown
}
type Profile = { id: string; name: string | null; email: string }
type ParallelRow = {
  id: string; document_id: string; segment_id: string
  provider: string; model: string; temperature: number | null; prompt?: string | null
  status: 'pending' | 'running' | 'success' | 'failed'
  created_by?: string | null; created_at?: string; updated_at?: string | null
}

type SegmentStatus = 'untranslated' | 'draft' | 'reviewed' | 'locked'
type ImportedSegment = { source: string; target: string; selected?: boolean }
type CreateInputMode = 'paste' | 'manual'
type ImportMode = 'single' | 'multiple'
type ImportDraft = {
  id: string
  fileName: string
  title: string
  format: string
  selected: boolean
  status: 'ready' | 'error'
  error?: string
  segments: ImportedSegment[]
}

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

const REVIEW_ISSUE_TYPES = ['意义问题', '风格问题', '文化问题', '术语问题', '自然度问题', '格式问题', '其他']
const COMMENT_SEP = '\n———审校意见———\n'

function percent(value: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

function valueOf(row: SegmentRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function parseReviewFromNotes(notes?: string | null): { type: string; text: string } {
  const raw = notes || ''
  const idx = raw.indexOf(COMMENT_SEP)
  const review = idx >= 0 ? raw.slice(idx + COMMENT_SEP.length) : ''
  const match = review.match(/^类型: (.+)\n?/)
  return {
    type: match?.[1]?.trim() || '',
    text: match ? review.slice(match[0].length).trim() : review.trim(),
  }
}

function splitIssueTypes(value: string): string[] {
  return value
    .split(/[；;,，、]/)
    .map(v => v.trim())
    .filter(Boolean)
}

function translatedTextOf(row: SegmentRow): string {
  return valueOf(row, ['human_translation', 'manual_translation', 'translator_translation', 'translator_target', 'target_text', 'translation', 'target'])
}

function reviewedTextOf(row: SegmentRow): string {
  return valueOf(row, ['reviewed_translation', 'review_translation', 'review_target'])
}

function isTranslated(row: SegmentRow): boolean {
  return Boolean(translatedTextOf(row))
}

function isReviewed(row: SegmentRow): boolean {
  const status = String(row.status || '').toLowerCase()
  const reviewedText = reviewedTextOf(row)
  return status === 'reviewed'
    || status === 'locked'
    || status === 'approved'
    || status === 'passed'
    || Boolean(row.reviewed_at)
    || (Boolean(reviewedText) && ['reviewed', 'locked', 'approved', 'passed'].includes(status))
}

function isModified(row: SegmentRow): boolean {
  const reviewed = reviewedTextOf(row)
  const translated = translatedTextOf(row)
  if (reviewed && translated && reviewed.trim() !== translated.trim()) return true
  const notes = parseReviewFromNotes(row.notes)
  return Boolean(notes.type || notes.text || valueOf(row, ['review_note', 'issue_type', 'review_issue_type', 'problem_type']))
}

function issueTypesOf(row: SegmentRow): string[] {
  const values: string[] = []
  for (const key of ['issue_type', 'review_issue_type', 'problem_type']) {
    const value = row[key]
    if (typeof value === 'string') values.push(...splitIssueTypes(value))
    if (Array.isArray(value)) values.push(...value.map(String))
  }
  const issueTags = row.issue_tags
  if (Array.isArray(issueTags)) values.push(...issueTags.map(String))
  else if (typeof issueTags === 'string') values.push(...splitIssueTypes(issueTags))
  values.push(...splitIssueTypes(parseReviewFromNotes(row.notes).type))
  return values.map(type => REVIEW_ISSUE_TYPES.includes(type) ? type : '其他')
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

function textLines(text: string): string[] {
  return text.split(/\n+/).map(s => s.trim()).filter(Boolean)
}

function alignTargetsToSourceCount(targets: string[], sourceCount: number): string[] {
  if (sourceCount <= 0) return []
  if (targets.length === 0) return Array.from({ length: sourceCount }, () => '')
  if (targets.length === sourceCount) return targets
  if (targets.length < sourceCount) {
    return Array.from({ length: sourceCount }, (_, i) => targets[i] ?? '')
  }
  return Array.from({ length: sourceCount }, (_, i) => {
    const start = Math.floor(i * targets.length / sourceCount)
    const end = Math.floor((i + 1) * targets.length / sourceCount)
    return targets.slice(start, Math.max(start + 1, end)).join(' ')
  })
}

function makeManualSegments(sourceText: string, targetText: string, sourceLang: string, targetLang: string): ImportedSegment[] {
  const sourceSegs = splitSentences(sourceText, sourceLang).map(s => s.source)
  const targetSegs = splitSentences(targetText, targetLang).map(s => s.source)
  const alignedTargets = alignTargetsToSourceCount(targetSegs, sourceSegs.length)
  return sourceSegs.map((source, i) => ({ source, target: alignedTargets[i] ?? '' }))
}

function pairOrderedItems(items: string[], sourceLang: string, targetLang: string): ImportedSegment[] {
  const sourceScript = langScript(sourceLang)
  const targetScript = langScript(targetLang)
  const pairs: ImportedSegment[] = []
  let pendingSource = ''

  for (const item of items.map(s => s.trim()).filter(Boolean)) {
    const script = detectScript(item)
    if (script === sourceScript || script === 'unknown') {
      if (pendingSource) pairs.push({ source: pendingSource, target: '' })
      pendingSource = item
      continue
    }
    if (script === targetScript) {
      if (pendingSource) {
        pairs.push({ source: pendingSource, target: item })
        pendingSource = ''
      } else if (pairs.length > 0 && !pairs[pairs.length - 1].target) {
        pairs[pairs.length - 1].target = item
      }
    }
  }

  if (pendingSource) pairs.push({ source: pendingSource, target: '' })
  return pairs
}

function pairExcelRows(rows: unknown[][], sourceLang: string, targetLang: string): ImportedSegment[] {
  const sourceScript = langScript(sourceLang)
  const targetScript = langScript(targetLang)
  const rowPairs: ImportedSegment[] = []
  const allCells: string[] = []

  for (const row of rows) {
    const cells = row.map(cell => String(cell ?? '').trim()).filter(Boolean)
    if (cells.length === 0) continue
    allCells.push(...cells)
    const source = cells.find(cell => detectScript(cell) === sourceScript) ?? ''
    const target = cells.find(cell => detectScript(cell) === targetScript) ?? ''
    if (source) rowPairs.push({ source, target })
  }

  return rowPairs.length > 0 ? rowPairs : pairOrderedItems(allCells, sourceLang, targetLang)
}

function pairTableRows(rows: unknown[][]): ImportedSegment[] {
  return rows.flatMap(row => {
    const cells = row.map(cell => String(cell ?? '').trim()).filter(Boolean)
    if (cells.length < 2) return []
    return [{ source: cells[0], target: cells[1], selected: true }]
  })
}

function withSelected(rows: ImportedSegment[]): ImportedSegment[] {
  return rows.map(row => ({ ...row, selected: row.selected !== false }))
}

function importConfidence(row: ImportedSegment, sourceLang: string, targetLang: string): number {
  const warnings = importWarnings(row, sourceLang, targetLang)
  return Math.max(20, 100 - warnings.length * 20)
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '')
}

function importWarnings(row: ImportedSegment, sourceLang: string, targetLang: string): string[] {
  const warnings: string[] = []
  const source = row.source.trim()
  const target = row.target.trim()
  if (!target) warnings.push('译文为空')
  const sourceScript = detectScript(source)
  const targetScript = detectScript(target)
  if (source && sourceScript !== 'unknown' && sourceScript !== langScript(sourceLang)) warnings.push('原文语言可疑')
  if (target && targetScript !== 'unknown' && targetScript !== langScript(targetLang)) warnings.push('译文语言可疑')
  if (source.length > 0 && target.length > source.length * 3.2) warnings.push('译文过长')
  if (target.length > 0 && source.length > target.length * 3.2) warnings.push('译文过短')
  if (/^[\s.,;:!?。！？；：、"'“”‘’()\[\]{}-]+$/.test(source)) warnings.push('原文疑似仅标点')
  return warnings
}

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
  const [accessDenied, setAccessDenied] = useState(false)

  // ---- 新建文档 modal ----
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'import'>('create')
  const [createInputMode, setCreateInputMode] = useState<CreateInputMode>('paste')
  const [importMode, setImportMode] = useState<ImportMode | null>(null)
  const [importDrafts, setImportDrafts] = useState<ImportDraft[]>([])
  const [activeImportIndex, setActiveImportIndex] = useState(0)
  const [title, setTitle] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [targetText, setTargetText] = useState('')
  const [manualSegments, setManualSegments] = useState<ImportedSegment[]>([{ source: '', target: '' }])
  const [sourceLang, setSourceLang] = useState('en')
  const [targetLang, setTargetLang] = useState('zh')
  const [loading, setLoading] = useState(false)
  const [importHint, setImportHint] = useState('')
  const [importedSegments, setImportedSegments] = useState<ImportedSegment[] | null>(null)
  const [importingFile, setImportingFile] = useState(false)

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
  useEffect(() => {
    router.prefetch('/dashboard')
    router.prefetch(`/projects/${projectId}/glossary`)
    router.prefetch(`/projects/${projectId}/search`)
  }, [projectId, router])

  function openCreateModal() {
    setModalMode('create')
    setCreateInputMode('paste')
    setImportMode(null)
    setImportedSegments(null)
    setImportDrafts([])
    setManualSegments([{ source: '', target: '' }])
    setImportHint('')
    setShowModal(true)
  }

  function openImportModal() {
    setModalMode('import')
    setImportMode(null)
    setImportedSegments(null)
    setImportDrafts([])
    setActiveImportIndex(0)
    setImportHint('')
    setShowModal(true)
  }

  const loadAll = useCallback(async (userId: string) => {
    const { data: memberRow } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle()
    if (!memberRow) {
      setAccessDenied(true)
      setProject(null); setDocuments([]); setSegments([]); setParallel([]); setProfiles({})
      return
    }
    setAccessDenied(false)
    setMyRole((memberRow.role as Role) || null)

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
      supabase.from('segments').select('*').in('document_id', docIds),
      supabase.from('parallel_translations').select('id, document_id, segment_id, provider, model, temperature, prompt, status, created_by, created_at, updated_at').in('document_id', docIds).neq('provider', '__config__').order('updated_at', { ascending: false }).limit(60),
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
      void loadAll(user.id)
    })
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
      const translated = segs.filter(isTranslated).length
      const reviewed   = segs.filter(isReviewed).length
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

  const translationStats = useMemo(() => {
    const totalFiles = docInfos.length
    const completedFiles = docInfos.filter(d => d.total > 0 && d.translated === d.total).length
    const totalSegments = docInfos.reduce((sum, d) => sum + d.total, 0)
    const translatedSegments = docInfos.reduce((sum, d) => sum + d.segs.filter(isTranslated).length, 0)
    const untranslatedSegments = Math.max(0, totalSegments - translatedSegments)
    return {
      totalFiles,
      completedFiles,
      fileRate: percent(completedFiles, totalFiles),
      totalSegments,
      translatedSegments,
      untranslatedSegments,
      segmentRate: percent(translatedSegments, totalSegments),
    }
  }, [docInfos])

  const reviewStats = useMemo(() => {
    const totalFiles = docInfos.length
    const reviewedFiles = docInfos.filter(d => d.total > 0 && d.segs.every(isReviewed)).length
    const reviewedSegments = docInfos.reduce((sum, d) => sum + d.segs.filter(isReviewed).length, 0)
    const modifiedSegments = docInfos.reduce((sum, d) => sum + d.segs.filter(s => isReviewed(s) && isModified(s)).length, 0)
    const issueCounts = REVIEW_ISSUE_TYPES.reduce<Record<string, number>>((acc, type) => {
      acc[type] = 0
      return acc
    }, {})
    let issueTotal = 0
    docInfos.forEach(d => {
      d.segs.forEach(seg => {
        issueTypesOf(seg).forEach(type => {
          issueCounts[type] = (issueCounts[type] ?? 0) + 1
          issueTotal += 1
        })
      })
    })
    return {
      totalFiles,
      reviewedFiles,
      fileRate: percent(reviewedFiles, totalFiles),
      reviewedSegments,
      modifiedSegments,
      modifiedRate: percent(modifiedSegments, reviewedSegments),
      issueTotal,
      issueCounts,
    }
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
        const anyEmpty = segByDoc.some(s => !translatedTextOf(s))
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
    if (modalMode === 'import') {
      await createImportedDocuments()
      return
    }
    const manualRows = createInputMode === 'manual'
      ? manualSegments.map(row => ({ source: row.source.trim(), target: row.target.trim() }))
      : null
    if (manualRows?.some(row => !row.source && row.target)) {
      alert('手动分句中每一行都需要先填写原文，译文可以留空')
      return
    }
    let src = sourceText, tgt = targetText
    const importedRows = importedSegments?.filter(s => s.source.trim()) ?? null
    if (!manualRows && !importedRows && tgt.trim()) {
      const srcScript = detectScript(src), tgtScript = detectScript(tgt)
      const expSrc = langScript(sourceLang), expTgt = langScript(targetLang)
      if (srcScript !== 'unknown' && tgtScript !== 'unknown' && srcScript === expTgt && tgtScript === expSrc) {
        if (confirm('检测到原文与译文位置对调了，是否自动互换？')) {
          [src, tgt] = [tgt, src]
          setSourceText(src); setTargetText(tgt)
        }
      }
    }
    const preparedSegments = manualRows
      ? manualRows.filter(row => row.source)
      : importedRows && importedRows.length > 0
      ? importedRows
      : makeManualSegments(src, tgt, sourceLang, targetLang)
    if (preparedSegments.length === 0) {
      alert(createInputMode === 'manual' ? '请至少手动输入一句原文' : '请先输入原文或上传 Word / Excel 文件')
      return
    }
    src = preparedSegments.map(s => s.source).join('\n')
    tgt = preparedSegments.map(s => s.target).filter(Boolean).join('\n')
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('documents')
      .insert({ title, source_text: src, project_id: projectId, source_language: sourceLang, target_language: targetLang, created_by: user?.id })
      .select().single()
    if (error || !data) { setLoading(false); alert('创建失败：' + (error?.message ?? '未知错误')); return }
    const rows = preparedSegments.map((seg, i) => ({
      document_id: data.id,
      position: i,
      source: seg.source,
      target: seg.target,
      status: (seg.target.trim() ? 'draft' : 'untranslated'),
    }))
    await supabase.from('segments').insert(rows)
    setLoading(false)
    router.push(`/documents/${data.id}`)
  }

  async function importDocumentFile(file: File) {
    setImportingFile(true)
    setImportHint('')
    try {
      const draft = await parseImportFile(file)
      const rows = draft.segments.filter(row => row.source.trim())
      if (rows.length === 0) {
        alert('没有识别到可导入的原文句段，请检查文件内容和语言方向')
        return
      }

      setImportedSegments(rows)
      setImportDrafts([{ ...draft, segments: rows, selected: true }])
      setActiveImportIndex(0)
      setSourceText(rows.map(row => row.source).join('\n'))
      setTargetText(rows.map(row => row.target).filter(Boolean).join('\n'))
      if (!title.trim()) setTitle(stripExtension(file.name))
      const translated = rows.filter(row => row.target.trim()).length
      setImportHint(`已解析 ${rows.length} 个句段，其中 ${translated} 个带译文。请预览确认后再创建文档。`)
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误'
      alert('导入失败：' + message)
    } finally {
      setImportingFile(false)
    }
  }

  async function importMultipleFiles(files: FileList | File[]) {
    const fileList = Array.from(files)
    if (fileList.length === 0) {
      setImportHint('没有读取到文件，请重新选择。')
      return
    }
    setImportingFile(true)
    setImportHint('')
    try {
      const drafts: ImportDraft[] = []
      for (const [idx, file] of fileList.entries()) {
        try {
          drafts.push(await parseImportFile(file))
        } catch (err) {
          drafts.push({
            id: `${file.name}-${file.size}-${file.lastModified}-${idx}`,
            fileName: file.name,
            title: stripExtension(file.name),
            format: '无法识别',
            selected: false,
            status: 'error',
            error: err instanceof Error ? err.message : '解析失败',
            segments: [],
          })
        }
      }
      setImportDrafts(drafts)
      const firstReadyIndex = drafts.findIndex(d => d.status === 'ready')
      setActiveImportIndex(firstReadyIndex >= 0 ? firstReadyIndex : 0)
      setImportedSegments(firstReadyIndex >= 0 ? drafts[firstReadyIndex].segments : null)
      setImportHint(`已解析 ${drafts.length} 个文件。请先检查文件级预览和句段预览，再批量创建。`)
    } finally {
      setImportingFile(false)
    }
  }

  async function parseImportFile(file: File): Promise<ImportDraft> {
    const lower = file.name.toLowerCase()
    let rows: ImportedSegment[] = []
    let format = ''

    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
      const tableRows = pairTableRows(table)
      if (tableRows.length > 0) {
        rows = tableRows
        format = '表格双栏'
      } else {
        rows = pairExcelRows(table, sourceLang, targetLang)
        format = '中英交替单元格'
      }
    } else if (lower.endsWith('.docx')) {
      const mammoth = await import('mammoth/mammoth.browser')
      const buffer = await file.arrayBuffer()
      const htmlResult = await mammoth.convertToHtml({ arrayBuffer: buffer })
      const doc = new DOMParser().parseFromString(htmlResult.value, 'text/html')
      const tableRows = Array.from(doc.querySelectorAll('tr')).flatMap(tr => {
        const cells = Array.from(tr.querySelectorAll('td,th')).map(td => td.textContent?.trim() || '').filter(Boolean)
        return cells.length >= 2 ? [{ source: cells[0], target: cells[1], selected: true }] : []
      })
      if (tableRows.length > 0) {
        rows = tableRows
        format = '表格双栏'
      } else {
        const raw = await mammoth.extractRawText({ arrayBuffer: buffer })
        rows = pairOrderedItems(textLines(raw.value), sourceLang, targetLang)
        format = '中英交替段落'
      }
    } else {
      throw new Error('目前支持 .docx、.xlsx、.xls 文件')
    }

    rows = withSelected(rows.filter(row => row.source.trim()))
    if (rows.length === 0) throw new Error('没有识别到可导入的原文句段')
    return {
      id: `${file.name}-${file.size}-${file.lastModified}`,
      fileName: file.name,
      title: stripExtension(file.name),
      format,
      selected: true,
      status: 'ready',
      segments: rows,
    }
  }

  function setImportRows(rows: ImportedSegment[]) {
    setImportedSegments(rows)
    setImportDrafts(prev => prev.map((draft, i) => i === activeImportIndex ? { ...draft, segments: rows } : draft))
    setSourceText(rows.map(row => row.source).join('\n'))
    setTargetText(rows.map(row => row.target).filter(Boolean).join('\n'))
  }

  function updateImportRow(index: number, patch: Partial<ImportedSegment>) {
    if (!importedSegments) return
    setImportRows(importedSegments.map((row, i) => i === index ? { ...row, ...patch } : row))
  }

  function updateManualSegment(index: number, patch: Partial<ImportedSegment>) {
    setManualSegments(prev => prev.map((row, i) => i === index ? { ...row, ...patch } : row))
  }

  function addManualSegment() {
    setManualSegments(prev => [...prev, { source: '', target: '' }])
  }

  function deleteManualSegment(index: number) {
    setManualSegments(prev => {
      if (prev.length <= 1) return [{ source: '', target: '' }]
      return prev.filter((_, i) => i !== index)
    })
  }

  function moveImportTarget(index: number, direction: -1 | 1) {
    if (!importedSegments) return
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= importedSegments.length) return
    const next = importedSegments.map(row => ({ ...row }))
    const currentTarget = next[index].target
    next[index].target = next[targetIndex].target
    next[targetIndex].target = currentTarget
    setImportRows(next)
  }

  function insertEmptyTarget(index: number) {
    if (!importedSegments) return
    const targets = importedSegments.map(row => row.target)
    targets.splice(index, 0, '')
    setImportRows(importedSegments.map((row, i) => ({ ...row, target: targets[i] ?? '' })))
  }

  function mergeNextTarget(index: number) {
    if (!importedSegments || index >= importedSegments.length - 1) return
    const next = importedSegments.map(row => ({ ...row }))
    const merged = [next[index].target, next[index + 1].target].map(s => s.trim()).filter(Boolean).join('\n')
    next[index].target = merged
    next[index + 1].target = ''
    setImportRows(next)
  }

  function deleteImportRow(index: number) {
    if (!importedSegments) return
    if (importedSegments.length <= 1) { alert('至少需要保留一个句段'); return }
    setImportRows(importedSegments.filter((_, i) => i !== index))
  }

  function setActiveImportDraft(index: number) {
    setActiveImportIndex(index)
    setImportedSegments(importDrafts[index]?.segments ?? null)
  }

  function updateImportDraft(index: number, patch: Partial<ImportDraft>) {
    setImportDrafts(prev => prev.map((draft, i) => i === index ? { ...draft, ...patch } : draft))
  }

  function openBatchImport() {
    openImportModal()
    setImportMode('multiple')
  }

  function toggleImportRow(index: number, checked: boolean) {
    if (!importedSegments) return
    updateImportRow(index, { selected: checked })
  }

  function swapImportRow(index: number) {
    if (!importedSegments) return
    const row = importedSegments[index]
    updateImportRow(index, { source: row.target, target: row.source })
  }

  async function createImportedDocuments() {
    const drafts = importMode === 'multiple'
      ? importDrafts.filter(d => d.selected && d.status === 'ready')
      : importDrafts.slice(0, 1).filter(d => d.status === 'ready')
    if (drafts.length === 0) { alert('请先上传并勾选要导入的文档'); return }

    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    let created = 0
    for (const draft of drafts) {
      const rows = draft.segments.filter(row => row.selected !== false && row.source.trim())
      if (rows.length === 0) continue
      const docTitle = (draft.title || stripExtension(draft.fileName)).trim()
      const source = rows.map(row => row.source).join('\n')
      const { data, error } = await supabase.from('documents')
        .insert({ title: docTitle, source_text: source, project_id: projectId, source_language: sourceLang, target_language: targetLang, created_by: user?.id })
        .select().single()
      if (error || !data) { alert(`创建 ${docTitle} 失败：${error?.message ?? '未知错误'}`); continue }
      const segRows = rows.map((row, i) => ({
        document_id: data.id,
        position: i,
        source: row.source,
        target: row.target,
        status: row.target.trim() ? 'draft' : 'untranslated',
      }))
      const { error: segErr } = await supabase.from('segments').insert(segRows)
      if (segErr) alert(`写入 ${docTitle} 句段失败：${segErr.message}`)
      else created++
    }
    setLoading(false)
    if (created === 0) return
    setShowModal(false)
    setImportedSegments(null)
    setImportDrafts([])
    setImportMode(null)
    if (userId) await loadAll(userId)
    alert(`已导入 ${created} 个文档。`)
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
    // 只更新任务设置。任务聊天记录绑定在 project_id 上，不能在设置更新时删除或重建。
    const { error } = await supabase.from('documents').update({ title: editTitle, source_language: editSrc, target_language: editTgt }).eq('id', editingDoc.id)
    setEditSaving(false)
    if (error) { alert('保存失败：' + error.message); return }
    if (userId) { setEditingDoc(null); await loadAll(userId) }
  }
  async function confirmDelete() {
    if (!deletingDoc) return
    setDeleteBusy(true)
    // 真正删除整个项目/任务时，chat_messages.project_id 的外键会级联删除该任务聊天记录。
    const { error } = await supabase.from('documents').delete().eq('id', deletingDoc.id)
    setDeleteBusy(false)
    if (error) { alert('删除失败：' + error.message); return }
    if (userId) { setDeletingDoc(null); await loadAll(userId) }
  }

  const langPair = (() => {
    const d = documents[0]
    if (!d) return null
    return `${langNames[d.source_language] ?? d.source_language} → ${langNames[d.target_language] ?? d.target_language}`
  })()

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
                  onClick={() => router.push(`/projects/${projectId}/search`)}
                  leftIcon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
                    </svg>
                  }>
                  项目搜索
                </Button>
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
                <Button size="sm" variant="secondary" onClick={openBatchImport}>
                  批量新建文档
                </Button>
                <Button size="sm" variant="brand" onClick={openCreateModal} leftIcon={<span className="text-base leading-none">+</span>}>
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
                  onPrefetchDoc={(id) => {
                    router.prefetch(`/documents/${id}`)
                    router.prefetch(`/documents/${id}/parallel`)
                  }}
                  onEdit={openEdit}
                  onDelete={(d) => { setDeletingDoc(d); setMenuOpenForDoc(null) }}
                  menuOpenForDoc={menuOpenForDoc}
                  setMenuOpenForDoc={setMenuOpenForDoc}
                  onCreate={openCreateModal}
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
              <div style={{ marginTop: 32 }}>
                <TranslationStatsCard stats={translationStats} />
                <div style={{ marginTop: 32 }}>
                  <ReviewStatsCard stats={reviewStats} />
                </div>
              </div>
            </aside>
          </div>
        </MainContent>
        </div>
      </main>

      <ChatPanel projectId={projectId} currentUserId={userId} open={chatOpen} onClose={() => setChatOpen(false)} onUnreadChange={setUnread} />

      {/* 新建/批量新建文档 modal */}
      {showModal && (
        <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-5xl shadow-[var(--shadow-modal)] max-h-[90vh] overflow-y-auto" style={{ padding: '48px' }}>
            <h3 className="font-serif text-2xl text-ink-900 mb-2 tracking-tight">{modalMode === 'import' ? '批量新建文档' : '新建翻译文档'}</h3>
            <p className="text-ink-600 text-sm mb-7">
              {modalMode === 'import' ? '上传一个或多个 Word / Excel 文件，解析后先预览确认，再批量创建文档。' : '可粘贴原文；如已有译文也可一同导入，系统会以原文句段为准对齐。'}
            </p>
            <form onSubmit={createDocument} className="space-y-5">
              {modalMode === 'create' && (
                <Input label="文档标题" value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：第一章" required />
              )}
              <div className="grid grid-cols-2 gap-3">
                <Select label="原文语言" value={sourceLang} onChange={e => { setSourceLang(e.target.value); setImportedSegments(null) }}>
                  {Object.entries(langNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
                <Select label="目标语言" value={targetLang} onChange={e => { setTargetLang(e.target.value); setImportedSegments(null) }}>
                  {Object.entries(langNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </div>
              {modalMode === 'create' && (
                <div className="rounded-2xl border border-line bg-canvas/40 px-4 py-4">
                  <p className="text-sm font-medium text-ink-900">录入方式</p>
                  <p className="text-xs text-ink-500 mt-1 leading-relaxed">
                    可继续使用自动分句，也可以逐句手动录入，适合需要精确控制句段边界的文档。
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-white p-1 border border-line">
                    <button
                      type="button"
                      onClick={() => { setCreateInputMode('paste'); setImportedSegments(null); setImportHint('') }}
                      className={cn(
                        'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                        createInputMode === 'paste' ? 'bg-ink-900 text-white shadow-sm' : 'text-ink-600 hover:bg-canvas'
                      )}
                    >
                      粘贴自动分句
                    </button>
                    <button
                      type="button"
                      onClick={() => { setCreateInputMode('manual'); setImportedSegments(null); setImportHint('') }}
                      className={cn(
                        'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                        createInputMode === 'manual' ? 'bg-ink-900 text-white shadow-sm' : 'text-ink-600 hover:bg-canvas'
                      )}
                    >
                      手动分句
                    </button>
                  </div>
                </div>
              )}
              {modalMode === 'import' && !importMode && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button type="button" onClick={() => { setImportMode('single'); setImportDrafts([]); setImportedSegments(null) }}
                    className="rounded-2xl border border-line bg-canvas/40 hover:border-brand/50 text-left px-5 py-5 transition-colors">
                    <p className="text-base font-medium text-ink-900">单个文档导入</p>
                    <p className="text-sm text-ink-500 mt-2 leading-relaxed">上传一个 .docx 或 .xlsx，直接进入句段级预览。</p>
                  </button>
                  <button type="button" onClick={() => { setImportMode('multiple'); setImportDrafts([]); setImportedSegments(null) }}
                    className="rounded-2xl border border-line bg-canvas/40 hover:border-brand/50 text-left px-5 py-5 transition-colors">
                    <p className="text-base font-medium text-ink-900">多个文档导入</p>
                    <p className="text-sm text-ink-500 mt-2 leading-relaxed">一次上传多个文件，先看文件级预览，再逐个查看句段。</p>
                  </button>
                </div>
              )}
              {modalMode === 'import' && importMode && (
                <div className="rounded-2xl border border-dashed border-line bg-canvas/40 px-4 py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-900">{importMode === 'single' ? '上传单个文档' : '上传多个文档'}</p>
                      <p className="text-xs text-ink-500 mt-1 leading-relaxed">
                        支持中英交替段落和表格双栏。上传后只进入预览，不会直接创建文档。
                      </p>
                    </div>
                    <input
                      type="file"
                      accept=".docx,.xlsx,.xls"
                      multiple={importMode === 'multiple'}
                      disabled={importingFile}
                      className="block text-sm text-ink-700 file:mr-3 file:rounded-xl file:border file:border-brand file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand hover:file:bg-brand-50 disabled:opacity-50"
                      onChange={e => {
                        const files = Array.from(e.currentTarget.files ?? [])
                        e.currentTarget.value = ''
                        if (files.length === 0) {
                          setImportHint('没有读取到文件，请重新选择。')
                          return
                        }
                        if (importMode === 'multiple') void importMultipleFiles(files)
                        else void importDocumentFile(files[0])
                      }}
                    />
                    {importDrafts.length === 0 && (
                      <Button size="sm" variant="ghost" type="button" onClick={() => { setImportMode(null); setImportDrafts([]); setImportedSegments(null) }}>
                        切换单个/多个
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {modalMode === 'create' && createInputMode === 'paste' && (
              <div className="rounded-2xl border border-dashed border-line bg-canvas/40 px-4 py-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-900">上传 Word / Excel 导入</p>
                    <p className="text-xs text-ink-500 mt-1 leading-relaxed">
                      Word 按段落识别中英对；Excel 按单元格/行识别。上传后会自动填入下方文本框。
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".docx,.xlsx,.xls"
                    disabled={importingFile}
                    className="block text-sm text-ink-700 file:mr-3 file:rounded-xl file:border file:border-brand file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand hover:file:bg-brand-50 disabled:opacity-50"
                    onChange={e => {
                      const file = e.currentTarget.files?.[0]
                      e.currentTarget.value = ''
                      if (file) void importDocumentFile(file)
                      else setImportHint('没有读取到文件，请重新选择。')
                    }}
                  />
                </div>
                {importedSegments && (
                  <div className="mt-3 rounded-xl border border-brand/20 bg-white px-3 py-2">
                    <p className="text-xs text-ink-700">
                      当前进入导入预览：{importedSegments.length} 个原文句段。请先在下方校准译文对齐，再创建文档。
                    </p>
                  </div>
                )}
              </div>
              )}
              {modalMode === 'import' && importMode === 'multiple' && importDrafts.length > 0 && (
                <div className="rounded-2xl border border-line bg-white overflow-hidden">
                  <div className="bg-canvas/60 border-b border-line px-4 py-3">
                    <p className="text-sm font-medium text-ink-900">文件级预览</p>
                  </div>
                  <div className="overflow-x-auto">
                    <div className="grid grid-cols-[48px_180px_180px_110px_80px_80px_80px_96px_104px] min-w-[960px] bg-canvas/40 border-b border-line text-[11px] uppercase tracking-wider text-ink-500 font-medium">
                      {['勾选','文件名','文档名','识别格式','句段数','译文数','警告数','状态','预览'].map(h => <div key={h} className="px-3 py-2">{h}</div>)}
                    </div>
                    {importDrafts.map((draft, idx) => {
                      const warnings = draft.segments.reduce((sum, row) => sum + importWarnings(row, sourceLang, targetLang).length, 0)
                      return (
                        <div key={draft.id} className="grid grid-cols-[48px_180px_180px_110px_80px_80px_80px_96px_104px] min-w-[960px] border-b border-line last:border-b-0 items-center">
                          <div className="px-3 py-3"><input type="checkbox" checked={draft.selected} disabled={draft.status === 'error'} onChange={e => updateImportDraft(idx, { selected: e.target.checked })} /></div>
                          <div className="px-3 py-3 text-xs text-ink-700 truncate" title={draft.fileName}>{draft.fileName}</div>
                          <div className="px-3 py-3">
                            <input value={draft.title} onChange={e => updateImportDraft(idx, { title: e.target.value })}
                              className="w-full rounded-md border border-line px-2 py-1.5 text-xs text-ink-900" />
                          </div>
                          <div className="px-3 py-3 text-xs text-ink-600">{draft.format}</div>
                          <div className="px-3 py-3 text-xs font-mono text-ink-700">{draft.segments.length}</div>
                          <div className="px-3 py-3 text-xs font-mono text-ink-700">{draft.segments.filter(s => s.target.trim()).length}</div>
                          <div className="px-3 py-3 text-xs font-mono text-ink-700">{warnings}</div>
                          <div className="px-3 py-3 text-xs text-ink-600">{draft.status === 'ready' ? '可导入' : draft.error || '错误'}</div>
                          <div className="px-3 py-3">
                            <Button size="sm" variant={activeImportIndex === idx ? 'brand' : 'ghost'} type="button" onClick={() => setActiveImportDraft(idx)} disabled={draft.status === 'error'}>
                              查看预览
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {importedSegments && (
                <div className="rounded-2xl border border-line bg-white overflow-hidden">
                  <div className="flex items-center justify-between gap-3 bg-canvas/60 border-b border-line px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-ink-900">导入预览 / 对齐校准</p>
                      <p className="text-xs text-ink-500 mt-1">以原文行为准。可移动、插空或合并译文，确认后再创建。</p>
                    </div>
                    <Button size="sm" variant="ghost" type="button" onClick={() => setImportRows(importedSegments.filter(row => row.source.trim() || row.target.trim()))}>
                      清理空行
                    </Button>
                  </div>
                  <div className="max-h-[420px] overflow-auto">
                    <div className="grid grid-cols-[48px_56px_minmax(220px,1fr)_minmax(220px,1fr)_72px_150px_220px] gap-0 bg-canvas/40 border-b border-line text-[11px] uppercase tracking-wider text-ink-500 font-medium min-w-[1180px]">
                      <div className="px-3 py-2 text-center">勾选</div>
                      <div className="px-3 py-2 text-center">#</div>
                      <div className="px-3 py-2">原文</div>
                      <div className="px-3 py-2">人工译文</div>
                      <div className="px-3 py-2 text-center">置信度</div>
                      <div className="px-3 py-2">警告</div>
                      <div className="px-3 py-2 text-center">校准</div>
                    </div>
                    {importedSegments.map((row, idx) => {
                      const warnings = importWarnings(row, sourceLang, targetLang)
                      const confidence = importConfidence(row, sourceLang, targetLang)
                      return (
                        <div key={idx} className="grid grid-cols-[48px_56px_minmax(220px,1fr)_minmax(220px,1fr)_72px_150px_220px] gap-0 border-b border-line last:border-b-0 min-w-[1180px]">
                          <div className="px-3 py-3 text-center">
                            <input type="checkbox" checked={row.selected !== false} onChange={e => toggleImportRow(idx, e.target.checked)} />
                          </div>
                          <div className="px-3 py-3 text-center text-[11px] font-mono text-ink-400">
                            {String(idx + 1).padStart(2, '0')}
                          </div>
                          <div className="px-3 py-3">
                            <textarea
                              value={row.source}
                              onChange={e => updateImportRow(idx, { source: e.target.value })}
                              rows={3}
                              className="w-full rounded-lg border border-line bg-canvas/30 px-3 py-2 text-sm text-ink-900 leading-relaxed resize-y"
                            />
                          </div>
                          <div className="px-3 py-3">
                            <textarea
                              value={row.target}
                              onChange={e => updateImportRow(idx, { target: e.target.value })}
                              rows={3}
                              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink-900 leading-relaxed resize-y"
                              placeholder="该原文对应的译文..."
                            />
                          </div>
                          <div className="px-3 py-3 text-center text-xs font-mono text-ink-700">
                            {confidence}%
                          </div>
                          <div className="px-3 py-3">
                            {warnings.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {warnings.map(w => (
                                  <span key={w} className="text-[10px] rounded-full border border-amber-200 bg-amber-50 text-amber-800 px-2 py-0.5">{w}</span>
                                ))}
                              </div>
                            ) : <span className="text-xs text-ink-400">—</span>}
                          </div>
                          <div className="px-3 py-3">
                            <div className="grid grid-cols-2 gap-1.5">
                              <button type="button" onClick={() => swapImportRow(idx)}
                                className="col-span-2 rounded-md border border-line px-2 py-1.5 text-[11px] text-ink-600 hover:bg-canvas">交换原文和译文</button>
                              <button type="button" onClick={() => moveImportTarget(idx, -1)} disabled={idx === 0}
                                className="rounded-md border border-line px-2 py-1.5 text-[11px] text-ink-600 hover:bg-canvas disabled:opacity-40">译文上移</button>
                              <button type="button" onClick={() => moveImportTarget(idx, 1)} disabled={idx === importedSegments.length - 1}
                                className="rounded-md border border-line px-2 py-1.5 text-[11px] text-ink-600 hover:bg-canvas disabled:opacity-40">译文下移</button>
                              <button type="button" onClick={() => insertEmptyTarget(idx)}
                                className="rounded-md border border-line px-2 py-1.5 text-[11px] text-ink-600 hover:bg-canvas">插入空译文</button>
                              <button type="button" onClick={() => mergeNextTarget(idx)} disabled={idx === importedSegments.length - 1}
                                className="rounded-md border border-line px-2 py-1.5 text-[11px] text-ink-600 hover:bg-canvas disabled:opacity-40">合并下一译文</button>
                              <button type="button" onClick={() => deleteImportRow(idx)}
                                className="col-span-2 rounded-md border border-red-100 px-2 py-1.5 text-[11px] text-red-600 hover:bg-red-50">删除本行</button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {modalMode === 'create' && createInputMode === 'manual' && (
                <div className="rounded-2xl border border-line bg-white overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-canvas/60 border-b border-line px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-ink-900">手动分句</p>
                      <p className="text-xs text-ink-500 mt-1">每一行就是一个句段。原文必填，译文可选。</p>
                    </div>
                    <Button size="sm" variant="ghost" type="button" onClick={addManualSegment}>
                      + 增加下一句
                    </Button>
                  </div>
                  <div className="max-h-[430px] overflow-y-auto px-4 py-4 space-y-3">
                    {manualSegments.map((row, idx) => (
                      <div key={idx} className="rounded-2xl border border-line bg-canvas/30 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="inline-flex items-center gap-2">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-white text-xs font-mono">
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            <span className="text-sm font-medium text-ink-900">第 {idx + 1} 句</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => deleteManualSegment(idx)}
                            className="text-xs text-ink-400 hover:text-red-600 disabled:opacity-40"
                            disabled={manualSegments.length <= 1 && !row.source && !row.target}
                          >
                            删除
                          </button>
                        </div>
                        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                          <label className="block">
                            <span className="block text-xs font-medium text-ink-600 mb-1.5">原文 · {langNames[sourceLang]}</span>
                            <textarea
                              value={row.source}
                              onChange={e => updateManualSegment(idx, { source: e.target.value })}
                              rows={3}
                              placeholder={`输入第 ${idx + 1} 句原文`}
                              className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink-900 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                            />
                          </label>
                          <label className="block">
                            <span className="block text-xs font-medium text-ink-600 mb-1.5">译文 · {langNames[targetLang]}（可选）</span>
                            <textarea
                              value={row.target}
                              onChange={e => updateManualSegment(idx, { target: e.target.value })}
                              rows={3}
                              placeholder={`如已有第 ${idx + 1} 句译文，填在这里`}
                              className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink-900 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addManualSegment}
                      className="w-full rounded-2xl border border-dashed border-line bg-canvas/40 px-4 py-3 text-sm font-medium text-ink-600 hover:border-brand/50 hover:text-brand transition-colors"
                    >
                      + 增加下一句
                    </button>
                  </div>
                </div>
              )}
              {modalMode === 'create' && createInputMode === 'paste' && (
              <>
              <Textarea
                label={`原文 · ${langNames[sourceLang]}`}
                value={sourceText}
                onChange={e => { setSourceText(e.target.value); setImportedSegments(null) }}
                onBlur={() => reconcileImport('source')}
                placeholder={`在这里粘贴 ${langNames[sourceLang]} 原文...`}
                rows={6}
                required
              />
              <Textarea
                label={`译文 · ${langNames[targetLang]}（可选）`}
                value={targetText}
                onChange={e => { setTargetText(e.target.value); setImportedSegments(null) }}
                onBlur={() => reconcileImport('target')}
                placeholder={`如已有 ${langNames[targetLang]} 译文，粘贴这里。`}
                rows={6}
              />
              </>
              )}
              {importHint && (
                <p className="text-xs text-brand bg-brand-50 border border-brand/20 rounded-lg px-3 py-2">✓ {importHint}</p>
              )}
              {modalMode === 'create' && createInputMode === 'paste' && (
              <button type="button"
                onClick={() => { const a = sourceText; setSourceText(targetText); setTargetText(a); setImportedSegments(null) }}
                className="text-xs text-brand hover:text-brand-600 font-medium inline-flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                互换原文与译文
              </button>
              )}
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" fullWidth type="button" onClick={() => { setShowModal(false); setCreateInputMode('paste'); setTargetText(''); setImportHint(''); setImportedSegments(null); setImportDrafts([]); setImportMode(null); setManualSegments([{ source: '', target: '' }]) }}>取消</Button>
                <Button variant="primary" fullWidth type="submit" loading={loading}>
                  {loading ? '创建中...' : modalMode === 'import' ? '确认导入' : '创建并开始翻译'}
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

type TranslationStats = {
  totalFiles: number
  completedFiles: number
  fileRate: number
  totalSegments: number
  translatedSegments: number
  untranslatedSegments: number
  segmentRate: number
}

type ReviewStats = {
  totalFiles: number
  reviewedFiles: number
  fileRate: number
  reviewedSegments: number
  modifiedSegments: number
  modifiedRate: number
  issueTotal: number
  issueCounts: Record<string, number>
}

function StatsShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <Card padding="none" className="overflow-hidden bg-gradient-to-b from-white to-canvas/30">
      <div className="border-b border-line bg-white/80" style={{ padding: '22px 24px 18px' }}>
        <Eyebrow tone="muted" className="mb-1.5">{eyebrow}</Eyebrow>
        <h3 className="font-serif text-lg text-ink-900 leading-tight">{title}</h3>
      </div>
      <div style={{ padding: '20px 24px 24px' }}>
        {children}
      </div>
    </Card>
  )
}

function StatsHero({ label, value, tone = 'brand' }: { label: string; value: string | number; tone?: 'brand' | 'blue' }) {
  return (
    <div className={cn(
      'rounded-2xl border flex min-h-[86px] flex-col justify-center',
      tone === 'brand' ? 'border-brand/20 bg-brand-50/60' : 'border-blue-100 bg-blue-50/60'
    )}
      style={{ padding: '14px 18px' }}>
      <p className="text-[11px] text-ink-500 leading-5 mb-1.5">{label}</p>
      <p className="font-serif text-[30px] text-ink-900 leading-none">{value}</p>
    </div>
  )
}

const statsStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const statsRowStyle: React.CSSProperties = {
  minHeight: 46,
  padding: '12px 18px',
}

const issueRowStyle: React.CSSProperties = {
  minHeight: 40,
}

const issueSectionStyle: React.CSSProperties = {
  marginTop: 30,
}

function StatLine({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={cn(
      'flex w-full items-center justify-between gap-5 rounded-lg border',
      accent
        ? 'bg-white border-line shadow-[0_1px_2px_rgba(31,30,29,0.04)]'
        : 'bg-white/60 border-line/70'
    )} style={statsRowStyle}>
      <span className="text-xs text-ink-500 truncate">{label}</span>
      <span className="text-sm font-mono text-ink-900 shrink-0">{value}</span>
    </div>
  )
}

function StatLineStack({ children }: { children: React.ReactNode }) {
  return (
    <div style={statsStackStyle}>
      {children}
    </div>
  )
}

function TranslationStatsCard({ stats }: { stats: TranslationStats }) {
  return (
    <StatsShell eyebrow="TRANSLATION STATS" title="翻译统计">
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatsHero label="文件完成率" value={`${stats.fileRate}%`} />
        <StatsHero label="条目完成率" value={`${stats.segmentRate}%`} />
      </div>
      <StatLineStack>
        <StatLine label="总文件数" value={stats.totalFiles} />
        <StatLine label="已完成翻译文件数" value={stats.completedFiles} />
        <StatLine label="文件翻译完成率" value={`${stats.fileRate}%`} accent />
        <StatLine label="总条目数" value={stats.totalSegments} />
        <StatLine label="已翻译条目数" value={stats.translatedSegments} />
        <StatLine label="条目翻译完成率" value={`${stats.segmentRate}%`} accent />
      </StatLineStack>
    </StatsShell>
  )
}

function ReviewStatsCard({ stats }: { stats: ReviewStats }) {
  const hasIssues = stats.issueTotal > 0
  return (
    <StatsShell eyebrow="REVIEW STATS" title="审校统计">
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatsHero label="文件审校率" value={`${stats.fileRate}%`} tone="blue" />
        <StatsHero label="修改占比" value={`${stats.modifiedRate}%`} tone="blue" />
      </div>
      <StatLineStack>
        <StatLine label="总文件数" value={stats.totalFiles} />
        <StatLine label="已审校文件数" value={stats.reviewedFiles} />
        <StatLine label="已审校文件占比" value={`${stats.fileRate}%`} accent />
        <StatLine label="已审校条目数" value={stats.reviewedSegments} />
        <StatLine label="修改条目数" value={stats.modifiedSegments} />
        <StatLine label="修改条目占比" value={`${stats.modifiedRate}%`} accent />
        <StatLine label="问题记录数" value={stats.issueTotal} />
      </StatLineStack>

      <div style={issueSectionStyle}>
        <p className="text-xs font-medium text-ink-700 text-center" style={{ marginBottom: 10 }}>问题类型统计</p>
        {hasIssues ? (
          <div className="flex flex-col rounded-xl border border-line bg-white/50" style={{ gap: 10, padding: 10 }}>
            <div className="grid grid-cols-[minmax(0,1fr)_48px_52px] rounded-lg bg-canvas/60 text-[11px] text-ink-500">
              <div className="truncate" style={{ padding: '10px 18px' }}>问题类型</div>
              <div className="text-right" style={{ padding: '10px 10px' }}>数量</div>
              <div className="text-right" style={{ padding: '10px 10px' }}>占比</div>
            </div>
            {REVIEW_ISSUE_TYPES.map(type => {
              const count = stats.issueCounts[type] ?? 0
              return (
                <div key={type} className="grid grid-cols-[minmax(0,1fr)_48px_52px] rounded-lg border border-line/70 bg-white text-xs" style={issueRowStyle}>
                  <div className="text-ink-700 truncate" style={{ padding: '10px 18px' }}>{type}</div>
                  <div className="text-right font-mono text-ink-900" style={{ padding: '10px 10px' }}>{count}</div>
                  <div className="text-right font-mono text-ink-600" style={{ padding: '10px 10px' }}>{percent(count, stats.issueTotal)}%</div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-canvas/40 px-4 py-3 text-xs text-ink-500">
            暂无问题类型记录
          </div>
        )}
      </div>
    </StatsShell>
  )
}

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
  onPrefetchDoc: (id: string) => void
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
                onMouseEnter={() => p.onPrefetchDoc(d.id)}
                onFocus={() => p.onPrefetchDoc(d.id)}
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
  const gridCols = 'minmax(300px,2fr) 96px 96px 148px 118px minmax(120px,0.8fr) 156px'
  const cellPad = { paddingLeft: 16, paddingRight: 16 }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
      <div className="grid bg-canvas/60 border-b border-line text-[11px] uppercase tracking-wider text-ink-500 font-medium min-w-[1120px]"
        style={{ gridTemplateColumns: gridCols, paddingTop: 14, paddingBottom: 14 }}>
        <div style={cellPad}>实验 · 关联文档</div>
        <div className="text-center" style={cellPad}>模型</div>
        <div className="text-center" style={cellPad}>Prompt</div>
        <div className="text-center" style={cellPad}>Temperature</div>
        <div className="text-center" style={cellPad}>状态</div>
        <div style={cellPad}>创建者</div>
        <div className="text-right" style={cellPad}>操作</div>
      </div>
      {experiments.map((e, i) => (
        <div key={e.docId}
          className={cn('grid items-center min-w-[1120px] hover:bg-canvas/35 transition-colors', i > 0 && 'border-t border-line')}
          style={{ gridTemplateColumns: gridCols, paddingTop: 18, paddingBottom: 18 }}>
          <div className="min-w-0" style={cellPad}>
            <p className="font-serif text-[15px] text-ink-900 tracking-tight leading-tight break-words">{e.docTitle} · 多模型对比</p>
            <p className="text-[11px] text-ink-500 mt-1 font-mono">
              {e.createdAt ? new Date(e.createdAt).toLocaleDateString('zh-CN') : '—'}
            </p>
          </div>
          <div className="text-center text-sm text-ink-700 font-mono" style={cellPad}>{e.modelCount}</div>
          <div className="text-center text-sm text-ink-700 font-mono" style={cellPad}>{e.promptCount}</div>
          <div className="text-center text-sm text-ink-700 font-mono whitespace-nowrap" style={cellPad}>{e.tempRange}</div>
          <div className="text-center" style={cellPad}>
            <span className={cn('inline-flex items-center justify-center text-[10px] font-medium px-2.5 py-1 rounded-full uppercase tracking-wider border whitespace-nowrap', statusMeta[e.status].cls)}>
              {statusMeta[e.status].label}
            </span>
          </div>
          <div className="text-xs text-ink-700 truncate" style={cellPad}>{e.ownerName}</div>
          <div className="flex items-center justify-end gap-2" style={cellPad}>
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
      </div>
    </Card>
  )
}
