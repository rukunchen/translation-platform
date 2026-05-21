import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'
import { getMyRole, canManage } from '@/lib/permissions'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { client, user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = supabaseAdmin()
  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 })

  const role = await getMyRole(client, id, user.id)
  if (!canManage(role)) {
    return NextResponse.json({ error: '只有项目经理可以删除项目' }, { status: 403 })
  }

  const { error } = await admin.from('projects').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
