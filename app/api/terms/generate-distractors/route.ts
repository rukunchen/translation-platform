import { NextRequest, NextResponse } from 'next/server'
import { generateWith } from '@/lib/aiProviders'
import { DEFAULT_MODEL_BY_PROVIDER } from '@/lib/modelPresets'
import { supabaseFromRequest } from '@/lib/supabaseServer'

export const maxDuration = 60

type DistractorDirection = 'zh_to_en' | 'en_to_zh'

type DistractorRequest = {
  source_text?: string
  target_text?: string
  direction?: DistractorDirection
  definition?: string | null
  example_sentence?: string | null
  category_name?: string | null
  tags?: string[] | null
}

type Distractor = {
  text: string
  reason: string
}

type DistractorPromptInput = {
  source_text: string
  target_text: string
  direction: DistractorDirection
  definition: string
  example_sentence: string
  category_name: string
  tags: string[]
}

export async function POST(request: NextRequest) {
  const { user } = await supabaseFromRequest(request)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as DistractorRequest
  const sourceText = body.source_text?.trim()
  const targetText = body.target_text?.trim()
  const direction = body.direction

  if (!sourceText || !targetText || !isDistractorDirection(direction)) {
    return NextResponse.json({ error: '缺少 source_text、target_text 或 direction。' }, { status: 400 })
  }

  const result = await generateWith('deepseek', {
    model: DEFAULT_MODEL_BY_PROVIDER.deepseek,
    temperature: 0.35,
    maxTokens: 900,
    timeoutMs: 30000,
    prompt: buildDistractorPrompt({
      source_text: sourceText,
      target_text: targetText,
      direction,
      definition: cleanOptional(body.definition),
      example_sentence: cleanOptional(body.example_sentence),
      category_name: cleanOptional(body.category_name),
      tags: cleanTags(body.tags),
    }),
  })

  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 })

  const distractors = parseDistractors(result.text, direction === 'zh_to_en' ? targetText : sourceText)
  if (distractors.length !== 3) {
    return NextResponse.json({ error: 'AI 干扰项结果格式无效，请重试。' }, { status: 502 })
  }

  return NextResponse.json({ distractors })
}

function buildDistractorPrompt(opts: DistractorPromptInput) {
  const context = [
    `分类：${opts.category_name || '未提供'}`,
    `标签：${opts.tags.length > 0 ? opts.tags.join('；') : '未提供'}`,
    `定义：${opts.definition || '未提供'}`,
    `例句：${opts.example_sentence || '未提供'}`,
  ].join('\n')

  if (opts.direction === 'zh_to_en') {
    return `你是一名翻译测试命题老师。请根据中文词条和正确英文译法，生成 3 个高质量英文干扰项。

只输出一个 JSON 对象，不要输出 Markdown、代码围栏或额外解释。JSON 必须严格使用以下结构：
{
  "distractors": [
    { "text": "错误英文译法", "reason": "用中文说明这个选项为什么错，最多 28 字" }
  ]
}

生成要求：
1. 干扰项必须围绕当前词条，不能引用其他无关词条；
2. 错误要像真实学习者可能写出的译法，不能明显荒唐；
3. 优先覆盖字面直译、近义词误用、搭配错误、政策/法律/经济术语不规范、语体不正式或不自然；
4. 不能与正确答案完全相同，也不要只改大小写、标点或冠词；
5. 不能过于接近正确答案到无法判断；
6. 每个 text 必须是可作为选择题选项的简短译法，不要写解释句。

中文词条：
${opts.source_text}

正确英文译法：
${opts.target_text}

补充信息：
${context}`
  }

  return `你是一名翻译测试命题老师。请根据英文词条和正确中文译法，生成 3 个高质量中文干扰项。

只输出一个 JSON 对象，不要输出 Markdown、代码围栏或额外解释。JSON 必须严格使用以下结构：
{
  "distractors": [
    { "text": "错误中文译法", "reason": "用中文说明这个选项为什么错，最多 28 字" }
  ]
}

生成要求：
1. 干扰项必须围绕当前词条，不能引用其他无关词条；
2. 错误要像真实学习者可能写出的译法，不能明显荒唐；
3. 优先覆盖过度字面化、中文术语不规范、概念边界错误、语体不适合、近义词混淆；
4. 不能与正确答案完全相同，也不要只改标点或虚词；
5. 不能过于接近正确答案到无法判断；
6. 每个 text 必须是可作为选择题选项的简短译法，不要写解释句。

英文词条：
${opts.target_text}

正确中文译法：
${opts.source_text}

补充信息：
${context}`
}

function parseDistractors(text: string, correctAnswer: string): Distractor[] {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  const json = cleaned.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return []

  try {
    const parsed = JSON.parse(json) as { distractors?: unknown }
    if (!Array.isArray(parsed.distractors)) return []

    const seen = new Set([normalizeOption(correctAnswer)])
    const distractors: Distractor[] = []

    for (const value of parsed.distractors) {
      if (!value || typeof value !== 'object') continue
      const row = value as Record<string, unknown>
      const optionText = stringValue(row.text)
      const reason = stringValue(row.reason)
      const normalized = normalizeOption(optionText)
      if (!optionText || !normalized || seen.has(normalized)) continue
      seen.add(normalized)
      distractors.push({
        text: optionText,
        reason: reason || '该选项属于常见误译或不规范表达。',
      })
      if (distractors.length === 3) break
    }

    return distractors
  } catch {
    return []
  }
}

function isDistractorDirection(value: unknown): value is DistractorDirection {
  return value === 'zh_to_en' || value === 'en_to_zh'
}

function cleanOptional(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(tag => typeof tag === 'string' ? tag.trim() : '').filter(Boolean).slice(0, 8)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeOption(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:'"`，。！？；：“”‘’、]/g, '')
    .toLocaleLowerCase()
}
