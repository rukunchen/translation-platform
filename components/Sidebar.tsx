'use client'

import Link from 'next/link'
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

type WorkspaceNavItem = {
  href: string
  label: string
  detail: string
  icon: React.ReactNode
  activeMatcher: (pathname: string) => boolean
  adminOnly: boolean
}

const isParallelPage = (pathname: string) => pathname.includes('/parallel')

const workspaceNavItems: WorkspaceNavItem[] = [
  {
    href: '/dashboard',
    label: '工作台',
    detail: '总览与待办',
    icon: <DashboardIcon />,
    activeMatcher: pathname => pathname === '/dashboard' || pathname.startsWith('/dashboard/'),
    adminOnly: false,
  },
  {
    href: '/projects',
    label: '我的项目',
    detail: '文档、术语与交付',
    icon: <FolderIcon />,
    activeMatcher: pathname => pathname.startsWith('/projects')
      || (pathname.startsWith('/documents/') && !isParallelPage(pathname)),
    adminOnly: false,
  },
  {
    href: '/practice',
    label: '译训库',
    detail: '练习与复盘',
    icon: <PracticeIcon />,
    activeMatcher: pathname => pathname.startsWith('/practice'),
    adminOnly: false,
  },
  {
    href: '/frontier',
    label: '前沿文献',
    detail: '研究追踪与精读',
    icon: <FrontierIcon />,
    activeMatcher: pathname => pathname.startsWith('/frontier'),
    adminOnly: false,
  },
  {
    href: '/reading',
    label: '精读室',
    detail: '原文精读与札记',
    icon: <ReadingIcon />,
    activeMatcher: pathname => pathname.startsWith('/reading'),
    adminOnly: false,
  },
  {
    href: '/mindmaps',
    label: '思维导图',
    detail: '结构整理与知识图谱',
    icon: <MindmapIcon />,
    activeMatcher: pathname => pathname.startsWith('/mindmaps'),
    adminOnly: false,
  },
  {
    href: '/ai-experiments',
    label: '最近 AI 翻译实验',
    detail: '多模型实验记录',
    icon: <ExperimentIcon />,
    activeMatcher: pathname => pathname.startsWith('/ai-experiments') || isParallelPage(pathname),
    adminOnly: false,
  },
  {
    href: '/writing',
    label: '论文写作工坊',
    detail: '模板与写作项目',
    icon: <WritingIcon />,
    activeMatcher: pathname => pathname.startsWith('/writing'),
    adminOnly: false,
  },
  {
    href: '/admin',
    label: '管理控制台',
    detail: '成员与活动观察',
    icon: <AdminIcon />,
    activeMatcher: pathname => pathname.startsWith('/admin'),
    adminOnly: true,
  },
]

const mobilePrimaryHrefs = ['/dashboard', '/projects', '/practice', '/reading']

let cachedUser: User | null | undefined
let cachedUserId: string | null | undefined
const cachedAdminByUser = new Map<string, boolean>()
const pendingAdminByUser = new Map<string, Promise<boolean>>()

