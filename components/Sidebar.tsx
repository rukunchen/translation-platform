'use client'

import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { apiJSON } from '@/lib/apiFetch'
import { cn } from './ui/cn'
import Logo from './Logo'

type User = {
  id: string
  email?: string
  user_metadata?: { name?: string }
}

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let alive = true
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!alive) return
      setUser(user as User | null)
      if (!user) {
        setIsAdmin(false)
        return
      }
      const { data } = await apiJSON<{ isAdmin: boolean }>('/api/admin/me')
      if (alive) setIsAdmin(Boolean(data?.isAdmin))
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    router.prefetch('/dashboard')
    router.prefetch('/projects')
    router.prefetch('/ai-experiments')
    router.prefetch('/practice')
    router.prefetch('/reading')
    router.prefetch('/writing')
    router.prefetch('/writing/templates')
    router.prefetch('/writing/library')
    router.prefetch('/admin')
  }, [router])

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const isParallelPage = pathname.includes('/parallel')
  const isProjectsActive = pathname.startsWith('/projects')
    || (pathname.startsWith('/documents/') && !isParallelPage)
  const isPracticeActive = pathname.startsWith('/practice')
  const isReadingActive = pathname.startsWith('/reading')
  const isExperimentsActive = pathname.startsWith('/ai-experiments') || isParallelPage
  const isWritingActive = pathname.startsWith('/writing')
  const isAdminActive = pathname.startsWith('/admin')
  const userName = user?.user_metadata?.name || (user?.email ? user.email.split('@')[0] : '用户')
  const initial = (userName[0] || '?').toUpperCase()

  return (
    <aside className="w-64 bg-ink-900 flex flex-col h-full flex-shrink-0 border-r border-black/20">

      {/* 品牌区 */}
      <div style={{ padding: '28px 24px' }}>
        <div
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <Logo size={40} priority className="flex-shrink-0 group-hover:scale-105 transition-transform" />
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-white font-semibold text-[15px] tracking-tight">译境</span>
            <span className="text-ink-400 text-[11px] mt-0.5 truncate">技大25级MTIer翻译平台</span>
          </div>
        </div>
      </div>

      <div style={{ margin: '0 24px' }} className="h-px bg-white/8" />

      {/* 工作入口 */}
      <nav className="flex-1" style={{ padding: '20px 16px' }}>
        <div className="mb-4 px-2">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Workspace</p>
          <p className="text-[12px] text-ink-400 mt-1">进入具体工作</p>
        </div>

        <div className="space-y-2">
          <WorkspaceItem
            active={isProjectsActive}
            onClick={() => router.push('/projects')}
            icon={<FolderIcon />}
            label="我的项目"
            detail="文档、术语与交付"
          />
          <WorkspaceItem
            active={isPracticeActive}
            onClick={() => router.push('/practice')}
            icon={<PracticeIcon />}
            label="译训库"
            detail="练习与复盘"
          />
          <WorkspaceItem
            active={isReadingActive}
            onClick={() => router.push('/reading')}
            icon={<ReadingIcon />}
            label="深读室"
            detail="原文精读与札记"
          />
          <WorkspaceItem
            active={isExperimentsActive}
            onClick={() => router.push('/ai-experiments')}
            icon={<ExperimentIcon />}
            label="最近 AI 翻译实验"
            detail="多模型实验记录"
          />
          <WorkspaceItem
            active={isWritingActive}
            onClick={() => router.push('/writing')}
            icon={<WritingIcon />}
            label="论文写作工坊"
            detail="模板与写作项目"
          />
          {isAdmin && (
            <WorkspaceItem
              active={isAdminActive}
              onClick={() => router.push('/admin')}
              icon={<AdminIcon />}
              label="管理控制台"
              detail="成员与活动观察"
            />
          )}
        </div>
      </nav>

      <div style={{ margin: '0 24px' }} className="h-px bg-white/8" />

      {/* 用户区 */}
      <div style={{ padding: '16px 16px 28px' }} className="space-y-1">
        <div className="flex items-center gap-3" style={{ padding: '10px 8px' }}>
          <div className="w-9 h-9 bg-brand rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-semibold">{initial}</span>
          </div>
          <div className="flex flex-col min-w-0 leading-tight">
            <span className="text-white text-sm font-medium truncate">{userName}</span>
            <span className="text-ink-400 text-[11px] truncate">{user?.email}</span>
          </div>
        </div>
        <NavItem
          onClick={logout}
          icon={
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          }
          label="退出登录"
          subtle
        />
      </div>
    </aside>
  )
}

