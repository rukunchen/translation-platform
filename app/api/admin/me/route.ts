import { NextRequest, NextResponse } from 'next/server'
import { getPlatformAdmin } from '@/lib/platformAdmin'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

export async function GET(req: NextRequest) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = supabaseAdmin()
  const platformAdmin = await getPlatformAdmin(user, admin)

  return NextResponse.json({
    isAdmin: Boolean(platformAdmin),
    role: platformAdmin?.role ?? null,
  })
}
