import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { isPlatformAdmin } from '@/lib/platformAdmin'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

const ADMIN_EMAIL = 'rukunchen@hotmail.com'
const READING_COLLECTION_SOURCE_TYPE = 'reading_collection'
const ARTICLE_SELECT = 'id,user_id,title,source,genre,source_type,clean_text,structured_blocks,created_at,updated_at'

type ReadingArticleRow = {
  id: string
  user_id: string
  title: string | null
  source: string | null
  genre: string | null
  source_type: string | null
  clean_text: string | null
  structured_blocks: unknown
  created_at: string
  updated_at: string
}

type PublicUser = {
  id: string
  email: string | null
  name: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function rowMeta(row: ReadingArticleRow): Record<string, unknown> {
  return isRecord(row.structured_blocks) ? row.structured_blocks : {}
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function audienceIds(row: ReadingArticleRow): string[] {
  const value = rowMeta(row).publicAudienceUserIds
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item)) : []
}

function cleanAudienceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item))))
}

async function canManageReadingPublicCollections(user: User, admin: SupabaseClient): Promise<boolean> {
  return user.email?.toLowerCase() === ADMIN_EMAIL && await isPlatformAdmin(user, admin)
}

function collectionTitle(row: ReadingArticleRow): string {
  return stringValue(row.title) || stringValue(row.source) || '未命名合集'
}

function publicCollectionMeta(origin: ReadingArticleRow) {
  const meta = rowMeta(origin)
  return {
    description: stringValue(meta.description),
    coverImage: stringValue(meta.coverImage),
    publicManaged: true,
    publicOriginId: origin.id,
    publicOwnerId: origin.user_id,
  }
}

function publicArticleMeta(origin: ReadingArticleRow, collection: ReadingArticleRow) {
  return {
    ...rowMeta(origin),
    publicManaged: true,
    publicOriginId: origin.id,
    publicCollectionOriginId: collection.id,
    publicOwnerId: origin.user_id,
  }
}

async function removeSharedCollectionForUser(
  admin: SupabaseClient,
  targetUserId: string,
  originCollectionId: string,
) {
  const articleDelete = await admin
    .from('reading_articles')
    .delete()
    .eq('user_id', targetUserId)
    .contains('structured_blocks', { publicCollectionOriginId: originCollectionId })

  if (articleDelete.error) throw new Error(articleDelete.error.message)

  const collectionDelete = await admin
    .from('reading_articles')
    .delete()
    .eq('user_id', targetUserId)
    .eq('source_type', READING_COLLECTION_SOURCE_TYPE)
    .contains('structured_blocks', { publicOriginId: originCollectionId })

  if (collectionDelete.error) throw new Error(collectionDelete.error.message)
}

