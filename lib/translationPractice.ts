export type PracticeStatus = 'unpracticed' | 'drafted' | 'compared' | 'review_due' | 'mastered'
export type PracticeDirection = 'E-C' | 'C-E' | 'custom'
export type FamiliarityLevel = 'new' | 'learning' | 'mastered'
export type ReviewResult = 'forgot' | 'fuzzy' | 'remembered'
export type SplitMode = 'paragraph' | 'sentence'

export type TranslationPracticeItem = {
  id: string
  user_id: string
  title: string
  direction: PracticeDirection | string
  exam_type: string
  text_type: string
  difficulty: number
  source_text: string
  reference_translation: string
  my_translation: string
  ai_translation: string
  status: PracticeStatus | string
  tags: string[]
  source_note: string
  next_review_at: string | null
  created_at: string
  updated_at: string
}

export type TranslationPracticeSegment = {
  id: string
  practice_item_id: string
  segment_order: number
  source_text: string
  my_translation: string
  reference_translation: string
  ai_translation: string
  note: string
  created_at: string
  updated_at: string
}

export type TranslationPracticeIssue = {
  id: string
  practice_item_id: string
  segment_id: string | null
  issue_type: string
  severity: string
  description: string
  suggestion: string
  is_added_to_review: boolean
  created_at: string
  updated_at: string
}

export type ExpressionCard = {
  id: string
  user_id: string
  practice_item_id: string | null
  segment_id: string | null
  source_expression: string
  target_expression: string
  context_sentence: string
  usage_context: string
  category: string
  tags: string[]
  note: string
  familiarity_level: FamiliarityLevel | string
  next_review_at: string | null
  review_count: number
  remembered_streak: number
  created_at: string
  updated_at: string
}

export const PRACTICE_DIRECTIONS = ['E-C', 'C-E', '自定义'] as const
export const PRACTICE_EXAM_TYPES = ['CATTI', 'MTI', '课程练习', '商务翻译', '政府报告', '文学翻译', '自定义'] as const
export const PRACTICE_TEXT_TYPES = ['政治', '经济', '科技', '商务', '文化', '文学', '法律', '医学', '其他'] as const
export const PRACTICE_STATUSES: PracticeStatus[] = ['unpracticed', 'drafted', 'compared', 'review_due', 'mastered']
export const PRACTICE_DIFFICULTIES = [1, 2, 3, 4, 5] as const
export const PRACTICE_ISSUE_TYPES = [
  '理解错误',
  '漏译',
  '误译',
  '术语不准',
  '搭配不自然',
  '句式生硬',
  '逻辑关系错误',
  '长难句处理失败',
  '语气不当',
  '文体不符',
  '中式英语',
  '表达太简单',
  '过度直译',
  '过度意译',
  '标点格式问题',
  '其他',
] as const
export const PRACTICE_ISSUE_SEVERITIES = ['轻微', '中等', '严重'] as const
export const EXPRESSION_CARD_CATEGORIES = [
  '高频词组',
  '术语表达',
  '政治表达',
  '商务表达',
  '文学表达',
  '连接表达',
  '句型结构',
  '翻译技巧',
  '其他',
] as const

export const practiceStatusMeta: Record<PracticeStatus, { label: string; cls: string }> = {
  unpracticed: { label: '未练', cls: 'border-line bg-canvas text-ink-600' },
  drafted: { label: '已初译', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  compared: { label: '已对照', cls: 'border-blue-200 bg-blue-50 text-blue-800' },
  review_due: { label: '待复习', cls: 'border-rose-200 bg-rose-50 text-rose-800' },
  mastered: { label: '已掌握', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
}

export const familiarityMeta: Record<FamiliarityLevel, { label: string; cls: string }> = {
  new: { label: '新卡', cls: 'border-brand-200 bg-brand-50 text-brand-700' },
  learning: { label: '学习中', cls: 'border-blue-200 bg-blue-50 text-blue-800' },
  mastered: { label: '已掌握', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
}

export function tagsFromText(value: string) {
  return Array.from(new Set(value
    .split(/[,，;；\n]/)
    .map(tag => tag.trim())
    .filter(Boolean)))
}

export function tagsToText(tags?: string[] | null) {
  return (tags ?? []).join('，')
}

export function countPracticeWords(value: string) {
  const text = value.trim()
  if (!text) return 0
  const chineseCount = text.match(/[\u3400-\u9fff]/g)?.length ?? 0
  const wordCount = text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g)?.length ?? 0
  return chineseCount + wordCount
}

export function formatPracticeDate(value?: string | null) {
  if (!value) return '未安排'
  return new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function toPracticeDirection(value: string): PracticeDirection {
  if (value === 'E-C' || value === 'C-E') return value
  return 'custom'
}

export function displayDirection(value: string) {
  return value === 'custom' ? '自定义' : value
}

export function practiceStatus(value: string): PracticeStatus {
  return PRACTICE_STATUSES.includes(value as PracticeStatus) ? value as PracticeStatus : 'unpracticed'
}

export function familiarityLevel(value: string): FamiliarityLevel {
  return value === 'learning' || value === 'mastered' ? value : 'new'
}

export function splitPracticeText(value: string, mode: SplitMode) {
  const text = value.trim()
  if (!text) return []
  if (mode === 'paragraph') {
    return text
      .split(/\n\s*\n|\n/)
      .map(part => part.trim())
      .filter(Boolean)
  }
  return text
    .replace(/\r/g, '')
    .split(/\n+/)
    .flatMap(paragraph => paragraph.match(/[^。！？!?；;.]+[。！？!?；;.]?/g) ?? [])
    .map(part => part.trim())
    .filter(Boolean)
}

export function nextReviewDate(result: ReviewResult, from = new Date()) {
  const days = result === 'forgot' ? 1 : result === 'fuzzy' ? 3 : 7
  const next = new Date(from)
  next.setDate(next.getDate() + days)
  return next.toISOString()
}

export function isReviewDue(value?: string | null, now = new Date()) {
  if (!value) return false
  return new Date(value).getTime() <= now.getTime()
}