async function loadAdminStatus(userId: string) {
  const cached = cachedAdminByUser.get(userId)
  if (cached !== undefined) return cached

  const existing = pendingAdminByUser.get(userId)
  if (existing) return existing

  const pending = apiJSON<{ isAdmin: boolean }>('/api/admin/me')
    .then(({ data }) => Boolean(data?.isAdmin))
    .catch(() => false)
    .then(isAdmin => {
      cachedAdminByUser.set(userId, isAdmin)
      pendingAdminByUser.delete(userId)
      return isAdmin
    })

  pendingAdminByUser.set(userId, pending)
  return pending
}

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(() => cachedUser ?? null)
  const [isAdmin, setIsAdmin] = useState(() => (
    cachedUserId ? cachedAdminByUser.get(cachedUserId) ?? false : false
  ))
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    let alive = true

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!alive) return
      const sessionUser = (session?.user ?? null) as User | null
      cachedUser = sessionUser
      cachedUserId = sessionUser?.id ?? null
      setUser(sessionUser)

      if (!sessionUser) {
        setIsAdmin(false)
        return
      }

      const nextIsAdmin = await loadAdminStatus(sessionUser.id)
      if (alive) setIsAdmin(nextIsAdmin)
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const prefetchRoute = (href: string) => {
    router.prefetch(href)
  }

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const visibleWorkspaceItems = workspaceNavItems.filter(item => !item.adminOnly || isAdmin)
  const mobilePrimaryItems = mobilePrimaryHrefs
    .map(href => visibleWorkspaceItems.find(item => item.href === href))
    .filter((item): item is WorkspaceNavItem => Boolean(item))
  const mobileMoreItems = visibleWorkspaceItems.filter(item => !mobilePrimaryHrefs.includes(item.href))
  const activeMobileItem = visibleWorkspaceItems.find(item => item.activeMatcher(pathname))
  const moreActive = mobileMoreItems.some(item => item.activeMatcher(pathname)) || pathname.startsWith('/account')
  const userName = user?.user_metadata?.name || (user?.email ? user.email.split('@')[0] : '用户')
  const initial = (userName[0] || '?').toUpperCase()
  const closeMobile = () => setMobileOpen(false)

  return (
    <>
      <span className="yijing-mobile-nav-shell" aria-hidden="true" />

      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-surface-2/95 px-4 shadow-sm backdrop-blur md:hidden">
        <Link href="/dashboard" prefetch={false} className="flex items-center gap-1.5" onClick={closeMobile}>
          <Logo size={30} priority className="flex-shrink-0" />
          <span className="brand-wordmark text-[28px] leading-none text-ink-900">译境</span>
        </Link>
        <span className="max-w-[38vw] truncate text-sm text-ink-500">
          {activeMobileItem?.label ?? '工作台'}
        </span>
        <button
          type="button"
          aria-label="打开更多菜单"
          onClick={() => setMobileOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-ink-800 shadow-sm"
        >
          <MenuIcon />
        </button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="关闭更多菜单"
            className="absolute inset-0 bg-ink-900/40"
            onClick={closeMobile}
          />
          <section className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+84px)] rounded-card-lg border border-line bg-surface-2 p-4 shadow-modal">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-ink-400">More</p>
                <h2 className="mt-1 font-serif text-2xl text-ink-900">更多入口</h2>
              </div>
              <button
                type="button"
                aria-label="关闭更多菜单"
                onClick={closeMobile}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-ink-600"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="grid gap-2">
              {mobileMoreItems.map(item => (
                <MobileMoreLink
                  key={item.href}
                  item={item}
                  active={item.activeMatcher(pathname)}
                  onNavigate={closeMobile}
                  onPrefetch={prefetchRoute}
                />
              ))}
              <Link
                href="/account/password"
                prefetch={false}
                onClick={closeMobile}
                onPointerEnter={() => prefetchRoute('/account/password')}
                onFocus={() => prefetchRoute('/account/password')}
                className={cn(
                  'flex min-h-12 items-center gap-3 rounded-xl border px-3 text-sm transition-colors',
                  pathname.startsWith('/account')
                    ? 'border-brand/30 bg-brand-50 text-ink-900'
                    : 'border-line bg-white text-ink-700 hover:border-brand/30 hover:bg-brand-50'
                )}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-canvas text-ink-500">
                  <AccountIcon />
                </span>
                <span className="font-medium">账户密码</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  closeMobile()
                  void logout()
                }}
                className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-white px-3 text-left text-sm text-ink-700 transition-colors hover:border-brand/30 hover:bg-brand-50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-canvas text-ink-500">
                  <LogoutIcon />
                </span>
                <span className="font-medium">退出登录</span>
              </button>
            </div>
          </section>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface-2/95 px-2 pb-[calc(env(safe-area-inset-bottom)+6px)] pt-1.5 shadow-[0_-10px_30px_rgba(31,30,29,0.08)] backdrop-blur md:hidden">
        {mobilePrimaryItems.map(item => (
          <MobileBottomItem
            key={item.href}
            item={item}
            active={item.activeMatcher(pathname)}
            onNavigate={closeMobile}
            onPrefetch={prefetchRoute}
          />
        ))}
        <MobileBottomButton
          active={moreActive || mobileOpen}
          icon={<MoreIcon />}
          label="更多"
          onClick={() => setMobileOpen(open => !open)}
        />
      </nav>

      <aside className="hidden h-screen min-h-0 w-64 flex-shrink-0 flex-col overflow-hidden border-r border-black/20 bg-ink-900 md:flex">
        <SidebarContent
          visibleWorkspaceItems={visibleWorkspaceItems}
          pathname={pathname}
          userName={userName}
          userEmail={user?.email}
          initial={initial}
          onLogout={logout}
          onPrefetch={prefetchRoute}
        />
      </aside>
    </>
  )
}

