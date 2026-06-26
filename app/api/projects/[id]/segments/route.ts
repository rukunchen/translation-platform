import { NextRequest, NextResponse } from 'next/server'
import { fetchSegmentRowsByDocumentIds } from '@/lib/fetchSegmentRows'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

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
  const segmentRes = await fetchSegmentRowsByDocumentIds(admin, documentIds, '*')
  if (segmentRes.error) return NextResponse.json({ error: segmentRes.error.message }, { status: 500 })

  return NextResponse.json({ segments: segmentRes.data ?? [] })
}
