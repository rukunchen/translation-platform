'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { apiFetch, apiJSON } from '@/lib/apiFetch'
import { renderInlineMd } from '@/lib/markdown'
import { type Role, roleLabel, roleBadgeStyle } from '@/lib/permissions'
import { Eyebrow } from './ui/Eyebrow'
import { Button } from './ui/Button'
import { cn } from './ui/cn'

type ChatMessage = {
  id: string
  content: string
  created_at: string
  user_id: string
  attachments?: ChatAttachment[]
  name?: string
  email?: string
  role?: Role
}
type ChatAttachment = {
  name: string
  type: string
  size: number
  path: string
  kind: 'image' | 'file'
  url?: string
}

type MemberInfo = { name: string; email: string; role: Role }

type Props = {
  projectId: string
  title?: string
  currentUserId: string | null
  open: boolean
  onClose: () => void
  onUnreadChange?: (n: number) => void
}

const PANEL_X = 36

export default function ChatPanel({ projectId, title, currentUserId, open, onClose, onUnreadChange }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [memberMap, setMemberMap] = useState<Record<string, MemberInfo>>({})
  const [input, setInput] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [unread, setUnread] = useState(0)
  const [dragging, setDragging] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragDepthRef = useRef(0)
  const openRef = useRef(open)

  useEffect(() => { openRef.current = open }, [open])
  useEffect(() => { onUnreadChange?.(unread) }, [onUnreadChange, unread])

  const scrollToBottom = useCallback(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const addFiles = useCallback((incoming: File[]) => {
    if (incoming.length === 0) return
    setFiles(prev => {
      const next = [...prev, ...incoming].slice(0, 5)
      if (prev.length + incoming.length > 5) {
        setTimeout(() => alert('一次最多发送 5 个附件。'), 0)
      }
      return next
    })
  }, [])

  const refreshMessages = useCallback(async () => {
    const { data } = await apiJSON<{ messages: ChatMessage[] }>(`/api/chat/${projectId}/messages`)
    if (data?.messages) {
      setMessages(data.messages)
      setTimeout(() => { if (openRef.current) scrollToBottom() }, 30)
    }
  }, [projectId, scrollToBottom])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      if (cancelled) return
      setLoading(true)
      const [{ data: msgRes }, { data: memRes }] = await Promise.all([
        apiJSON<{ messages: ChatMessage[] }>(`/api/chat/${projectId}/messages`),
        apiJSON<{ members: { user_id: string; role: Role; profiles?: { name?: string; email?: string } }[] }>(`/api/projects/${projectId}/members`),
      ])
      if (cancelled) return
      const map: Record<string, MemberInfo> = {}
      for (const m of memRes?.members || []) {
        map[m.user_id] = {
          name: m.profiles?.name || m.profiles?.email?.split('@')[0] || '匿名',
          email: m.profiles?.email || '',
          role: m.role,
        }
      }
      setMemberMap(map)
      setMessages(msgRes?.messages || [])
      setLoading(false)
      setTimeout(() => scrollToBottom(), 30)
    })()
    return () => { cancelled = true }
  }, [projectId, scrollToBottom])

  useEffect(() => {
    const channel = supabase.channel(`project:${projectId}:chat`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `project_id=eq.${projectId}`,
      }, payload => {
        const m = payload.new as ChatMessage
        if ((m.attachments || []).length > 0) {
          void refreshMessages()
          if (m.user_id !== currentUserId && !openRef.current) setUnread(u => u + 1)
          return
        }
        setMessages(prev => {
          if (prev.some(x => x.id === m.id)) return prev
          return [...prev, m]
        })
        if (m.user_id !== currentUserId && !openRef.current) {
          setUnread(u => u + 1)
        }
        setTimeout(() => { if (openRef.current) scrollToBottom() }, 30)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [projectId, currentUserId, refreshMessages, scrollToBottom])

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        setUnread(0)
        scrollToBottom()
      }, 30)
    }
  }, [open, scrollToBottom])

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const content = input.trim()
    if ((!content && files.length === 0) || sending) return
    setSending(true)
    setInput('')
    const sendingFiles = files
    setFiles([])

    const form = new FormData()
    form.set('content', content)
    sendingFiles.forEach(file => form.append('files', file))

    const res = await apiFetch(`/api/chat/${projectId}/messages`, { method: 'POST', body: form })
    const json = await res.json().catch(() => ({})) as { message?: ChatMessage; error?: string }
    setSending(false)
    if (!res.ok) { alert('发送失败：' + (json.error || `HTTP ${res.status}`)); setInput(content); setFiles(sendingFiles); return }
    if (json.message) {
      setMessages(prev => {
        if (prev.some(x => x.id === json.message!.id)) return prev
        return [...prev, json.message!]
      })
      setTimeout(scrollToBottom, 30)
    }
  }

  const exportMessages = async () => {
    const params = new URLSearchParams({ limit: '5000' })
    const { data, error } = await apiJSON<{ messages: ChatMessage[] }>(`/api/chat/${projectId}/messages?${params}`)
    if (error) { alert('导出失败：' + error); return }
    const rows = data?.messages || messages
    const body = rows.length > 0
      ? rows.map(m => {
          const info = memberMap[m.user_id]
          const name = info?.name || m.name || '匿名'
          const role = (info?.role || m.role || 'translator') as Role
          const time = new Date(m.created_at).toLocaleString('zh-CN')
          const attachments = (m.attachments || []).map(a => `- 附件：${a.name} (${formatFileSize(a.size)})`).join('\n')
          return `### ${time} · ${name} · ${roleLabel[role]}\n\n${m.content.trim() || '(空消息)'}${attachments ? `\n\n${attachments}` : ''}`
        }).join('\n\n---\n\n')
      : '_暂无聊天记录_'
    const content = `# 任务聊天记录\n\n${title ? `范围：${title}\n` : ''}导出时间：${new Date().toLocaleString('zh-CN')}\n消息数量：${rows.length}\n\n---\n\n${body}\n`
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    a.href = url
    a.download = `task-chat-${projectId}-${stamp}.md`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-y-0 right-0 w-full max-w-[500px] bg-[#fffdf8] border-l border-[#e3d6ca] shadow-[-14px_0_34px_rgba(31,30,29,0.10)] z-40 flex flex-col sm:my-3 sm:right-3 sm:rounded-l-[30px] sm:border sm:border-[#eadfd5] overflow-hidden"
      onDragEnter={e => {
        e.preventDefault()
        dragDepthRef.current += 1
        if (e.dataTransfer.types.includes('Files')) setDragging(true)
      }}
      onDragOver={e => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={e => {
        e.preventDefault()
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (dragDepthRef.current === 0) setDragging(false)
      }}
      onDrop={e => {
        e.preventDefault()
        dragDepthRef.current = 0
        setDragging(false)
        addFiles(Array.from(e.dataTransfer.files || []))
      }}
    >
      {dragging && (
        <div className="absolute inset-4 z-50 rounded-[28px] border-2 border-dashed border-brand bg-[#fff7f1]/90 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="rounded-3xl bg-white px-8 py-6 text-center shadow-[var(--shadow-card)] border border-[#f4d8c8]">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff0e8] text-2xl text-brand">+</div>
            <p className="font-serif text-lg text-ink-900">松开即可加入任务聊天</p>
            <p className="mt-1 text-xs text-ink-500">支持图片、Word、PDF、Excel 等文件</p>
          </div>
        </div>
      )}
      {/* 头部 */}
      <div
        className="py-6 border-b border-[#eadfd5] flex items-start justify-between flex-shrink-0 bg-white"
        style={{ paddingLeft: PANEL_X, paddingRight: PANEL_X }}
      >
        <div className="min-w-0 pr-6">
          <Eyebrow className="mb-2">Task Chat</Eyebrow>
          <h3 className="font-serif text-2xl text-ink-900 leading-tight">任务聊天</h3>
          {title && <p className="text-sm text-ink-500 mt-2 max-w-[300px] truncate">{title}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" type="button" onClick={exportMessages} disabled={loading}>
            导出
          </Button>
          <button onClick={onClose}
            className="text-ink-500 hover:text-ink-900 p-3 rounded-2xl hover:bg-canvas transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 消息列表 */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto py-6 space-y-5 bg-[#fffaf4]"
        style={{ paddingLeft: PANEL_X, paddingRight: PANEL_X }}
      >
        {loading ? (
          <div className="text-center text-sm text-ink-500 py-10">加载中...</div>
        ) : messages.length === 0 ? (
          <div className="min-h-[320px] h-full flex flex-col items-center justify-center text-center py-12 px-8">
            <div className="w-16 h-16 bg-white border border-[#eadfd5] rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-sm">
              <svg className="w-6 h-6 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-base text-ink-900 font-medium">还没有消息</p>
            <p className="text-sm text-ink-500 mt-2 leading-relaxed">拖入图片或文件，也可以直接输入文字开始讨论。</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const isSelf = m.user_id === currentUserId
            const info = memberMap[m.user_id]
            const name = info?.name || m.name || '匿名'
            const role = (info?.role || m.role || 'translator') as Role
            const initial = name[0]?.toUpperCase() || '?'
            const prev = messages[i - 1]
            const showHeader = !prev || prev.user_id !== m.user_id ||
              (new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000)
            return (
              <div
                key={m.id}
                className={cn('flex', isSelf && 'flex-row-reverse')}
                style={{ gap: 14, paddingLeft: 2, paddingRight: 2 }}
              >
                {showHeader ? (
                  <div className={cn(
                    'w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm',
                    role === 'manager' ? 'bg-ink-900'
                    : role === 'reviewer' ? 'bg-[#5470D6]' : 'bg-brand'
                  )}>
                    <span className="text-white text-sm font-semibold">{initial}</span>
                  </div>
                ) : (
                  <div className="w-10 flex-shrink-0" />
                )}
                <div
                  className={cn('flex flex-col', isSelf ? 'items-end' : 'items-start')}
                  style={{ maxWidth: '70%' }}
                >
                  {showHeader && (
                    <div className={cn('flex items-center gap-2 mb-2 px-1', isSelf && 'flex-row-reverse')}>
                      <span className="text-sm font-medium text-ink-900">{name}</span>
                      <span className={cn(
                        'text-[9px] font-medium uppercase tracking-[0.12em] px-1.5 py-0.5 rounded',
                        roleBadgeStyle[role]
                      )}>
                        {roleLabel[role]}
                      </span>
                      <span className="text-[10px] text-ink-400 font-mono">{formatTime(m.created_at)}</span>
                    </div>
                  )}
                  <div className={cn(
                    'rounded-[24px] py-5 text-sm leading-relaxed shadow-sm',
                    isSelf
                      ? 'bg-ink-900 text-white rounded-tr-md'
                      : 'bg-white border border-[#eadfd5] text-ink-900 rounded-tl-md'
                  )}
                    style={{ paddingLeft: 22, paddingRight: 22 }}>
                    <div className="break-words whitespace-pre-wrap"
                         style={{ minHeight: 26, paddingTop: 3, paddingBottom: 3, paddingLeft: 2, paddingRight: 2, lineHeight: 1.8 }}
                         dangerouslySetInnerHTML={{ __html: renderInlineMd(m.content) }} />
                    {(m.attachments || []).length > 0 && (
                      <div className="mt-3 flex flex-col gap-2">
                        {m.attachments!.map((attachment, idx) => {
                          const href = attachment.url || `/api/chat/${projectId}/attachments/${m.id}/${idx}`
                          return attachment.kind === 'image' ? (
                            <a key={`${m.id}-${idx}`} href={href} target="_blank" rel="noreferrer"
                              className="block overflow-hidden rounded-2xl border border-white/30 bg-black/5"
                              style={{ maxWidth: 260 }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={href} alt={attachment.name} className="w-full object-contain bg-white/10" style={{ maxHeight: 260 }} />
                              <span className="block px-4 py-3 text-xs opacity-80">{attachment.name}</span>
                            </a>
                          ) : (
                            <a key={`${m.id}-${idx}`} href={href} target="_blank" rel="noreferrer"
                              className={cn('flex items-center gap-3 rounded-2xl px-4 py-3.5 text-xs',
                                isSelf ? 'bg-white/10 text-white' : 'bg-canvas text-ink-800')}>
                              <span className="font-mono">FILE</span>
                              <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                              <span className="opacity-70">{formatFileSize(attachment.size)}</span>
                            </a>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 输入区 */}
      <form
        onSubmit={send}
        className="pt-6 pb-7 border-t border-[#eadfd5] flex-shrink-0 bg-white"
        style={{ paddingLeft: PANEL_X, paddingRight: PANEL_X }}
      >
        {files.length > 0 && (
          <div className="mb-4 grid grid-cols-1 gap-2">
            {files.map((file, idx) => (
              <div key={`${file.name}-${idx}`} className="flex max-w-full items-center gap-3 rounded-2xl border border-[#eadfd5] bg-[#fffaf4] px-3.5 py-3 text-xs text-ink-700">
                {file.type.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={URL.createObjectURL(file)} alt="" className="h-10 w-10 rounded-xl object-cover" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white font-mono text-[10px] text-brand border border-[#eadfd5]">FILE</span>
                )}
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="text-ink-400">{formatFileSize(file.size)}</span>
                <button type="button" className="h-7 w-7 rounded-full text-ink-400 hover:bg-white hover:text-ink-900" onClick={() => setFiles(prev => prev.filter((_, i) => i !== idx))}>×</button>
              </div>
            ))}
          </div>
        )}
        <div
          className="flex gap-3.5 items-end rounded-[26px] border border-[#eadfd5] bg-[#fffdf8] p-4 shadow-sm"
          onDragOver={e => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={e => {
            e.preventDefault()
            dragDepthRef.current = 0
            setDragging(false)
            addFiles(Array.from(e.dataTransfer.files || []))
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv"
            onChange={e => {
              const selected = Array.from(e.target.files || [])
              addFiles(selected)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            className="h-12 w-12 flex-shrink-0 rounded-2xl border border-[#eadfd5] bg-white text-ink-600 hover:border-brand hover:text-brand hover:bg-[#fff7f1] disabled:opacity-50 transition-colors"
            title="上传图片或文档"
          >
            <span aria-hidden="true" className="text-lg leading-none">+</span>
          </button>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="输入消息… 可发送图片和文档"
            rows={2}
            disabled={sending}
            className="min-w-0 flex-1 min-h-[54px] max-h-[132px] bg-white border border-[#eadfd5] rounded-2xl px-5 py-4 text-sm leading-[1.65] placeholder:text-ink-400 focus:outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/10 transition-all resize-none disabled:opacity-50"
          />
          <Button type="submit" disabled={sending || (!input.trim() && files.length === 0)} loading={sending}
            className="h-12 min-w-[72px] flex-shrink-0 rounded-[18px]">
            发送
          </Button>
        </div>
      </form>
    </div>
  )
}

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0KB'
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)}KB`
  return `${(size / 1024 / 1024).toFixed(1)}MB`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`

  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) {
    return '昨天 ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
