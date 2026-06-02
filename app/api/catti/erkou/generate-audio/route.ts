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
  tts_status: string | null
  ec_voice_profile: string | null
  ec_accent_profile: string | null
  ec_speed_profile: string | null
  ec_speech_rate_value: number | string | null
  ce_voice_profile: string | null
  ce_accent_profile: string | null
  ce_speed_profile: string | null
  ce_speech_rate_value: number | string | null
}

type SegmentRow = {
  id: string
  exam_id: string
  segment_order: number
  direction: 'E-C' | 'C-E' | string | null
  source_text: string
  audio_url: string | null
}

type SpeechVoice = 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer' | 'verse' | 'marin' | 'cedar'
type TtsDirectionConfig = {
  voice: SpeechVoice
  voiceProfile: string
  accentProfile: string
  speedProfile: string
  speed: number
  styleInstruction: string
}

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
    .select('id, exam_type, tts_status, ec_voice_profile, ec_accent_profile, ec_speed_profile, ec_speech_rate_value, ce_voice_profile, ce_accent_profile, ce_speed_profile, ce_speech_rate_value')
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
  const model = process.env.OPENAI_TTS_MODEL?.trim() || DEFAULT_TTS_MODEL
  const supportsStyleInstructions = !model.startsWith('tts-1')
  let generatedCount = 0
  const batchSegments = pendingSegments.slice(0, batchSize)

  try {
    for (const segment of batchSegments) {
      const config = getCattiTtsConfigForSegment(examRow, segment)
      const speech = await openai.audio.speech.create({
        model,
        voice: config.voice,
        input: segment.source_text,
        ...(supportsStyleInstructions ? { instructions: config.styleInstruction } : {}),
        response_format: 'mp3',
        speed: config.speed,
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
          tts_voice: config.voiceProfile,
          speech_rate: config.speedProfile,
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

const ecVoiceProfiles: Record<string, { voice: SpeechVoice; style: string }> = {
  formal_diplomat_male: { voice: 'cedar', style: 'mature male diplomatic English speaker, calm and authoritative, natural human cadence' },
  formal_diplomat_female: { voice: 'marin', style: 'mature female diplomatic English speaker, calm and authoritative, natural human cadence' },
  british_standard_male: { voice: 'cedar', style: 'British standard English male speaker, polished pronunciation, formal exam delivery' },
  british_standard_female: { voice: 'marin', style: 'British standard English female speaker, polished pronunciation, formal exam delivery' },
  british_news: { voice: 'verse', style: 'British English newsreader, crisp pronunciation, formal broadcast rhythm' },
  american_conference_male: { voice: 'cedar', style: 'American English male conference speaker, clear pronunciation, professional tone' },
  american_conference_female: { voice: 'marin', style: 'American English female conference speaker, clear pronunciation, professional tone' },
  indian_light: { voice: 'sage', style: 'Indian English conference speaker with a light accent, clear and natural pronunciation' },
  indian_heavy: { voice: 'sage', style: 'Indian English conference speaker with a stronger accent, realistic but easy to follow' },
  international_non_native: { voice: 'ash', style: 'international non-native English conference speaker, clear but realistic pronunciation' },
}

const ecAccentProfiles: Record<string, string> = {
  neutral: 'standard clear English pronunciation, neutral accent',
  british: 'British English accent',
  american: 'American English accent',
  indian_light: 'Indian English accent, light accent',
  indian_heavy: 'Indian English accent, stronger accent',
  non_native_light: 'non-native English accent, light accent, clear pronunciation',
  non_native_heavy: 'non-native English accent, stronger accent, realistic conference delivery',
}

const ceVoiceProfiles: Record<string, { voice: SpeechVoice; style: string }> = {
  chinese_diplomat_male: { voice: 'cedar', style: '标准普通话，正式外交发言风格，沉稳男声，语速稳定，停顿清楚' },
  chinese_diplomat_female: { voice: 'marin', style: '标准普通话，正式外交发言风格，沉稳女声，语速稳定，停顿清楚' },
  chinese_news_male: { voice: 'cedar', style: '标准普通话，新闻播报风格，清晰男声，吐字清楚，节奏规整' },
  chinese_news_female: { voice: 'marin', style: '标准普通话，新闻播报风格，清晰女声，吐字清楚，节奏规整' },
  chinese_public_speech_male: { voice: 'cedar', style: '标准普通话，正式讲话风格，庄重男声，语气沉稳，停顿明显' },
  chinese_public_speech_female: { voice: 'marin', style: '标准普通话，正式讲话风格，庄重女声，语气沉稳，停顿明显' },
  chinese_conference_male: { voice: 'cedar', style: '标准普通话，会议发言风格，自然男声，清楚真实，节奏稳定' },
  chinese_conference_female: { voice: 'marin', style: '标准普通话，会议发言风格，自然女声，清楚真实，节奏稳定' },
  mandarin_standard_male: { voice: 'cedar', style: '标准普通话男声，清晰自然，适合考试听辨' },
  mandarin_standard_female: { voice: 'marin', style: '标准普通话女声，清晰自然，适合考试听辨' },
}

const ceAccentProfiles: Record<string, string> = {
  mandarin_standard: '标准普通话，发音清晰自然',
  mandarin_news: '新闻播报普通话，吐字清晰，节奏规整',
  mandarin_diplomatic: '外交发言普通话，正式沉稳，停顿自然',
  mandarin_public_speech: '正式讲话普通话，语气庄重，停顿明显',
  mandarin_conference: '会议发言普通话，自然清楚，适合正式场合',
}

const ecSpeedRates: Record<string, number> = {
  slow_070: 0.7,
  slow_075: 0.75,
  slow_080: 0.8,
  slow_training: 0.85,
  slow_090: 0.9,
  slow_095: 0.95,
  standard_exam: 1,
  fast_challenge: 1.1,
  pressure_training: 1.2,
}

const ceSpeedRates: Record<string, number> = {
  slow_070: 0.7,
  slow_075: 0.75,
  slow_080: 0.8,
  slow_training: 0.85,
  slow_090: 0.9,
  slow_095: 0.95,
  standard_exam: 1,
  fast_challenge: 1.08,
  pressure_training: 1.15,
}

function naturalSpeedInstruction(speed: number, language: 'zh' | 'en') {
  if (speed >= 0.98) return ''
  if (language === 'zh') {
    return '按所选倍率自然放慢语速，通过真人朗读式的节奏、停顿和清晰吐字来变慢，不要产生机械拉伸、颤动、失真或不自然拖腔。'
  }
  return 'Use the selected slower pace as a natural human speaking cadence, with deliberate phrasing and pauses. Do not sound mechanically time-stretched, distorted, robotic, or unnaturally dragged.'
}

function getCattiTtsConfigForSegment(exam: ExamRow, segment: SegmentRow): TtsDirectionConfig {
  if (segment.direction === 'C-E') {
    const voiceProfile = normalizeKey(ceVoiceProfiles, exam.ce_voice_profile, 'chinese_diplomat_male')
    const accentProfile = normalizeKey(ceAccentProfiles, exam.ce_accent_profile, 'mandarin_standard')
    const speedProfile = normalizeKey(ceSpeedRates, exam.ce_speed_profile, 'standard_exam')
    const speed = clampSpeechSpeed(exam.ce_speech_rate_value ?? ceSpeedRates[speedProfile])
    const voiceConfig = ceVoiceProfiles[voiceProfile]
    return {
      voice: voiceConfig.voice,
      voiceProfile,
      accentProfile,
      speedProfile,
      speed,
      styleInstruction: `${voiceConfig.style}。${ceAccentProfiles[accentProfile]}。${naturalSpeedInstruction(speed, 'zh')}请像真人考场原文录音一样朗读，语流自然，有真实停顿和重音，不要有机械合成感。只朗读中文原文，不要翻译，不要解释，不要使用英伦、印度或美式英语口音。`,
    }
  }

  const voiceProfile = normalizeKey(ecVoiceProfiles, exam.ec_voice_profile, 'formal_diplomat_male')
  const accentProfile = normalizeKey(ecAccentProfiles, exam.ec_accent_profile, 'neutral')
  const speedProfile = normalizeKey(ecSpeedRates, exam.ec_speed_profile, 'standard_exam')
  const speed = clampSpeechSpeed(exam.ec_speech_rate_value ?? ecSpeedRates[speedProfile])
  const voiceConfig = ecVoiceProfiles[voiceProfile]
  return {
    voice: voiceConfig.voice,
    voiceProfile,
    accentProfile,
    speedProfile,
    speed,
    styleInstruction: `${voiceConfig.style}. ${ecAccentProfiles[accentProfile]}. ${naturalSpeedInstruction(speed, 'en')} Read like a real human CATTI oral exam source recording with natural phrasing, pauses, and emphasis. Avoid a robotic or synthetic TTS sound. Play the English source text only; do not translate or explain it; do not use a Mandarin voice style.`,
  }
}

function normalizeKey<T>(record: Record<string, T>, value: string | null, fallback: string) {
  return value && record[value] ? value : fallback
}

function clampSpeechSpeed(value: unknown) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 1
  return Math.max(0.7, Math.min(1.25, numericValue))
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '生成音频失败。'
}
