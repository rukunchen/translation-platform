'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { MainContent } from '@/components/ui/MainContent'
import { PageHeader } from '@/components/ui/PageHeader'
import { apiJSON } from '@/lib/apiFetch'
import { cn } from '@/components/ui/cn'
import { supabase } from '@/lib/supabase'
import { countPracticeWords } from '@/lib/translationPractice'

const ADMIN_EMAIL = 'rukunchen@hotmail.com'
const examSelect = 'id, created_by, title, exam_type, direction, difficulty, duration_minutes, source_text, reference_translation, scoring_note, voice_type, speech_rate, pause_mode, pause_seconds, segment_mode, tts_status, status, created_at, updated_at'

type ExamTypeId = 'erbi_practice' | 'erkou_practice' | 'sanbi_practice' | 'sankou_practice'
type SegmentMode = 'auto' | 'manual'
type SpeechRate = 'slow' | 'standard' | 'fast'
type VoiceType = 'male' | 'female' | 'neutral'
type PauseMode = 'auto' | 'fixed'

type ExamType = {
  id: ExamTypeId
  title: string
  note: string
  enabled: boolean
}

type CattiMockExam = {
  id: string
  created_by: string | null
  title: string
  exam_type: string
  direction: string
  difficulty: string | null
  duration_minutes: number | null
  source_text: string
  reference_translation: string | null
  scoring_note: string | null
  voice_type: VoiceType | string | null
  speech_rate: SpeechRate | string | null
  pause_mode: PauseMode | string | null
  pause_seconds: number | null
  segment_mode: SegmentMode | string | null
  tts_status: string | null
  status: 'draft' | 'published' | string
  created_at: string
  updated_at: string
}

type CattiMockAttempt = {
  id: string
  exam_id: string
  status: 'in_progress' | 'submitted' | 'scored' | string
  total_score: number | null
  submitted_at: string | null
  created_at: string
  updated_at: string
}

type CattiMockPassage = {
  id: string
  exam_id: string
  passage_order: number
  direction: 'E-C' | 'C-E' | string
  title: string | null
  source_text: string
  reference_translation: string | null
  scoring_note: string | null
  max_score: number | null
  created_at: string
  updated_at: string
}

type CattiMockSegment = {
  id: string
  exam_id: string
  segment_order: number
  passage_order: number | null
  passage_title: string | null
  direction: 'E-C' | 'C-E' | string | null
  segment_order_global: number | null
  segment_order_in_passage: number | null
  source_text: string
  reference_translation: string | null
  audio_url: string | null
  tts_voice: string | null
  speech_rate: SpeechRate | string | null
  estimated_play_seconds: number | null
  recording_seconds: number | null
  transition_seconds: number | null
  pause_seconds: number | null
  created_at: string
  updated_at: string
}

type GenerateAudioResponse = {
  exam?: Pick<CattiMockExam, 'id' | 'tts_status' | 'updated_at'>
  segments?: CattiMockSegment[]
  generated_count?: number
  skipped_count?: number
}

type PassageDraft = {
  id?: string
  passage_order: number
  direction: 'E-C' | 'C-E'
  title: string
  source_text: string
  reference_translation: string
  scoring_note: string
  max_score: string
}

type ExamDraft = {
  id?: string
  exam_type: 'erbi_practice' | 'erkou_practice'
  title: string
  direction: 'E-C' | 'C-E'
  difficulty: string
  duration_minutes: string
  source_text: string
  reference_translation: string
  scoring_note: string
  voice_type: VoiceType
  speech_rate: SpeechRate
  pause_mode: PauseMode
  pause_seconds: string
  segment_mode: SegmentMode
  passages: PassageDraft[]
  status: 'draft' | 'published'
}

const examTypes: ExamType[] = [
  { id: 'erbi_practice', title: 'CATTI 二笔实务', note: '已开放', enabled: true },
  { id: 'erkou_practice', title: 'CATTI 二口实务', note: '已开放', enabled: true },
  { id: 'sanbi_practice', title: 'CATTI 三笔实务', note: '暂未开放', enabled: false },
  { id: 'sankou_practice', title: 'CATTI 三口实务', note: '暂未开放', enabled: false },
]

const passageTemplate: Array<Pick<PassageDraft, 'passage_order' | 'direction'>> = [
  { passage_order: 1, direction: 'E-C' },
  { passage_order: 2, direction: 'E-C' },
  { passage_order: 3, direction: 'C-E' },
  { passage_order: 4, direction: 'C-E' },
]

function emptyExamDraft(examType: 'erbi_practice' | 'erkou_practice'): ExamDraft {
  return {
    exam_type: examType,
    title: '',
    direction: 'E-C',
    difficulty: '二级',
    duration_minutes: examType === 'erkou_practice' ? '60' : '180',
    source_text: '',
    reference_translation: '',
    scoring_note: '',
    voice_type: 'neutral',
    speech_rate: 'standard',
    pause_mode: 'auto',
    pause_seconds: '',
    segment_mode: 'auto',
    passages: defaultPassageDrafts(examType),
    status: 'draft',
  }
}

function defaultPassageDrafts(examType: 'erbi_practice' | 'erkou_practice'): PassageDraft[] {
  return passageTemplate.map(passage => ({
    ...passage,
    title: passageTitle(passage.passage_order, passage.direction, examType),
    source_text: '',
    reference_translation: '',
    scoring_note: '',
    max_score: '25',
  }))
}

function passageTitle(order: number, direction: string, examType: string = 'erbi_practice') {
  if (examType === 'erkou_practice') {
    if (order === 1) return '英译中口译段落一'
    if (order === 2) return '英译中口译段落二'
    if (order === 3) return '中译英口译段落一'
    if (order === 4) return '中译英口译段落二'
    return direction === 'C-E' ? '中译英口译段落' : '英译中口译段落'
  }
  if (order === 1) return '英译中一'
  if (order === 2) return '英译中二'
  if (order === 3) return '中译英一'
  if (order === 4) return '中译英二'
  return direction === 'C-E' ? '中译英' : '英译中'
}

function erkouSegmentCountForPassage(order: number) {
  return order <= 2 ? 5 : 4
}

function groupPassagesByExam(passages: CattiMockPassage[]) {
  return passages.reduce<Record<string, CattiMockPassage[]>>((out, passage) => {
    const list = out[passage.exam_id] ?? []
    list.push(passage)
    out[passage.exam_id] = list.sort((a, b) => a.passage_order - b.passage_order)
    return out
  }, {})
}