function WorkspaceItem({
  active, onClick, icon, label, detail,
}: {
  active?: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  detail: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative w-full overflow-hidden rounded-xl border text-left transition-all duration-200',
        active
          ? 'border-white/12 bg-white/[0.09] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
          : 'border-transparent text-ink-300 hover:border-white/8 hover:bg-white/[0.055] hover:text-white'
      )}
      style={{ padding: '12px 11px' }}
    >
      {active && <span className="absolute left-0 top-3 bottom-3 w-0.5 rounded-r-full bg-brand" />}
      <span className="flex items-center gap-3">
        <span className={cn(
          'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border transition-colors',
          active
            ? 'border-brand/30 bg-brand/15 text-brand'
            : 'border-white/8 bg-white/[0.045] text-ink-400 group-hover:text-brand'
        )}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium leading-tight">{label}</span>
          <span className={cn('mt-1 block truncate text-[11px] leading-tight', active ? 'text-white/50' : 'text-ink-400')}>
            {detail}
          </span>
        </span>
      </span>
    </button>
  )
}

function NavItem({
  active, onClick, icon, label, subtle,
}: {
  active?: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  subtle?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full h-12 flex items-center gap-3 rounded-lg text-[13.5px] transition-colors text-left',
        active
          ? 'bg-brand/12 text-white font-medium'
          : subtle
            ? 'text-ink-400 hover:bg-white/5 hover:text-white'
            : 'text-ink-300 hover:bg-white/5 hover:text-white'
      )}
      style={{ paddingLeft: 12, paddingRight: 12 }}
    >
      <span className={cn('flex-shrink-0 flex items-center justify-center w-5', active ? 'text-brand' : '')}>{icon}</span>
      <span className="truncate">{label}</span>
      {active && <span className="ml-auto w-1 h-5 rounded-full bg-brand" />}
    </button>
  )
}

function FolderIcon() {
  return (
    <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d="M3.75 7.5A2.25 2.25 0 016 5.25h4.1c.56 0 1.1.21 1.5.59l1.3 1.22c.28.27.66.44 1.05.44H18A2.25 2.25 0 0120.25 9.75v7.5A2.25 2.25 0 0118 19.5H6a2.25 2.25 0 01-2.25-2.25V7.5z" />
    </svg>
  )
}

function PracticeIcon() {
  return (
    <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d="M6.75 5.25h7.5A2.25 2.25 0 0116.5 7.5v11.25l-3.38-2.25-3.37 2.25V7.5A2.25 2.25 0 017.5 5.25h-.75z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M7.5 8.25h5.25M7.5 11.25h5.25" />
    </svg>
  )
}

function ReadingIcon() {
  return (
    <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d="M5.25 5.25h5.25c1.24 0 2.25 1.01 2.25 2.25v11.25c0-1.24-1.01-2.25-2.25-2.25H5.25V5.25z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d="M18.75 5.25H13.5A2.25 2.25 0 0011.25 7.5v11.25c0-1.24 1.01-2.25 2.25-2.25h5.25V5.25zM7.5 8.75h2.25M7.5 11.5h2.25M14.25 8.75h2.25M14.25 11.5h2.25" />
    </svg>
  )
}

function ExperimentIcon() {
  return (
    <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d="M9.75 4.5v4.2l-4.2 7.02A2.25 2.25 0 007.48 19.5h9.04a2.25 2.25 0 001.93-3.78l-4.2-7.02V4.5" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8.25 4.5h7.5M7.55 14.25h8.9" />
    </svg>
  )
}

function WritingIcon() {
  return (
    <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d="M6.75 4.5h7.5l3 3v12H6.75a2.25 2.25 0 01-2.25-2.25V6.75A2.25 2.25 0 016.75 4.5z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M14.25 4.5v3h3M8.25 11.25h5.25M8.25 14.25h6.75" />
    </svg>
  )
}

function AdminIcon() {
  return (
    <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d="M12 4.5l6.75 2.25v4.8c0 4.23-2.7 6.95-6.75 7.95-4.05-1-6.75-3.72-6.75-7.95v-4.8L12 4.5z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d="M9.75 12l1.5 1.5 3.25-3.5" />
    </svg>
  )
}
