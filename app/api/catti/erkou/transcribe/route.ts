import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 120

const ADMIN_EMAIL = 'rukunchen@hotmail.com'
const BUCKET = 'catti-recordings'
const DEFAULT_TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe'

type TranscribeRequest = {
  attemptId?: string
}

type AttemptRow = {
  id: string
  exam_id: string
  user_id: string
}

type ExamRow = {
  id: string
  exam_type: string
  direction: string
}

type AttemptSegmentRow = {
  id: string
  attempt_id: string
  segment_id: string | null
  user_audio_url: string | null
}

export async function POST(request: NextRequest) {
  const { user } = await supabaseFromRequest(request)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as TranscribeRequest
  const attemptId = body.attemptId?.trim()
  if (!attemptId) return NextResponse.json({ error: '缺少 attemptId。' }, { status: 400 })

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return NextResponse.json({ error: 'OpenAI 尚未配置：请设置 OPENAI_API_KEY。' }, { status: 500 })

  const admin = supabaseAdmin()
  const { data: attempt, error: attemptError } = await admin
    .from('catti_mock_attempts')
    .select('id, exam_id, user_id')
    .eq('id', attemptId)
    .maybeSingle()
  if (attemptError) return NextResponse.json({ error: attemptError.message }, { status: 500 })
  if (!attempt) return NextResponse.json({ error: '考试记录不存在。' }, { status: 404 })

  const attemptRow = attempt as AttemptRow
  const isAdmin = (user.email || '').toLowerCase() === ADMIN_EMAIL
  if (!isAdmin && attemptRow.user_id !== user.id) {
    return NextResponse.json({ error: '你没有权限转写这份考试记录。' }, { status: 403 })
  }

  const { data: exam, error: examError } = await admin
    .from('catti_mock_exams')
    .select('id, exam_type, direction')
    .eq('id', attemptRow.exam_id)
    .maybeSingle()
  if (examError) return NextResponse.json({ error: examError.message }, { status: 500 })
  if (!exam) return NextResponse.json({ error: '模考不存在。' }, { status: 404 })

  const examRow = exam as ExamRow
  if (examRow.exam_type !== 'erkou_practice') {
    return NextResponse.json({ error: '该考试不是 CATTI 二口实务。' }, { status: 400 })
  }

  const { data: attemptSegments, error: segmentError } = await admin
    .from('catti_mock_attempt_segments')
    .select('id, attempt_id, segment_id, user_audio_url')
    .eq('attempt_id', attemptId)
    .order('created_at', { ascending: true })
  if (segmentError) return NextResponse.json({ error: segmentError.message }, { status: 500 })

  const rows = ((attemptSegments ?? []) as AttemptSegmentRow[]).filter(row => row.segment_id && row.user_audio_url)
  if (rows.length === 0) return NextResponse.json({ error: '没有可转写的录音。' }, { status: 400 })

  const openai = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL?.trim() || undefined,
  })
  const model = process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || DEFAULT_TRANSCRIBE_MODEL
  const language = transcriptionLanguage(examRow.direction)
  const updatedSegments = []

  for (const row of rows) {
    const path = `${attemptId}/${row.segment_id}.webm`
    const { data: audioBlob, error: downloadError } = await admin.storage.from(BUCKET).download(path)
    if (downloadError || !audioBlob) {
      return NextResponse.json({ error: `录音下载失败：${downloadError?.message || path}` }, { status: 500 })
    }

    const file = new File([await audioBlob.arrayBuffer()], `${row.segment_id}.webm`, {
      type: audioBlob.type || 'audio/webm',
    })
    const transcription = await openai.audio.transcriptions.create({
      file,
      model,
      language,
    })

    const { data: updated, error: updateError } = await admin
      .from('catti_mock_attempt_segments')
      .update({ transcript: transcription.text || '' })
      .eq('id', row.id)
      .select('id, attempt_id, segment_id, user_audio_url, transcript')
      .single()
    if (updateError) return NextResponse.json({ error: '写入转写失败：' + updateError.message }, { status: 500 })

    updatedSegments.push(updated)
  }

  return NextResponse.json({
    attemptSegments: updatedSegments,
    transcript_count: updatedSegments.length,
    model,
  })
}

function transcriptionLanguage(direction: string) {
  if (direction === 'E-C') return 'zh'
  if (direction === 'C-E') return 'en'
  return undefined
}
