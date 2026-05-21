'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { PageHeader } from '@/components/ui/PageHeader'
import { MainContent } from '@/components/ui/MainContent'
import { supabase } from '@/lib/supabase'
import {
  WRITING_TEMPLATES,
  getTemplateDescription,
  getTemplateLanguage,
  getTemplatePaperType,
  getTemplateSections,
  isSystemTemplate,
  normalizeFormatRules,
  systemTemplateToRecord,
  type WritingTemplateRecord,
} from '@/lib/writingTemplates'

export default function WritingTemplatesPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [customTemplates, setCustomTemplates] = useState<WritingTemplateRecord[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (uid: string) => {
    setLoading(true)
    const { data } = await supabase
      .from('writing_templates')
      .select('*')
      .eq('is_system_template', false)
      .eq('created_by', uid)
      .order('updated_at', { ascending: false })
    setCustomTemplates((data ?? []) as WritingTemplateRecord[])
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      setUserId(user.id)
      void load(user.id)
    })
  }, [load, router])

  const systemTemplates = useMemo(() => WRITING_TEMPLATES.map(systemTemplateToRecord), [])

  async function copyTemplate(template: WritingTemplateRecord) {
    if (!userId) return
    const rules = normalizeFormatRules(template, template.language)
    const sections = getTemplateSections(template)
    const { data, error } = await supabase
      .from('writing_templates')
      .insert({
        name: `${template.name} 副本`,
        language: template.language,
        paper_type: template.paper_type,
        template_type: `${template.template_type}_custom`,
        description: template.description,
        format_rules: rules,
        section_structure: sections,
        is_system_template: false,
        created_by: userId,
      })
      .select()
      .single()
    if (error || !data) { alert('复制失败：' + (error?.message ?? '未知错误')); return }
    router.push(`/writing/templates/${data.id}`)
  }

  async function deleteTemplate(template: WritingTemplateRecord) {
    if (isSystemTemplate(template)) return
    if (!confirm(`确认删除模板「${template.name}」？已使用该模板的论文正文不会被删除，但后续导出会找不到该自定义模板。`)) return
    const { error } = await supabase.from('writing_templates').delete().eq('id', template.id)
    if (error) { alert('删除失败：' + error.message); return }
    setCustomTemplates(prev => prev.filter(t => t.id !== template.id))
  }

  function TemplateCard({ template }: { template: WritingTemplateRecord }) {
    const system = isSystemTemplate(template)
    const language = getTemplateLanguage(template)
    return (
      <Card padding="md">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <h3 className="font-serif text-xl text-ink-900">{template.name}</h3>
            <p className="text-xs text-ink-500 mt-1">
              {language === 'zh' ? '中文' : 'English'} · {getTemplatePaperType(template)}
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-wider rounded-full border border-line bg-canvas px-2 py-1 text-ink-500">
            {system ? '系统模板' : '我的模板'}
          </span>
        </div>
        <p className="text-sm text-ink-600 leading-relaxed min-h-[44px] mb-4">{getTemplateDescription(template) || '自定义论文模板。'}</p>
        <p className="text-xs text-ink-500 mb-5">{getTemplateSections(template).length} 个章节</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="brand" onClick={() => router.push(`/writing?template=${template.id}`)}>使用模板</Button>
          <Button size="sm" variant="secondary" onClick={() => copyTemplate(template)}>复制修改</Button>
          {!system && (
            <>
              <Button size="sm" variant="ghost" onClick={() => router.push(`/writing/templates/${template.id}`)}>编辑</Button>
              <Button size="sm" variant="ghost" onClick={() => deleteTemplate(template)}>删除</Button>
            </>
          )}
        </div>
      </Card>
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
              eyebrow="Template Library"
              title="论文模板库"
              description="管理系统模板和你的自定义模板。系统模板只能复制修改，自定义模板可以编辑和删除。"
              actions={<Button variant="brand" onClick={() => router.push('/writing/templates/new')}>新建自定义模板</Button>}
            />

            <section className="mb-12">
              <div className="flex items-end justify-between border-b border-line pb-5 mb-6">
                <div>
                  <Eyebrow tone="muted" className="mb-2">System Templates</Eyebrow>
                  <h2 className="font-serif text-xl text-ink-900">系统模板</h2>
                </div>
                <span className="text-xs text-ink-500">{systemTemplates.length} 个模板</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {systemTemplates.map(template => <TemplateCard key={template.id} template={template} />)}
              </div>
            </section>

            <section>
              <div className="flex items-end justify-between border-b border-line pb-5 mb-6">
                <div>
                  <Eyebrow tone="muted" className="mb-2">My Templates</Eyebrow>
                  <h2 className="font-serif text-xl text-ink-900">我的模板</h2>
                </div>
                <span className="text-xs text-ink-500">{customTemplates.length} 个模板</span>
              </div>
              {loading ? (
                <Card padding="lg" className="text-center text-sm text-ink-500">加载中...</Card>
              ) : customTemplates.length === 0 ? (
                <Card padding="lg" className="text-center py-14">
                  <h3 className="font-serif text-xl text-ink-900 mb-3">还没有自定义模板</h3>
                  <p className="text-sm text-ink-600 mb-6">可以新建一个模板，或从系统模板复制后修改。</p>
                  <Button variant="brand" onClick={() => router.push('/writing/templates/new')}>新建自定义模板</Button>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {customTemplates.map(template => <TemplateCard key={template.id} template={template} />)}
                </div>
              )}
            </section>
          </MainContent>
        </div>
      </main>
    </div>
  )
}
