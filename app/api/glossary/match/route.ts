// POST /api/glossary/match
// 扫描项目内所有 segments，给每条术语打匹配标记
//   matched                 — 原文术语命中 source，且译文术语命中 target
//   possibly_inconsistent   — 原文术语命中 source，但译文术语未在 target 中找到
//   not_found               — 原文术语未在 source 出现
// 大小写不敏感；子串包含

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole } from '@/lib/permissions'

type Term = {
  id: string
  source_term: string
  translated_term: string
  definition?: string | null
  note?: string | null
  category?: string | null
}

type MatchStatus = 'matched' | 'possibly_inconsistent' | 'not_found'

const GLOSSARY_META_PREFIX = '__GLOSSARY_META_V1__\n'

function parseRevisionTerm(term: Pick<Term, 'definition' | 'note'>): string {
  const raw = term.definition || term.note || ''
  if (!raw.startsWith(GLOSSARY_META_PREFIX)) return ''
  try {
    const meta = JSON.parse(raw.slice(GLOSSARY_META_PREFIX.length)) as { revision_term?: unknown }
    return String(meta.revision_term ?? '').trim()
  } catch {
    return ''
  }
}

function preferredTargetTerm(term: Term): string {
  return parseRevisionTerm(term) || String(term.translated_term || '').trim()
}

export async function POST(req: NextRequest) {
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { projectId } = await req.json().catch(() => ({}))
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const role = await getMyRole(client, projectId, user.id)
  if (!role) return NextResponse.json({ error: 'not a member' }, { status: 403 })

  const admin = supabaseAdmin()

  // 拉所有术语
  const { data: terms, error: termErr } = await admin
    .from('glossary_terms')
    .select('id, source_term, translated_term, definition, note, category')
    .eq('project_id', projectId)
  if (termErr) return NextResponse.json({ error: termErr.message }, { status: 500 })

  // 拉项目下所有文档 → 所有句段
  const { data: docs } = await admin
    .from('documents')
    .select('id')
    .eq('project_id', projectId)
  const docIds = (docs ?? []).map(d => d.id as string)

  let allSource = ''
  let allTarget = ''
  let segmentRows: { id: string; document_id: string; source: string; target: string }[] = []

  if (docIds.length > 0) {
    const { data: segs } = await admin
      .from('segments')
      .select('id, document_id, source, target')
      .in('document_id', docIds)
    segmentRows = (segs ?? []) as typeof segmentRows
    allSource = segmentRows.map(s => s.source || '').join('\n').toLowerCase()
    allTarget = segmentRows.map(s => s.target || '').join('\n').toLowerCase()
  }

  const summary = { matched: 0, possibly_inconsistent: 0, not_found: 0 }
  const occurrences: Record<string, string[]> = {}

  await Promise.all(((terms ?? []) as Term[]).map(async t => {
    const src = (t.source_term || '').trim().toLowerCase()
    const tgt = preferredTargetTerm(t).toLowerCase()
    if (!src) return

    const inSource = src.length > 0 && allSource.includes(src)
    const inTarget = tgt.length > 0 && allTarget.includes(tgt)
    let status: MatchStatus
    if (!inSource) status = 'not_found'
    else if (inTarget) status = 'matched'
    else status = 'possibly_inconsistent'

    summary[status]++

    // 收集 segment 命中（只看 source 命中的，便于"点击查看"）
    if (inSource) {
      occurrences[t.id] = segmentRows
        .filter(s => (s.source || '').toLowerCase().includes(src))
        .map(s => s.id)
    }

    await admin
      .from('glossary_terms')
      .update({ match_status: status })
      .eq('id', t.id)
  }))

  return NextResponse.json({
    total: (terms ?? []).length,
    summary,
    occurrences,
  })
}
