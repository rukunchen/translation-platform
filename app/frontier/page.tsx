'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { MainContent } from '@/components/ui/MainContent'
import { PageHeader } from '@/components/ui/PageHeader'
import { cn } from '@/components/ui/cn'
import { apiJSON } from '@/lib/apiFetch'
import { supabase } from '@/lib/supabase'

type FrontierRegion = '国内' | '国外'
type FrontierField =
  | '翻译'
  | '翻译科技'
  | '语料库'
  | '人工智能'
  | '心理学'
  | '区域国别研究'
  | '语言学'
  | '教育学'
  | '传播学'
  | '文学文化'
  | '数字人文'
  | '其他'

type FrontierPaper = {
  id: string
  region: FrontierRegion
  field: FrontierField
  title: string
  authors: string
  year: number | null
  source: string
  method: string
  finding: string
  abstract: string
  doi: string
  link: string
  keywords: string[]
  detail: string
  researchQuestion: string
  limitationSummary: string
  significanceSummary: string
  literatureReviewSentence: string
  aiCardGeneratedAt: string
  aiCardModel: string
}

type FrontierLiteratureRow = {
  id: string
  title: string
  authors: string | null
  year: number | null
  source: string | null
  region: FrontierRegion | null
  field: FrontierField | null
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
  created_at: string | null
}

type FrontierFormState = {
  title: string
  authors: string
  year: string
  source: string
  region: FrontierRegion
  field: FrontierField
  method_summary: string
  conclusion_summary: string
  abstract: string
  doi: string
  url: string
  tags: string
}

type FrontierImportFormState = {
  query: string
  searchMode: 'keyword' | 'precise'
  subject: string
  field: FrontierField
  region: FrontierRegion
  fromYear: string
  toYear: string
  limit: string
}

type FrontierImportItem = {
  title: string
  authors: string
  year: number | null
  source: string
  region: FrontierRegion
  field: FrontierField
  method_summary: string
  conclusion_summary: string
  abstract: string
  doi: string
  url: string
  tags: string[]
}

type FrontierAiCardResponse = {
  item?: FrontierLiteratureRow
  confidence_note?: string
}

type ReadingArticleRow = {
  id: string
}

type FrontierReadingSessionRow = {
  id: string
  user_id: string
  title: string | null
  description: string | null
  selected_item_ids: string[] | null
  created_at: string | null
  updated_at: string | null
}

type ReadingSessionFormState = {
  title: string
  description: string
}

type SubscriptionRegion = (typeof REGION_FILTERS)[number]

type FrontierFieldSubscriptionRow = {
  id: string
  user_id: string
  field: FrontierField
  region: SubscriptionRegion | null
  keywords: string[] | null
  is_active: boolean | null
  created_at: string | null
  updated_at: string | null
}

type SubscriptionFormState = {
  field: FrontierField
  region: SubscriptionRegion
  keywords: string
  is_active: boolean
}

type CandidateStatus = 'pending' | 'approved' | 'rejected' | 'imported' | 'duplicate'

type FrontierLiteratureCandidateRow = {
  id: string
  source_api: string | null
  title: string | null
  authors: string | null
  year: number | null
  source: string | null
  region: string | null
  field: string | null
  abstract: string | null
  doi: string | null
  url: string | null
  tags: string[] | null
  status: CandidateStatus | null
  imported_item_id: string | null
  created_at: string | null
  updated_at: string | null
}

type WritingProjectOption = {
  id: string
  title: string
  language: string | null
  paper_type: string | null
  updated_at: string | null
}

const ADMIN_EMAIL = 'rukunchen@hotmail.com'
const FRONTIER_SELECT = 'id,title,authors,year,source,region,field,method_summary,conclusion_summary,abstract,doi,url,tags,research_question,limitation_summary,significance_summary,literature_review_sentence,ai_card_generated_at,ai_card_model,created_at'
const CANDIDATE_SELECT = 'id,source_api,title,authors,year,source,region,field,abstract,doi,url,tags,status,imported_item_id,created_at,updated_at'
const READING_SESSION_SELECT = 'id,user_id,title,description,selected_item_ids,created_at,updated_at'
const WRITING_PROJECT_SELECT = 'id,title,language,paper_type,updated_at'
const REGION_FILTERS = ['全部', '国内', '国外'] as const
const FRONTIER_FIELDS = ['翻译', '翻译科技', '语料库', '人工智能', '心理学', '区域国别研究', '语言学', '教育学', '传播学', '文学文化', '数字人文', '其他'] as const
const FIELD_FILTERS = ['全部', ...FRONTIER_FIELDS] as const

// Development-only fallback. Used only when Supabase query fails, so the page remains inspectable locally.
const DEV_FALLBACK_FRONTIER_PAPERS: FrontierPaper[] = [
  {
    id: 'dev-frontier-fallback',
    region: '国内',
    field: '翻译',
    title: '开发 fallback：前沿文献库示例条目',
    authors: '系统示例',
    year: 2025,
    source: '本地 fallback',
    method: '示例方法',
    finding: '这是 Supabase 查询失败时用于本地检查页面结构的示例，不代表真实最新文献。',
    abstract: '该条目仅用于开发环境降级显示。',
    doi: '',
    link: 'https://example.com/frontier/dev-fallback',
    keywords: ['fallback'],
    detail: 'Supabase 查询成功后不会使用这条数据；数据库为空时也不会显示 fallback。',
    researchQuestion: '',
    limitationSummary: '',
    significanceSummary: '',
    literatureReviewSentence: '',
    aiCardGeneratedAt: '',
    aiCardModel: '',
  },
]

const EMPTY_FORM: FrontierFormState = {
  title: '',
  authors: '',
  year: '',
  source: '',
  region: '国内',
  field: '翻译',
  method_summary: '',
  conclusion_summary: '',
  abstract: '',
  doi: '',
  url: '',
  tags: '',
}

const EMPTY_IMPORT_FORM: FrontierImportFormState = {
  query: '',
  searchMode: 'keyword',
  subject: '',
  field: '翻译科技',
  region: '国外',
  fromYear: '',
  toYear: '',
  limit: '20',
}

const EMPTY_SESSION_FORM: ReadingSessionFormState = {
  title: '',
  description: '',
}

const EMPTY_SUBSCRIPTION_FORM: SubscriptionFormState = {
  field: '翻译',
  region: '全部',
  keywords: '',
  is_active: true,
}

function rowToPaper(row: FrontierLiteratureRow): FrontierPaper {
  const abstract = row.abstract || ''
  return {
    id: row.id,
    region: row.region || '国内',
    field: row.field || '其他',
    title: row.title,
    authors: row.authors || '未记录作者',
    year: row.year,
    source: row.source || '未记录来源',
    method: row.method_summary || '未记录',
    finding: row.conclusion_summary || '未记录',
    abstract,
    doi: row.doi || '',
    link: row.url || '',
    keywords: row.tags || [],
    detail: abstract || row.conclusion_summary || '暂无摘要。',
    researchQuestion: row.research_question || '',
    limitationSummary: row.limitation_summary || '',
    significanceSummary: row.significance_summary || '',
    literatureReviewSentence: row.literature_review_sentence || '',
    aiCardGeneratedAt: row.ai_card_generated_at || '',
    aiCardModel: row.ai_card_model || '',
  }
}

function formTags(value: string): string[] {
  return value
    .split(/[，,、;；\n]/)
    .map(tag => tag.trim())
    .filter(Boolean)
}

type DuplicateCandidate = {
  title: string
  year: number | null
  doi?: string | null
  url?: string | null
  link?: string | null
}

function normalizeDoi(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/, '')
    .replace(/\/$/, '')
}

function normalizeUrl(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
}

function normalizeTitle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function duplicateKeys(item: DuplicateCandidate) {
  const keys: string[] = []
  const doi = normalizeDoi(item.doi || '')
  if (doi) keys.push(`doi:${doi}`)

  const url = normalizeUrl(item.url || item.link || '')
  if (url) keys.push(`url:${url}`)

  const title = normalizeTitle(item.title)
  if (title) keys.push(`title:${title}:${item.year || ''}`)

  return keys
}

function dedupeImportItems(items: FrontierImportItem[], existingPapers: FrontierPaper[]) {
  const seen = new Set(existingPapers.flatMap(paper => duplicateKeys(paper)))
  const uniqueItems: FrontierImportItem[] = []
  let skippedCount = 0

  for (const item of items) {
    const keys = duplicateKeys(item)
    if (keys.some(key => seen.has(key))) {
      skippedCount += 1
      continue
    }

    uniqueItems.push(item)
    keys.forEach(key => seen.add(key))
  }

  return { items: uniqueItems, skippedCount }
}

function candidateRegion(value: string | null): FrontierRegion | null {
  return value === '国内' || value === '国外' ? value : null
}

function candidateField(value: string | null): FrontierField {
  return FRONTIER_FIELDS.includes(value as FrontierField) ? value as FrontierField : '其他'
}

function defaultSessionTitle() {
  return `前沿文献阅读 - ${new Date().toISOString().slice(0, 10)}`
}

