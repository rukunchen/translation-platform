import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 60

const ADMIN_EMAIL = 'rukunchen@hotmail.com'
const BUCKET = 'catti-recordings'
const MAX_RECORDING_SIZE = 80 * 1024 * 1024

type AttemptRow = {
  id: string
  exam_id: string
  user_id: string
  status: string
}

type SegmentRow = {
  id: string
  exam_id: string
}

export async function POST(request: NextRequest) {
  const { user } = await supabaseFromRequest(request)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const form = await request.formData()
  const attemptId = String(form.get('attemptId') || '').trim()
  const segmentId = String(form.get('segmentId') || '').trim()
  const file = form.get('file')
  if (!attemptId || !segmentId) return NextResponse.json({ error: '缺少 attemptId 或 segmentId。' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: '缺少录音文件。' }, { status: 400 })
  if (file.size <= 0) return NextResponse.json({ error: '录音文件为空。' }, { status: 400 })
  if (file.size > MAX_RECORDING_SIZE) return NextResponse.json({ error: '录音文件不能超过 80MB。' }, { status: 400 })

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
    return NextResponse.json({ error: '你没有权限上传这份考试记录的录音。' }, { status: 403 })
  }
  if (attemptRow.status !== 'in_progress') {
    return NextResponse.json({ error: '考试已提交，不能继续上传录音。' }, { status: 400 })
  }

  const { data: segment, error: segmentError } = await admin
    .from('catti_mock_segments')
    .select('id, exam_id')
    .eq('id', segmentId)
    .maybeSingle()
  if (segmentError) return NextResponse.json({ error: segmentError.message }, { status: 500 })
  if (!segment) return NextResponse.json({ error: '段落不存在。' }, { status: 404 })

  const segmentRow = segment as SegmentRow
  if (segmentRow.exam_id !== attemptRow.exam_id) {
    return NextResponse.json({ error: '段落不属于当前考试。' }, { status: 400 })
  }

  const path = `${attemptId}/${segmentId}.webm`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type || 'audio/webm',
      upsert: true,
    })
  if (uploadError) return NextResponse.json({ error: '录音上传失败：' + uploadError.message }, { status: 500 })

  const { data: publicUrlData } = admin.storage.from(BUCKET).getPublicUrl(path)
  const userAudioUrl = publicUrlData.publicUrl

  const { data: existing, error: existingError } = await admin
    .from('catti_mock_attempt_segments')
    .select('id')
    .eq('attempt_id', attemptId)
    .eq('segment_id', segmentId)
    .limit(1)
    .maybeSingle()
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })

  const payload = {
    attempt_id: attemptId,
    segment_id: segmentId,
    user_audio_url: userAudioUrl,
  }
  const query = existing
    ? admin.from('catti_mock_attempt_segments').update(payload).eq('id', existing.id)
    : admin.from('catti_mock_attempt_segments').insert(payload)

  const { data: attemptSegment, error: saveError } = await query
    .select('id, attempt_id, segment_id, user_audio_url, transcript, created_at, updated_at')
    .single()
  if (saveError) return NextResponse.json({ error: '录音记录保存失败：' + saveError.message }, { status: 500 })

  return NextResponse.json({ attemptSegment })
}