function groupSegmentsByExam(segments: CattiMockSegment[]) {
  return segments.reduce<Record<string, CattiMockSegment[]>>((out, segment) => {
    const list = out[segment.exam_id] ?? []
    list.push(segment)
    out[segment.exam_id] = list.sort((a, b) => (a.segment_order_global ?? a.segment_order) - (b.segment_order_global ?? b.segment_order))
    return out
  }, {})
}

function passageDraftsFromExam(exam: CattiMockExam, passages: CattiMockPassage[]): PassageDraft[] {
  const byOrder = new Map(passages.map(passage => [passage.passage_order, passage]))
  const drafts = passageTemplate.map(template => {
    const passage = byOrder.get(template.passage_order)
    return {
      id: passage?.id,
      passage_order: template.passage_order,
      direction: template.direction,
      title: passage?.title || passageTitle(template.passage_order, template.direction, exam.exam_type),
      source_text: passage?.source_text || '',
      reference_translation: passage?.reference_translation || '',
      scoring_note: passage?.scoring_note || '',
      max_score: String(passage?.max_score ?? 25),
    }
  })

  if (passages.length === 0 && exam.source_text) {
    drafts[0] = {
      ...drafts[0],
      source_text: exam.source_text,
      reference_translation: exam.reference_translation || '',
      scoring_note: exam.scoring_note || '',
      max_score: '100',
    }
  }

  return drafts
}

function erkouPassageDraftsFromSegments(exam: CattiMockExam, segments: CattiMockSegment[]): PassageDraft[] {
  return passageTemplate.map(template => {
    const passageSegments = segments
      .filter(segment => (segment.passage_order ?? fallbackPassageOrder(segment.segment_order)) === template.passage_order)
      .sort((a, b) => (a.segment_order_in_passage ?? a.segment_order) - (b.segment_order_in_passage ?? b.segment_order))
    return {
      passage_order: template.passage_order,
      direction: template.direction,
      title: passageSegments[0]?.passage_title || passageTitle(template.passage_order, template.direction, exam.exam_type),
      source_text: passageSegments.map(segment => segment.source_text).filter(Boolean).join('\n\n'),
      reference_translation: passageSegments.map(segment => segment.reference_translation || '').filter(Boolean).join('\n\n'),
      scoring_note: template.passage_order === 1 ? exam.scoring_note || '' : '',
      max_score: '25',
    }
  })
}

function fallbackPassageOrder(segmentOrder: number) {
  if (segmentOrder <= 5) return 1
  if (segmentOrder <= 10) return 2
  if (segmentOrder <= 14) return 3
  return 4
}

function isChineseText(text: string) {
  return /[\u4e00-\u9fff]/.test(text)
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function chineseCharCount(text: string) {
  return (text.match(/[\u4e00-\u9fff]/g) ?? []).length
}

function segmentLength(text: string, chinese: boolean) {
  return chinese ? chineseCharCount(text) : wordCount(text)
}

function splitSentences(text: string) {
  const matches = text.match(/[^。！？.!?]+[。！？.!?]?/g)
  return matches?.map(item => item.trim()).filter(Boolean) ?? [text.trim()].filter(Boolean)
}

function splitLongBlock(block: string, chinese: boolean) {
  const maxLength = chinese ? 200 : 120
  const minLength = chinese ? 100 : 60
  const sentences = splitSentences(block)
  const segments: string[] = []
  let current = ''

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence
    if (current && segmentLength(next, chinese) > maxLength && segmentLength(current, chinese) >= minLength) {
      segments.push(current)
      current = sentence
    } else {
      current = next
    }
  }

  if (current) segments.push(current)
  return segments
}

function splitFixedSegments(sourceText: string, direction: string, targetCount: number) {
  const text = sourceText.trim()
  if (!text) return []
  const blocks = text.split(/\n\s*\n/g).map(block => block.trim()).filter(Boolean)
  if (blocks.length === targetCount) return blocks

  const units = blocks.length > targetCount ? blocks : splitSentences(text)
  const chinese = direction === 'C-E' || isChineseText(text)
  const totalLength = Math.max(1, segmentLength(text, chinese))
  const targetLength = totalLength / targetCount
  const out: string[] = []
  let current = ''

  for (const unit of units) {
    if (out.length >= targetCount - 1) {
      current = current ? `${current} ${unit}` : unit
      continue
    }

    const next = current ? `${current} ${unit}` : unit
    const currentLength = segmentLength(current, chinese)
    const nextLength = segmentLength(next, chinese)
    if (current && nextLength > targetLength && Math.abs(currentLength - targetLength) <= Math.abs(nextLength - targetLength)) {
      out.push(current)
      current = unit
    } else {
      current = next
    }
  }
  if (current) out.push(current)

  while (out.length < targetCount && out.length > 0) {
    const longestIndex = out.reduce((best, item, index) => segmentLength(item, chinese) > segmentLength(out[best], chinese) ? index : best, 0)
    const parts = splitSentences(out[longestIndex])
    if (parts.length < 2) break
    const midpoint = Math.ceil(parts.length / 2)
    out.splice(longestIndex, 1, parts.slice(0, midpoint).join(' '), parts.slice(midpoint).join(' '))
  }

  return out.slice(0, targetCount)
}

