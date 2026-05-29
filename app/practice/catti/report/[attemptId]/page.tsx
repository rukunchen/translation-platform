'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { apiJSON } from '@/lib/apiFetch'
import { supabase } from '@/lib/supabase'
import { countPracticeWords } from '@/lib/translationPractice'

const ADMIN_EMAIL = 'rukunchen@hotmail.com'

type CattiMockAttempt = {
  id: string
  exam_id: string
  user_id: string
  status: 'in_progress' | 'submitted' | 'scored' | string
  started_at: string
  submitted_at: string | null
  answer_text: string | null
  total_score: number | null
  score_json: Record<string, unknown> | null
  overall_comment: string | null
  created_at: string
  updated_at: string
}

type CattiMockExam = {
  id: string
  title: string
  exam_type: string
  direction: string
  difficulty: string | null
  duration_minutes: number | null
  source_text: string
  reference_translation: string | null
  status: string
}

type CattiMockPassage = {
  id: string
  exam_id: string
  passage_order: number
  direction: string
  title: string | null
  source_text: string
  reference_translation: string | null
  max_score: number | null
}

type CattiMockAttemptAnswer = {
  id: string
  attempt_id: string
  passage_id: string
  answer_text: string | null
  total_score: number | null
  score_json: Record<string, unknown> | null
  overall_comment: string | null
}

type ReportPassage = CattiMockPassage & {
  answer_text: string
  answer_total_score: number | null
  answer_score_json: Record<string, unknown> | null
  answer_overall_comment: string | null
}

type CattiMockSegment = {
  id: string
  exam_id: string
  segment_order: number
  passage_order: number | null
  passage_title: string | null
  direction: string | null
  segment_order_global: number | null
  segment_order_in_passage: number | null
  source_text: string
  reference_translation: string | null
  audio_url: string | null
  estimated_play_seconds: number | null
  recording_seconds: number | null
  transition_seconds: number | null
  pause_seconds: number | null
}

type CattiMockAttemptSegment = {
  id: string
  attempt_id: string
  segment_id: string | null
  user_audio_url: string | null
  transcript: string | null
  score_json: Record<string, unknown> | null
}

type ReportSegment = CattiMockSegment & {
  user_audio_url: string | null
  transcript: string | null
  segment_score_json: Record<string, unknown> | null
}

type SentenceAnalysis = {
  id: string
  passage_id: string | null
  sentence_order: number | null
  source_sentence: string | null
  user_translation: string | null
  problem_type: string | null
  problem_detail: string | null
  suggestion: string | null
  reference_version: string | null
}

type DimensionScore = {
  name: string
  score: number
  max_score: number
  comment: string
}

type SegmentScoreView = {
  total_score: number
  max_score: number
  problem_type: string
  comment: string
  suggestion: string
}