function formatDateTime(value: string | null) {
  if (!value) return '未记录'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function FrontierPage() {
  const router = useRouter()
  const [papers, setPapers] = useState<FrontierPaper[]>([])
  const [readingSessions, setReadingSessions] = useState<FrontierReadingSessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [candidates, setCandidates] = useState<FrontierLiteratureCandidateRow[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(true)
  const [candidateError, setCandidateError] = useState('')
  const [candidateActionId, setCandidateActionId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  const [sessionError, setSessionError] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [regionFilter, setRegionFilter] = useState<(typeof REGION_FILTERS)[number]>('全部')
  const [fieldFilter, setFieldFilter] = useState<(typeof FIELD_FILTERS)[number]>('全部')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [readingMode, setReadingMode] = useState(false)
  const [activePaperId, setActivePaperId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')
  const [form, setForm] = useState<FrontierFormState>(EMPTY_FORM)
  const [importOpen, setImportOpen] = useState(false)
  const [importSearching, setImportSearching] = useState(false)
  const [importSaving, setImportSaving] = useState(false)
  const [importError, setImportError] = useState('')
  const [importNotice, setImportNotice] = useState('')
  const [importSearched, setImportSearched] = useState(false)
  const [importForm, setImportForm] = useState<FrontierImportFormState>(EMPTY_IMPORT_FORM)
  const [importResults, setImportResults] = useState<FrontierImportItem[]>([])
  const [selectedImportIndexes, setSelectedImportIndexes] = useState<Set<number>>(new Set())
  const [aiGeneratingId, setAiGeneratingId] = useState<string | null>(null)
  const [aiCardError, setAiCardError] = useState('')
  const [readingRoomAddingId, setReadingRoomAddingId] = useState<string | null>(null)
  const [readingRoomError, setReadingRoomError] = useState('')
  const [sessionCreateOpen, setSessionCreateOpen] = useState(false)
  const [sessionSaving, setSessionSaving] = useState(false)
  const [sessionForm, setSessionForm] = useState<ReadingSessionFormState>(EMPTY_SESSION_FORM)
  const [subscriptions, setSubscriptions] = useState<FrontierFieldSubscriptionRow[]>([])
  const [subscriptionsOpen, setSubscriptionsOpen] = useState(false)
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(true)
  const [subscriptionSaving, setSubscriptionSaving] = useState(false)
  const [subscriptionError, setSubscriptionError] = useState('')
  const [subscriptionForm, setSubscriptionForm] = useState<SubscriptionFormState>(EMPTY_SUBSCRIPTION_FORM)
  const [writingProjects, setWritingProjects] = useState<WritingProjectOption[]>([])
  const [writingMaterialPaper, setWritingMaterialPaper] = useState<FrontierPaper | null>(null)
  const [selectedWritingProjectId, setSelectedWritingProjectId] = useState('')
  const [writingProjectsLoading, setWritingProjectsLoading] = useState(false)
  const [writingMaterialSaving, setWritingMaterialSaving] = useState(false)
  const [writingMaterialError, setWritingMaterialError] = useState('')

  const isAdmin = userEmail.toLowerCase() === ADMIN_EMAIL

  const loadReadingSessions = useCallback(async () => {
    setSessionsLoading(true)
    setSessionError('')

    const { data: userData } = await supabase.auth.getUser()
    const currentUser = userData.user
    if (!currentUser) {
      setReadingSessions([])
      setSessionsLoading(false)
      return
    }

    setUserId(currentUser.id)
    const { data, error } = await supabase
      .from('frontier_reading_sessions')
      .select(READING_SESSION_SELECT)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      setSessionError(error.message || '阅读会话暂时无法加载。')
      setReadingSessions([])
      setSessionsLoading(false)
      return
    }

    setReadingSessions((data || []) as FrontierReadingSessionRow[])
    setSessionsLoading(false)
  }, [])

  const loadPapers = useCallback(async () => {
    setLoading(true)
    setLoadError('')

    const { data: userData } = await supabase.auth.getUser()
    setUserEmail(userData.user?.email || '')
    setUserId(userData.user?.id || '')

    const { data, error } = await supabase
      .from('frontier_literature_items')
      .select(FRONTIER_SELECT)
      .order('year', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      setLoadError('文献库暂时无法连接，当前显示开发 fallback 示例。')
      setPapers(DEV_FALLBACK_FRONTIER_PAPERS)
      setLoading(false)
      return
    }

    setPapers(((data || []) as FrontierLiteratureRow[]).map(rowToPaper))
    setLoading(false)
  }, [])

  const loadSubscriptions = useCallback(async () => {
    setSubscriptionsLoading(true)
    setSubscriptionError('')

    const { data: userData } = await supabase.auth.getUser()
    const currentUser = userData.user
    if (!currentUser) {
      setSubscriptions([])
      setSubscriptionsLoading(false)
      return
    }

    setUserId(currentUser.id)
    const { data, error } = await supabase
      .from('frontier_field_subscriptions')
      .select('id,user_id,field,region,keywords,is_active,created_at,updated_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })

    if (error) {
      setSubscriptionError(error.message || '领域订阅暂时无法加载。')
      setSubscriptions([])
      setSubscriptionsLoading(false)
      return
    }

    setSubscriptions((data || []) as FrontierFieldSubscriptionRow[])
    setSubscriptionsLoading(false)
  }, [])

  const loadCandidates = useCallback(async () => {
    setCandidatesLoading(true)
    setCandidateError('')

    const { data: userData } = await supabase.auth.getUser()
    const currentUser = userData.user
    if (currentUser?.email?.toLowerCase() !== ADMIN_EMAIL) {
      setCandidates([])
      setCandidatesLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('frontier_literature_candidates')
      .select(CANDIDATE_SELECT)
      .order('created_at', { ascending: false })

    if (error) {
      setCandidateError(error.message || '候选文献池暂时无法加载。')
      setCandidates([])
      setCandidatesLoading(false)
      return
    }

    setCandidates((data || []) as FrontierLiteratureCandidateRow[])
    setCandidatesLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPapers()
      void loadReadingSessions()
      void loadSubscriptions()
      void loadCandidates()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadCandidates, loadPapers, loadReadingSessions, loadSubscriptions])

  const filteredPapers = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase()
    return papers.filter(paper => {
      if (regionFilter !== '全部' && paper.region !== regionFilter) return false
      if (fieldFilter !== '全部' && paper.field !== fieldFilter) return false
      if (!keyword) return true
      return [
        paper.title,
        paper.authors,
        paper.source,
        paper.method,
        paper.finding,
        paper.abstract,
        paper.doi,
        paper.researchQuestion,
        paper.limitationSummary,
        paper.significanceSummary,
        paper.literatureReviewSentence,
        ...paper.keywords,
      ].some(value => value.toLowerCase().includes(keyword))
    })
  }, [fieldFilter, papers, regionFilter, searchQuery])

  const selectedPapers = useMemo(() => (
    papers.filter(paper => selectedIds.has(paper.id))
  ), [papers, selectedIds])

  const activePaper = selectedPapers.find(paper => paper.id === activePaperId) || selectedPapers[0] || null

  const togglePaper = (paperId: string) => {
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(paperId)) next.delete(paperId)
      else next.add(paperId)
      return next
    })
  }

  const backToLibrary = () => {
    setReadingMode(false)
    setActivePaperId(null)
  }

  const openSessionCreateModal = () => {
    if (selectedPapers.length === 0) return
    setSessionForm({ title: defaultSessionTitle(), description: '' })
    setSessionError('')
    setSaveSuccess('')
    setSessionCreateOpen(true)
  }

  const createReadingSession = async (event: React.FormEvent) => {
    event.preventDefault()
    const itemIds = selectedPapers.map(paper => paper.id)
    if (itemIds.length === 0) {
      setSessionError('请先选择要阅读的文献。')
      return
    }

    const { data: userData } = await supabase.auth.getUser()
    const currentUserId = userId || userData.user?.id || ''
    if (!currentUserId) {
      setSessionError('请先登录后再创建阅读会话。')
      return
    }

    setSessionSaving(true)
    setSessionError('')
    setSaveSuccess('')

    const { data, error } = await supabase
      .from('frontier_reading_sessions')
      .insert({
        user_id: currentUserId,
        title: sessionForm.title.trim() || defaultSessionTitle(),
        description: sessionForm.description.trim() || null,
        selected_item_ids: itemIds,
      })
      .select(READING_SESSION_SELECT)
      .single()

    if (error || !data) {
      setSessionError(error?.message || '创建阅读会话失败。')
      setSessionSaving(false)
      return
    }

    setSessionCreateOpen(false)
    setSessionSaving(false)
    setSelectedIds(new Set())
    setReadingSessions(current => [data as FrontierReadingSessionRow, ...current])
    router.push(`/frontier/session/${data.id}`)
  }

  const deleteReadingSession = async (sessionId: string) => {
    if (!window.confirm('确定删除这个阅读会话吗？此操作会同时删除会话下的阅读笔记。')) return

    setSessionError('')
    const { error } = await supabase
      .from('frontier_reading_sessions')
      .delete()
      .eq('id', sessionId)

    if (error) {
      setSessionError(error.message || '删除阅读会话失败。')
      return
    }

    setReadingSessions(current => current.filter(session => session.id !== sessionId))
    setSaveSuccess('阅读会话已删除。')
  }

  const openSubscriptionsModal = () => {
    setSubscriptionError('')
    setSubscriptionsOpen(true)
    void loadSubscriptions()
  }

  const createSubscription = async (event: React.FormEvent) => {
    event.preventDefault()

    const { data: userData } = await supabase.auth.getUser()
    const currentUserId = userId || userData.user?.id || ''
    if (!currentUserId) {
      setSubscriptionError('请先登录后再添加领域订阅。')
      return
    }

    setSubscriptionSaving(true)
    setSubscriptionError('')
    setSaveSuccess('')

    const { data, error } = await supabase
      .from('frontier_field_subscriptions')
      .insert({
        user_id: currentUserId,
        field: subscriptionForm.field,
        region: subscriptionForm.region,
        keywords: formTags(subscriptionForm.keywords),
        is_active: subscriptionForm.is_active,
      })
      .select('id,user_id,field,region,keywords,is_active,created_at,updated_at')
      .single()

    setSubscriptionSaving(false)
    if (error || !data) {
      setSubscriptionError(error?.message || '添加领域订阅失败。')
      return
    }

    setSubscriptions(current => [data as FrontierFieldSubscriptionRow, ...current])
    setSubscriptionForm(EMPTY_SUBSCRIPTION_FORM)
    setSaveSuccess('领域订阅已添加。')
  }

  const toggleSubscriptionActive = async (subscription: FrontierFieldSubscriptionRow) => {
    const nextActive = !subscription.is_active
    setSubscriptionError('')
    setSubscriptions(current => current.map(item => (
      item.id === subscription.id ? { ...item, is_active: nextActive } : item
    )))

    const { error } = await supabase
      .from('frontier_field_subscriptions')
      .update({ is_active: nextActive })
      .eq('id', subscription.id)

    if (error) {
      setSubscriptions(current => current.map(item => (
        item.id === subscription.id ? { ...item, is_active: subscription.is_active } : item
      )))
      setSubscriptionError(error.message || '更新订阅状态失败。')
      return
    }

    setSaveSuccess(nextActive ? '领域订阅已启用。' : '领域订阅已停用。')
  }

  const deleteSubscription = async (subscription: FrontierFieldSubscriptionRow) => {
    if (!window.confirm(`确定删除「${subscription.field}」领域订阅吗？`)) return

    setSubscriptionError('')
    const previous = subscriptions
    setSubscriptions(current => current.filter(item => item.id !== subscription.id))

    const { error } = await supabase
      .from('frontier_field_subscriptions')
      .delete()
      .eq('id', subscription.id)

    if (error) {
      setSubscriptions(previous)
      setSubscriptionError(error.message || '删除领域订阅失败。')
      return
    }

    setSaveSuccess('领域订阅已删除。')
  }

  const updateCandidateStatus = async (candidate: FrontierLiteratureCandidateRow, status: CandidateStatus) => {
    if (!isAdmin) {
      setCandidateError('只有管理员可以管理候选文献。')
      return
    }

    setCandidateActionId(candidate.id)
    setCandidateError('')
    setSaveSuccess('')

    const { data, error } = await supabase
      .from('frontier_literature_candidates')
      .update({ status })
      .eq('id', candidate.id)
      .select(CANDIDATE_SELECT)
      .single()

    setCandidateActionId(null)
    if (error || !data) {
      setCandidateError(error?.message || '候选文献状态更新失败。')
      return
    }

    setCandidates(current => current.map(item => (
      item.id === candidate.id ? data as FrontierLiteratureCandidateRow : item
    )))
    setSaveSuccess(status === 'rejected' ? '候选文献已拒绝。' : '候选文献已标记为重复。')
  }

  const approveCandidate = async (candidate: FrontierLiteratureCandidateRow) => {
    if (!isAdmin) {
      setCandidateError('只有管理员可以管理候选文献。')
      return
    }

    if (!candidate.title?.trim()) {
      setCandidateError('候选文献缺少标题，无法导入。')
      return
    }

    setCandidateActionId(candidate.id)
    setCandidateError('')
    setSaveSuccess('')

    const doi = normalizeDoi(candidate.doi || '')
    if (doi) {
      const { data: existingItems, error: duplicateError } = await supabase
        .from('frontier_literature_items')
        .select('id,doi')
        .not('doi', 'is', null)

      if (duplicateError) {
        setCandidateActionId(null)
        setCandidateError(duplicateError.message || '检查 DOI 重复失败。')
        return
      }

      const duplicate = ((existingItems || []) as Pick<FrontierLiteratureRow, 'id' | 'doi'>[])
        .find(item => normalizeDoi(item.doi || '') === doi)

      if (duplicate) {
        const { data, error } = await supabase
          .from('frontier_literature_candidates')
          .update({ status: 'duplicate' })
          .eq('id', candidate.id)
          .select(CANDIDATE_SELECT)
          .single()

        setCandidateActionId(null)
        if (error || !data) {
          setCandidateError(error?.message || '标记重复失败。')
          return
        }

        setCandidates(current => current.map(item => (
          item.id === candidate.id ? data as FrontierLiteratureCandidateRow : item
        )))
        setSaveSuccess('DOI 已存在，候选文献已标记为重复。')
        return
      }
    }

    const { data: insertedItem, error: insertError } = await supabase
      .from('frontier_literature_items')
      .insert({
        title: candidate.title.trim(),
        authors: candidate.authors || null,
        year: candidate.year,
        source: candidate.source || null,
        region: candidateRegion(candidate.region),
        field: candidateField(candidate.field),
        method_summary: null,
        conclusion_summary: null,
        abstract: candidate.abstract || null,
        doi: candidate.doi || null,
        url: candidate.url || null,
        tags: candidate.tags || [],
      })
      .select(FRONTIER_SELECT)
      .single()

    if (insertError || !insertedItem) {
      setCandidateActionId(null)
      setCandidateError(insertError?.message || '批准导入失败。')
      return
    }

    const { data: updatedCandidate, error: updateError } = await supabase
      .from('frontier_literature_candidates')
      .update({
        status: 'imported',
        imported_item_id: insertedItem.id,
      })
      .eq('id', candidate.id)
      .select(CANDIDATE_SELECT)
      .single()

    setCandidateActionId(null)
    if (updateError || !updatedCandidate) {
      setCandidateError(updateError?.message || '候选文献导入后状态更新失败。')
      await loadPapers()
      return
    }

    setCandidates(current => current.map(item => (
      item.id === candidate.id ? updatedCandidate as FrontierLiteratureCandidateRow : item
    )))
    setPapers(current => [rowToPaper(insertedItem as FrontierLiteratureRow), ...current])
    setSaveSuccess('候选文献已批准并导入前沿文献库。')
  }

  const addToReadingRoom = async (paper: FrontierPaper) => {
    const { data: userData } = await supabase.auth.getUser()
    const currentUserId = userId || userData.user?.id || ''
    if (!currentUserId) {
      setReadingRoomError('请先登录后再加入深读室。')
      return
    }

    setReadingRoomAddingId(paper.id)
    setReadingRoomError('')
    setSaveSuccess('')

    const { data: existingRows, error: existingError } = await supabase
      .from('reading_articles')
      .select('id')
      .eq('user_id', currentUserId)
      .eq('source_type', 'frontier_literature')
      .eq('title', paper.title)
      .eq('source', paper.source)
      .limit(1)

    if (existingError) {
      setReadingRoomError(existingError.message || '检查深读室重复文章失败。')
      setReadingRoomAddingId(null)
      return
    }

    const existingArticle = (existingRows || [])[0] as ReadingArticleRow | undefined
    if (existingArticle) {
      setReadingRoomAddingId(null)
      router.push('/reading')
      return
    }

    const { error } = await supabase
      .from('reading_articles')
      .insert({
        user_id: currentUserId,
        title: paper.title,
        source: paper.source,
        source_type: 'frontier_literature',
        clean_text: paper.abstract || '',
        structured_blocks: null,
      })

    setReadingRoomAddingId(null)

    if (error) {
      setReadingRoomError(error.message || '加入深读室失败。')
      return
    }

    router.push('/reading')
  }

  const openWritingMaterialModal = async (paper: FrontierPaper) => {
    const { data: userData } = await supabase.auth.getUser()
    const currentUserId = userId || userData.user?.id || ''
    if (!currentUserId) {
      setWritingMaterialError('请先登录后再加入论文写作素材。')
      return
    }

    setWritingMaterialPaper(paper)
    setWritingMaterialError('')
    setSaveSuccess('')
    setWritingProjectsLoading(true)

    const { data, error } = await supabase
      .from('writing_projects')
      .select(WRITING_PROJECT_SELECT)
      .eq('user_id', currentUserId)
      .order('updated_at', { ascending: false })

    setWritingProjectsLoading(false)
    if (error) {
      setWritingProjects([])
      setSelectedWritingProjectId('')
      setWritingMaterialError(error.message || '论文项目加载失败。')
      return
    }

    const nextProjects = (data || []) as WritingProjectOption[]
    setWritingProjects(nextProjects)
    setSelectedWritingProjectId(nextProjects[0]?.id || '')
  }

  const addToWritingMaterials = async () => {
    const paper = writingMaterialPaper
    if (!paper || !selectedWritingProjectId) return

    const { data: userData } = await supabase.auth.getUser()
    const currentUserId = userId || userData.user?.id || ''
    if (!currentUserId) {
      setWritingMaterialError('请先登录后再加入论文写作素材。')
      return
    }

    setWritingMaterialSaving(true)
    setWritingMaterialError('')
    setSaveSuccess('')

    const { data: existingRows, error: existingError } = await supabase
      .from('writing_literature_sources')
      .select('id')
      .eq('writing_project_id', selectedWritingProjectId)
      .eq('frontier_item_id', paper.id)
      .limit(1)

    if (existingError) {
      setWritingMaterialSaving(false)
      setWritingMaterialError(existingError.message || '检查重复素材失败。')
      return
    }

    if ((existingRows || []).length > 0) {
      setWritingMaterialSaving(false)
      setWritingMaterialPaper(null)
      setSaveSuccess('该文献已在所选论文项目的写作素材中。')
      return
    }

    const { error } = await supabase
      .from('writing_literature_sources')
      .insert({
        user_id: currentUserId,
        writing_project_id: selectedWritingProjectId,
        frontier_item_id: paper.id,
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        source: paper.source,
        doi: paper.doi || null,
        url: paper.link || null,
        field: paper.field,
        method_summary: paper.method,
        conclusion_summary: paper.finding,
        limitation_summary: paper.limitationSummary || null,
        literature_review_sentence: paper.literatureReviewSentence || null,
        user_note: null,
      })

    setWritingMaterialSaving(false)
    if (error) {
      setWritingMaterialError(error.message || '加入论文写作素材失败。')
      return
    }

    setWritingMaterialPaper(null)
    setSaveSuccess('已加入论文写作素材。')
  }

  const openAddModal = () => {
    setForm(EMPTY_FORM)
    setAddError('')
    setSaveSuccess('')
    setAddOpen(true)
  }

  const openImportModal = () => {
    setImportForm(EMPTY_IMPORT_FORM)
    setImportError('')
    setImportNotice('')
    setImportSearched(false)
    setImportResults([])
    setSelectedImportIndexes(new Set())
    setSaveSuccess('')
    setImportOpen(true)
  }

  const generateAiCard = async (paperId: string) => {
    if (!isAdmin) return

    setAiGeneratingId(paperId)
    setAiCardError('')
    setSaveSuccess('')

    const { data, error } = await apiJSON<FrontierAiCardResponse>('/api/frontier/ai-card', {
      method: 'POST',
      body: JSON.stringify({ itemId: paperId }),
    })

    if (error || !data?.item) {
      setAiCardError(`AI 文献卡片生成失败：${error || '请稍后再试。'}`)
      setAiGeneratingId(null)
      return
    }

    const updatedPaper = rowToPaper(data.item)
    setPapers(current => current.map(paper => (
      paper.id === updatedPaper.id ? updatedPaper : paper
    )))
    setSaveSuccess('AI 文献卡片已生成。')
    setAiGeneratingId(null)
  }

  const createPaper = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!isAdmin) return
    if (!form.title.trim()) {
      setAddError('请填写标题。')
      return
    }

    setAddSaving(true)
    setAddError('')
    setSaveSuccess('')
    const year = form.year.trim() ? Number(form.year) : null
    try {
      const { error } = await supabase
        .from('frontier_literature_items')
        .insert({
          title: form.title.trim(),
          authors: form.authors.trim() || null,
          year: Number.isFinite(year) ? year : null,
          source: form.source.trim() || null,
          region: form.region,
          field: form.field,
          method_summary: form.method_summary.trim() || null,
          conclusion_summary: form.conclusion_summary.trim() || null,
          abstract: form.abstract.trim() || null,
          doi: form.doi.trim() || null,
          url: form.url.trim() || null,
          tags: formTags(form.tags),
        })

      if (error) {
        setAddError(error.message || '添加文献失败。')
        return
      }

      setAddOpen(false)
      setForm(EMPTY_FORM)
      await loadPapers()
      setSaveSuccess('文献已添加。')
    } catch (error) {
      setAddError(error instanceof Error ? error.message : '添加文献失败。')
    } finally {
      setAddSaving(false)
    }
  }

  const searchExternalPapers = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!isAdmin) return
    if (!importForm.query.trim()) {
      setImportError('请输入关键词。')
      return
    }

    setImportSearching(true)
    setImportError('')
    setImportNotice('')
    setImportSearched(false)
    setImportResults([])
    setSelectedImportIndexes(new Set())

    const limit = Math.min(Math.max(Number(importForm.limit) || 20, 1), 30)
    const params = new URLSearchParams({
      query: importForm.query.trim(),
      mode: importForm.searchMode,
      field: importForm.field,
      region: importForm.region,
      limit: String(limit),
    })
    if (importForm.subject.trim()) params.set('subject', importForm.subject.trim())
    if (importForm.fromYear.trim()) params.set('fromYear', importForm.fromYear.trim())
    if (importForm.toYear.trim()) params.set('toYear', importForm.toYear.trim())

    try {
      const response = await fetch(`/api/frontier/search-openalex?${params.toString()}`)
      const data = await response.json().catch(() => ({})) as {
        items?: FrontierImportItem[]
        error?: string
      }

      if (!response.ok) {
        setImportError(data.error || '搜索文献失败。')
        return
      }

      const rawItems = data.items || []
      const { items, skippedCount } = dedupeImportItems(rawItems, papers)

      setImportResults(items)
      if (skippedCount > 0) {
        setImportNotice(`已自动跳过 ${skippedCount} 篇与文献库或本次搜索结果重复的文献。`)
      }
      setImportSearched(true)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '搜索文献失败。')
    } finally {
      setImportSearching(false)
    }
  }

  const toggleImportResult = (index: number) => {
    setSelectedImportIndexes(current => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const importExternalPapers = async () => {
    if (!isAdmin) return
    const selectedItems = importResults.filter((_, index) => selectedImportIndexes.has(index))
    if (selectedItems.length === 0) {
      setImportError('请先选择要导入的文献。')
      return
    }

    setImportSaving(true)
    setImportError('')
    setImportNotice('')
    setSaveSuccess('')

    try {
      const { items: uniqueItems, skippedCount } = dedupeImportItems(selectedItems, papers)
      if (uniqueItems.length === 0) {
        setImportError('所选文献已在前沿文献库中，无需重复导入。')
        return
      }

      const { error } = await supabase
        .from('frontier_literature_items')
        .insert(uniqueItems.map(item => ({
          title: item.title,
          authors: item.authors || null,
          year: item.year,
          source: item.source || null,
          region: item.region,
          field: item.field,
          method_summary: null,
          conclusion_summary: null,
          abstract: item.abstract || null,
          doi: item.doi || null,
          url: item.url || null,
          tags: item.tags || [],
        })))

      if (error) {
        setImportError(error.message || '导入文献失败。')
        return
      }

      setImportOpen(false)
      await loadPapers()
      setSaveSuccess(skippedCount > 0
        ? `已导入 ${uniqueItems.length} 篇文献，跳过 ${skippedCount} 篇重复文献。`
        : `已导入 ${uniqueItems.length} 篇文献。`
      )
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '导入文献失败。')
    } finally {
      setImportSaving(false)
    }
  }

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="min-h-[calc(100vh-40px)] rounded-2xl border border-line bg-white">
          <MainContent size="full" className="!px-6 sm:!px-10 xl:!px-14">
            <PageHeader
              eyebrow="Frontier Literature"
              title="前沿文献"
              description={readingMode ? '查看已选择文献并进入精读准备。' : '从 Supabase 文献库筛选、勾选并进入阅读界面。'}
              actions={
                <div className="flex flex-wrap justify-end gap-2">
                  {readingMode ? (
                    <Button variant="secondary" onClick={backToLibrary}>返回文献列表</Button>
                  ) : (
                    <>
                      <Button variant="secondary" onClick={openSubscriptionsModal}>
                        领域订阅
                      </Button>
                      {isAdmin && (
                        <>
                          <Button variant="secondary" onClick={openImportModal}>外部导入</Button>
                          <Button variant="secondary" onClick={openAddModal}>添加文献</Button>
                        </>
                      )}
                      <Button variant="primary" disabled={selectedPapers.length === 0} onClick={openSessionCreateModal}>
                        确认进入阅读{selectedPapers.length > 0 ? `（${selectedPapers.length}）` : ''}
                      </Button>
                    </>
                  )}
                </div>
              }
            />

            {loadError && !readingMode && (
              <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {loadError}
              </div>
            )}

            {saveSuccess && (
              <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {saveSuccess}
              </div>
            )}

            {aiCardError && (
              <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {aiCardError}
              </div>
            )}

            {readingRoomError && (
              <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {readingRoomError}
              </div>
            )}

            {writingMaterialError && !writingMaterialPaper && (
              <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {writingMaterialError}
              </div>
            )}

            {subscriptionError && !subscriptionsOpen && (
              <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {subscriptionError}
              </div>
            )}

            {candidateError && (
              <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {candidateError}
              </div>
            )}

            {sessionError && (
              <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {sessionError}
              </div>
            )}

            {readingMode ? (
              <FrontierReader
                papers={selectedPapers}
                activePaper={activePaper}
                onSelect={setActivePaperId}
                isAdmin={isAdmin}
                generatingId={aiGeneratingId}
                onGenerateAiCard={generateAiCard}
                readingRoomAddingId={readingRoomAddingId}
                onAddToReadingRoom={addToReadingRoom}
                onOpenWritingMaterial={openWritingMaterialModal}
              />
            ) : (
              <>
                <ReadingSessionsPanel
                  sessions={readingSessions}
                  loading={sessionsLoading}
                  onContinue={sessionId => router.push(`/frontier/session/${sessionId}`)}
                  onDelete={deleteReadingSession}
                />

                {isAdmin && (
                  <CandidatePoolPanel
                    candidates={candidates}
                    loading={candidatesLoading}
                    actionId={candidateActionId}
                    onApprove={approveCandidate}
                    onReject={candidate => updateCandidateStatus(candidate, 'rejected')}
                    onDuplicate={candidate => updateCandidateStatus(candidate, 'duplicate')}
                  />
                )}

                <section className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
                  <Card padding="md" variant="surface">
                    <div className="grid grid-cols-1 gap-5">
                      <Input
                        label="搜索"
                        value={searchQuery}
                        onChange={event => setSearchQuery(event.target.value)}
                        placeholder="搜索题目、作者、来源、摘要、标签或 DOI"
                      />
                      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                        <FilterGroup
                          label="国内 / 国外"
                          values={REGION_FILTERS}
                          active={regionFilter}
                          onChange={setRegionFilter}
                        />
                        <FilterGroup
                          label="领域"
                          values={FIELD_FILTERS}
                          active={fieldFilter}
                          onChange={setFieldFilter}
                        />
                      </div>
                    </div>
                  </Card>
                  <Card padding="md" className="flex min-w-[220px] items-center justify-between gap-4 xl:flex-col xl:items-start xl:justify-center">
                    <div>
                      <p className="text-xs text-ink-500">已选择</p>
                      <p className="mt-1 font-mono text-3xl text-ink-900">{selectedPapers.length}</p>
                    </div>
                    <Button variant="secondary" disabled={selectedPapers.length === 0} onClick={() => setSelectedIds(new Set())}>
                      清空选择
                    </Button>
                  </Card>
                </section>

                {loading ? (
                  <Card padding="lg" variant="surface" className="text-center">
                    <p className="text-sm text-ink-500">正在加载文献库...</p>
                  </Card>
                ) : papers.length === 0 ? (
                  <Card padding="lg" variant="surface" className="text-center">
                    <h2 className="font-serif text-xl text-ink-900">暂无文献数据</h2>
                    <p className="mt-3 text-sm text-ink-500">暂无文献数据。请管理员添加文献条目。</p>
                  </Card>
                ) : filteredPapers.length === 0 ? (
                  <Card padding="lg" variant="surface" className="text-center">
                    <h2 className="font-serif text-xl text-ink-900">没有匹配的文献</h2>
                    <p className="mt-3 text-sm text-ink-500">调整地区、领域或搜索关键词后再试。</p>
                  </Card>
                ) : (
                  <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {filteredPapers.map(paper => (
                      <FrontierPaperCard
                        key={paper.id}
                        paper={paper}
                        checked={selectedIds.has(paper.id)}
                        isAdmin={isAdmin}
                        generating={aiGeneratingId === paper.id}
                        addingToReadingRoom={readingRoomAddingId === paper.id}
                        onToggle={() => togglePaper(paper.id)}
                        onGenerateAiCard={() => generateAiCard(paper.id)}
                        onAddToReadingRoom={() => addToReadingRoom(paper)}
                        onOpenWritingMaterial={() => { void openWritingMaterialModal(paper) }}
                      />
                    ))}
                  </section>
                )}
              </>
            )}
          </MainContent>
        </div>
      </main>

      {subscriptionsOpen && (
        <FrontierSubscriptionsModal
          form={subscriptionForm}
          subscriptions={subscriptions}
          loading={subscriptionsLoading}
          saving={subscriptionSaving}
          error={subscriptionError}
          onChange={patch => setSubscriptionForm(current => ({ ...current, ...patch }))}
          onSubmit={createSubscription}
          onToggleActive={toggleSubscriptionActive}
          onDelete={deleteSubscription}
          onClose={() => {
            setSubscriptionsOpen(false)
            setSubscriptionError('')
          }}
        />
      )}

      {addOpen && (
        <FrontierAddModal
          form={form}
          saving={addSaving}
          error={addError}
          onChange={patch => setForm(current => ({ ...current, ...patch }))}
          onSubmit={createPaper}
          onClose={() => setAddOpen(false)}
        />
      )}

      {importOpen && (
        <FrontierImportModal
          form={importForm}
          results={importResults}
          selectedIndexes={selectedImportIndexes}
          searched={importSearched}
          searching={importSearching}
          saving={importSaving}
          error={importError}
          notice={importNotice}
          onChange={patch => setImportForm(current => ({ ...current, ...patch }))}
          onSearch={searchExternalPapers}
          onToggle={toggleImportResult}
          onImport={importExternalPapers}
          onClose={() => setImportOpen(false)}
        />
      )}

      {sessionCreateOpen && (
        <ReadingSessionCreateModal
          form={sessionForm}
          selectedCount={selectedPapers.length}
          saving={sessionSaving}
          onChange={patch => setSessionForm(current => ({ ...current, ...patch }))}
          onSubmit={createReadingSession}
          onClose={() => setSessionCreateOpen(false)}
        />
      )}

      {writingMaterialPaper && (
        <WritingMaterialModal
          paper={writingMaterialPaper}
          projects={writingProjects}
          selectedProjectId={selectedWritingProjectId}
          loading={writingProjectsLoading}
          saving={writingMaterialSaving}
          error={writingMaterialError}
          onSelect={setSelectedWritingProjectId}
          onSubmit={addToWritingMaterials}
          onClose={() => {
            setWritingMaterialPaper(null)
            setWritingMaterialError('')
          }}
        />
      )}
    </div>
  )
}

