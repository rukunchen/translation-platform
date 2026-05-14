// 统一表单控件：Input / Textarea / Select
// 都自带 label / hint / error 三段式结构，padding/边框/focus 一致

import { cn } from './cn'

type FieldProps = {
  label?: string
  hint?: string
  error?: string
  className?: string       // 外层 wrapper class
  inputClassName?: string  // input 本身 class
}

const baseControl = cn(
  'w-full bg-white text-base text-ink-900 placeholder-ink-300',
  'border-2 border-line rounded-xl px-5 py-3.5',
  'focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10',
  'disabled:bg-canvas disabled:text-ink-400 disabled:cursor-not-allowed',
  'transition-all'
)

type InputProps = FieldProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'>

export function Input({ label, hint, error, className, inputClassName, ...rest }: InputProps) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      <input
        {...rest}
        className={cn(baseControl, error && 'border-red-400 focus:border-red-500 focus:ring-red-100', inputClassName)}
      />
    </Field>
  )
}

type TextareaProps = FieldProps & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>

export function Textarea({ label, hint, error, className, inputClassName, ...rest }: TextareaProps) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      <textarea
        {...rest}
        className={cn(baseControl, 'resize-none leading-relaxed', error && 'border-red-400 focus:border-red-500 focus:ring-red-100', inputClassName)}
      />
    </Field>
  )
}

type SelectProps = FieldProps & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'className'> & {
  children: React.ReactNode
}

export function Select({ label, hint, error, className, inputClassName, children, ...rest }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      <select
        {...rest}
        className={cn(baseControl, 'pr-10 appearance-none bg-no-repeat', inputClassName)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' viewBox='0 0 24 24' stroke='%237A7872' stroke-width='2'><path stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/></svg>\")",
          backgroundPosition: 'right 16px center',
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
