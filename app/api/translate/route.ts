// POST /api/translate
// 调用 AI 翻译单段文本，须为该项目成员才能使用

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole } from '@/lib/permissions'
import { translateWith, type ProviderId } from '@/lib/aiProviders'
import { ALL_PROVIDER_IDS } from '@/lib/translateShared'
import { DEFAULT_MODEL_BY_PROVIDER } from '@/lib/modelPresets'

export const maxDuration = 120

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export async function POST(req: NextRequest) {
  try {
    const { client, user } = await supabaseFromRequest(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { text, sourceLang, targetLang, provider, model, temperature, prompt, documentId } = await req.json()
    if (!text) return NextResponse.json({ error: '缺少 text' }, { status: 400 })

    const selectedProvider = normalizeProvider(provider, model)
    if (!selectedProvider) {
      return NextResponse.json({ error: `不支持的 provider: ${provider || model}` }, { status: 400 })
    }

    // 校验：必须是该 document 所属项目的成员
    if (documentId) {
      const admin = supabaseAdmin()
      const { data: doc } = await admin
        .from('documents').select('project_id').eq('id', documentId).maybeSingle()
      if (!doc) return NextResponse.json({ error: '文档不存在' }, { status: 404 })
      const myRole = await getMyRole(client, doc.project_id, user.id)
      if (!myRole) return NextResponse.json({ error: '你不是该项目的成员' }, { status: 403 })
    }

    const selectedModel = typeof model === 'string' && !ALL_PROVIDER_IDS.includes(model as ProviderId)
      ? model
      : DEFAULT_MODEL_BY_PROVIDER[selectedProvider]
    let result = await translateWith(selectedProvider, {
      model: selectedModel,
      temperature: clampTemp(temperature),
      prompt: typeof prompt === 'string' ? prompt : '',
      source: text,
      sourceLang,
      targetLang,
    })
    if (result.error && selectedProvider === 'deepseek') {
      console.warn('DeepSeek failed, falling back to Claude:', result.error)
      result = await translateWith('claude', {
        model: DEFAULT_MODEL_BY_PROVIDER.claude,
        temperature: clampTemp(temperature),
        prompt: typeof prompt === 'string' ? prompt : '',
        source: text,
        sourceLang,
        targetLang,
      })
    }
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 502 })
    }

    return NextResponse.json({ translation: result.text })
  } catch (error: unknown) {
    console.error('Translation error:', error)
    return NextResponse.json({ error: errorMessage(error, '翻译失败，请重试') }, { status: 500 })
  }
}

function normalizeProvider(provider?: unknown, legacyModel?: unknown): ProviderId | null {
  const candidate = typeof provider === 'string' ? provider : legacyModel
  return typeof candidate === 'string' && ALL_PROVIDER_IDS.includes(candidate as ProviderId)
    ? candidate as ProviderId
    : null
}

function clampTemp(t?: unknown): number {
  return typeof t === 'number' && !isNaN(t) ? Math.max(0, Math.min(2, t)) : 0.3
}
