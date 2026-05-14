// 英文 eyebrow 小标签
// 用于 PROJECT / DOCUMENTS / TEAM / SOURCE 这类放在 h1 上方的引导标签
//
// 用法：<Eyebrow>Project</Eyebrow>
//      <Eyebrow tone="brand">Live</Eyebrow>

import { cn } from './cn'

type Tone = 'muted' | 'default' | 'brand'

type Props = {
  children: React.ReactNode
  tone?: Tone
  className?: string
}

const toneStyle: Record<Tone, string> = {
  muted: 'text-ink-400',
  default: 'text-ink-500',
  brand: 'text-brand',
}

export function Eyebrow({ children, tone = 'default', className }: Props) {
  return (
    <span className={cn(
      'inline-block text-[11px] font-mono uppercase tracking-[0.16em]',
      toneStyle[tone],
      className
    )}>
      {children}
    </span>
  )
}
