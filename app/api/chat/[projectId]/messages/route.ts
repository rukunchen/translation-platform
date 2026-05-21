// GET  /api/chat/[projectId]/messages         拉历史消息（按时间正序，最多 200 条）
// POST /api/chat/[projectId]/messages         发新消息（必须是项目成员）
// 聊天按项目/任务统一保存和导出；单个文档页也使用同一个任务聊天。

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole } from '@/lib/permissions'
import crypto from 'crypto'

type ProfileJoin = { name?: string | null; email?: string | null; avatar_url?: string | null }
type MessageRow = {
  id: string
  content: string
  created_at: string
  user_id: string
  attachments?: ChatAttachment[] | null
  profiles?: ProfileJoin | ProfileJoin[] | null
}
type ChatAttachment = {
  name: string
  type: string
  size: number
  path: string
  kind: 'image' | 'file'
  url?: string
}

const BUCKET = 'chat-attachments'
const MAX_FILES = 5
const MAX_FILE_SIZE = 15 * 1024 * 1024

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || 'attachment'
}

async function signAttachments(admin: ReturnType<typeof supabaseAdmin>, attachments: ChatAttachment[]): Promise<ChatAttachment[]> {
  return Promise.all((attachments || []).map(async attachment => {
    if (!attachment.path) return attachment
    const { data } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(attachment.path, 60 * 30)
    return { ...attachment, url: data?.signedUrl }
  }))
}

async function serializeMessage(admin: ReturnType<typeof supabaseAdmin>, m: MessageRow, roleMap: Record<string, string>) {
  const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
  return {
    id: m.id,
    content: m.content,
    created_at: m.created_at,
    user_id: m.user_id,
    attachments: await signAttachments(admin, m.attachments || []),
    name: profile?.name || profile?.email?.split('@')[0] || '匿名',
    email: profile?.email,
    role: roleMap[m.user_id] || 'translator',
  }
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
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200'), 5000)

  const admin = supabaseAdmin()

  const query = admin
    .from('chat_messages')
    .select(`
      id, content, created_at, user_id, attachments,
      profiles:user_id ( name, email, avatar_url )
    `)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit)
  let { data, error } = await query

  if (error && /document_id|attachments|schema cache|column/i.test(error.message)) {
    const fallback = await admin
      .from('chat_messages')
      .select(`
        id, content, created_at, user_id,
        profiles:user_id ( name, email, avatar_url )
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit)
    data = fallback.data as typeof data
    error = fallback.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 同时拉成员角色，用于渲染徽章
  const { data: members } = await admin
    .from('project_members')
    .select('user_id, role')
    .eq('project_id', projectId)

  const roleMap: Record<string, string> = {}
  for (const m of members || []) roleMap[m.user_id] = m.role

  // 反转回时间正序（前端按时间显示）
  const messages = await Promise.all(((data || []) as MessageRow[]).reverse().map(m => serializeMessage(admin, m, roleMap)))

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

  const admin = supabaseAdmin()
  const contentType = req.headers.get('content-type') || ''
  let content = ''
  let documentId: string | null = null
  let files: File[] = []

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    content = String(form.get('content') || '').trim()
    documentId = null
    files = form.getAll('files').filter((v): v is File => v instanceof File)
  } else {
    const body = await req.json().catch(() => ({}))
    content = String(body.content || '').trim()
    documentId = null
  }

  if (files.length > MAX_FILES) return NextResponse.json({ error: `一次最多上传 ${MAX_FILES} 个附件` }, { status: 400 })
  if (files.some(f => f.size > MAX_FILE_SIZE)) return NextResponse.json({ error: '单个附件不能超过 15MB' }, { status: 400 })
  if (!content && files.length === 0) return NextResponse.json({ error: '内容不能为空' }, { status: 400 })
  if (content.length > 4000) return NextResponse.json({ error: '内容过长（最多 4000 字符）' }, { status: 400 })

  const attachments: ChatAttachment[] = []
  for (const file of files) {
    const path = `${projectId}/${documentId || 'project'}/${crypto.randomUUID()}-${safeFileName(file.name)}`
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
    if (uploadError) return NextResponse.json({ error: `附件上传失败：${uploadError.message}` }, { status: 500 })
    attachments.push({
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      path,
      kind: file.type.startsWith('image/') ? 'image' : 'file',
    })
  }

  const insertPayload: Record<string, unknown> = {
    project_id: projectId,
    user_id: user.id,
    content: content || ' ',
    document_id: documentId,
    attachments,
  }

  let { data, error } = await admin
    .from('chat_messages')
    .insert(insertPayload)
    .select('id, content, created_at, user_id, attachments')
    .single()

  if (error && /document_id|attachments|schema cache|column/i.test(error.message)) {
    const fallback = await admin
      .from('chat_messages')
      .insert({
        project_id: projectId,
        user_id: user.id,
        content: content || (attachments.length ? '[附件]' : ''),
      })
      .select('id, content, created_at, user_id')
      .single()
    data = fallback.data as typeof data
    error = fallback.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const signedMessage = {
    ...data,
    attachments: await signAttachments(admin, ((data as MessageRow).attachments || []) as ChatAttachment[]),
  }

  return NextResponse.json({ message: signedMessage })
}
