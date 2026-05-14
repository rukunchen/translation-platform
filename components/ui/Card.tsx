import { cn } from './cn'

type Variant = 'default' | 'surface' | 'flat'
type Padding = 'none' | 'sm' | 'md' | 'lg'

type Props = {
  children: React.ReactNode
  variant?: Variant
  padding?: Padding
  className?: string
  as?: 'div' | 'article' | 'section'
  interactive?: boolean
  onClick?: () => void
}

const variantStyle: Record<Variant, string> = {
  default: 'bg-white border border-line',
  surface: 'bg-surface border border-line',
  flat: 'bg-white',
}

// 内联 padding 值，避免 Tailwind 编译问题
const paddingValue: Record<Padding, string> = {
  none: '0',
  sm: '20px',
  md: '28px',
  lg: '36px',
}

export function Card({
  children,
  variant = 'default',
  padding = 'md',
  className,
  as: As = 'div',
  interactive,
  onClick,
}: Props) {
  return (
    <As
      onClick={onClick}
      className={cn(
        'rounded-2xl',
        variantStyle[variant],
        interactive && 'cursor-pointer transition-all hover:border-brand/40 hover:shadow-[var(--shadow-card-hover)]',
        className
      )}
      style={padding !== 'none' ? { padding: paddingValue[padding] } : undefined}
    >
      {children}
    </As>
  )
}

Card.Header = function CardHeader({
  children,
  className,
}: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between pb-4 mb-5 border-b border-line', className)}>
      {children}
    </div>
  )
}

Card.Body = function CardBody({
  children,
  className,
}: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>
}
