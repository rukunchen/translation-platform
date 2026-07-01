'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Textarea } from '@/components/ui/Input'
import { MainContent } from '@/components/ui/MainContent'
import { PageHeader } from '@/components/ui/PageHeader'
import { cn } from '@/components/ui/cn'
import { supabase } from '@/lib/supabase'

type FrontierLiteratureRow = {
  id: string
  user_id: string | null
  seed_source_id: string | null
  title: string
  authors: string | null
  year: number | null
  source: string | null
  region: string | null
  field: string | null
  method_summary: string | null
  conclusion_summary: string | null
  abstract: string | null
  doi: string | null
  url: string | null
  tags: string[] | null
  research_question: string | null
  limitation_summary: string | null
  significance_summary: string | null
  literature_review_sentence: string | null
}

type FrontierReadingSessionRow = {
  id: string
  user_id: string
  title: string | null
  description: string | null
  selected_item_ids: string[] | null
  created_at: string | null
  updated_at: string | null
}

type FrontierPaper = {
  id: string
  legacyItemId?: string
  title: string
  authors: string
  year: number | null
  source: string
  region: string
  field: string
  method: string
  finding: string
  abstract: string
  doi: string
  link: string
  keywords: string[]
  researchQuestion: string
  limitationSummary: string
  significanceSummary: string
  literatureReviewSentence: string
}

type FrontierReadingNoteRow = {
  id: string
  user_id: string
  session_id: string | null
  item_id: string | null
  user_note: string | null
  method_note: string | null
  conclusion_note: string | null
  critique_note: string | null
  literature_review_use: string | null
}

type ReadingArticleRow = {
  id: string
}

type WritingProjectOption = {
  id: string
  title: string
  language: string | null
  paper_type: string | null
  updated_at: string | null
}

type NoteFormState = {
  user_note: string
  method_note: string
  conclusion_note: string
  critique_note: string
  literature_review_use: string
}

type NoteSaveStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error'

const FRONTIER_SELECT = 'id,user_id,seed_source_id,title,authors,year,source,region,field,method_summary,conclusion_summary,abstract,doi,url,tags,research_question,limitation_summary,significance_summary,literature_review_sentence'
const SESSION_SELECT = 'id,user_id,title,description,selected_item_ids,created_at,updated_at'
const NOTE_SELECT = 'id,user_id,session_id,item_id,user_note,method_note,conclusion_note,critique_note,literature_review_use'
const WRITING_PROJECT_SELECT = 'id,title,language,paper_type,updated_at'

const EMPTY_NOTE: NoteFormState = {
  user_note: '',
  method_note: '',
  conclusion_note: '',
  critique_note: '',
  literature_review_use: '',
}

function rowToPaper(row: FrontierLiteratureRow): FrontierPaper {
  return {
    id: row.id,
    title: row.title,
    authors: row.authors || '未记录作者',
    year: row.year,
    source: row.source || '未记录来源',
    region: row.region || '未记录地区',
    field: row.field || '未记录领域',
    method: row.method_summary || '未记录',
    finding: row.conclusion_summary || '未记录',
    abstract: row.abstract || '暂无摘要。',
    doi: row.doi || '',
    link: row.url || '',
    keywords: row.tags || [],
    researchQuestion: row.research_question || '',
    limitationSummary: row.limitation_summary || '',
    significanceSummary: row.significance_summary || '',
    literatureReviewSentence: row.literature_review_sentence || '',
  }
}

function noteRowToForm(row: FrontierReadingNoteRow | null): NoteFormState {
  return {
    user_note: row?.user_note || '',
    method_note: row?.method_note || '',
    conclusion_note: row?.conclusion_note || '',
    critique_note: row?.critique_note || '',
    literature_review_use: row?.literature_review_use || '',
  }
}

function noteHasContent(note: NoteFormState) {
  return Object.values(note).some(value => value.trim())
}

