'use client'

import { Eyebrow } from '@/components/ui/Eyebrow'
import { cn } from '@/components/ui/cn'

type DashboardSectionProps = {
  id?: string
  eyebrow: string
  title: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function DashboardSection({
  id,
  eyebrow,
  title,
  action,
  children,
  className,
}: DashboardSectionProps) {
  return (
    <section
      id={id}
      className={className}
      style={{ marginBottom: 96, scrollMarginTop: id ? 32 : undefined }}
    >
      <div
        className={cn(
          'flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between border-b border-line'
        )}
        style={{ marginBottom: 40, paddingBottom: 24 }}
      >
        <div>
          <Eyebrow tone="muted" className="mb-2">{eyebrow}</Eyebrow>
          <h2 className="font-serif text-xl text-ink-900 leading-tight">{title}</h2>
        </div>
        {action}
      </div>

      {children}
    </section>
  )
}
