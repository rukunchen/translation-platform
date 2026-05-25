'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { supabase } from '@/lib/supabase'

type SelectionState = {
  text: string
  context: string
  top: number
  left: number
}

type ReadingArticle = {
  id: string
  title: string | null
  source: string | null
  genre: string | null
  source_type: string | null
  clean_text: string | null
  structured_blocks: unknown
  created_at: string
  updated_at: string
}

type ReadingMode = 'library' | 'reader'
type ReaderTab = 'source' | 'notes' | 'ai'
type ReadingFont = 'serif' | 'sans' | 'mono'
type ReadingFontSize = 'sm' | 'md' | 'lg'
type ReadingLineHeight = 'compact' | 'comfortable' | 'open'

type ReadingNoteRow = {
  id: string
  article_id: string
  selected_text: string | null
  paragraph_context: string | null
  ai_explanation: string | null
  user_note: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
}

type ReadingNote = {
  id: string
  selectedText: string
  paragraphContext: string
  aiExplanation: string
  userNote: string
  tags: string[]
  createdAt: string
}

const GENRE_OPTIONS = ['经济', '政治', '中国', '心理学', '文学', '历史', '文化', '科技', '商务', '法律', '其他']
const GENRE_FILTERS = ['全部', ...GENRE_OPTIONS]

const ARTICLE_SELECT = 'id,title,source,genre,source_type,clean_text,structured_blocks,created_at,updated_at'

const READING_FONT_OPTIONS: { value: ReadingFont; label: string }[] = [
  { value: 'serif', label: '报刊衬线' },
  { value: 'sans', label: '现代无衬线' },
  { value: 'mono', label: '等宽' },
]

const READING_SIZE_OPTIONS: { value: ReadingFontSize; label: string }[] = [
  { value: 'sm', label: '小' },
  { value: 'md', label: '中' },
  { value: 'lg', label: '大' },
]

const READING_LINE_OPTIONS: { value: ReadingLineHeight; label: string }[] = [
  { value: 'compact', label: '紧凑' },
  { value: 'comfortable', label: '舒适' },
  { value: 'open', label: '宽松' },
]

function cleanSourceText(input: string): string {
  const lines = input
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())

  const paragraphs: string[] = []
  let current: string[] = []

  for (const line of lines) {
    if (!line) {
      if (current.length) {
        paragraphs.push(current.join(' '))
        current = []
      }
      continue
    }
    current.push(line)
  }
  if (current.length) paragraphs.push(current.join(' '))

  return paragraphs.join('\n\n')
}

function titleFromText(text: string): string {
  const firstLine = text.split('\n').find(line => line.trim())?.trim() || ''
  if (!firstLine) return '未命名文章'
  if (firstLine.length <= 140) return firstLine
  return `${firstLine.slice(0, 137).replace(/\s+\S*$/, '').trim()}...`
}

function formatReadingDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

function wordCount(text: string): number {
  return text.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g)?.length || 0
}

function articleWords(article: ReadingArticle): number {
  return wordCount(article.clean_text || '')
}

function articleGenre(article: ReadingArticle): string {
  return article.genre || '其他'
}

function splitReadingParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)
}