function MobileBottomItem({
  item, active, onNavigate, onPrefetch,
}: {
  item: WorkspaceNavItem
  active: boolean
  onNavigate: () => void
  onPrefetch: (href: string) => void
}) {
  return (
    <Link
      href={item.href}
      prefetch={false}
      onClick={onNavigate}
      onPointerEnter={() => onPrefetch(item.href)}
      onTouchStart={() => onPrefetch(item.href)}
      onFocus={() => onPrefetch(item.href)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-medium transition-colors',
        active ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:bg-canvas hover:text-ink-900'
      )}
    >
      <span className={cn('flex h-6 w-6 items-center justify-center', active ? 'text-brand' : 'text-ink-400')}>
        {item.icon}
      </span>
      <span className="truncate">{item.label === '我的项目' ? '项目' : item.label}</span>
    </Link>
  )
}

function MobileBottomButton({
  active, icon, label, onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-medium transition-colors',
        active ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:bg-canvas hover:text-ink-900'
      )}
    >
      <span className={cn('flex h-6 w-6 items-center justify-center', active ? 'text-brand' : 'text-ink-400')}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  )
}

function MobileMoreLink({
  item, active, onNavigate, onPrefetch,
}: {
  item: WorkspaceNavItem
  active: boolean
  onNavigate: () => void
  onPrefetch: (href: string) => void
}) {
  return (
    <Link
      href={item.href}
      prefetch={false}
      onClick={onNavigate}
      onPointerEnter={() => onPrefetch(item.href)}
      onTouchStart={() => onPrefetch(item.href)}
      onFocus={() => onPrefetch(item.href)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-12 items-center gap-3 rounded-xl border px-3 text-sm transition-colors',
        active
          ? 'border-brand/30 bg-brand-50 text-ink-900'
          : 'border-line bg-white text-ink-700 hover:border-brand/30 hover:bg-brand-50'
      )}
    >
      <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg bg-canvas', active ? 'text-brand' : 'text-ink-500')}>
        {item.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.label}</span>
        <span className="mt-0.5 block truncate text-[11px] text-ink-400">{item.detail}</span>
      </span>
    </Link>
  )
}

function SidebarContent({
  visibleWorkspaceItems,
  pathname,
  userName,
  userEmail,
  initial,
  onLogout,
  onNavigate,
  onPrefetch,
}: {
  visibleWorkspaceItems: WorkspaceNavItem[]
  pathname: string
  userName: string
  userEmail?: string
  initial: string
  onLogout: () => void
  onNavigate?: () => void
  onPrefetch: (href: string) => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div style={{ padding: '28px 24px' }}>
        <Link
          href="/dashboard"
          prefetch={false}
          onClick={onNavigate}
          onPointerEnter={() => onPrefetch('/dashboard')}
          onFocus={() => onPrefetch('/dashboard')}
          className="flex items-center gap-[6.5px] cursor-pointer group"
        >
          <Logo size={42} priority className="flex-shrink-0 group-hover:scale-105 transition-transform" />
          <span className="brand-wordmark text-white text-[28px]">译境</span>
        </Link>
      </div>

      <div style={{ margin: '0 24px' }} className="h-px bg-white/8" />

      {/* 工作入口 */}
      <nav className="min-h-0 flex-1 overflow-y-auto" style={{ padding: '20px 16px' }}>
        <div className="mb-4 px-2">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Workspace</p>
          <p className="text-[12px] text-white/55 mt-1">进入具体工作</p>
        </div>

        <div className="space-y-2">
          {visibleWorkspaceItems.map(item => (
            <WorkspaceItem
              key={item.href}
              active={item.activeMatcher(pathname)}
              href={item.href}
              icon={item.icon}
              label={item.label}
              detail={item.detail}
              onNavigate={onNavigate}
              onPrefetch={onPrefetch}
            />
          ))}
        </div>
      </nav>

      <div style={{ margin: '0 24px' }} className="h-px bg-white/8" />

      {/* 用户区 */}
      <div style={{ padding: '16px 16px 28px' }} className="shrink-0 space-y-1">
        <div className="flex items-center gap-3" style={{ padding: '10px 8px' }}>
          <div className="w-9 h-9 bg-brand rounded-full flex items-center justify-center flex-shrink-0">
            <span className="sidebar-white-text text-white text-sm font-semibold">{initial}</span>
          </div>
          <div className="flex flex-col min-w-0 leading-tight">
            <span className="sidebar-white-text text-white text-sm font-medium truncate">{userName}</span>
            <span className="text-ink-400 text-[11px] truncate">{userEmail}</span>
          </div>
        </div>
        <NavItem
          onClick={onLogout}
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
    </div>
  )
}

