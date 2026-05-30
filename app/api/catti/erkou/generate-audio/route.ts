import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { ensureStorageBucket } from '@/lib/storageBuckets'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 120

const ADMIN_EMAIL = 'rukunchen@hotmail.com'
const BUCKET = 'catti-audio'
const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts'
const DEFAULT_BATCH_SIZE = 3
const MAX_BATCH_SIZE = 4
const SEGMENT_SELECT = [
  'id',
  'exam_id',
  'segment_order',
  'segment_order_global',
  'segment_order_in_passage',
  'passage_order',
  'passage_title',
  'direction',
  'source_text',
  'reference_translation',
  'audio_url',
  'tts_voice',
  'speech_rate',
  'estimated_play_seconds',
  'recording_seconds',
  'transition_seconds',
  'pause_seconds',
  'created_at',
  'updated_at',
].join(', ')

type GenerateAudioRequest = {
  examId?: string
  force?: boolean
  batchSize?: number
}

type ExamRow = {
  id: string
  exam_type: string
  voice_type: string | null
  speech_rate: string | null
  tts_status: string | null
}

type SegmentRow = {
  id: string
  exam_id: string
  segment_order: number
  source_text: string
  audio_url: string | null
}

type SpeechVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'

export async function POST(request: NextRequest) {
  const { user } = await supabaseFromRequest(request)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if ((user.email || '').toLowerCase() !== ADMIN_EMAIL) {
    return NextResponse.json({ error: '只有管理员可以生成二口考试音频。' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as GenerateAudioRequest
  const examId = body.examId?.trim()
  const force = !!body.force
  const batchSize = clampBatchSize(body.batchSize)
  if (!examId) return NextResponse.json({ error: '缺少 examId。' }, { status: 400 })

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return NextResponse.json({ error: 'OpenAI 尚未配置：请设置 OPENAI_API_KEY。' }, { status: 500 })

  const admin = supabaseAdmin()
  const { data: exam, error: examError } = await admin
    .from('catti_mock_exams')
    .select('id, exam_type, voice_type, speech_rate, tts_status')
    .eq('id', examId)
    .maybeSingle()

  if (examError) return NextResponse.json({ error: examError.message }, { status: 500 })
  if (!exam) return NextResponse.json({ error: '模考不存在。' }, { status: 404 })

  const examRow = exam as ExamRow
  if (examRow.exam_type !== 'erkou_practice') {
    return NextResponse.json({ error: '该模考不是 CATTI 二口实务。' }, { status: 400 })
  }

  if (force) {
    const { error: resetError } = await admin
      .from('catti_mock_segments')
      .update({ audio_url: null, tts_voice: null })
      .eq('exam_id', examId)
    if (resetError) return NextResponse.json({ error: '重置已有音频失败：' + resetError.message }, { status: 500 })
  }

  const { data: segments, error: segmentError } = await admin
    .from('catti_mock_segments')
    .select(SEGMENT_SELECT)
    .eq('exam_id', examId)
    .order('segment_order', { ascending: true })

  if (segmentError) return NextResponse.json({ error: '读取段落失败：' + segmentError.message }, { status: 500 })

  const segmentRows = ((segments ?? []) as unknown as SegmentRow[]).filter(segment => segment.source_text.trim())
  if (segmentRows.length === 0) {
    await admin.from('catti_mock_exams').update({ tts_status: 'failed' }).eq('id', examId)
    return NextResponse.json({ error: '没有可生成音频的段落。' }, { status: 400 })
  }

  const pendingSegments = segmentRows.filter(segment => !segment.audio_url)
  if (pendingSegments.length === 0) {
    const { data: updatedExam } = await admin
      .from('catti_mock_exams')
      .update({ tts_status: 'generated' })
      .eq('id', examId)
      .select('id, tts_status, updated_at')
      .single()
    const { data: refreshedSegments } = await admin
      .from('catti_mock_segments')
      .select(SEGMENT_SELECT)
      .eq('exam_id', examId)
      .order('segment_order', { ascending: true })
    return NextResponse.json({
      exam: updatedExam,
      segments: refreshedSegments ?? [],
      generated_count: 0,
      skipped_count: segmentRows.length,
      pending_count: 0,
      done: true,
    })
  }

  await admin.from('catti_mock_exams').update({ tts_status: 'generating' }).eq('id', examId)
  try {
    await ensureStorageBucket(admin, BUCKET, {
      public: true,
      fileSizeLimit: 50 * 1024 * 1024,
      allowedMimeTypes: ['audio/mpeg', 'audio/mp3'],
    })
  } catch (error) {
    await admin.from('catti_mock_exams').update({ tts_status: 'failed' }).eq('id', examId)
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }

  const openai = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL?.trim() || undefined,
  })
  const voice = mapVoice(examRow.voice_type)
  const speed = mapSpeechRate(examRow.speech_rate)
  const model = process.env.OPENAI_TTS_MODEL?.trim() || DEFAULT_TTS_MODEL
  let generatedCount = 0
  const batchSegments = pendingSegments.slice(0, batchSize)

  try {
    for (const segment of batchSegments) {
      const speech = await openai.audio.speech.create({
        model,
        voice,
        input: segment.source_text,
        response_format: 'mp3',
        speed,
      })
      const audioBuffer = Buffer.from(await speech.arrayBuffer())
      const path = `${examId}/${segment.id}.mp3`
      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(path, audioBuffer, {
          contentType: 'audio/mpeg',
          upsert: true,
        })
      if (uploadError) throw new Error(`第 ${segment.segment_order} 段上传失败：${uploadError.message}`)

      const { data: publicUrlData } = admin.storage.from(BUCKET).getPublicUrl(path)
      const { data: updatedSegment, error: updateSegmentError } = await admin
        .from('catti_mock_segments')
        .update({
          audio_url: publicUrlData.publicUrl,
          tts_voice: voice,
          speech_rate: examRow.speech_rate || 'standard',
        })
        .eq('id', segment.id)
        .select(SEGMENT_SELECT)
        .single()

      if (updateSegmentError) throw new Error(`第 ${segment.segment_order} 段写入失败：${updateSegmentError.message}`)
      if (updatedSegment) generatedCount += 1
    }

    const remainingCount = Math.max(0, pendingSegments.length - generatedCount)
    const nextStatus = remainingCount === 0 ? 'generated' : 'generating'
    const { data: updatedExam, error: updateExamError } = await admin
      .from('catti_mock_exams')
      .update({ tts_status: nextStatus })
      .eq('id', examId)
      .select('id, tts_status, updated_at')
      .single()
    if (updateExamError) throw new Error('更新音频状态失败：' + updateExamError.message)

    const { data: refreshedSegments, error: refreshError } = await admin
      .from('catti_mock_segments')
      .select(SEGMENT_SELECT)
      .eq('exam_id', examId)
      .order('segment_order', { ascending: true })
    if (refreshError) throw new Error('读取音频结果失败：' + refreshError.message)

    return NextResponse.json({
      exam: updatedExam,
      segments: refreshedSegments ?? [],
      generated_count: generatedCount,
      skipped_count: segmentRows.length - pendingSegments.length,
      pending_count: remainingCount,
      done: remainingCount === 0,
      batch_size: batchSize,
      voice,
      speed,
      model,
    })
  } catch (error) {
    console.error('[catti/erkou/generate-audio]', errorMessage(error))
    await admin.from('catti_mock_exams').update({ tts_status: 'failed' }).eq('id', examId)
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

function clampBatchSize(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_BATCH_SIZE
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(value)))
}

function mapVoice(voiceType: string | null): SpeechVoice {
  if (voiceType === 'male') return 'onyx'
  if (voiceType === 'female') return 'nova'
  return 'alloy'
}

function mapSpeechRate(speechRate: string | null) {
  if (speechRate === 'slow') return 0.85
  if (speechRate === 'fast') return 1.15
  return 1
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '生成音频失败。'
}
