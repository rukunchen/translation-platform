// 句子切分工具：按段落 → 按标点切分
// 支持中英日韩等常见语言的句末标点

export type SegmentStatus = 'untranslated' | 'draft' | 'reviewed' | 'locked'

export type Segment = {
  id: string
  document_id?: string
  position?: number
  source: string
  target: string
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

const TERMINATORS_CJK = /([。！？；…!?]+["'』」）)】]?)/g
const TERMINATORS_LATIN = /([.!?]+["'')\]]?)(\s+|$)/g

const isCJK = (lang: string) => ['zh', 'ja', 'ko'].includes(lang)

export function splitSentences(text: string, lang: string = 'en'): NewSegmentInput[] {
  if (!text?.trim()) return []

  const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(Boolean)
  const out: NewSegmentInput[] = []
  let position = 0

  for (const para of paragraphs) {
    const sentences = isCJK(lang) ? splitCJK(para) : splitLatin(para)
    for (const s of sentences) {
      const trimmed = s.trim()
      if (trimmed) {
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
  return parts
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
