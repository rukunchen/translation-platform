import { NextRequest, NextResponse } from 'next/server'
import { generateWith } from '@/lib/aiProviders'
import { DEFAULT_MODEL_BY_PROVIDER } from '@/lib/modelPresets'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

export const maxDuration = 90

const ADMIN_EMAIL = 'rukunchen@hotmail.com'

const DIMENSIONS = [
  { name: '信息完整度', max_score: 25 },
  { name: '准确性', max_score: 25 },
  { name: '表达质量', max_score: 20 },
  { name: '术语与专名处理', max_score: 15 },
  { name: '文体与逻辑', max_score: 15 },
] as const

type ScoreRequest = {
  attemptId?: string
}

type AttemptRow = {
  id: string
  exam_id: string
  user_id: string
  status: string
  answer_text: string | null
}

type ExamRow = {
  id: string
  title: string
  exam_type: string
  direction: string
  source_text: string
  reference_translation: string | null
  scoring_note: string | null
}

type PassageRow = {
  id: string
  exam_id: string
  passage_order: number
  direction: string
  title: string | null
  source_text: string
  reference_translation: string | null
  scoring_note: string | null
  max_score: number | null
}

type AttemptAnswerRow = {
  id: string
  attempt_id: string
  passage_id: string
  answer_text: string | null
}

type ScoringPassage = {
  id: string | null
  passage_order: number
  direction: string
  title: string
  sourceText: string
  answerText: string
  referenceTranslation: string
  scoringNote: string
  maxScore: number
}

type DimensionScore = {
  name: string
  score: number
  max_score: number
  comment: string
}

type PassageScore = {
  passage_order: number
  total_score: number
  max_score: number
  overall_comment: string
}

type SentenceAnalysis = {
  passage_order: number
  sentence_order: number
  source_sentence: string
  user_translation: string
  problem_type: string
  problem_detail: string
  suggestion: string
  reference_version: string
}

type ScoreResult = {
  total_score: number
  dimension_scores: DimensionScore[]
  passage_scores: PassageScore[]
  overall_comment: string
  sentence_analysis: SentenceAnalysis[]
}

