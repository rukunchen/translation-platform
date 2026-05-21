'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { MainContent } from '@/components/ui/MainContent'
import { supabase } from '@/lib/supabase'
import {
  CHINESE_PAPER_TYPES,
  DEFAULT_EN_FORMAT_RULES,
  DEFAULT_ZH_FORMAT_RULES,
  ENGLISH_PAPER_TYPES,
  makeSectionKey,
  normalizeFormatRules,
  type WritingFormatRules,
  type WritingLanguage,
  type WritingSectionDefinition,
  type WritingTemplateRecord,
} from '@/lib/writingTemplates'

export default function TemplateEditorPage() {
  const router = useRouter()
  const params = useParams()
  const templateId = params.templateId as string
  const isNew = templateId === 'new'
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [language, setLanguage] = useState<WritingLanguage>('zh')
  const [paperType, setPaperType] = useState('课程论文')
  const [description, setDescription] = useState('')
  const [rules, setRules] = useState<WritingFormatRules>(DEFAULT_ZH_FORMAT_RULES)
  const [sections, setSections] = useState<WritingSectionDefinition[]>([
    { key: 'title', title: '题目', order: 1, required: true, description: '论文标题' },
    { key: 'abstract', title: '摘要', order: 2, required: true, description: '中文摘要' },
    { key: 'keywords', title: '关键词', order: 3, required: true, description: '3-5 个关键词' },
    { key: 'body', title: '正文', order: 4, required: true, description: '论文主体' },
    { key: 'references', title: '参考文献', order: 5, required: true, description: '参考文献' },
  ])

  const load = useCallback(async () => {
    if (isNew) return
    setLoading(true)
    const { data, error } = await supabase
      .from('writing_templates')
      .select('*')
      .eq('id', templateId)
      .eq('is_system_template', false)
      .maybeSingle()
    if (error || !data) {
      setLoading(false)
      alert('模板不存在或无权编辑。')
      router.push('/writing/templates')
      return
    }
    const t = data as WritingTemplateRecord
    setName(t.name)
    setLanguage(t.language)
    setPaperType(t.paper_type)
    setDescription(t.description || '')
    setRules(normalizeFormatRules(t, t.language))
    setSections((t.section_structure as WritingSectionDefinition[]).map((s, index) => ({
      key: s.key || makeSectionKey(s.title, index),
      title: s.title,
      order: Number(s.order ?? index + 1),
      required: Boolean(s.required ?? true),
      description: s.description || '',
    })))
    setLoading(false)
  }, [isNew, router, templateId])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      setUserId(user.id)
      void load()
    })
  }, [load, router])

  function changeLanguage(next: WritingLanguage) {
    setLanguage(next)
    setPaperType(next === 'zh' ? '课程论文' : 'Course Paper')
    setRules(next === 'zh' ? DEFAULT_ZH_FORMAT_RULES : DEFAULT_EN_FORMAT_RULES)
  }

  function patchRule(next: Partial<WritingFormatRules>) {
    setRules(prev => ({ ...prev, ...next }))
  }

  function patchSection(index: number, patch: Partial<WritingSectionDefinition>) {
    setSections(prev => prev.map((s, i) => i === index ? { ...s, ...patch } : s))
  }

  function addSection() {
    setSections(prev => [...prev, {
      key: `section-${prev.length + 1}`,
      title: language === 'zh' ? `新章节 ${prev.length + 1}` : `New Section ${prev.length + 1}`,
      order: prev.length + 1,
      required: false,
      description: '',
    }])
  }

  function deleteSection(index: number) {
    setSections(prev => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 })))
  }

  function moveSection(index: number, direction: -1 | 1) {
    setSections(prev => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next.map((s, i) => ({ ...s, order: i + 1 }))
    })
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    if (!name.trim()) { alert('请填写模板名称。'); return }
    if (sections.length === 0) { alert('至少需要一个章节。'); return }
    setSaving(true)
    const payload = {
      name: name.trim(),
      language,
      paper_type: paperType,
      template_type: 'custom',
      description: description.trim(),
      format_rules: rules,
      section_structure: sections.map((s, index) => ({
        key: s.key.trim() || makeSectionKey(s.title, index),
        title: s.title.trim(),
        order: index + 1,
        required: s.required,
        description: s.description.trim(),
      })),
      is_system_template: false,
      created_by: userId,
      updated_at: new Date().toISOString(),
    }
    const query = isNew
      ? supabase.from('writing_templates').insert(payload).select().single()
      : supabase.from('writing_templates').update(payload).eq('id', templateId).select().single()
    const { data, error } = await query
    setSaving(false)
    if (error || !data) { alert('保存失败：' + (error?.message ?? '未知错误')); return }
    router.push('/writing/templates')
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

  const paperTypes = language === 'zh' ? CHINESE_PAPER_TYPES : ENGLISH_PAPER_TYPES

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="bg-white rounded-2xl border border-line min-h-[calc(100vh-40px)]">
          <MainContent size="wide">
            <PageHeader
              backHref="/writing/templates"
              backLabel="返回模板库"
              eyebrow="Template Editor"
              title={isNew ? '新建自定义模板' : '编辑自定义模板'}
              description="设置页面、正文、标题、摘要关键词、参考文献和章节结构。"
              actions={<Button variant="brand" onClick={() => document.getElementById('template-editor-submit')?.click()} loading={saving}>{saving ? '保存中...' : '保存模板'}</Button>}
            />

            <form onSubmit={save} className="space-y-7">
              <Card padding="md">
                <Card.Header><h2 className="font-serif text-xl text-ink-900">基本信息</h2></Card.Header>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Input label="模板名称" value={name} onChange={e => setName(e.target.value)} required />
                  <Select label="语言" value={language} onChange={e => changeLanguage(e.target.value as WritingLanguage)}>
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                  </Select>
                  <Select label="论文类型" value={paperType} onChange={e => setPaperType(e.target.value)}>
                    {paperTypes.map(type => <option key={type} value={type}>{type}</option>)}
                  </Select>
                  <Textarea label="模板说明" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
                </div>
              </Card>

              <Card padding="md">
                <Card.Header><h2 className="font-serif text-xl text-ink-900">页面与正文格式</h2></Card.Header>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                  <Select label="页面大小" value={rules.page.size} onChange={e => patchRule({ page: { ...rules.page, size: e.target.value as 'A4' | 'Letter' } })}>
                    <option value="A4">A4</option>
                    <option value="Letter">Letter</option>
                  </Select>
                  <Input label="上边距 cm" type="number" step="0.1" value={rules.page.marginTopCm} onChange={e => patchRule({ page: { ...rules.page, marginTopCm: Number(e.target.value) } })} />
                  <Input label="下边距 cm" type="number" step="0.1" value={rules.page.marginBottomCm} onChange={e => patchRule({ page: { ...rules.page, marginBottomCm: Number(e.target.value) } })} />
                  <Input label="左边距 cm" type="number" step="0.1" value={rules.page.marginLeftCm} onChange={e => patchRule({ page: { ...rules.page, marginLeftCm: Number(e.target.value) } })} />
                  <Input label="右边距 cm" type="number" step="0.1" value={rules.page.marginRightCm} onChange={e => patchRule({ page: { ...rules.page, marginRightCm: Number(e.target.value) } })} />
                  <Input label="中文字体" value={rules.body.fontChinese} onChange={e => patchRule({ body: { ...rules.body, fontChinese: e.target.value } })} />
                  <Input label="英文字体" value={rules.body.fontEnglish} onChange={e => patchRule({ body: { ...rules.body, fontEnglish: e.target.value } })} />
                  <Input label="字号 pt" type="number" value={rules.body.fontSizePt} onChange={e => patchRule({ body: { ...rules.body, fontSizePt: Number(e.target.value) } })} />
                  <Input label="行距" type="number" step="0.1" value={rules.body.lineSpacing} onChange={e => patchRule({ body: { ...rules.body, lineSpacing: Number(e.target.value) } })} />
                  <Input label="段前 pt" type="number" value={rules.body.paragraphSpacingBeforePt} onChange={e => patchRule({ body: { ...rules.body, paragraphSpacingBeforePt: Number(e.target.value) } })} />
                  <Input label="段后 pt" type="number" value={rules.body.paragraphSpacingAfterPt} onChange={e => patchRule({ body: { ...rules.body, paragraphSpacingAfterPt: Number(e.target.value) } })} />
                  <Input label="首行缩进" value={rules.body.firstLineIndent} onChange={e => patchRule({ body: { ...rules.body, firstLineIndent: e.target.value } })} />
                </div>
              </Card>

              <Card padding="md">
                <Card.Header><h2 className="font-serif text-xl text-ink-900">标题格式</h2></Card.Header>
                <div className="space-y-5">
                  {(['h1', 'h2', 'h3'] as const).map(level => {
                    const heading = rules.headings[level]
                    const label = level === 'h1' ? '一级标题' : level === 'h2' ? '二级标题' : '三级标题'
                    return (
                      <div key={level} className="rounded-xl border border-line bg-canvas/30 p-4">
                        <h3 className="font-serif text-lg text-ink-900 mb-4">{label}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                          <Input label="中文字体" value={heading.fontChinese} onChange={e => patchRule({ headings: { ...rules.headings, [level]: { ...heading, fontChinese: e.target.value } } })} />
                          <Input label="英文字体" value={heading.fontEnglish} onChange={e => patchRule({ headings: { ...rules.headings, [level]: { ...heading, fontEnglish: e.target.value } } })} />
                          <Input label="字号 pt" type="number" value={heading.fontSizePt} onChange={e => patchRule({ headings: { ...rules.headings, [level]: { ...heading, fontSizePt: Number(e.target.value) } } })} />
                          <Select label="是否加粗" value={heading.bold ? 'yes' : 'no'} onChange={e => patchRule({ headings: { ...rules.headings, [level]: { ...heading, bold: e.target.value === 'yes' } } })}>
                            <option value="yes">加粗</option>
                            <option value="no">不加粗</option>
                          </Select>
                          <Select label="对齐方式" value={heading.alignment} onChange={e => patchRule({ headings: { ...rules.headings, [level]: { ...heading, alignment: e.target.value as 'left' | 'center' | 'right' } } })}>
                            <option value="left">左对齐</option>
                            <option value="center">居中</option>
                            <option value="right">右对齐</option>
                          </Select>
                          <Input label="段前 pt" type="number" value={heading.spacingBeforePt} onChange={e => patchRule({ headings: { ...rules.headings, [level]: { ...heading, spacingBeforePt: Number(e.target.value) } } })} />
                          <Input label="段后 pt" type="number" value={heading.spacingAfterPt} onChange={e => patchRule({ headings: { ...rules.headings, [level]: { ...heading, spacingAfterPt: Number(e.target.value) } } })} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>

              <Card padding="md">
                <Card.Header><h2 className="font-serif text-xl text-ink-900">摘要、关键词与参考文献</h2></Card.Header>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                  <Select label="中文摘要" value={rules.abstract.requireChineseAbstract ? 'yes' : 'no'} onChange={e => patchRule({ abstract: { ...rules.abstract, requireChineseAbstract: e.target.value === 'yes' } })}>
                    <option value="yes">需要</option>
                    <option value="no">不需要</option>
                  </Select>
                  <Select label="英文摘要" value={rules.abstract.requireEnglishAbstract ? 'yes' : 'no'} onChange={e => patchRule({ abstract: { ...rules.abstract, requireEnglishAbstract: e.target.value === 'yes' } })}>
                    <option value="yes">需要</option>
                    <option value="no">不需要</option>
                  </Select>
                  <Input label="中文摘要上限" type="number" value={rules.abstract.maxChineseAbstractChars} onChange={e => patchRule({ abstract: { ...rules.abstract, maxChineseAbstractChars: Number(e.target.value) } })} />
                  <Input label="英文摘要上限" type="number" value={rules.abstract.maxEnglishAbstractWords} onChange={e => patchRule({ abstract: { ...rules.abstract, maxEnglishAbstractWords: Number(e.target.value) } })} />
                  <Input label="关键词最少" type="number" value={rules.abstract.keywordCountMin} onChange={e => patchRule({ abstract: { ...rules.abstract, keywordCountMin: Number(e.target.value) } })} />
                  <Input label="关键词最多" type="number" value={rules.abstract.keywordCountMax} onChange={e => patchRule({ abstract: { ...rules.abstract, keywordCountMax: Number(e.target.value) } })} />
                  <Input label="关键词分隔符" value={rules.abstract.keywordSeparator} onChange={e => patchRule({ abstract: { ...rules.abstract, keywordSeparator: e.target.value } })} />
                  <Select label="引用格式" value={rules.references.style} onChange={e => patchRule({ references: { ...rules.references, style: e.target.value as WritingFormatRules['references']['style'] } })}>
                    <option value="GB/T 7714">GB/T 7714</option>
                    <option value="APA">APA</option>
                    <option value="MLA">MLA</option>
                    <option value="Chicago">Chicago</option>
                    <option value="Custom">Custom</option>
                  </Select>
                  <Input label="参考文献标题" value={rules.references.heading} onChange={e => patchRule({ references: { ...rules.references, heading: e.target.value } })} />
                  <Select label="悬挂缩进" value={rules.references.hangingIndent ? 'yes' : 'no'} onChange={e => patchRule({ references: { ...rules.references, hangingIndent: e.target.value === 'yes' } })}>
                    <option value="yes">需要</option>
                    <option value="no">不需要</option>
                  </Select>
                  <Select label="按作者排序" value={rules.references.sortByAuthor ? 'yes' : 'no'} onChange={e => patchRule({ references: { ...rules.references, sortByAuthor: e.target.value === 'yes' } })}>
                    <option value="yes">需要</option>
                    <option value="no">不需要</option>
                  </Select>
                  <Select label="需要 DOI" value={rules.references.requireDoi ? 'yes' : 'no'} onChange={e => patchRule({ references: { ...rules.references, requireDoi: e.target.value === 'yes' } })}>
                    <option value="no">不需要</option>
                    <option value="yes">需要</option>
                  </Select>
                  <Select label="需要访问日期" value={rules.references.requireAccessDate ? 'yes' : 'no'} onChange={e => patchRule({ references: { ...rules.references, requireAccessDate: e.target.value === 'yes' } })}>
                    <option value="no">不需要</option>
                    <option value="yes">需要</option>
                  </Select>
                </div>
              </Card>

              <Card padding="md">
                <Card.Header>
                  <h2 className="font-serif text-xl text-ink-900">章节结构</h2>
                  <Button size="sm" variant="secondary" type="button" onClick={addSection}>添加章节</Button>
                </Card.Header>
                <div className="space-y-4">
                  {sections.map((section, index) => (
                    <div key={`${section.key}-${index}`} className="grid grid-cols-1 lg:grid-cols-[90px_1fr_1fr_120px_auto] gap-3 rounded-xl border border-line bg-canvas/30 p-4">
                      <Input label="顺序" value={index + 1} readOnly />
                      <Input label="章节 key" value={section.key} onChange={e => patchSection(index, { key: e.target.value })} />
                      <Input label="章节标题" value={section.title} onChange={e => patchSection(index, { title: e.target.value })} />
                      <Select label="必需" value={section.required ? 'yes' : 'no'} onChange={e => patchSection(index, { required: e.target.value === 'yes' })}>
                        <option value="yes">必需</option>
                        <option value="no">可选</option>
                      </Select>
                      <div className="flex items-end gap-2">
                        <Button size="sm" variant="ghost" type="button" disabled={index === 0} onClick={() => moveSection(index, -1)}>上移</Button>
                        <Button size="sm" variant="ghost" type="button" disabled={index === sections.length - 1} onClick={() => moveSection(index, 1)}>下移</Button>
                        <Button size="sm" variant="ghost" type="button" onClick={() => deleteSection(index)}>删除</Button>
                      </div>
                      <Textarea className="lg:col-span-5" label="章节说明" value={section.description} onChange={e => patchSection(index, { description: e.target.value })} rows={2} />
                    </div>
                  ))}
                </div>
              </Card>

              <button id="template-editor-submit" type="submit" className="hidden" />
            </form>
          </MainContent>
        </div>
      </main>
    </div>
  )
}
