// POST /api/glossary
// 调用 AI 提取术语对照表，须为该项目成员才能使用

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole } from '@/lib/permissions'

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com'
})

export async function POST(req: NextRequest) {
  try {
    const { client, user } = await supabaseFromRequest(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { sourceText, translatedText, sourceLang, targetLang, projectId } = await req.json()
    if (!sourceText || !translatedText) {
      return NextResponse.json({ error: '缺少原文或译文' }, { status: 400 })
    }

    if (projectId) {
      const myRole = await getMyRole(client, projectId, user.id)
      if (!myRole) return NextResponse.json({ error: '你不是该项目的成员' }, { status: 403 })
    }

    const prompt = `从以下原文和译文中提取重要的专业术语对照表。\n\n原文（${sourceLang}）：\n${sourceText.slice(0, 1000)}\n\n译文（${targetLang}）：\n${translatedText.slice(0, 1000)}\n\n请提取5-8个最重要的专业术语，严格按照以下JSON格式返回，不要有任何其他文字：\n[{"source_term":"原文术语","translated_term":"译文术语","definition":"简短说明"}]`

    const res = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }]
    })

    const content = res.choices[0].message.content || '[]'
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return NextResponse.json({ terms: [] })
    const raw = JSON.parse(jsonMatch[0]) as Array<{ source_term?: string; translated_term?: string; definition?: string }>
    // 给新字段默认值，向旧调用方兼容
    const terms = raw
      .filter(t => t.source_term && t.translated_term)
      .map(t => ({
        source_term: String(t.source_term).trim(),
        translated_term: String(t.translated_term).trim(),
        definition: String(t.definition ?? '').trim(),
        note: String(t.definition ?? '').trim(),
        category: '',
        status: 'active',
        is_questionable: false,
        match_status: 'unknown',
      }))
    return NextResponse.json({ terms })
  } catch (error: any) {
    console.error('Glossary error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
