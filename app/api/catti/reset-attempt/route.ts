import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

const ADMIN_EMAIL = 'rukunchen@hotmail.com'
const RECORDING_BUCKET = 'catti-recordings'

type ResetAttemptRequest = {
  examId?: string
}

type ExamRow = {
  id: string
  exam_type: string
  status: string
}

type AttemptRow = {
  id: string
}

export async function POST(request: NextRequest) {
  const { user } = await supabaseFromRequest(request)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as ResetAttemptRequest
  const examId = body.examId?.trim()
  if (!examId) return NextResponse.json({ error: '缺少 examId。' }, { status: 400 })

  const admin = supabaseAdmin()
  const { data: exam, error: examError } = await admin
    .from('catti_mock_exams')
    .select('id, exam_type, status')
    .eq('id', examId)
    .maybeSingle()

  if (examError) return NextResponse.json({ error: examError.message }, { status: 500 })
  if (!exam) return NextResponse.json({ error: '模考题不存在。' }, { status: 404 })

  const examRow = exam as ExamRow
  const isAdmin = (user.email || '').toLowerCase() === ADMIN_EMAIL
  if (examRow.exam_type !== 'erbi_practice' && examRow.exam_type !== 'erkou_practice') {
    return NextResponse.json({ error: '当前考试类型暂不支持重新考试。' }, { status: 400 })
  }
  if (!isAdmin && examRow.status !== 'published') {
    return NextResponse.json({ error: '模考题未发布。' }, { status: 403 })
  }

  const { data: attempts, error: attemptError } = await admin
    .from('catti_mock_attempts')
    .select('id')
    .eq('exam_id', examRow.id)
    .eq('user_id', user.id)

  if (attemptError) return NextResponse.json({ error: attemptError.message }, { status: 500 })

  const attemptRows = (attempts ?? []) as AttemptRow[]
  const attemptIds = attemptRows.map(attempt => attempt.id)
  if (attemptIds.length > 0) {
    const { error: deleteError } = await admin
      .from('catti_mock_attempts')
      .delete()
      .eq('exam_id', examRow.id)
      .eq('user_id', user.id)

    if (deleteError) return NextResponse.json({ error: '清除旧考试记录失败：' + deleteError.message }, { status: 500 })
    if (examRow.exam_type === 'erkou_practice') {
      await removeRecordingFiles(admin, attemptIds)
    }
  }

  return NextResponse.json({ deleted_count: attemptIds.length })
}

async function removeRecordingFiles(admin: ReturnType<typeof supabaseAdmin>, attemptIds: string[]) {
  for (const attemptId of attemptIds) {
    const { data } = await admin.storage.from(RECORDING_BUCKET).list(attemptId, { limit: 1000 })
    const paths = (data ?? [])
      .map(file => file.name)
      .filter(Boolean)
      .map(name => `${attemptId}/${name}`)
    if (paths.length > 0) {
      await admin.storage.from(RECORDING_BUCKET).remove(paths)
    }
  }
}
