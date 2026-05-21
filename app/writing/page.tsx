'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { PageHeader } from '@/components/ui/PageHeader'
import { MainContent } from '@/components/ui/MainContent'
import { supabase } from '@/lib/supabase'
import {
  CHINESE_PAPER_TYPES,
  ENGLISH_PAPER_TYPES,
  WRITING_TEMPLATES,
  countWords,
  findTemplate,
  getTemplateName,
  getTemplateSections,
  systemTemplateToRecord,
  type WritingLanguage,
  type WritingTemplateRecord,
} from '@/lib/writingTemplates'
import { exportWritingDocx } from '@/lib/writingExport'

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
  section_title: string
  content: string
  word_count: number
}

export default function WritingHomePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [projects, setProjects] = useState<WritingProject[]>([])
  const [sections, setSections] = useState<WritingSection[]>([])
  const [customTemplates, setCustomTemplates] = useState<WritingTemplateRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [language, setLanguage] = useState<WritingLanguage>('zh')
  const [paperType, setPaperType] = useState('课程论文')
  const [templateId, setTemplateId] = useState('zh-course-paper')

  const load = useCallback(async (uid: string) => {
    setLoading(true)
    const { data: rows, error } = await supabase
      .from('writing_projects')
      .select('*')
      .eq('user_id', uid)
      .order('updated_at', { ascending: false })
    if (error) {
      setProjects([])
      setSections([])
      setCustomTemplates([])
      setLoading(false)
      return
    }
    const { data: templateRows } = await supabase
      .from('writing_templates')
      .select('*')
      .eq('is_system_template', false)
      .eq('created_by', uid)
      .order('updated_at', { ascending: false })
    setCustomTemplates((templateRows ?? []) as WritingTemplateRecord[])
    const projectRows = (rows ?? []) as WritingProject[]
    setProjects(projectRows)
    if (projectRows.length > 0) {
      const { data: sectionRows } = await supabase
        .from('writing_sections')
        .select('id, writing_project_id, section_title, content, word_count')
        .in('writing_project_id', projectRows.map(p => p.id))
      setSections((sectionRows ?? []) as WritingSection[])
    } else {
      setSections([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      setUserId(user.id)
      void load(user.id)
    })
  }, [load, router])

  useEffect(() => {
    const selectedTemplate = new URLSearchParams(window.location.search).get('template')
    if (!selectedTemplate) return
    const template = findTemplate(selectedTemplate, customTemplates)
    if (template.id !== selectedTemplate) return
    window.setTimeout(() => {
      setLanguage(template.language)
      setPaperType(template.paper_type)
      setTemplateId(template.id)
      setShowCreate(true)
    }, 0)
  }, [customTemplates])

  const allTemplates = useMemo(
    () => [...WRITING_TEMPLATES.map(systemTemplateToRecord), ...customTemplates],
    [customTemplates]
  )
  const templateOptions = useMemo(() => allTemplates.filter(t => t.language === language), [allTemplates, language])
  const paperTypeOptions = language === 'zh' ? CHINESE_PAPER_TYPES : ENGLISH_PAPER_TYPES

  function changeLanguage(next: WritingLanguage) {
    setLanguage(next)
    const firstTemplate = allTemplates.find(t => t.language === next) ?? allTemplates[0]
    setTemplateId(firstTemplate.id)
    setPaperType(next === 'zh' ? '课程论文' : 'Course Paper')
  }

  async function createPaper(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    const cleanTitle = title.trim()
    if (!cleanTitle) { alert('请填写论文标题。'); return }
    const template = findTemplate(templateId, customTemplates)
    setCreating(true)
    const { data: project, error } = await supabase
      .from('writing_projects')
      .insert({
        user_id: userId,
        title: cleanTitle,
        language,
        paper_type: paperType,
        template_id: template.id,
        status: 'draft',
      })
      .select()
      .single()
    if (error || !project) {
      setCreating(false)
      alert('创建失败：' + (error?.message ?? '未知错误'))
      return
    }
    const sectionRows = getTemplateSections(template).map((section, index) => ({
      writing_project_id: project.id,
      section_key: section.key,
      section_title: section.title,
      section_order: index + 1,
      content: '',
      word_count: 0,
    }))
    const { error: sectionError } = await supabase.from('writing_sections').insert(sectionRows)
    setCreating(false)
    if (sectionError) {
      alert('章节创建失败：' + sectionError.message)
      return
    }
    router.push(`/writing/${project.id}`)
  }

  async function deletePaper(project: WritingProject) {
    if (!confirm(`确认删除论文「${project.title}」？此操作无法撤销。`)) return
    const { error } = await supabase.from('writing_projects').delete().eq('id', project.id)
    if (error) { alert('删除失败：' + error.message); return }
    setProjects(prev => prev.filter(p => p.id !== project.id))
    setSections(prev => prev.filter(s => s.writing_project_id !== project.id))
  }

  async function exportPaper(project: WritingProject) {
    const projectSections = sections
      .filter(s => s.writing_project_id === project.id)
      .map(s => ({ section_title: s.section_title, content: s.content || '' }))
    await exportWritingDocx(project, projectSections, customTemplates)
  }

  function statsFor(project: WritingProject) {
    const projectSections = sections.filter(s => s.writing_project_id === project.id)
    const totalWords = projectSections.reduce((sum, s) => sum + (s.word_count || countWords(s.content || '', project.language)), 0)
    const template = findTemplate(project.template_id, customTemplates)
    return { totalWords, templateName: getTemplateName(template) }
  }

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="bg-white rounded-2xl border border-line min-h-[calc(100vh-40px)]">
          <MainContent size="wide">
            <PageHeader
              backHref="/dashboard"
              backLabel="返回工作台"
              eyebrow="Academic Writing"
              title="论文写作工坊"
              description="创建中文论文、英文论文、课程论文、开题报告和翻译实践报告，支持模板化写作与 Word 导出。"
              actions={
                <>
                  <Button variant="secondary" onClick={() => router.push('/writing/library')}>文献阅读库</Button>
                  <Button variant="secondary" onClick={() => router.push('/writing/templates')}>模板库</Button>
                  <Button variant="brand" onClick={() => setShowCreate(true)}>新建论文</Button>
                </>
              }
            />

            <section className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-7">
              <div>
                <div className="flex items-end justify-between border-b border-line pb-5 mb-6">
                  <div>
                    <Eyebrow tone="muted" className="mb-2">My Papers</Eyebrow>
                    <h2 className="font-serif text-xl text-ink-900">我的论文</h2>
                  </div>
                  <span className="text-xs text-ink-500">{projects.length} 个论文项目</span>
                </div>

                {loading ? (
                  <Card padding="lg" className="text-center text-sm text-ink-500">加载中...</Card>
                ) : projects.length === 0 ? (
                  <Card padding="lg" className="text-center py-20">
                    <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                      <span className="text-brand font-serif text-2xl">W</span>
                    </div>
                    <h3 className="font-serif text-xl text-ink-900 mb-3">还没有论文项目。</h3>
                    <p className="text-ink-600 text-sm max-w-md mx-auto mb-7 leading-relaxed">
                      你可以选择中文或英文论文模板，创建第一篇论文。
                    </p>
                    <Button variant="brand" onClick={() => setShowCreate(true)}>创建第一篇论文</Button>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {projects.map(project => {
                      const stat = statsFor(project)
                      return (
                        <Card key={project.id} padding="md" interactive onClick={() => router.push(`/writing/${project.id}`)}>
                          <div className="flex items-start justify-between gap-4 mb-5">
                            <div className="min-w-0">
                              <h3 className="font-serif text-xl text-ink-900 truncate">{project.title}</h3>
                              <p className="text-xs text-ink-500 mt-1">{project.language === 'zh' ? '中文论文' : 'English Paper'} · {project.paper_type}</p>
                            </div>
                            <span className="text-[10px] uppercase tracking-wider rounded-full border border-amber-200 bg-amber-50 text-amber-800 px-2 py-1">
                              {project.status === 'draft' ? '草稿' : project.status}
                            </span>
                          </div>
                          <div className="space-y-2 text-sm text-ink-600 mb-6">
                            <p>模板：<span className="text-ink-900">{stat.templateName}</span></p>
                            <p>字数：<span className="text-ink-900 font-mono">{stat.totalWords}</span></p>
                            <p>最近修改：{new Date(project.updated_at).toLocaleString('zh-CN')}</p>
                          </div>
                          <div className="flex flex-wrap gap-2" onClick={e => e.stopPropagation()}>
                            <Button size="sm" variant="primary" onClick={() => router.push(`/writing/${project.id}`)}>继续写作</Button>
                            <Button size="sm" variant="secondary" onClick={() => exportPaper(project)}>导出</Button>
                            <Button size="sm" variant="ghost" onClick={() => deletePaper(project)}>删除</Button>
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </div>

              <aside>
                <Card padding="lg" variant="surface" className="mb-6">
                  <Eyebrow tone="brand" className="mb-3">Reading Library</Eyebrow>
                  <h3 className="font-serif text-xl text-ink-900 mb-3">文献阅读库</h3>
                  <p className="text-sm text-ink-600 leading-relaxed mb-5">
                    上传、管理和阅读论文文献，生成阅读笔记，并将引用插入论文正文。
                  </p>
                  <Button size="sm" variant="brand" fullWidth onClick={() => router.push('/writing/library')}>进入文献阅读库</Button>
                </Card>
                <Card padding="lg" variant="surface">
                  <Eyebrow tone="brand" className="mb-3">Template Library</Eyebrow>
                  <h3 className="font-serif text-xl text-ink-900 mb-3">模板库</h3>
                  <p className="text-sm text-ink-600 leading-relaxed mb-5">
                    内置中文课程论文、翻译实践报告、开题报告、APA、MLA、Chicago 和英文研究论文模板。
                  </p>
                  <div className="space-y-3.5">
                    {allTemplates.slice(0, 6).map(t => (
                      <div key={t.id} className="rounded-xl border border-line bg-white" style={{ padding: '14px 16px' }}>
                        <p className="text-sm text-ink-900 font-medium leading-relaxed break-words">{t.name}</p>
                        <p className="text-xs text-ink-500 mt-1.5 leading-relaxed">{getTemplateSections(t).length} 个章节 · {t.language === 'zh' ? '中文' : 'English'}</p>
                      </div>
                    ))}
                  </div>
                  <Button className="mt-6" size="sm" variant="secondary" fullWidth onClick={() => router.push('/writing/templates')}>查看模板库</Button>
                </Card>
              </aside>
            </section>
          </MainContent>
        </div>
      </main>

      {showCreate && (
        <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-[var(--shadow-modal)]" style={{ padding: 42 }}>
            <h3 className="font-serif text-2xl text-ink-900 mb-2 tracking-tight">新建论文</h3>
            <p className="text-ink-600 text-sm mb-7">选择语言、类型和格式模板，系统会自动生成章节结构。</p>
            <form onSubmit={createPaper} className="space-y-5">
              <Input label="论文标题" value={title} onChange={e => setTitle(e.target.value)} required placeholder="输入论文标题" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select label="论文语言" value={language} onChange={e => changeLanguage(e.target.value as WritingLanguage)}>
                  <option value="zh">中文论文</option>
                  <option value="en">English Paper</option>
                </Select>
                <Select label="论文类型" value={paperType} onChange={e => setPaperType(e.target.value)}>
                  {paperTypeOptions.map(type => <option key={type} value={type}>{type}</option>)}
                </Select>
              </div>
              <Select label="格式模板" value={templateId} onChange={e => setTemplateId(e.target.value)}>
                {templateOptions.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_system_template ? '' : '（我的模板）'}</option>)}
              </Select>
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" fullWidth type="button" onClick={() => setShowCreate(false)}>取消</Button>
                <Button variant="primary" fullWidth type="submit" loading={creating}>{creating ? '创建中...' : '创建论文'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
