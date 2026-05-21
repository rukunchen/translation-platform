'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { PageHeader } from '@/components/ui/PageHeader'
import { MainContent } from '@/components/ui/MainContent'
import { supabase } from '@/lib/supabase'
import { apiFetch, apiJSON } from '@/lib/apiFetch'
import {
  NOTE_TYPES,
  READING_STATUS_LABEL,
  ResearchItem,
  ResearchNote,
  formatCitation,
  parseBibTeX,
  parseRIS,
  splitList,
  type ReadingStatus,
} from '@/lib/researchLibrary'

type WritingProjectOption = { id: string; title: string }
type ResearchCollection = {
  id: string
  user_id: string
  name: string
  description: string
  created_at: string
  updated_at: string
}
type ResearchCollectionItem = {
  id: string
  collection_id: string
  item_id: string
  created_at: string
}

const STATUS_OPTIONS: ReadingStatus[] = ['unread', 'reading', 'read', 'excerpted']
const TYPE_OPTIONS = ['article', 'book', 'chapter', 'conference', 'thesis', 'report', 'webpage']

export default function ResearchLibraryPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [items, setItems] = useState<ResearchItem[]>([])
  const [notes, setNotes] = useState<ResearchNote[]>([])
  const [projects, setProjects] = useState<WritingProjectOption[]>([])
  const [collections, setCollections] = useState<ResearchCollection[]>([])
  const [collectionItems, setCollectionItems] = useState<ResearchCollectionItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null)
  const [dragOverCollectionId, setDragOverCollectionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showImport, setShowImport] = useState<'bibtex' | 'ris' | null>(null)
  const [importText, setImportText] = useState('')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | ReadingStatus>('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [pdfUrl, setPdfUrl] = useState('')
  const [pdfFullscreen, setPdfFullscreen] = useState(false)
  const [noteType, setNoteType] = useState('我的评论')
  const [notePage, setNotePage] = useState('')
  const [noteSelected, setNoteSelected] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [noteProjectId, setNoteProjectId] = useState('')
  const [aiBusy, setAiBusy] = useState<string | null>(null)
  const [draftItem, setDraftItem] = useState<Partial<ResearchItem>>({
    title: '',
    authors: '',
    year: '',
    source_title: '',
    publication_type: 'article',
    doi: '',
    url: '',
    abstract: '',
    keywords: [],
    tags: [],
    reading_status: 'unread',
  })

  const load = useCallback(async (uid: string) => {
    setLoading(true)
    const [itemRes, noteRes, projectRes, collectionRes, collectionItemRes] = await Promise.all([
      supabase.from('research_library_items').select('*').eq('user_id', uid).order('updated_at', { ascending: false }),
      supabase.from('research_notes').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('writing_projects').select('id, title').eq('user_id', uid).order('updated_at', { ascending: false }),
      supabase.from('research_collections').select('*').eq('user_id', uid).order('updated_at', { ascending: false }),
      supabase.from('research_collection_items').select('*'),
    ])
    setItems((itemRes.data ?? []) as ResearchItem[])
    setNotes((noteRes.data ?? []) as ResearchNote[])
    setProjects((projectRes.data ?? []) as WritingProjectOption[])
    setCollections((collectionRes.data ?? []) as ResearchCollection[])
    setCollectionItems((collectionItemRes.data ?? []) as ResearchCollectionItem[])
    const first = (itemRes.data ?? [])[0] as ResearchItem | undefined
    setActiveId(prev => prev ?? first?.id ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      setUserId(user.id)
      void load(user.id)
    })
  }, [load, router])

  const active = useMemo(() => items.find(i => i.id === activeId) ?? items[0] ?? null, [items, activeId])
  const activeNotes = useMemo(() => notes.filter(n => n.item_id === active?.id), [notes, active?.id])
  const activeCollectionItemIds = useMemo(() => {
    if (!activeCollectionId) return null
    return new Set(collectionItems.filter(link => link.collection_id === activeCollectionId).map(link => link.item_id))
  }, [activeCollectionId, collectionItems])
  const collectionCounts = useMemo(() => {
    return collectionItems.reduce<Record<string, number>>((acc, link) => {
      acc[link.collection_id] = (acc[link.collection_id] ?? 0) + 1
      return acc
    }, {})
  }, [collectionItems])
  const categoryOptions = useMemo(() => {
    const set = new Set<string>()
    items.forEach(item => {
      ;(item.tags || []).forEach(tag => set.add(tag))
      const auto = item.metadata?.autoClassifiedAs
      if (Array.isArray(auto)) auto.forEach(tag => tag && set.add(tag))
      const journalCategory = item.metadata?.journalCategory
      if (typeof journalCategory === 'string' && journalCategory.trim()) set.add(journalCategory.trim())
    })
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [items])
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items.filter(item => {
      if (activeCollectionItemIds && !activeCollectionItemIds.has(item.id)) return false
      const categories = [
        ...(item.tags || []),
        ...(Array.isArray(item.metadata?.autoClassifiedAs) ? item.metadata.autoClassifiedAs : []),
        typeof item.metadata?.journalCategory === 'string' ? item.metadata.journalCategory : '',
      ].map(String).filter(Boolean)
      if (categoryFilter === 'pdf' && !item.file_url) return false
      if (categoryFilter === 'no-pdf' && item.file_url) return false
      if (categoryFilter === 'uncategorized' && categories.length > 0 && !categories.includes('待归类')) return false
      if (categoryFilter === 'missing' && (!Array.isArray(item.metadata?.missingFields) || item.metadata.missingFields.length === 0)) return false
      if (!['all', 'pdf', 'no-pdf', 'uncategorized', 'missing'].includes(categoryFilter) && !categories.includes(categoryFilter)) return false
      if (statusFilter !== 'all' && item.reading_status !== statusFilter) return false
      if (typeFilter !== 'all' && item.publication_type !== typeFilter) return false
      if (!needle) return true
      return [
        item.title, item.authors, item.year, item.source_title, item.abstract,
        ...(item.keywords || []), ...(item.tags || []), JSON.stringify(item.metadata || {}),
      ].join(' ').toLowerCase().includes(needle)
    })
  }, [items, query, categoryFilter, statusFilter, typeFilter, activeCollectionItemIds])

  function chooseItem(id: string | null) {
    if (selectMode && id) {
      setSelectedItemIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      return
    }
    setActiveId(id)
    setPdfUrl('')
    setPdfFullscreen(false)
  }

  async function uploadPdf(file: File) {
    const form = new FormData()
    form.set('file', file)
    form.set('title', file.name.replace(/\.pdf$/i, ''))
    setUploading(true)
    const res = await apiFetch('/api/research/upload', { method: 'POST', body: form })
    const json = await res.json().catch(() => ({})) as { item?: ResearchItem; error?: string }
    setUploading(false)
    if (!res.ok || !json.item) { alert('上传失败：' + (json.error || `HTTP ${res.status}`)); return }
    setItems(prev => [json.item!, ...prev])
    chooseItem(json.item.id)
  }

  async function createManual(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    const payload = {
      user_id: userId,
      title: draftItem.title || '',
      authors: draftItem.authors || '',
      year: draftItem.year || '',
      source_title: draftItem.source_title || '',
      publication_type: draftItem.publication_type || 'article',
      doi: draftItem.doi || '',
      url: draftItem.url || '',
      abstract: draftItem.abstract || '',
      keywords: Array.isArray(draftItem.keywords) ? draftItem.keywords : [],
      tags: Array.isArray(draftItem.tags) ? draftItem.tags : [],
      reading_status: draftItem.reading_status || 'unread',
      metadata: draftItem.metadata || {},
    }
    const { data, error } = await supabase.from('research_library_items').insert(payload).select().single()
    if (error) { alert('创建失败：' + error.message); return }
    setItems(prev => [data as ResearchItem, ...prev])
    chooseItem((data as ResearchItem).id)
    setShowNew(false)
  }

  async function importEntries(kind: 'bibtex' | 'ris') {
    if (!userId) return
    const parsed = kind === 'bibtex' ? parseBibTeX(importText) : parseRIS(importText)
    if (parsed.length === 0) { alert('没有识别到有效文献条目'); return }
    const rows = parsed.map(item => ({
      user_id: userId,
      title: item.title || '',
      authors: item.authors || '',
      year: item.year || '',
      source_title: item.source_title || '',
      publication_type: item.publication_type || 'article',
      doi: item.doi || '',
      url: item.url || '',
      abstract: item.abstract || '',
      keywords: item.keywords || [],
      tags: item.tags || [],
      reading_status: 'unread',
      metadata: item.metadata || {},
    }))
    const { data, error } = await supabase.from('research_library_items').insert(rows).select()
    if (error) { alert('导入失败：' + error.message); return }
    setItems(prev => [...((data ?? []) as ResearchItem[]), ...prev])
    setShowImport(null)
    setImportText('')
  }

  async function updateActive(patch: Partial<ResearchItem>) {
    if (!active) return
    const { data, error } = await supabase
      .from('research_library_items')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', active.id)
      .select()
      .single()
    if (error) { alert('保存失败：' + error.message); return }
    setItems(prev => prev.map(item => item.id === active.id ? data as ResearchItem : item))
  }

  async function updateActiveMetadata(patch: Record<string, string | string[]>) {
    if (!active) return
    await updateActive({ metadata: { ...(active.metadata || {}), ...patch } })
  }

  async function deleteActive() {
    if (!active) return
    if (!confirm(`是否确定要删除文献“${active.title || '未命名文献'}”？删除后相关笔记和引用记录也会一起删除。`)) return
    const { error } = await apiJSON<{ ok: boolean }>(`/api/research/upload?itemId=${active.id}`, { method: 'DELETE' })
    if (error) { alert('删除失败：' + error); return }
    setItems(prev => {
      const next = prev.filter(item => item.id !== active.id)
      setActiveId(next[0]?.id ?? null)
      return next
    })
    setNotes(prev => prev.filter(note => note.item_id !== active.id))
    setCollectionItems(prev => prev.filter(link => link.item_id !== active.id))
    setPdfUrl('')
    setPdfFullscreen(false)
  }

  function toggleSelectAllVisible() {
    const visibleIds = visible.map(item => item.id)
    setSelectedItemIds(prev => {
      const allSelected = visibleIds.length > 0 && visibleIds.every(id => prev.has(id))
      if (allSelected) {
        const next = new Set(prev)
        visibleIds.forEach(id => next.delete(id))
        return next
      }
      return new Set([...prev, ...visibleIds])
    })
  }

  async function deleteSelectedItems() {
    const ids = Array.from(selectedItemIds)
    if (ids.length === 0) { alert('请先勾选要删除的文献'); return }
    if (!confirm(`是否确定要删除已选 ${ids.length} 条文献？删除后相关笔记和引用记录也会一起删除。`)) return
    setBulkDeleting(true)
    const { data, error } = await apiJSON<{ ok: boolean; deleted: number }>('/api/research/upload', {
      method: 'DELETE',
      body: JSON.stringify({ itemIds: ids }),
    })
    setBulkDeleting(false)
    if (error || !data?.ok) { alert('批量删除失败：' + error); return }
    setItems(prev => {
      const next = prev.filter(item => !ids.includes(item.id))
      if (activeId && ids.includes(activeId)) setActiveId(next[0]?.id ?? null)
      return next
    })
    setNotes(prev => prev.filter(note => !ids.includes(note.item_id)))
    setCollectionItems(prev => prev.filter(link => !ids.includes(link.item_id)))
    setSelectedItemIds(new Set())
    setSelectMode(false)
    setPdfUrl('')
    setPdfFullscreen(false)
  }

  async function createCollection() {
    if (!userId) return
    const name = prompt('请输入文献合集名称，例如：生态翻译研究')
    if (!name?.trim()) return
    const { data, error } = await supabase
      .from('research_collections')
      .insert({ user_id: userId, name: name.trim(), description: '' })
      .select()
      .single()
    if (error) { alert('创建合集失败：' + error.message); return }
    setCollections(prev => [data as ResearchCollection, ...prev])
    setActiveCollectionId((data as ResearchCollection).id)
  }

  async function addItemToCollection(itemId: string, collectionId: string) {
    if (collectionItems.some(link => link.item_id === itemId && link.collection_id === collectionId)) return
    const { data, error } = await supabase
      .from('research_collection_items')
      .insert({ item_id: itemId, collection_id: collectionId })
      .select()
      .single()
    if (error) { alert('加入合集失败：' + error.message); return }
    setCollectionItems(prev => [data as ResearchCollectionItem, ...prev])
  }

  async function deleteCollection(collection: ResearchCollection) {
    if (!confirm(`是否删除文献合集“${collection.name}”？合集内文献不会被删除。`)) return
    const { error } = await supabase.from('research_collections').delete().eq('id', collection.id)
    if (error) { alert('删除合集失败：' + error.message); return }
    setCollections(prev => prev.filter(item => item.id !== collection.id))
    setCollectionItems(prev => prev.filter(item => item.collection_id !== collection.id))
    if (activeCollectionId === collection.id) setActiveCollectionId(null)
  }

  async function rerunMetadataExtraction() {
    if (!active) return
    setAiBusy('metadata')
    const { data, error } = await apiJSON<{ item: ResearchItem }>('/api/research/metadata', {
      method: 'POST',
      body: JSON.stringify({ itemId: active.id }),
    })
    setAiBusy(null)
    if (error || !data?.item) { alert('重新识别失败：' + error); return }
    setItems(prev => prev.map(item => item.id === active.id ? data.item : item))
  }

  async function openPdf() {
    if (!active?.file_url) return
    const { data, error } = await apiJSON<{ url: string }>(`/api/research/file?itemId=${active.id}`)
    if (error || !data?.url) { alert('打开 PDF 失败：' + error); return }
    setPdfUrl(data.url)
  }

  async function saveNote(e: React.FormEvent) {
    e.preventDefault()
    if (!active || !userId || !noteContent.trim()) return
    const { data, error } = await supabase
      .from('research_notes')
      .insert({
        item_id: active.id,
        user_id: userId,
        note_type: noteType,
        content: noteContent.trim(),
        page_number: notePage ? Number(notePage) : null,
        selected_text: noteSelected,
        related_writing_project_id: noteProjectId || null,
      })
      .select()
      .single()
    if (error) { alert('保存笔记失败：' + error.message); return }
    setNotes(prev => [data as ResearchNote, ...prev])
    setNoteContent('')
    setNoteSelected('')
    setNotePage('')
  }

  async function runAi(action: string) {
    if (!active) return
    setAiBusy(action)
    const { data, error } = await apiJSON<{ note: ResearchNote; provider: string; model: string }>('/api/research/ai', {
      method: 'POST',
      body: JSON.stringify({ itemId: active.id, action }),
    })
    setAiBusy(null)
    if (error || !data?.note) { alert('AI 阅读辅助失败：' + error); return }
    setNotes(prev => [data.note, ...prev])
  }

  const citation = active ? formatCitation(active, 'apa') : null

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="bg-white rounded-2xl border border-line min-h-[calc(100vh-40px)]">
          <MainContent size="wide">
            <PageHeader
              backHref="/writing"
              backLabel="返回论文写作工坊"
              eyebrow="Research Library"
              title="文献阅读库"
              description="上传、管理和阅读论文文献，生成阅读笔记，并将引用插入论文正文。"
              actions={
                <>
                  <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) void uploadPdf(file)
                  }} />
                  <Button variant="secondary" onClick={() => setShowImport('bibtex')}>导入 BibTeX</Button>
                  <Button variant="secondary" onClick={() => setShowImport('ris')}>导入 RIS</Button>
                  <Button variant="secondary" onClick={() => setShowNew(true)}>新建文献条目</Button>
                  <Button variant="brand" loading={uploading} onClick={() => fileInputRef.current?.click()}>{uploading ? '上传中...' : '上传文献'}</Button>
                </>
              }
            />

            <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(380px,1fr)_380px] gap-6">
              <Card padding="lg" variant="surface">
                <Eyebrow tone="muted" className="mb-3">Collections</Eyebrow>
                <h2 className="font-serif text-xl text-ink-900" style={{ marginBottom: 18 }}>文献集合</h2>
                <div className="text-sm" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    ['all', `全部文献 · ${items.length}`],
                    ['pdf', `有 PDF · ${items.filter(i => i.file_url).length}`],
                    ['no-pdf', `无 PDF · ${items.filter(i => !i.file_url).length}`],
                    ['uncategorized', `待归类 · ${items.filter(i => (i.tags || []).length === 0 || i.tags.includes('待归类')).length}`],
                    ['missing', `缺信息 · ${items.filter(i => Array.isArray(i.metadata?.missingFields) && i.metadata.missingFields.length > 0).length}`],
                  ].map(([value, label]) => (
                    <button key={value} type="button" onClick={() => { setActiveCollectionId(null); setCategoryFilter(value) }}
                      className={`w-full rounded-xl border text-left ${!activeCollectionId && categoryFilter === value ? 'border-brand/30 bg-brand-50/60 text-ink-900' : 'border-line bg-white text-ink-700 hover:bg-canvas/50'}`}
                      style={{ padding: '11px 16px', minHeight: 44, lineHeight: 1.45 }}>
                      {label}
                    </button>
                  ))}
                  {categoryOptions.length > 0 && (
                    <div className="pt-3">
                      <p className="mb-2 text-xs uppercase tracking-[0.16em] text-ink-400">分类标签</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {categoryOptions.slice(0, 12).map(category => (
                          <button key={category} type="button" onClick={() => setCategoryFilter(category)}
                            className={`w-full rounded-xl border text-left text-xs ${categoryFilter === category ? 'border-brand/30 bg-brand-50/60 text-ink-900' : 'border-line bg-white text-ink-600 hover:bg-canvas/50'}`}
                            style={{ padding: '10px 16px', minHeight: 40, lineHeight: 1.45 }}>
                            {category}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="rounded-2xl border border-line bg-white" style={{ marginTop: 24, padding: 16 }}>
                  <div className="flex items-center justify-between gap-2" style={{ marginBottom: 14 }}>
                    <p className="text-xs font-medium text-ink-700">主题合集</p>
                    <button type="button" onClick={createCollection}
                      className="rounded-lg border border-line text-[11px] text-ink-600 hover:bg-canvas"
                      style={{ padding: '5px 10px' }}>
                      新建
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {collections.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-line bg-canvas/40 text-xs leading-5 text-ink-500"
                        style={{ padding: '13px 16px' }}>
                        还没有合集。新建后可把文献拖进来。
                      </p>
                    ) : collections.map(collection => (
                      <div key={collection.id}
                        onDragOver={e => { e.preventDefault(); setDragOverCollectionId(collection.id) }}
                        onDragLeave={() => setDragOverCollectionId(null)}
                        onDrop={e => {
                          e.preventDefault()
                          const itemId = e.dataTransfer.getData('text/plain')
                          setDragOverCollectionId(null)
                          if (itemId) void addItemToCollection(itemId, collection.id)
                        }}
                        className={`group flex items-center gap-2 rounded-xl border transition-colors ${
                          activeCollectionId === collection.id
                            ? 'border-brand/30 bg-brand-50/60'
                            : dragOverCollectionId === collection.id
                              ? 'border-brand bg-brand-50'
                              : 'border-line bg-white hover:bg-canvas/50'
                        }`}
                        style={{ padding: '11px 14px', minHeight: 48 }}>
                        <button type="button" onClick={() => { setActiveCollectionId(collection.id); setCategoryFilter('all') }}
                          className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-xs font-medium text-ink-800">{collection.name}</span>
                          <span className="mt-0.5 block text-[11px] text-ink-400">{collectionCounts[collection.id] ?? 0} 篇文献</span>
                        </button>
                        <button type="button" onClick={() => deleteCollection(collection)}
                          className="rounded-md px-1.5 py-1 text-[11px] text-ink-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100">
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                  {collections.length > 0 && (
                    <p className="mt-3 text-[11px] leading-5 text-ink-400">拖动右侧文献到合集，即可建立主题分类。</p>
                  )}
                </div>
                <div className="rounded-2xl border border-line bg-white" style={{ marginTop: 24, padding: 16 }}>
                  <p className="text-xs font-medium text-ink-700" style={{ marginBottom: 14 }}>批量管理</p>
                  <div className="grid grid-cols-1" style={{ gap: 10 }}>
                    <Button size="sm" variant={selectMode ? 'secondary' : 'ghost'} fullWidth onClick={() => {
                      setSelectMode(v => !v)
                      setSelectedItemIds(new Set())
                    }}>
                      {selectMode ? '退出选择' : '选择删除'}
                    </Button>
                    {selectMode && (
                      <>
                        <Button size="sm" variant="secondary" fullWidth onClick={toggleSelectAllVisible}>
                          {visible.length > 0 && visible.every(item => selectedItemIds.has(item.id)) ? '取消全选当前列表' : '全选当前列表'}
                        </Button>
                        <Button size="sm" variant="danger" fullWidth loading={bulkDeleting} disabled={selectedItemIds.size === 0 || bulkDeleting} onClick={deleteSelectedItems}>
                          删除已选 · {selectedItemIds.size}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="space-y-3" style={{ marginTop: 24 }}>
                  <Input label="搜索" value={query} onChange={e => setQuery(e.target.value)} placeholder="标题、作者、关键词..." />
                  <Select label="阅读状态" value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}>
                    <option value="all">全部状态</option>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{READING_STATUS_LABEL[s]}</option>)}
                  </Select>
                  <Select label="文献类型" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                    <option value="all">全部类型</option>
                    {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </div>
              </Card>

              <Card padding="none" className="overflow-hidden">
                <div className="border-b border-line bg-canvas/40" style={{ paddingLeft: 42, paddingRight: 34, paddingTop: 24, paddingBottom: 22 }}>
                  <Eyebrow tone="muted" className="mb-2">Library Items</Eyebrow>
                  <h2 className="font-serif text-xl text-ink-900 leading-7">文献列表</h2>
                </div>
                {selectMode && (
                  <div className="border-b border-line bg-white px-7 py-3 text-xs text-ink-500">
                    已进入选择删除模式。点击文献行可勾选，当前已选 {selectedItemIds.size} 条。
                  </div>
                )}
                <div className="divide-y divide-line">
                  {loading ? (
                    <div className="p-10 text-center text-sm text-ink-500">加载中...</div>
                  ) : visible.length === 0 ? (
                    <div className="p-10 text-center text-sm text-ink-500">还没有文献。可以上传 PDF，或导入 BibTeX / RIS。</div>
                  ) : visible.map(item => (
                    <button key={item.id} type="button" onClick={() => chooseItem(item.id)}
                      draggable={!selectMode}
                      onDragStart={e => {
                        e.dataTransfer.setData('text/plain', item.id)
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      className={`w-full text-left transition-colors ${item.id === active?.id ? 'bg-brand-50/50' : 'bg-white hover:bg-canvas/50'}`}
                      style={{ paddingLeft: 42, paddingRight: 34, paddingTop: 22, paddingBottom: 22 }}>
                      <div className="flex items-start justify-between gap-5">
                        {selectMode && (
                          <span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selectedItemIds.has(item.id) ? 'border-brand bg-brand text-white' : 'border-line bg-white'}`}>
                            {selectedItemIds.has(item.id) ? '✓' : ''}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="font-serif text-lg text-ink-900 leading-8 break-words">{item.title || '未命名文献'}</h3>
                          <p className="text-sm text-ink-600 mt-2 leading-6 break-words">{item.authors || '作者未填写'} · {item.year || '年份未知'}</p>
                          <p className="text-xs text-ink-500 mt-2 leading-5 break-words">{item.source_title || '来源未填写'} · {READING_STATUS_LABEL[item.reading_status]}</p>
                        </div>
                        <span className="shrink-0 text-[10px] rounded-full border border-line bg-white px-2.5 py-1 text-ink-500">{item.file_url ? 'PDF' : '手动'}</span>
                      </div>
                      {(item.tags || []).length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.tags.map(tag => <span key={tag} className="rounded-full bg-canvas px-2.5 py-1 text-[11px] text-ink-500">{tag}</span>)}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </Card>

              <aside className="space-y-6">
                <Card padding="lg" variant="surface">
                  <Eyebrow tone="brand" className="mb-3">Details</Eyebrow>
                  {active ? (
                    <>
                      <h2 className="font-serif text-xl text-ink-900 leading-8 mb-3">{active.title || '未命名文献'}</h2>
                      <div className="space-y-2 text-sm text-ink-600 leading-6">
                        <p>作者：{active.authors || '未填写'}</p>
                        <p>年份：{active.year || '未填写'}</p>
                        <p>来源：{active.source_title || '未填写'}</p>
                        <p>DOI：{active.doi || '未填写'}</p>
                      </div>
                      <div
                        className="mt-5 rounded-2xl border border-line bg-white"
                        style={{ padding: '28px 30px 30px' }}
                      >
                        <Eyebrow tone="brand" className="mb-3">Auto Metadata</Eyebrow>
                        <h3 className="font-serif text-lg text-ink-900 mb-4">自动识别与归类</h3>
                        <div className="space-y-[18px]">
                          <Input label="题目" value={active.title || ''} onChange={e => updateActive({ title: e.target.value })} />
                          <Input label="作者" value={active.authors || ''} onChange={e => updateActive({ authors: e.target.value })} />
                          <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2">
                            <Input label="发表时间" value={active.year || ''} onChange={e => updateActive({ year: e.target.value })} />
                            <Input label="影响因子" value={String(active.metadata?.impactFactor || '')} onChange={e => updateActiveMetadata({ impactFactor: e.target.value })} placeholder="手动填写" />
                          </div>
                          <Input label="发表期刊 / 来源" value={active.source_title || ''} onChange={e => updateActive({ source_title: e.target.value })} />
                          <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2">
                            <Input label="期刊分区" value={String(active.metadata?.journalQuartile || '')} onChange={e => updateActiveMetadata({ journalQuartile: e.target.value })} placeholder="如 Q1 / CSSCI" />
                            <Select label="引用格式" value={String(active.metadata?.citationStyle || 'APA')} onChange={e => updateActiveMetadata({ citationStyle: e.target.value })}>
                              <option value="APA">APA</option>
                              <option value="GB/T 7714">GB/T 7714</option>
                              <option value="MLA">MLA</option>
                              <option value="Chicago">Chicago</option>
                            </Select>
                          </div>
                          <Input label="学科分类 / 期刊类别" value={String(active.metadata?.journalCategory || '')} onChange={e => updateActiveMetadata({ journalCategory: e.target.value })} placeholder="如 Translation Studies" />
                          <Textarea label="摘要重点" rows={4} value={String(active.metadata?.abstractKeyPoints || '')} onChange={e => updateActiveMetadata({ abstractKeyPoints: e.target.value })} />
                          <Input label="自动归类标签" value={(Array.isArray(active.metadata?.autoClassifiedAs) ? active.metadata?.autoClassifiedAs : active.tags || []).join('；')} onChange={e => {
                            const tags = splitList(e.target.value)
                            void updateActive({ tags, metadata: { ...(active.metadata || {}), autoClassifiedAs: tags } })
                          }} />
                          <Input label="待补全字段" value={(Array.isArray(active.metadata?.missingFields) ? active.metadata?.missingFields : []).join('；')} onChange={e => updateActiveMetadata({ missingFields: splitList(e.target.value) })} />
                          <p className="text-xs text-ink-500 leading-5">
                            识别置信度：{String(active.metadata?.recognitionConfidence || '未识别')}。影响因子和分区需要外部期刊数据库，目前先提供手动补全字段。
                          </p>
                        </div>
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <Select label="状态" value={active.reading_status} onChange={e => updateActive({ reading_status: e.target.value as ReadingStatus })}>
                          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{READING_STATUS_LABEL[s]}</option>)}
                        </Select>
                        <Select label="类型" value={active.publication_type} onChange={e => updateActive({ publication_type: e.target.value })}>
                          {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </Select>
                      </div>
                      <Textarea className="mt-4" label="摘要" rows={5} value={active.abstract || ''} onChange={e => updateActive({ abstract: e.target.value })} />
                      <Input className="mt-4" label="标签" value={(active.tags || []).join('；')} onChange={e => updateActive({ tags: splitList(e.target.value) })} />
                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <Button variant="secondary" disabled={!active.file_url} onClick={openPdf}>打开 PDF</Button>
                        <Button variant="secondary" onClick={() => navigator.clipboard.writeText(citation?.reference || '')}>复制引用</Button>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <Button variant="secondary" disabled={!active.file_url || !!aiBusy} loading={aiBusy === 'metadata'} onClick={rerunMetadataExtraction}>
                          {aiBusy === 'metadata' ? '识别中...' : '重新识别'}
                        </Button>
                        <Button variant="ghost" onClick={deleteActive}>删除文献</Button>
                      </div>
                      {citation && (
                        <div className="mt-5 rounded-xl border border-line bg-white px-4 py-3">
                          <p className="text-xs text-ink-500 mb-1">APA 引用</p>
                          <p className="text-sm text-ink-800 leading-6">{citation.reference}</p>
                        </div>
                      )}
                    </>
                  ) : <p className="text-sm text-ink-500">请选择一篇文献。</p>}
                </Card>

                <Card padding="lg">
                  <Eyebrow tone="muted" className="mb-3">AI Reading</Eyebrow>
                  <h3 className="font-serif text-lg text-ink-900 mb-4">AI 阅读辅助</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      ['summary', '总结摘要'],
                      ['questions', '提取研究问题'],
                      ['theory', '提取理论框架'],
                      ['method', '提取研究方法'],
                      ['findings', '提取主要发现'],
                      ['note', '生成中文阅读笔记'],
                      ['review_draft', '生成文献综述段落草稿'],
                      ['quotable', '找出可引用观点'],
                    ].map(([key, label]) => (
                      <Button key={key} size="sm" variant="secondary" disabled={!active || !!aiBusy} loading={aiBusy === key} onClick={() => runAi(key)}>
                        {aiBusy === key ? '生成中...' : label}
                      </Button>
                    ))}
                  </div>
                </Card>
              </aside>
            </div>

            {active && (
              <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 mt-7">
                <Card padding="lg">
                  <div className="flex items-center justify-between gap-4 mb-5">
                    <div>
                      <Eyebrow tone="muted" className="mb-2">PDF Reader</Eyebrow>
                      <h2 className="font-serif text-xl text-ink-900">PDF 阅读区</h2>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button variant="secondary" disabled={!active.file_url} onClick={openPdf}>刷新预览链接</Button>
                      <Button variant="brand" disabled={!pdfUrl} onClick={() => setPdfFullscreen(true)}>全屏阅读</Button>
                    </div>
                  </div>
                  {pdfUrl ? (
                    <iframe src={pdfUrl} title={active.title} className="w-full min-h-[720px] rounded-2xl border border-line bg-canvas" />
                  ) : (
                    <div className="min-h-[420px] rounded-2xl border border-dashed border-line bg-canvas/50 flex items-center justify-center text-sm text-ink-500">
                      {active.file_url ? '点击“打开 PDF”开始阅读。浏览器 PDF 工具支持翻页、缩放和搜索。' : '该文献还没有上传 PDF。'}
                    </div>
                  )}
                </Card>

                <Card padding="lg">
                  <Eyebrow tone="brand" className="mb-3">Reading Notes</Eyebrow>
                  <h2 className="font-serif text-xl text-ink-900 mb-5">阅读笔记</h2>
                  <form onSubmit={saveNote} className="space-y-4">
                    <Select label="笔记类型" value={noteType} onChange={e => setNoteType(e.target.value)}>
                      {NOTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </Select>
                    <Input label="页码" value={notePage} onChange={e => setNotePage(e.target.value)} placeholder="如 12" />
                    <Textarea label="摘录原文" rows={3} value={noteSelected} onChange={e => setNoteSelected(e.target.value)} />
                    <Textarea label="我的笔记" rows={5} value={noteContent} onChange={e => setNoteContent(e.target.value)} required />
                    <Select label="关联论文项目" value={noteProjectId} onChange={e => setNoteProjectId(e.target.value)}>
                      <option value="">不关联</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                    </Select>
                    <Button variant="brand" type="submit" fullWidth>保存笔记</Button>
                  </form>
                  <div className="mt-7 space-y-4">
                    {activeNotes.map(note => (
                      <div key={note.id} className="rounded-xl border border-line bg-canvas/40 px-4 py-3">
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <span className="text-xs rounded-full bg-white border border-line px-2 py-1 text-ink-600">{note.note_type}</span>
                          {note.page_number && <span className="text-xs text-ink-400">p. {note.page_number}</span>}
                        </div>
                        {note.selected_text && <p className="text-xs text-ink-500 leading-5 mb-2">摘录：{note.selected_text}</p>}
                        <p className="text-sm text-ink-800 leading-6 whitespace-pre-wrap">{note.content}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </section>
            )}
          </MainContent>
        </div>
      </main>

      {showNew && (
        <Modal title="新建文献条目" onClose={() => setShowNew(false)}>
          <form onSubmit={createManual} className="space-y-4">
            <Input label="标题" value={draftItem.title || ''} onChange={e => setDraftItem(v => ({ ...v, title: e.target.value }))} required />
            <Input label="作者" value={draftItem.authors || ''} onChange={e => setDraftItem(v => ({ ...v, authors: e.target.value }))} placeholder="多位作者用；分隔" />
            <div className="grid grid-cols-2 gap-4">
              <Input label="年份" value={draftItem.year || ''} onChange={e => setDraftItem(v => ({ ...v, year: e.target.value }))} />
              <Select label="类型" value={draftItem.publication_type || 'article'} onChange={e => setDraftItem(v => ({ ...v, publication_type: e.target.value }))}>
                {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
            <Input label="期刊 / 来源" value={draftItem.source_title || ''} onChange={e => setDraftItem(v => ({ ...v, source_title: e.target.value }))} />
            <Input label="DOI" value={draftItem.doi || ''} onChange={e => setDraftItem(v => ({ ...v, doi: e.target.value }))} />
            <Input label="URL" value={draftItem.url || ''} onChange={e => setDraftItem(v => ({ ...v, url: e.target.value }))} />
            <Textarea label="摘要" rows={4} value={draftItem.abstract || ''} onChange={e => setDraftItem(v => ({ ...v, abstract: e.target.value }))} />
            <Input label="关键词" value={(draftItem.keywords || []).join('；')} onChange={e => setDraftItem(v => ({ ...v, keywords: splitList(e.target.value) }))} />
            <Input label="标签" value={(draftItem.tags || []).join('；')} onChange={e => setDraftItem(v => ({ ...v, tags: splitList(e.target.value) }))} />
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" fullWidth type="button" onClick={() => setShowNew(false)}>取消</Button>
              <Button variant="primary" fullWidth type="submit">保存文献</Button>
            </div>
          </form>
        </Modal>
      )}

      {showImport && (
        <Modal title={showImport === 'bibtex' ? '导入 BibTeX' : '导入 RIS'} onClose={() => setShowImport(null)}>
          <Textarea rows={12} label="粘贴内容" value={importText} onChange={e => setImportText(e.target.value)} />
          <div className="flex gap-3 mt-5">
            <Button variant="secondary" fullWidth onClick={() => setShowImport(null)}>取消</Button>
            <Button variant="primary" fullWidth onClick={() => importEntries(showImport)}>导入</Button>
          </div>
        </Modal>
      )}

      {pdfFullscreen && active && pdfUrl && (
        <div className="fixed inset-0 z-[60] bg-ink-900/80 backdrop-blur-sm p-4 md:p-6">
          <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/20 bg-white shadow-[0_24px_80px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between gap-4 border-b border-line bg-canvas/70 px-6 py-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.22em] text-ink-400">PDF Reader</p>
                <h3 className="truncate font-serif text-xl text-ink-900">{active.title || 'PDF 阅读'}</h3>
              </div>
              <Button variant="secondary" onClick={() => setPdfFullscreen(false)}>退出全屏</Button>
            </div>
            <iframe src={pdfUrl} title={`${active.title} 全屏阅读`} className="h-full w-full flex-1 bg-canvas" />
          </div>
        </div>
      )}
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-[var(--shadow-modal)] max-h-[90vh] overflow-y-auto" style={{ padding: 40 }}>
        <div className="flex items-center justify-between gap-4 mb-6">
          <h3 className="font-serif text-2xl text-ink-900">{title}</h3>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-900">关闭</button>
        </div>
        {children}
      </div>
    </div>
  )
}
