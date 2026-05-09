import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

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
    const { text, sourceLang, targetLang, model } = await req.json()
    const prompt = `请将以下${langNames[sourceLang] || sourceLang}文本翻译成${langNames[targetLang] || targetLang}。只输出译文，不要解释。\n\n原文：\n${text}`

    let translation = ''

    if (model === 'deepseek') {
      const res = await deepseek.chat.completions.create({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }]
      })
      translation = res.choices[0].message.content || ''
    } else {
      const res = await anthropic.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      })
      translation = (res.content[0] as any).text || ''
    }

    return NextResponse.json({ translation })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}