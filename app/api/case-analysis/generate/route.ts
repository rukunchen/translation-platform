import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole } from '@/lib/permissions'
import { generateWith, type ProviderId } from '@/lib/aiProviders'
import { ALL_PROVIDER_IDS } from '@/lib/translateShared'

export const maxDuration = 60

type TranslationInput = {
  modelLabel: string
  provider?: string
  model?: string
  translatedText: string
}

export async function POST(req: NextRequest) {
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const {
    documentId, segmentId, provider, model, principlesPrompt, sourceText, translations,
  } = body as {
    documentId?: string
    segmentId?: string
    provider?: ProviderId
    model?: string
    principlesPrompt?: string
    sourceText?: string
    translations?: TranslationInput[]
  }

  if (!documentId || !segmentId || !provider || !model || !principlesPrompt?.trim() || !sourceText?.trim()) {
    return NextResponse.json({ error: '缺少必要参数' }, { status: 400 })
  }
  if (!ALL_PROVIDER_IDS.includes(provider)) {
    return NextResponse.json({ error: `不支持的 provider: ${provider}` }, { status: 400 })
  }

  const admin = supabaseAdmin()
  const { data: doc } = await admin
    .from('documents')
    .select('id, project_id')
    .eq('id', documentId)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: '文档不存在' }, { status: 404 })

  const myRole = await getMyRole(client, doc.project_id, user.id)
  if (!myRole) return NextResponse.json({ error: '你不是该项目的成员' }, { status: 403 })

  const { data: seg } = await admin
    .from('segments')
    .select('id, source, document_id')
    .eq('id', segmentId)
    .eq('document_id', documentId)
    .maybeSingle()
  if (!seg) return NextResponse.json({ error: '句段不存在' }, { status: 404 })

  const prompt = buildAnalysisPrompt({
    principlesPrompt,
    sourceText,
    translations: (translations || []).filter(t => t.translatedText?.trim()),
  })
  const result = await generateWith(provider, { model, temperature: 0.3, prompt })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  return NextResponse.json({ analysisText: result.text.trim() })
}

function buildAnalysisPrompt(opts: {
  principlesPrompt: string
  sourceText: string
  translations: TranslationInput[]
}) {
  const translationBlock = opts.translations.length > 0
    ? opts.translations.map((t, i) => {
      const label = t.modelLabel || `AI 模型 ${i + 1}`
      return `${label}：${t.translatedText.trim()}`
    }).join('\n')
    : '当前句段没有可用 AI 译文。'

  return `你是一名翻译研究与翻译案例分析助教。请严格根据以下“分析理论和原则”分析一个句段的多模型 AI 译文。

分析理论和原则：
${opts.principlesPrompt.trim()}

原文：
${opts.sourceText.trim()}

已有 AI 译文：
${translationBlock}

输出要求：
请用中文输出一个完整分析段落，不要重新翻译，不要使用列表、编号或小标题。分析必须具体比较不同 AI 译文的优点和问题，并适合用于翻译案例分析或课程论文。`
}
