import { NextRequest, NextResponse } from 'next/server'
import { isPlatformAdmin } from '@/lib/platformAdmin'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

type ProjectRow = {
  id: string
  name: string
  description: string | null
  created_by: string | null
  created_at: string
}

type MemberRow = {
  project_id: string
  role: string
}

type DocumentRow = {
  project_id: string
  created_at: string
  updated_at: string | null
}

type CreatorRow = {
  id: string
  email: string | null
  name: string | null
}

export async function GET(req: NextRequest) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isPlatformAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const admin = supabaseAdmin()
  const { data: projectData, error: projectError } = await admin
    .from('projects')
    .select('id, name, description, created_by, created_at')
    .order('created_at', { ascending: false })

  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 })

  const projectRows = (projectData || []) as ProjectRow[]
  const projectIds = projectRows.map(project => project.id)
  const creatorIds = Array.from(new Set(projectRows.map(project => project.created_by).filter(Boolean))) as string[]

  if (projectIds.length === 0) return NextResponse.json({ projects: [] })

  const [memberResult, documentResult, creatorResult] = await Promise.all([
    admin.from('project_members').select('project_id, role').in('project_id', projectIds),
    admin.from('documents').select('project_id, created_at, updated_at').in('project_id', projectIds),
    creatorIds.length > 0
      ? admin.from('profiles').select('id, email, name').in('id', creatorIds)
      : Promise.resolve({ data: [] as CreatorRow[], error: null }),
  ])

  const queryError = [memberResult.error, documentResult.error, creatorResult.error].find(Boolean)
  if (queryError) return NextResponse.json({ error: queryError.message }, { status: 500 })

  const membersByProject = new Map<string, { members: number; managers: number }>()
  for (const member of (memberResult.data || []) as MemberRow[]) {
    const totals = membersByProject.get(member.project_id) || { members: 0, managers: 0 }
    totals.members += 1
    if (member.role === 'manager') totals.managers += 1
    membersByProject.set(member.project_id, totals)
  }

  const documentsByProject = new Map<string, { documents: number; latestAt: string | null }>()
  for (const document of (documentResult.data || []) as DocumentRow[]) {
    const totals = documentsByProject.get(document.project_id) || { documents: 0, latestAt: null }
    const documentActivityAt = document.updated_at || document.created_at
    totals.documents += 1
    if (!totals.latestAt || documentActivityAt > totals.latestAt) totals.latestAt = documentActivityAt
    documentsByProject.set(document.project_id, totals)
  }

  const creatorsById = new Map(
    ((creatorResult.data || []) as CreatorRow[]).map(creator => [creator.id, creator])
  )

  const projects = projectRows.map(project => {
    const memberTotals = membersByProject.get(project.id) || { members: 0, managers: 0 }
    const documentTotals = documentsByProject.get(project.id) || { documents: 0, latestAt: null }
    const creator = project.created_by ? creatorsById.get(project.created_by) : null
    const latestActivityAt = latestTimestamp(project.created_at, documentTotals.latestAt)

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      creator: creator ? { email: creator.email, name: creator.name } : null,
      createdAt: project.created_at,
      latestActivityAt,
      memberCount: memberTotals.members,
      managerCount: memberTotals.managers,
      documentCount: documentTotals.documents,
    }
  }).sort((a, b) => (b.latestActivityAt || b.createdAt).localeCompare(a.latestActivityAt || a.createdAt))

  return NextResponse.json({ projects })
}

function latestTimestamp(...values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().pop() || null
}
