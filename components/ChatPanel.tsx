'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { apiJSON } from '@/lib/apiFetch'
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
  name?: string
  email?: string
  role?: Role
}

type MemberInfo = { name: string; email: string; role: Role }

type Props = {
  projectId: string
  currentUserId: string | null
  open: boolean
  onClose: () => void
  onUnreadChange?: (n: number) => void
}

export default function ChatPanel({ projectId, currentUserId, open, onClose, onUnreadChange }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [memberMap, setMemberMap] = useState<Record<string, MemberInfo>>({})
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [unread, setUnread] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const openRef = useRef(open)

  useEffect(() => { openRef.current = open }, [open])
  useEffect(() => { onUnreadChange?.(unread) }, [onUnreadChange, unread])

  const scrollToBottom = useCallback(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

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
  }, [projectId, currentUserId, scrollToBottom])

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
    if (!content || sending) return
    setSending(true)
    setInput('')

    const { data, error } = await apiJSON<{ message: ChatMessage }>(`/api/chat/${projectId}/messages`, {
      method: 'POST', body: JSON.stringify({ content }),
    })
    setSending(false)
    if (error) { alert('发送失败：' + error); setInput(content); return }
    if (data?.message) {
      setMessages(prev => {
        if (prev.some(x => x.id === data.message.id)) return prev
        return [...prev, data.message]
      })
      setTimeout(scrollToBottom, 30)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white border-l border-line shadow-[var(--shadow-modal)] z-40 flex flex-col">
      {/* 头部 */}
      <div className="px-6 py-5 border-b border-line flex items-center justify-between flex-shrink-0">
        <div>
          <Eyebrow className="mb-1">Project Chat</Eyebrow>
          <h3 className="font-serif text-xl text-ink-900">项目聊天</h3>
        </div>
        <button onClick={onClose}
          className="text-ink-500 hover:text-ink-900 p-2 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 消息列表 */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4 bg-surface/40">
        {loading ? (
          <div className="text-center text-sm text-ink-500 py-10">加载中...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 bg-canvas rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm text-ink-900 font-medium">还没有消息</p>
            <p className="text-xs text-ink-400 mt-1">发送第一条消息开始讨论</p>
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
              <div key={m.id} className={cn('flex gap-3', isSelf && 'flex-row-reverse')}>
                {showHeader ? (
                  <div className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
                    role === 'manager' ? 'bg-ink-900'
                    : role === 'reviewer' ? 'bg-[#5470D6]' : 'bg-brand'
                  )}>
                    <span className="text-white text-sm font-semibold">{initial}</span>
                  </div>
                ) : (
                  <div className="w-9 flex-shrink-0" />
                )}
                <div className={cn('flex flex-col max-w-[75%]', isSelf ? 'items-end' : 'items-start')}>
                  {showHeader && (
                    <div className={cn('flex items-center gap-2 mb-1', isSelf && 'flex-row-reverse')}>
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
                    'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                    isSelf
                      ? 'bg-ink-900 text-white rounded-tr-sm'
                      : 'bg-white border border-line text-ink-900 rounded-tl-sm'
                  )}>
                    <div className="break-words whitespace-pre-wrap"
                         dangerouslySetInnerHTML={{ __html: renderInlineMd(m.content) }} />
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 输入区 */}
      <form onSubmit={send} className="px-5 py-4 border-t border-line flex-shrink-0 bg-white">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="输入消息… (Enter 发送 · Shift+Enter 换行 · 支持 **粗体** `代码`)"
            rows={2}
            disabled={sending}
            className="flex-1 bg-surface border-2 border-line rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/10 transition-all resize-none disabled:opacity-50"
          />
          <Button type="submit" disabled={sending || !input.trim()} loading={sending}>
            发送
          </Button>
        </div>
      </form>
    </div>
  )
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
