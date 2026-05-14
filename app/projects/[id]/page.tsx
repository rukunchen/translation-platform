'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import MembersPanel from '@/components/MembersPanel'
import ChatPanel from '@/components/ChatPanel'
import ChatToggleButton from '@/components/ChatToggleButton'
import { type Role } from '@/lib/permissions'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { PageHeader } from '@/components/ui/PageHeader'
import { MainContent } from '@/components/ui/MainContent'

type Document = { id: string; title: string; source_language: string; target_language: string; created_at: string }
type Project = { id: string; name: string; description: string }

const langNames: Record<string, string> = {
  en: '英语', zh: '中文', ja: '日语', ko: '韩语',
  fr: '法语', de: '德语', es: '西班牙语', ru: '俄语'
}

export default function ProjectPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [userId, setUserId] = useState<string | null>(null)
  const [, setMyRole] = useState<Role | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [showModal, setShowModal] = useState(false)
  const [title, setTitle] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [sourceLang, setSourceLang] = useState('en')
  const [targetLang, setTargetLang] = useState('zh')
  const [loading, setLoading] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [unread, setUnread] = useState(0)

  // 编辑 / 删除
  const [editingDoc, setEditingDoc] = useState<Document | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editSrc, setEditSrc] = useState('en')
  const [editTgt, setEditTgt] = useState('zh')
  const [editSaving, setEditSaving] = useState(false)
  const [deletingDoc, setDeletingDoc] = useState<Document | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      setUserId(user.id)
    })
    loadProject(); loadDocuments()
  }, [projectId])

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
    const { data, error } = await supabase.from('documents')
      .insert({ title, source_text: sourceText, project_id: projectId, source_language: sourceLang, target_language: targetLang, created_by: user?.id })
      .select().single()
    setLoading(false)
    if (error) { alert('创建失败：' + error.message); return }
    if (data) router.push(`/documents/${data.id}`)
  }

  const openEdit = (doc: Document) => {
    setEditingDoc(doc)
    setEditTitle(doc.title)
    setEditSrc(doc.source_language)
    setEditTgt(doc.target_language)
  }

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingDoc) return
    if (editSrc === editTgt) { alert('原文语言与目标语言不能相同'); return }
    setEditSaving(true)
    const { error } = await supabase.from('documents')
      .update({ title: editTitle, source_language: editSrc, target_language: editTgt })
      .eq('id', editingDoc.id)
    setEditSaving(false)
    if (error) { alert('保存失败：' + error.message); return }
    setEditingDoc(null)
    loadDocuments()
  }

  const confirmDelete = async () => {
    if (!deletingDoc) return
    setDeleteBusy(true)
    const { error } = await supabase.from('documents').delete().eq('id', deletingDoc.id)
    setDeleteBusy(false)
    if (error) { alert('删除失败：' + error.message); return }
    setDeletingDoc(null)
    loadDocuments()
  }

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="bg-white rounded-2xl border border-line min-h-[calc(100vh-40px)]">
        <MainContent size="wide">

          <PageHeader
            backHref="/dashboard"
            backLabel="返回项目列表"
            eyebrow="Project"
            title={project?.name || '加载中...'}
            description={project?.description || '暂无描述'}
            actions={
              <ChatToggleButton unread={unread} active={chatOpen} onClick={() => setChatOpen(true)} />
            }
          />

          {/* 主体两栏：左 1fr + 右 360px 固定栏，顶部对齐 */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-10 items-start">

            {/* 左：文档区 */}
            <section className="min-w-0">
              <div className="flex items-center justify-between mb-7 pb-5 border-b border-line">
                <div>
                  <Eyebrow tone="muted" className="mb-1.5">Documents</Eyebrow>
                  <h2 className="font-serif text-2xl text-ink-900 leading-tight">
                    文档 <span className="text-sm text-ink-400 font-sans font-normal ml-1">{documents.length} 个</span>
                  </h2>
                </div>
                <Button variant="brand" onClick={() => setShowModal(true)} leftIcon={<span className="text-base leading-none">+</span>}>
                  新建文档
                </Button>
              </div>

              {documents.length === 0 ? (
                <Card padding="lg" className="text-center py-14">
                  <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                    <svg className="w-6 h-6 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <h3 className="font-serif text-xl text-ink-900 mb-2">还没有文档</h3>
                  <p className="text-ink-500 text-sm">点击右上角「新建文档」上传原文开始翻译</p>
                </Card>
              ) : (
                <div className="space-y-4">
                  {documents.map((doc, i) => (
                    <div
                      key={doc.id}
                      className="group w-full bg-white border border-line rounded-2xl transition-all hover:border-brand/40 hover:bg-brand-50/30 hover:shadow-[var(--shadow-card)]"
                    >
                      <div className="flex items-center gap-5 px-6 py-6">
                        <button
                          type="button"
                          onClick={() => router.push(`/documents/${doc.id}`)}
                          className="flex-1 min-w-0 flex items-center gap-5 text-left"
                        >
                          <div className="flex-shrink-0 w-11 h-11 bg-canvas rounded-xl flex items-center justify-center text-[11px] font-mono text-ink-500 group-hover:bg-brand-50 group-hover:text-brand transition-colors">
                            {String(i + 1).padStart(2, '0')}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h3 className="font-serif text-lg text-ink-900 truncate tracking-tight leading-tight">{doc.title}</h3>
                            <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                              <span className="font-mono text-ink-500">{langNames[doc.source_language]}</span>
                              <svg className="w-3 h-3 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                              </svg>
                              <span className="font-mono text-brand font-medium">{langNames[doc.target_language]}</span>
                              <span className="text-ink-400 mx-1">·</span>
                              <span className="text-ink-400 font-mono">{new Date(doc.created_at).toLocaleDateString('zh-CN')}</span>
                            </div>
                          </div>
                        </button>

                        {/* 编辑 / 删除 */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => openEdit(doc)}
                            title="编辑标题与语言对"
                            aria-label="编辑"
                            className="p-2 rounded-lg text-ink-400 hover:text-brand hover:bg-brand-50 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingDoc(doc)}
                            title="删除文档"
                            aria-label="删除"
                            className="p-2 rounded-lg text-ink-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 右：固定 360px 栏 */}
            <aside className="lg:sticky lg:top-0">
              <MembersPanel
                projectId={projectId}
                currentUserId={userId}
                onRoleChanged={setMyRole}
              />
            </aside>
          </div>
        </MainContent>
        </div>
      </main>

      <ChatPanel
        projectId={projectId}
        currentUserId={userId}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onUnreadChange={setUnread}
      />

      {showModal && (
        <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-xl p-10 lg:p-12 shadow-[var(--shadow-modal)]">
            <h3 className="font-serif text-2xl text-ink-900 mb-2 tracking-tight">新建翻译文档</h3>
            <p className="text-ink-500 text-sm mb-7">粘贴原文，选择语言对，开始翻译。</p>
            <form onSubmit={createDocument} className="space-y-5">
              <Input
                label="文档标题"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="例如：第一章"
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="原文语言"
                  value={sourceLang}
                  onChange={e => setSourceLang(e.target.value)}
                >
                  {Object.entries(langNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
                <Select
                  label="目标语言"
                  value={targetLang}
                  onChange={e => setTargetLang(e.target.value)}
                >
                  {Object.entries(langNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </div>
              <Textarea
                label="原文内容"
                value={sourceText}
                onChange={e => setSourceText(e.target.value)}
                placeholder="在这里粘贴需要翻译的原文..."
                rows={8}
                required
              />
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" fullWidth type="button" onClick={() => setShowModal(false)}>
                  取消
                </Button>
                <Button variant="primary" fullWidth type="submit" loading={loading}>
                  {loading ? '创建中...' : '创建并开始翻译'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 编辑文档：标题 + 语言对 */}
      {editingDoc && (
        <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-lg p-10 lg:p-12 shadow-[var(--shadow-modal)]">
            <h3 className="font-serif text-2xl text-ink-900 mb-2 tracking-tight">编辑文档</h3>
            <p className="text-ink-500 text-sm mb-7">可以修改标题或重新选择语言对（不影响已翻译的内容）。</p>
            <form onSubmit={saveEdit} className="space-y-5">
              <Input
                label="文档标题"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="原文语言"
                  value={editSrc}
                  onChange={e => setEditSrc(e.target.value)}
                >
                  {Object.entries(langNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
                <Select
                  label="目标语言"
                  value={editTgt}
                  onChange={e => setEditTgt(e.target.value)}
                >
                  {Object.entries(langNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </div>
              {/* 快速一键互换 */}
              <button
                type="button"
                onClick={() => { const a = editSrc; setEditSrc(editTgt); setEditTgt(a) }}
                className="text-xs text-brand hover:text-brand-600 font-medium inline-flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                互换语言方向
              </button>
              <div className="flex gap-3 pt-2">
                <Button variant="secondary" fullWidth type="button" onClick={() => setEditingDoc(null)}>
                  取消
                </Button>
                <Button variant="primary" fullWidth type="submit" loading={editSaving}>
                  {editSaving ? '保存中...' : '保存修改'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 删除文档确认 */}
      {deletingDoc && (
        <div className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-md p-10 lg:p-12 shadow-[var(--shadow-modal)]">
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mb-5">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="font-serif text-2xl text-ink-900 mb-2 tracking-tight">删除文档？</h3>
            <p className="text-ink-500 text-sm mb-7 leading-relaxed">
              文档 <span className="text-ink-900 font-medium">「{deletingDoc.title}」</span> 及其所有翻译内容、术语对照都将被永久删除，无法恢复。
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" fullWidth type="button" onClick={() => setDeletingDoc(null)}>
                取消
              </Button>
              <Button variant="danger" fullWidth type="button" loading={deleteBusy} onClick={confirmDelete}>
                {deleteBusy ? '删除中...' : '确认删除'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
