// 极简 className 合并工具（不引入 clsx/twMerge 依赖）
// 用法：cn('a', condition && 'b', { c: cond })
type ClassValue = string | false | null | undefined | Record<string, unknown>

export function cn(...args: ClassValue[]): string {
  const out: string[] = []
  for (const a of args) {
    if (!a) continue
    if (typeof a === 'string') out.push(a)
    else if (typeof a === 'object') {
      for (const k in a) if (a[k]) out.push(k)
    }
  }
  return out.join(' ')
}