function splitErkouSegments(sourceText: string, segmentMode: SegmentMode) {
  const blocks = sourceText
    .split(/\n\s*\n/g)
    .map(block => block.trim())
    .filter(Boolean)

  if (segmentMode === 'manual') return blocks

  return blocks.flatMap(block => {
    const chinese = isChineseText(block)
    const maxLength = chinese ? 200 : 120
    if (segmentLength(block, chinese) <= maxLength) return [block]
    return splitLongBlock(block, chinese)
  })
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function estimatePauseSeconds(text: string, fixedPauseSeconds?: number | null) {
  if (fixedPauseSeconds && Number.isFinite(fixedPauseSeconds)) {
    return clampNumber(Math.round(fixedPauseSeconds), 20, 90)
  }

  const chinese = isChineseText(text)
  const units = chinese ? Math.ceil(chineseCharCount(text) / 20) : Math.ceil(wordCount(text) / 10)
  return clampNumber(units * 7, 20, 90)
}

function estimatePlaySeconds(text: string, direction: string) {
  if (direction === 'C-E') return Math.max(10, Math.round((chineseCharCount(text) / 200) * 60))
  return Math.max(10, Math.round((wordCount(text) / 130) * 60))
}

function estimateRecordingSeconds(text: string, direction: string) {
  const playSeconds = estimatePlaySeconds(text, direction)
  if (direction === 'C-E') return clampNumber(Math.round(playSeconds * 2), 75, 110)
  return clampNumber(Math.round(playSeconds * 1.5), 60, 90)
}

function erkouCountLabel(passage: PassageDraft) {
  if (passage.direction === 'C-E') return `${chineseCharCount(passage.source_text)} 中文字`
  return `${wordCount(passage.source_text)} words`
}

function erkouLengthHint(passage: PassageDraft) {
  const count = passage.direction === 'C-E' ? chineseCharCount(passage.source_text) : wordCount(passage.source_text)
  if (!count) return passage.direction === 'C-E' ? '建议约 500 中文字，自动切成 4 段。' : '建议约 500 英文词，自动切成 5 段。'
  if (count < 400) return passage.direction === 'C-E' ? '当前材料偏短；C-E 每篇建议约 500 中文字。' : '当前材料偏短；E-C 每篇建议约 500 英文词。'
  if (count > 650) return passage.direction === 'C-E' ? '当前材料偏长；C-E 每篇建议约 500 中文字。' : '当前材料偏长；E-C 每篇建议约 500 英文词。'
  return passage.direction === 'C-E' ? '长度接近建议范围，将自动切成 4 段。' : '长度接近建议范围，将自动切成 5 段。'
}

function legacyCombinedText(
  passages: Array<Pick<PassageDraft, 'passage_order' | 'direction' | 'title' | 'source_text' | 'reference_translation' | 'scoring_note'>>,
  key: 'source_text' | 'reference_translation' | 'scoring_note'
) {
  return passages
    .map(passage => {
      const text = passage[key]?.trim()
      if (!text) return ''
      return `【${passage.title || passageTitle(passage.passage_order, passage.direction)}】\n${text}`
    })
    .filter(Boolean)
    .join('\n\n')
}

export default function CattiMockCenterPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [selectedType, setSelectedType] = useState<ExamTypeId>('erbi_practice')
  const [exams, setExams] = useState<CattiMockExam[]>([])
  const [passagesByExam, setPassagesByExam] = useState<Record<string, CattiMockPassage[]>>({})
  const [segmentsByExam, setSegmentsByExam] = useState<Record<string, CattiMockSegment[]>>({})
  const [attempts, setAttempts] = useState<CattiMockAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [draft, setDraft] = useState<ExamDraft | null>(null)
  const [savingExam, setSavingExam] = useState(false)
  const [deletingExamId, setDeletingExamId] = useState<string | null>(null)
  const [statusBusyExamId, setStatusBusyExamId] = useState<string | null>(null)
  const [audioBusyExamId, setAudioBusyExamId] = useState<string | null>(null)

  const load = useCallback(async (uid: string, admin: boolean, examType: ExamTypeId) => {
    setLoading(true)
    setLoadError('')

    let examQuery = supabase
      .from('catti_mock_exams')
      .select(examSelect)
      .eq('exam_type', examType)
      .order('created_at', { ascending: false })

    if (!admin) examQuery = examQuery.eq('status', 'published')

    const examRes = await examQuery
    if (examRes.error) {
      setExams([])
      setPassagesByExam({})
      setSegmentsByExam({})
      setAttempts([])
      setLoadError(examRes.error.message)
      setLoading(false)
      return
    }

    const examRows = (examRes.data ?? []) as CattiMockExam[]
    setExams(examRows)

    const examIds = examRows.map(exam => exam.id)
    if (examIds.length === 0) {
      setPassagesByExam({})
      setSegmentsByExam({})
      setAttempts([])
      setLoading(false)
      return
    }

    if (examType === 'erkou_practice') {
      const segmentRes = await supabase
        .from('catti_mock_segments')
        .select('id, exam_id, segment_order, passage_order, passage_title, direction, segment_order_global, segment_order_in_passage, source_text, reference_translation, audio_url, tts_voice, speech_rate, estimated_play_seconds, recording_seconds, transition_seconds, pause_seconds, created_at, updated_at')
        .in('exam_id', examIds)
        .order('segment_order', { ascending: true })

      setPassagesByExam({})
      if (segmentRes.error) {
        setSegmentsByExam({})
        setLoadError(segmentRes.error.message)
      } else {
        setSegmentsByExam(groupSegmentsByExam((segmentRes.data ?? []) as CattiMockSegment[]))
      }
    } else {
      const passageRes = await supabase
        .from('catti_mock_passages')
        .select('id, exam_id, passage_order, direction, title, source_text, reference_translation, scoring_note, max_score, created_at, updated_at')
        .in('exam_id', examIds)
        .order('passage_order', { ascending: true })

      setSegmentsByExam({})
      if (passageRes.error) {
        setPassagesByExam({})
      } else {
        setPassagesByExam(groupPassagesByExam((passageRes.data ?? []) as CattiMockPassage[]))
      }
    }

    const attemptRes = await supabase
      .from('catti_mock_attempts')
      .select('id, exam_id, status, total_score, submitted_at, created_at, updated_at')
      .eq('user_id', uid)
      .in('exam_id', examIds)
      .order('created_at', { ascending: false })

    if (attemptRes.error) {
      setAttempts([])
      setLoadError(attemptRes.error.message)
      setLoading(false)
      return
    }

    setAttempts((attemptRes.data ?? []) as CattiMockAttempt[])
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user
      if (!user) {
        router.push('/')
        return
      }
      const admin = (user.email || '').toLowerCase() === ADMIN_EMAIL
      setUserId(user.id)
      setIsAdmin(admin)
    })
  }, [router])

  useEffect(() => {
    if (!userId) return
    void load(userId, isAdmin, selectedType)
  }, [isAdmin, load, selectedType, userId])

  const latestAttemptByExam = useMemo(() => {
    const map = new Map<string, CattiMockAttempt>()
    for (const attempt of attempts) {
      if (!map.has(attempt.exam_id)) map.set(attempt.exam_id, attempt)
    }
    return map
  }, [attempts])

  const latestScoredAttemptByExam = useMemo(() => {
    const map = new Map<string, CattiMockAttempt>()
    for (const attempt of attempts) {
      if (attempt.status === 'scored' && !map.has(attempt.exam_id)) map.set(attempt.exam_id, attempt)
    }
    return map
  }, [attempts])

  const latestCompletedAttemptByExam = useMemo(() => {
    const map = new Map<string, CattiMockAttempt>()
    for (const attempt of attempts) {
      if ((attempt.status === 'submitted' || attempt.status === 'scored') && !map.has(attempt.exam_id)) {
        map.set(attempt.exam_id, attempt)
      }
    }
    return map
  }, [attempts])

  function openCreateExam() {
    if (!isAdmin) return
    if (selectedType !== 'erbi_practice' && selectedType !== 'erkou_practice') return
    setDraft(emptyExamDraft(selectedType))
  }

  function openEditExam(exam: CattiMockExam) {
    if (!isAdmin) return
    setDraft({
      id: exam.id,
      exam_type: exam.exam_type === 'erkou_practice' ? 'erkou_practice' : 'erbi_practice',
      title: exam.title,
      direction: exam.direction === 'C-E' ? 'C-E' : 'E-C',
      difficulty: exam.difficulty || '二级',
      duration_minutes: String(exam.duration_minutes ?? (exam.exam_type === 'erkou_practice' ? 60 : 180)),
      source_text: exam.source_text || '',
      reference_translation: exam.reference_translation || '',
      scoring_note: exam.scoring_note || '',
      voice_type: exam.voice_type === 'male' || exam.voice_type === 'female' ? exam.voice_type : 'neutral',
      speech_rate: exam.speech_rate === 'slow' || exam.speech_rate === 'fast' ? exam.speech_rate : 'standard',
      pause_mode: exam.pause_mode === 'fixed' ? 'fixed' : 'auto',
      pause_seconds: exam.pause_seconds != null ? String(exam.pause_seconds) : '',
      segment_mode: exam.segment_mode === 'manual' ? 'manual' : 'auto',
      passages: exam.exam_type === 'erkou_practice'
        ? erkouPassageDraftsFromSegments(exam, segmentsByExam[exam.id] ?? [])
        : passageDraftsFromExam(exam, passagesByExam[exam.id] ?? []),
      status: exam.status === 'published' ? 'published' : 'draft',
    })
  }

  async function saveExam(e: React.FormEvent) {
    e.preventDefault()
    if (!isAdmin || !userId || !draft) return
    const title = draft.title.trim()
    const duration = Number(draft.duration_minutes)
    const isErkouDraft = draft.exam_type === 'erkou_practice'

    if (!Number.isFinite(duration) || duration <= 0) {
      alert('考试时间必须是大于 0 的数字。')
      return
    }

    if (isErkouDraft) {
      const fixedPause = draft.pause_mode === 'fixed' ? Number(draft.pause_seconds) : null
      const filledPassages = draft.passages.map(passage => ({
        ...passage,
        title: passage.title.trim() || passageTitle(passage.passage_order, passage.direction, draft.exam_type),
        source_text: passage.source_text.trim(),
        reference_translation: passage.reference_translation.trim(),
        scoring_note: passage.scoring_note.trim(),
      }))
      if (!title || filledPassages.some(passage => !passage.source_text)) {
        alert('请填写标题，并完整填写 4 篇二口材料。')
        return
      }
      if (draft.pause_mode === 'fixed' && (!Number.isFinite(fixedPause) || !fixedPause || fixedPause <= 0)) {
        alert('固定停顿秒数必须是大于 0 的数字。')
        return
      }
      if (draft.id && !confirm('修改二口模考会重新生成段落，是否继续？')) return

      const payload = {
        title,
        direction: 'E-C',
        difficulty: draft.difficulty.trim() || '二级',
        duration_minutes: Math.round(duration || 60),
        source_text: legacyCombinedText(filledPassages, 'source_text'),
        reference_translation: legacyCombinedText(filledPassages, 'reference_translation') || null,
        scoring_note: legacyCombinedText(filledPassages, 'scoring_note') || draft.scoring_note.trim() || null,
        voice_type: draft.voice_type,
        speech_rate: draft.speech_rate,
        pause_mode: draft.pause_mode,
        pause_seconds: draft.pause_mode === 'fixed' ? Math.round(fixedPause as number) : null,
        segment_mode: draft.segment_mode,
        tts_status: 'not_generated',
        status: draft.status,
      }

      setSavingExam(true)
      const result = draft.id
        ? await supabase
            .from('catti_mock_exams')
            .update(payload)
            .eq('id', draft.id)
            .select(examSelect)
            .single()
        : await supabase
            .from('catti_mock_exams')
            .insert({
              ...payload,
              created_by: userId,
              exam_type: 'erkou_practice',
            })
            .select(examSelect)
            .single()

      if (result.error || !result.data) {
        setSavingExam(false)
        alert('保存失败：' + (result.error?.message ?? '未知错误'))
        return
      }

      const saved = result.data as CattiMockExam
      const deleteRes = await supabase.from('catti_mock_segments').delete().eq('exam_id', saved.id)
      if (deleteRes.error) {
        setSavingExam(false)
        alert('重建段落失败：' + deleteRes.error.message)
        return
      }

      let globalOrder = 1
      const segmentRows = filledPassages.flatMap(passage => {
        const targetCount = erkouSegmentCountForPassage(passage.passage_order)
        const segmentTexts = splitFixedSegments(passage.source_text, passage.direction, targetCount)
        const referenceSegments = passage.reference_translation
          ? splitFixedSegments(passage.reference_translation, passage.direction === 'E-C' ? 'C-E' : 'E-C', targetCount)
          : []
        return segmentTexts.map((text, index) => {
          const estimatedPlaySeconds = estimatePlaySeconds(text, passage.direction)
          const recordingSeconds = estimateRecordingSeconds(text, passage.direction)
          const row = {
            exam_id: saved.id,
            segment_order: globalOrder,
            passage_order: passage.passage_order,
            passage_title: passage.title,
            direction: passage.direction,
            segment_order_global: globalOrder,
            segment_order_in_passage: index + 1,
            source_text: text,
            reference_translation: referenceSegments[index] || null,
            audio_url: null,
            tts_voice: draft.voice_type,
            speech_rate: draft.speech_rate,
            estimated_play_seconds: estimatedPlaySeconds,
            recording_seconds: recordingSeconds,
            transition_seconds: 5,
            pause_seconds: draft.pause_mode === 'fixed' ? estimatePauseSeconds(text, fixedPause) : recordingSeconds,
          }
          globalOrder += 1
          return row
        })
      })
      const insertSegmentsRes = await supabase
        .from('catti_mock_segments')
        .insert(segmentRows)
        .select('id, exam_id, segment_order, passage_order, passage_title, direction, segment_order_global, segment_order_in_passage, source_text, reference_translation, audio_url, tts_voice, speech_rate, estimated_play_seconds, recording_seconds, transition_seconds, pause_seconds, created_at, updated_at')

      setSavingExam(false)
      if (insertSegmentsRes.error) {
        alert('段落保存失败：' + insertSegmentsRes.error.message)
        return
      }

      setSegmentsByExam(prev => ({ ...prev, [saved.id]: (insertSegmentsRes.data ?? []) as CattiMockSegment[] }))
      setExams(prev => draft.id
        ? prev.map(exam => exam.id === saved.id ? saved : exam)
        : [saved, ...prev])
      setDraft(null)
      return
    }

    const filledPassages = draft.passages
      .map(passage => ({
        ...passage,
        title: passage.title.trim(),
        source_text: passage.source_text.trim(),
        reference_translation: passage.reference_translation.trim(),
        scoring_note: passage.scoring_note.trim(),
      }))
      .filter(passage => passage.source_text)
    if (!title || filledPassages.length === 0) {
      alert('请填写标题，并至少填写一篇原文。')
      return
    }
    if (draft.status === 'published' && filledPassages.length < 4) {
      alert('发布完整二笔实务模考前，请填写 2 篇 E-C 和 2 篇 C-E 原文。')
      return
    }

    const payload = {
      title,
      direction: draft.direction,
      difficulty: draft.difficulty.trim() || '二级',
      duration_minutes: Math.round(duration),
      source_text: legacyCombinedText(filledPassages, 'source_text'),
      reference_translation: legacyCombinedText(filledPassages, 'reference_translation') || null,
      scoring_note: legacyCombinedText(filledPassages, 'scoring_note') || null,
      status: draft.status,
    }

    setSavingExam(true)
    const result = draft.id
      ? await supabase
          .from('catti_mock_exams')
          .update(payload)
          .eq('id', draft.id)
          .select(examSelect)
          .single()
      : await supabase
          .from('catti_mock_exams')
          .insert({
            ...payload,
            created_by: userId,
            exam_type: draft.exam_type,
          })
          .select(examSelect)
          .single()

    if (result.error || !result.data) {
      setSavingExam(false)
      alert('保存失败：' + (result.error?.message ?? '未知错误'))
      return
    }

    const saved = result.data as CattiMockExam
    const passageRows = filledPassages.map(passage => ({
      exam_id: saved.id,
      passage_order: passage.passage_order,
      direction: passage.direction,
      title: passage.title || passageTitle(passage.passage_order, passage.direction, draft.exam_type),
      source_text: passage.source_text,
      reference_translation: passage.reference_translation || null,
      scoring_note: passage.scoring_note || null,
      max_score: Number(passage.max_score) || 25,
    }))

    const upsertRes = await supabase
      .from('catti_mock_passages')
      .upsert(passageRows, { onConflict: 'exam_id,passage_order' })
      .select('id, exam_id, passage_order, direction, title, source_text, reference_translation, scoring_note, max_score, created_at, updated_at')
    if (upsertRes.error) {
      setSavingExam(false)
      alert('篇章保存失败：' + upsertRes.error.message)
      return
    }

    const emptySavedPassages = draft.passages.filter(passage => passage.id && !passage.source_text.trim())
    for (const passage of emptySavedPassages) {
      await supabase.from('catti_mock_passages').delete().eq('id', passage.id)
    }

    const passageRes = await supabase
      .from('catti_mock_passages')
      .select('id, exam_id, passage_order, direction, title, source_text, reference_translation, scoring_note, max_score, created_at, updated_at')
      .eq('exam_id', saved.id)
      .order('passage_order', { ascending: true })
    setSavingExam(false)
    if (passageRes.error) {
      alert('读取篇章失败：' + passageRes.error.message)
      return
    }

    const savedPassages = (passageRes.data ?? []) as CattiMockPassage[]
    setPassagesByExam(prev => ({ ...prev, [saved.id]: savedPassages }))
    setExams(prev => draft.id
      ? prev.map(exam => exam.id === saved.id ? saved : exam)
      : [saved, ...prev])
    setDraft(null)
  }

  async function toggleExamStatus(exam: CattiMockExam) {
    if (!isAdmin) return
    const nextStatus = exam.status === 'published' ? 'draft' : 'published'
    setStatusBusyExamId(exam.id)
    const { data, error } = await supabase
      .from('catti_mock_exams')
      .update({ status: nextStatus })
      .eq('id', exam.id)
      .select(examSelect)
      .single()
    setStatusBusyExamId(null)

    if (error || !data) {
      alert('状态更新失败：' + (error?.message ?? '未知错误'))
      return
    }
    setExams(prev => prev.map(row => row.id === exam.id ? data as CattiMockExam : row))
  }

  async function deleteExam(exam: CattiMockExam) {
    if (!isAdmin) return
    const message = exam.exam_type === 'erkou_practice'
      ? '删除后该模考、分段和相关考试记录可能会被删除，是否继续？'
      : '删除后该模考和相关考试记录可能会受到影响，是否继续？当前数据库 exam_id 外键设置为 cascade，相关 attempts 会一并删除。'
    if (!confirm(message)) return
    setDeletingExamId(exam.id)
    const { error } = await supabase.from('catti_mock_exams').delete().eq('id', exam.id)
    setDeletingExamId(null)
    if (error) {
      alert('删除失败：' + error.message)
      return
    }
    setExams(prev => prev.filter(row => row.id !== exam.id))
    setPassagesByExam(prev => {
      const next = { ...prev }
      delete next[exam.id]
      return next
    })
    setSegmentsByExam(prev => {
      const next = { ...prev }
      delete next[exam.id]
      return next
    })
    setAttempts(prev => prev.filter(row => row.exam_id !== exam.id))
  }

  async function generateExamAudio(exam: CattiMockExam) {
    if (!isAdmin || exam.exam_type !== 'erkou_practice') return
    if (exam.tts_status === 'generating') {
      alert('这套二口模考的音频正在生成中，请稍后刷新查看。')
      return
    }
    const force = exam.tts_status === 'generated'
    if (force && !confirm('这套模考已有考试音频。是否重新生成并覆盖全部段落音频？')) return

    setAudioBusyExamId(exam.id)
    setExams(prev => prev.map(row => row.id === exam.id ? { ...row, tts_status: 'generating' } : row))

    const { data, error } = await apiJSON<GenerateAudioResponse>('/api/catti/erkou/generate-audio', {
      method: 'POST',
      body: JSON.stringify({ examId: exam.id, force }),
    })
    setAudioBusyExamId(null)

    if (error) {
      setExams(prev => prev.map(row => row.id === exam.id ? { ...row, tts_status: 'failed' } : row))
      alert('音频生成失败：' + error)
      return
    }

    if (data?.exam) {
      setExams(prev => prev.map(row => row.id === exam.id ? { ...row, tts_status: data.exam?.tts_status ?? row.tts_status, updated_at: data.exam?.updated_at ?? row.updated_at } : row))
    }
    if (data?.segments) {
      setSegmentsByExam(prev => ({ ...prev, [exam.id]: data.segments ?? [] }))
    }
    alert(`考试音频任务完成：生成 ${data?.generated_count ?? 0} 段，跳过 ${data?.skipped_count ?? 0} 段。`)
  }

  const selectedExamType = examTypes.find(type => type.id === selectedType) ?? examTypes[0]
  const selectedEnabled = selectedExamType.enabled
  const selectedIsErbi = selectedType === 'erbi_practice'
  const selectedIsErkou = selectedType === 'erkou_practice'
  const createButtonLabel = selectedIsErkou ? '新建二口模考' : '新建二笔模考'
  const listTitle = selectedIsErkou ? '二口实务模考列表' : '二笔实务模考列表'
  const listEyebrow = selectedIsErkou ? 'Erkou Practice' : 'Erbi Practice'
  const emptyTitle = selectedIsErkou ? '暂无 CATTI 二口实务模考' : '暂无可用模考'
  const emptyDescription = selectedIsErkou
    ? isAdmin ? '暂无 CATTI 二口实务模考。点击“新建二口模考”创建第一套题。' : '暂无 CATTI 二口实务模考。'
    : '发布二笔实务模考后会出现在这里。'

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="bg-white rounded-2xl border border-line min-h-[calc(100vh-40px)]">
          <MainContent size="wide">
            <PageHeader
              backHref="/practice"
              backLabel="返回译训库"
              eyebrow="CATTI Mock Exam"
              title="CATTI 模考中心"
              description="当前支持 CATTI 二笔实务与二口实务模拟考试。"
              actions={
                isAdmin ? (
                  <Button variant="secondary" onClick={openCreateExam}>{createButtonLabel}</Button>
                ) : null
              }
            />

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 mb-8">
              {examTypes.map(type => (
                <ExamTypeCard
                  key={type.id}
                  type={type}
                  selected={selectedType === type.id}
                  onClick={() => type.enabled && setSelectedType(type.id)}
                />
              ))}
            </section>

            {selectedEnabled && (
              <section>
                <div className="flex flex-col gap-3 border-b border-line pb-5 mb-6 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <Eyebrow tone="muted" className="mb-2">{listEyebrow}</Eyebrow>
                    <h2 className="font-serif text-xl text-ink-900">{listTitle}</h2>
                  </div>
                  <p className="text-xs text-ink-500">{isAdmin ? '管理员可查看草稿和已发布模考。' : '仅显示已发布模考。'}</p>
                </div>

                {loading ? (
                  <Card padding="lg" className="text-center text-sm text-ink-500">加载中...</Card>
                ) : loadError ? (
                  <Card padding="lg" className="text-center text-sm text-red-600">加载失败：{loadError}</Card>
                ) : exams.length === 0 ? (
                  <Card padding="lg" variant="surface" className="text-center py-16">
                    <h3 className="font-serif text-xl text-ink-900 mb-3">{emptyTitle}</h3>
                    <p className="text-sm text-ink-600">{emptyDescription}</p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {exams.map(exam => {
                      const latestCompletedAttempt = latestCompletedAttemptByExam.get(exam.id)
                      const passages = passagesByExam[exam.id] ?? []
                      const segments = segmentsByExam[exam.id] ?? []
                      return (
                        <MockExamCard
                          key={exam.id}
                          exam={exam}
                          passages={passages}
                          segments={segments}
                          latestAttempt={latestAttemptByExam.get(exam.id)}
                          latestScoredAttempt={latestScoredAttemptByExam.get(exam.id)}
                          latestCompletedAttempt={latestCompletedAttempt}
                          isAdmin={isAdmin}
                          deleting={deletingExamId === exam.id}
                          statusBusy={statusBusyExamId === exam.id}
                          audioBusy={audioBusyExamId === exam.id || exam.tts_status === 'generating'}
                          onEdit={() => openEditExam(exam)}
                          onDelete={() => { void deleteExam(exam) }}
                          onToggleStatus={() => { void toggleExamStatus(exam) }}
                          onGenerateAudio={() => { void generateExamAudio(exam) }}
                          onStart={() => {
                            if (selectedIsErbi || selectedIsErkou) {
                              router.push(`/practice/catti/exam/${exam.id}`)
                            } else {
                              alert('该考试类型作答页面将在后续阶段开放。')
                            }
                          }}
                          onReport={() => {
                            if (!latestCompletedAttempt) return
                            if (selectedIsErbi || selectedIsErkou) {
                              router.push(`/practice/catti/report/${latestCompletedAttempt.id}`)
                            } else {
                              alert('该考试类型报告页面将在后续阶段开放。')
                            }
                          }}
                        />
                      )
                    })}
                  </div>
                )}
              </section>
            )}
          </MainContent>
        </div>
      </main>

      {draft && (
        <ExamEditorModal
          draft={draft}
          saving={savingExam}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSubmit={saveExam}
        />
      )}
    </div>
  )
}

