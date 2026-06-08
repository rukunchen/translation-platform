'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { supabase } from '@/lib/supabase'

type Project = {
  id: string
  name: string
}

type Document = {
  id: string
  title: string
}

type Segment = {
  id: string
  document_id: string
  position: number
  source: string
  target: string | null
  translator_target: string | null
  review_target: string | null
}

type SearchResult = Segment & {
  documentTitle: string
  initialTranslation: string
  reviewedTranslation: string
}

const PAGE_SIZE = 500

function initialTranslationOf(segment: Segment): string {
  return segment.translator_target?.trim() || segment.target?.trim() || ''
}

function reviewedTranslationOf(segment: Segment): string {
  return segment.review_target?.trim() || segment.target?.trim() || ''
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!text) return <span className="text-ink-300">暂无</span>

  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return <>{text}</>

  const normalizedText = text.toLocaleLowerCase()
  const parts: React.ReactNode[] = []
  let cursor = 0
  let matchIndex = normalizedText.indexOf(normalizedQuery)

  while (matchIndex !== -1) {
    if (matchIndex > cursor) parts.push(text.slice(cursor, matchIndex))
    parts.push(
      <mark key={`${matchIndex}-${cursor}`} className="rounded bg-brand-100 px-0.5 text-ink-900">
        {text.slice(matchIndex, matchIndex + normalizedQuery.length)}
      </mark>
    )
    cursor = matchIndex + normalizedQuery.length
    matchIndex = normalizedText.indexOf(normalizedQuery, cursor)
  }

  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}

