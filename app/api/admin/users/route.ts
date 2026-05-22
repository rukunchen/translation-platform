import { NextRequest, NextResponse } from 'next/server'
import { isPlatformAdmin } from '@/lib/platformAdmin'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function GET(req: NextRequest) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isPlatformAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('profiles')
    .select('id, email, name, avatar_url, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ members: data || [] })
}

export async function POST(req: NextRequest) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isPlatformAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const name = cleanText(body.name)
  const email = cleanText(body.email).toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''

  if (!name) return NextResponse.json({ error: '姓名不能为空' }, { status: 400 })
  if (name.length > 80) return NextResponse.json({ error: '姓名过长（最多 80 字）' }, { status: 400 })
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: '邮箱格式无效' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: '密码至少需要 6 位' }, { status: 400 })
  }

  const admin = supabaseAdmin()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data.user) return NextResponse.json({ error: '创建账号失败' }, { status: 500 })

  return NextResponse.json({
    user: {
      id: data.user.id,
      email: data.user.email || email,
      name,
    },
  })
}
