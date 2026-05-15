// POST /api/parallel-translate
// 单个 (segment × model) 翻译并写入 parallel_translations 表
//
// body: {
//   documentId: string
//   segmentId: string
//   provider: 'deepseek' | 'claude' | 'doubao' | 'openai'
//   model: string
//   temperature: number
//   prompt: string
//   sourceLang: string
//   targetLang: string
// }
//
// 返回: { result: { id, segment_id, provider, model, status, translated_text, error_message } }
//
// 设计：每次调用只翻译 1 条；前端按 (segment × model) 笛卡尔积发 N 次请求，自己控制并发。
// 同一 (segment, provider, model) 重复翻译会 upsert 覆盖旧记录。

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole } from '@/lib/permissions'
import { translateWith, type ProviderId } from '@/lib/aiProviders'
import { ALL_PROVIDER_IDS } from '@/lib/translateShared'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const {
    documentId, segmentId,
    provider, model, temperature, prompt,
    sourceLang, targetLang,
  } = body as {
    documentId?: string
    segmentId?: string
    provider?: ProviderId
    model?: string
    temperature?: number
    prompt?: string
    sourceLang?: string
    targetLang?: string
  }

  if (!documentId || !segmentId || !provider || !model || !sourceLang || !targetLang) {
    return NextResponse.json({ error: '缺少必要参数' }, { status: 400 })
  }
  if (!ALL_PROVIDER_IDS.includes(provider as ProviderId)) {
    return NextResponse.json({ error: `不支持的 provider: ${provider}` }, { status: 400 })
  }

  const admin = supabaseAdmin()

  // 1) 校验：必须是该 document 的项目成员
  const { data: doc } = await admin
    .from('documents').select('project_id').eq('id', documentId).maybeSingle()
  if (!doc) return NextResponse.json({ error: '文档不存在' }, { status: 404 })

  const myRole = await getMyRole(client, doc.project_id, user.id)
  if (!myRole) return NextResponse.json({ error: '你不是该项目的成员' }, { status: 403 })

  // 2) 取 segment 的原文
  const { data: seg } = await admin
    .from('segments').select('id, source, document_id')
    .eq('id', segmentId).eq('document_id', documentId).maybeSingle()
  if (!seg) return NextResponse.json({ error: 'segment not found' }, { status: 404 })

  // 3) 先写一条 running 记录（让前端能立刻看到进行中状态）
  const temp = clampTemp(temperature)
  const { data: upserted } = await admin
    .from('parallel_translations')
    .upsert({
      document_id: documentId,
      segment_id: segmentId,
      provider,
      model,
      temperature: temp,
      prompt: prompt ?? '',
      source_text: seg.source,
      translated_text: '',
      status: 'running',
      error_message: null,
      created_by: user.id,
    }, { onConflict: 'segment_id,provider,model' })
    .select()
    .single()

  // 4) 调 AI
  const { text, error: aiErr } = await translateWith(provider, {
    model,
    temperature: temp,
    prompt: prompt ?? '',
    source: seg.source,
    sourceLang,
    targetLang,
  })

  // 5) 写回结果
  const updateFields = aiErr
    ? { status: 'failed' as const, error_message: aiErr, translated_text: '' }
    : { status: 'success' as const, error_message: null, translated_text: text }

  const { data: final, error: dbErr } = await admin
    .from('parallel_translations')
    .update(updateFields)
    .eq('id', upserted!.id)
    .select()
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ result: final })
}

function clampTemp(t?: number): number {
  if (typeof t !== 'number' || isNaN(t)) return 0.3
  return Math.max(0, Math.min(2, t))
}