function paperExternalUrl(paper: FrontierPaper) {
  if (paper.link) return paper.link
  if (!paper.doi) return ''
  if (/^https?:\/\//i.test(paper.doi)) return paper.doi
  return `https://doi.org/${paper.doi.replace(/^doi:\s*/i, '').trim()}`
}

function formatDateTime(value: string | null) {
  if (!value) return '未记录'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function FrontierReadingSessionPage() {
  const params = useParams<{ sessionId: string }>()
  const router = useRouter()
  const sessionId = params.sessionId
  const [session, setSession] = useState<FrontierReadingSessionRow | null>(null)
  const [papers, setPapers] = useState<FrontierPaper[]>([])
  const [activePaperId, setActivePaperId] = useState<string | null>(null)
  const [userId, setUserId] = useState('')
  const [noteId, setNoteId] = useState<string | null>(null)
  const [noteForm, setNoteForm] = useState<NoteFormState>(EMPTY_NOTE)
  const [noteStatus, setNoteStatus] = useState<NoteSaveStatus>('idle')
  const [noteError, setNoteError] = useState('')
  const [readingRoomAddingId, setReadingRoomAddingId] = useState<string | null>(null)
  const [writingProjects, setWritingProjects] = useState<WritingProjectOption[]>([])
  const [writingMaterialPaper, setWritingMaterialPaper] = useState<FrontierPaper | null>(null)
  const [selectedWritingProjectId, setSelectedWritingProjectId] = useState('')
  const [writingProjectsLoading, setWritingProjectsLoading] = useState(false)
  const [writingMaterialSaving, setWritingMaterialSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const noteIdRef = useRef<string | null>(null)
  const noteFormRef = useRef<NoteFormState>(EMPTY_NOTE)
  const noteDirtyRef = useRef(false)
  const noteLoadingRef = useRef(false)
  const noteSaveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    noteFormRef.current = noteForm
  }, [noteForm])

  useEffect(() => {
    noteIdRef.current = noteId
  }, [noteId])

  const loadSession = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      setError('请先登录后再查看阅读会话。')
      setLoading(false)
      return
    }
    setUserId(userData.user.id)

    const { data: sessionData, error: sessionError } = await supabase
      .from('frontier_reading_sessions')
      .select(SESSION_SELECT)
      .eq('id', sessionId)
      .eq('user_id', userData.user.id)
      .maybeSingle()

    if (sessionError) {
      setError(sessionError.message || '阅读会话加载失败。')
      setLoading(false)
      return
    }
    if (!sessionData) {
      setError('阅读会话不存在或无权访问。')
      setLoading(false)
      return
    }

    const itemIds = ((sessionData.selected_item_ids || []) as string[]).filter(Boolean)
    if (itemIds.length === 0) {
      setSession(sessionData as FrontierReadingSessionRow)
      setPapers([])
      setActivePaperId(null)
      setLoading(false)
      return
    }

    const { data: itemData, error: itemError } = await supabase
      .from('frontier_literature_items')
      .select(FRONTIER_SELECT)
      .eq('user_id', userData.user.id)
      .or(`id.in.(${itemIds.join(',')}),seed_source_id.in.(${itemIds.join(',')})`)

    if (itemError) {
      setError(itemError.message || '会话文献加载失败。')
      setLoading(false)
      return
    }

    const rows = (itemData || []) as FrontierLiteratureRow[]
    const byId = new Map(rows.map(item => [item.id, rowToPaper(item)]))
    const bySeedSourceId = new Map(rows
      .filter(item => item.seed_source_id)
      .map(item => [item.seed_source_id as string, item])
    )
    const orderedPapers = itemIds
      .map(itemId => {
        const directPaper = byId.get(itemId)
        if (directPaper) return directPaper

        const copiedSeedRow = bySeedSourceId.get(itemId)
        return copiedSeedRow ? { ...rowToPaper(copiedSeedRow), legacyItemId: itemId } : null
      })
      .filter((paper): paper is FrontierPaper => Boolean(paper))

    setSession(sessionData as FrontierReadingSessionRow)
    setPapers(orderedPapers)
    setActivePaperId(orderedPapers[0]?.id || null)
    setLoading(false)
  }, [sessionId])

  const saveCurrentNote = useCallback(async (options?: {
    form?: NoteFormState
    paperId?: string | null
    currentNoteId?: string | null
  }) => {
    const form = options?.form || noteFormRef.current
    const paperId = options?.paperId ?? activePaperId
    const currentNoteId = options?.currentNoteId ?? noteIdRef.current

    if (!userId || !paperId) return
    if (!currentNoteId && !noteHasContent(form)) {
      noteDirtyRef.current = false
      setNoteStatus('idle')
      return
    }

    setNoteStatus('saving')
    setNoteError('')

    const payload = {
      user_note: form.user_note.trim() || null,
      method_note: form.method_note.trim() || null,
      conclusion_note: form.conclusion_note.trim() || null,
      critique_note: form.critique_note.trim() || null,
      literature_review_use: form.literature_review_use.trim() || null,
    }

    const result = currentNoteId
      ? await supabase
        .from('frontier_reading_notes')
        .update(payload)
        .eq('id', currentNoteId)
        .select(NOTE_SELECT)
        .single()
      : await supabase
        .from('frontier_reading_notes')
        .insert({
          user_id: userId,
          session_id: sessionId,
          item_id: paperId,
          ...payload,
        })
        .select(NOTE_SELECT)
        .single()

    if (result.error || !result.data) {
      setNoteStatus('error')
      setNoteError(result.error?.message || '保存失败，请稍后再试。')
      return
    }

    const savedNote = result.data as FrontierReadingNoteRow
    noteIdRef.current = savedNote.id
    setNoteId(savedNote.id)
    if (noteFormRef.current === form) {
      noteDirtyRef.current = false
      setNoteStatus('saved')
    }
  }, [activePaperId, sessionId, userId])

  const flushCurrentNote = useCallback(async () => {
    if (noteSaveTimerRef.current) {
      window.clearTimeout(noteSaveTimerRef.current)
      noteSaveTimerRef.current = null
    }
    if (noteDirtyRef.current) await saveCurrentNote()
  }, [saveCurrentNote])

  const loadNote = useCallback(async (paperId: string, legacyItemId?: string) => {
    if (!userId) return

    if (noteSaveTimerRef.current) {
      window.clearTimeout(noteSaveTimerRef.current)
      noteSaveTimerRef.current = null
    }

    noteLoadingRef.current = true
    noteDirtyRef.current = false
    setNoteStatus('loading')
    setNoteError('')

    const noteItemIds = legacyItemId && legacyItemId !== paperId
      ? [paperId, legacyItemId]
      : [paperId]
    const { data, error: noteLoadError } = await supabase
      .from('frontier_reading_notes')
      .select(NOTE_SELECT)
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .in('item_id', noteItemIds)

    if (noteLoadError) {
      setNoteStatus('error')
      setNoteError(noteLoadError.message || '笔记加载失败。')
      noteLoadingRef.current = false
      return
    }

    const rows = (data || []) as FrontierReadingNoteRow[]
    const row = rows.find(item => item.item_id === paperId) || rows[0] || null
    noteIdRef.current = row?.id || null
    setNoteId(row?.id || null)
    setNoteForm(noteRowToForm(row))
    setNoteStatus(row ? 'saved' : 'idle')
    noteLoadingRef.current = false
  }, [sessionId, userId])

  const scheduleNoteSave = useCallback((nextNote: NoteFormState) => {
    if (noteLoadingRef.current) return
    if (noteSaveTimerRef.current) window.clearTimeout(noteSaveTimerRef.current)

    noteDirtyRef.current = true
    setNoteStatus('idle')
    setNoteError('')
    noteSaveTimerRef.current = window.setTimeout(() => {
      noteSaveTimerRef.current = null
      void saveCurrentNote({ form: nextNote })
    }, 800)
  }, [saveCurrentNote])

  const updateNoteField = (field: keyof NoteFormState, value: string) => {
    setNoteForm(current => {
      const next = { ...current, [field]: value }
      noteFormRef.current = next
      scheduleNoteSave(next)
      return next
    })
  }

  const selectPaper = async (paperId: string) => {
    if (paperId === activePaperId) return
    await flushCurrentNote()
    setActivePaperId(paperId)
  }

  const addToReadingRoom = async (paper: FrontierPaper) => {
    if (!userId) {
      setError('请先登录后再加入精读室。')
      return
    }

    await flushCurrentNote()
    setReadingRoomAddingId(paper.id)
    setError('')

    const { data: existingRows, error: existingError } = await supabase
      .from('reading_articles')
      .select('id')
      .eq('user_id', userId)
      .eq('source_type', 'frontier_literature')
      .eq('title', paper.title)
      .eq('source', paper.source)
      .limit(1)

    if (existingError) {
      setError(existingError.message || '检查精读室重复文章失败。')
      setReadingRoomAddingId(null)
      return
    }

    const existingArticle = (existingRows || [])[0] as ReadingArticleRow | undefined
    if (existingArticle) {
      setReadingRoomAddingId(null)
      router.push('/reading')
      return
    }

    const { error: insertError } = await supabase
      .from('reading_articles')
      .insert({
        user_id: userId,
        title: paper.title,
        source: paper.source,
        source_type: 'frontier_literature',
        clean_text: paper.abstract || '',
        structured_blocks: null,
      })

    setReadingRoomAddingId(null)

    if (insertError) {
      setError(insertError.message || '加入精读室失败。')
      return
    }

    router.push('/reading')
  }

  const openWritingMaterialModal = async (paper: FrontierPaper) => {
    if (!userId) {
      setError('请先登录后再加入论文写作素材。')
      return
    }

    await flushCurrentNote()
    setWritingMaterialPaper(paper)
    setError('')
    setNotice('')
    setWritingProjectsLoading(true)

    const { data, error: projectError } = await supabase
      .from('writing_projects')
      .select(WRITING_PROJECT_SELECT)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    setWritingProjectsLoading(false)
    if (projectError) {
      setWritingProjects([])
      setSelectedWritingProjectId('')
      setError(projectError.message || '论文项目加载失败。')
      return
    }

    const nextProjects = (data || []) as WritingProjectOption[]
    setWritingProjects(nextProjects)
    setSelectedWritingProjectId(nextProjects[0]?.id || '')
  }

  const addToWritingMaterials = async () => {
    const paper = writingMaterialPaper
    if (!paper || !selectedWritingProjectId || !userId) return

    setWritingMaterialSaving(true)
    setError('')
    setNotice('')

    const { data: existingRows, error: existingError } = await supabase
      .from('writing_literature_sources')
      .select('id')
      .eq('writing_project_id', selectedWritingProjectId)
      .eq('frontier_item_id', paper.id)
      .limit(1)

    if (existingError) {
      setWritingMaterialSaving(false)
      setError(existingError.message || '检查重复素材失败。')
      return
    }

    if ((existingRows || []).length > 0) {
      setWritingMaterialSaving(false)
      setWritingMaterialPaper(null)
      setNotice('该文献已在所选论文项目的写作素材中。')
      return
    }

    const { error: insertError } = await supabase
      .from('writing_literature_sources')
      .insert({
        user_id: userId,
        writing_project_id: selectedWritingProjectId,
        frontier_item_id: paper.id,
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        source: paper.source,
        doi: paper.doi || null,
        url: paper.link || null,
        field: paper.field,
        method_summary: paper.method,
        conclusion_summary: paper.finding,
        limitation_summary: paper.limitationSummary || null,
        literature_review_sentence: paper.literatureReviewSentence || null,
        user_note: null,
      })

    setWritingMaterialSaving(false)
    if (insertError) {
      setError(insertError.message || '加入论文写作素材失败。')
      return
    }

    setWritingMaterialPaper(null)
    setNotice('已加入论文写作素材。')
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadSession() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadSession])

  useEffect(() => {
    if (!activePaperId || !userId) return
    const notePaper = papers.find(paper => paper.id === activePaperId)
    const timer = window.setTimeout(() => { void loadNote(activePaperId, notePaper?.legacyItemId) }, 0)
    return () => window.clearTimeout(timer)
  }, [activePaperId, loadNote, papers, userId])

  useEffect(() => {
    return () => {
      if (noteSaveTimerRef.current) window.clearTimeout(noteSaveTimerRef.current)
    }
  }, [])

  const activePaper = useMemo(() => (
    papers.find(paper => paper.id === activePaperId) || papers[0] || null
  ), [activePaperId, papers])

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="min-h-[calc(100vh-40px)] rounded-2xl border border-line bg-white">
          <MainContent size="full" className="!px-6 sm:!px-10 xl:!px-14">
            <PageHeader
              eyebrow="Frontier Reading"
              title={session?.title || '前沿文献阅读'}
              description={session?.description || '按会话保存的前沿文献阅读列表。'}
              actions={
                <Button
                  variant="secondary"
                  onClick={() => { void flushCurrentNote().then(() => router.push('/frontier')) }}
                >
                  返回前沿文献
                </Button>
              }
            />

            {error && (
              <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {notice && (
              <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {notice}
              </div>
            )}

            {loading ? (
              <Card padding="lg" variant="surface" className="text-center">
                <p className="text-sm text-ink-500">正在加载阅读会话...</p>
              </Card>
            ) : !session ? (
              <Card padding="lg" variant="surface" className="text-center">
                <h2 className="font-serif text-xl text-ink-900">无法打开阅读会话</h2>
                <p className="mt-3 text-sm text-ink-500">返回前沿文献后重新选择会话。</p>
              </Card>
            ) : papers.length === 0 ? (
              <Card padding="lg" variant="surface" className="text-center">
                <h2 className="font-serif text-xl text-ink-900">会话内暂无文献</h2>
                <p className="mt-3 text-sm text-ink-500">该阅读会话没有可显示的文献。</p>
              </Card>
            ) : (
              <section className="grid grid-cols-1 gap-6 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
                <Card padding="none" className="h-fit overflow-hidden">
                  <div className="border-b border-line bg-surface" style={{ padding: '18px 20px' }}>
                    <Eyebrow tone="muted">Session Papers</Eyebrow>
                    <h2 className="mt-1 font-serif text-xl text-ink-900">会话文献</h2>
                    <p className="mt-2 text-xs text-ink-500">
                      {papers.length} 篇 · 创建 {formatDateTime(session.created_at)} · 更新 {formatDateTime(session.updated_at)}
                    </p>
                  </div>
                  <div className="divide-y divide-line">
                    {papers.map(paper => (
                      <button
                        key={paper.id}
                        type="button"
                        onClick={() => { void selectPaper(paper.id) }}
                        className={cn(
                          'block w-full text-left transition-colors',
                          activePaper?.id === paper.id ? 'bg-brand-50/70' : 'bg-white hover:bg-canvas'
                        )}
                        style={{ padding: '16px 18px' }}
                      >
                        <p className="line-clamp-2 text-sm font-medium leading-relaxed text-ink-900">{paper.title}</p>
                        <p className="mt-2 text-xs text-ink-500">{paper.authors} · {paper.year || '年份未录'}</p>
                      </button>
                    ))}
                  </div>
                </Card>

                {activePaper && (
                  <>
                    <Card padding="lg" className="h-fit">
                      <div className="mb-6 border-b border-line pb-6">
                        <div className="mb-3 flex flex-wrap gap-2">
                          <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-700">{activePaper.field}</span>
                          <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-700">{activePaper.region}</span>
                          <span className="rounded-full border border-line bg-white px-3 py-1 font-mono text-xs text-ink-500">{activePaper.year || '年份未录'}</span>
                        </div>
                        <Eyebrow tone="brand">{activePaper.region} · {activePaper.field}</Eyebrow>
                        <h1 className="mt-3 max-w-4xl font-serif text-3xl leading-tight text-ink-900">{activePaper.title}</h1>
                        <p className="mt-3 text-sm text-ink-500">
                          {activePaper.authors} · {activePaper.source} · {activePaper.year || '年份未录'}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                        <PaperMeta label="研究问题" value={activePaper.researchQuestion || '未生成'} large />
                        <PaperMeta label="研究方法" value={activePaper.method} large />
                        <PaperMeta label="核心结论" value={activePaper.finding} large />
                        <PaperMeta label="研究不足" value={activePaper.limitationSummary || '未生成'} large />
                        <PaperMeta label="研究意义" value={activePaper.significanceSummary || '未生成'} large />
                        <PaperMeta label="文献综述句" value={activePaper.literatureReviewSentence || '未生成'} large />
                      </div>

                      <div className="mt-6 rounded-2xl border border-line bg-surface" style={{ padding: 22 }}>
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-500">Abstract / Reading Detail</p>
                        <p className="mt-3 text-sm leading-relaxed text-ink-800">{activePaper.abstract}</p>
                        {activePaper.doi && <p className="mt-4 break-all font-mono text-xs text-ink-500">DOI: {activePaper.doi}</p>}
                      </div>

                      <div className="mt-6 flex flex-wrap items-center gap-3">
                        <Button
                          variant="primary"
                          loading={readingRoomAddingId === activePaper.id}
                          onClick={() => { void addToReadingRoom(activePaper) }}
                        >
                          {readingRoomAddingId === activePaper.id ? '加入中...' : '加入精读室'}
                        </Button>
                        <Button variant="secondary" onClick={() => { void openWritingMaterialModal(activePaper) }}>
                          加入论文写作素材
                        </Button>
                        {paperExternalUrl(activePaper) ? (
                          <a
                            href={paperExternalUrl(activePaper)}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-medium text-ink-800 transition-colors hover:border-brand hover:text-brand"
                          >
                            打开论文链接
                          </a>
                        ) : (
                          <span className="text-sm text-ink-400">暂无论文链接</span>
                        )}
                      </div>
                    </Card>

                    <ReadingNotePanel
                      note={noteForm}
                      status={noteStatus}
                      error={noteError}
                      onChange={updateNoteField}
                    />
                  </>
                )}
              </section>
            )}
          </MainContent>
        </div>
      </main>
      {writingMaterialPaper && (
        <WritingMaterialModal
          paper={writingMaterialPaper}
          projects={writingProjects}
          selectedProjectId={selectedWritingProjectId}
          loading={writingProjectsLoading}
          saving={writingMaterialSaving}
          error={error}
          onSelect={setSelectedWritingProjectId}
          onSubmit={addToWritingMaterials}
          onClose={() => {
            setWritingMaterialPaper(null)
            setError('')
          }}
        />
      )}
    </div>
  )
}