export default function CattiReportPage() {
  const router = useRouter()
  const params = useParams()
  const attemptId = String(params.attemptId || '')
  const [attempt, setAttempt] = useState<CattiMockAttempt | null>(null)
  const [exam, setExam] = useState<CattiMockExam | null>(null)
  const [reportPassages, setReportPassages] = useState<ReportPassage[]>([])
  const [reportSegments, setReportSegments] = useState<ReportSegment[]>([])
  const [sentenceAnalyses, setSentenceAnalyses] = useState<SentenceAnalysis[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [scoring, setScoring] = useState(false)
  const [scoreError, setScoreError] = useState('')
  const [transcribing, setTranscribing] = useState(false)
  const [transcriptError, setTranscriptError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')

    const { data: userData } = await supabase.auth.getUser()
    const user = userData.user
    if (!user) {
      router.push('/')
      return
    }

    const isAdmin = (user.email || '').toLowerCase() === ADMIN_EMAIL
    let attemptQuery = supabase
      .from('catti_mock_attempts')
      .select('id, exam_id, user_id, status, started_at, submitted_at, answer_text, total_score, score_json, overall_comment, created_at, updated_at')
      .eq('id', attemptId)

    if (!isAdmin) attemptQuery = attemptQuery.eq('user_id', user.id)

    const attemptRes = await attemptQuery.maybeSingle()
    if (attemptRes.error || !attemptRes.data) {
      setLoadError('报告不存在，或你没有权限查看。')
      setLoading(false)
      return
    }

    const attemptRow = attemptRes.data as CattiMockAttempt
    if (!isAdmin && attemptRow.user_id !== user.id) {
      setLoadError('你没有权限查看这份报告。')
      setLoading(false)
      return
    }
    setAttempt(attemptRow)

    let examQuery = supabase
      .from('catti_mock_exams')
      .select('id, title, exam_type, direction, difficulty, duration_minutes, source_text, reference_translation, status')
      .eq('id', attemptRow.exam_id)

    if (!isAdmin) examQuery = examQuery.eq('status', 'published')

    const examRes = await examQuery.maybeSingle()
    if (examRes.error || !examRes.data) {
      setLoadError('无法读取模考信息。')
      setLoading(false)
      return
    }

    const examRow = examRes.data as CattiMockExam
    setExam(examRow)

    if (examRow.exam_type === 'erkou_practice') {
      const segmentRes = await supabase
        .from('catti_mock_segments')
        .select('id, exam_id, segment_order, passage_order, passage_title, direction, segment_order_global, segment_order_in_passage, source_text, reference_translation, audio_url, estimated_play_seconds, recording_seconds, transition_seconds, pause_seconds')
        .eq('exam_id', attemptRow.exam_id)
        .order('segment_order', { ascending: true })

      if (segmentRes.error) {
        setLoadError('无法读取二口段落。')
        setLoading(false)
        return
      }

      const attemptSegmentRes = await supabase
        .from('catti_mock_attempt_segments')
        .select('id, attempt_id, segment_id, user_audio_url, transcript, score_json')
        .eq('attempt_id', attemptRow.id)

      if (attemptSegmentRes.error) {
        setLoadError('无法读取考生录音。')
        setLoading(false)
        return
      }

      setReportSegments(buildReportSegments(
        (segmentRes.data ?? []) as CattiMockSegment[],
        (attemptSegmentRes.data ?? []) as CattiMockAttemptSegment[]
      ))
      setReportPassages([])
      setSentenceAnalyses([])
      setLoading(false)
      return
    }

    const passageRes = await supabase
      .from('catti_mock_passages')
      .select('id, exam_id, passage_order, direction, title, source_text, reference_translation, max_score')
      .eq('exam_id', attemptRow.exam_id)
      .order('passage_order', { ascending: true })

    if (passageRes.error) {
      setLoadError('无法读取模考篇章。')
      setLoading(false)
      return
    }

    const answerRes = await supabase
      .from('catti_mock_attempt_answers')
      .select('id, attempt_id, passage_id, answer_text, total_score, score_json, overall_comment')
      .eq('attempt_id', attemptRow.id)

    if (answerRes.error) {
      setLoadError('无法读取分篇译文。')
      setLoading(false)
      return
    }

    setReportPassages(buildReportPassages(
      examRow,
      (passageRes.data ?? []) as CattiMockPassage[],
      (answerRes.data ?? []) as CattiMockAttemptAnswer[],
      attemptRow.answer_text || ''
    ))

    if (attemptRow.status === 'scored') {
      const analysisRes = await supabase
        .from('catti_mock_sentence_analysis')
        .select('id, passage_id, sentence_order, source_sentence, user_translation, problem_type, problem_detail, suggestion, reference_version')
        .eq('attempt_id', attemptRow.id)
        .order('sentence_order', { ascending: true })
      if (!analysisRes.error) setSentenceAnalyses((analysisRes.data ?? []) as SentenceAnalysis[])
    } else {
      setSentenceAnalyses([])
    }

    setLoading(false)
  }, [attemptId, router])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function generateScoreReport() {
    if (!attempt) return
    setScoring(true)
    setScoreError('')
    const { error } = await apiJSON('/api/catti/score-erbi', {
      method: 'POST',
      body: JSON.stringify({ attemptId: attempt.id }),
    })
    setScoring(false)
    if (error) {
      setScoreError(error)
      return
    }
    await load()
  }

  async function generateErkouTranscript() {
    if (!attempt) return
    setTranscribing(true)
    setTranscriptError('')
    const { error } = await apiJSON('/api/catti/erkou/transcribe', {
      method: 'POST',
      body: JSON.stringify({ attemptId: attempt.id }),
    })
    setTranscribing(false)
    if (error) {
      setTranscriptError(error)
      return
    }
    await load()
  }

  async function generateErkouScoreReport() {
    if (!attempt) return
    setScoring(true)
    setScoreError('')
    const { error } = await apiJSON('/api/catti/erkou/score', {
      method: 'POST',
      body: JSON.stringify({ attemptId: attempt.id }),
    })
    setScoring(false)
    if (error) {
      setScoreError(error)
      return
    }
    await load()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas p-6">
        <div className="mx-auto max-w-4xl rounded-2xl border border-line bg-white p-8 text-sm text-ink-500">加载报告中...</div>
      </div>
    )
  }

  if (loadError || !attempt || !exam) {
    return (
      <div className="min-h-screen bg-canvas p-6">
        <div className="mx-auto max-w-4xl rounded-2xl border border-line bg-white p-8">
          <p className="mb-5 text-sm text-red-600">{loadError || '无法查看报告。'}</p>
          <Button variant="secondary" onClick={() => router.push('/practice/catti')}>返回模考中心</Button>
        </div>
      </div>
    )
  }

  const submitted = attempt.status === 'submitted' || attempt.status === 'scored'
  const scored = attempt.status === 'scored'
  const isErkou = exam.exam_type === 'erkou_practice'
  const durationText = formatDuration(attempt.started_at, attempt.submitted_at)
  const dimensionScores = getDimensionScores(attempt.score_json)
  const answerWordCount = reportPassages.reduce((sum, passage) => sum + countPracticeWords(passage.answer_text), 0)
  const analysesByPassage = groupAnalysesByPassage(sentenceAnalyses, reportPassages)
  const hasErkouRecording = reportSegments.some(segment => segment.user_audio_url)
  const hasMissingTranscript = reportSegments.some(segment => segment.user_audio_url && !segment.transcript)
  const hasErkouTranscript = reportSegments.some(segment => segment.transcript?.trim())
  const recordedSegmentCount = reportSegments.filter(segment => segment.user_audio_url).length
  const transcriptSegmentCount = reportSegments.filter(segment => segment.transcript?.trim()).length
  const scoredSegmentCount = reportSegments.filter(segment => getSegmentScore(segment.segment_score_json)).length
  const erkouPassageGroups = groupReportSegmentsByPassage(reportSegments)

  return (
    <div className="min-h-screen bg-canvas p-5 text-ink-900">
      <main className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-line bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Eyebrow tone="muted" className="mb-2">CATTI Report</Eyebrow>
            <h1 className="font-serif text-2xl text-ink-900">{exam.title}</h1>
            <p className="mt-2 text-sm text-ink-600">{isErkou ? displayDirection(exam.direction) : displayExamDirections(reportPassages, exam.direction)} · {exam.difficulty || '二级'} · {exam.duration_minutes ?? (isErkou ? 60 : 180)} 分钟</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => router.push('/practice/catti')}>返回模考列表</Button>
            <Button variant="primary" onClick={() => router.push(`/practice/catti/exam/${attempt.exam_id}`)}>再练一次</Button>
          </div>
        </div>

        <Card padding="lg" className="mb-5">
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-line bg-canvas px-2 py-1 text-[11px] text-ink-600">{attemptLabel(attempt.status)}</span>
            <span className="rounded-full border border-line bg-canvas px-2 py-1 text-[11px] text-ink-600">{isErkou ? '二口录音流程' : `篇章 ${reportPassages.length || 1} 篇`}</span>
            {!isErkou && <span className="rounded-full border border-line bg-canvas px-2 py-1 text-[11px] text-ink-600">译文字数 {answerWordCount}</span>}
          </div>
          <h2 className="mb-3 font-serif text-2xl text-ink-900">{isErkou && submitted ? '二口考试已提交' : scored ? '评分报告' : submitted ? '考试已提交' : '考试尚未提交'}</h2>
          <p className="mb-8 text-sm leading-7 text-ink-600">
            {isErkou ? (scored ? '以下为基于录音转写文本生成的二口模拟评分结果。该结果不代表官方 CATTI 分数。' : '二口考试已提交。你可以先生成转写，再生成平台模拟评分报告。') : scored ? '以下为已保存的模拟评分结果。该结果不代表官方 CATTI 分数。' : submitted ? '考试已提交。你可以生成平台模拟评分报告，评分结果不代表官方 CATTI 分数。' : '当前 attempt 仍是进行中状态，请返回作答页面继续完成并提交。'}
          </p>
          {attempt.status === 'submitted' && !isErkou && (
            <div className="mb-8 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-canvas/40 px-5 py-4">
              <Button variant="primary" loading={scoring} onClick={() => { void generateScoreReport() }}>
                {scoring ? '生成中...' : '生成评分报告'}
              </Button>
              <p className="text-sm text-ink-500">将按四篇篇章生成总分、分项评分和逐句问题分析。</p>
            </div>
          )}
          {isErkou && (
            <div className="mb-8 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-canvas/40 px-5 py-4">
              <Button variant="secondary" loading={transcribing} disabled={!hasErkouRecording} onClick={() => { void generateErkouTranscript() }}>
                {transcribing ? '转写中...' : hasMissingTranscript ? '生成转写' : '重新生成转写'}
              </Button>
              <Button variant="primary" loading={scoring} disabled={!hasErkouTranscript} onClick={() => { void generateErkouScoreReport() }}>
                {scoring ? '评分中...' : scored ? '重新生成评分报告' : '生成评分报告'}
              </Button>
              <p className="text-sm text-ink-500">
                {hasErkouTranscript ? '评分将基于录音转写文本生成总分、分项评分和分段诊断。' : hasErkouRecording ? '请先生成转写，再生成二口评分报告。' : '暂无可转写录音。'}
              </p>
            </div>
          )}
          {scoreError && <p className="mb-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{scoreError}</p>}
          {transcriptError && <p className="mb-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{transcriptError}</p>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <ReportMeta label="考试标题" value={exam.title} />
            <ReportMeta label="考试类型" value={isErkou ? 'CATTI 二口实务' : 'CATTI 二笔实务'} />
            <ReportMeta label="语言方向" value={isErkou ? displayDirection(exam.direction) : displayExamDirections(reportPassages, exam.direction)} />
            <ReportMeta label="开始时间" value={formatDateTime(attempt.started_at)} />
            <ReportMeta label="提交时间" value={attempt.submitted_at ? formatDateTime(attempt.submitted_at) : '尚未提交'} />
            <ReportMeta label="考试用时" value={durationText} />
            {isErkou && <ReportMeta label="录音段落" value={`${recordedSegmentCount} / ${reportSegments.length}`} />}
            {isErkou && <ReportMeta label="转写段落" value={`${transcriptSegmentCount} / ${reportSegments.length}`} />}
            {isErkou && <ReportMeta label="评分段落" value={`${scoredSegmentCount} / ${reportSegments.length}`} />}
          </div>
        </Card>

        {scored && (
          <Card padding="lg" className="mb-5">
            <h2 className="mb-5 font-serif text-xl text-ink-900">总体评分</h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <ReportMeta label="总分" value={attempt.total_score != null ? `${attempt.total_score}` : '暂无'} />
              <ReportMeta label="通过水平" value={passingLevel(attempt.total_score)} />
              <div className="rounded-xl border border-line bg-canvas/40 px-4 py-3 lg:col-span-2">
                <p className="mb-2 text-[11px] text-ink-500">总体评价</p>
                <p className="whitespace-pre-wrap text-sm leading-7 text-ink-800">{attempt.overall_comment || '暂无总体评价。'}</p>
              </div>
            </div>
            <div className="mt-5">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">分项评分</p>
              <DimensionScoreTable scores={dimensionScores} />
            </div>
          </Card>
        )}

        {isErkou && (
          <Card padding="lg" className="mb-5">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-serif text-xl text-ink-900">二口分段报告</h2>
                <p className="mt-2 text-sm text-ink-500">逐段查看录音、ASR 转写和 AI 诊断。评分基于转写文本，不代表官方成绩。</p>
              </div>
              <span className="rounded-full border border-line bg-canvas px-3 py-1 text-xs text-ink-600">
                {recordedSegmentCount} 段录音 · {transcriptSegmentCount} 段转写 · {scoredSegmentCount} 段评分
              </span>
            </div>
            {reportSegments.length === 0 ? (
              <p className="rounded-xl border border-line bg-canvas/40 px-4 py-3 text-sm text-ink-500">暂无段落录音。</p>
            ) : (
              <div className="space-y-6">
                {erkouPassageGroups.map(group => (
                  <div key={group.key} className="rounded-2xl border border-line bg-white p-4">
                    <div className="mb-4 border-b border-line pb-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">{group.direction}</p>
                      <h3 className="mt-1 font-serif text-lg text-ink-900">{group.title}</h3>
                    </div>
                    <div className="space-y-4">
                {group.segments.map(segment => {
                  const segmentScore = getSegmentScore(segment.segment_score_json)
                  const hasTranscript = !!segment.transcript?.trim()
                  return (
                  <div key={segment.id} className="rounded-2xl border border-line bg-canvas/30 p-5">
                    <div className="mb-4 flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">Segment {segment.segment_order_global ?? segment.segment_order}</p>
                        <h3 className="font-serif text-lg text-ink-900">第 {segment.segment_order_in_passage ?? segment.segment_order} 段</h3>
                        <p className="mt-1 text-sm text-ink-600">原文 {countPracticeWords(segment.source_text)} 字 · 播放约 {segment.estimated_play_seconds ?? '-'} 秒 · 录音 {segment.recording_seconds ?? segment.pause_seconds ?? '-'} 秒</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-600">
                          {segment.user_audio_url ? '已上传录音' : '缺少录音'}
                        </span>
                        <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-600">
                          {hasTranscript ? '已转写' : '待转写'}
                        </span>
                        {segmentScore && (
                          <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-600">
                            {segmentScore.total_score} / {segmentScore.max_score}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <div className="space-y-4">
                        <TextBlock title="原文" text={segment.source_text} />
                        {segment.reference_translation && <TextBlock title="参考译文" text={segment.reference_translation} />}
                      </div>
                      <div>
                        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">用户录音</p>
                        <div className="rounded-xl border border-line bg-white px-4 py-4">
                          {segment.user_audio_url ? (
                            <audio controls src={segment.user_audio_url} className="w-full" />
                          ) : (
                            <p className="text-sm text-ink-500">暂无录音。</p>
                          )}
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-3">
                          <AnalysisField label="转写文本" value={segment.transcript || '暂无转写。'} />
                          <AnalysisField label="问题类型" value={segmentScore?.problem_type || (hasTranscript ? '待生成评分。' : '暂无分析。')} />
                          <AnalysisField label="评分评语" value={segmentScore?.comment || (hasTranscript ? '已有转写，可生成评分报告。' : '暂无分析。')} />
                          <AnalysisField label="修改建议" value={segmentScore?.suggestion || '暂无建议。'} />
                        </div>
                      </div>
                    </div>
                  </div>
                  )
                })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {!isErkou && <div className="space-y-5">
          {reportPassages.map(passage => {
            const analyses = analysesByPassage.get(passage.id) ?? []
            return (
              <Card key={passage.id} padding="lg">
                <div className="mb-5 flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">Passage {passage.passage_order}</p>
                    <h2 className="font-serif text-xl text-ink-900">{passage.title || passageLabel(passage)}</h2>
                    <p className="mt-2 text-sm text-ink-600">{displayDirection(passage.direction)} · 原文 {countPracticeWords(passage.source_text)} 字 · 译文 {countPracticeWords(passage.answer_text)} 字</p>
                  </div>
                  {scored && (
                    <div className="rounded-xl border border-line bg-canvas/40 px-4 py-3 text-left sm:text-right">
                      <p className="text-[11px] text-ink-500">篇章得分</p>
                      <p className="mt-1 font-mono text-lg text-ink-900">{passage.answer_total_score != null ? `${passage.answer_total_score} / ${passage.max_score ?? 25}` : '暂无'}</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <TextBlock title="原文" text={passage.source_text} />
                  <TextBlock title="用户译文" text={passage.answer_text || '暂无译文。'} />
                </div>

                {passage.reference_translation && (
                  <TextBlock title="参考译文" text={passage.reference_translation} className="mt-4" />
                )}

                {scored && (
                  <div className="mt-5 border-t border-line pt-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-serif text-lg text-ink-900">逐句问题分析</h3>
                      {passage.answer_overall_comment && <p className="text-xs text-ink-500">{passage.answer_overall_comment}</p>}
                    </div>
                    {analyses.length === 0 ? (
                      <p className="rounded-xl border border-line bg-canvas/40 px-4 py-3 text-sm text-ink-500">本篇暂无逐句分析。</p>
                    ) : (
                      <div className="space-y-4">
                        {analyses.map(item => (
                          <div key={item.id} className="rounded-xl border border-line bg-canvas/40 p-4">
                            <p className="mb-2 text-xs text-ink-500">句 {item.sentence_order ?? '-' } · {item.problem_type || '问题类型未标注'}</p>
                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                              <AnalysisField label="原文句子" value={item.source_sentence || '暂无'} />
                              <AnalysisField label="用户译文" value={item.user_translation || '暂无'} />
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
                              <AnalysisField label="问题说明" value={item.problem_detail || '暂无问题说明。'} />
                              <AnalysisField label="修改建议" value={item.suggestion || '暂无修改建议。'} />
                              <AnalysisField label="参考译法" value={item.reference_version || '暂无参考译法。'} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>}
      </main>
    </div>
  )
}

function ReportMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-canvas/40 px-4 py-3">
      <p className="mb-1 text-[11px] text-ink-500">{label}</p>
      <p className="text-sm font-medium text-ink-900">{value}</p>
    </div>
  )
}

function TextBlock({
  title,
  text,
  className,
}: {
  title: string
  text: string
  className?: string
}) {
  return (
    <div className={className}>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">{title}</p>
      <div className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-canvas/30 px-4 py-3 text-sm leading-8 text-ink-800">{text}</div>
    </div>
  )
}

function DimensionScoreTable({ scores }: { scores: DimensionScore[] }) {
  if (scores.length === 0) {
    return <p className="rounded-xl border border-line bg-canvas/40 px-4 py-3 text-sm text-ink-500">暂无分项评分。</p>
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line">
      {scores.map(score => (
        <div key={score.name} className="grid grid-cols-1 gap-2 border-b border-line bg-white px-4 py-3 last:border-b-0 md:grid-cols-[160px_120px_1fr]">
          <p className="text-sm font-medium text-ink-900">{score.name}</p>
          <p className="font-mono text-sm text-ink-700">{score.score} / {score.max_score}</p>
          <p className="text-sm leading-6 text-ink-600">{score.comment || '暂无评语。'}</p>
        </div>
      ))}
    </div>
  )
}

function AnalysisField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[11px] text-ink-500">{label}</p>
      <p className="whitespace-pre-wrap text-sm leading-7 text-ink-800">{value}</p>
    </div>
  )
}

function buildReportPassages(
  exam: CattiMockExam,
  passages: CattiMockPassage[],
  answers: CattiMockAttemptAnswer[],
  legacyAnswerText: string
): ReportPassage[] {
  const sourcePassages = passages.length > 0 ? passages : [legacyPassageFromExam(exam)]
  const answerByPassage = new Map(answers.map(answer => [answer.passage_id, answer]))
  return sourcePassages.map((passage, index) => {
    const answer = answerByPassage.get(passage.id)
    return {
      ...passage,
      answer_text: answer?.answer_text || (index === 0 ? legacyAnswerText : ''),
      answer_total_score: answer?.total_score ?? null,
      answer_score_json: answer?.score_json ?? null,
      answer_overall_comment: answer?.overall_comment ?? null,
    }
  })
}

function buildReportSegments(segments: CattiMockSegment[], attemptSegments: CattiMockAttemptSegment[]): ReportSegment[] {
  const attemptSegmentBySegmentId = new Map(attemptSegments.map(row => [row.segment_id, row]))
  return segments.map(segment => {
    const attemptSegment = attemptSegmentBySegmentId.get(segment.id)
    return {
      ...segment,
      user_audio_url: attemptSegment?.user_audio_url || null,
      transcript: attemptSegment?.transcript || null,
      segment_score_json: attemptSegment?.score_json ?? null,
    }
  })
}

function groupReportSegmentsByPassage(segments: ReportSegment[]) {
  const grouped = new Map<string, { key: string; title: string; direction: string; segments: ReportSegment[] }>()
  for (const segment of segments) {
    const passageOrder = segment.passage_order ?? fallbackPassageOrder(segment.segment_order)
    const key = String(passageOrder)
    const direction = segment.direction || (passageOrder >= 3 ? 'C-E' : 'E-C')
    const title = segment.passage_title || erkouPassageTitle(passageOrder)
    const group = grouped.get(key) ?? { key, title, direction, segments: [] }
    group.segments.push(segment)
    grouped.set(key, group)
  }
  return Array.from(grouped.values())
    .sort((a, b) => Number(a.key) - Number(b.key))
    .map(group => ({
      ...group,
      segments: group.segments.sort((a, b) => (a.segment_order_in_passage ?? a.segment_order) - (b.segment_order_in_passage ?? b.segment_order)),
    }))
}

function fallbackPassageOrder(segmentOrder: number) {
  if (segmentOrder <= 5) return 1
  if (segmentOrder <= 10) return 2
  if (segmentOrder <= 14) return 3
  return 4
}

function erkouPassageTitle(order: number) {
  if (order === 1) return 'E-C Passage 1'
  if (order === 2) return 'E-C Passage 2'
  if (order === 3) return 'C-E Passage 1'
  if (order === 4) return 'C-E Passage 2'
  return `Passage ${order}`
}

function legacyPassageFromExam(exam: CattiMockExam): CattiMockPassage {
  return {
    id: `legacy-${exam.id}`,
    exam_id: exam.id,
    passage_order: 1,
    direction: exam.direction,
    title: '原文',
    source_text: exam.source_text,
    reference_translation: exam.reference_translation,
    max_score: 100,
  }
}

function groupAnalysesByPassage(analyses: SentenceAnalysis[], passages: ReportPassage[]) {
  const firstPassageId = passages[0]?.id || ''
  return analyses.reduce<Map<string, SentenceAnalysis[]>>((map, item) => {
    const key = item.passage_id || firstPassageId
    const list = map.get(key) ?? []
    list.push(item)
    map.set(key, list)
    return map
  }, new Map())
}

function getDimensionScores(value: Record<string, unknown> | null): DimensionScore[] {
  const dimensionValue = value?.dimension_scores
  const rows = Array.isArray(dimensionValue) ? dimensionValue : []
  return rows.map(item => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    return {
      name: stringValue(record.name),
      score: numberValue(record.score),
      max_score: numberValue(record.max_score),
      comment: stringValue(record.comment),
    }
  }).filter(item => item.name && item.max_score > 0)
}

function getSegmentScore(value: Record<string, unknown> | null): SegmentScoreView | null {
  if (!value) return null
  const totalScore = numberValue(value.total_score)
  const maxScore = numberValue(value.max_score)
  const problemType = stringValue(value.problem_type)
  const comment = stringValue(value.comment)
  const suggestion = stringValue(value.suggestion)
  if (!maxScore && !problemType && !comment && !suggestion) return null
  return {
    total_score: totalScore,
    max_score: maxScore || 100,
    problem_type: problemType || '综合问题',
    comment: comment || '暂无具体评语。',
    suggestion: suggestion || '暂无修改建议。',
  }
}

function passingLevel(score: number | null) {
  if (score == null) return '暂无'
  if (score >= 60) return '达到或接近模拟通过水平'
  if (score >= 55) return '接近模拟通过线，仍需减少关键扣分'
  return '未达到模拟通过水平'
}

function passageLabel(passage: Pick<CattiMockPassage, 'passage_order' | 'direction'>) {
  if (passage.passage_order === 1) return '英译中一'
  if (passage.passage_order === 2) return '英译中二'
  if (passage.passage_order === 3) return '中译英一'
  if (passage.passage_order === 4) return '中译英二'
  return passage.direction === 'C-E' ? `中译英${passage.passage_order}` : `英译中${passage.passage_order}`
}

function displayExamDirections(passages: ReportPassage[], fallback: string) {
  const directions = Array.from(new Set(passages.map(passage => passage.direction))).filter(Boolean)
  if (directions.length > 1) return '英译中 / 中译英'
  return displayDirection(directions[0] || fallback)
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown) {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : Number.NaN
  return Number.isFinite(number) ? number : 0
}

function displayDirection(value: string) {
  if (value === 'E-C') return '英译中'
  if (value === 'C-E') return '中译英'
  return value
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function formatDuration(startedAt: string, submittedAt: string | null) {
  if (!submittedAt) return '尚未提交'
  const start = new Date(startedAt).getTime()
  const end = new Date(submittedAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '无法计算'
  const totalSeconds = Math.floor((end - start) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours} 小时 ${minutes} 分 ${seconds} 秒`
  return `${minutes} 分 ${seconds} 秒`
}

function attemptLabel(status: string) {
  if (status === 'scored') return '已评分'
  if (status === 'submitted') return '已提交'
  if (status === 'in_progress') return '进行中'
  return status
}
