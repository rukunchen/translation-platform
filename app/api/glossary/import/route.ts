// POST /api/glossary/import
// 批量导入术语；与同项目下已有 source_term（不区分大小写）重复的跳过

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole } from '@/lib/permissions'

type Incoming = {
  source_term: string
  translated_term: string
  category?: string
  note?: string
  status?: string
}

export async function POST(req: NextRequest) {
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { projectId, terms } = await req.json().catch(() => ({}))
  if (!projectId || !Array.isArray(terms)) {
    return NextResponse.json({ error: 'projectId 和 terms 是必须的' }, { status: 400 })
  }

  const role = await getMyRole(client, projectId, user.id)
  if (!role) return NextResponse.json({ error: 'not a member' }, { status: 403 })

  // 规范化输入
  const incoming: Incoming[] = (terms as unknown[])
    .map(t => t as Record<string, unknown>)
    .map(t => ({
      source_term: String(t.source_term ?? '').trim(),
      translated_term: String(t.translated_term ?? '').trim(),
      category: String(t.category ?? '').trim(),
      note: String(t.note ?? '').trim(),
      status: String(t.status ?? 'active').trim() || 'active',
    }))
    .filter(t => t.source_term && t.translated_term)

  if (incoming.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: 0, total: 0 })
  }

  const admin = supabaseAdmin()
  // 拉同项目已存在的 source_term，比对去重
  const { data: existing } = await admin
    .from('glossary_terms')
    .select('source_term')
    .eq('project_id', projectId)
  const existingLower = new Set(
    (existing ?? []).map(r => String(r.source_term).toLowerCase())
  )

  const fresh: Incoming[] = []
  const localSeen = new Set<string>()
  let skipped = 0
  for (const t of incoming) {
    const key = t.source_term.toLowerCase()
    if (existingLower.has(key) || localSeen.has(key)) { skipped++; continue }
    localSeen.add(key)
    fresh.push(t)
  }

  if (fresh.length === 0) {
    return NextResponse.json({ inserted: 0, skipped, total: incoming.length })
  }

  const rows = fresh.map(t => ({
    project_id: projectId,
    created_by: user.id,
    source_term: t.source_term,
    translated_term: t.translated_term,
    category: t.category ?? '',
    note: t.note ?? '',
    status: t.status ?? 'active',
    match_status: 'unknown',
    is_questionable: false,
  }))

  const { error } = await admin.from('glossary_terms').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    inserted: rows.length,
    skipped,
    total: incoming.length,
  })
}