export default function ProjectSearchPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadSearchData() {
      setLoading(true)
      setError('')

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }

      const { data: member, error: memberError } = await supabase
        .from('project_members')
        .select('role')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!active) return
      if (memberError) {
        setError(memberError.message)
        setLoading(false)
        return
      }
      if (!member) {
        setAccessDenied(true)
        setLoading(false)
        return
      }

      const [projectResponse, documentResponse] = await Promise.all([
        supabase.from('projects').select('id, name').eq('id', projectId).single(),
        supabase.from('documents').select('id, title').eq('project_id', projectId).order('created_at', { ascending: true }),
      ])

      if (!active) return
      if (projectResponse.error || documentResponse.error) {
        setError(projectResponse.error?.message || documentResponse.error?.message || '加载项目失败')
        setLoading(false)
        return
      }

      const documentRows = (documentResponse.data ?? []) as Document[]
      setProject(projectResponse.data as Project)
      setDocuments(documentRows)

      if (documentRows.length === 0) {
        setSegments([])
        setLoading(false)
        return
      }

      const documentIds = documentRows.map(document => document.id)
      const allSegments: Segment[] = []

      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error: segmentError } = await supabase
          .from('segments')
          .select('id, document_id, position, source, target, translator_target, review_target')
          .in('document_id', documentIds)
          .order('document_id', { ascending: true })
          .order('position', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)

        if (!active) return
        if (segmentError) {
          setError(segmentError.message)
          setLoading(false)
          return
        }

        const page = (data ?? []) as Segment[]
        allSegments.push(...page)
        if (page.length < PAGE_SIZE) break
      }

      if (active) {
        setSegments(allSegments)
        setLoading(false)
      }
    }

    void loadSearchData()
    return () => { active = false }
  }, [projectId, router])

  useEffect(() => {
    router.prefetch(`/projects/${projectId}`)
  }, [projectId, router])

  const results = useMemo<SearchResult[]>(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) return []

    const documentTitles = new Map(documents.map(document => [document.id, document.title]))

    return segments.flatMap(segment => {
      const initialTranslation = initialTranslationOf(segment)
      const reviewedTranslation = reviewedTranslationOf(segment)
      const searchable = [segment.source, initialTranslation, reviewedTranslation]
        .join('\n')
        .toLocaleLowerCase()

      if (!searchable.includes(normalizedQuery)) return []
      return [{
        ...segment,
        documentTitle: documentTitles.get(segment.document_id) || '未命名文档',
        initialTranslation,
        reviewedTranslation,
      }]
    })
  }, [documents, query, segments])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="flex items-center gap-3 text-sm text-ink-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          正在加载项目句段...
        </div>
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="rounded-2xl border border-line bg-white p-10 text-center">
          <h1 className="mb-5 font-serif text-2xl text-ink-900">无权访问此项目</h1>
          <Button onClick={() => router.push('/dashboard')}>返回工作台</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar />
      <main
        className="min-w-0 flex-1 overflow-auto"
        style={{ padding: '20px 32px' }}
      >
        <div className="min-h-full overflow-hidden rounded-2xl border border-line bg-white">
          <div
            className="mx-auto w-full max-w-7xl"
            style={{ padding: '56px clamp(40px, 5vw, 80px)' }}
          >
            <PageHeader
              backHref={`/projects/${projectId}`}
              backLabel="返回项目"
              eyebrow="Project Search"
              title="项目搜索"
              description={`在「${project?.name || '当前项目'}」的全部文档中搜索原文、初译和审校译文。`}
              className="mb-12"
            />

            <section className="mb-12 rounded-2xl border border-line bg-gradient-to-br from-surface to-brand-50/40 p-5 shadow-[var(--shadow-card)] sm:p-7">
              <div className="mb-5">
                <p className="text-sm font-medium text-ink-900">搜索项目内容</p>
                <p className="mt-2 text-xs leading-relaxed text-ink-500">输入关键词或完整句子，同时匹配项目中的原文、初译与审校译文。</p>
              </div>
              <div className="relative">
                <svg className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400 sm:left-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
                </svg>
                <input
                  autoFocus
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="输入关键词或句子，搜索整个项目..."
                  className="w-full rounded-xl border-2 border-line bg-white py-3.5 pl-12 pr-20 text-sm text-ink-900 shadow-sm placeholder:text-ink-300 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10 sm:py-4 sm:pl-14 sm:pr-28 sm:text-base"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-xs text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900 sm:right-4 sm:px-3"
                  >
                    清空
                  </button>
                )}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-ink-500">
                <span className="rounded-full border border-line bg-white px-3 py-1.5">{documents.length} 个文档</span>
                <span className="rounded-full border border-line bg-white px-3 py-1.5">{segments.length} 个句段</span>
                {query.trim() && <span className="ml-auto rounded-full bg-ink-900 px-3 py-1.5 font-medium text-white">找到 {results.length} 条结果</span>}
              </div>
            </section>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">
                加载失败：{error}
              </div>
            ) : !query.trim() ? (
              <EmptyState
                title="搜索整个项目"
                description="输入关键词或完整句子，即可同时检索原文、初译和审校译文。"
              />
            ) : results.length === 0 ? (
              <EmptyState
                title="没有找到匹配内容"
                description="请尝试缩短句子、更换关键词，或检查输入内容。"
              />
            ) : (
              <section>
                <div className="mb-6 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-400">Search Results</p>
                    <h2 className="mt-1 font-serif text-xl text-ink-900">匹配结果</h2>
                  </div>
                  <p className="text-xs text-ink-500">共 {results.length} 条</p>
                </div>
                <div className="space-y-4">
                  {results.map((result, index) => (
                    <SearchResultCard
                      key={result.id}
                      index={index}
                      query={query}
                      result={result}
                      onOpen={() => router.push(`/documents/${result.document_id}`)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function SearchResultCard({
  index,
  query,
  result,
  onOpen,
}: {
  index: number
  query: string
  result: SearchResult
  onOpen: () => void
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-card)] transition-all hover:border-brand/30 hover:shadow-[var(--shadow-card-hover)]">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3 sm:px-5">
        <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-ink-900 px-2 font-mono text-[11px] text-white">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-900">{result.documentTitle}</p>
          <p className="mt-0.5 font-mono text-[10px] text-ink-400">句段 {result.position + 1}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onOpen}>打开文档</Button>
      </header>
      <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-3">
        <ResultText label="原文" text={result.source} query={query} tone="source" />
        <ResultText label="初译" text={result.initialTranslation} query={query} tone="draft" />
        <ResultText label="审校译文" text={result.reviewedTranslation} query={query} tone="review" />
      </div>
    </article>
  )
}

function ResultText({
  label,
  text,
  query,
  tone,
}: {
  label: string
  text: string
  query: string
  tone: 'source' | 'draft' | 'review'
}) {
  const toneClass = {
    source: 'border-line bg-canvas-2',
    draft: 'border-brand-200/70 bg-brand-50/55',
    review: 'border-blue-200/70 bg-blue-50/55',
  }[tone]

  return (
    <div className={`min-w-0 rounded-xl border p-4 sm:p-5 ${toneClass}`}>
      <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-400">{label}</p>
      <p className="whitespace-pre-wrap break-words font-serif text-sm leading-7 text-ink-700">
        <HighlightedText text={text} query={query} />
      </p>
    </div>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface px-8 py-20 text-center">
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-canvas text-ink-400">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
        </svg>
      </div>
      <h2 className="font-serif text-xl text-ink-900">{title}</h2>
      <p className="mt-2 text-sm text-ink-500">{description}</p>
    </div>
  )
}
