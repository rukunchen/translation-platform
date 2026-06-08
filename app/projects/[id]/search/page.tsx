'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Button } from '@/components/ui/Button'
import { MainContent } from '@/components/ui/MainContent'
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
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="min-h-[calc(100vh-40px)] rounded-2xl border border-line bg-white">
          <MainContent size="wide">
            <PageHeader
              backHref={`/projects/${projectId}`}
              backLabel="返回项目"
              eyebrow="Project Search"
              title="项目搜索"
              description={`在「${project?.name || '当前项目'}」的全部文档中搜索原文、初译和审校译文。`}
            />

            <section className="mb-10 rounded-2xl border border-line bg-surface p-6">
              <div className="relative">
                <svg className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
                </svg>
                <input
                  autoFocus
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="输入关键词或句子，搜索整个项目..."
                  className="w-full rounded-xl border-2 border-line bg-white py-4 pl-14 pr-28 text-base text-ink-900 placeholder:text-ink-300 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg px-3 py-1.5 text-xs text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900"
                  >
                    清空
                  </button>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
                <span>搜索范围：{documents.length} 个文档 · {segments.length} 个句段</span>
                {query.trim() && <span>找到 {results.length} 条结果</span>}
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
              <section className="overflow-hidden rounded-2xl border border-line">
                <div className="overflow-x-auto">
                  <div className="grid min-w-[980px] grid-cols-[64px_minmax(180px,0.8fr)_minmax(240px,1.2fr)_minmax(240px,1.2fr)_minmax(240px,1.2fr)_100px] gap-4 border-b border-line bg-canvas-2 px-5 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
                    <div>#</div>
                    <div>文档</div>
                    <div>原文</div>
                    <div>初译</div>
                    <div>审校译文</div>
                    <div className="text-center">操作</div>
                  </div>
                  {results.map((result, index) => (
                    <article
                      key={result.id}
                      className="grid min-w-[980px] grid-cols-[64px_minmax(180px,0.8fr)_minmax(240px,1.2fr)_minmax(240px,1.2fr)_minmax(240px,1.2fr)_100px] gap-4 border-b border-line px-5 py-5 last:border-b-0 hover:bg-brand-50/30"
                    >
                      <div className="font-mono text-xs text-ink-400">{String(index + 1).padStart(2, '0')}</div>
                      <div>
                        <p className="font-medium leading-relaxed text-ink-900">{result.documentTitle}</p>
                        <p className="mt-1 font-mono text-[11px] text-ink-400">句段 {result.position + 1}</p>
                      </div>
                      <ResultText text={result.source} query={query} />
                      <ResultText text={result.initialTranslation} query={query} />
                      <ResultText text={result.reviewedTranslation} query={query} />
                      <div className="flex justify-center">
                        <Button size="sm" variant="secondary" onClick={() => router.push(`/documents/${result.document_id}`)}>
                          打开文档
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </MainContent>
        </div>
      </main>
    </div>
  )
}

function ResultText({ text, query }: { text: string; query: string }) {
  return (
    <p className="whitespace-pre-wrap break-words font-serif text-sm leading-7 text-ink-700">
      <HighlightedText text={text} query={query} />
    </p>
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
