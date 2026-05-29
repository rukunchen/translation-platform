import { NextRequest, NextResponse } from 'next/server'
import { generateWith } from '@/lib/aiProviders'
import { DEFAULT_MODEL_BY_PROVIDER } from '@/lib/modelPresets'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

export const maxDuration = 120

const ADMIN_EMAIL = 'rukunchen@hotmail.com'

const DIMENSIONS = [
  { name: '信息完整度', max_score: 25 },
  { name: '准确性', max_score: 25 },
  { name: '表达与流利度', max_score: 20 },
  { name: '术语与专名处理', max_score: 15 },
  { name: '逻辑与口译策略', max_score: 15 },
] as const

type ScoreRequest = {
  attemptId?: string
}

type AttemptRow = {
  id: string
  exam_id: string
  user_id: string
  status: string
}

type ExamRow = {
  id: string
  title: string
  exam_type: string
  direction: string
  scoring_note: string | null
}

type SegmentRow = {
  id: string
  exam_id: string
  segment_order: number
  source_text: string
  reference_translation: string | null
}

type AttemptSegmentRow = {
  id: string
  segment_id: string | null
  transcript: string | null
  user_audio_url: string | null
}

type ScoringSegment = {
  id: string
  attemptSegmentId: string
  segment_order: number
  sourceText: string
  referenceTranslation: string
  transcript: string
}

type DimensionScore = {
  name: string
  score: number
  max_score: number
  comment: string
}

type SegmentScore = {
  segment_order: number
  total_score: number
  max_score: number
  problem_type: string
  comment: string
  suggestion: string
}

type ScoreResult = {
  total_score: number
  dimension_scores: DimensionScore[]
  overall_comment: string
  segment_scores: SegmentScore[]
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
    .select('id, exam_id, user_id, status')
    .eq('id', attemptId)
    .maybeSingle()
  if (attemptError) return NextResponse.json({ error: attemptError.message }, { status: 500 })
  if (!attempt) return NextResponse.json({ error: '考试记录不存在。' }, { status: 404 })

  const attemptRow = attempt as AttemptRow
  const isAdmin = (user.email || '').toLowerCase() === ADMIN_EMAIL
  if (!isAdmin && attemptRow.user_id !== user.id) {
    return NextResponse.json({ error: '你没有权限为这份二口考试评分。' }, { status: 403 })
  }
  if (attemptRow.status !== 'submitted' && attemptRow.status !== 'scored') {
    return NextResponse.json({ error: '只有已提交的二口考试可以评分。' }, { status: 400 })
  }

  const { data: exam, error: examError } = await admin
    .from('catti_mock_exams')
    .select('id, title, exam_type, direction, scoring_note')
    .eq('id', attemptRow.exam_id)
    .maybeSingle()
  if (examError) return NextResponse.json({ error: examError.message }, { status: 500 })
  if (!exam) return NextResponse.json({ error: '模考不存在。' }, { status: 404 })

  const examRow = exam as ExamRow
  if (examRow.exam_type !== 'erkou_practice') {
    return NextResponse.json({ error: '该考试不是 CATTI 二口实务。' }, { status: 400 })
  }

  const { data: segments, error: segmentError } = await admin
    .from('catti_mock_segments')
    .select('id, exam_id, segment_order, source_text, reference_translation')
    .eq('exam_id', attemptRow.exam_id)
    .order('segment_order', { ascending: true })
  if (segmentError) return NextResponse.json({ error: '读取段落失败：' + segmentError.message }, { status: 500 })

  const { data: attemptSegments, error: attemptSegmentError } = await admin
    .from('catti_mock_attempt_segments')
    .select('id, segment_id, transcript, user_audio_url')
    .eq('attempt_id', attemptId)
  if (attemptSegmentError) return NextResponse.json({ error: '读取转写文本失败：' + attemptSegmentError.message }, { status: 500 })

  const scoringSegments = buildScoringSegments(
    (segments ?? []) as SegmentRow[],
    (attemptSegments ?? []) as AttemptSegmentRow[]
  )
  if (scoringSegments.length === 0) {
    return NextResponse.json({ error: '没有可评分的转写文本，请先生成转写。' }, { status: 400 })
  }

  const result = await generateWith('deepseek', {
    model: DEFAULT_MODEL_BY_PROVIDER.deepseek,
    temperature: 0.15,
    maxTokens: 7000,
    timeoutMs: 110000,
    prompt: buildScoringPrompt({
      title: examRow.title,
      direction: examRow.direction,
      scoringNote: examRow.scoring_note || '',
      segments: scoringSegments,
    }),
  })
  if (result.error) return NextResponse.json({ error: 'AI 评分失败：' + result.error }, { status: 502 })

  const score = parseScoreResult(result.text, scoringSegments)
  if (!score) return NextResponse.json({ error: 'AI 返回的评分结果不是有效 JSON，请重试。' }, { status: 502 })

  const scoreByOrder = new Map(score.segment_scores.map(item => [item.segment_order, item]))
  const updateResults = []
  for (const segment of scoringSegments) {
    const segmentScore = scoreByOrder.get(segment.segment_order)
    const { data: updated, error: updateSegmentError } = await admin
      .from('catti_mock_attempt_segments')
      .update({
        score_json: segmentScore ? {
          total_score: segmentScore.total_score,
          max_score: segmentScore.max_score,
          problem_type: segmentScore.problem_type,
          comment: segmentScore.comment,
          suggestion: segmentScore.suggestion,
        } : null,
      })
      .eq('id', segment.attemptSegmentId)
      .select('id, segment_id, score_json, updated_at')
      .single()
    if (updateSegmentError) return NextResponse.json({ error: '写入分段评分失败：' + updateSegmentError.message }, { status: 500 })
    updateResults.push(updated)
  }

  const { data: updatedAttempt, error: updateAttemptError } = await admin
    .from('catti_mock_attempts')
    .update({
      total_score: score.total_score,
      score_json: {
        dimension_scores: score.dimension_scores,
        segment_scores: score.segment_scores,
      },
      overall_comment: score.overall_comment,
      status: 'scored',
    })
    .eq('id', attemptId)
    .select('id, status, total_score, score_json, overall_comment, updated_at')
    .single()
  if (updateAttemptError) return NextResponse.json({ error: '写入总体评分失败：' + updateAttemptError.message }, { status: 500 })

  return NextResponse.json({
    attempt: updatedAttempt,
    segment_scores: updateResults,
  })
}

