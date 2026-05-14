// POST /api/translate
// 调用 AI 翻译单段文本，须为该项目成员才能使用

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole } from '@/lib/permissions'

export const maxDuration = 120

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com'
})

const langNames: Record<string, string> = {
  en: '英语', zh: '中文', ja: '日语', ko: '韩语',
  fr: '法语', de: '德语', es: '西班牙语', ru: '俄语'
}

export async function POST(req: NextRequest) {
  try {
    const { client, user } = await supabaseFromRequest(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { text, sourceLang, targetLang, model, documentId } = await req.json()
    if (!text) return NextResponse.json({ error: '缺少 text' }, { status: 400 })

    // 校验：必须是该 document 所属项目的成员
    if (documentId) {
      const admin = supabaseAdmin()
      const { data: doc } = await admin
        .from('documents').select('project_id').eq('id', documentId).maybeSingle()
      if (!doc) return NextResponse.json({ error: '文档不存在' }, { status: 404 })
      const myRole = await getMyRole(client, doc.project_id, user.id)
      if (!myRole) return NextResponse.json({ error: '你不是该项目的成员' }, { status: 403 })
    }

    const prompt = `请将以下${langNames[sourceLang] || sourceLang}文本翻译成${langNames[targetLang] || targetLang}。只输出译文，不要解释。\n\n原文：\n${text}`

    const callClaude = async () => {
      const res = await Promise.race([
        anthropic.messages.create({
          model: 'claude-opus-4-7',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }]
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('翻译超时，请重试')), 110000)
        )
      ])
      return ((res as Awaited<ReturnType<typeof anthropic.messages.create>>).content[0] as any).text as string
    }

    let translation = ''
    if (model === 'deepseek') {
      try {
        const res = await Promise.race([
          deepseek.chat.completions.create({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }]
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT')), 30000)
          )
        ])
        translation = (res as Awaited<ReturnType<typeof deepseek.chat.completions.create>>).choices[0].message.content || ''
      } catch (e: any) {
        // DeepSeek 失败（连接错误或超时）→ 自动降级到 Claude
        console.warn('DeepSeek failed, falling back to Claude:', e?.message)
        translation = await callClaude()
      }
    } else {
      translation = await callClaude()
    }

    return NextResponse.json({ translation })
  } catch (error: any) {
    console.error('Translation error:', error)
    return NextResponse.json({ error: error.message || '翻译失败，请重试' }, { status: 500 })
  }
}
