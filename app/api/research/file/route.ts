import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

const BUCKET = 'research-pdfs'

export async function GET(req: NextRequest) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const itemId = new URL(req.url).searchParams.get('itemId')
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 })

  const admin = supabaseAdmin()
  const { data: item, error } = await admin
    .from('research_library_items')
    .select('id, user_id, file_url')
    .eq('id', itemId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!item?.file_url) return NextResponse.json({ error: 'PDF 不存在' }, { status: 404 })

  const { data, error: signedError } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(item.file_url, 60 * 30)
  if (signedError || !data?.signedUrl) {
    return NextResponse.json({ error: signedError?.message || '无法打开 PDF' }, { status: 500 })
  }
  return NextResponse.json({ url: data.signedUrl })
}
