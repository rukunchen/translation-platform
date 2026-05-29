import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, supabaseFromRequest } from '@/lib/supabaseServer'

type SeedLiteratureItem = {
  id: string
  title: string
  authors: string | null
  year: number | null
  source: string | null
  region: string | null
  field: string | null
  method_summary: string | null
  conclusion_summary: string | null
  abstract: string | null
  doi: string | null
  url: string | null
  tags: string[] | null
  research_question: string | null
  limitation_summary: string | null
  significance_summary: string | null
  literature_review_sentence: string | null
  ai_card_generated_at: string | null
  ai_card_model: string | null
}

const SEED_SELECT = [
  'id',
  'title',
  'authors',
  'year',
  'source',
  'region',
  'field',
  'method_summary',
  'conclusion_summary',
  'abstract',
  'doi',
  'url',
  'tags',
  'research_question',
  'limitation_summary',
  'significance_summary',
  'literature_review_sentence',
  'ai_card_generated_at',
  'ai_card_model',
].join(',')

function copySeedItem(userId: string, item: SeedLiteratureItem) {
  return {
    user_id: userId,
    seed_source_id: item.id,
    title: item.title,
    authors: item.authors,
    year: item.year,
    source: item.source,
    region: item.region,
    field: item.field,
    method_summary: item.method_summary,
    conclusion_summary: item.conclusion_summary,
    abstract: item.abstract,
    doi: item.doi,
    url: item.url,
    tags: item.tags || [],
    research_question: item.research_question,
    limitation_summary: item.limitation_summary,
    significance_summary: item.significance_summary,
    literature_review_sentence: item.literature_review_sentence,
    ai_card_generated_at: item.ai_card_generated_at,
    ai_card_model: item.ai_card_model,
  }
}

export async function POST(req: NextRequest) {
  const { user } = await supabaseFromRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = supabaseAdmin()
  const { data: existingStatus, error: statusError } = await admin
    .from('frontier_literature_seed_status')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (statusError) return NextResponse.json({ error: statusError.message }, { status: 500 })
  if (existingStatus) return NextResponse.json({ seeded: false, inserted: 0 })

  const { data: seedItems, error: seedError } = await admin
    .from('frontier_literature_items')
    .select(SEED_SELECT)
    .is('user_id', null)
    .is('seed_source_id', null)
    .order('year', { ascending: false })
    .order('created_at', { ascending: false })

  if (seedError) return NextResponse.json({ error: seedError.message }, { status: 500 })

  const items = (seedItems || []) as unknown as SeedLiteratureItem[]
  if (items.length > 0) {
    const { error: insertError } = await admin
      .from('frontier_literature_items')
      .upsert(items.map(item => copySeedItem(user.id, item)), {
        onConflict: 'user_id,seed_source_id',
        ignoreDuplicates: true,
      })

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const { error: markError } = await admin
    .from('frontier_literature_seed_status')
    .upsert({ user_id: user.id }, { onConflict: 'user_id' })

  if (markError) return NextResponse.json({ error: markError.message }, { status: 500 })

  return NextResponse.json({ seeded: true, inserted: items.length })
}
