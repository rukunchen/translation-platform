import { NextRequest, NextResponse } from 'next/server'
import { fetchSegmentRowsByDocumentIds } from '@/lib/fetchSegmentRows'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

type SegmentProgressRow = {
  id: string
  document_id: string
  status?: string | null
  target?: string | null
  translator_target?: string | null
  review_target?: string | null
  reviewed_at?: string | null
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function isTranslated(row: SegmentProgressRow): boolean {
  return hasText(row.target) || hasText(row.translator_target)
}

function isReviewed(row: SegmentProgressRow): boolean {
  const status = String(row.status || '').toLowerCase()
  return status === 'reviewed'
    || status === 'locked'
    || status === 'approved'
    || status === 'passed'
    || hasText(row.review_target)
    || hasText(row.reviewed_at)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = supabaseAdmin()
  const { data: member, error: memberError } = await admin
    .from('project_members')
    .select('role')
    .eq('project_id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 })
  if (!member) return NextResponse.json({ error: 'not a member' }, { status: 403 })

  const { data: docs, error: documentError } = await admin
    .from('documents')
    .select('id')
    .eq('project_id', id)

  if (documentError) return NextResponse.json({ error: documentError.message }, { status: 500 })

  const documentIds = (docs ?? []).map(doc => doc.id as string).filter(Boolean)
  const segmentRes = await fetchSegmentRowsByDocumentIds<SegmentProgressRow>(admin, documentIds, '*')

  if (segmentRes.error) return NextResponse.json({ error: segmentRes.error.message }, { status: 500 })

  const documentStats: Record<string, { total: number; translated: number; reviewed: number; locked: number }> = {}
  for (const docId of documentIds) {
    documentStats[docId] = { total: 0, translated: 0, reviewed: 0, locked: 0 }
  }

  for (const row of segmentRes.data ?? []) {
    const stats = documentStats[row.document_id] ?? { total: 0, translated: 0, reviewed: 0, locked: 0 }
    stats.total += 1
    if (isTranslated(row)) stats.translated += 1
    if (isReviewed(row)) stats.reviewed += 1
    if (row.status === 'locked') stats.locked += 1
    documentStats[row.document_id] = stats
  }

  const projectProgress = Object.values(documentStats).reduce(
    (acc, stats) => ({
      total: acc.total + stats.total,
      translated: acc.translated + stats.translated,
      reviewed: acc.reviewed + stats.reviewed,
      locked: acc.locked + stats.locked,
    }),
    { total: 0, translated: 0, reviewed: 0, locked: 0 }
  )

  return NextResponse.json({ segments: segmentRes.data ?? [], documentStats, projectProgress })
}