function WritingMaterialModal({
  paper,
  projects,
  selectedProjectId,
  loading,
  saving,
  error,
  onSelect,
  onSubmit,
  onClose,
}: {
  paper: FrontierPaper
  projects: WritingProjectOption[]
  selectedProjectId: string
  loading: boolean
  saving: boolean
  error: string
  onSelect: (projectId: string) => void
  onSubmit: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-5 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-[var(--shadow-modal)]" style={{ padding: 32 }}>
        <div className="mb-7 flex items-start justify-between gap-5 border-b border-line pb-5">
          <div>
            <Eyebrow tone="brand">Writing Material</Eyebrow>
            <h2 className="mt-2 font-serif text-2xl text-ink-900">加入论文写作素材</h2>
            <p className="mt-2 line-clamp-2 text-sm text-ink-500">{paper.title}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
        </div>

        {error && <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {loading ? (
          <Card padding="md" variant="surface">
            <p className="text-sm text-ink-500">正在加载论文项目...</p>
          </Card>
        ) : projects.length === 0 ? (
          <Card padding="md" variant="surface">
            <p className="text-sm text-ink-500">暂无论文项目。请先在论文写作工坊创建论文。</p>
          </Card>
        ) : (
          <div className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink-700">选择论文项目</span>
              <select
                value={selectedProjectId}
                onChange={event => onSelect(event.target.value)}
                className="w-full rounded-xl border-2 border-line bg-white text-sm text-ink-900 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
                style={{ padding: '11px 14px' }}
              >
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.title} · {project.language === 'en' ? 'English Paper' : '中文论文'} · {project.paper_type || '未记录类型'}
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-600">
              <p className="font-medium text-ink-900">{paper.authors}</p>
              <p className="mt-1">{paper.source} · {paper.year || '年份未录'} · {paper.field}</p>
            </div>
          </div>
        )}

        <div className="mt-7 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            disabled={loading || projects.length === 0 || !selectedProjectId}
            loading={saving}
            onClick={onSubmit}
          >
            加入素材
          </Button>
        </div>
      </div>
    </div>
  )
}

