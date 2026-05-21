import { NextResponse } from 'next/server'

type AnalyzeRequest = {
  sourceText?: string
  userTranslation?: string
  practiceType?: string
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as AnalyzeRequest
  const sourceText = body.sourceText?.trim()
  const userTranslation = body.userTranslation?.trim()
  const practiceType = body.practiceType?.trim() || '翻译练习'

  if (!sourceText || !userTranslation) {
    return NextResponse.json({ error: '缺少原文或我的译文。' }, { status: 400 })
  }

  return NextResponse.json({
    summary: `这是 ${practiceType} 的 mock 分析：译文已覆盖原文主干，下一步重点检查信息完整度和目标语自然度。`,
    issues: [
      '请核对限定信息、逻辑连接和语气是否全部落到译文中。',
      '请检查是否存在逐词对应但目标语读起来偏硬的句段。',
    ],
    suggestions: [
      '先标出原文主谓结构和修饰层次，再回看译文重心。',
      '把长句拆成信息块，对照参考表达逐块润色。',
    ],
    improvedTranslation: `【Mock 改写参考】${userTranslation}`,
  })
}