function normalizeHeading(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

function buildReadingLayout(text: string, savedTitle?: string | null) {
  const paragraphs = splitReadingParagraphs(text)
  const title = savedTitle?.trim() || paragraphs[0] || '未命名文章'
  const body = [...paragraphs]
  const first = body[0] || ''
  const normalizedTitle = normalizeHeading(title)
  const normalizedFirst = normalizeHeading(first)

  if (first.length <= 140 && (normalizedFirst === normalizedTitle || normalizedTitle.startsWith(normalizedFirst))) {
    body.shift()
  }

  const deck = body.length > 1 && body[0].length <= 260 ? body.shift() || '' : ''
  return { title, deck, body }
}

function articleMatchesSearch(article: ReadingArticle, query: string): boolean {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return true
  return [
    article.title,
    article.source,
    article.clean_text,
  ].some(value => (value || '').toLowerCase().includes(keyword))
}

function readingFontFamily(font: ReadingFont): string {
  if (font === 'sans') return 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  if (font === 'mono') return '"SFMono-Regular", Consolas, "Liberation Mono", monospace'
  return 'Georgia, "Times New Roman", ui-serif, serif'
}

function readingFontSize(size: ReadingFontSize): number {
  if (size === 'sm') return 17
  if (size === 'lg') return 20
  return 18
}

function readingLineHeight(lineHeight: ReadingLineHeight): number {
  if (lineHeight === 'compact') return 1.45
  if (lineHeight === 'open') return 1.8
  return 1.6
}

function noteFromRow(row: ReadingNoteRow): ReadingNote {
  return {
    id: row.id,
    selectedText: row.selected_text || '',
    paragraphContext: row.paragraph_context || '',
    aiExplanation: row.ai_explanation || '',
    userNote: row.user_note || '',
    tags: row.tags || [],
    createdAt: formatReadingDate(row.created_at),
  }
}

export default function ReadingRoomPage() {
  const router = useRouter()
  const readerRef = useRef<HTMLDivElement | null>(null)
  const noteTextareas = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const noteSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [mode, setMode] = useState<ReadingMode>('library')
  const [readerTab, setReaderTab] = useState<ReaderTab>('source')
  const [readerFont, setReaderFont] = useState<ReadingFont>('serif')
  const [readerFontSize, setReaderFontSize] = useState<ReadingFontSize>('md')
  const [readerLineHeight, setReaderLineHeight] = useState<ReadingLineHeight>('comfortable')
  const [articles, setArticles] = useState<ReadingArticle[]>([])
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({})
  const [article, setArticle] = useState<ReadingArticle | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [savingArticle, setSavingArticle] = useState(false)
  const [editArticleOpen, setEditArticleOpen] = useState(false)
  const [savingArticleEdit, setSavingArticleEdit] = useState(false)
  const [editArticleTitle, setEditArticleTitle] = useState('')
  const [editArticleText, setEditArticleText] = useState('')
  const [draftText, setDraftText] = useState('')
  const [importGenre, setImportGenre] = useState('其他')
  const [cleanText, setCleanText] = useState('')
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const [notes, setNotes] = useState<ReadingNote[]>([])
  const [genreFilter, setGenreFilter] = useState('全部')
  const [searchQuery, setSearchQuery] = useState('')
  const [aiNotice, setAiNotice] = useState('')
  const [explainingNoteId, setExplainingNoteId] = useState<string | null>(null)
  const [explainingSelection, setExplainingSelection] = useState(false)
  const [storageError, setStorageError] = useState('')
  const readingLayout = buildReadingLayout(cleanText, article?.title)
  const cleanWordCount = wordCount(cleanText)
  const readerTextStyle = {
    fontFamily: readingFontFamily(readerFont),
    fontSize: readingFontSize(readerFontSize),
    lineHeight: readingLineHeight(readerLineHeight),
  }
  const filteredArticles = articles.filter(item =>
    (genreFilter === '全部' || articleGenre(item) === genreFilter) && articleMatchesSearch(item, searchQuery)
  )

  const loadArticleLibrary = async (currentUserId: string): Promise<ReadingArticle[]> => {
    const { data: articleRows, error: articleError } = await supabase
      .from('reading_articles')
      .select(ARTICLE_SELECT)
      .eq('user_id', currentUserId)
      .order('updated_at', { ascending: false })

    if (articleError) {
      setStorageError(articleError.message)
      return []
    }

    const nextArticles = (articleRows || []) as ReadingArticle[]
    setArticles(nextArticles)

    const { data: noteRows, error: notesError } = await supabase
      .from('reading_notes')
      .select('article_id')
      .eq('user_id', currentUserId)

    if (notesError) {
      setStorageError(notesError.message)
      setNoteCounts({})
      return nextArticles
    }

    const counts = (noteRows || []).reduce<Record<string, number>>((acc, row) => {
      const articleId = (row as { article_id?: string }).article_id
      if (articleId) acc[articleId] = (acc[articleId] || 0) + 1
      return acc
    }, {})
    setNoteCounts(counts)
    return nextArticles
  }

  const loadNotesForArticle = async (articleId: string) => {
    const { data: loadedNotes, error: notesError } = await supabase
      .from('reading_notes')
      .select('id,article_id,selected_text,paragraph_context,ai_explanation,user_note,tags,created_at,updated_at')
      .eq('article_id', articleId)
      .order('created_at', { ascending: false })

    if (notesError) {
      setStorageError(notesError.message)
      setNotes([])
      return
    }

    const nextNotes = ((loadedNotes || []) as ReadingNoteRow[]).map(noteFromRow)
    setNotes(nextNotes)
    setNoteCounts(current => ({ ...current, [articleId]: nextNotes.length }))
  }

  const openArticle = async (nextArticle: ReadingArticle) => {
    Object.values(noteSaveTimers.current).forEach(clearTimeout)
    noteSaveTimers.current = {}
    setArticle(nextArticle)
    setCleanText(nextArticle.clean_text || '')
    setDraftText('')
    setSelection(null)
    setAiNotice('')
    setStorageError('')
    setReaderTab('source')
    setMode('reader')
    await loadNotesForArticle(nextArticle.id)
  }

  useEffect(() => {
    let alive = true

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!alive) return
      if (!user) {
        router.push('/')
        return
      }

      setUserId(user.id)
      setStorageError('')
      await loadArticleLibrary(user.id)

      if (!alive) return
      setCheckingAuth(false)
    })

    return () => {
      alive = false
    }
  }, [router])

  useEffect(() => {
    return () => {
      Object.values(noteSaveTimers.current).forEach(clearTimeout)
    }
  }, [])

  const applyImport = async () => {
    if (!userId) return
    const cleaned = cleanSourceText(draftText)
    const title = titleFromText(cleaned)

    setSavingArticle(true)
    setStorageError('')
    const { data, error } = await supabase
      .from('reading_articles')
      .insert({
        user_id: userId,
        title,
        source: '手动粘贴',
        genre: importGenre,
        source_type: 'plain_text',
        clean_text: cleaned,
        structured_blocks: null,
      })
      .select(ARTICLE_SELECT)
      .single()
    setSavingArticle(false)

    if (error || !data) {
      setStorageError(error?.message || '保存文章失败')
      return
    }

    const createdArticle = data as ReadingArticle
    setArticle(createdArticle)
    setCleanText(cleaned)
    setNotes([])
    setArticles(current => [createdArticle, ...current.filter(item => item.id !== createdArticle.id)])
    setNoteCounts(current => ({ ...current, [createdArticle.id]: 0 }))
    setImportOpen(false)
    setSelection(null)
    setAiNotice('')
    setReaderTab('source')
    setMode('reader')
  }

  const openArticleEditor = () => {
    if (!article) return
    setEditArticleTitle(article.title || titleFromText(cleanText))
    setEditArticleText(cleanText)
    setEditArticleOpen(true)
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }

  const saveArticleEdit = async () => {
    if (!article || !userId) return
    const cleaned = cleanSourceText(editArticleText)
    const title = editArticleTitle.trim() || titleFromText(cleaned)
    if (!cleaned || !title) return

    setSavingArticleEdit(true)
    setStorageError('')
    const { data, error } = await supabase
      .from('reading_articles')
      .update({
        title,
        clean_text: cleaned,
        structured_blocks: null,
      })
      .eq('id', article.id)
      .eq('user_id', userId)
      .select(ARTICLE_SELECT)
      .single()
    setSavingArticleEdit(false)

    if (error || !data) {
      setStorageError(error?.message || '保存原文失败')
      return
    }

    const updatedArticle = data as ReadingArticle
    setArticle(updatedArticle)
    setCleanText(updatedArticle.clean_text || '')
    setArticles(current => [updatedArticle, ...current.filter(item => item.id !== updatedArticle.id)])
    setEditArticleOpen(false)
    setAiNotice('原文已更新。')
  }

  const updateSelection = () => {
    const selected = window.getSelection()
    if (!selected || selected.rangeCount === 0) {
      setSelection(null)
      return
    }

    const text = selected.toString().trim()
    const anchor = selected.anchorNode
    if (!text || !anchor || !readerRef.current?.contains(anchor)) {
      setSelection(null)
      return
    }

    const rect = selected.getRangeAt(0).getBoundingClientRect()
    const container = anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor instanceof Element ? anchor : null
    const context = container?.closest('[data-reading-paragraph]')?.textContent?.trim() || text
    setSelection({
      text,
      context,
      top: Math.max(16, rect.top - 48),
      left: Math.min(window.innerWidth - 260, Math.max(16, rect.left + rect.width / 2 - 120)),
    })
  }

  const ensureNoteForSelection = async (activeSelection: SelectionState): Promise<ReadingNote | null> => {
    if (!activeSelection.text || !article || !userId) return null

    const existing = notes.find(note =>
      note.selectedText === activeSelection.text && note.paragraphContext === activeSelection.context
    )
    if (existing) return existing

    setStorageError('')
    const { data, error } = await supabase
      .from('reading_notes')
      .insert({
        article_id: article.id,
        user_id: userId,
        selected_text: activeSelection.text,
        paragraph_context: activeSelection.context,
        ai_explanation: '',
        user_note: '',
        tags: [],
      })
      .select('id,article_id,selected_text,paragraph_context,ai_explanation,user_note,tags,created_at,updated_at')
      .single()

    if (error || !data) {
      setStorageError(error?.message || '保存笔记失败')
      return null
    }

    const note = noteFromRow(data as ReadingNoteRow)
    setNotes(current => current.some(item => item.id === note.id) ? current : [note, ...current])
    setNoteCounts(current => ({ ...current, [article.id]: (current[article.id] || 0) + 1 }))
    return note
  }

  const addSelectionNote = async () => {
    if (!selection?.text) return
    const note = await ensureNoteForSelection(selection)
    if (!note) return

    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }

  const mergeNoteFromRow = (row: ReadingNoteRow) => {
    const nextNote = noteFromRow(row)
    setNotes(current => {
      const existing = current.find(note => note.id === nextNote.id)
      const merged = existing ? { ...nextNote, userNote: existing.userNote } : nextNote
      return current.some(note => note.id === nextNote.id)
        ? current.map(note => note.id === nextNote.id ? merged : note)
        : [merged, ...current]
    })
  }

  const explainNote = async (note: ReadingNote) => {
    if (!article || explainingNoteId) return

    setAiNotice('')
    setExplainingNoteId(note.id)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('missing session')

      const response = await fetch('/api/reading/explain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          articleId: article.id,
          noteId: note.id,
          selectedText: note.selectedText,
          paragraphContext: note.paragraphContext,
        }),
      })
      const payload = await response.json().catch(() => ({})) as { note?: ReadingNoteRow; error?: string }
      if (!response.ok || !payload.note) throw new Error(payload.error || 'AI explanation failed')

      mergeNoteFromRow(payload.note)
      setAiNotice('语境译文已生成。')
    } catch {
      setAiNotice('AI 翻译失败，请稍后重试。')
    } finally {
      setExplainingNoteId(null)
    }
  }

  const explainSelection = async () => {
    if (!selection?.text || explainingSelection || explainingNoteId) return

    setAiNotice('')
    setExplainingSelection(true)
    const activeSelection = selection
    const note = await ensureNoteForSelection(activeSelection)
    setExplainingSelection(false)

    if (!note) {
      setAiNotice('AI 翻译失败，请稍后重试。')
      return
    }

    setSelection(null)
    window.getSelection()?.removeAllRanges()
    await explainNote(note)
  }

  const updateNoteBody = (id: string, userNote: string) => {
    setNotes(current => current.map(note => note.id === id ? { ...note, userNote } : note))
    clearTimeout(noteSaveTimers.current[id])
    noteSaveTimers.current[id] = setTimeout(async () => {
      const { error } = await supabase
        .from('reading_notes')
        .update({ user_note: userNote })
        .eq('id', id)
      if (error) setStorageError(error.message)
    }, 600)
  }

  const removeNote = async (id: string) => {
    clearTimeout(noteSaveTimers.current[id])
    delete noteSaveTimers.current[id]
    delete noteTextareas.current[id]
    const previous = notes
    setNotes(current => current.filter(note => note.id !== id))
    const { error } = await supabase.from('reading_notes').delete().eq('id', id)
    if (error) {
      setNotes(previous)
      setStorageError(error.message)
    } else if (article) {
      setNoteCounts(current => ({ ...current, [article.id]: Math.max(0, (current[article.id] || 1) - 1) }))
    }
  }

  const removeArticle = async (target: ReadingArticle) => {
    const confirmed = window.confirm('删除后该文章和相关笔记都会被删除，是否继续？')
    if (!confirmed) return

    setStorageError('')
    const previousArticles = articles
    const previousCounts = noteCounts
    setArticles(current => current.filter(item => item.id !== target.id))
    setNoteCounts(current => {
      const next = { ...current }
      delete next[target.id]
      return next
    })

    const { error } = await supabase
      .from('reading_articles')
      .delete()
      .eq('id', target.id)

    if (error) {
      setArticles(previousArticles)
      setNoteCounts(previousCounts)
      setStorageError(error.message)
      return
    }

    if (article?.id === target.id) {
      setArticle(null)
      setCleanText('')
      setNotes([])
      setSelection(null)
      setAiNotice('')
      setMode('library')
    }
  }

  if (checkingAuth) {
    return (
      <div className="h-screen flex items-center justify-center bg-canvas">
        <div className="flex items-center gap-3 text-ink-500">
          <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">加载中...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-canvas overflow-hidden">
      <Sidebar />

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-white"
          style={{ padding: '24px 40px' }}>
          <div>
            <Eyebrow>Reading Room</Eyebrow>
            <h1 className="mt-2 font-serif text-3xl text-ink-900">深读室</h1>
            {mode === 'library' ? (
              <p className="mt-2 max-w-3xl text-sm text-ink-500">
                英文精读、语境笔记与表达积累
              </p>
            ) : article && (
              <p className="mt-2 max-w-3xl truncate text-sm text-ink-500">
                {article.title || '未命名文章'} · {article.source || '未记录'} · {articleGenre(article)} · {article.source_type || 'plain_text'} · {articleWords(article)} words · 笔记 {notes.length} 条
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {mode === 'reader' && (
              <Button variant="ghost" onClick={() => {
                setMode('library')
                setSelection(null)
                window.getSelection()?.removeAllRanges()
              }}>
                ← 返回文章库
              </Button>
            )}
            <Button variant="primary" onClick={() => {
              setDraftText('')
              setImportGenre('其他')
              setImportOpen(true)
            }}>
              一键导入原文
            </Button>
          </div>
        </header>

        {storageError && (
          <div className="border-b border-red-100 bg-red-50 px-10 py-3 text-sm text-red-700">
            {storageError}
          </div>
        )}

        {mode === 'library' ? (
          <div className="flex-1 overflow-y-auto" style={{ padding: 24 }}>
            <div className="mx-auto max-w-6xl">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <Eyebrow tone="muted">Library</Eyebrow>
                  <h2 className="mt-2 font-serif text-3xl text-ink-900">文章库</h2>
                  <p className="mt-2 text-sm text-ink-500">选择文章继续精读、复习摘录和查看 AI 解释。</p>
                </div>
                <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-400">
                  {filteredArticles.length} / {articles.length} articles
                </span>
              </div>

              <Card padding="none" className="mb-5 overflow-hidden">
                <div className="border-b border-line bg-surface" style={{ padding: '16px 18px' }}>
                  <div className="flex flex-wrap gap-2.5">
                    {GENRE_FILTERS.map(genre => (
                      <button
                        key={genre}
                        type="button"
                        onClick={() => setGenreFilter(genre)}
                        className={[
                          'inline-flex min-h-10 items-center justify-center rounded-full border px-4 py-2 text-sm leading-none shadow-sm transition-all',
                          genreFilter === genre
                            ? 'border-ink-900 bg-ink-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)]'
                            : 'border-line bg-white/90 text-ink-700 hover:border-ink-300 hover:bg-white hover:text-ink-900 hover:shadow-md',
                        ].join(' ')}
                      >
                        {genre}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ padding: 18 }}>
                  <input
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder="搜索标题、来源或正文关键词"
                    className="w-full rounded-xl border-2 border-line bg-white text-sm text-ink-900 placeholder-ink-300 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
                    style={{ padding: '12px 14px' }}
                  />
                </div>
              </Card>

              {articles.length === 0 ? (
                <Card padding="lg" className="text-center">
                  <h3 className="font-serif text-2xl text-ink-900">还没有文章</h3>
                  <p className="mt-3 text-sm text-ink-500">点击“一键导入原文”开始第一篇精读。</p>
                  <div className="mt-6">
                    <Button variant="primary" onClick={() => {
                      setDraftText('')
                      setImportGenre('其他')
                      setImportOpen(true)
                    }}>
                      一键导入原文
                    </Button>
                  </div>
                </Card>
              ) : filteredArticles.length === 0 ? (
                <Card padding="lg" className="text-center">
                  <h3 className="font-serif text-2xl text-ink-900">没有匹配的文章</h3>
                  <p className="mt-3 text-sm text-ink-500">调整体裁筛选或搜索关键词后再试。</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {filteredArticles.map(item => (
                    <article key={item.id} className="rounded-xl border border-line bg-white overflow-hidden shadow-sm">
                      <div className="border-b border-line bg-surface/70" style={{ padding: '18px 20px' }}>
                        <div className="mb-3 flex flex-wrap items-center gap-2.5">
                          <span className="inline-flex min-h-8 items-center rounded-full border border-line bg-white/95 px-3.5 py-1.5 text-xs leading-none text-ink-700 shadow-sm">
                            {articleGenre(item)}
                          </span>
                          <span className="inline-flex min-h-8 items-center rounded-full border border-line bg-surface px-3.5 py-1.5 font-mono text-[11px] leading-none text-ink-500 shadow-sm">
                            {item.source_type || 'plain_text'}
                          </span>
                        </div>
                        <h3 className="line-clamp-2 font-serif text-2xl leading-tight text-ink-900">
                          {item.title || '未命名文章'}
                        </h3>
                        <p className="mt-3 truncate text-sm text-ink-500">
                          来源：{item.source || '未记录'}
                        </p>
                      </div>
                      <div style={{ padding: '16px 20px' }}>
                        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-500">
                          <span>{articleWords(item)} words</span>
                          <span>笔记 {noteCounts[item.id] || 0} 条</span>
                          <span>最近阅读：{formatReadingDate(item.updated_at)}</span>
                        </div>
                        <div className="mt-5 flex flex-wrap justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => { void removeArticle(item) }}>删除文章</Button>
                          <Button size="sm" variant="primary" onClick={() => { void openArticle(item) }}>继续阅读</Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
        <>
        <div className="border-b border-line bg-white px-6 py-3 xl:hidden">
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-line bg-surface p-1">
            {([
              ['source', '原文'],
              ['notes', '笔记'],
              ['ai', 'AI译文'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setReaderTab(key)}
                className={[
                  'rounded-lg px-3 py-2 text-sm transition-colors',
                  readerTab === key ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid flex-1 min-h-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_390px]"
          style={{ padding: 24 }}>
          <section className={`${readerTab === 'source' ? 'block' : 'hidden'} min-h-0 xl:block`}>
            <Card padding="none" className="h-full overflow-hidden">
              <div className="flex items-center justify-between border-b border-line bg-surface"
                style={{ padding: '18px 24px' }}>
                <div>
                  <Eyebrow tone="muted">Clean Version</Eyebrow>
                  <h2 className="mt-1 font-serif text-xl text-ink-900">原文阅读区</h2>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={openArticleEditor}>编辑原文</Button>
                  <label className="flex items-center gap-2 text-xs text-ink-500">
                    字体
                    <select
                      value={readerFont}
                      onChange={event => setReaderFont(event.target.value as ReadingFont)}
                      className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink-700 focus:border-brand focus:outline-none"
                    >
                      {READING_FONT_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-ink-500">
                    字号
                    <select
                      value={readerFontSize}
                      onChange={event => setReaderFontSize(event.target.value as ReadingFontSize)}
                      className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink-700 focus:border-brand focus:outline-none"
                    >
                      {READING_SIZE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-ink-500">
                    行距
                    <select
                      value={readerLineHeight}
                      onChange={event => setReaderLineHeight(event.target.value as ReadingLineHeight)}
                      className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-ink-700 focus:border-brand focus:outline-none"
                    >
                      {READING_LINE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <span className="font-mono text-xs text-ink-400">
                    {cleanText ? `${cleanWordCount} words` : 'empty'}
                  </span>
                </div>
              </div>

              <div
                ref={readerRef}
                onMouseUp={updateSelection}
                onKeyUp={updateSelection}
                className="h-[calc(100%-81px)] overflow-y-auto"
                style={{ padding: '30px 36px' }}
              >
                {cleanText ? (
                  <article className="mx-auto max-w-5xl">
                    <header className="mb-9 border-b border-line pb-7">
                      <Eyebrow tone="muted">{article?.source || 'Manual Paste'}</Eyebrow>
                      <h1
                        data-reading-paragraph
                        className="mt-3 max-w-4xl font-serif text-[42px] leading-[1.05] text-ink-950"
                      >
                        {readingLayout.title}
                      </h1>
                      {readingLayout.deck && (
                        <p
                          data-reading-paragraph
                          className="mt-5 max-w-3xl font-serif text-xl leading-8 text-ink-600"
                        >
                          {readingLayout.deck}
                        </p>
                      )}
                      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-400">
                        <span>{readingLayout.body.length} 段</span>
                        <span>{cleanWordCount} words</span>
                        {article?.updated_at && <span>{formatReadingDate(article.updated_at)}</span>}
                      </div>
                    </header>

                    <div className="max-w-none xl:columns-2 xl:gap-12">
                      {readingLayout.body.map((paragraph, index) => (
                        <p
                          key={index}
                          data-reading-paragraph
                          className={[
                            'break-inside-avoid whitespace-pre-wrap text-ink-900',
                            index === 0 ? 'first-letter:float-left first-letter:mr-3 first-letter:font-serif first-letter:text-6xl first-letter:leading-[0.85] first-letter:text-ink-950' : '',
                          ].join(' ')}
                          style={{ ...readerTextStyle, marginBottom: '1.6em' }}
                        >
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </article>
                ) : (
                  <div className="flex h-full items-center justify-center text-center">
                    <div>
                      <h3 className="font-serif text-2xl text-ink-900">等待导入原文</h3>
                      <p className="mt-3 text-sm text-ink-500">粘贴文本后会在这里显示清理后的阅读版本。</p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </section>

          <aside className={`${readerTab === 'notes' || readerTab === 'ai' ? 'block' : 'hidden'} min-h-0 xl:block`}>
            <Card padding="none" className="h-full overflow-hidden">
              <div className="border-b border-line bg-surface" style={{ padding: '18px 22px' }}>
                <Eyebrow tone="muted">Notes</Eyebrow>
                <div className="mt-1 flex items-end justify-between gap-3">
                  <h2 className="font-serif text-xl text-ink-900">笔记区</h2>
                  <span className="text-sm text-ink-500">{notes.length} 条</span>
                </div>
              </div>

              {aiNotice && (
                <div className="border-b border-line bg-brand-50/60 px-5 py-3 text-sm text-ink-700">
                  {aiNotice}
                </div>
              )}

              <div className="h-[calc(100%-76px)] overflow-y-auto" style={{ padding: 18 }}>
                {notes.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-center">
                    <p className="text-sm leading-relaxed text-ink-500">选中左侧文本后，可加入笔记。</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {notes.map(note => {
                      const isExplaining = explainingNoteId === note.id
                      return (
                        <article key={note.id} className="rounded-xl border border-line bg-white overflow-hidden">
                          <div className="border-b border-line bg-canvas/70" style={{ padding: '14px 16px' }}>
                            <p className="text-sm leading-relaxed text-ink-800 whitespace-pre-wrap">{note.selectedText}</p>
                            <div className="mt-3 rounded-lg bg-white px-3 py-2">
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">Context Translation</span>
                                {isExplaining && (
                                  <span className="inline-flex items-center gap-2 text-xs text-ink-500">
                                    <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                    翻译中...
                                  </span>
                                )}
                              </div>
                              <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-600">
                                {note.aiExplanation || (isExplaining ? '正在根据上下文生成语境译文...' : '尚未生成语境译文。')}
                              </p>
                            </div>
                            {note.tags.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {note.tags.map(tag => (
                                  <span key={tag} className="rounded-full border border-line bg-white px-2 py-1 text-xs text-ink-500">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
                              {note.createdAt}
                            </p>
                          </div>
                          <textarea
                            ref={element => { noteTextareas.current[note.id] = element }}
                            value={note.userNote}
                            onChange={event => updateNoteBody(note.id, event.target.value)}
                            placeholder="输入我的笔记"
                            className="w-full resize-y bg-white text-sm leading-relaxed text-ink-900 placeholder-ink-300 focus:outline-none"
                            style={{ minHeight: 96, padding: 16 }}
                          />
                          <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-white/80" style={{ padding: '8px 12px' }}>
                            <Button size="sm" variant="ghost" onClick={() => noteTextareas.current[note.id]?.focus()}>编辑笔记</Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={isExplaining}
                              disabled={!!explainingNoteId && !isExplaining}
                              onClick={() => { void explainNote(note) }}
                            >
                              {isExplaining ? '翻译中...' : '重新 AI 翻译'}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { void removeNote(note.id) }}>删除</Button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
              </div>
            </Card>
          </aside>
        </div>
        </>
        )}
      </main>

      {mode === 'reader' && selection && (
        <div
          className="fixed z-50 flex items-center gap-2 rounded-xl border border-line bg-white shadow-[var(--shadow-card)]"
          style={{ top: selection.top, left: selection.left, padding: 8 }}
        >
          <Button size="sm" variant="primary" onClick={() => { void addSelectionNote() }}>加入笔记</Button>
          <Button
            size="sm"
            variant="secondary"
            loading={explainingSelection}
            disabled={explainingSelection || !!explainingNoteId}
            onClick={() => { void explainSelection() }}
          >
            {explainingSelection ? '翻译中...' : 'AI 翻译'}
          </Button>
        </div>
      )}

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/45 p-6 backdrop-blur-sm">
          <Card padding="none" className="w-full max-w-3xl overflow-hidden shadow-[var(--shadow-modal)]">
            <div className="flex items-center justify-between border-b border-line bg-surface"
              style={{ padding: '22px 26px' }}>
              <div>
                <Eyebrow tone="muted">Import</Eyebrow>
                <h2 className="mt-1 font-serif text-2xl text-ink-900">一键导入原文</h2>
              </div>
              <button
                onClick={() => setImportOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-ink-500 transition-colors hover:bg-white hover:text-ink-900"
              >
                关闭
              </button>
            </div>
            <div style={{ padding: 26 }}>
              <textarea
                value={draftText}
                onChange={event => setDraftText(event.target.value)}
                placeholder="在这里粘贴原文文本"
                className="w-full resize-y rounded-xl border-2 border-line bg-white text-base leading-relaxed text-ink-900 placeholder-ink-300 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
                style={{ minHeight: 280, padding: 18 }}
              />
              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-medium text-ink-700">文章体裁</span>
                <select
                  value={importGenre}
                  onChange={event => setImportGenre(event.target.value)}
                  className="w-full rounded-xl border-2 border-line bg-white text-sm text-ink-900 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
                  style={{ padding: '11px 14px' }}
                >
                  {GENRE_OPTIONS.map(genre => (
                    <option key={genre} value={genre}>{genre}</option>
                  ))}
                </select>
              </label>
              <div className="mt-5 flex items-center justify-between gap-4">
                <span className="text-sm text-ink-500">
                  {draftText.trim() ? `${draftText.length} 字符` : '仅支持手动粘贴文本'}
                </span>
                <div className="flex items-center gap-3">
                  <Button variant="ghost" onClick={() => setImportOpen(false)}>取消</Button>
                  <Button variant="primary" disabled={!draftText.trim() || savingArticle} loading={savingArticle} onClick={() => { void applyImport() }}>
                    生成 clean version
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {editArticleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/45 p-6 backdrop-blur-sm">
          <Card padding="none" className="w-full max-w-4xl overflow-hidden shadow-[var(--shadow-modal)]">
            <div className="flex items-center justify-between border-b border-line bg-surface"
              style={{ padding: '22px 26px' }}>
              <div>
                <Eyebrow tone="muted">Edit Source</Eyebrow>
                <h2 className="mt-1 font-serif text-2xl text-ink-900">编辑阅读原文</h2>
              </div>
              <button
                onClick={() => setEditArticleOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-ink-500 transition-colors hover:bg-white hover:text-ink-900"
              >
                关闭
              </button>
            </div>
            <div style={{ padding: 26 }}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-ink-700">文章标题</span>
                <input
                  value={editArticleTitle}
                  onChange={event => setEditArticleTitle(event.target.value)}
                  placeholder="输入文章标题"
                  className="w-full rounded-xl border-2 border-line bg-white text-base text-ink-900 placeholder-ink-300 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
                  style={{ padding: '12px 14px' }}
                />
              </label>
              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-medium text-ink-700">原文正文</span>
                <textarea
                  value={editArticleText}
                  onChange={event => setEditArticleText(event.target.value)}
                  placeholder="在这里修改原文；用空行分隔段落"
                  className="w-full resize-y rounded-xl border-2 border-line bg-white text-base leading-relaxed text-ink-900 placeholder-ink-300 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
                  style={{ minHeight: 380, padding: 18 }}
                />
              </label>
              <div className="mt-5 flex items-center justify-between gap-4">
                <span className="text-sm text-ink-500">
                  {editArticleText.trim() ? `${wordCount(editArticleText)} words` : '保存后会更新阅读区 clean version'}
                </span>
                <div className="flex items-center gap-3">
                  <Button variant="ghost" onClick={() => setEditArticleOpen(false)}>取消</Button>
                  <Button
                    variant="primary"
                    disabled={!editArticleText.trim() || savingArticleEdit}
                    loading={savingArticleEdit}
                    onClick={() => { void saveArticleEdit() }}
                  >
                    保存原文
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