async function syncSharedCollectionToUser(
  admin: SupabaseClient,
  targetUserId: string,
  originCollection: ReadingArticleRow,
): Promise<number> {
  if (originCollection.user_id === targetUserId) return 0

  const title = collectionTitle(originCollection)
  const { data: originArticles, error: originArticlesError } = await admin
    .from('reading_articles')
    .select(ARTICLE_SELECT)
    .eq('user_id', originCollection.user_id)
    .eq('source', title)
    .neq('source_type', READING_COLLECTION_SOURCE_TYPE)
    .order('created_at', { ascending: true })

  if (originArticlesError) throw new Error(originArticlesError.message)

  const { data: existingCollections, error: existingCollectionError } = await admin
    .from('reading_articles')
    .select(ARTICLE_SELECT)
    .eq('user_id', targetUserId)
    .eq('source_type', READING_COLLECTION_SOURCE_TYPE)
    .contains('structured_blocks', { publicOriginId: originCollection.id })
    .limit(1)

  if (existingCollectionError) throw new Error(existingCollectionError.message)

  const collectionPayload = {
    user_id: targetUserId,
    title,
    source: title,
    genre: originCollection.genre || '其他',
    source_type: READING_COLLECTION_SOURCE_TYPE,
    clean_text: '',
    structured_blocks: publicCollectionMeta(originCollection),
  }
  const existingCollection = ((existingCollections || []) as ReadingArticleRow[])[0]
  if (existingCollection) {
    const { error } = await admin
      .from('reading_articles')
      .update(collectionPayload)
      .eq('id', existingCollection.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await admin.from('reading_articles').insert(collectionPayload)
    if (error) throw new Error(error.message)
  }

  const { data: existingArticleCopies, error: existingArticleCopiesError } = await admin
    .from('reading_articles')
    .select(ARTICLE_SELECT)
    .eq('user_id', targetUserId)
    .contains('structured_blocks', { publicCollectionOriginId: originCollection.id })

  if (existingArticleCopiesError) throw new Error(existingArticleCopiesError.message)

  const existingByOrigin = new Map(
    ((existingArticleCopies || []) as ReadingArticleRow[]).map(row => [stringValue(rowMeta(row).publicOriginId), row]),
  )
  const originIds = new Set<string>()
  let changed = 1

  for (const originArticle of (originArticles || []) as ReadingArticleRow[]) {
    originIds.add(originArticle.id)
    const articlePayload = {
      user_id: targetUserId,
      title: originArticle.title,
      source: title,
      genre: originArticle.genre || originCollection.genre || '其他',
      source_type: originArticle.source_type || 'plain_text',
      clean_text: originArticle.clean_text || '',
      structured_blocks: publicArticleMeta(originArticle, originCollection),
    }
    const existingCopy = existingByOrigin.get(originArticle.id)
    if (existingCopy) {
      const { error } = await admin
        .from('reading_articles')
        .update(articlePayload)
        .eq('id', existingCopy.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await admin.from('reading_articles').insert(articlePayload)
      if (error) throw new Error(error.message)
    }
    changed += 1
  }

  const staleIds = ((existingArticleCopies || []) as ReadingArticleRow[])
    .filter(row => {
      const originId = stringValue(rowMeta(row).publicOriginId)
      return originId && !originIds.has(originId)
    })
    .map(row => row.id)

  if (staleIds.length > 0) {
    const { error } = await admin.from('reading_articles').delete().in('id', staleIds)
    if (error) throw new Error(error.message)
    changed += staleIds.length
  }

  return changed
}

async function syncSharedCollectionsForUser(admin: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await admin
    .from('reading_articles')
    .select(ARTICLE_SELECT)
    .eq('source_type', READING_COLLECTION_SOURCE_TYPE)

  if (error) throw new Error(error.message)

  const allCollections = (data || []) as ReadingArticleRow[]
  const sharedOrigins = allCollections.filter(row => row.user_id !== userId && audienceIds(row).includes(userId))
  const activeOriginIds = new Set(sharedOrigins.map(row => row.id))
  let changed = 0

  for (const collection of sharedOrigins) {
    changed += await syncSharedCollectionToUser(admin, userId, collection)
  }

  const userManagedCopies = allCollections.filter(row => {
    const meta = rowMeta(row)
    return row.user_id === userId && meta.publicManaged === true && stringValue(meta.publicOriginId)
  })

  for (const copy of userManagedCopies) {
    const originId = stringValue(rowMeta(copy).publicOriginId)
    if (originId && !activeOriginIds.has(originId)) {
      await removeSharedCollectionForUser(admin, userId, originId)
      changed += 1
    }
  }

  return changed
}

async function getAdminPayload(admin: SupabaseClient, user: User) {
  const [profilesResult, collectionsResult] = await Promise.all([
    admin
      .from('profiles')
      .select('id, email, name')
      .neq('id', user.id)
      .order('name', { ascending: true }),
    admin
      .from('reading_articles')
      .select(ARTICLE_SELECT)
      .eq('user_id', user.id)
      .eq('source_type', READING_COLLECTION_SOURCE_TYPE),
  ])

  if (profilesResult.error) throw new Error(profilesResult.error.message)
  if (collectionsResult.error) throw new Error(collectionsResult.error.message)

  const shares = Object.fromEntries(
    ((collectionsResult.data || []) as ReadingArticleRow[]).map(row => [row.id, audienceIds(row)]),
  )

  return {
    users: (profilesResult.data || []) as PublicUser[],
    shares,
  }
}

export async function GET(req: NextRequest) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = supabaseAdmin()
  const canManagePublicCollections = await canManageReadingPublicCollections(user, admin)

  try {
    if (canManagePublicCollections) {
      const payload = await getAdminPayload(admin, user)
      return NextResponse.json({
        canManagePublicCollections,
        syncedCollections: 0,
        ...payload,
      })
    }

    const syncedCollections = await syncSharedCollectionsForUser(admin, user.id)
    return NextResponse.json({
      canManagePublicCollections: false,
      syncedCollections,
      users: [],
      shares: {},
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'sync failed' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = supabaseAdmin()
  if (!(await canManageReadingPublicCollections(user, admin))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const collectionId = stringValue((body as { collectionId?: unknown }).collectionId)
  const requestedAudienceIds = cleanAudienceIds((body as { audienceUserIds?: unknown }).audienceUserIds)
  if (!collectionId) return NextResponse.json({ error: 'collectionId is required' }, { status: 400 })

  try {
    const { data: collection, error: collectionError } = await admin
      .from('reading_articles')
      .select(ARTICLE_SELECT)
      .eq('id', collectionId)
      .eq('user_id', user.id)
      .eq('source_type', READING_COLLECTION_SOURCE_TYPE)
      .maybeSingle()

    if (collectionError) throw new Error(collectionError.message)
    if (!collection) return NextResponse.json({ error: 'collection not found' }, { status: 404 })

    const validUsersResult = requestedAudienceIds.length
      ? await admin.from('profiles').select('id').in('id', requestedAudienceIds)
      : { data: [], error: null }

    if (validUsersResult.error) throw new Error(validUsersResult.error.message)

    const validAudienceIds = ((validUsersResult.data || []) as Array<{ id: string }>).map(row => row.id)
    const previousAudienceIds = audienceIds(collection as ReadingArticleRow)
    const nextMeta = {
      ...rowMeta(collection as ReadingArticleRow),
      publicAudienceUserIds: validAudienceIds,
    }

    const { data: updatedCollection, error: updateError } = await admin
      .from('reading_articles')
      .update({ structured_blocks: nextMeta })
      .eq('id', collectionId)
      .eq('user_id', user.id)
      .select(ARTICLE_SELECT)
      .single()

    if (updateError) throw new Error(updateError.message)

    const nextSet = new Set(validAudienceIds)
    const removedAudienceIds = previousAudienceIds.filter(id => !nextSet.has(id))
    for (const removedUserId of removedAudienceIds) {
      await removeSharedCollectionForUser(admin, removedUserId, collectionId)
    }

    for (const targetUserId of validAudienceIds) {
      await syncSharedCollectionToUser(admin, targetUserId, updatedCollection as ReadingArticleRow)
    }

    const payload = await getAdminPayload(admin, user)
    return NextResponse.json({
      canManagePublicCollections: true,
      syncedCollections: validAudienceIds.length,
      ...payload,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'share failed' }, { status: 500 })
  }
}
