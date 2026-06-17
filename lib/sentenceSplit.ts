// 句子切分工具：按段落 → 按标点切分
// 支持中英日韩等常见语言的句末标点

export type SegmentStatus = 'untranslated' | 'draft' | 'reviewed' | 'locked'

export type Segment = {
  id: string
  document_id?: string
  position?: number
  source: string
  target: string
  translator_target?: string | null
  review_target?: string | null
  notes?: string
  status?: SegmentStatus
  reviewed_by?: string | null
  reviewed_at?: string | null
  locked_by?: string | null
  locked_at?: string | null
  last_edited_by?: string | null
  created_at?: string
  updated_at?: string
}

// 用于初次切分时的最小载荷
export type NewSegmentInput = {
  position: number
  source: string
}

const CJK_CLOSING_MARKS = `[”’"'」』）)】》〉〕］〗]`
const TERMINATORS_CJK = new RegExp(`([。！？；…!?]+${CJK_CLOSING_MARKS}*)`, 'g')
const ONLY_CJK_CLOSING_MARKS = new RegExp(`^${CJK_CLOSING_MARKS}+$`)
const LEADING_CJK_CLOSING_MARKS = new RegExp(`^${CJK_CLOSING_MARKS}+`)
const TERMINATORS_LATIN = /([.!?]+["'')\]]?)(\s+|$)/g

const isCJK = (lang: string) => ['zh', 'ja', 'ko'].includes(lang)

export function splitSentences(text: string, lang: string = 'en'): NewSegmentInput[] {
  if (!text?.trim()) return []

  const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(Boolean)
  const out: NewSegmentInput[] = []
  const useCJK = isCJK(lang)
  let position = 0

  for (const para of paragraphs) {
    const sentences = useCJK ? splitCJK(para) : splitLatin(para)
    for (const s of sentences) {
      let trimmed = s.trim()
      if (trimmed) {
        if (useCJK && out.length > 0) {
          if (ONLY_CJK_CLOSING_MARKS.test(trimmed)) {
            out[out.length - 1].source += trimmed
            continue
          }

          const leading = trimmed.match(LEADING_CJK_CLOSING_MARKS)?.[0]
          if (leading) {
            out[out.length - 1].source += leading
            trimmed = trimmed.slice(leading.length).trim()
            if (!trimmed) continue
          }
        }

        out.push({ position, source: trimmed })
        position++
      }
    }
  }

  return out
}

function splitCJK(text: string): string[] {
  const parts: string[] = []
  let last = 0
  let m: RegExpExecArray | null
  TERMINATORS_CJK.lastIndex = 0
  while ((m = TERMINATORS_CJK.exec(text)) !== null) {
    parts.push(text.slice(last, m.index + m[0].length))
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return mergeDanglingCJKClosers(parts)
}

function mergeDanglingCJKClosers(parts: string[]): string[] {
  const merged: string[] = []

  for (const part of parts) {
    let trimmed = part.trim()
    if (!trimmed) continue

    if (merged.length > 0) {
      if (ONLY_CJK_CLOSING_MARKS.test(trimmed)) {
        merged[merged.length - 1] += trimmed
        continue
      }

      const leading = trimmed.match(LEADING_CJK_CLOSING_MARKS)?.[0]
      if (leading) {
        merged[merged.length - 1] += leading
        trimmed = trimmed.slice(leading.length).trim()
        if (!trimmed) continue
      }
    }

    merged.push(trimmed)
  }

  return merged
}

function splitLatin(text: string): string[] {
  const parts: string[] = []
  let last = 0
  let m: RegExpExecArray | null
  TERMINATORS_LATIN.lastIndex = 0
  while ((m = TERMINATORS_LATIN.exec(text)) !== null) {
    const end = m.index + m[1].length
    parts.push(text.slice(last, end))
    last = end + m[2].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}
