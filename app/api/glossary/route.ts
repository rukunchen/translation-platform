import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com'
})

export async function POST(req: NextRequest) {
  try {
    const { sourceText, translatedText, sourceLang, targetLang } = await req.json()
    const prompt = `从以下原文和译文中提取重要的专业术语对照表。\n\n原文（${sourceLang}）：\n${sourceText.slice(0, 1000)}\n\n译文（${targetLang}）：\n${translatedText.slice(0, 1000)}\n\n请提取5-8个最重要的专业术语，严格按照以下JSON格式返回，不要有任何其他文字：\n[{"source_term":"原文术语","translated_term":"译文术语","definition":"简短说明"}]`

    const res = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }]
    })

    const content = res.choices[0].message.content || '[]'
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return NextResponse.json({ terms: [] })
    const terms = JSON.parse(jsonMatch[0])
    return NextResponse.json({ terms })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
