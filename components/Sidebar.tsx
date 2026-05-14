'use client'

import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { cn } from './ui/cn'

type User = {
  id: string
  email?: string
  user_metadata?: { name?: string }
}

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user as User | null))
  }, [])

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const isProjectsActive = pathname === '/dashboard' || pathname.startsWith('/projects/')
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
          <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform shadow-sm">
            <span className="text-white font-bold text-base">译</span>
          </div>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-white font-semibold text-[15px] tracking-tight">译境</span>
            <span className="text-ink-400 text-[11px] mt-0.5 truncate">技大25级MTIer翻译平台</span>
          </div>
        </div>
      </div>

      <div style={{ margin: '0 24px' }} className="h-px bg-white/8" />

      {/* 导航 */}
      <nav className="flex-1 space-y-1" style={{ padding: '20px 16px' }}>
        <NavItem
          active={isProjectsActive}
          onClick={() => router.push('/dashboard')}
          icon={
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          }
          label="所有项目"
        />
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
