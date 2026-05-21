import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { generateWith } from '@/lib/aiProviders'
import { DEFAULT_MODEL_BY_PROVIDER } from '@/lib/modelPresets'

export const maxDuration = 60

const PROMPTS: Record<string, string> = {
  summary: '请用中文总结这篇文献的核心内容、研究背景和学术价值。',
  questions: '请用中文提取这篇文献的研究问题，并说明每个问题的意义。',
  theory: '请用中文提取这篇文献使用的理论框架、核心概念和分析路径。',
  method: '请用中文提取这篇文献的研究方法、数据来源和分析步骤。',
  findings: '请用中文提取这篇文献的主要发现和结论。',
  note: '请生成一段中文阅读笔记，适合研究生论文写作时使用。',
  review_draft: '请基于这篇文献生成一段中文文献综述段落草稿，注意保持学术语体，不要夸大。',
  quotable: '请找出这篇文献中适合引用的观点，并说明可用于论文哪个部分。',
}

export async function POST(req: NextRequest) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { itemId, action } = await req.json().catch(() => ({})) as { itemId?: string; action?: string }
  if (!itemId || !action) return NextResponse.json({ error: '缺少 itemId 或 action' }, { status: 400 })

  const admin = supabaseAdmin()
  const { data: item } = await admin
    .from('research_library_items')
    .select('*')
    .eq('id', itemId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!item) return NextResponse.json({ error: '文献不存在或无权访问' }, { status: 404 })

  const provider = 'openai' as const
  const model = DEFAULT_MODEL_BY_PROVIDER.openai
  const prompt = `${PROMPTS[action] || PROMPTS.note}

文献信息：
标题：${item.title || ''}
作者：${item.authors || ''}
年份：${item.year || ''}
来源：${item.source_title || ''}
DOI：${item.doi || ''}
关键词：${(item.keywords || []).join('；')}
摘要：
${item.abstract || '暂无摘要。请根据已有元数据给出有限、谨慎的阅读建议。'}

输出要求：使用中文，结构清晰，可以分段，但不要生成整篇论文。`

  const result = await generateWith(provider, { model, temperature: 0.3, prompt })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  const { data: note, error } = await admin
    .from('research_notes')
    .insert({
      item_id: itemId,
      user_id: user.id,
      note_type: 'AI 生成笔记',
      content: result.text.trim(),
      selected_text: '',
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ note, provider, model })
}
