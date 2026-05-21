'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { MainContent } from '@/components/ui/MainContent'
import { apiJSON } from '@/lib/apiFetch'

type Project = { id: string; name: string }

const LANGUAGES = [
  ['en', '英语'],
  ['zh', '中文'],
  ['ja', '日语'],
  ['ko', '韩语'],
  ['fr', '法语'],
  ['de', '德语'],
  ['es', '西班牙语'],
  ['ru', '俄语'],
]

export default function NewPptProjectPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sourceLang, setSourceLang] = useState('en')
  const [targetLang, setTargetLang] = useState('zh')
  const [enableAi, setEnableAi] = useState(true)
  const [enableReview, setEnableReview] = useState(true)
  const [creating, setCreating] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    const { data, error } = await apiJSON<{ project: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description,
        type: 'ppt_slide_translation',
        metadata: {
          display_name: 'PPT 分页翻译',
          source_language: sourceLang,
          target_language: targetLang,
          ai_initial_enabled: enableAi,
          review_enabled: enableReview,
        },
      }),
    })
    setCreating(false)
    if (error || !data?.project) {
      alert('创建失败：' + (error || '未知错误。请确认已执行 supabase/21_ppt_slide_translation_metadata.sql'))
      return
    }
    router.push(`/projects/${data.project.id}/ppt`)
  }

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="bg-white rounded-2xl border border-line min-h-[calc(100vh-40px)]">
          <MainContent size="default" className="!py-14 lg:!py-16">
            <button
              type="button"
              className="text-sm text-ink-500 hover:text-ink-900 mb-8"
              onClick={() => router.push('/dashboard')}
            >
              ← 返回 Dashboard
            </button>

            <div className="mb-10 border-b border-line pb-8">
              <Eyebrow tone="muted" className="mb-2">PPT slide translation</Eyebrow>
              <h1 className="font-serif text-3xl text-ink-900 tracking-tight">新建 PPT 翻译项目</h1>
              <p className="mt-3 text-sm text-ink-600 leading-relaxed max-w-2xl">
                用于商业 PPT、汇报 PPT、品牌宣传 PPT 的分页翻译。系统会按 Slide 提取可编辑文字，并以表格方式协作翻译。
              </p>
            </div>

            <Card padding="lg" className="max-w-3xl">
              <form onSubmit={submit} className="space-y-6">
                <Input
                  label="项目名称"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="例如：品牌发布会英文版"
                  required
                />
                <Textarea
                  label="项目说明（可选）"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="补充客户、语气、用途或交付要求..."
                  rows={4}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Select label="源语言" value={sourceLang} onChange={e => setSourceLang(e.target.value)}>
                    {LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                  <Select label="目标语言" value={targetLang} onChange={e => setTargetLang(e.target.value)}>
                    {LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                </div>
                <Input label="项目类型" value="PPT 分页翻译" readOnly inputClassName="bg-canvas text-ink-600" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-center gap-3 rounded-xl border border-line bg-surface px-5 py-4 text-sm text-ink-700">
                    <input type="checkbox" checked={enableAi} onChange={e => setEnableAi(e.target.checked)} className="accent-brand" />
                    启用 AI 初译
                  </label>
                  <label className="flex items-center gap-3 rounded-xl border border-line bg-surface px-5 py-4 text-sm text-ink-700">
                    <input type="checkbox" checked={enableReview} onChange={e => setEnableReview(e.target.checked)} className="accent-brand" />
                    启用审校流程
                  </label>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button variant="secondary" type="button" onClick={() => router.push('/dashboard')} fullWidth>
                    取消
                  </Button>
                  <Button variant="brand" type="submit" loading={creating} fullWidth>
                    创建 PPT 翻译项目
                  </Button>
                </div>
              </form>
            </Card>
          </MainContent>
        </div>
      </main>
    </div>
  )
}
