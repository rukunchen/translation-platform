'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { apiJSON } from '@/lib/apiFetch'
import { splitSentences, type Segment, type SegmentStatus } from '@/lib/sentenceSplit'
import { exportBilingualDoc } from '@/lib/exportBilingual'
import { type Role, canManage, canReview } from '@/lib/permissions'
import ChatPanel from '@/components/ChatPanel'
import ChatToggleButton from '@/components/ChatToggleButton'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { cn } from '@/components/ui/cn'

type Doc = {
  id: string
  title: string
  source_text: string
  source_language: string
  target_language: string
  project_id: string
}

type GlossaryTerm = { id: string; source_term: string; translated_term: string; definition: string }

const langNames: Record<string, string> = {
  en: '英语', zh: '中文', ja: '日语', ko: '韩语',
  fr: '法语', de: '德语', es: '西班牙语', ru: '俄语'
}

const statusLabel: Record<SegmentStatus, string> = {
  untranslated: '未翻译', draft: '草稿', reviewed: '已审校', locked: '已锁定',
}

const statusStyle: Record<SegmentStatus, string> = {
  untranslated: 'bg-canvas-2 text-ink-400',
  draft: 'bg-brand-50 text-brand',
  reviewed: 'bg-[var(--color-status-info-bg)] text-[var(--color-status-info-text)]',
  locked: 'bg-ink-900 text-white',
}