function WorkspaceItem({
  active, href, icon, label, detail, onNavigate, onPrefetch,
}: {
  active?: boolean
  href: string
  icon: React.ReactNode
  label: string
  detail: string
  onNavigate?: () => void
  onPrefetch: (href: string) => void
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      onClick={onNavigate}
      onPointerEnter={() => onPrefetch(href)}
      onFocus={() => onPrefetch(href)}
      className={cn(
        'group relative block w-full overflow-hidden rounded-xl border text-left transition-all duration-200',
        active
          ? 'border-white/12 bg-white/[0.09] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
          : 'border-transparent text-white/80 hover:border-white/8 hover:bg-white/[0.055] hover:text-white'
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
          <span className={cn('sidebar-white-text block truncate text-[13.5px] font-medium leading-tight', active ? 'text-white' : 'text-white/90 group-hover:text-white')}>
            {label}
          </span>
          <span className={cn('mt-1 block truncate text-[11px] leading-tight', active ? 'text-white/55' : 'text-white/50')}>
            {detail}
          </span>
        </span>
      </span>
    </Link>
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
      <span className={cn('truncate', active ? 'sidebar-white-text' : '')}>{label}</span>
      {active && <span className="ml-auto w-1 h-5 rounded-full bg-brand" />}
    </button>
  )
}

function MenuIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5.5 12h.01M12 12h.01M18.5 12h.01" />
    </svg>
  )
}

function AccountIcon() {
  return (
    <svg className="h-[17px] w-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d="M12 12.25a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5zM5.25 19.5a6.75 6.75 0 0113.5 0" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg className="h-[17px] w-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d="M15.75 8.25V6.75A2.25 2.25 0 0013.5 4.5h-6A2.25 2.25 0 005.25 6.75v10.5A2.25 2.25 0 007.5 19.5h6a2.25 2.25 0 002.25-2.25v-1.5M12 12h7.5m0 0l-2.75-2.75M19.5 12l-2.75 2.75" />
    </svg>
  )
}

function DashboardIcon() {
  return (
    <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d="M4.75 5.75A2 2 0 016.75 3.75h2.5a2 2 0 012 2v2.5a2 2 0 01-2 2h-2.5a2 2 0 01-2-2v-2.5zM12.75 5.75a2 2 0 012-2h2.5a2 2 0 012 2v2.5a2 2 0 01-2 2h-2.5a2 2 0 01-2-2v-2.5zM4.75 14.75a2 2 0 012-2h2.5a2 2 0 012 2v2.5a2 2 0 01-2 2h-2.5a2 2 0 01-2-2v-2.5zM12.75 14.75a2 2 0 012-2h2.5a2 2 0 012 2v2.5a2 2 0 01-2 2h-2.5a2 2 0 01-2-2v-2.5z" />
    </svg>
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

function FrontierIcon() {
  return (
    <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d="M5.25 5.25h9.75a3.75 3.75 0 013.75 3.75v9.75H8.25a3 3 0 01-3-3V5.25z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7}
        d="M8.25 8.25h7.5M8.25 11.25h5.25M8.25 14.25h6.75M18.75 9v9.75" />
    </svg>
  )
}

function MindmapIcon() {
  return (
    <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="2.25" strokeWidth={1.7} />
      <circle cx="6" cy="6.5" r="2" strokeWidth={1.7} />
      <circle cx="18" cy="6.5" r="2" strokeWidth={1.7} />
      <circle cx="6" cy="17.5" r="2" strokeWidth={1.7} />
      <circle cx="18" cy="17.5" r="2" strokeWidth={1.7} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M10.25 10.7L7.4 8.1M13.75 10.7l2.85-2.6M10.25 13.3L7.4 15.9M13.75 13.3l2.85 2.6" />
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