function ExamTypeCard({
  type,
  selected,
  onClick,
}: {
  type: ExamType
  selected: boolean
  onClick: () => void
}) {
  return (
    <Card
      padding="md"
      variant={selected ? 'default' : 'surface'}
      interactive={type.enabled}
      onClick={type.enabled ? onClick : undefined}
      className={cn(!type.enabled && 'opacity-65')}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-xl text-ink-900 mb-2">{type.title}</h2>
          <p className={cn('text-sm', type.enabled ? 'text-brand' : 'text-ink-500')}>{type.note}</p>
        </div>
        <span className={cn(
          'rounded-full border px-2 py-1 text-[11px]',
          selected ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-line bg-white text-ink-500'
        )}>
          {type.enabled ? '可用' : '未开放'}
        </span>
      </div>
    </Card>
  )
}

function MockExamCard({
  exam,
  passages,
  segments,
  latestAttempt,
  latestScoredAttempt,
  latestCompletedAttempt,
  isAdmin,
  deleting,
  statusBusy,
  audioBusy,
  onEdit,
  onDelete,
  onToggleStatus,
  onGenerateAudio,
  onStart,
  onReport,
}: {
  exam: CattiMockExam
  passages: CattiMockPassage[]
  segments: CattiMockSegment[]
  latestAttempt?: CattiMockAttempt
  latestScoredAttempt?: CattiMockAttempt
  latestCompletedAttempt?: CattiMockAttempt
  isAdmin: boolean
  deleting: boolean
  statusBusy: boolean
  audioBusy: boolean
  onEdit: () => void
  onDelete: () => void
  onToggleStatus: () => void
  onGenerateAudio: () => void
  onStart: () => void
  onReport: () => void
}) {
  const isErkou = exam.exam_type === 'erkou_practice'
  const segmentCount = isErkou ? (segments.length || 1) : (passages.length || 1)
  const sourceWordCount = passages.length > 0
    ? passages.reduce((sum, passage) => sum + countPracticeWords(passage.source_text), 0)
    : countPracticeWords(exam.source_text)

  return (
    <Card padding="md" className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-line bg-canvas px-2 py-1 text-[11px] text-ink-600">{isErkou ? displayDirection(exam.direction) : displayExamDirections(exam, passages)}</span>
            <span className="rounded-full border border-line bg-canvas px-2 py-1 text-[11px] text-ink-600">{exam.difficulty || '二级'}</span>
            {(isAdmin || isErkou) && <StatusBadge status={exam.status} />}
          </div>
          <h3 className="font-serif text-xl text-ink-900 leading-snug">{exam.title}</h3>
          {isErkou && <p className="mt-2 text-xs text-ink-500">考试类型：CATTI 二口实务</p>}
        </div>
        <div className="text-left sm:text-right">
          <p className="font-mono text-2xl text-ink-900 leading-none">{exam.duration_minutes ?? 180}</p>
          <p className="mt-1 text-xs text-ink-500">{isErkou ? '预计分钟' : '分钟'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ExamMeta label={isErkou ? '段落数量' : '篇章'} value={`${segmentCount} ${isErkou ? '段' : '篇'}`} />
        <ExamMeta label={isErkou ? '预计考试时间' : '题目字数'} value={isErkou ? `${exam.duration_minutes ?? 30} 分钟` : String(sourceWordCount)} />
        <ExamMeta label="是否已参加" value={latestAttempt ? '已参加' : '未参加'} />
        <ExamMeta label={isErkou ? '音频状态' : '最近成绩'} value={isErkou ? displayTtsStatus(exam.tts_status) : (latestScoredAttempt?.total_score != null ? `${latestScoredAttempt.total_score}` : '暂无')} />
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        {isAdmin && (
          <>
            {isErkou && (
              <Button size="sm" variant="secondary" loading={audioBusy} disabled={audioBusy} onClick={onGenerateAudio}>
                {audioBusy ? '音频生成中' : exam.tts_status === 'generated' ? '重新生成音频' : exam.tts_status === 'failed' ? '补生成音频' : '生成考试音频'}
              </Button>
            )}
            <Button size="sm" variant="secondary" loading={statusBusy} onClick={onToggleStatus}>
              {exam.status === 'published' ? '设为草稿' : '发布'}
            </Button>
            <Button size="sm" variant="ghost" onClick={onEdit}>编辑</Button>
            <Button size="sm" variant="ghost" loading={deleting} onClick={onDelete}>删除</Button>
          </>
        )}
        {latestCompletedAttempt && <Button size="sm" variant="secondary" onClick={onReport}>查看报告</Button>}
        <Button size="sm" variant="primary" onClick={onStart}>
          {latestAttempt?.status === 'in_progress' ? '继续考试' : '开始考试'}
        </Button>
      </div>
    </Card>
  )
}

function ExamEditorModal({
  draft,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  draft: ExamDraft
  saving: boolean
  onChange: React.Dispatch<React.SetStateAction<ExamDraft | null>>
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
}) {
  const update = (patch: Partial<ExamDraft>) => onChange(prev => prev ? { ...prev, ...patch } : prev)
  const updatePassage = (index: number, patch: Partial<PassageDraft>) => {
    onChange(prev => {
      if (!prev) return prev
      return {
        ...prev,
        passages: prev.passages.map((passage, i) => i === index ? { ...passage, ...patch } : passage),
      }
    })
  }
  const isErkou = draft.exam_type === 'erkou_practice'

  return (
    <div className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-[var(--shadow-modal)] w-full max-w-5xl max-h-[calc(100vh-32px)] overflow-auto" style={{ padding: 40 }}>
        <div className="flex items-start justify-between gap-5 mb-7">
          <div>
            <Eyebrow tone="brand" className="mb-2">{isErkou ? 'Erkou Practice' : 'Erbi Practice'}</Eyebrow>
            <h2 className="font-serif text-2xl text-ink-900 mb-2">{draft.id ? `编辑${isErkou ? '二口' : '二笔'}模考` : `新建${isErkou ? '二口' : '二笔'}模考`}</h2>
            <p className="text-sm text-ink-600 leading-relaxed">
              {isErkou ? '一套二口实务模考固定包含 4 篇材料：2 篇 E-C 与 2 篇 C-E，保存后生成 18 个口译段落。' : '一套二笔实务模考包含 4 篇原文：2 篇 E-C 与 2 篇 C-E。'}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <Input
            label="标题"
            value={draft.title}
            onChange={e => update({ title: e.target.value })}
            placeholder={isErkou ? '例如：CATTI 二口实务模考 01' : '例如：CATTI 二笔实务模考 02'}
            required
          />
          {isErkou ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-xl border border-line bg-canvas/40 px-4 py-3">
                  <p className="mb-1 text-[11px] text-ink-500">考试结构</p>
                  <p className="text-sm font-medium text-ink-900">2 篇 E-C + 2 篇 C-E</p>
                </div>
                <Input
                  label="难度"
                  value={draft.difficulty}
                  onChange={e => update({ difficulty: e.target.value })}
                  placeholder="二级"
                />
                <Input
                  label="考试时长"
                  type="number"
                  min={1}
                  value={draft.duration_minutes}
                  onChange={e => update({ duration_minutes: e.target.value })}
                  placeholder="60"
                />
                <Select label="状态" value={draft.status} onChange={e => update({ status: e.target.value === 'published' ? 'published' : 'draft' })}>
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                </Select>
              </div>

              <div className="space-y-5">
                {draft.passages.map((passage, index) => (
                  <div key={passage.passage_order} className="rounded-2xl border border-line bg-canvas/30 p-5">
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">
                          {passage.direction} Passage {passage.passage_order <= 2 ? passage.passage_order : passage.passage_order - 2}
                        </p>
                        <h3 className="mt-1 font-serif text-xl text-ink-900">{passageTitle(passage.passage_order, passage.direction, draft.exam_type)}</h3>
                      </div>
                      <p className="text-xs text-ink-500">{erkouCountLabel(passage)} · 自动切成 {erkouSegmentCountForPassage(passage.passage_order)} 段</p>
                    </div>
                    <Textarea
                      label="原文"
                      hint={erkouLengthHint(passage)}
                      value={passage.source_text}
                      onChange={e => updatePassage(index, { source_text: e.target.value })}
                      rows={7}
                      placeholder={passage.direction === 'E-C' ? '粘贴约 500 英文词的英译汉材料' : '粘贴约 500 中文字的汉译英材料'}
                      inputClassName="min-h-[180px]"
                      required
                    />
                    <Textarea
                      label="参考译文"
                      value={passage.reference_translation}
                      onChange={e => updatePassage(index, { reference_translation: e.target.value })}
                      rows={4}
                      placeholder="可选；保存时会按对应篇章切分为参考段落"
                      inputClassName="mt-4 min-h-[110px]"
                    />
                  </div>
                ))}
                <Textarea
                  label="考试说明 / 评分说明"
                  value={draft.scoring_note}
                  onChange={e => update({ scoring_note: e.target.value })}
                  rows={5}
                  placeholder="可选，例如考试说明、评分重点、术语要求"
                  inputClassName="min-h-[130px]"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Select label="分段方式" value={draft.segment_mode} onChange={e => update({ segment_mode: e.target.value === 'manual' ? 'manual' : 'auto' })}>
                  <option value="auto">自动分段</option>
                  <option value="manual">手动分段</option>
                </Select>
                <Select label="播放速度" value={draft.speech_rate} onChange={e => update({ speech_rate: e.target.value === 'slow' || e.target.value === 'fast' ? e.target.value : 'standard' })}>
                  <option value="slow">偏慢</option>
                  <option value="standard">标准</option>
                  <option value="fast">偏快</option>
                </Select>
                <Select label="音色" value={draft.voice_type} onChange={e => update({ voice_type: e.target.value === 'male' || e.target.value === 'female' ? e.target.value : 'neutral' })}>
                  <option value="male">男声</option>
                  <option value="female">女声</option>
                  <option value="neutral">中性</option>
                </Select>
                <Select label="停顿方式" value={draft.pause_mode} onChange={e => update({ pause_mode: e.target.value === 'fixed' ? 'fixed' : 'auto' })}>
                  <option value="auto">自动</option>
                  <option value="fixed">固定秒数</option>
                </Select>
              </div>

              {draft.pause_mode === 'fixed' && (
                <Input
                  label="固定停顿秒数"
                  type="number"
                  min={1}
                  value={draft.pause_seconds}
                  onChange={e => update({ pause_seconds: e.target.value })}
                  placeholder="例如：45"
                  hint="保存时会限制在 20 至 90 秒之间。"
                />
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Input
                  label="难度"
                  value={draft.difficulty}
                  onChange={e => update({ difficulty: e.target.value })}
                  placeholder="二级"
                />
                <Input
                  label="考试时间"
                  type="number"
                  min={1}
                  value={draft.duration_minutes}
                  onChange={e => update({ duration_minutes: e.target.value })}
                  placeholder="180"
                />
                <Select label="状态" value={draft.status} onChange={e => update({ status: e.target.value === 'published' ? 'published' : 'draft' })}>
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                </Select>
              </div>

              <div className="space-y-5">
                {draft.passages.map((passage, index) => (
                  <div key={passage.passage_order} className="rounded-2xl border border-line bg-canvas/30 p-5">
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">
                          Passage {passage.passage_order} · {passage.direction}
                        </p>
                        <h3 className="mt-1 font-serif text-xl text-ink-900">{passageTitle(passage.passage_order, passage.direction, draft.exam_type)}</h3>
                      </div>
                      <p className="text-xs text-ink-500">原文 {countPracticeWords(passage.source_text)} 字 · {passage.max_score || '25'} 分</p>
                    </div>
                    <Input
                      label="篇章标题"
                      value={passage.title}
                      onChange={e => updatePassage(index, { title: e.target.value })}
                      placeholder={passageTitle(passage.passage_order, passage.direction, draft.exam_type)}
                      className="mb-4"
                    />
                    <Textarea
                      label="原文"
                      value={passage.source_text}
                      onChange={e => updatePassage(index, { source_text: e.target.value })}
                      rows={7}
                      placeholder="粘贴原创或授权使用的模考原文"
                      inputClassName="min-h-[180px]"
                    />
                    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <Textarea
                        label="参考译文"
                        value={passage.reference_translation}
                        onChange={e => updatePassage(index, { reference_translation: e.target.value })}
                        rows={6}
                        placeholder="可选"
                        inputClassName="min-h-[150px]"
                      />
                      <Textarea
                        label="评分说明"
                        value={passage.scoring_note}
                        onChange={e => updatePassage(index, { scoring_note: e.target.value })}
                        rows={6}
                        placeholder="可选，例如评分重点、扣分维度、术语要求"
                        inputClassName="min-h-[150px]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={onClose}>取消</Button>
            <Button variant="primary" type="submit" loading={saving}>{saving ? '保存中...' : '保存模考'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ExamMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-canvas/40 px-4 py-3">
      <p className="text-[11px] text-ink-500 mb-1">{label}</p>
      <p className="text-sm font-medium text-ink-900 truncate">{value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const published = status === 'published'
  return (
    <span className={cn(
      'rounded-full border px-2 py-1 text-[11px]',
      published ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'
    )}>
      {published ? '已发布' : '草稿'}
    </span>
  )
}

function displayTtsStatus(status: string | null) {
  if (status === 'generating') return '生成中'
  if (status === 'generated') return '已生成'
  if (status === 'failed') return '失败'
  return '未生成'
}

function displayDirection(value: string) {
  if (value === 'E-C') return '英译中'
  if (value === 'C-E') return '中译英'
  return value
}

function displayExamDirections(exam: CattiMockExam, passages: CattiMockPassage[]) {
  const directions = Array.from(new Set(passages.map(passage => passage.direction))).filter(Boolean)
  if (directions.length > 1) return '英译中 / 中译英'
  return displayDirection(directions[0] || exam.direction)
}
