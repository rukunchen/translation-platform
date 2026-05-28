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
  score: number
  scoreReason: string
  issues: string[]
  suggestions: string[]
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
    maxTokens: 2400,
    timeoutMs: 50000,
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
  return `你是一名严格、细致的 CATTI 二级笔译练习阅卷助教。请基于原文和学生译文逐项分析翻译质量，帮助学生明确每一个可能扣分的点。

只输出一个 JSON 对象，不要输出 Markdown、代码围栏或额外解释。JSON 必须严格使用以下字段：
{
  "summary": "用中文概括译文整体表现，2-3 句",
  "score": 0,
  "scoreReason": "用中文解释分数依据，说明主要扣分来源，2-3 句",
  "issues": ["扣分点N｜类别｜严重度｜定位：原文/学生译文对应片段｜问题：具体错在哪里｜原因：为什么扣分｜修改方向：如何局部调整"],
  "suggestions": ["对应提分建议。说明修改策略和检查方法。"]
}

要求：
1. issues 必须尽量覆盖学生译文中所有关键扣分点，一条只写一个扣分点；问题较多时输出 5-8 条，问题较少时至少输出 4 条，除非译文几乎没有可扣分点；
2. issues 不要只写笼统评价，必须指出对应原文或学生译文的具体词组、句子、信息点或表达位置；
3. 每个 issues 条目必须说明扣分类型，可从误译、漏译、增译、术语/专名、逻辑关系、语体风格、句法语法、搭配用词、标点格式、中文/英文表达自然度中选择；
4. 每个 issues 条目必须说明严重度：严重 / 中等 / 轻微；明显影响信息准确或完整性的标为严重；
5. 每个 issues 字符串控制在 180 个汉字以内，既要具体，也要避免长篇展开；
6. suggestions 输出 4-6 条，内容必须与 issues 中的具体扣分点对应，避免泛泛而谈；
7. 不要编造原文没有的信息；
8. score 必须是 0-100 的整数，按照 CATTI 二级笔译实务评分口径估分：重点看信息准确完整、术语和专名处理、逻辑衔接、语体风格、中文/英文表达自然度、语法标点与格式规范；60 分视为基本合格线；
9. 分数要偏严格，明显误译、漏译或语体失当应显著扣分；
10. 不要输出示范译文或完整改译，只能给局部修改方向；
11. 练习类型仅作语体判断参考；
12. JSON 数组里的每个字符串都要是单行文本，不要在字符串内部换行。

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
    const score = scoreValue(parsed.score)
    const scoreReason = stringValue(parsed.scoreReason)
    const issues = stringList(parsed.issues)
    const suggestions = stringList(parsed.suggestions)
    if (!summary || score === null || !scoreReason || issues.length === 0 || suggestions.length === 0) return null
    return { summary, score, scoreReason, issues, suggestions }
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

function scoreValue(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : Number.NaN
  if (!Number.isFinite(number)) return null
  return Math.max(0, Math.min(100, Math.round(number)))
}