function buildScoringSegments(segments: SegmentRow[], attemptSegments: AttemptSegmentRow[]): ScoringSegment[] {
  const attemptBySegmentId = new Map(attemptSegments.map(row => [row.segment_id, row]))
  return segments.map(segment => {
    const attemptSegment = attemptBySegmentId.get(segment.id)
    return {
      id: segment.id,
      attemptSegmentId: attemptSegment?.id || '',
      segment_order: segment.segment_order,
      sourceText: segment.source_text,
      referenceTranslation: segment.reference_translation || '',
      transcript: attemptSegment?.transcript || '',
    }
  }).filter(segment => segment.attemptSegmentId && segment.transcript.trim())
}

function buildScoringPrompt(opts: {
  title: string
  direction: string
  scoringNote: string
  segments: ScoringSegment[]
}) {
  const segmentPayload = opts.segments.map(segment => ({
    segment_order: segment.segment_order,
    source_text: segment.sourceText,
    transcript: segment.transcript,
    reference_translation: segment.referenceTranslation || undefined,
  }))

  return `你是一名严格、细致的 CATTI 二级口译实务模拟考官。请基于原文、考生口译录音转写文本、参考译文和考试说明进行模拟评分。

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
  "overall_comment": "",
  "segment_scores": [
    {
      "segment_order": 1,
      "total_score": 0,
      "max_score": 100,
      "problem_type": "",
      "comment": "",
      "suggestion": ""
    }
  ]
}

总体评分维度固定为：
1. 信息完整度，25 分
2. 准确性，25 分
3. 表达与流利度，20 分
4. 术语与专名处理，15 分
5. 逻辑与口译策略，15 分

评分要求：
1. 评分应接近 CATTI 二级口译实务要求，总分 100，60 分可视为模拟通过线；
2. 本平台使用 ASR 转写文本作为评分依据，转写可能有少量识别误差，但明显错译、漏译、逻辑错误仍需严格扣分；
3. 不要过度宽松，不要只看语言流畅度；
4. 重点检查信息完整度、数字和专名、术语、逻辑关系、口译表达自然度、目标语可理解性；
5. 如果没有参考译文，也必须基于原文与考生转写文本评分；
6. segment_scores 必须覆盖每个 segment_order，单段 max_score 固定为 100；
7. 输出中文反馈；
8. 不要生成虚假的官方成绩，overall_comment 必须说明这是平台模拟评分，不代表官方 CATTI 分数；
9. dimension_scores 必须完整包含上述 5 个维度，name 和 max_score 必须一致；
10. score 使用数字，不要带单位或百分号。

考试标题：
${opts.title}

语言方向：
${opts.direction}

考试说明：
${opts.scoringNote || '无'}

分段数据 JSON：
${JSON.stringify(segmentPayload, null, 2)}`
}

function parseScoreResult(text: string, segments: ScoringSegment[]): ScoreResult | null {
  const raw = extractJson(text)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const dimensionScores = normalizeDimensionScores(parsed.dimension_scores)
    const segmentScores = normalizeSegmentScores(parsed.segment_scores, segments)
    const dimensionScoreTotal = dimensionScores.reduce((sum, item) => sum + item.score, 0)
    const totalScore = scoreValue(parsed.total_score, 100) ?? dimensionScoreTotal
    const overallComment = stringValue(parsed.overall_comment)
    if (!overallComment || dimensionScores.length !== DIMENSIONS.length || segmentScores.length === 0) return null
    return {
      total_score: Math.max(0, Math.min(100, Math.round(totalScore))),
      dimension_scores: dimensionScores,
      overall_comment: overallComment,
      segment_scores: segmentScores,
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

function normalizeSegmentScores(value: unknown, segments: ScoringSegment[]): SegmentScore[] {
  const rows = Array.isArray(value) ? value as unknown[] : []
  return segments.map((segment, index) => {
    const row = rows.find(item => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      return scoreValue(record.segment_order, 1000) === segment.segment_order
    }) ?? rows[index]
    const record = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    return {
      segment_order: segment.segment_order,
      total_score: scoreValue(record.total_score, 100) ?? 0,
      max_score: scoreValue(record.max_score, 100) ?? 100,
      problem_type: stringValue(record.problem_type) || '综合问题',
      comment: stringValue(record.comment) || '本段未返回具体评语。',
      suggestion: stringValue(record.suggestion) || '暂无修改建议。',
    }
  })
}

function scoreValue(value: unknown, maxScore: number): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : Number.NaN
  if (!Number.isFinite(number)) return null
  return Math.max(0, Math.min(maxScore, Math.round(number)))
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