export default function DocumentPage() {
  const params = useParams()
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [myRole, setMyRole] = useState<Role | null>(null)
  const [doc, setDoc] = useState<Doc | null>(null)
  const [loading, setLoading] = useState(true)
  const [model, setModel] = useState<'deepseek' | 'claude'>('deepseek')
  const [segments, setSegments] = useState<Segment[]>([])
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set())
  const [batchTranslating, setBatchTranslating] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 })
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [glossary, setGlossary] = useState<GlossaryTerm[]>([])
  const [generatingGlossary, setGeneratingGlossary] = useState(false)
  const [showGlossary, setShowGlossary] = useState(true)
  const [splitting, setSplitting] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const segmentsRef = useRef<Segment[]>([])
  // 记录每条句段进入编辑时的原文，用于 onBlur 判断是否改动
  const sourceFocusRef = useRef<Record<string, string>>({})

  useEffect(() => { segmentsRef.current = segments }, [segments])
  useEffect(() => { loadData() }, [params.id])

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    setUserId(user.id)

    const { data: docData } = await supabase
      .from('documents').select('*').eq('id', params.id).single()
    if (docData) {
      setDoc(docData)
      const { data: roleData } = await apiJSON<{ myRole: Role }>(`/api/projects/${docData.project_id}/members`)
      setMyRole(roleData?.myRole || null)
      await loadSegments(docData.id)
      loadGlossary(docData.project_id)
    }
    setLoading(false)
  }

  const loadSegments = async (documentId: string) => {
    const { data } = await supabase.from('segments').select('*')
      .eq('document_id', documentId).order('position', { ascending: true })
    setSegments(data || [])
  }

  const loadGlossary = async (projectId: string) => {
    const { data } = await supabase.from('glossary_terms').select('*')
      .eq('project_id', projectId).order('created_at', { ascending: false })
    if (data) setGlossary(data)
  }

  const handleSplit = async () => {
    if (!doc) return
    if (segments.length > 0) {
      if (!confirm('已存在分句结果，重新切分将删除所有现有译文，是否继续？')) return
    }
    setSplitting(true)
    await supabase.from('segments').delete().eq('document_id', doc.id)
    const newInputs = splitSentences(doc.source_text, doc.source_language)
    if (newInputs.length > 0) {
      const rows = newInputs.map(s => ({
        document_id: doc.id,
        position: s.position,
        source: s.source,
        target: '',
        status: 'untranslated' as SegmentStatus,
      }))
      await supabase.from('segments').insert(rows)
    }
    await loadSegments(doc.id)
    setSplitting(false)
  }

  const translateOne = async (seg: Segment) => {
    if (!doc) return null
    const res = await apiJSON<{ translation: string }>('/api/translate', {
      method: 'POST',
      body: JSON.stringify({
        text: seg.source, sourceLang: doc.source_language, targetLang: doc.target_language,
        model, documentId: doc.id,
      })
    })
    if (res.error) throw new Error(res.error)
    return res.data?.translation ?? ''
  }

  const saveSegmentTarget = async (segId: string, target: string) => {
    const { data, error } = await apiJSON<{ segment: Segment }>(`/api/segments/${segId}`, {
      method: 'PATCH', body: JSON.stringify({ target }),
    })
    if (error) { console.error('Save segment failed:', error); return { error } }
    return { segment: data?.segment }
  }

  const saveSegmentSource = async (segId: string, source: string) => {
    const { data, error } = await apiJSON<{ segment: Segment }>(`/api/segments/${segId}`, {
      method: 'PATCH', body: JSON.stringify({ source }),
    })
    if (error) { console.error('Save source failed:', error); return { error } }
    return { segment: data?.segment }
  }

  const handleTranslateRow = async (seg: Segment) => {
    if (seg.status === 'locked') { alert('该句段已锁定，无法翻译'); return }
    setTranslatingIds(prev => new Set(prev).add(seg.id))
    try {
      const translation = await translateOne(seg)
      const r = await saveSegmentTarget(seg.id, translation || '')
      if (r.segment) setSegments(prev => prev.map(s => s.id === seg.id ? { ...s, ...r.segment } : s))
      else if (r.error) alert('保存译文失败：' + r.error)
    } catch (e: unknown) {
      alert('翻译失败：' + (e instanceof Error ? e.message : '未知错误'))
    } finally {
      setTranslatingIds(prev => { const s = new Set(prev); s.delete(seg.id); return s })
    }
  }

  const handleTranslateAll = async () => {
    const empty = segmentsRef.current.filter(s => !s.target.trim() && s.status !== 'locked')
    if (empty.length === 0) { alert('所有句子都已翻译或被锁定'); return }
    setBatchTranslating(true)
    setBatchProgress({ done: 0, total: empty.length })

    let done = 0, cursor = 0
    const worker = async () => {
      while (cursor < empty.length) {
        const seg = empty[cursor++]
        if (!seg) break
        setTranslatingIds(prev => new Set(prev).add(seg.id))
        try {
          const translation = await translateOne(seg)
          const r = await saveSegmentTarget(seg.id, translation || '')
          if (r.segment) setSegments(prev => prev.map(s => s.id === seg.id ? { ...s, ...r.segment } : s))
        } catch { /* 失败留空 */ }
        finally {
          setTranslatingIds(prev => { const s = new Set(prev); s.delete(seg.id); return s })
          done++; setBatchProgress({ done, total: empty.length })
        }
      }
    }
    await Promise.all(Array.from({ length: 3 }, worker))
    setBatchTranslating(false)
  }

  const handleEdit = (id: string, value: string) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, target: value } : s))
  }

  const handleBlur = async (seg: Segment) => {
    if (seg.status === 'locked' && !canManage(myRole)) return
    const current = segmentsRef.current.find(s => s.id === seg.id)
    if (!current) return
    setSavingIds(prev => new Set(prev).add(seg.id))
    const r = await saveSegmentTarget(seg.id, current.target)
    if (r.segment) setSegments(prev => prev.map(s => s.id === seg.id ? { ...s, ...r.segment } : s))
    else if (r.error) alert('保存失败：' + r.error)
    setTimeout(() => {
      setSavingIds(prev => { const s = new Set(prev); s.delete(seg.id); return s })
    }, 800)
  }

  const handleEditSource = (id: string, value: string) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, source: value } : s))
  }

  const handleBlurSource = async (seg: Segment) => {
    if (seg.status === 'locked' && !canManage(myRole)) return
    const current = segmentsRef.current.find(s => s.id === seg.id)
    if (!current) return
    const baseline = sourceFocusRef.current[seg.id] ?? current.source
    if (!current.source.trim()) {
      setSegments(prev => prev.map(s => s.id === seg.id ? { ...s, source: baseline } : s))
      alert('原文不能为空')
      return
    }
    if (current.source === baseline) return
    setSavingIds(prev => new Set(prev).add(seg.id))
    const r = await saveSegmentSource(seg.id, current.source)
    if (r.segment) setSegments(prev => prev.map(s => s.id === seg.id ? { ...s, ...r.segment } : s))
    else if (r.error) alert('保存原文失败：' + r.error)
    setTimeout(() => {
      setSavingIds(prev => { const s = new Set(prev); s.delete(seg.id); return s })
    }, 800)
  }

  const handleReview = async (seg: Segment, mark: boolean) => {
    const { data, error } = await apiJSON<{ segment: Segment }>(`/api/segments/${seg.id}/review`, {
      method: mark ? 'POST' : 'DELETE',
    })
    if (error) { alert(error); return }
    if (data?.segment) setSegments(prev => prev.map(s => s.id === seg.id ? { ...s, ...data.segment } : s))
  }

  const handleLock = async (seg: Segment, lock: boolean) => {
    const { data, error } = await apiJSON<{ segment: Segment }>(`/api/segments/${seg.id}/lock`, {
      method: lock ? 'POST' : 'DELETE',
    })
    if (error) { alert(error); return }
    if (data?.segment) setSegments(prev => prev.map(s => s.id === seg.id ? { ...s, ...data.segment } : s))
  }

  const handleExport = () => {
    if (!doc) return
    if (segments.length === 0) { alert('请先切分原文'); return }
    exportBilingualDoc({
      title: doc.title, sourceLang: doc.source_language,
      targetLang: doc.target_language, segments,
    })
  }

  const handleGenerateGlossary = async () => {
    if (!doc) return
    const fullTrans = segments.map(s => s.target).filter(Boolean).join('\n')
    if (!fullTrans.trim()) { alert('请先翻译再生成术语表'); return }
    setGeneratingGlossary(true)
    try {
      const res = await apiJSON<{ terms: GlossaryTerm[] }>('/api/glossary', {
        method: 'POST',
        body: JSON.stringify({
          sourceText: doc.source_text, translatedText: fullTrans,
          sourceLang: doc.source_language, targetLang: doc.target_language, projectId: doc.project_id,
        })
      })
      if (res.error) { alert('生成失败：' + res.error); return }
      const terms = res.data?.terms || []
      const { data: { user: u } } = await supabase.auth.getUser()
      for (const term of terms) {
        await supabase.from('glossary_terms').insert({ ...term, project_id: doc.project_id, created_by: u?.id })
      }
      loadGlossary(doc.project_id)
    } catch { alert('生成术语表失败') }
    setGeneratingGlossary(false)
  }

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-canvas">
      <div className="flex items-center gap-3 text-ink-500">
        <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">加载中...</span>
      </div>
    </div>
  )

  if (!doc) return (
    <div className="h-screen flex items-center justify-center bg-canvas">
      <p className="text-ink-500">文档不存在</p>
    </div>
  )

  if (!myRole) return (
    <div className="h-screen flex items-center justify-center bg-canvas">
      <Card padding="lg" className="text-center max-w-sm">
        <h3 className="font-serif text-xl text-ink-900 mb-2">无权访问</h3>
        <p className="text-sm text-ink-500 mb-5">你不是此项目的成员</p>
        <Button onClick={() => router.push('/dashboard')}>返回工作台</Button>
      </Card>
    </div>
  )

  const translatedCount = segments.filter(s => s.target.trim()).length
  const reviewedCount = segments.filter(s => s.status === 'reviewed' || s.status === 'locked').length
  const lockedCount = segments.filter(s => s.status === 'locked').length

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      {/* 顶栏：返回 + 标题 + 统计 + 角色 + 聊天 */}
      <header className="bg-white border-b border-line py-5 flex items-center gap-4 flex-shrink-0" style={{ paddingLeft: 80, paddingRight: 80 }}>
        <button onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回
        </button>
        <div className="w-px h-5 bg-line" />
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-7 h-7 bg-brand rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">译</span>
          </div>
          <h1 className="font-serif text-lg text-ink-900 truncate">{doc.title}</h1>
          <span className="text-xs text-ink-500 bg-canvas px-2.5 py-1 rounded-full font-mono flex-shrink-0">
            {langNames[doc.source_language]} → {langNames[doc.target_language]}
          </span>
        </div>

        {segments.length > 0 && (
          <div className="hidden lg:flex items-center gap-4 text-xs text-ink-500">
            <span>翻译 <span className="text-brand font-semibold">{translatedCount}</span></span>
            <span>审校 <span className="text-[#5470D6] font-semibold">{reviewedCount}</span></span>
            <span>锁定 <span className="text-ink-900 font-semibold">{lockedCount}</span></span>
            <span className="text-ink-400">/ {segments.length}</span>
          </div>
        )}

        <span className={cn(
          'text-[10px] font-medium uppercase tracking-[0.14em] px-2 py-1 rounded-full flex-shrink-0',
          myRole === 'manager' ? 'bg-ink-900 text-white'
          : myRole === 'reviewer' ? 'bg-[var(--color-status-info-bg)] text-[var(--color-status-info-text)]'
          : 'bg-brand-50 text-brand'
        )}>
          {myRole === 'manager' ? '项目经理' : myRole === 'reviewer' ? '审校' : '译员'}
        </span>
        <ChatToggleButton unread={unread} active={chatOpen} onClick={() => setChatOpen(true)} />
      </header>

      {/* 工具栏：3 组按钮，分隔清晰 */}
      <div className="bg-white border-b border-line py-4 flex items-center gap-3 flex-wrap flex-shrink-0" style={{ paddingLeft: 80, paddingRight: 80 }}>
        {/* 组 1：分句 */}
        <Button
          size="sm" variant="ghost"
          onClick={handleSplit}
          disabled={splitting || !canManage(myRole)}
          loading={splitting}
          title={canManage(myRole) ? '' : '只有项目经理可以重新分句'}
          leftIcon={!splitting && (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        >
          {segments.length > 0 ? '重新分句' : '分句'}
        </Button>

        <div className="w-px h-5 bg-line" />

        {/* 组 2：单模型批量翻译（保持原"一键翻译"功能） */}
        <select value={model} onChange={e => setModel(e.target.value as 'deepseek' | 'claude')}
          className="text-sm border-2 border-line rounded-xl px-3 py-1.5 text-ink-900 focus:outline-none focus:border-brand bg-white font-medium">
          <option value="deepseek">DeepSeek · 快速</option>
          <option value="claude">Claude · 高质量</option>
        </select>

        <Button
          size="sm" variant="brand"
          onClick={handleTranslateAll}
          disabled={batchTranslating || segments.length === 0}
          loading={batchTranslating}
          leftIcon={!batchTranslating && (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
        >
          {batchTranslating ? `翻译中 ${batchProgress.done}/${batchProgress.total}` : '一键翻译全部'}
        </Button>

        <Button
          size="sm" variant="secondary"
          onClick={() => router.push(`/documents/${doc.id}/parallel`)}
          disabled={segments.length === 0}
          title="用多个模型并行翻译并对比"
        >
          ⚡ 多模型并行
        </Button>

        {/* 右侧 */}
        <div className="ml-auto">
          <Button
            size="sm" variant="primary"
            onClick={handleExport}
            disabled={segments.length === 0}
            leftIcon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            }
          >
            导出双语对照
          </Button>
        </div>
      </div>

      {/* 主体 */}
      <main className="flex-1 overflow-auto py-10" style={{ paddingLeft: 80, paddingRight: 80 }}>
        {segments.length === 0 ? (
          <div className="max-w-3xl mx-auto">
            <Card padding="lg">
              <div className="mb-8">
                <Eyebrow tone="muted" className="mb-2">Source · 原文</Eyebrow>
                <p className="text-ink-900 text-sm lg:text-base leading-8 whitespace-pre-wrap max-h-96 overflow-auto">{doc.source_text}</p>
              </div>
              <div className="border-t border-line pt-8 text-center">
                <h3 className="font-serif text-2xl text-ink-900 mb-3">开始你的翻译工作</h3>
                <p className="text-ink-500 text-sm mb-6 max-w-md mx-auto leading-relaxed">
                  {canManage(myRole)
                    ? '点击下方按钮，将原文按句子切分为表格。每一句都可以单独 AI 翻译并自由编辑。'
                    : '项目经理还没切分原文，请联系项目经理操作。'}
                </p>
                {canManage(myRole) && (
                  <Button variant="primary" size="lg" onClick={handleSplit} loading={splitting}>
                    {splitting ? '分句中...' : '分句开始翻译'}
                  </Button>
                )}
              </div>
            </Card>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto space-y-6">

            {/* 句段表格 */}
            <Card padding="none" className="overflow-hidden">
              {/* 表头 */}
              <div className="grid grid-cols-[68px_1fr_1fr_200px] bg-canvas border-b border-line">
                <div className="px-4 py-3 flex justify-center"><Eyebrow tone="muted">#</Eyebrow></div>
                <div className="px-6 py-3"><Eyebrow>原文 · {langNames[doc.source_language]}</Eyebrow></div>
                <div className="px-6 py-3 border-l border-line"><Eyebrow tone="brand">译文 · {langNames[doc.target_language]}</Eyebrow></div>
                <div className="px-4 py-3 border-l border-line flex justify-center"><Eyebrow tone="muted">状态 / 操作</Eyebrow></div>
              </div>

              {/* 数据行 */}
              {segments.map((seg, i) => {
                const isTranslating = translatingIds.has(seg.id)
                const isSaving = savingIds.has(seg.id)
                const hasTarget = !!seg.target.trim()
                const status = (seg.status || 'untranslated') as SegmentStatus
                const isLocked = status === 'locked'
                const canEditThis = !isLocked || canManage(myRole)
                return (
                  <div key={seg.id}
                    className={cn(
                      'grid grid-cols-[68px_1fr_1fr_200px] border-b border-line last:border-b-0 transition-colors',
                      isLocked ? 'bg-canvas/40' : 'hover:bg-canvas/30'
                    )}>
                    {/* 编号 */}
                    <div className="px-4 py-6 flex flex-col items-center gap-1">
                      <span className="text-xs font-mono text-ink-400">{String(i + 1).padStart(2, '0')}</span>
                      {isLocked && (
                        <svg className="w-3.5 h-3.5 text-ink-900" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 116 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>

                    {/* 原文（可编辑：修正错字或调整分句） */}
                    <div className="px-4 py-4 relative">
                      <textarea
                        value={seg.source}
                        onFocus={() => { sourceFocusRef.current[seg.id] = seg.source }}
                        onChange={e => handleEditSource(seg.id, e.target.value)}
                        onBlur={() => handleBlurSource(seg)}
                        disabled={isTranslating || !canEditThis}
                        placeholder={!canEditThis ? '已锁定，不可编辑' : '原文'}
                        className={cn(
                          'w-full min-h-[88px] px-4 py-3 text-sm leading-7 rounded-lg resize-none focus:outline-none transition-colors',
                          !canEditThis
                            ? 'bg-canvas-2 text-ink-500 cursor-not-allowed'
                            : 'bg-transparent text-ink-900 focus:bg-white focus:ring-2 focus:ring-brand/30 hover:bg-canvas/40'
                        )}
                      />
                    </div>

                    {/* 译文 textarea */}
                    <div className="px-4 py-4 border-l border-line relative">
                      <textarea
                        value={seg.target}
                        onChange={e => handleEdit(seg.id, e.target.value)}
                        onBlur={() => handleBlur(seg)}
                        placeholder={isTranslating ? '翻译中…' : !canEditThis ? '已锁定，不可编辑' : '点击「翻译此句」或直接输入译文'}
                        disabled={isTranslating || !canEditThis}
                        className={cn(
                          'w-full min-h-[88px] px-4 py-3 text-sm leading-7 rounded-lg resize-none focus:outline-none transition-colors',
                          !canEditThis ? 'bg-canvas-2 text-ink-500 cursor-not-allowed'
                          : hasTarget ? 'bg-brand-50/60 text-ink-900 focus:bg-white focus:ring-2 focus:ring-brand/30'
                          : 'bg-transparent text-ink-900 placeholder-ink-300 focus:bg-white focus:ring-2 focus:ring-brand/30',
                          isTranslating && 'opacity-50'
                        )}
                      />
                      {isSaving && (
                        <span className="absolute top-5 right-5 text-[10px] text-ink-400 font-mono">已保存</span>
                      )}
                    </div>

                    {/* 操作列 */}
                    <div className="border-l border-line flex flex-col items-stretch gap-2" style={{ padding: '20px 12px' }}>
                      <span className={cn(
                        'text-[10px] font-medium uppercase tracking-[0.12em] rounded-full text-center',
                        statusStyle[status]
                      )} style={{ padding: '4px 8px' }}>
                        {statusLabel[status]}
                      </span>

                      <button
                        onClick={() => handleTranslateRow(seg)}
                        disabled={isTranslating || batchTranslating || !canEditThis}
                        className="text-[11px] bg-canvas hover:bg-brand hover:text-white text-ink-900 rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-50 font-medium"
                        style={{ padding: '6px 8px' }}
                      >
                        {isTranslating ? (
                          <><div className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" /> 翻译</>
                        ) : hasTarget ? '↻ 重译' : '✦ AI 翻译'}
                      </button>

                      {canReview(myRole) && status === 'draft' && hasTarget && (
                        <button onClick={() => handleReview(seg, true)}
                          className="text-[11px] bg-[var(--color-status-info-bg)] hover:bg-[var(--color-status-info-text)] hover:text-white text-[var(--color-status-info-text)] border border-[var(--color-status-info-text)]/30 rounded-lg transition-colors font-medium"
                          style={{ padding: '6px 8px' }}>
                          ✓ 标记审校
                        </button>
                      )}
                      {canReview(myRole) && status === 'reviewed' && (
                        <button onClick={() => handleReview(seg, false)}
                          className="text-[11px] bg-white hover:bg-canvas text-ink-500 border border-line rounded-lg transition-colors font-medium"
                          style={{ padding: '6px 8px' }}>
                          ↶ 撤销审校
                        </button>
                      )}

                      {canManage(myRole) && (status === 'draft' || status === 'reviewed') && hasTarget && (
                        <button onClick={() => handleLock(seg, true)}
                          className="text-[11px] bg-ink-900 hover:bg-ink-700 text-white rounded-lg transition-colors font-medium"
                          style={{ padding: '6px 8px' }}>
                          🔒 最终确认
                        </button>
                      )}
                      {canManage(myRole) && status === 'locked' && (
                        <button onClick={() => handleLock(seg, false)}
                          className="text-[11px] bg-white hover:bg-canvas text-ink-500 border border-line rounded-lg transition-colors font-medium"
                          style={{ padding: '6px 8px' }}>
                          🔓 解锁
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </Card>

            {/* 术语表 */}
            <Card padding="none">
              <div className="flex items-center justify-between px-6 py-5">
                <button onClick={() => setShowGlossary(!showGlossary)}
                  className="flex items-center gap-2 text-sm font-medium text-ink-900 hover:text-brand transition-colors">
                  <svg className={cn('w-3.5 h-3.5 transition-transform', showGlossary && 'rotate-90')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <Eyebrow>Glossary</Eyebrow>
                  <span className="font-serif text-base text-ink-900">术语表</span>
                  <span className="text-xs text-ink-400 font-normal">{glossary.length} 条</span>
                </button>
                <Button size="sm" variant="secondary" onClick={handleGenerateGlossary} loading={generatingGlossary}>
                  {generatingGlossary ? '生成中...' : 'AI 生成术语表'}
                </Button>
              </div>
              {showGlossary && (
                <div className="px-6 pb-5 max-h-48 overflow-auto border-t border-line pt-4">
                  {glossary.length === 0 ? (
                    <p className="text-xs text-ink-400 py-2">暂无术语。翻译完成后点击「AI 生成术语表」</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {glossary.map(term => (
                        <div key={term.id} className="flex items-center gap-1.5 bg-canvas border border-line rounded-lg px-3 py-1.5 text-xs">
                          <span className="text-ink-500">{term.source_term}</span>
                          <svg className="w-3 h-3 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                          <span className="text-brand font-medium">{term.translated_term}</span>
                          {term.definition && <span className="text-ink-400">· {term.definition}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}
      </main>

      {doc && (
        <ChatPanel
          projectId={doc.project_id}
          currentUserId={userId}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          onUnreadChange={setUnread}
        />
      )}
    </div>
  )
}
