import { NextRequest, NextResponse } from 'next/server'
import { isPlatformAdmin } from '@/lib/platformAdmin'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

type DocumentRow = {
  id: string
  title: string
  project_id: string
  created_at: string
  updated_at: string | null
}

type ProjectRow = {
  id: string
  name: string
}

export async function GET(req: NextRequest) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const admin = supabaseAdmin()
  if (!(await isPlatformAdmin(user, admin))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { data: documentData, error: documentError } = await admin
    .from('documents')
    .select('id, title, project_id, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(12)

  if (documentError) return NextResponse.json({ error: documentError.message }, { status: 500 })

  const documentRows = (documentData || []) as DocumentRow[]
  const projectIds = Array.from(new Set(documentRows.map(document => document.project_id)))
  const { data: projectData, error: projectError } = projectIds.length > 0
    ? await admin.from('projects').select('id, name').in('id', projectIds)
    : { data: [] as ProjectRow[], error: null }

  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 })

  const projectNames = new Map(
    ((projectData || []) as ProjectRow[]).map(project => [project.id, project.name])
  )

  return NextResponse.json({
    documents: documentRows.map(document => ({
      id: document.id,
      title: document.title,
      projectName: projectNames.get(document.project_id) || '未知项目',
      createdAt: document.created_at,
      updatedAt: document.updated_at || document.created_at,
    })),
  })
}
