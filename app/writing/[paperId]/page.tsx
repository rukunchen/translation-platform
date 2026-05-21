'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { PageHeader } from '@/components/ui/PageHeader'
import { MainContent } from '@/components/ui/MainContent'
import { cn } from '@/components/ui/cn'
import { supabase } from '@/lib/supabase'
import { exportWritingDocx } from '@/lib/writingExport'
import {
  WRITING_TEMPLATES,
  countWords,
  findTemplate,
  getTemplateName,
  getTemplateSections,
  normalizeFormatRules,
  systemTemplateToRecord,
  type WritingLanguage,
  type WritingTemplateRecord,
} from '@/lib/writingTemplates'
import { CitationStyle, ResearchItem, ResearchNote, formatCitation } from '@/lib/researchLibrary'

type WritingProject = {
  id: string
  user_id: string
  title: string
  language: WritingLanguage
  paper_type: string
  template_id: string
  status: string
  created_at: string
  updated_at: string
}

type WritingSection = {
  id: string
  writing_project_id: string
  section_key: string
  section_title: string
  section_order: number
  content: string
  word_count: number
  created_at: string
  updated_at: string
}

type FormatIssue = {
  type: string
  location: string
  current: string
  required: string
  suggestion: string
  severity: '低' | '中' | '高'
}

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function contentToEditorHtml(value: string) {
  if (!value.trim()) return ''
  if (looksLikeHtml(value)) return value
  return value
    .split(/\n{2,}/)
    .map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function contentToPlainText(value: string) {
  if (!value) return ''
  if (typeof window === 'undefined' || !looksLikeHtml(value)) return value
  const doc = new DOMParser().parseFromString(value, 'text/html')
  return doc.body.textContent || ''
}

export default function WritingEditorPage() {
  const router = useRouter()
  const params = useParams()
  const paperId = params.paperId as string
  const [project, setProject] = useState<WritingProject | null>(null)
  const [sections, setSections] = useState<WritingSection[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [formatIssues, setFormatIssues] = useState<FormatIssue[]>([])
  const [customTemplates, setCustomTemplates] = useState<WritingTemplateRecord[]>([])
  const [showSwitchTemplate, setShowSwitchTemplate] = useState(false)
  const [switchTemplateId, setSwitchTemplateId] = useState('')
  const [showCitation, setShowCitation] = useState(false)
  const [libraryItems, setLibraryItems] = useState<ResearchItem[]>([])
  const [libraryNotes, setLibraryNotes] = useState<ResearchNote[]>([])
  const [citationQuery, setCitationQuery] = useState('')
  const [citationStyle, setCitationStyle] = useState<CitationStyle>('apa')
  const [selectedLibraryItemId, setSelectedLibraryItemId] = useState('')
  const [selectedNoteId, setSelectedNoteId] = useState('')
  const [editorDragActive, setEditorDragActive] = useState(false)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const renderedEditorSectionIdRef = useRef<string | null>(null)

  function syncDraftFromEditor() {
    const next = editorRef.current?.innerHTML ?? ''
    setDraft(next)
    setDirty(true)
  }

  function focusEditor() {
    editorRef.current?.focus()
  }

  function insertHtmlIntoEditor(html: string) {
    focusEditor()
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0 && editorRef.current?.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0)
      range.deleteContents()
      const template = document.createElement('template')
      template.innerHTML = html
      const fragment = template.content
      const lastNode = fragment.lastChild
      range.insertNode(fragment)
      if (lastNode) {
        range.setStartAfter(lastNode)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
      }
    } else if (editorRef.current) {
      editorRef.current.insertAdjacentHTML('beforeend', html)
    }
    syncDraftFromEditor()
  }

  function placeCaretFromPoint(x: number, y: number) {
    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    }
    const range = doc.caretRangeFromPoint?.(x, y)
    const position = doc.caretPositionFromPoint?.(x, y)
    const selection = window.getSelection()
    if (!selection) return
    selection.removeAllRanges()
    if (range) {
      selection.addRange(range)
    } else if (position) {
      const nextRange = document.createRange()
      nextRange.setStart(position.offsetNode, position.offset)
      nextRange.collapse(true)
      selection.addRange(nextRange)
    }
  }

  function countEditorNodes(selector: string) {
    return editorRef.current?.querySelectorAll(selector).length ?? 0
  }

  function reportImageHtml(src: string, name = '') {
    const figureNumber = countEditorNodes('figure') + 1
    return `
      <figure class="report-figure">
        <img src="${src}" alt="${escapeHtml(name || `图 ${figureNumber}`)}" />
        <figcaption>图 ${figureNumber} 图片说明</figcaption>
      </figure>
      <p><br></p>
    `
  }

  function reportTableHtml(rows?: string[][]) {
    const tableNumber = countEditorNodes('table') + 1
    const tableRows = rows && rows.length > 0 ? rows : [
      ['项目', '内容', '备注'],
      ['', '', ''],
      ['', '', ''],
    ]
    const body = tableRows.map(row => (
      `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
    )).join('')
    return `
      <p class="report-table-caption">表 ${tableNumber} 表格标题</p>
      <table class="report-table">
        <tbody>${body}</tbody>
      </table>
      <p><br></p>
    `
  }

  function parsePlainTextTable(text: string) {
    if (!text.includes('\t')) return null
    const rows = text
      .trim()
      .split(/\r?\n/)
      .map(row => row.split('\t').map(cell => cell.trim()))
      .filter(row => row.some(Boolean))
    if (rows.length < 2) return null
    const maxColumns = Math.max(...rows.map(row => row.length))
    if (maxColumns < 2) return null
    return rows.map(row => [...row, ...Array.from({ length: maxColumns - row.length }, () => '')])
  }

  function normalizeDroppedHtml(html: string) {
    if (!html.trim()) return ''
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const table = doc.querySelector('table')
    if (table) {
      const rows = Array.from(table.querySelectorAll('tr')).map(row =>
        Array.from(row.querySelectorAll('th,td')).map(cell => cell.textContent?.trim() || '')
      ).filter(row => row.length > 0)
      return reportTableHtml(rows)
    }
    const img = doc.querySelector('img')
    if (img?.src) return reportImageHtml(img.src, img.alt || '')
    return ''
  }

  function insertImageFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const src = String(reader.result || '')
      insertHtmlIntoEditor(reportImageHtml(src, file.name))
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
    reader.readAsDataURL(file)
  }

  function insertTable() {
    insertHtmlIntoEditor(reportTableHtml())
  }

  function handleImagePicked(file?: File) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件。')
      return
    }
    insertImageFile(file)
  }

  function handleEditorDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setEditorDragActive(false)
    placeCaretFromPoint(e.clientX, e.clientY)

    const files = Array.from(e.dataTransfer.files || [])
    const imageFiles = files.filter(file => file.type.startsWith('image/'))
    if (imageFiles.length > 0) {
      imageFiles.forEach(insertImageFile)
      return
    }

    const html = e.dataTransfer.getData('text/html')
    const normalizedHtml = normalizeDroppedHtml(html)
    if (normalizedHtml) {
      insertHtmlIntoEditor(normalizedHtml)
      return
    }

    const text = e.dataTransfer.getData('text/plain')
    const rows = parsePlainTextTable(text)
    if (rows) {
      insertHtmlIntoEditor(reportTableHtml(rows))
    } else if (text.trim()) {
      insertHtmlIntoEditor(`<p>${escapeHtml(text.trim()).replace(/\n/g, '<br>')}</p>`)
    }
  }

  function handleEditorPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(e.clipboardData.files || [])
    const imageFiles = files.filter(file => file.type.startsWith('image/'))
    const html = e.clipboardData.getData('text/html')
    const normalizedHtml = normalizeDroppedHtml(html)
    const textRows = parsePlainTextTable(e.clipboardData.getData('text/plain'))

    if (imageFiles.length > 0 || normalizedHtml || textRows) {
      e.preventDefault()
      imageFiles.forEach(insertImageFile)
      if (normalizedHtml) insertHtmlIntoEditor(normalizedHtml)
      else if (textRows) insertHtmlIntoEditor(reportTableHtml(textRows))
    } else {
      setTimeout(syncDraftFromEditor, 0)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    const { data: projectRow, error } = await supabase
      .from('writing_projects')
      .select('*')
      .eq('id', paperId)
      .maybeSingle()
    if (error || !projectRow) {
      setProject(null)
      setSections([])
      setLoading(false)
      return
    }
    const { data: sectionRows } = await supabase
      .from('writing_sections')
      .select('*')
      .eq('writing_project_id', paperId)
      .order('section_order', { ascending: true })
    const { data: templateRows } = await supabase
      .from('writing_templates')
      .select('*')
      .eq('is_system_template', false)
      .order('updated_at', { ascending: false })
    const { data: libraryRows } = await supabase
      .from('research_library_items')
      .select('*')
      .order('updated_at', { ascending: false })
    const { data: noteRows } = await supabase
      .from('research_notes')
      .select('*')
      .order('created_at', { ascending: false })
    const nextSections = (sectionRows ?? []) as WritingSection[]
    setProject(projectRow as WritingProject)
    setSections(nextSections)
    setCustomTemplates((templateRows ?? []) as WritingTemplateRecord[])
    setLibraryItems((libraryRows ?? []) as ResearchItem[])
    setLibraryNotes((noteRows ?? []) as ResearchNote[])
    setSelectedLibraryItemId(((libraryRows ?? [])[0] as ResearchItem | undefined)?.id ?? '')
    setSwitchTemplateId((projectRow as WritingProject).template_id)
    const first = nextSections[0]
    setActiveId(first?.id ?? null)
    setDraft(first?.content ?? '')
    setDirty(false)
    setLoading(false)
  }, [paperId])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      void load()
    })
  }, [load, router])

  const activeSection = useMemo(
    () => sections.find(s => s.id === activeId) ?? sections[0] ?? null,
    [sections, activeId]
  )
  const allTemplates = useMemo(() => [...WRITING_TEMPLATES.map(systemTemplateToRecord), ...customTemplates], [customTemplates])
  const template = project ? findTemplate(project.template_id, customTemplates) : systemTemplateToRecord(WRITING_TEMPLATES[0])
  const rules = project ? normalizeFormatRules(template, project.language) : normalizeFormatRules(template, 'zh')
  const totalWords = project ? sections.reduce((sum, s) => {
    if (s.id === activeId) return sum + countWords(contentToPlainText(draft), project.language)
    return sum + (s.word_count || countWords(contentToPlainText(s.content || ''), project.language))
  }, 0) : 0
  const currentWords = project ? countWords(contentToPlainText(draft), project.language) : 0

  useEffect(() => {
    if (editorRef.current && activeId !== renderedEditorSectionIdRef.current) {
      editorRef.current.innerHTML = contentToEditorHtml(draft)
      renderedEditorSectionIdRef.current = activeId
    }
  }, [activeId, draft])

  function selectSection(section: WritingSection) {
    if (dirty && !confirm('当前章节尚未保存，切换章节会丢失未保存内容。是否继续？')) return
    setActiveId(section.id)
    setDraft(section.content || '')
    setDirty(false)
  }

  async function saveCurrent() {
    if (!project || !activeSection) return
    setSaving(true)
    const nextContent = editorRef.current?.innerHTML ?? draft
    const wc = countWords(contentToPlainText(nextContent), project.language)
    const { data, error } = await supabase
      .from('writing_sections')
      .update({ content: nextContent, word_count: wc, updated_at: new Date().toISOString() })
      .eq('id', activeSection.id)
      .select()
      .single()
    if (error) {
      setSaving(false)
      alert('保存失败：' + error.message)
      return
    }
    await supabase.from('writing_projects').update({ updated_at: new Date().toISOString() }).eq('id', project.id)
    setDraft(nextContent)
    setSections(prev => prev.map(s => s.id === activeSection.id ? data as WritingSection : s))
    setDirty(false)
    setSaving(false)
  }

  function runFormatCheck() {
    if (!project) return
    const issues: FormatIssue[] = []
    const templateSections = getTemplateSections(template)
    const byKeyOrTitle = (key: string, title: string) => sections.find(s =>
      s.section_key === key || s.section_title === title || s.section_title.toLowerCase() === title.toLowerCase()
    )
    const contentOf = (s?: WritingSection) => contentToPlainText(s?.id === activeId ? draft : s?.content || '').trim()

    templateSections.filter(s => s.required).forEach(requiredSection => {
      const matched = byKeyOrTitle(requiredSection.key, requiredSection.title)
      if (!matched) {
        issues.push({
          type: '缺少必需章节',
          location: requiredSection.title,
          current: '当前论文没有该章节',
          required: '模板要求该章节存在',
          suggestion: '更换模板后补充章节，或在模板中将该章节设为可选。',
          severity: '高',
        })
      } else if (!contentOf(matched)) {
        issues.push({
          type: '必需章节为空',
          location: matched.section_title,
          current: '章节内容为空',
          required: '模板要求该章节有正文内容',
          suggestion: '补充该章节内容。',
          severity: '高',
        })
      }
    })

    sections.forEach(section => {
      const inTemplate = templateSections.some(s => s.key === section.section_key || s.title === section.section_title)
      if (!inTemplate) {
        issues.push({
          type: '章节结构不匹配',
          location: section.section_title,
          current: '该章节不在当前模板中',
          required: '当前模板章节结构',
          suggestion: '如果内容仍有用，可以保留为未归类内容；如果不需要，可手动清理。',
          severity: '低',
        })
      }
    })

    const zhAbstract = sections.find(s => s.section_title.includes('中文摘要') || s.section_title === '摘要')
    if (rules.abstract.requireChineseAbstract && !contentOf(zhAbstract)) {
      issues.push({ type: '缺少中文摘要', location: '中文摘要 / 摘要', current: '未填写', required: '模板要求中文摘要', suggestion: '补充中文摘要章节内容。', severity: '高' })
    }
    if (zhAbstract) {
      const chars = countWords(contentOf(zhAbstract), 'zh')
      if (chars > rules.abstract.maxChineseAbstractChars) {
        issues.push({ type: '中文摘要过长', location: zhAbstract.section_title, current: `${chars} 字`, required: `不超过 ${rules.abstract.maxChineseAbstractChars} 字`, suggestion: '压缩研究背景或细节描述。', severity: '中' })
      }
    }
    const enAbstract = sections.find(s => s.section_title.toLowerCase().includes('abstract'))
    if (rules.abstract.requireEnglishAbstract && !contentOf(enAbstract)) {
      issues.push({ type: '缺少英文 Abstract', location: 'English Abstract / Abstract', current: '未填写', required: '模板要求英文摘要', suggestion: '补充英文 Abstract。', severity: '高' })
    }
    if (enAbstract) {
      const words = countWords(contentOf(enAbstract), 'en')
      if (words > rules.abstract.maxEnglishAbstractWords) {
        issues.push({ type: '英文摘要过长', location: enAbstract.section_title, current: `${words} words`, required: `不超过 ${rules.abstract.maxEnglishAbstractWords} words`, suggestion: '删减背景铺垫或细节。', severity: '中' })
      }
    }

    const keywordSection = sections.find(s => s.section_title.includes('关键词') || s.section_title.toLowerCase().includes('keywords'))
    const keywords = contentOf(keywordSection)
    if (keywordSection && keywords) {
      const count = keywords.split(new RegExp(`[${rules.abstract.keywordSeparator};；,，、]`)).map(x => x.trim()).filter(Boolean).length
      if (count < rules.abstract.keywordCountMin || count > rules.abstract.keywordCountMax) {
        issues.push({ type: '关键词数量不符', location: keywordSection.section_title, current: `${count} 个`, required: `${rules.abstract.keywordCountMin}-${rules.abstract.keywordCountMax} 个`, suggestion: `按模板使用 ${rules.abstract.keywordSeparator} 分隔关键词。`, severity: '中' })
      }
    }

    const referencesSection = sections.find(s => s.section_title === rules.references.heading || s.section_title.includes('参考文献') || s.section_title.toLowerCase().includes('references') || s.section_title.toLowerCase().includes('works cited'))
    if (!contentOf(referencesSection)) {
      issues.push({ type: '参考文献为空', location: rules.references.heading, current: '未填写', required: `${rules.references.style} 格式参考文献`, suggestion: '补充参考文献条目。', severity: '高' })
    }
    setFormatIssues(issues)
  }

  async function exportDocx() {
    if (!project) return
    const exportSections = sections.map(s => ({
      section_title: s.section_title,
      content: s.id === activeId ? draft : s.content || '',
    }))
    await exportWritingDocx(project, exportSections, customTemplates)
  }

  async function switchTemplate() {
    if (!project) return
    const nextTemplate = findTemplate(switchTemplateId, customTemplates)
    if (!nextTemplate || nextTemplate.id === project.template_id) { setShowSwitchTemplate(false); return }
    if (!confirm('切换模板不会删除已有正文内容，但可能会改变章节结构和导出格式。是否继续？')) return
    const templateSections = getTemplateSections(nextTemplate)
    const existing = sections.map(s => ({
      ...s,
      content: s.id === activeId ? draft : s.content,
      word_count: s.id === activeId ? countWords(contentToPlainText(draft), project.language) : s.word_count,
    }))
    const usedIds = new Set<string>()
    const updates: Array<PromiseLike<unknown>> = []
    const inserts: Array<Record<string, unknown>> = []

    templateSections.forEach((def, index) => {
      const matched = existing.find(s => !usedIds.has(s.id) && (s.section_key === def.key || s.section_title === def.title))
      if (matched) {
        usedIds.add(matched.id)
        updates.push(supabase.from('writing_sections').update({
          section_key: def.key,
          section_title: def.title,
          section_order: index + 1,
          updated_at: new Date().toISOString(),
        }).eq('id', matched.id))
      } else {
        inserts.push({
          writing_project_id: project.id,
          section_key: def.key,
          section_title: def.title,
          section_order: index + 1,
          content: '',
          word_count: 0,
        })
      }
    })

    const unmatched = existing.filter(s => !usedIds.has(s.id))
    unmatched.forEach((section, index) => {
      updates.push(supabase.from('writing_sections').update({
        section_key: section.section_key || `uncategorized-${index + 1}`,
        section_title: section.section_title.startsWith('未归类内容') ? section.section_title : `未归类内容 - ${section.section_title}`,
        section_order: templateSections.length + index + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', section.id))
    })

    await Promise.all(updates)
    if (inserts.length > 0) await supabase.from('writing_sections').insert(inserts)
    const { data, error } = await supabase
      .from('writing_projects')
      .update({ template_id: nextTemplate.id, language: nextTemplate.language, paper_type: nextTemplate.paper_type, updated_at: new Date().toISOString() })
      .eq('id', project.id)
      .select()
      .single()
    if (error) { alert('更换模板失败：' + error.message); return }
    setProject(data as WritingProject)
    setShowSwitchTemplate(false)
    await load()
  }

  const filteredLibraryItems = useMemo(() => {
    const needle = citationQuery.trim().toLowerCase()
    if (!needle) return libraryItems
    return libraryItems.filter(item => [
      item.title,
      item.authors,
      item.year,
      item.source_title,
      item.abstract,
      ...(item.tags || []),
      ...(item.keywords || []),
      JSON.stringify(item.metadata || {}),
    ].join(' ').toLowerCase().includes(needle))
  }, [libraryItems, citationQuery])

  const selectedLibraryItem = libraryItems.find(item => item.id === selectedLibraryItemId) ?? filteredLibraryItems[0] ?? null
  const selectedLibraryNotes = libraryNotes.filter(note => note.item_id === selectedLibraryItem?.id)

  async function insertCitation(kind: 'inText' | 'reference' | 'note') {
    if (!project || !activeSection || !selectedLibraryItem) return
    const index = Math.max(1, libraryItems.findIndex(item => item.id === selectedLibraryItem.id) + 1)
    const citation = formatCitation(selectedLibraryItem, citationStyle, index)

    const findReferenceSection = () => sections.find(s => {
      const title = s.section_title.toLowerCase()
      return s.section_title === rules.references.heading
        || s.section_title.includes('参考文献')
        || title.includes('references')
        || title.includes('works cited')
    })

    const ensureReferenceEntry = async () => {
      const refs = findReferenceSection()
      const entry = citation.reference.trim()
      const titleNeedle = (selectedLibraryItem.title || '').trim()
      if (!entry) return

      if (!refs) {
        const nextOrder = sections.reduce((max, section) => Math.max(max, section.section_order || 0), 0) + 1
        const sectionTitle = project.language === 'zh' ? '参考文献' : 'References'
        const { data, error } = await supabase
          .from('writing_sections')
          .insert({
            writing_project_id: project.id,
            section_key: 'references',
            section_title: sectionTitle,
            section_order: nextOrder,
            content: entry,
            word_count: countWords(entry, project.language),
          })
          .select()
          .single()
        if (error) { alert('同步参考文献失败：' + error.message); return }
        setSections(prev => [...prev, data as WritingSection].sort((a, b) => a.section_order - b.section_order))
        return
      }

      const currentContent = refs.id === activeId ? draft : refs.content || ''
      const alreadyExists = currentContent.includes(entry) || (!!titleNeedle && currentContent.includes(titleNeedle))
      if (alreadyExists) return

      const nextContent = `${currentContent}${currentContent.trim() ? '\n' : ''}${entry}`
      if (refs.id === activeId) {
        setDraft(nextContent)
        setDirty(true)
        if (editorRef.current) editorRef.current.innerHTML = contentToEditorHtml(nextContent)
        return
      }

      const { data, error } = await supabase
        .from('writing_sections')
        .update({ content: nextContent, word_count: countWords(nextContent, project.language), updated_at: new Date().toISOString() })
        .eq('id', refs.id)
        .select()
        .single()
      if (error) { alert('同步参考文献失败：' + error.message); return }
      setSections(prev => prev.map(s => s.id === refs.id ? data as WritingSection : s))
    }

    if (kind === 'inText') {
      setDraft(prev => `${prev}${prev.endsWith(' ') || prev.length === 0 ? '' : ' '}${citation.inText}`)
      insertHtmlIntoEditor(`<span>${escapeHtml(citation.inText)}</span>`)
      setDirty(true)
      await ensureReferenceEntry()
    } else if (kind === 'note') {
      const note = libraryNotes.find(n => n.id === selectedNoteId) ?? selectedLibraryNotes[0]
      if (!note) { alert('该文献没有可插入的阅读笔记'); return }
      setDraft(prev => `${prev}${prev.trim() ? '\n\n' : ''}${note.content}`)
      insertHtmlIntoEditor(`<p>${escapeHtml(note.content)}</p>`)
      setDirty(true)
    } else {
      await ensureReferenceEntry()
    }
    await supabase.from('writing_citations').insert({
      writing_project_id: project.id,
      section_id: activeSection.id,
      library_item_id: selectedLibraryItem.id,
      citation_style: citationStyle,
      citation_text: kind === 'note' ? (libraryNotes.find(n => n.id === selectedNoteId)?.content || selectedLibraryNotes[0]?.content || '') : kind === 'reference' ? citation.reference : citation.inText,
    })
  }

  if (loading) {
    return (
      <div className="flex h-screen bg-canvas">
        <Sidebar />
        <main className="flex-1 overflow-auto p-5">
          <div className="bg-white rounded-2xl border border-line min-h-[calc(100vh-40px)] flex items-center justify-center text-sm text-ink-500">加载中...</div>
        </main>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex h-screen bg-canvas">
        <Sidebar />
        <main className="flex-1 overflow-auto p-5">
          <div className="bg-white rounded-2xl border border-line min-h-[calc(100vh-40px)] flex items-center justify-center">
            <Card padding="lg" className="text-center">
              <h2 className="font-serif text-xl text-ink-900 mb-3">论文不存在或无权访问</h2>
              <Button onClick={() => router.push('/writing')}>返回论文写作工坊</Button>
            </Card>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="bg-white rounded-2xl border border-line min-h-[calc(100vh-40px)]">
          <MainContent size="wide">
            <PageHeader
              backHref="/writing"
              backLabel="返回论文写作工坊"
              eyebrow="Writing Editor"
              title={project.title}
              description={`${project.language === 'zh' ? '中文论文' : 'English Paper'} · ${project.paper_type} · ${getTemplateName(template)}`}
              actions={<Button variant="brand" onClick={exportDocx}>导出 Word</Button>}
            />

            <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_320px] gap-7">
              <Card padding="none" className="overflow-hidden">
                <div className="border-b border-line bg-canvas/50" style={{ paddingLeft: 36, paddingRight: 28, paddingTop: 26, paddingBottom: 24 }}>
                  <Eyebrow tone="muted" className="mb-2.5">Outline</Eyebrow>
                  <h2 className="font-serif text-xl text-ink-900 leading-7">论文大纲</h2>
                </div>
                <div className="space-y-3.5" style={{ paddingLeft: 24, paddingRight: 20, paddingTop: 22, paddingBottom: 22 }}>
                  {sections.map(section => {
                    const isActive = section.id === activeId
                    const content = isActive ? draft : section.content || ''
                    const words = project ? countWords(content, project.language) : 0
                    return (
                      <button key={section.id} type="button" onClick={() => selectSection(section)}
                        className={cn(
                          'w-full text-left rounded-xl border transition-colors',
                          isActive ? 'border-brand/50 bg-brand-50/70' : 'border-line bg-white hover:bg-canvas/50'
                        )}
                        style={{ paddingLeft: 28, paddingRight: 20, paddingTop: 17, paddingBottom: 17 }}>
                        <p className="text-sm font-medium text-ink-900 leading-6">{section.section_title}</p>
                        <p className="text-xs text-ink-500 mt-1.5">{words} 字 · {content.trim() ? '已填写' : '空章节'}</p>
                      </button>
                    )
                  })}
                </div>
              </Card>

              <Card padding="none" className="overflow-hidden">
                <div className="border-b border-line flex items-center justify-between gap-5" style={{ paddingLeft: 44, paddingRight: 34, paddingTop: 30, paddingBottom: 28 }}>
                  <div className="min-w-0">
                    <Eyebrow tone="brand" className="mb-2.5">Current Section</Eyebrow>
                    <h2 className="font-serif text-2xl text-ink-900 leading-9">{activeSection?.section_title}</h2>
                  </div>
                  <span className={cn(
                    'text-xs rounded-full border px-3 py-1',
                    dirty ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-green-50 text-green-700 border-green-100'
                  )}>
                    {dirty ? '未保存' : '已保存'}
                  </span>
                </div>
                <div className="p-8">
                  <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-canvas/40 px-4 py-3">
                    <Button size="sm" variant="secondary" onClick={() => imageInputRef.current?.click()}>插入图片</Button>
                    <Button size="sm" variant="secondary" onClick={insertTable}>插入表格</Button>
                    <span className="text-xs text-ink-500">可直接拖入图片、截图或表格，系统会按实践报告样式整理。</span>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => handleImagePicked(e.target.files?.[0])}
                    />
                  </div>
                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={syncDraftFromEditor}
                    onPaste={handleEditorPaste}
                    onDragEnter={() => setEditorDragActive(true)}
                    onDragOver={e => { e.preventDefault(); setEditorDragActive(true) }}
                    onDragLeave={e => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEditorDragActive(false)
                    }}
                    onDrop={handleEditorDrop}
                    className={cn(
                      'writing-rich-editor w-full min-h-[560px] overflow-auto rounded-2xl border-2 bg-white px-7 py-6 text-[15px] leading-8 text-ink-900 focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10',
                      editorDragActive ? 'border-brand bg-brand-50/30' : 'border-line'
                    )}
                    data-placeholder="在这里写作当前章节内容..."
                  />
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-ink-500">当前章节字数：<span className="font-mono text-ink-900">{currentWords}</span></p>
                    <Button onClick={saveCurrent} loading={saving} disabled={!dirty}>{saving ? '保存中...' : '保存'}</Button>
                  </div>
                </div>
              </Card>

              <aside className="space-y-6">
                <Card padding="lg" variant="surface">
                  <Eyebrow tone="muted" className="mb-3">Template</Eyebrow>
                  <h3 className="font-serif text-xl text-ink-900 mb-4 leading-7">{getTemplateName(template)}</h3>
                  <div className="space-y-3 text-sm text-ink-600 leading-6">
                    <p>语言：{project.language === 'zh' ? '中文论文' : 'English Paper'}</p>
                    <p>类型：{project.paper_type}</p>
                    <p>总字数：<span className="font-mono text-ink-900">{totalWords}</span></p>
                    <p>页面：{rules.page.size}</p>
                    <p>正文：{rules.body.fontChinese} / {rules.body.fontSizePt}pt</p>
                    <p>行距：{rules.body.lineSpacing}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 mt-7">
                    <Button variant="secondary" onClick={() => setShowCitation(true)}>插入文献</Button>
                    <Button variant="secondary" onClick={() => router.push('/writing/library')}>文献阅读库</Button>
                    <Button variant="secondary" onClick={() => setShowSwitchTemplate(true)}>更换模板</Button>
                    <Button variant="secondary" onClick={runFormatCheck}>检查格式</Button>
                    <Button variant="ghost" onClick={() => alert('模板格式将在导出 Word 时应用。')}>应用模板格式</Button>
                    <Button variant="brand" onClick={exportDocx}>导出 Word</Button>
                  </div>
                </Card>

                <Card padding="lg">
                  <Eyebrow tone="muted" className="mb-3">Format Check</Eyebrow>
                  <h3 className="font-serif text-lg text-ink-900 mb-5">格式检查结果</h3>
                  {formatIssues.length === 0 ? (
                    <p className="text-sm text-ink-500 leading-relaxed">点击“检查格式”后，这里会显示标题、摘要、关键词、参考文献和空章节等基础结构问题。</p>
                  ) : (
                    <div className="space-y-4">
                      {formatIssues.map((issue, index) => (
                        <div key={`${issue.location}-${index}`} className="rounded-xl border border-line bg-canvas/40 px-5 py-4">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <span className="text-sm font-medium text-ink-900">{issue.type}</span>
                            <span className={cn(
                              'text-[10px] rounded-full border px-2 py-0.5',
                              issue.severity === '高' ? 'bg-red-50 text-red-700 border-red-100'
                              : issue.severity === '中' ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-canvas text-ink-500 border-line'
                            )}>{issue.severity}</span>
                          </div>
                          <p className="text-xs text-ink-500 mb-2">{issue.location}</p>
                          <p className="text-sm text-ink-700 leading-6">当前情况：{issue.current}</p>
                          <p className="text-sm text-ink-700 leading-6">模板要求：{issue.required}</p>
                          <p className="text-sm text-ink-700 leading-6">建议：{issue.suggestion}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </aside>
            </div>
          </MainContent>
        </div>
      </main>
      {showCitation && (
        <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-[var(--shadow-modal)] max-h-[90vh] overflow-y-auto" style={{ padding: 40 }}>
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h3 className="font-serif text-2xl text-ink-900 mb-2">插入文献</h3>
                <p className="text-sm text-ink-600">选择文献，将正文引用、参考文献条目或阅读笔记插入当前论文。</p>
              </div>
              <button className="text-ink-400 hover:text-ink-900" onClick={() => setShowCitation(false)}>关闭</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-5">
              <div>
                <input
                  value={citationQuery}
                  onChange={e => setCitationQuery(e.target.value)}
                  placeholder="搜索标题、作者、关键词..."
                  className="w-full rounded-xl border-2 border-line px-5 py-3 text-sm focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                />
                <div className="mt-4 max-h-[360px] overflow-y-auto rounded-2xl border border-line divide-y divide-line">
                  {filteredLibraryItems.length === 0 ? (
                    <div className="p-8 text-center text-sm text-ink-500">暂无文献。请先进入文献阅读库上传或导入。</div>
                  ) : filteredLibraryItems.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { setSelectedLibraryItemId(item.id); setSelectedNoteId('') }}
                      className={`w-full text-left px-5 py-4 ${selectedLibraryItem?.id === item.id ? 'bg-brand-50/60' : 'bg-white hover:bg-canvas/50'}`}
                    >
                      <p className="font-serif text-base text-ink-900 leading-6">{item.title || '未命名文献'}</p>
                      <p className="text-xs text-ink-500 mt-1">{item.authors || '作者未填写'} · {item.year || '年份未知'}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <select value={citationStyle} onChange={e => setCitationStyle(e.target.value as CitationStyle)}
                  className="w-full rounded-xl border-2 border-line px-4 py-3 text-sm focus:outline-none focus:border-brand">
                  <option value="apa">APA</option>
                  <option value="gbt7714">GB/T 7714</option>
                  <option value="mla">MLA</option>
                </select>
                {selectedLibraryItem && (
                  <div className="rounded-2xl border border-line bg-canvas/40 px-4 py-3">
                    <p className="text-xs text-ink-500 mb-2">预览</p>
                    <p className="text-sm text-ink-800 leading-6">{formatCitation(selectedLibraryItem, citationStyle, Math.max(1, libraryItems.findIndex(item => item.id === selectedLibraryItem.id) + 1)).reference}</p>
                  </div>
                )}
                <select value={selectedNoteId} onChange={e => setSelectedNoteId(e.target.value)}
                  className="w-full rounded-xl border-2 border-line px-4 py-3 text-sm focus:outline-none focus:border-brand">
                  <option value="">选择阅读笔记...</option>
                  {selectedLibraryNotes.map(note => <option key={note.id} value={note.id}>{note.note_type} · {new Date(note.created_at).toLocaleDateString('zh-CN')}</option>)}
                </select>
                <Button variant="brand" fullWidth disabled={!selectedLibraryItem} onClick={() => insertCitation('inText')}>插入正文引用</Button>
                <Button variant="secondary" fullWidth disabled={!selectedLibraryItem} onClick={() => insertCitation('reference')}>插入参考文献条目</Button>
                <Button variant="secondary" fullWidth disabled={!selectedLibraryItem} onClick={() => insertCitation('note')}>插入阅读笔记</Button>
                <Button variant="ghost" fullWidth onClick={() => router.push('/writing/library')}>打开文献阅读库</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showSwitchTemplate && (
        <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-[var(--shadow-modal)]" style={{ padding: 40 }}>
            <h3 className="font-serif text-2xl text-ink-900 mb-2">更换模板</h3>
            <p className="text-sm text-ink-600 leading-relaxed mb-6">
              切换模板不会删除已有正文内容，但可能会改变章节结构和导出格式。
            </p>
            <select
              value={switchTemplateId}
              onChange={e => setSwitchTemplateId(e.target.value)}
              className="w-full bg-white text-base text-ink-900 border-2 border-line rounded-xl px-5 py-3.5 focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
            >
              {allTemplates.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_system_template ? '' : '（我的模板）'}</option>)}
            </select>
            <div className="flex gap-3 mt-7">
              <Button variant="secondary" fullWidth onClick={() => setShowSwitchTemplate(false)}>取消</Button>
              <Button variant="primary" fullWidth onClick={switchTemplate}>确认更换</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