function FilterGroup<T extends string>({
  label,
  values,
  active,
  onChange,
}: {
  label: string
  values: readonly T[]
  active: T
  onChange: (value: T) => void
}) {
  return (
    <div>
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-ink-500">{label}</p>
      <div className="flex flex-wrap gap-2">
        {values.map(value => (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={cn(
              'min-h-9 rounded-full border px-4 py-2 text-sm transition-colors',
              active === value
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-line bg-white text-ink-700 hover:border-ink-300 hover:text-ink-900'
            )}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  )
}

function ReadingSessionsPanel({
  sessions,
  loading,
  onContinue,
  onDelete,
}: {
  sessions: FrontierReadingSessionRow[]
  loading: boolean
  onContinue: (sessionId: string) => void
  onDelete: (sessionId: string) => void
}) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <Eyebrow tone="muted">Reading Sessions</Eyebrow>
          <h2 className="mt-1 font-serif text-xl text-ink-900">我的阅读会话</h2>
        </div>
      </div>

      {loading ? (
        <Card padding="md" variant="surface">
          <p className="text-sm text-ink-500">正在加载阅读会话...</p>
        </Card>
      ) : sessions.length === 0 ? (
        <Card padding="md" variant="surface">
          <p className="text-sm text-ink-500">暂无阅读会话。勾选文献后点击“确认进入阅读”即可创建。</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {sessions.map(session => (
            <Card key={session.id} padding="md" className="flex flex-col gap-4">
              <div>
                <h3 className="font-serif text-lg leading-tight text-ink-900">{session.title || '未命名阅读会话'}</h3>
                {session.description && (
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-600">{session.description}</p>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 text-xs text-ink-500 sm:grid-cols-3">
                <span>文献数量：{session.selected_item_ids?.length || 0}</span>
                <span>创建：{formatDateTime(session.created_at)}</span>
                <span>更新：{formatDateTime(session.updated_at)}</span>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => onDelete(session.id)}>删除</Button>
                <Button size="sm" variant="secondary" onClick={() => onContinue(session.id)}>继续阅读</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}

function CandidatePoolPanel({
  candidates,
  loading,
  actionId,
  onApprove,
  onReject,
  onDuplicate,
}: {
  candidates: FrontierLiteratureCandidateRow[]
  loading: boolean
  actionId: string | null
  onApprove: (candidate: FrontierLiteratureCandidateRow) => void
  onReject: (candidate: FrontierLiteratureCandidateRow) => void
  onDuplicate: (candidate: FrontierLiteratureCandidateRow) => void
}) {
  const statusLabel: Record<CandidateStatus, string> = {
    pending: '待审核',
    approved: '已批准',
    rejected: '已拒绝',
    imported: '已导入',
    duplicate: '重复',
  }

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <Eyebrow tone="muted">Candidate Pool</Eyebrow>
          <h2 className="mt-1 font-serif text-xl text-ink-900">候选文献池</h2>
        </div>
        <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-400">
          {candidates.length} candidates
        </span>
      </div>

      {loading ? (
        <Card padding="md" variant="surface">
          <p className="text-sm text-ink-500">正在加载候选文献池...</p>
        </Card>
      ) : candidates.length === 0 ? (
        <Card padding="md" variant="surface">
          <p className="text-sm text-ink-500">暂无候选文献。</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {candidates.map(candidate => {
            const status = candidate.status || 'pending'
            const busy = actionId === candidate.id
            return (
              <Card key={candidate.id} padding="md">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap gap-2">
                      <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-700">{candidate.field || '未记录领域'}</span>
                      <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-700">{candidate.region || '未记录地区'}</span>
                      <span className="rounded-full border border-line bg-white px-3 py-1 font-mono text-xs text-ink-500">{candidate.year || '年份未录'}</span>
                      <span className={cn(
                        'rounded-full px-3 py-1 text-xs',
                        status === 'imported' ? 'bg-emerald-50 text-emerald-700' :
                          status === 'rejected' ? 'bg-red-50 text-red-700' :
                            status === 'duplicate' ? 'bg-amber-50 text-amber-800' :
                              'bg-canvas text-ink-600'
                      )}>
                        {statusLabel[status]}
                      </span>
                    </div>
                    <h3 className="font-serif text-lg leading-tight text-ink-900">{candidate.title || '未命名候选文献'}</h3>
                    <p className="mt-2 text-sm text-ink-500">
                      {candidate.authors || '未记录作者'} · {candidate.source || '未记录来源'}
                    </p>
                    <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-700">
                      {candidate.abstract || '暂无摘要。'}
                    </p>
                    {(candidate.doi || candidate.url) && (
                      <p className="mt-3 break-all font-mono text-xs text-ink-500">
                        {candidate.doi || candidate.url}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-start justify-end gap-2 xl:flex-col xl:items-stretch">
                    <Button
                      size="sm"
                      variant="primary"
                      loading={busy}
                      disabled={busy || status === 'imported'}
                      onClick={() => onApprove(candidate)}
                    >
                      批准导入
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || status === 'rejected'}
                      onClick={() => onReject(candidate)}
                    >
                      拒绝
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || status === 'duplicate'}
                      onClick={() => onDuplicate(candidate)}
                    >
                      标记重复
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </section>
  )
}

function FrontierPaperCard({
  paper,
  checked,
  isAdmin,
  generating,
  addingToReadingRoom,
  onToggle,
  onGenerateAiCard,
  onAddToReadingRoom,
  onOpenWritingMaterial,
}: {
  paper: FrontierPaper
  checked: boolean
  isAdmin: boolean
  generating: boolean
  addingToReadingRoom: boolean
  onToggle: () => void
  onGenerateAiCard: () => void
  onAddToReadingRoom: () => void
  onOpenWritingMaterial: () => void
}) {
  return (
    <article className={cn(
      'rounded-2xl border bg-white transition-colors',
      checked ? 'border-brand shadow-[var(--shadow-card)]' : 'border-line'
    )}>
      <div className="border-b border-line bg-surface/70" style={{ padding: '18px 20px' }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-700">{paper.region}</span>
            <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-700">{paper.field}</span>
            <span className="rounded-full border border-line bg-white px-3 py-1 font-mono text-xs text-ink-500">{paper.year || '年份未录'}</span>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={checked}
              onChange={onToggle}
              className="h-4 w-4 accent-brand"
            />
            选择
          </label>
        </div>
        <h2 className="font-serif text-xl leading-tight text-ink-900">{paper.title}</h2>
        <p className="mt-3 text-sm text-ink-500">{paper.authors} · {paper.source}</p>
      </div>
      <div style={{ padding: '24px 28px 30px' }}>
        <div className="space-y-5">
          <PaperMeta label="研究方法" value={paper.method} />
          <PaperMeta label="核心结论" value={paper.finding} />
        </div>
        <div style={{ marginTop: 30 }}>
          <FrontierAiCard paper={paper} compact />
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-3" style={{ marginTop: 30 }}>
          {paper.keywords.map(keyword => (
            <span key={keyword} className="rounded-full bg-canvas px-2.5 py-1 text-xs text-ink-500">{keyword}</span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3" style={{ marginTop: 30 }}>
          {paper.link ? (
            <a
              href={paper.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-sm font-medium text-brand hover:underline"
            >
              论文链接
            </a>
          ) : (
            <span className="text-sm text-ink-400">暂无论文链接</span>
          )}
          {isAdmin && (
            <Button size="sm" variant="secondary" loading={generating} onClick={onGenerateAiCard}>
              {generating ? '生成中...' : 'AI 补全文献卡片'}
            </Button>
          )}
          <Button size="sm" variant="secondary" loading={addingToReadingRoom} onClick={onAddToReadingRoom}>
            {addingToReadingRoom ? '加入中...' : '加入深读室'}
          </Button>
          <Button size="sm" variant="secondary" onClick={onOpenWritingMaterial}>
            加入论文写作素材
          </Button>
        </div>
      </div>
    </article>
  )
}

function FrontierReader({
  papers,
  activePaper,
  isAdmin,
  generatingId,
  readingRoomAddingId,
  onSelect,
  onGenerateAiCard,
  onAddToReadingRoom,
  onOpenWritingMaterial,
}: {
  papers: FrontierPaper[]
  activePaper: FrontierPaper | null
  isAdmin: boolean
  generatingId: string | null
  readingRoomAddingId: string | null
  onSelect: (paperId: string) => void
  onGenerateAiCard: (paperId: string) => void
  onAddToReadingRoom: (paper: FrontierPaper) => void
  onOpenWritingMaterial: (paper: FrontierPaper) => void
}) {
  if (!activePaper) {
    return (
      <Card padding="lg" variant="surface" className="text-center">
        <h2 className="font-serif text-xl text-ink-900">尚未选择文献</h2>
        <p className="mt-3 text-sm text-ink-500">返回文献列表后勾选文献，再进入阅读界面。</p>
      </Card>
    )
  }

  return (
    <section className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card padding="none" className="overflow-hidden">
        <div className="border-b border-line bg-surface" style={{ padding: '18px 20px' }}>
          <Eyebrow tone="muted">Selected Papers</Eyebrow>
          <h2 className="mt-1 font-serif text-xl text-ink-900">已选择文献</h2>
        </div>
        <div className="divide-y divide-line">
          {papers.map(paper => (
            <button
              key={paper.id}
              type="button"
              onClick={() => onSelect(paper.id)}
              className={cn(
                'block w-full text-left transition-colors',
                activePaper.id === paper.id ? 'bg-brand-50/70' : 'bg-white hover:bg-canvas'
              )}
              style={{ padding: '16px 18px' }}
            >
              <p className="line-clamp-2 text-sm font-medium leading-relaxed text-ink-900">{paper.title}</p>
              <p className="mt-2 text-xs text-ink-500">{paper.authors} · {paper.year || '年份未录'}</p>
            </button>
          ))}
        </div>
      </Card>

      <Card padding="lg">
        <div className="mb-6 flex flex-col gap-4 border-b border-line pb-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Eyebrow tone="brand">{activePaper.region} · {activePaper.field}</Eyebrow>
            <h1 className="mt-3 max-w-4xl font-serif text-3xl leading-tight text-ink-900">{activePaper.title}</h1>
            <p className="mt-3 text-sm text-ink-500">{activePaper.authors} · {activePaper.source} · {activePaper.year || '年份未录'}</p>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-3">
            {isAdmin && (
              <Button
                size="sm"
                variant="secondary"
                loading={generatingId === activePaper.id}
                onClick={() => onGenerateAiCard(activePaper.id)}
              >
                {generatingId === activePaper.id ? '生成中...' : 'AI 补全文献卡片'}
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled>AI 摘要</Button>
            <Button size="sm" variant="ghost" disabled>AI 精读问题</Button>
            <Button size="sm" variant="ghost" disabled>AI 文献对比</Button>
            <Button
              size="sm"
              variant="secondary"
              loading={readingRoomAddingId === activePaper.id}
              onClick={() => onAddToReadingRoom(activePaper)}
            >
              {readingRoomAddingId === activePaper.id ? '加入中...' : '加入深读室'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onOpenWritingMaterial(activePaper)}>
              加入论文写作素材
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <PaperMeta label="研究方法" value={activePaper.method} large />
          <PaperMeta label="核心结论" value={activePaper.finding} large />
        </div>
        <FrontierAiCard paper={activePaper} className="mt-6" />
        <div className="mt-6 rounded-2xl border border-line bg-surface" style={{ padding: 22 }}>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-500">Abstract / Reading Detail</p>
          <p className="mt-3 text-sm leading-relaxed text-ink-800">{activePaper.detail}</p>
          {activePaper.doi && <p className="mt-4 font-mono text-xs text-ink-500">DOI: {activePaper.doi}</p>}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {activePaper.link && (
            <a
              href={activePaper.link}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-medium text-ink-800 transition-colors hover:border-brand hover:text-brand"
            >
              打开论文链接
            </a>
          )}
          <span className="text-xs text-ink-400">本阶段不下载全文，不自动抓取。</span>
        </div>
      </Card>
    </section>
  )
}

function FrontierAiCard({
  paper,
  compact,
  className,
}: {
  paper: FrontierPaper
  compact?: boolean
  className?: string
}) {
  if (!paper.aiCardGeneratedAt) {
    return (
      <div
        className={cn('rounded-xl border border-dashed border-line bg-canvas px-5 py-4 text-sm text-ink-500', className)}
        style={{ '--bordered-text-px': '1.25rem', '--bordered-text-py': '1rem' } as React.CSSProperties}
      >
        尚未生成 AI 文献卡片
      </div>
    )
  }

  return (
    <div
      className={cn('rounded-xl border border-line bg-canvas px-5 py-5', className)}
      style={{ '--bordered-text-px': '1.25rem', '--bordered-text-py': '1.25rem' } as React.CSSProperties}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-500">AI 文献卡片</p>
        {paper.aiCardModel && <span className="font-mono text-xs text-ink-400">{paper.aiCardModel}</span>}
      </div>
      <div className={cn('grid grid-cols-1 gap-4', !compact && 'xl:grid-cols-2')}>
        <PaperMeta label="研究问题" value={paper.researchQuestion || '未生成'} />
        <PaperMeta label="研究方法" value={paper.method || '未生成'} />
        <PaperMeta label="核心结论" value={paper.finding || '未生成'} />
        <PaperMeta label="研究不足" value={paper.limitationSummary || '未生成'} />
        <PaperMeta label="研究意义" value={paper.significanceSummary || '未生成'} />
        <PaperMeta label="文献综述句" value={paper.literatureReviewSentence || '未生成'} large={!compact} />
      </div>
    </div>
  )
}

function FrontierSubscriptionsModal({
  form,
  subscriptions,
  loading,
  saving,
  error,
  onChange,
  onSubmit,
  onToggleActive,
  onDelete,
  onClose,
}: {
  form: SubscriptionFormState
  subscriptions: FrontierFieldSubscriptionRow[]
  loading: boolean
  saving: boolean
  error: string
  onChange: (patch: Partial<SubscriptionFormState>) => void
  onSubmit: (event: React.FormEvent) => void
  onToggleActive: (subscription: FrontierFieldSubscriptionRow) => void
  onDelete: (subscription: FrontierFieldSubscriptionRow) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-5 backdrop-blur-sm">
      <div className="max-h-[calc(100vh-40px)] w-full max-w-5xl overflow-auto rounded-2xl bg-white shadow-[var(--shadow-modal)]" style={{ padding: 32 }}>
        <div className="mb-7 flex items-start justify-between gap-5 border-b border-line pb-5">
          <div>
            <Eyebrow tone="brand">Subscriptions</Eyebrow>
            <h2 className="mt-2 font-serif text-2xl text-ink-900">领域订阅</h2>
            <p className="mt-2 text-sm text-ink-500">保存关注领域、地区和关键词，后续用于候选文献筛选。</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
        </div>

        {error && <p className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <form onSubmit={onSubmit} className="mb-7 rounded-2xl border border-line bg-surface" style={{ padding: 20 }}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_2fr_auto] lg:items-end">
            <Select
              label="领域"
              value={form.field}
              onChange={event => onChange({ field: event.target.value as FrontierField })}
            >
              {FRONTIER_FIELDS.map(field => <option key={field} value={field}>{field}</option>)}
            </Select>
            <Select
              label="国内 / 国外 / 全部"
              value={form.region}
              onChange={event => onChange({ region: event.target.value as SubscriptionRegion })}
            >
              {REGION_FILTERS.map(region => <option key={region} value={region}>{region}</option>)}
            </Select>
            <Input
              label="关键词"
              value={form.keywords}
              onChange={event => onChange({ keywords: event.target.value })}
              placeholder="AI 翻译, 后编辑, 语料库"
            />
            <div className="flex flex-col gap-3">
              <label className="flex min-h-10 items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={event => onChange({ is_active: event.target.checked })}
                  className="h-4 w-4 accent-brand"
                />
                启用
              </label>
              <Button variant="primary" type="submit" loading={saving}>添加订阅</Button>
            </div>
          </div>
        </form>

        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-serif text-xl text-ink-900">我的订阅</h3>
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-400">{subscriptions.length} subscriptions</span>
        </div>

        {loading ? (
          <Card padding="md" variant="surface">
            <p className="text-sm text-ink-500">正在加载领域订阅...</p>
          </Card>
        ) : subscriptions.length === 0 ? (
          <Card padding="md" variant="surface">
            <p className="text-sm text-ink-500">暂无订阅。添加一个领域后，会保存在你的个人订阅列表中。</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {subscriptions.map(subscription => {
              const active = !!subscription.is_active
              return (
                <Card key={subscription.id} padding="md" className={cn(!active && 'opacity-70')}>
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <div className="mb-2 flex flex-wrap gap-2">
                        <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-700">{subscription.field}</span>
                        <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-700">{subscription.region || '全部'}</span>
                        <span className={cn(
                          'rounded-full px-3 py-1 text-xs',
                          active ? 'bg-emerald-50 text-emerald-700' : 'bg-canvas text-ink-500'
                        )}>
                          {active ? '启用中' : '已停用'}
                        </span>
                      </div>
                      <p className="text-xs text-ink-500">创建：{formatDateTime(subscription.created_at)}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => onToggleActive(subscription)}>
                        {active ? '停用' : '启用'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onDelete(subscription)}>删除</Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(subscription.keywords || []).length > 0 ? (
                      (subscription.keywords || []).map(keyword => (
                        <span key={keyword} className="rounded-full bg-canvas px-2.5 py-1 text-xs text-ink-500">{keyword}</span>
                      ))
                    ) : (
                      <span className="text-sm text-ink-400">未设置关键词</span>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function WritingMaterialModal({
  paper,
  projects,
  selectedProjectId,
  loading,
  saving,
  error,
  onSelect,
  onSubmit,
  onClose,
}: {
  paper: FrontierPaper
  projects: WritingProjectOption[]
  selectedProjectId: string
  loading: boolean
  saving: boolean
  error: string
  onSelect: (projectId: string) => void
  onSubmit: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-5 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-[var(--shadow-modal)]" style={{ padding: 32 }}>
        <div className="mb-7 flex items-start justify-between gap-5 border-b border-line pb-5">
          <div>
            <Eyebrow tone="brand">Writing Material</Eyebrow>
            <h2 className="mt-2 font-serif text-2xl text-ink-900">加入论文写作素材</h2>
            <p className="mt-2 line-clamp-2 text-sm text-ink-500">{paper.title}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
        </div>

        {error && <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {loading ? (
          <Card padding="md" variant="surface">
            <p className="text-sm text-ink-500">正在加载论文项目...</p>
          </Card>
        ) : projects.length === 0 ? (
          <Card padding="md" variant="surface">
            <p className="text-sm text-ink-500">暂无论文项目。请先在论文写作工坊创建论文。</p>
          </Card>
        ) : (
          <div className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink-700">选择论文项目</span>
              <select
                value={selectedProjectId}
                onChange={event => onSelect(event.target.value)}
                className="w-full rounded-xl border-2 border-line bg-white text-sm text-ink-900 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
                style={{ padding: '11px 14px' }}
              >
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.title} · {project.language === 'en' ? 'English Paper' : '中文论文'} · {project.paper_type || '未记录类型'}
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-600">
              <p className="font-medium text-ink-900">{paper.authors}</p>
              <p className="mt-1">{paper.source} · {paper.year || '年份未录'} · {paper.field}</p>
            </div>
          </div>
        )}

        <div className="mt-7 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            disabled={loading || projects.length === 0 || !selectedProjectId}
            loading={saving}
            onClick={onSubmit}
          >
            加入素材
          </Button>
        </div>
      </div>
    </div>
  )
}

function ReadingSessionCreateModal({
  form,
  selectedCount,
  saving,
  onChange,
  onSubmit,
  onClose,
}: {
  form: ReadingSessionFormState
  selectedCount: number
  saving: boolean
  onChange: (patch: Partial<ReadingSessionFormState>) => void
  onSubmit: (event: React.FormEvent) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-5 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-[var(--shadow-modal)]" style={{ padding: 32 }}>
        <div className="mb-7 flex items-start justify-between gap-5 border-b border-line pb-5">
          <div>
            <Eyebrow tone="brand">Reading Session</Eyebrow>
            <h2 className="mt-2 font-serif text-2xl text-ink-900">创建阅读会话</h2>
            <p className="mt-2 text-sm text-ink-500">已选择 {selectedCount} 篇文献。</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
        </div>
        <form onSubmit={onSubmit} className="space-y-5">
          <Input
            label="会话标题"
            value={form.title}
            onChange={event => onChange({ title: event.target.value })}
            placeholder={defaultSessionTitle()}
            required
          />
          <Textarea
            label="会话说明"
            value={form.description}
            onChange={event => onChange({ description: event.target.value })}
            rows={4}
            placeholder="可选：记录本次阅读目标、论文主题或比较维度"
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={onClose}>取消</Button>
            <Button variant="primary" type="submit" loading={saving}>创建并进入阅读</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function FrontierAddModal({
  form,
  saving,
  error,
  onChange,
  onSubmit,
  onClose,
}: {
  form: FrontierFormState
  saving: boolean
  error: string
  onChange: (patch: Partial<FrontierFormState>) => void
  onSubmit: (event: React.FormEvent) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-5 backdrop-blur-sm">
      <div className="max-h-[calc(100vh-40px)] w-full max-w-4xl overflow-auto rounded-2xl bg-white shadow-[var(--shadow-modal)]" style={{ padding: 32 }}>
        <div className="mb-7 flex items-start justify-between gap-5 border-b border-line pb-5">
          <div>
            <Eyebrow tone="brand">Admin</Eyebrow>
            <h2 className="mt-2 font-serif text-2xl text-ink-900">添加文献</h2>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
        </div>
        <form onSubmit={onSubmit} className="space-y-5">
          <Input label="标题" value={form.title} onChange={event => onChange({ title: event.target.value })} placeholder="论文题目" required />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input label="作者" value={form.authors} onChange={event => onChange({ authors: event.target.value })} placeholder="作者列表" />
            <Input label="年份" type="number" value={form.year} onChange={event => onChange({ year: event.target.value })} placeholder="2026" />
            <Input label="来源" value={form.source} onChange={event => onChange({ source: event.target.value })} placeholder="期刊 / 会议 / 出版源" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select label="国内 / 国外" value={form.region} onChange={event => onChange({ region: event.target.value as FrontierRegion })}>
              <option value="国内">国内</option>
              <option value="国外">国外</option>
            </Select>
            <Select label="领域" value={form.field} onChange={event => onChange({ field: event.target.value as FrontierField })}>
              {FRONTIER_FIELDS.map(field => <option key={field} value={field}>{field}</option>)}
            </Select>
          </div>
          <Textarea label="研究方法" value={form.method_summary} onChange={event => onChange({ method_summary: event.target.value })} rows={3} />
          <Textarea label="核心结论" value={form.conclusion_summary} onChange={event => onChange({ conclusion_summary: event.target.value })} rows={3} />
          <Textarea label="摘要" value={form.abstract} onChange={event => onChange({ abstract: event.target.value })} rows={4} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input label="DOI" value={form.doi} onChange={event => onChange({ doi: event.target.value })} placeholder="10.xxxx/xxxxx" />
            <Input label="链接" value={form.url} onChange={event => onChange({ url: event.target.value })} placeholder="https://..." />
            <Input label="标签" value={form.tags} onChange={event => onChange({ tags: event.target.value })} placeholder="逗号分隔" />
          </div>
          {error && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={onClose}>取消</Button>
            <Button variant="primary" type="submit" loading={saving}>保存文献</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function FrontierImportModal({
  form,
  results,
  selectedIndexes,
  searched,
  searching,
  saving,
  error,
  notice,
  onChange,
  onSearch,
  onToggle,
  onImport,
  onClose,
}: {
  form: FrontierImportFormState
  results: FrontierImportItem[]
  selectedIndexes: Set<number>
  searched: boolean
  searching: boolean
  saving: boolean
  error: string
  notice: string
  onChange: (patch: Partial<FrontierImportFormState>) => void
  onSearch: (event: React.FormEvent) => void
  onToggle: (index: number) => void
  onImport: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-5 backdrop-blur-sm">
      <div className="max-h-[calc(100vh-40px)] w-full max-w-6xl overflow-auto rounded-2xl bg-white shadow-[var(--shadow-modal)]" style={{ padding: 32 }}>
        <div className="mb-7 flex items-start justify-between gap-5 border-b border-line pb-5">
          <div>
            <Eyebrow tone="brand">OpenAlex</Eyebrow>
            <h2 className="mt-2 font-serif text-2xl text-ink-900">外部导入</h2>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
        </div>

        <form onSubmit={onSearch} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
            <Select
              label="搜索方式"
              value={form.searchMode}
              onChange={event => onChange({ searchMode: event.target.value as FrontierImportFormState['searchMode'] })}
            >
              <option value="keyword">关键词搜索</option>
              <option value="precise">精准搜索</option>
            </Select>
            <Input
              label={form.searchMode === 'precise' ? '题名 / DOI' : '关键词'}
              value={form.query}
              onChange={event => onChange({ query: event.target.value })}
              placeholder={form.searchMode === 'precise' ? '输入完整题名或 DOI' : 'machine translation / corpus translation'}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Select label="平台领域" value={form.field} onChange={event => onChange({ field: event.target.value as FrontierField })}>
              {FRONTIER_FIELDS.map(field => <option key={field} value={field}>{field}</option>)}
            </Select>
            <Input
              label="学科 / 主题"
              value={form.subject}
              onChange={event => onChange({ subject: event.target.value })}
              placeholder="translation studies / NLP"
            />
            <Select label="国内 / 国外" value={form.region} onChange={event => onChange({ region: event.target.value as FrontierRegion })}>
              <option value="国内">国内</option>
              <option value="国外">国外</option>
            </Select>
            <Input
              label="数量"
              type="number"
              min={1}
              max={30}
              value={form.limit}
              onChange={event => onChange({ limit: event.target.value })}
              placeholder="20"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="起始年份"
              type="number"
              value={form.fromYear}
              onChange={event => onChange({ fromYear: event.target.value })}
              placeholder="2024"
            />
            <Input
              label="结束年份"
              type="number"
              value={form.toYear}
              onChange={event => onChange({ toYear: event.target.value })}
              placeholder="2026"
            />
          </div>
          {error && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          {notice && <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</p>}
          <div className="flex justify-end">
            <Button variant="primary" type="submit" loading={searching}>搜索文献</Button>
          </div>
        </form>

        <div className="mt-7 border-t border-line pt-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-serif text-xl text-ink-900">搜索结果</h3>
              <p className="mt-1 text-sm text-ink-500">已选择 {selectedIndexes.size} / {results.length}</p>
            </div>
            <Button variant="primary" disabled={selectedIndexes.size === 0} loading={saving} onClick={onImport}>
              导入到前沿文献库
            </Button>
          </div>

          {searched && results.length === 0 ? (
            <Card padding="lg" variant="surface" className="text-center">
              <h4 className="font-serif text-lg text-ink-900">没有搜索结果</h4>
              <p className="mt-2 text-sm text-ink-500">调整关键词、年份或数量后再试。</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {results.map((item, index) => {
                const checked = selectedIndexes.has(index)
                return (
                  <article
                    key={`${item.doi || item.url || item.title}-${index}`}
                    className={cn(
                      'rounded-xl border bg-white transition-colors',
                      checked ? 'border-brand shadow-[var(--shadow-card)]' : 'border-line'
                    )}
                    style={{ padding: 18 }}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(index)}
                        className="mt-1 h-4 w-4 flex-shrink-0 accent-brand"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap gap-2">
                          <span className="rounded-full border border-line bg-canvas px-2.5 py-1 text-xs text-ink-500">{item.year || '年份未录'}</span>
                          <span className="rounded-full border border-line bg-canvas px-2.5 py-1 text-xs text-ink-500">{item.region}</span>
                          <span className="rounded-full border border-line bg-canvas px-2.5 py-1 text-xs text-ink-500">{item.field}</span>
                        </div>
                        <h4 className="font-serif text-lg leading-tight text-ink-900">{item.title || '未命名文献'}</h4>
                        <p className="mt-2 text-sm text-ink-500">{item.authors || '未记录作者'} · {item.source || '未记录来源'}</p>
                        {(item.doi || item.url) && (
                          <p className="mt-2 break-all font-mono text-xs text-ink-500">{item.doi || item.url}</p>
                        )}
                        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-700">{item.abstract || '暂无摘要。'}</p>
                        {item.tags.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {item.tags.map(tag => (
                              <span key={tag} className="rounded-full bg-canvas px-2.5 py-1 text-xs text-ink-500">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PaperMeta({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-ink-500">{label}</p>
      <p className={cn('leading-relaxed text-ink-800', large ? 'text-base' : 'text-sm')}>{value}</p>
    </div>
  )
}
