// 统一的 dashboard 主内容容器
import { cn } from './cn'

type Size = 'narrow' | 'default' | 'wide' | 'full'

type Props = {
  children: React.ReactNode
  size?: Size
  className?: string
}

const maxWidthStyle: Record<Size, string> = {
  narrow: 'max-w-4xl',
  default: 'max-w-6xl',
  wide: 'max-w-7xl',
  full: 'max-w-none',
}

export function MainContent({ children, size = 'default', className }: Props) {
  return (
    <div
      className={cn('mx-auto w-full', maxWidthStyle[size], className)}
      style={{ padding: '56px 80px' }}
    >
      {children}
    </div>
  )
}
