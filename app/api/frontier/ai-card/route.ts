import { NextRequest, NextResponse } from 'next/server'
import { generateWith } from '@/lib/aiProviders'
import { DEFAULT_MODEL_BY_PROVIDER } from '@/lib/modelPresets'
import { supabaseFromRequest } from '@/lib/supabaseServer'

export const maxDuration = 60

type FrontierLiteratureItem = {
  id: string
  title: string
  abstract: string | null
  source: string | null
  year: number | null
  field: string | null
  tags: string[] | null
}

type AiCardPayload = {
  research_question: string
  method_summary: string
  conclusion_summary: string
  limitation_summary: string
  significance_summary: string
  literature_review_sentence: string
  confidence_note: string
}

function buildPrompt(item: FrontierLiteratureItem) {
  return `你是一名研究生论文写作助手。请为以下前沿文献补全 AI 文献卡片。

要求：
- 全部使用中文输出。
- 只基于标题和摘要判断研究问题、方法、结论、局限和意义；来源、年份、领域、标签只用于识别文献背景，不得据此编造正文信息。
- 不要编造标题和摘要中没有依据的研究对象、数据、方法、发现或结论。
- 如果摘要信息不足，请在相关字段中明确说明可靠性有限。
- literature_review_sentence 控制在 100-150 字，适合研究生论文前言或文献综述使用。
- 只返回一个合法 JSON 对象，不要使用 Markdown，不要添加解释。

JSON 字段必须完整：
{
  "research_question": "...",
  "method_summary": "...",
  "conclusion_summary": "...",
  "limitation_summary": "...",
  "significance_summary": "...",
  "literature_review_sentence": "...",
  "confidence_note": "..."
}

文献信息：
标题：${item.title || ''}
来源：${item.source || ''}
年份：${item.year || ''}
领域：${item.field || ''}
标签：${(item.tags || []).join('；')}
摘要：
${item.abstract || '暂无摘要。'}`
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1] || text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI 未返回可解析的 JSON。')
  }
  return candidate.slice(start, end + 1)
}

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseAiCard(text: string): AiCardPayload {
  const parsed = JSON.parse(extractJsonObject(text)) as Partial<Record<keyof AiCardPayload, unknown>>
  return {
    research_question: cleanString(parsed.research_question),
    method_summary: cleanString(parsed.method_summary),
    conclusion_summary: cleanString(parsed.conclusion_summary),
    limitation_summary: cleanString(parsed.limitation_summary),
    significance_summary: cleanString(parsed.significance_summary),
    literature_review_sentence: cleanString(parsed.literature_review_sentence),
    confidence_note: cleanString(parsed.confidence_note),
  }
}

export async function POST(req: NextRequest) {
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { itemId } = await req.json().catch(() => ({})) as { itemId?: string }
  const id = itemId?.trim()
  if (!id) return NextResponse.json({ error: '缺少 itemId。' }, { status: 400 })

  const { data: item, error: itemError } = await client
    .from('frontier_literature_items')
    .select('id,title,abstract,source,year,field,tags')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })
  if (!item) return NextResponse.json({ error: '文献不存在。' }, { status: 404 })

  const provider = 'openai' as const
  const model = DEFAULT_MODEL_BY_PROVIDER.openai
  const result = await generateWith(provider, {
    model,
    temperature: 0.2,
    prompt: buildPrompt(item as FrontierLiteratureItem),
  })

  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  let aiCard: AiCardPayload
  try {
    aiCard = parseAiCard(result.text)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI JSON 解析失败。' },
      { status: 502 }
    )
  }

  const updatePayload = {
    research_question: aiCard.research_question || null,
    method_summary: aiCard.method_summary || null,
    conclusion_summary: aiCard.conclusion_summary || null,
    limitation_summary: aiCard.limitation_summary || null,
    significance_summary: aiCard.significance_summary || null,
    literature_review_sentence: aiCard.literature_review_sentence || null,
    ai_card_generated_at: new Date().toISOString(),
    ai_card_model: model,
  }

  const { data: updatedItem, error: updateError } = await client
    .from('frontier_literature_items')
    .update(updatePayload)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({
    item: updatedItem,
    confidence_note: aiCard.confidence_note,
    provider,
    model,
  })
}