export async function POST(request: NextRequest) {
  const { user } = await supabaseFromRequest(request)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as ScoreRequest
  const attemptId = body.attemptId?.trim()
  if (!attemptId) return NextResponse.json({ error: '缺少 attemptId。' }, { status: 400 })

  const admin = supabaseAdmin()
  const { data: attempt, error: attemptError } = await admin
    .from('catti_mock_attempts')
    .select('id, exam_id, user_id, status, answer_text')
    .eq('id', attemptId)
    .maybeSingle()

  if (attemptError) return NextResponse.json({ error: attemptError.message }, { status: 500 })
  if (!attempt) return NextResponse.json({ error: '考试记录不存在。' }, { status: 404 })

  const attemptRow = attempt as AttemptRow
  const isAdmin = (user.email || '').toLowerCase() === ADMIN_EMAIL
  if (!isAdmin && attemptRow.user_id !== user.id) {
    return NextResponse.json({ error: '你没有权限为这份考试记录评分。' }, { status: 403 })
  }
  if (attemptRow.status !== 'submitted' && attemptRow.status !== 'scored') {
    return NextResponse.json({ error: '只有已提交的考试可以生成评分报告。' }, { status: 400 })
  }

  const { data: exam, error: examError } = await admin
    .from('catti_mock_exams')
    .select('id, title, exam_type, direction, source_text, reference_translation, scoring_note')
    .eq('id', attemptRow.exam_id)
    .eq('exam_type', 'erbi_practice')
    .maybeSingle()

  if (examError) return NextResponse.json({ error: examError.message }, { status: 500 })
  if (!exam) return NextResponse.json({ error: '模考题不存在。' }, { status: 404 })

  const examRow = exam as ExamRow
  const { data: passages, error: passageError } = await admin
    .from('catti_mock_passages')
    .select('id, exam_id, passage_order, direction, title, source_text, reference_translation, scoring_note, max_score')
    .eq('exam_id', attemptRow.exam_id)
    .order('passage_order', { ascending: true })

  if (passageError) return NextResponse.json({ error: '读取模考篇章失败：' + passageError.message }, { status: 500 })

  const { data: attemptAnswers, error: answerError } = await admin
    .from('catti_mock_attempt_answers')
    .select('id, attempt_id, passage_id, answer_text')
    .eq('attempt_id', attemptRow.id)

  if (answerError) return NextResponse.json({ error: '读取分篇译文失败：' + answerError.message }, { status: 500 })

  const scoringPassages = buildScoringPassages(
    examRow,
    (passages ?? []) as PassageRow[],
    (attemptAnswers ?? []) as AttemptAnswerRow[],
    attemptRow.answer_text || ''
  )

  if (!scoringPassages.some(passage => passage.answerText.trim())) {
    return NextResponse.json({ error: '用户译文为空，无法生成评分报告。' }, { status: 400 })
  }

  const result = await generateWith('deepseek', {
    model: DEFAULT_MODEL_BY_PROVIDER.deepseek,
    temperature: 0.15,
    maxTokens: 8000,
    timeoutMs: 85000,
    prompt: buildScoringPrompt({
      title: examRow.title,
      passages: scoringPassages,
    }),
  })

  if (result.error) return NextResponse.json({ error: 'AI 评分失败：' + result.error }, { status: 502 })

  const score = parseScoreResult(result.text, scoringPassages)
  if (!score) {
    return NextResponse.json({ error: 'AI 返回的评分结果不是有效 JSON，请重试。' }, { status: 502 })
  }

  const { error: deleteError } = await admin
    .from('catti_mock_sentence_analysis')
    .delete()
    .eq('attempt_id', attemptRow.id)
  if (deleteError) return NextResponse.json({ error: '清理旧逐句分析失败：' + deleteError.message }, { status: 500 })

  const passageIdByOrder = new Map(scoringPassages.map(passage => [passage.passage_order, passage.id]))
  const analysisRows = score.sentence_analysis.slice(0, 120).map(item => ({
    attempt_id: attemptRow.id,
    passage_id: passageIdByOrder.get(item.passage_order) || null,
    sentence_order: item.sentence_order,
    source_sentence: item.source_sentence,
    user_translation: item.user_translation,
    problem_type: item.problem_type,
    problem_detail: item.problem_detail,
    suggestion: item.suggestion,
    reference_version: item.reference_version,
  }))

  if (analysisRows.length > 0) {
    const { error: insertAnalysisError } = await admin
      .from('catti_mock_sentence_analysis')
      .insert(analysisRows)
    if (insertAnalysisError) return NextResponse.json({ error: '写入逐句分析失败：' + insertAnalysisError.message }, { status: 500 })
  }

  const passageScoreByOrder = new Map(score.passage_scores.map(item => [item.passage_order, item]))
  const answerScoreRows = scoringPassages
    .filter((passage): passage is ScoringPassage & { id: string } => Boolean(passage.id))
    .map(passage => {
      const passageScore = passageScoreByOrder.get(passage.passage_order)
      return {
        attempt_id: attemptRow.id,
        passage_id: passage.id,
        answer_text: passage.answerText,
        total_score: passageScore?.total_score ?? null,
        score_json: passageScore ? { max_score: passageScore.max_score } : null,
        overall_comment: passageScore?.overall_comment || null,
      }
    })

  if (answerScoreRows.length > 0) {
    const { error: upsertAnswerError } = await admin
      .from('catti_mock_attempt_answers')
      .upsert(answerScoreRows, { onConflict: 'attempt_id,passage_id' })
    if (upsertAnswerError) return NextResponse.json({ error: '写入分篇评分失败：' + upsertAnswerError.message }, { status: 500 })
  }

  const { data: updatedAttempt, error: updateError } = await admin
    .from('catti_mock_attempts')
    .update({
      total_score: score.total_score,
      score_json: {
        dimension_scores: score.dimension_scores,
        passage_scores: score.passage_scores,
      },
      overall_comment: score.overall_comment,
      status: 'scored',
    })
    .eq('id', attemptRow.id)
    .select('id, status, total_score, score_json, overall_comment, updated_at')
    .single()

  if (updateError) return NextResponse.json({ error: '写入评分结果失败：' + updateError.message }, { status: 500 })

  return NextResponse.json({
    attempt: updatedAttempt,
    sentence_analysis_count: analysisRows.length,
    passage_answer_count: answerScoreRows.length,
  })
}

