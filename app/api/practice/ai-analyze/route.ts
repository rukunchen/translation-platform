import { NextRequest, NextResponse } from 'next/server'
import { generateWith } from '@/lib/aiProviders'
import { DEFAULT_MODEL_BY_PROVIDER } from '@/lib/modelPresets'
import { supabaseFromRequest } from '@/lib/supabaseServer'

export const maxDuration = 60

type AnalyzeRequest = {
  sourceText?: string
  userTranslation?: string
  practiceType?: string
}

type AnalysisResponse = {
  summary: string
  issues: string[]
  suggestions: string[]
  improvedTranslation: string
}

export async function POST(request: NextRequest) {
  const { user } = await supabaseFromRequest(request)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as AnalyzeRequest
  const sourceText = body.sourceText?.trim()
  const userTranslation = body.userTranslation?.trim()
  const practiceType = body.practiceType?.trim() || '翻译练习'

  if (!sourceText || !userTranslation) {
    return NextResponse.json({ error: '缺少原文或我的译文。' }, { status: 400 })
  }

  const result = await generateWith('deepseek', {
    model: DEFAULT_MODEL_BY_PROVIDER.deepseek,
    temperature: 0.2,
    prompt: buildAnalysisPrompt({ sourceText, userTranslation, practiceType }),
  })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 })

  const analysis = parseAnalysis(result.text)
  if (!analysis) {
    return NextResponse.json({ error: 'AI 分析结果格式无效，请重试。' }, { status: 502 })
  }

  return NextResponse.json(analysis)
}

function buildAnalysisPrompt(opts: Required<AnalyzeRequest>): string {
  return `你是一名翻译练习助教。请基于原文和学生译文分析翻译质量，帮助学生改进译文。

只输出一个 JSON 对象，不要输出 Markdown、代码围栏或额外解释。JSON 必须严格使用以下字段：
{
  "summary": "用中文概括译文整体表现，1-2 句",
  "issues": ["具体问题，指出漏译、误译、语气、逻辑或表达问题"],
  "suggestions": ["可执行的修改建议"],
  "improvedTranslation": "给出一版完整改写参考"
}

要求：
1. issues 和 suggestions 各输出 2-4 条，内容必须结合本次练习；
2. 不要编造原文没有的信息；
3. improvedTranslation 只写改写后的译文，不加标题或前缀；
4. 练习类型仅作语体判断参考。

练习类型：
${opts.practiceType}

原文：
${opts.sourceText}

学生译文：
${opts.userTranslation}`
}

function parseAnalysis(text: string): AnalysisResponse | null {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  const json = cleaned.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null

  try {
    const parsed = JSON.parse(json) as Partial<AnalysisResponse>
    const summary = stringValue(parsed.summary)
    const improvedTranslation = stringValue(parsed.improvedTranslation)
    const issues = stringList(parsed.issues)
    const suggestions = stringList(parsed.suggestions)
    if (!summary || !improvedTranslation || issues.length === 0 || suggestions.length === 0) return null
    return { summary, issues, suggestions, improvedTranslation }
  } catch {
    return null
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : []
}
