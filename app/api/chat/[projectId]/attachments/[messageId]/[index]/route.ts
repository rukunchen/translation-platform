import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole } from '@/lib/permissions'

type ChatAttachment = {
  name: string
  type: string
  size: number
  path: string
  kind: 'image' | 'file'
}

const BUCKET = 'chat-attachments'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; messageId: string; index: string }> }
) {
  const { projectId, messageId, index } = await params
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const role = await getMyRole(client, projectId, user.id)
  if (!role) return NextResponse.json({ error: 'not a member' }, { status: 403 })

  const attachmentIndex = Number.parseInt(index, 10)
  if (!Number.isFinite(attachmentIndex) || attachmentIndex < 0) {
    return NextResponse.json({ error: 'invalid attachment index' }, { status: 400 })
  }

  const admin = supabaseAdmin()
  const { data: message, error } = await admin
    .from('chat_messages')
    .select('project_id, attachments')
    .eq('id', messageId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!message) return NextResponse.json({ error: 'message not found' }, { status: 404 })

  const attachments = (message.attachments || []) as ChatAttachment[]
  const attachment = attachments[attachmentIndex]
  if (!attachment?.path) return NextResponse.json({ error: 'attachment not found' }, { status: 404 })

  const { data: signed, error: signedError } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(attachment.path, 60)
  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: signedError?.message || 'failed to create signed url' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}
