import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_PAGE_SIZE = 1000
const DEFAULT_DOC_BATCH_SIZE = 50

export async function fetchSegmentRowsByDocumentIds<T>(
  supabaseClient: SupabaseClient,
  documentIds: string[],
  select: string,
  options: { pageSize?: number; documentBatchSize?: number } = {}
): Promise<{ data: T[]; error: PostgrestError | null }> {
  if (documentIds.length === 0) return { data: [], error: null }

  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const documentBatchSize = options.documentBatchSize ?? DEFAULT_DOC_BATCH_SIZE
  const rows: T[] = []

  for (let docStart = 0; docStart < documentIds.length; docStart += documentBatchSize) {
    const docBatch = documentIds.slice(docStart, docStart + documentBatchSize)
    let from = 0

    while (true) {
      const { data, error } = await supabaseClient
        .from('segments')
        .select(select)
        .in('document_id', docBatch)
        .order('document_id', { ascending: true })
        .order('position', { ascending: true })
        .range(from, from + pageSize - 1)

      if (error) return { data: rows, error }

      const page = (data ?? []) as T[]
      rows.push(...page)
      if (page.length < pageSize) break
      from += pageSize
    }
  }

  return { data: rows, error: null }
}
