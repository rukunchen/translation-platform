// 复用的页面顶部
// 用法：
//   <PageHeader
//     backHref="/dashboard"
//     backLabel="返回项目列表"
//     eyebrow="Project"
//     title={project.name}
//     description={project.description}
//     actions={<Button>聊天</Button>}
//   />

'use client'

import { useRouter } from 'next/navigation'
import { cn } from './cn'
import { Eyebrow } from './Eyebrow'

type Props = {
  backHref?: string
  backLabel?: string
  eyebrow?: string
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({
  backHref, backLabel = '返回', eyebrow, title, description, actions, className,
}: Props) {
  const router = useRouter()

  return (
    <header className={cn('mb-12', className)}>
      {/* back 单独一行，作为小型 back button 放在标题上方 */}
      {backHref && (
        <button
          onClick={() => router.push(backHref)}
          className="inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-ink-900 transition-colors mb-6"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {backLabel}
        </button>
      )}

      {/* 主标题 + 描述 + actions */}
      <div className="flex min-w-0 flex-col items-stretch gap-5 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="min-w-0 flex-1">
          {eyebrow && <Eyebrow tone="muted" className="mb-2">{eyebrow}</Eyebrow>}
          <h1 className="break-words font-serif text-3xl sm:text-4xl text-ink-900 tracking-tight leading-tight">
            {title}
          </h1>
          {description && (
            <p className="text-ink-500 text-sm mt-2.5 max-w-2xl leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex min-w-0 items-center gap-2 pt-1 md:flex-shrink-0">{actions}</div>}
      </div>
    </header>
  )
}
