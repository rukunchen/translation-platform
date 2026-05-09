'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { LiveblocksProvider, RoomProvider } from '@liveblocks/react'

type Doc = {
  id: string
  title: string
  source_text: string
  source_language: string
  target_language: string
  project_id: string
}

type GlossaryTerm = {
  id: string
  source_term: string
  translated_term: string
  definition: string
}

const langNames: Record<string, string> = {
  en: '英语', zh: '中文', ja: '日语', ko: '韩语',
  fr: '法语', de: '德语', es: '西班牙语', ru: '俄语'
}

function SimpleEditor({ onTextChange, value, onChange }: {
  onTextChange?: (text: string) => void
  value: string
  onChange: (text: string) => void
}) {
  return (
    <textarea
      className="w-full h-full p-4 text-sm text-gray-800 leading-relaxed resize-none focus:outline-none border-none outline-none"
      value={value}
      onChange={e => {
        onChange(e.target.value)
        onTextChange?.(e.target.value)
      }}
      placeholder="译文将在这里显示，点击 AI 初翻后开始翻译..."
    />
  )
}

function EditorPage({ doc, user }: { doc: Doc; user: any }) {
  const router = useRouter()
  const [model, setModel] = useState('deepseek')
  const [translating, setTranslating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [glossary, setGlossary] = useState<GlossaryTerm[]>([])
  const [generatingGlossary, setGeneratingGlossary] = useState(false)
  const [showGlossary, setShowGlossary] = useState(true)
  const [editorText, setEditorText] = useState('')

  useEffect(() => { loadGlossary() }, [doc.id])

  const loadGlossary = async () => {
    const { data } = await supabase.from('glossary_terms')
      .select('*').eq('project_id', doc.project_id)
      .order('created_at', { ascending: false })
    if (data) setGlossary(data)
  }

  const handleTranslate = async () => {
    setTranslating(true)
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: doc.source_text,
          sourceLang: doc.source_language,
          targetLang: doc.target_language,
          model
        })
      })
      const { translation, error } = await res.json()
      if (error) alert('翻译失败：' + error)
      else setEditorText(translation)
    } catch {
      alert('翻译失败，请检查 API Key 是否正确')
    }
    setTranslating(false)
  }

  const handleSave = async () => {
    setSaving(true)
    await supabase.from('documents')
      .update({ translated_text: editorText, updated_at: new Date().toISOString() })
      .eq('id', doc.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleGenerateGlossary = async () => {
    if (!editorText.trim()) { alert('请先翻译文档再生成术语表'); return }
    setGeneratingGlossary(true)
    try {
      const res = await fetch('/api/glossary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceText: doc.source_text,
          translatedText: editorText,
          sourceLang: doc.source_language,
          targetLang: doc.target_language
        })
      })
      const { terms, error } = await res.json()
      if (error) { alert('生成失败：' + error); return }
      const { data: { user: u } } = await supabase.auth.getUser()
      for (const term of terms) {
        await supabase.from('glossary_terms').insert({
          ...term, project_id: doc.project_id, created_by: u?.id
        })
      }
      loadGlossary()
    } catch {
      alert('生成术语表失败')
    }
    setGeneratingGlossary(false)
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-sm">← 返回</button>
        <span className="text-gray-300">/</span>
        <h1 className="text-base font-semibold text-gray-800 flex-1">{doc.title}</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 hidden md:block">
            {langNames[doc.source_language]} → {langNames[doc.target_language]}
          </span>
          <select value={model} onChange={e => setModel(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="deepseek">DeepSeek（快速）</option>
            <option value="claude">Claude（高质量）</option>
          </select>
          <button onClick={handleTranslate} disabled={translating}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-1.5 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap">
            {translating ? '翻译中...' : 'AI 初翻'}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
            {saving ? '保存中...' : saved ? '已保存 ✓' : '保存'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 border-r border-gray-200 flex flex-col">
          <div className="bg-gray-100 px-4 py-2 text-xs font-medium text-gray-500 border-b border-gray-200 flex-shrink-0">
            原文（{langNames[doc.source_language]}）
          </div>
          <div className="flex-1 overflow-auto p-4 bg-gray-50">
            <p className="text-gray-700 leading-relaxed whitespace-pre-wrap text-sm">{doc.source_text}</p>
          </div>
        </div>

        <div className="w-1/2 flex flex-col">
          <div className="bg-indigo-50 px-4 py-2 text-xs font-medium text-indigo-600 border-b border-gray-200 flex-shrink-0 flex justify-between">
            <span>译文（{langNames[doc.target_language]}）</span>
            <span className="text-gray-400">可直接编辑</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <SimpleEditor
              value={editorText}
              onChange={setEditorText}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-2">
          <button onClick={() => setShowGlossary(!showGlossary)}
            className="text-sm font-medium text-gray-700">
            术语表（{glossary.length} 条）{showGlossary ? ' ▼' : ' ▶'}
          </button>
          <button onClick={handleGenerateGlossary} disabled={generatingGlossary}
            className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded-lg disabled:opacity-50 transition-colors">
            {generatingGlossary ? '生成中...' : '✨ AI 自动生成术语表'}
          </button>
        </div>
        {showGlossary && (
          <div className="px-4 pb-3 max-h-36 overflow-auto">
            {glossary.length === 0 ? (
              <p className="text-sm text-gray-400 py-1">暂无术语。翻译完成后点击"AI 自动生成术语表"</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {glossary.map(term => (
                  <div key={term.id} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
                    <span className="text-gray-600">{term.source_term}</span>
                    <span className="text-gray-400 mx-1">→</span>
                    <span className="text-indigo-600 font-medium">{term.translated_term}</span>
                    {term.definition && <span className="text-gray-400 text-xs ml-1">({term.definition})</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function DocumentPage() {
  const params = useParams()
  const router = useRouter()
  const documentId = params.id as string
  const [doc, setDoc] = useState<Doc | null>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [documentId])

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    setUser(user)
    const { data } = await supabase.from('documents').select('*').eq('id', documentId).single()
    if (data) setDoc(data)
    setLoading(false)
  }

  if (loading) return <div className="h-screen flex items-center justify-center"><p className="text-gray-400">加载中...</p></div>
  if (!doc) return <div className="h-screen flex items-center justify-center"><p className="text-gray-400">文档不存在</p></div>

  return <EditorPage doc={doc} user={user} />
}