function buildScoringPassages(
  exam: ExamRow,
  passages: PassageRow[],
  answers: AttemptAnswerRow[],
  legacyAnswerText: string
): ScoringPassage[] {
  const answerByPassage = new Map(answers.map(answer => [answer.passage_id, answer.answer_text || '']))
  if (passages.length === 0) {
    return [{
      id: null,
      passage_order: 1,
      direction: exam.direction,
      title: '原文',
      sourceText: exam.source_text,
      answerText: legacyAnswerText,
      referenceTranslation: exam.reference_translation || '',
      scoringNote: exam.scoring_note || '',
      maxScore: 100,
    }]
  }

  return passages.map((passage, index) => ({
    id: passage.id,
    passage_order: passage.passage_order,
    direction: passage.direction,
    title: passage.title || passageTitle(passage.passage_order, passage.direction),
    sourceText: passage.source_text,
    answerText: answerByPassage.get(passage.id) ?? (index === 0 ? legacyAnswerText : ''),
    referenceTranslation: passage.reference_translation || '',
    scoringNote: passage.scoring_note || '',
    maxScore: Number(passage.max_score) || 25,
  }))
}

function buildScoringPrompt(opts: {
  title: string
  passages: ScoringPassage[]
}) {
  const passagePayload = opts.passages.map(passage => ({
    passage_order: passage.passage_order,
    title: passage.title,
    direction: passage.direction,
    max_score: passage.maxScore,
    scoring_note: passage.scoringNote || undefined,
    source_text: passage.sourceText,
    user_translation: passage.answerText,
    reference_translation: passage.referenceTranslation || undefined,
  }))

  return `你是一名严格、细致的 CATTI 二级笔译实务模拟阅卷老师。请基于四篇原文、考生译文、参考译文和评分说明进行模拟评分。

只输出一个 JSON 对象，不要输出 Markdown、代码围栏或额外解释。JSON 必须严格使用以下结构：
{
  "total_score": 0,
  "dimension_scores": [
    {
      "name": "信息完整度",
      "score": 0,
      "max_score": 25,
      "comment": ""
    }
  ],
  "passage_scores": [
    {
      "passage_order": 1,
      "total_score": 0,
      "max_score": 25,
      "overall_comment": ""
    }
  ],
  "overall_comment": "",
  "sentence_analysis": [
    {
      "passage_order": 1,
      "sentence_order": 1,
      "source_sentence": "",
      "user_translation": "",
      "problem_type": "",
      "problem_detail": "",
      "suggestion": "",
      "reference_version": ""
    }
  ]
}

总体评分维度固定为：
1. 信息完整度，25 分
2. 准确性，25 分
3. 表达质量，20 分
4. 术语与专名处理，15 分
5. 文体与逻辑，15 分

评分要求：
1. 评分应接近 CATTI 二级笔译实务要求，总分 100，60 分可视为模拟通过线；
2. 二笔实务通常包含英译中和中译英篇章，本次输入已按 passage_order 区分；请分别检查每篇，再给总体评分；
3. 不要过度宽松，不要只看语言是否流畅；
4. 重点检查错译、漏译、增译、逻辑关系、术语和专名、文体、语法、搭配和标点；
5. 如果某篇没有参考译文，也必须基于原文与考生译文评分；
6. passage_scores 必须覆盖每个 passage_order，total_score 不得超过该篇 max_score；
7. sentence_analysis 必须写明 passage_order，逐句分析要具体，不要泛泛而谈；
8. 如果某句没有明显问题，可以不列；但关键扣分点必须覆盖；
9. 输出中文反馈；
10. 不要生成虚假的官方成绩，overall_comment 必须说明这是平台模拟评分，不代表官方 CATTI 分数；
11. dimension_scores 必须完整包含上述 5 个维度，name 和 max_score 必须一致；
12. score 使用数字，不要带单位或百分号。

考试标题：
${opts.title}

篇章数据 JSON：
${JSON.stringify(passagePayload, null, 2)}`
}