function ReadingNotePanel({
  note,
  status,
  error,
  onChange,
}: {
  note: NoteFormState
  status: NoteSaveStatus
  error: string
  onChange: (field: keyof NoteFormState, value: string) => void
}) {
  const statusText = {
    idle: '输入后自动保存',
    loading: '正在加载笔记...',
    saving: '保存中...',
    saved: '已保存',
    error: '保存失败',
  }[status]

  return (
    <Card padding="lg" className="h-fit">
      <div className="mb-5 flex items-start justify-between gap-4 border-b border-line pb-5">
        <div>
          <Eyebrow tone="muted">My Notes</Eyebrow>
          <h2 className="mt-1 font-serif text-xl text-ink-900">我的阅读笔记</h2>
        </div>
        <span className={cn(
          'rounded-full px-3 py-1 text-xs',
          status === 'error'
            ? 'bg-red-50 text-red-700'
            : status === 'saved'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-canvas text-ink-500'
        )}>
          {statusText}
        </span>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="space-y-4">
        <Textarea
          label="我的笔记"
          value={note.user_note}
          onChange={event => onChange('user_note', event.target.value)}
          disabled={status === 'loading'}
          rows={5}
          placeholder="记录整体理解、关键词、待查问题..."
        />
        <Textarea
          label="研究方法笔记"
          value={note.method_note}
          onChange={event => onChange('method_note', event.target.value)}
          disabled={status === 'loading'}
          rows={4}
          placeholder="记录研究设计、语料、数据、实验或分析路径..."
        />
        <Textarea
          label="核心结论笔记"
          value={note.conclusion_note}
          onChange={event => onChange('conclusion_note', event.target.value)}
          disabled={status === 'loading'}
          rows={4}
          placeholder="提炼可以复述的主要发现或观点..."
        />
        <Textarea
          label="批评与不足"
          value={note.critique_note}
          onChange={event => onChange('critique_note', event.target.value)}
          disabled={status === 'loading'}
          rows={4}
          placeholder="记录样本、方法、论证或适用范围的局限..."
        />
        <Textarea
          label="可用于论文前言 / 文献综述的句子"
          value={note.literature_review_use}
          onChange={event => onChange('literature_review_use', event.target.value)}
          disabled={status === 'loading'}
          rows={5}
          placeholder="整理成可以改写进论文前言或综述段落的表达..."
        />
      </div>
    </Card>
  )
}

function PaperMeta({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-ink-500">{label}</p>
      <p className={cn('leading-relaxed text-ink-800', large ? 'text-base' : 'text-sm')}>{value}</p>
    </div>
  )
}
