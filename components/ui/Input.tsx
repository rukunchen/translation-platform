// 统一表单控件：Input / Textarea / Select

import { cn } from './cn'

type FieldProps = {
  label?: string
  hint?: string
  error?: string
  className?: string
  inputClassName?: string
}

const baseControl = cn(
  'w-full bg-white text-base text-ink-900 placeholder-ink-300',
  'border-2 border-line rounded-xl',
  'focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10',
  'disabled:bg-canvas disabled:text-ink-400 disabled:cursor-not-allowed',
  'transition-all'
)

// 内联 padding，保证不被 Tailwind 编译问题影响
const inputPadding = { paddingLeft: 20, paddingRight: 20, paddingTop: 14, paddingBottom: 14 }

type InputProps = FieldProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'>

export function Input({ label, hint, error, className, inputClassName, style, ...rest }: InputProps & { style?: React.CSSProperties }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      <input
        {...rest}
        className={cn(baseControl, error && 'border-red-400 focus:border-red-500 focus:ring-red-100', inputClassName)}
        style={{ ...inputPadding, ...style }}
      />
    </Field>
  )
}

type TextareaProps = FieldProps & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>

export function Textarea({ label, hint, error, className, inputClassName, style, ...rest }: TextareaProps & { style?: React.CSSProperties }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      <textarea
        {...rest}
        className={cn(baseControl, 'resize-none leading-relaxed', error && 'border-red-400 focus:border-red-500 focus:ring-red-100', inputClassName)}
        style={{ ...inputPadding, ...style }}
      />
    </Field>
  )
}

type SelectProps = FieldProps & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'className'> & {
  children: React.ReactNode
}

export function Select({ label, hint, error, className, inputClassName, style, children, ...rest }: SelectProps & { style?: React.CSSProperties }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      <select
        {...rest}
        className={cn(baseControl, 'appearance-none bg-no-repeat', inputClassName)}
        style={{
          ...inputPadding,
          paddingRight: 40, // 给下拉箭头留空间
          backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' viewBox='0 0 24 24' stroke='%237A7872' stroke-width='2'><path stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/></svg>\")",
          backgroundPosition: 'right 16px center',
          backgroundRepeat: 'no-repeat',
          ...style,
        }}
      >
        {children}
      </select>
    </Field>
  )
}

// ============ 共用 Field 包装 ============
function Field({
  label, hint, error, className, children,
}: FieldProps & { children: React.ReactNode }) {
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="block text-[11px] font-medium text-ink-700 mb-2 uppercase tracking-[0.14em]">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  )
}
