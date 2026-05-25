import { NextRequest, NextResponse } from 'next/server'
import { generateWith } from '@/lib/aiProviders'
import { DEFAULT_MODEL_BY_PROVIDER } from '@/lib/modelPresets'
import { supabaseFromRequest } from '@/lib/supabaseServer'

export const maxDuration = 60

type ExplainRequest = {
  articleId?: string
  noteId?: string
  selectedText?: string
  paragraphContext?: string
}

type ReadingArticle = {
  id: string
  user_id: string
  title: string | null
  clean_text: string | null
}

type ReadingNote = {
  id: string
  article_id: string
  user_id: string
  selected_text: string | null
  paragraph_context: string | null
  ai_explanation: string | null
  user_note: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
}

export async function POST(request: NextRequest) {
  const { client, user } = await supabaseFromRequest(request)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as ExplainRequest
  const articleId = body.articleId?.trim()
  const noteId = body.noteId?.trim()
  const selectedText = body.selectedText?.trim() || ''
  const paragraphContext = body.paragraphContext?.trim() || selectedText

  if (!articleId) return NextResponse.json({ error: '缺少文章 ID。' }, { status: 400 })
  if (!noteId && !selectedText) return NextResponse.json({ error: '缺少选中文本。' }, { status: 400 })

  const { data: article, error: articleError } = await client
    .from('reading_articles')
    .select('id,user_id,title,clean_text')
    .eq('id', articleId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (articleError) return NextResponse.json({ error: articleError.message }, { status: 500 })
  if (!article) return NextResponse.json({ error: '文章不存在或无权访问。' }, { status: 404 })

  const noteResult = await findOrCreateNote({
    articleId,
    noteId,
    selectedText,
    paragraphContext,
    userId: user.id,
    client,
  })
  if ('error' in noteResult) return NextResponse.json({ error: noteResult.error }, { status: noteResult.status })

  const note = noteResult.note
  const context = buildContextWindow({
    cleanText: (article as ReadingArticle).clean_text || '',
    selectedText: note.selected_text || selectedText,
    paragraphContext: note.paragraph_context || paragraphContext,
  })

  const result = await generateWith('deepseek', {
    model: DEFAULT_MODEL_BY_PROVIDER.deepseek,
    temperature: 0.2,
    prompt: buildContextualTranslationPrompt({
      title: (article as ReadingArticle).title || '未命名文章',
      selectedText: note.selected_text || selectedText,
      paragraphContext: note.paragraph_context || paragraphContext,
      previousParagraph: context.previousParagraph,
      nextParagraph: context.nextParagraph,
      articleTheme: context.articleTheme,
    }),
  })

  if (result.error) return NextResponse.json({ error: result.error, note }, { status: 502 })

  const aiExplanation = result.text.trim()
  if (!aiExplanation) return NextResponse.json({ error: 'AI 翻译为空，请重试。', note }, { status: 502 })

  const { data: updatedNote, error: updateError } = await client
    .from('reading_notes')
    .update({ ai_explanation: aiExplanation })
    .eq('id', note.id)
    .eq('user_id', user.id)
    .select('id,article_id,user_id,selected_text,paragraph_context,ai_explanation,user_note,tags,created_at,updated_at')
    .single()

  if (updateError || !updatedNote) {
    return NextResponse.json({ error: updateError?.message || '保存 AI 解释失败。', note }, { status: 500 })
  }

  return NextResponse.json({ note: updatedNote })
}

async function findOrCreateNote({
  articleId,
  noteId,
  selectedText,
  paragraphContext,
  userId,
  client,
}: {
  articleId: string
  noteId?: string
  selectedText: string
  paragraphContext: string
  userId: string
  client: Awaited<ReturnType<typeof supabaseFromRequest>>['client']
}): Promise<{ note: ReadingNote } | { error: string; status: number }> {
  if (noteId) {
    const { data, error } = await client
      .from('reading_notes')
      .select('id,article_id,user_id,selected_text,paragraph_context,ai_explanation,user_note,tags,created_at,updated_at')
      .eq('id', noteId)
      .eq('article_id', articleId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) return { error: error.message, status: 500 }
    if (!data) return { error: '笔记不存在或无权访问。', status: 404 }
    return { note: data as ReadingNote }
  }

  const { data: existing, error: lookupError } = await client
    .from('reading_notes')
    .select('id,article_id,user_id,selected_text,paragraph_context,ai_explanation,user_note,tags,created_at,updated_at')
    .eq('article_id', articleId)
    .eq('user_id', userId)
    .eq('selected_text', selectedText)
    .eq('paragraph_context', paragraphContext)
    .maybeSingle()

  if (lookupError) return { error: lookupError.message, status: 500 }
  if (existing) return { note: existing as ReadingNote }

  const { data: created, error: insertError } = await client
    .from('reading_notes')
    .insert({
      article_id: articleId,
      user_id: userId,
      selected_text: selectedText,
      paragraph_context: paragraphContext,
      ai_explanation: '',
      user_note: '',
      tags: [],
    })
    .select('id,article_id,user_id,selected_text,paragraph_context,ai_explanation,user_note,tags,created_at,updated_at')
    .single()

  if (insertError || !created) return { error: insertError?.message || '创建笔记失败。', status: 500 }
  return { note: created as ReadingNote }
}

function buildContextWindow({
  cleanText,
  selectedText,
  paragraphContext,
}: {
  cleanText: string
  selectedText: string
  paragraphContext: string
}) {
  const paragraphs = cleanText
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)

  const currentIndex = Math.max(0, paragraphs.findIndex(paragraph =>
    paragraph === paragraphContext || paragraph.includes(selectedText)
  ))

  const articleTheme = clipText(paragraphs.slice(0, 2).join('\n\n') || cleanText, 1200)
  return {
    articleTheme,
    previousParagraph: currentIndex > 0 ? clipText(paragraphs[currentIndex - 1], 1200) : '',
    nextParagraph: currentIndex >= 0 && currentIndex < paragraphs.length - 1 ? clipText(paragraphs[currentIndex + 1], 1200) : '',
  }
}

function clipText(text: string, limit: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit)}...`
}

function buildContextualTranslationPrompt({
  title,
  selectedText,
  paragraphContext,
  previousParagraph,
  nextParagraph,
  articleTheme,
}: {
  title: string
  selectedText: string
  paragraphContext: string
  previousParagraph: string
  nextParagraph: string
  articleTheme: string
}): string {
  return `你是一名 MTI 翻译训练导师。请根据文章上下文，把用户选中的英文词、短语、句子或段落译成自然中文。

输出要求：
1. 只做语境翻译，不要长篇解释，不要写背景分析；
2. 必须依据上下文选择译法，不要只给词典释义；
3. 如果是词或短语，给 2-3 个可用译法，用顿号或分号分隔；
4. 如果是句子或段落，给一版自然、准确、适合上下文的中文译文；
5. 总字数尽量控制在 120 个中文字符以内，除非原文较长；
6. 只输出译文正文，不要输出 Markdown、编号、标题或“语境译文：”前缀。

文章标题：
${title}

文章主题线索：
${articleTheme || '无'}

前一段：
${previousParagraph || '无'}

当前段落：
${paragraphContext || selectedText}

后一段：
${nextParagraph || '无'}

用户选中文本：
${selectedText}`
}