function parseScoreResult(text: string, passages: ScoringPassage[]): ScoreResult | null {
  const raw = extractJson(text)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const dimensionScores = normalizeDimensionScores(parsed.dimension_scores)
    const passageScores = normalizePassageScores(parsed.passage_scores, passages)
    const passageScoreTotal = passageScores.reduce((sum, item) => sum + item.total_score, 0)
    const dimensionScoreTotal = dimensionScores.reduce((sum, item) => sum + item.score, 0)
    const totalScore = scoreValue(parsed.total_score, 100) ?? (passageScoreTotal > 0 ? passageScoreTotal : dimensionScoreTotal)
    const overallComment = stringValue(parsed.overall_comment)
    const sentenceAnalysis = normalizeSentenceAnalysis(parsed.sentence_analysis, passages)
    if (!overallComment || dimensionScores.length !== DIMENSIONS.length) return null
    return {
      total_score: Math.max(0, Math.min(100, Math.round(totalScore))),
      dimension_scores: dimensionScores,
      passage_scores: passageScores,
      overall_comment: overallComment,
      sentence_analysis: sentenceAnalysis,
    }
  } catch {
    return null
  }
}

function extractJson(text: string) {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return ''
  return cleaned.slice(start, end + 1)
}

function normalizeDimensionScores(value: unknown): DimensionScore[] {
  const rows = Array.isArray(value) ? value as unknown[] : []
  return DIMENSIONS.map((dimension, index) => {
    const matchingRow = rows.find(item => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      return stringValue(record.name) === dimension.name
    }) ?? rows[index]
    const record = matchingRow && typeof matchingRow === 'object' ? matchingRow as Record<string, unknown> : {}
    return {
      name: dimension.name,
      score: scoreValue(record.score, dimension.max_score) ?? 0,
      max_score: dimension.max_score,
      comment: stringValue(record.comment) || '该维度未返回具体评语。',
    }
  })
}

function normalizePassageScores(value: unknown, passages: ScoringPassage[]): PassageScore[] {
  const rows = Array.isArray(value) ? value as unknown[] : []
  return passages.map((passage, index) => {
    const row = rows.find(item => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      return scoreValue(record.passage_order, 100) === passage.passage_order
    }) ?? rows[index]
    const record = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    return {
      passage_order: passage.passage_order,
      total_score: scoreValue(record.total_score, passage.maxScore) ?? 0,
      max_score: passage.maxScore,
      overall_comment: stringValue(record.overall_comment) || '本篇未返回具体评语。',
    }
  })
}

function normalizeSentenceAnalysis(value: unknown, passages: ScoringPassage[]): SentenceAnalysis[] {
  if (!Array.isArray(value)) return []
  const validOrders = new Set(passages.map(passage => passage.passage_order))
  return value.map((item, index) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const passageOrder = scoreValue(record.passage_order, 100) ?? passages[0]?.passage_order ?? 1
    return {
      passage_order: validOrders.has(passageOrder) ? passageOrder : passages[0]?.passage_order ?? 1,
      sentence_order: scoreValue(record.sentence_order, 1000) ?? index + 1,
      source_sentence: stringValue(record.source_sentence),
      user_translation: stringValue(record.user_translation),
      problem_type: stringValue(record.problem_type) || '未分类',
      problem_detail: stringValue(record.problem_detail),
      suggestion: stringValue(record.suggestion),
      reference_version: stringValue(record.reference_version),
    }
  }).filter(item => item.source_sentence || item.user_translation || item.problem_detail || item.suggestion)
}

function scoreValue(value: unknown, maxScore: number): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : Number.NaN
  if (!Number.isFinite(number)) return null
  return Math.max(0, Math.min(maxScore, Math.round(number)))
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function passageTitle(order: number, direction: string) {
  if (order === 1) return '英译中一'
  if (order === 2) return '英译中二'
  if (order === 3) return '中译英一'
  if (order === 4) return '中译英二'
  return direction === 'C-E' ? '中译英' : '英译中'
}
