// GET /api/parallel-translate/results?documentId=xxx
// 返回该文档所有 (segment × provider × model) 的候选译文记录

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const documentId = url.searchParams.get('documentId')
  if (!documentId) return NextResponse.json({ error: '缺少 documentId' }, { status: 400 })

  const admin = supabaseAdmin()
  const { data: doc } = await admin
    .from('documents').select('project_id').eq('id', documentId).maybeSingle()
  if (!doc) return NextResponse.json({ error: '文档不存在' }, { status: 404 })

  const myRole = await getMyRole(client, doc.project_id, user.id)
  if (!myRole) return NextResponse.json({ error: '你不是该项目的成员' }, { status: 403 })

  const { data, error } = await admin
    .from('parallel_translations')
    .select('id, segment_id, provider, model, temperature, prompt, translated_text, status, error_message, updated_at')
    .eq('document_id', documentId)
    .neq('provider', '__config__')
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const results = (data || []).map(row => ({
    ...row,
    model: displayModel(row.model),
  }))
  return NextResponse.json({ results })
}

function displayModel(model: string): string {
  return model.replace(/__run_[a-z0-9]+$/, '')
}
