import { NextRequest, NextResponse } from 'next/server'
import { generateWith } from '@/lib/aiProviders'
import { DEFAULT_MODEL_BY_PROVIDER } from '@/lib/modelPresets'
import { supabaseFromRequest } from '@/lib/supabaseServer'

export const maxDuration = 60

const expressionCategories = ['专有名词', '重点名词', '动词', '形容词'] as const

type ExpressionCategory = typeof expressionCategories[number]

type ExpressionRequest = {
  sourceText?: string
  referenceTranslation?: string
  practiceType?: string
}

type ExtractedExpression = {
  category: ExpressionCategory
  sourceExpression: string
  referenceTranslation: string
  note: string
}

type ExpressionResponse = {
  expressions: ExtractedExpression[]
}

export async function POST(request: NextRequest) {
  const { user } = await supabaseFromRequest(request)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as ExpressionRequest
  const sourceText = body.sourceText?.trim()
  const referenceTranslation = body.referenceTranslation?.trim()
  const practiceType = body.practiceType?.trim() || '翻译练习'

  if (!sourceText || !referenceTranslation) {
    return NextResponse.json({ error: '缺少原文或参考译文。' }, { status: 400 })
  }

  const result = await generateWith('deepseek', {
    model: DEFAULT_MODEL_BY_PROVIDER.deepseek,
    temperature: 0.15,
    prompt: buildExpressionPrompt({ sourceText, referenceTranslation, practiceType }),
  })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 })

  const expressions = parseExpressions(result.text, sourceText)
  if (!expressions) {
    return NextResponse.json({ error: 'AI 表达提取结果格式无效，请重试。' }, { status: 502 })
  }

  return NextResponse.json(expressions)
}

function buildExpressionPrompt(opts: Required<ExpressionRequest>): string {
  return `你是一名翻译练习助教。请从原文中提取值得积累的高频表达，并用参考译文确定其推荐译法。

只输出一个 JSON 对象，不要输出 Markdown、代码围栏或额外解释。JSON 必须严格使用以下结构：
{
  "expressions": [
    {
      "category": "专有名词",
      "sourceExpression": "必须逐字来自原文的词或短语",
      "referenceTranslation": "参考译文中的对应译法",
      "note": "用中文说明为何值得积累，最多 18 字"
    }
  ]
}

提取要求：
1. 只提取原文中的四类表达：专有名词、重点名词、动词、形容词；
2. category 只能是“专有名词”“重点名词”“动词”“形容词”之一；
3. sourceExpression 必须能在原文中找到，不要改写、扩写或编造；
4. referenceTranslation 必须以参考译文为依据，优先写参考译文中的对应译法；无法可靠对齐时不要提取；
5. 每类最多提取 4 条，优先选影响理解、语体或复用价值高的表达，避免虚词、泛词和重复项；
6. 某类没有合适表达时可以不输出该类条目；
7. 练习类型仅用于判断哪些词更值得积累。

练习类型：
${opts.practiceType}

原文：
${opts.sourceText}

参考译文：
${opts.referenceTranslation}`
}

function parseExpressions(text: string, sourceText: string): ExpressionResponse | null {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  const json = cleaned.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null

  try {
    const parsed = JSON.parse(json) as { expressions?: unknown }
    if (!Array.isArray(parsed.expressions)) return null

    const seen = new Set<string>()
    const countByCategory = new Map<ExpressionCategory, number>()
    const expressions = parsed.expressions.flatMap(value => {
      if (!value || typeof value !== 'object') return []
      const row = value as Record<string, unknown>
      const category = expressionCategory(row.category)
      const sourceExpression = stringValue(row.sourceExpression)
      const referenceTranslation = stringValue(row.referenceTranslation)
      const note = stringValue(row.note)
      if (!category || !sourceExpression || !referenceTranslation || !sourceIncludes(sourceText, sourceExpression)) return []

      const key = `${category}:${sourceExpression.toLowerCase()}:${referenceTranslation}`
      if (seen.has(key) || (countByCategory.get(category) ?? 0) >= 4) return []
      seen.add(key)
      countByCategory.set(category, (countByCategory.get(category) ?? 0) + 1)

      return [{ category, sourceExpression, referenceTranslation, note }]
    })

    return { expressions }
  } catch {
    return null
  }
}

function expressionCategory(value: unknown): ExpressionCategory | null {
  const category = stringValue(value)
  return expressionCategories.includes(category as ExpressionCategory)
    ? category as ExpressionCategory
    : null
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function sourceIncludes(sourceText: string, sourceExpression: string): boolean {
  return compactText(sourceText).includes(compactText(sourceExpression))
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}
