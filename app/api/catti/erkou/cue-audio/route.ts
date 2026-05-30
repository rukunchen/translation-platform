import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { ensureStorageBucket } from '@/lib/storageBuckets'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 60

const ADMIN_EMAIL = 'rukunchen@hotmail.com'
const BUCKET = 'catti-audio'
const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts'
const DEFAULT_CUE_VOICE: SpeechVoice = 'shimmer'
const CUE_TTS_INSTRUCTIONS = '请使用自然流畅的中文真人考场播报风格。语气沉稳、清晰、正式，停顿自然，不要有机器感。'
const MAX_CUE_LENGTH = 260

type SpeechVoice = 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer' | 'verse' | 'marin' | 'cedar'

type CueAudioRequest = {
  examId?: string
  text?: string
}

export async function POST(request: NextRequest) {
  const { user } = await supabaseFromRequest(request)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as CueAudioRequest
  const examId = body.examId?.trim()
  const text = normalizeCueText(body.text)
  if (!examId) return NextResponse.json({ error: '缺少 examId。' }, { status: 400 })
  if (!text) return NextResponse.json({ error: '缺少引导语文本。' }, { status: 400 })
  if (text.length > MAX_CUE_LENGTH) return NextResponse.json({ error: '引导语文本过长。' }, { status: 400 })

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return NextResponse.json({ error: 'OpenAI 尚未配置：请设置 OPENAI_API_KEY。' }, { status: 500 })

  const admin = supabaseAdmin()
  const { data: exam, error: examError } = await admin
    .from('catti_mock_exams')
    .select('id, exam_type, status')
    .eq('id', examId)
    .maybeSingle()

  if (examError) return NextResponse.json({ error: examError.message }, { status: 500 })
  if (!exam) return NextResponse.json({ error: '模考不存在。' }, { status: 404 })
  if (exam.exam_type !== 'erkou_practice') return NextResponse.json({ error: '该模考不是 CATTI 二口实务。' }, { status: 400 })
  if (exam.status !== 'published' && (user.email || '').toLowerCase() !== ADMIN_EMAIL) {
    return NextResponse.json({ error: '没有权限获取该考试引导音频。' }, { status: 403 })
  }

  try {
    await ensureStorageBucket(admin, BUCKET, {
      public: true,
      fileSizeLimit: 50 * 1024 * 1024,
      allowedMimeTypes: ['audio/mpeg', 'audio/mp3'],
    })

    const model = process.env.OPENAI_TTS_MODEL?.trim() || DEFAULT_TTS_MODEL
    const voice = normalizeVoice(process.env.OPENAI_TTS_CUE_VOICE?.trim()) || DEFAULT_CUE_VOICE
    const instructions = model.startsWith('tts-1') ? undefined : CUE_TTS_INSTRUCTIONS
    const hash = createHash('sha256').update(`${model}:${voice}:${instructions || ''}:${text}`).digest('hex').slice(0, 32)
    const path = `cues/${hash}.mp3`
    const existing = await admin.storage.from(BUCKET).list('cues', { search: `${hash}.mp3`, limit: 1 })
    const cached = existing.data?.some(item => item.name === `${hash}.mp3`)

    if (!cached) {
      const openai = new OpenAI({
        apiKey,
        baseURL: process.env.OPENAI_BASE_URL?.trim() || undefined,
      })
      const speech = await openai.audio.speech.create({
        model,
        voice,
        input: text,
        ...(instructions ? { instructions } : {}),
        response_format: 'mp3',
        speed: 0.95,
      })
      const audioBuffer = Buffer.from(await speech.arrayBuffer())
      const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true,
      })
      if (uploadError) throw new Error('上传引导音频失败：' + uploadError.message)
    }

    const { data: publicUrlData } = admin.storage.from(BUCKET).getPublicUrl(path)
    return NextResponse.json({
      audioUrl: publicUrlData.publicUrl,
      cached,
      voice,
      model,
    })
  } catch (error) {
    console.error('[catti/erkou/cue-audio]', errorMessage(error))
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

function normalizeCueText(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeVoice(value: string | undefined): SpeechVoice | null {
  const voices: SpeechVoice[] = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar']
  return voices.find(voice => voice === value) || null
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '生成引导音频失败。'
}
