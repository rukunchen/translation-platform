import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

const PPT_FALLBACK_PREFIX = '__PPT_SLIDE_TRANSLATION_META__'

export async function POST(req: NextRequest) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const name = cleanText(body.name)
  const description = cleanText(body.description)
  const type = cleanText(body.type)
  const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
    ? body.metadata
    : null

  if (!name) return NextResponse.json({ error: '项目名称不能为空' }, { status: 400 })
  if (name.length > 120) return NextResponse.json({ error: '项目名称过长（最多 120 字）' }, { status: 400 })
  if (type && type !== 'ppt_slide_translation') {
    return NextResponse.json({ error: '不支持的项目类型' }, { status: 400 })
  }

  const admin = supabaseAdmin()
  const insertPayload: Record<string, unknown> = {
    name,
    description: description || null,
    created_by: user.id,
  }
  if (type) insertPayload.type = type
  if (metadata) insertPayload.metadata = metadata

  const { data: project, error } = await admin
    .from('projects')
    .insert(insertPayload)
    .select('*')
    .single()

  if (error || !project) {
    const message = error?.message || '创建项目失败'
    if (type === 'ppt_slide_translation' && /type|metadata|schema cache|column/i.test(message)) {
      const fallbackDescription = [
        `${PPT_FALLBACK_PREFIX}${JSON.stringify(metadata || {})}`,
        description,
      ].filter(Boolean).join('\n')
      const fallback = await admin
        .from('projects')
        .insert({
          name,
          description: fallbackDescription || null,
          created_by: user.id,
        })
        .select('*')
        .single()
      if (fallback.error || !fallback.data) {
        return NextResponse.json({
          error: `数据库缺少 PPT 项目字段，且兼容创建也失败。请先在 Supabase 执行 supabase/21_ppt_slide_translation_metadata.sql。原始错误：${fallback.error?.message || message}`,
        }, { status: 500 })
      }
      const memberErr = await admin
        .from('project_members')
        .upsert({
          project_id: fallback.data.id,
          user_id: user.id,
          role: 'manager',
          added_by: user.id,
        }, { onConflict: 'project_id,user_id' })
      if (memberErr.error) {
        await admin.from('projects').delete().eq('id', fallback.data.id)
        return NextResponse.json({ error: memberErr.error.message }, { status: 500 })
      }
      return NextResponse.json({ project: fallback.data, warning: 'created_without_ppt_schema' })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const { error: memberErr } = await admin
    .from('project_members')
    .upsert({
      project_id: project.id,
      user_id: user.id,
      role: 'manager',
      added_by: user.id,
    }, { onConflict: 'project_id,user_id' })

  if (memberErr) {
    await admin.from('projects').delete().eq('id', project.id)
    return NextResponse.json({ error: memberErr.message }, { status: 500 })
  }

  return NextResponse.json({ project })
}
