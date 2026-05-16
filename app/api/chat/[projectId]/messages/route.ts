// GET  /api/chat/[projectId]/messages         拉历史消息（按时间正序，最多 200 条）
// POST /api/chat/[projectId]/messages         发新消息（必须是项目成员）

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole } from '@/lib/permissions'

type ProfileJoin = { name?: string | null; email?: string | null; avatar_url?: string | null }
type MessageRow = {
  id: string
  content: string
  created_at: string
  user_id: string
  profiles?: ProfileJoin | ProfileJoin[] | null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const role = await getMyRole(client, projectId, user.id)
  if (!role) return NextResponse.json({ error: 'not a member' }, { status: 403 })

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200'), 500)

  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('chat_messages')
    .select(`
      id, content, created_at, user_id,
      profiles:user_id ( name, email, avatar_url )
    `)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 同时拉成员角色，用于渲染徽章
  const { data: members } = await admin
    .from('project_members')
    .select('user_id, role')
    .eq('project_id', projectId)

  const roleMap: Record<string, string> = {}
  for (const m of members || []) roleMap[m.user_id] = m.role

  // 反转回时间正序（前端按时间显示）
  const messages = ((data || []) as MessageRow[]).reverse().map(m => {
    const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
    return {
    id: m.id,
    content: m.content,
    created_at: m.created_at,
    user_id: m.user_id,
    name: profile?.name || profile?.email?.split('@')[0] || '匿名',
    email: profile?.email,
    role: roleMap[m.user_id] || 'translator',
    }
  })

  return NextResponse.json({ messages })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const role = await getMyRole(client, projectId, user.id)
  if (!role) return NextResponse.json({ error: 'not a member' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const content = String(body.content || '').trim()
  if (!content) return NextResponse.json({ error: '内容不能为空' }, { status: 400 })
  if (content.length > 4000) return NextResponse.json({ error: '内容过长（最多 4000 字符）' }, { status: 400 })

  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('chat_messages')
    .insert({
      project_id: projectId,
      user_id: user.id,
      content,
    })
    .select('id, content, created_at, user_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ message: data })
}
