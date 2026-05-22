import { NextRequest, NextResponse } from 'next/server'
import { isPlatformAdmin } from '@/lib/platformAdmin'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isPlatformAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: '成员 ID 无效' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const name = cleanText(body.name)
  if (!name) return NextResponse.json({ error: '姓名不能为空' }, { status: 400 })
  if (name.length > 80) return NextResponse.json({ error: '姓名过长（最多 80 字）' }, { status: 400 })

  const admin = supabaseAdmin()
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('id', id)
    .maybeSingle()

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })
  if (!profile) return NextResponse.json({ error: '成员不存在' }, { status: 404 })

  const { data: authData, error: authReadError } = await admin.auth.admin.getUserById(id)
  if (authReadError) return NextResponse.json({ error: authReadError.message }, { status: 400 })
  if (!authData.user) return NextResponse.json({ error: '成员账号不存在' }, { status: 404 })

  const { error: authUpdateError } = await admin.auth.admin.updateUserById(id, {
    user_metadata: {
      ...authData.user.user_metadata,
      name,
    },
  })
  if (authUpdateError) return NextResponse.json({ error: authUpdateError.message }, { status: 400 })

  const { data: member, error: updateError } = await admin
    .from('profiles')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, email, name, avatar_url, created_at, updated_at')
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ member })
}
