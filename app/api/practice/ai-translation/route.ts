import { NextRequest, NextResponse } from 'next/server'
import { generateWith } from '@/lib/aiProviders'
import { DEFAULT_MODEL_BY_PROVIDER } from '@/lib/modelPresets'
import { supabaseFromRequest } from '@/lib/supabaseServer'

export const maxDuration = 60

type TranslationRequest = {
  sourceText?: string
  direction?: string
  practiceType?: string
}

type TranslationResponse = {
  translation: string
}

export async function POST(request: NextRequest) {
  const { user } = await supabaseFromRequest(request)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as TranslationRequest
  const sourceText = body.sourceText?.trim()
  const direction = practiceDirection(body.direction)
  const practiceType = body.practiceType?.trim() || '翻译练习'

  if (!sourceText) {
    return NextResponse.json({ error: '缺少原文。' }, { status: 400 })
  }

  const result = await generateWith('deepseek', {
    model: DEFAULT_MODEL_BY_PROVIDER.deepseek,
    temperature: 0.15,
    prompt: buildTranslationPrompt({ sourceText, direction, practiceType }),
  })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 })

  const translation = parseTranslation(result.text)
  if (!translation) {
    return NextResponse.json({ error: 'AI 译文结果格式无效，请重试。' }, { status: 502 })
  }

  return NextResponse.json(translation)
}

function buildTranslationPrompt(opts: Required<TranslationRequest>): string {
  return `你是一名翻译练习助教。请为练习原文生成一版可供学习者对照的 AI 参考译文。

只输出一个 JSON 对象，不要输出 Markdown、代码围栏或额外解释。JSON 必须严格使用以下结构：
{
  "translation": "完整译文"
}

翻译要求：
1. 严格依据原文，不要补充原文没有的信息；
2. 保留原文段落层次，译文应自然、准确，适合作为翻译练习对照；
3. 语言方向为 E-C 时译为中文，C-E 时译为英文；
4. 语言方向为自定义时，依据原文语言与练习语境选择合适目标语言；
5. 练习类型仅用于判断语体和措辞。

语言方向：
${opts.direction}

练习类型：
${opts.practiceType}

原文：
${opts.sourceText}`
}

function parseTranslation(text: string): TranslationResponse | null {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  const json = cleaned.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null

  try {
    const parsed = JSON.parse(json) as Partial<TranslationResponse>
    const translation = stringValue(parsed.translation)
    return translation ? { translation } : null
  } catch {
    return null
  }
}

function practiceDirection(value: unknown): string {
  if (value === 'E-C') return 'E-C'
  if (value === 'C-E') return 'C-E'
  return '自定义'
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
