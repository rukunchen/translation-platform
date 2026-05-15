// 统一按钮组件
// variant:
//   primary    黑底白字（主要 CTA）
//   brand      橙底白字（破坏性较小的高亮，如"翻译"）
//   secondary  白底黑边黑字
//   ghost      透明底灰字，hover 高亮（次级操作）
//   danger     红色（删除）
// size: sm / md / lg
//
// 支持 loading 自动禁用 + spinner；leftIcon / rightIcon

import { cn } from './cn'

type Variant = 'primary' | 'brand' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

type Props = {
  children?: React.ReactNode
  variant?: Variant
  size?: Size
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  fullWidth?: boolean
  className?: string
  type?: 'button' | 'submit' | 'reset'
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  title?: string
}

const variantStyle: Record<Variant, string> = {
  primary:
    'bg-ink-900 text-white hover:bg-ink-800 active:bg-ink-700 disabled:bg-ink-900/40',
  brand:
    'bg-brand text-white hover:bg-brand-600 active:bg-brand-700 disabled:bg-brand/40',
  secondary:
    'bg-white text-ink-900 border-2 border-ink-900 hover:bg-ink-900 hover:text-white disabled:opacity-40',
  ghost:
    'bg-transparent text-ink-500 hover:bg-canvas hover:text-ink-900 disabled:opacity-40',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-600/40',
}

const sizeStyle: Record<Size, string> = {
  sm: 'text-xs rounded-lg gap-1.5',
  md: 'text-sm rounded-xl gap-2',
  lg: 'text-sm rounded-xl gap-2',
}

const sizePadding: Record<Size, React.CSSProperties> = {
  sm: { paddingLeft: 12, paddingRight: 12, paddingTop: 7, paddingBottom: 7 },
  md: { paddingLeft: 16, paddingRight: 16, paddingTop: 9, paddingBottom: 9 },
  lg: { paddingLeft: 20, paddingRight: 20, paddingTop: 11, paddingBottom: 11 },
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading,
  leftIcon,
  rightIcon,
  fullWidth,
  className,
  type = 'button',
  onClick,
  disabled,
  title,
}: Props) {
  const isDisabled = !!disabled || !!loading
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      title={title}
      style={sizePadding[size]}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors',
        'disabled:cursor-not-allowed',
        variantStyle[variant],
        sizeStyle[size],
        fullWidth && 'w-full',
        className
      )}
    >
      {loading ? (
        <span className={cn('inline-block border-2 border-current border-t-transparent rounded-full animate-spin',
          size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
      ) : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  )
}
