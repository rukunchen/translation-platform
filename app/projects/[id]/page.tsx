'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Document = {
  id: string
  title: string
  source_language: string
  target_language: string
  created_at: string
}

type Project = {
  id: string
  name: string
  description: string
}

export default function ProjectPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [showModal, setShowModal] = useState(false)
  const [title, setTitle] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [sourceLang, setSourceLang] = useState('en')
  const [targetLang, setTargetLang] = useState('zh')
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadProject(); loadDocuments() }, [projectId])

  const loadProject = async () => {
    const { data } = await supabase.from('projects').select('*').eq('id', projectId).single()
    if (data) setProject(data)
  }

  const loadDocuments = async () => {
    const { data } = await supabase.from('documents').select('*')
      .eq('project_id', projectId).order('created_at', { ascending: false })
    if (data) setDocuments(data)
  }

  const createDocument = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('documents')
      .insert({
        title, source_text: sourceText,
        project_id: projectId,
        source_language: sourceLang,
        target_language: targetLang,
        created_by: user?.id
      })
      .select().single()
    if (data) {
      router.push(`/documents/${data.id}`)
    }
    setLoading(false)
  }

  const languages: Record<string, string> = {
    en: '英语', zh: '中文', ja: '日语', ko: '韩语',
    fr: '法语', de: '德语', es: '西班牙语', ru: '俄语'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')}
            className="text-gray-400 hover:text-gray-600 text-sm">← 返回</button>
          <span className="text-gray-300">/</span>
          <h1 className="text-lg font-semibold text-gray-800">{project?.name}</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">文档列表</h2>
            <p className="text-sm text-gray-500 mt-1">{project?.description}</p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            + 新建文档
          </button>
        </div>

        {documents.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">还没有文档</p>
            <p className="text-sm mt-1">点击"新建文档"上传原文开始翻译</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map(doc => (
              <div key={doc.id}
                onClick={() => router.push(`/documents/${doc.id}`)}
                className="bg-white rounded-xl border border-gray-200 p-6 cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all">
                <h3 className="font-semibold text-gray-800 mb-3">{doc.title}</h3>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span className="bg-gray-100 px-2 py-0.5 rounded">{languages[doc.source_language] || doc.source_language}</span>
                  <span>→</span>
                  <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">{languages[doc.target_language] || doc.target_language}</span>
                </div>
                <p className="text-xs text-gray-400 mt-3">{new Date(doc.created_at).toLocaleDateString('zh-CN')}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">新建翻译文档</h3>
            <form onSubmit={createDocument} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">文档标题</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="例如：第一章"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">原文语言</label>
                  <select value={sourceLang} onChange={e => setSourceLang(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {Object.entries(languages).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">目标语言</label>
                  <select value={targetLang} onChange={e => setTargetLang(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {Object.entries(languages).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">粘贴原文内容</label>
                <textarea value={sourceText} onChange={e => setSourceText(e.target.value)}
                  placeholder="在这里粘贴需要翻译的原文..."
                  rows={6}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  required />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium">
                  取消
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {loading ? '创建中...' : '创建并开始翻译'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}