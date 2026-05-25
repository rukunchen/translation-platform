import { NextRequest, NextResponse } from 'next/server'
import { logAdminAudit } from '@/lib/adminAudit'
import { isPlatformAdmin } from '@/lib/platformAdmin'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isDisabledUntil(value: string | null | undefined): boolean {
  return Boolean(value && new Date(value).getTime() > Date.now())
}

export async function GET(req: NextRequest) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const admin = supabaseAdmin()
  if (!(await isPlatformAdmin(user, admin))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { data, error } = await admin
    .from('profiles')
    .select('id, email, name, avatar_url, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const [adminResult, authResult] = await Promise.all([
    admin
      .from('platform_admins')
      .select('user_id, role')
      .eq('is_active', true),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ])

  if (adminResult.error) return NextResponse.json({ error: adminResult.error.message }, { status: 500 })
  if (authResult.error) return NextResponse.json({ error: authResult.error.message }, { status: 500 })

  const adminRoles = new Map((adminResult.data || []).map(row => [row.user_id as string, row.role as string]))
  const authUsers = new Map((authResult.data.users || []).map(authUser => [authUser.id, authUser]))
  return NextResponse.json({
    members: (data || []).map(member => {
      const authUser = authUsers.get(member.id)
      return {
        ...member,
        isPlatformAdmin: adminRoles.has(member.id),
        platformAdminRole: adminRoles.get(member.id) || null,
        isDisabled: isDisabledUntil(authUser?.banned_until),
        bannedUntil: authUser?.banned_until || null,
        authExists: Boolean(authUser),
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const admin = supabaseAdmin()
  if (!(await isPlatformAdmin(user, admin))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

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

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data.user) return NextResponse.json({ error: '创建账号失败' }, { status: 500 })

  await logAdminAudit(admin, {
    actor: user,
    action: 'admin.user.create',
    targetType: 'user',
    targetId: data.user.id,
    targetLabel: name || email,
    metadata: {
      email,
      name,
    },
  })

  return NextResponse.json({
    user: {
      id: data.user.id,
      email: data.user.email || email,
      name,
    },
  })
}
