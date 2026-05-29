'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { apiJSON } from '@/lib/apiFetch'
import { supabase } from '@/lib/supabase'
import { countPracticeWords } from '@/lib/translationPractice'

const ADMIN_EMAIL = 'rukunchen@hotmail.com'

const examSelect = 'id, title, exam_type, direction, difficulty, duration_minutes, source_text, status, created_at, updated_at'
const attemptSelect = 'id, exam_id, user_id, status, started_at, submitted_at, answer_text, created_at, updated_at'
const passageSelect = 'id, exam_id, passage_order, direction, title, source_text, max_score'
const attemptAnswerSelect = 'id, attempt_id, passage_id, answer_text'
const segmentSelect = 'id, exam_id, segment_order, passage_order, passage_title, direction, segment_order_global, segment_order_in_passage, source_text, reference_translation, audio_url, tts_voice, speech_rate, estimated_play_seconds, recording_seconds, transition_seconds, pause_seconds'
const attemptSegmentSelect = 'id, attempt_id, segment_id, user_audio_url, transcript'

type ErkouPhase = '准备中' | '正在播放原文' | '请开始口译' | '录音中' | '过渡中' | '本段完成'

type CattiMockExam = {
  id: string
  title: string
  exam_type: string
  direction: string
  difficulty: string | null
  duration_minutes: number | null
  source_text: string
  status: string
  created_at: string
  updated_at: string
}

type CattiMockAttempt = {
  id: string
  exam_id: string
  user_id: string
  status: 'in_progress' | 'submitted' | 'scored' | string
  started_at: string
  submitted_at: string | null
  answer_text: string | null
  created_at: string
  updated_at: string
}

type CattiMockPassage = {
  id: string
  exam_id: string
  passage_order: number
  direction: string
  title: string | null
  source_text: string
  max_score: number | null
}

type CattiMockAttemptAnswer = {
  id: string
  attempt_id: string
  passage_id: string
  answer_text: string | null
}

type CattiMockSegment = {
  id: string
  exam_id: string
  segment_order: number
  passage_order: number | null
  passage_title: string | null
  direction: string | null
  segment_order_global: number | null
  segment_order_in_passage: number | null
  source_text: string
  reference_translation: string | null
  audio_url: string | null
  tts_voice: string | null
  speech_rate: string | null
  estimated_play_seconds: number | null
  recording_seconds: number | null
  transition_seconds: number | null
  pause_seconds: number | null
}

type SegmentRecording = {
  url: string
  size: number
  uploaded: boolean
  blob?: Blob
  uploading?: boolean
  error?: string
}

type CattiMockAttemptSegment = {
  id: string
  attempt_id: string
  segment_id: string
  user_audio_url: string | null
  transcript: string | null
}

type UploadRecordingResponse = {
  attemptSegment?: CattiMockAttemptSegment
}

export default function CattiExamPage() {
  const router = useRouter()
  const params = useParams()
  const examId = String(params.examId || '')
  const [userId, setUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [exam, setExam] = useState<CattiMockExam | null>(null)
  const [attempt, setAttempt] = useState<CattiMockAttempt | null>(null)
  const [passages, setPassages] = useState<CattiMockPassage[]>([])
  const [segments, setSegments] = useState<CattiMockSegment[]>([])
  const [activePassageId, setActivePassageId] = useState('')
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0)
  const [answersByPassage, setAnswersByPassage] = useState<Record<string, string>>({})
  const [erkouPhase, setErkouPhase] = useState<ErkouPhase>('准备中')
  const [playedSegments, setPlayedSegments] = useState<Record<string, boolean>>({})
  const [completedSegments, setCompletedSegments] = useState<Record<string, boolean>>({})
  const [recordingsBySegment, setRecordingsBySegment] = useState<Record<string, SegmentRecording>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const [timeExpired, setTimeExpired] = useState(false)
  const [phaseRemainingSeconds, setPhaseRemainingSeconds] = useState<number | null>(null)
  const playbackTimerRef = useRef<number | null>(null)
  const recordingTimerRef = useRef<number | null>(null)
  const transitionTimerRef = useRef<number | null>(null)
  const phaseCountdownRef = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<BlobPart[]>([])
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const autoFlowRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')

    const { data: userData } = await supabase.auth.getUser()
    const user = userData.user
    if (!user) {
      router.push('/')
      return
    }

    const admin = (user.email || '').toLowerCase() === ADMIN_EMAIL
    setUserId(user.id)
    setIsAdmin(admin)

    let examQuery = supabase
      .from('catti_mock_exams')
      .select(examSelect)
      .eq('id', examId)

    if (!admin) examQuery = examQuery.eq('status', 'published')

    const examRes = await examQuery.maybeSingle()
    if (examRes.error || !examRes.data) {
      setLoadError('模考不存在、未发布，或你没有权限进入。')
      setLoading(false)
      return
    }

    const examRow = examRes.data as CattiMockExam
    setExam(examRow)

    let availablePassages: CattiMockPassage[] = []
    let availableSegments: CattiMockSegment[] = []
    if (examRow.exam_type === 'erkou_practice') {
      const segmentRes = await supabase
        .from('catti_mock_segments')
        .select(segmentSelect)
        .eq('exam_id', examId)
        .order('segment_order', { ascending: true })

      if (segmentRes.error) {
        setLoadError('无法读取二口段落：' + segmentRes.error.message)
        setLoading(false)
        return
      }

      const segmentRows = (segmentRes.data ?? []) as CattiMockSegment[]
      if (segmentRows.length === 0) {
        setLoadError('这套二口模考还没有段落。')
        setLoading(false)
        return
      }

      availableSegments = segmentRows
      setSegments(segmentRows)
      setPassages([])
      setActiveSegmentIndex(0)
      setErkouPhase('准备中')
      setPlayedSegments({})
      setCompletedSegments({})
      setRecordingsBySegment({})
    } else if (examRow.exam_type === 'erbi_practice') {
      const passageRes = await supabase
        .from('catti_mock_passages')
        .select(passageSelect)
        .eq('exam_id', examId)
        .order('passage_order', { ascending: true })

      if (passageRes.error) {
        setLoadError('无法读取模考篇章：' + passageRes.error.message)
        setLoading(false)
        return
      }

      const passageRows = (passageRes.data ?? []) as CattiMockPassage[]
      availablePassages = passageRows.length > 0 ? passageRows : [legacyPassageFromExam(examRow)]
      setPassages(availablePassages)
      setSegments([])
      setActivePassageId(availablePassages[0]?.id || '')
    } else {
      setLoadError('当前考试类型暂未开放作答页面。')
      setLoading(false)
      return
    }

    const attemptRes = await supabase
      .from('catti_mock_attempts')
      .select(attemptSelect)
      .eq('exam_id', examId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (attemptRes.error) {
      setLoadError(attemptRes.error.message)
      setLoading(false)
      return
    }

    const rows = (attemptRes.data ?? []) as CattiMockAttempt[]
    const activeAttempt = rows.find(row => row.status === 'in_progress')
    if (activeAttempt) {
      setAttempt(activeAttempt)
      if (examRow.exam_type === 'erbi_practice') {
        setAnswersByPassage(await loadAnswerMap(activeAttempt, availablePassages))
      } else if (examRow.exam_type === 'erkou_practice') {
        const recordingMap = await loadRecordingMap(activeAttempt, availableSegments)
        const completedMap = completedMapFromRecordings(recordingMap)
        const firstIncompleteIndex = availableSegments.findIndex(segment => !completedMap[segment.id])
        setRecordingsBySegment(recordingMap)
        setCompletedSegments(completedMap)
        setPlayedSegments(playedMapFromRecordings(recordingMap))
        setActiveSegmentIndex(firstIncompleteIndex >= 0 ? firstIncompleteIndex : Math.max(availableSegments.length - 1, 0))
        setErkouPhase(firstIncompleteIndex >= 0 ? '准备中' : '本段完成')
      }
      setLoading(false)
      return
    }

    const completedAttempt = rows.find(row => row.status === 'submitted' || row.status === 'scored')
    if (completedAttempt) {
      const restart = window.confirm('你已提交过本次模考，可查看报告或重新开始。点击“确定”将重新开始，点击“取消”查看报告。')
      if (!restart) {
        router.push(`/practice/catti/report/${completedAttempt.id}`)
        return
      }
    }

    const startedAt = new Date().toISOString()
    const createRes = await supabase
      .from('catti_mock_attempts')
      .insert({
        exam_id: examId,
        user_id: user.id,
        status: 'in_progress',
        started_at: startedAt,
      })
      .select(attemptSelect)
      .single()

    if (createRes.error || !createRes.data) {
      setLoadError('无法创建考试记录：' + (createRes.error?.message ?? '未知错误'))
      setLoading(false)
      return
    }

    setAttempt(createRes.data as CattiMockAttempt)
    if (examRow.exam_type === 'erbi_practice') {
      setAnswersByPassage(emptyAnswerMap(availablePassages))
    } else if (examRow.exam_type === 'erkou_practice') {
      setRecordingsBySegment({})
      setCompletedSegments({})
      setPlayedSegments({})
    }
    setLoading(false)
  }, [examId, router])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    return () => {
      stopPlayback()
      stopPhaseTimers()
      stopRecordingTracks()
    }
  }, [])

  useEffect(() => {
    if (!exam || !attempt) return

    const syncCountdown = () => {
      const durationSeconds = Math.max(1, exam.duration_minutes ?? 180) * 60
      const startedAt = new Date(attempt.started_at).getTime()
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000)
      const nextRemaining = Math.max(0, durationSeconds - elapsedSeconds)
      setRemainingSeconds(nextRemaining)
      setTimeExpired(nextRemaining === 0)
    }

    syncCountdown()
    const timer = window.setInterval(syncCountdown, 1000)
    return () => window.clearInterval(timer)
  }, [attempt, exam])

  const activePassage = useMemo(() => {
    return passages.find(passage => passage.id === activePassageId) ?? passages[0] ?? null
  }, [activePassageId, passages])

  const activeSegment = segments[activeSegmentIndex] ?? null

  const activeAnswer = activePassage ? answersByPassage[activePassage.id] || '' : ''

  const totalAnswerWordCount = useMemo(() => {
    return passages.reduce((sum, passage) => sum + countPracticeWords(answersByPassage[passage.id] || ''), 0)
  }, [answersByPassage, passages])

  const completedSegmentCount = useMemo(() => {
    return segments.filter(segment => completedSegments[segment.id]).length
  }, [completedSegments, segments])

  const uploadingSegmentCount = useMemo(() => {
    return segments.filter(segment => recordingsBySegment[segment.id]?.uploading).length
  }, [recordingsBySegment, segments])

  const failedUploadCount = useMemo(() => {
    return segments.filter(segment => recordingsBySegment[segment.id]?.error).length
  }, [recordingsBySegment, segments])

  const allSegmentsCompleted = segments.length > 0 && completedSegmentCount === segments.length

  const timerText = useMemo(() => {
    const seconds = remainingSeconds ?? Math.max(1, exam?.duration_minutes ?? 180) * 60
    return formatCountdown(seconds)
  }, [exam?.duration_minutes, remainingSeconds])

  const pageGutter = { paddingLeft: 'clamp(20px, 1.6vw, 32px)', paddingRight: 'clamp(20px, 1.6vw, 32px)' }
  const panelHeaderPadding = { padding: '18px clamp(22px, 2vw, 34px)' }
  const panelBodyPadding = { padding: '22px clamp(24px, 2.4vw, 38px)' }
  const passageTabPadding = { padding: '16px clamp(24px, 2.2vw, 36px)' }

  function updateActiveAnswer(value: string) {
    if (!activePassage) return
    setAnswersByPassage(prev => ({ ...prev, [activePassage.id]: value }))
  }

  async function persistAnswers(nextStatus: 'in_progress' | 'submitted') {
    if (!attempt || !userId) return { error: '考试记录不存在。' }
    const answerText = buildCombinedAnswer(passages, answersByPassage)
    const realPassages = passages.filter(passage => !isLegacyPassage(passage))

    if (realPassages.length > 0) {
      const answerRows = realPassages.map(passage => ({
        attempt_id: attempt.id,
        passage_id: passage.id,
        answer_text: answersByPassage[passage.id] || '',
      }))
      const answerRes = await supabase
        .from('catti_mock_attempt_answers')
        .upsert(answerRows, { onConflict: 'attempt_id,passage_id' })
      if (answerRes.error) return { error: answerRes.error.message }
    }

    const updatePayload = nextStatus === 'submitted'
      ? { answer_text: answerText, status: 'submitted', submitted_at: new Date().toISOString() }
      : { answer_text: answerText, status: 'in_progress' }

    const attemptRes = await supabase
      .from('catti_mock_attempts')
      .update(updatePayload)
      .eq('id', attempt.id)
      .eq('user_id', userId)
      .select(attemptSelect)
      .single()

    if (attemptRes.error || !attemptRes.data) {
      return { error: attemptRes.error?.message ?? '未知错误' }
    }

    setAttempt(attemptRes.data as CattiMockAttempt)
    return { error: '' }
  }

  async function saveDraft() {
    if (!attempt || !userId) return
    if (attempt.status !== 'in_progress') {
      alert('当前考试已提交，不能继续修改。')
      return
    }

    setSaving(true)
    const { error } = await persistAnswers('in_progress')
    setSaving(false)

    if (error) {
      alert('保存失败：' + error)
      return
    }

    setSaveMessage(`已保存 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`)
  }

  async function submitExam() {
    if (!attempt || !userId) return
    if (!window.confirm('提交后将不能继续修改，是否确认提交？')) return

    setSubmitting(true)
    const { error } = await persistAnswers('submitted')
    setSubmitting(false)

    if (error) {
      alert('提交失败：' + error)
      return
    }

    router.push(`/practice/catti/report/${attempt.id}`)
  }

  function stopPlayback() {
    if (playbackTimerRef.current) {
      window.clearTimeout(playbackTimerRef.current)
      playbackTimerRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    window.speechSynthesis.cancel()
  }

  function stopPhaseTimers() {
    if (recordingTimerRef.current) {
      window.clearTimeout(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current)
      transitionTimerRef.current = null
    }
    if (phaseCountdownRef.current) {
      window.clearInterval(phaseCountdownRef.current)
      phaseCountdownRef.current = null
    }
    setPhaseRemainingSeconds(null)
  }

  function startPhaseCountdown(seconds: number) {
    if (phaseCountdownRef.current) window.clearInterval(phaseCountdownRef.current)
    setPhaseRemainingSeconds(seconds)
    phaseCountdownRef.current = window.setInterval(() => {
      setPhaseRemainingSeconds(prev => {
        if (prev == null || prev <= 1) {
          if (phaseCountdownRef.current) {
            window.clearInterval(phaseCountdownRef.current)
            phaseCountdownRef.current = null
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  function stopRecordingTracks() {
    recordingStreamRef.current?.getTracks().forEach(track => track.stop())
    recordingStreamRef.current = null
  }

  function finishSegmentPlayback(segment: CattiMockSegment) {
    playbackTimerRef.current = null
    audioRef.current = null
    setErkouPhase('请开始口译')
    if (!isAdmin) void startRecordingForSegment(segment, true)
  }

  function playCurrentSegment() {
    if (!activeSegment) return
    if (!isAdmin && completedSegments[activeSegment.id]) {
      alert('本段已完成，正式考试流程中不能重复播放。')
      return
    }
    if (!isAdmin && playedSegments[activeSegment.id]) {
      alert('本段原文已播放，请开始口译录音。')
      return
    }
    playSegment(activeSegment)
  }

  function playSegment(segment: CattiMockSegment) {
    stopPlayback()
    stopPhaseTimers()
    setPlayedSegments(prev => ({ ...prev, [segment.id]: true }))
    setErkouPhase('正在播放原文')

    if (segment.audio_url) {
      const audio = new Audio(segment.audio_url)
      audioRef.current = audio
      audio.onended = () => finishSegmentPlayback(segment)
      audio.onerror = () => finishSegmentPlayback(segment)
      void audio.play().catch(() => finishSegmentPlayback(segment))
      return
    }

    const utterance = new SpeechSynthesisUtterance(segment.source_text)
    utterance.rate = speechRateValue(segment.speech_rate)
    utterance.onend = () => finishSegmentPlayback(segment)
    utterance.onerror = () => finishSegmentPlayback(segment)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  async function startRecording() {
    if (!activeSegment) return
    if (!isAdmin && completedSegments[activeSegment.id]) {
      alert('本段已完成。如需重录，请重新开始本次模考。')
      return
    }
    if (!isAdmin && erkouPhase !== '请开始口译') {
      alert('请先播放本段原文，播放结束后再开始录音。')
      return
    }
    await startRecordingForSegment(activeSegment, false)
  }

  async function startRecordingForSegment(segment: CattiMockSegment, autoAdvance: boolean) {
    stopPlayback()
    if (!('MediaRecorder' in window) || !navigator.mediaDevices?.getUserMedia) {
      setCompletedSegments(prev => ({ ...prev, [segment.id]: true }))
      setErkouPhase('本段完成')
      alert('当前浏览器不支持录音，本段以录音占位完成。')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      recordingStreamRef.current = stream
      recorderRef.current = recorder
      recordingChunksRef.current = []

      recorder.ondataavailable = event => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        if (recordingTimerRef.current) {
          window.clearTimeout(recordingTimerRef.current)
          recordingTimerRef.current = null
        }
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const url = URL.createObjectURL(blob)
        setRecordingsBySegment(prev => ({ ...prev, [segment.id]: { url, size: blob.size, blob, uploaded: false, uploading: true } }))
        void uploadSegmentRecording(segment, blob, url)
        stopRecordingTracks()
        recorderRef.current = null
        recordingChunksRef.current = []
      }

      recorder.start()
      autoFlowRef.current = autoAdvance
      setErkouPhase('录音中')
      const recordingSeconds = segment.recording_seconds ?? segment.pause_seconds ?? 75
      startPhaseCountdown(recordingSeconds)
      if (autoAdvance) {
        recordingTimerRef.current = window.setTimeout(() => {
          stopRecording()
        }, recordingSeconds * 1000)
      }
    } catch (error) {
      alert('无法开始录音，请检查麦克风权限。')
      setErkouPhase('请开始口译')
    }
  }

  async function uploadSegmentRecording(segment: CattiMockSegment, blob: Blob, localUrl: string) {
    if (!attempt) return
    const form = new FormData()
    form.set('attemptId', attempt.id)
    form.set('segmentId', segment.id)
    form.set('file', blob, `${segment.id}.webm`)

    const { data, error } = await apiJSON<UploadRecordingResponse>('/api/catti/erkou/upload-recording', {
      method: 'POST',
      body: form,
    })

    if (error || !data?.attemptSegment?.user_audio_url) {
      setRecordingsBySegment(prev => ({
        ...prev,
        [segment.id]: { url: localUrl, size: blob.size, blob, uploaded: false, uploading: false, error: error || '上传失败' },
      }))
      autoFlowRef.current = false
      setErkouPhase('请开始口译')
      alert('录音上传失败：' + (error || '未知错误'))
      return
    }

    setRecordingsBySegment(prev => ({
      ...prev,
      [segment.id]: { url: data.attemptSegment?.user_audio_url || localUrl, size: blob.size, uploaded: true, uploading: false },
    }))
    setCompletedSegments(prev => ({ ...prev, [segment.id]: true }))
    if (autoFlowRef.current && !isAdmin) {
      beginSegmentTransition(segment)
    } else {
      setErkouPhase('本段完成')
    }
  }

  function beginSegmentTransition(segment: CattiMockSegment) {
    const currentIndex = segments.findIndex(item => item.id === segment.id)
    const nextSegment = currentIndex >= 0 ? segments[currentIndex + 1] : null
    if (!nextSegment) {
      autoFlowRef.current = false
      setErkouPhase('本段完成')
      setPhaseRemainingSeconds(null)
      return
    }

    const seconds = segment.transition_seconds ?? 5
    setErkouPhase('过渡中')
    startPhaseCountdown(seconds)
    transitionTimerRef.current = window.setTimeout(() => {
      setActiveSegmentIndex(currentIndex + 1)
      setErkouPhase('准备中')
      window.setTimeout(() => playSegment(nextSegment), 0)
    }, seconds * 1000)
  }

  async function retrySegmentUpload(segment: CattiMockSegment) {
    const recording = recordingsBySegment[segment.id]
    if (!recording) return

    let blob = recording.blob
    if (!blob) {
      try {
        blob = await fetch(recording.url).then(response => response.blob())
      } catch {
        setRecordingsBySegment(prev => ({
          ...prev,
          [segment.id]: { ...recording, uploading: false, error: '本地录音已失效，请重新录音。' },
        }))
        return
      }
    }
    if (!blob) return

    setRecordingsBySegment(prev => ({
      ...prev,
      [segment.id]: { ...recording, blob, uploading: true, error: '' },
    }))
    await uploadSegmentRecording(segment, blob, recording.url)
  }

  function stopRecording() {
    if (recordingTimerRef.current) {
      window.clearTimeout(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
      return
    }
    if (activeSegment) {
      setCompletedSegments(prev => ({ ...prev, [activeSegment.id]: true }))
      setErkouPhase('本段完成')
    }
  }

  function moveToNextSegment() {
    if (!activeSegment) return
    if (!isAdmin && !completedSegments[activeSegment.id]) {
      alert('请先完成本段录音并等待上传成功后，再进入下一段。')
      return
    }
    stopPlayback()
    stopPhaseTimers()
    if (activeSegmentIndex < segments.length - 1) {
      setActiveSegmentIndex(index => index + 1)
      setErkouPhase('准备中')
      return
    }
    setCompletedSegments(prev => ({ ...prev, [activeSegment.id]: true }))
    setErkouPhase('本段完成')
  }

  async function submitErkouExam() {
    if (!attempt || !userId) return
    if (uploadingSegmentCount > 0) {
      alert('还有录音正在上传，请等待上传完成后再提交。')
      return
    }
    if (!allSegmentsCompleted && !window.confirm(`还有 ${segments.length - completedSegmentCount} 段没有成功上传录音，其中 ${failedUploadCount} 段上传失败。是否仍然提交考试？`)) return
    if (allSegmentsCompleted && !window.confirm('提交后将不能继续修改，是否确认提交？')) return

    stopPlayback()
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
    setSubmitting(true)
    const attemptRes = await supabase
      .from('catti_mock_attempts')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        answer_text: `CATTI 二口实务录音已上传 ${completedSegmentCount}/${segments.length} 段。`,
      })
      .eq('id', attempt.id)
      .eq('user_id', userId)
      .select(attemptSelect)
      .single()
    setSubmitting(false)

    if (attemptRes.error || !attemptRes.data) {
      alert('提交失败：' + (attemptRes.error?.message ?? '未知错误'))
      return
    }

    router.push(`/practice/catti/report/${attempt.id}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas p-6">
        <div className="mx-auto max-w-4xl rounded-2xl border border-line bg-white p-8 text-sm text-ink-500">加载考试中...</div>
      </div>
    )
  }

  if (loadError || !exam || !attempt) {
    return (
      <div className="min-h-screen bg-canvas p-6">
        <div className="mx-auto max-w-4xl rounded-2xl border border-line bg-white p-8">
          <p className="mb-5 text-sm text-red-600">{loadError || '无法进入考试。'}</p>
          <Button variant="secondary" onClick={() => router.push('/practice/catti')}>返回模考中心</Button>
        </div>
      </div>
    )
  }

  if (exam.exam_type === 'erkou_practice') {
    if (segments.length === 0 || !activeSegment) {
      return (
        <div className="min-h-screen bg-canvas p-6">
          <div className="mx-auto max-w-4xl rounded-2xl border border-line bg-white p-8">
            <p className="mb-5 text-sm text-red-600">无法进入二口考试：缺少段落。</p>
            <Button variant="secondary" onClick={() => router.push('/practice/catti')}>返回模考中心</Button>
          </div>
        </div>
      )
    }

    const currentRecording = recordingsBySegment[activeSegment.id]
    const activeCompleted = !!completedSegments[activeSegment.id]
    const activePlayed = !!playedSegments[activeSegment.id]
    const recording = erkouPhase === '录音中'
    const canPlaySegment = isAdmin || (!recording && !activeCompleted && !currentRecording?.uploading && !activePlayed && erkouPhase === '准备中')
    const canRecordSegment = isAdmin ? !recording : !recording && !activeCompleted && erkouPhase === '请开始口译'
    const canMoveNextSegment = !recording && erkouPhase !== '过渡中' && activeCompleted && activeSegmentIndex < segments.length - 1
    const activeDirection = activeSegment.direction || exam.direction
    const activePartTitle = activeSegment.passage_title || erkouPassageTitle(activeSegment)

    return (
      <div className="min-h-screen bg-canvas text-ink-900">
        <header className="sticky top-0 z-20 border-b border-line bg-white">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">CATTI 二口实务</p>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="min-w-0 max-w-full truncate font-serif text-xl text-ink-900">{exam.title}</h1>
                <span className="rounded-full border border-line bg-canvas px-2 py-1 text-[11px] text-ink-600">{displayDirection(activeDirection)}</span>
                <span className="rounded-full border border-line bg-canvas px-2 py-1 text-[11px] text-ink-600">{activePartTitle}</span>
                <span className="rounded-full border border-line bg-canvas px-2 py-1 text-[11px] text-ink-600">当前段落 {activeSegmentIndex + 1} / {segments.length}</span>
                {isAdmin && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">管理员预览</span>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className={cn(
                'rounded-xl border px-4 py-2 font-mono text-xl',
                timeExpired ? 'border-red-200 bg-red-50 text-red-700' : 'border-line bg-canvas text-ink-900'
              )}>
                {timerText}
              </div>
              <span className="rounded-xl border border-line bg-canvas px-4 py-2 text-sm text-ink-700">考试时间：{exam.duration_minutes ?? 60} 分钟</span>
              <Button variant="secondary" onClick={() => router.push('/practice/catti')}>返回列表</Button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-5 py-6">
          {timeExpired && (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              时间已到，请尽快提交考试。
            </div>
          )}

          <section className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-4">
            {segments.map((segment, index) => {
              const selected = index === activeSegmentIndex
              const done = !!completedSegments[segment.id]
              const segmentRecording = recordingsBySegment[segment.id]
              const unlocked = isAdmin || index <= activeSegmentIndex || segments.slice(0, index).every(item => completedSegments[item.id])
              const segmentLabel = done ? '已完成' : segmentRecording?.uploading ? '上传中' : segmentRecording?.error ? '上传失败' : selected ? erkouPhase : '待进行'
              return (
                <button
                  key={segment.id}
                  type="button"
                  disabled={!unlocked}
                  onClick={() => {
                    if (!unlocked) return
                    stopPlayback()
                    setActiveSegmentIndex(index)
                    setErkouPhase(done ? '本段完成' : playedSegments[segment.id] ? '请开始口译' : '准备中')
                  }}
                  className={cn(
                    'rounded-2xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45',
                    selected ? 'border-ink-900 bg-ink-900 text-white' : segmentRecording?.error ? 'border-red-200 bg-red-50 text-red-800 hover:border-red-300' : 'border-line bg-white text-ink-800 hover:border-ink-300'
                  )}
                >
                  <p className={cn('text-xs', selected ? 'text-white/70' : 'text-ink-500')}>段落 {index + 1}</p>
                  <p className="mt-1 font-serif text-lg">{segmentLabel}</p>
                  <p className={cn('mt-2 text-xs', selected ? 'text-white/70' : 'text-ink-500')}>{segment.passage_title || erkouPassageTitle(segment)} · 录音 {segment.recording_seconds ?? segment.pause_seconds ?? 75} 秒</p>
                </button>
              )
            })}
          </section>

          <section className="rounded-3xl border border-line bg-white p-6">
            <div className="mb-6 flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">Current Stage</p>
                <h2 className="font-serif text-3xl text-ink-900">{erkouPhase}</h2>
                <p className="mt-2 text-sm text-ink-600">
                  当前段落进度：{activeSegmentIndex + 1} / {segments.length} · 当前部分：{activePartTitle} · 当前方向：{displayDirection(activeDirection)}
                  {phaseRemainingSeconds != null && phaseRemainingSeconds > 0 ? ` · 当前阶段倒计时：${formatCountdown(phaseRemainingSeconds)}` : ''}
                </p>
              </div>
              <div className="rounded-2xl border border-line bg-canvas/50 px-5 py-4">
                <p className="text-[11px] text-ink-500">完成进度</p>
                <p className="mt-1 font-mono text-2xl text-ink-900">{completedSegmentCount} / {segments.length}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
              <div className="min-h-[360px] rounded-2xl border border-line bg-canvas/30 p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">Segment {activeSegment.segment_order}</p>
                    <h3 className="mt-1 font-serif text-xl text-ink-900">{displayDirection(activeDirection)} · {activePartTitle}</h3>
                  </div>
                  <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-600">
                    {activeSegment.audio_url ? '音频播放' : '文本模拟播放'}
                  </span>
                </div>

                {isAdmin ? (
                  <div className="whitespace-pre-wrap rounded-2xl border border-line bg-white px-5 py-4 text-base leading-8 text-ink-800">
                    {activeSegment.source_text}
                  </div>
                ) : (
                  <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-line bg-white px-5 py-8 text-center">
                    <p className="font-serif text-2xl text-ink-900">第 {activeSegmentIndex + 1} / {segments.length} 段</p>
                    <p className="mt-3 max-w-md text-sm leading-7 text-ink-600">
                      当前部分：{activePartTitle}。普通考试模式不显示原文；系统会播放音频或使用浏览器模拟朗读。
                    </p>
                  </div>
                )}
              </div>

              <aside className="rounded-2xl border border-line bg-white p-5">
                <h3 className="font-serif text-xl text-ink-900">本段口译</h3>
                <p className="mt-2 text-sm leading-7 text-ink-600">
                  正式流程：播放原文后才能开始录音；录音上传成功后才能进入下一段。上传失败时可先保留本地录音并重试。
                </p>
                <div className="mt-5 space-y-3">
                  <StatusLine label="阶段" value={erkouPhase} />
                  <StatusLine label="本段状态" value={activeCompleted ? '已完成' : '未完成'} />
                  <StatusLine label="录音" value={recordingStatus(currentRecording)} />
                </div>
                {currentRecording && (
                  <audio controls src={currentRecording.url} className="mt-5 w-full" />
                )}
                {currentRecording?.error && <p className="mt-3 text-sm text-red-600">{currentRecording.error}</p>}
                {currentRecording?.error && (
                  <Button
                    variant="secondary"
                    className="mt-3 w-full"
                    loading={currentRecording.uploading}
                    onClick={() => { void retrySegmentUpload(activeSegment) }}
                  >
                    重试上传本段录音
                  </Button>
                )}
              </aside>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-line pt-5">
              <Button variant="secondary" disabled={activeSegmentIndex !== 0 || !canPlaySegment} onClick={playCurrentSegment}>开始考试</Button>
              <Button variant="secondary" disabled={!canPlaySegment} onClick={playCurrentSegment}>播放本段</Button>
              <Button variant="primary" disabled={!canRecordSegment} onClick={() => { void startRecording() }}>开始录音</Button>
              <Button variant="secondary" disabled={!recording} onClick={stopRecording}>停止录音</Button>
              <Button variant="secondary" disabled={!canMoveNextSegment} onClick={moveToNextSegment}>下一段</Button>
              <Button variant="primary" loading={submitting} disabled={uploadingSegmentCount > 0} onClick={() => { void submitErkouExam() }}>提交考试</Button>
            </div>
          </section>
        </main>
      </div>
    )
  }

  if (passages.length === 0 || !activePassage) {
    return (
      <div className="min-h-screen bg-canvas p-6">
        <div className="mx-auto max-w-4xl rounded-2xl border border-line bg-white p-8">
          <p className="mb-5 text-sm text-red-600">无法进入考试。</p>
          <Button variant="secondary" onClick={() => router.push('/practice/catti')}>返回模考中心</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-canvas text-ink-900">
      <header className="sticky top-0 z-20 border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between" style={pageGutter}>
          <div className="min-w-0">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">CATTI 二笔实务</p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="min-w-0 max-w-full truncate font-serif text-xl text-ink-900">{exam.title}</h1>
              <span className="rounded-full border border-line bg-canvas px-2 py-1 text-[11px] text-ink-600">{displayExamDirections(passages, exam.direction)}</span>
              {isAdmin && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">管理员预览</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className={cn(
              'rounded-xl border px-4 py-2 font-mono text-xl',
              timeExpired ? 'border-red-200 bg-red-50 text-red-700' : 'border-line bg-canvas text-ink-900'
            )}>
              {timerText}
            </div>
            <Button variant="secondary" loading={saving} onClick={() => { void saveDraft() }}>保存草稿</Button>
            <Button variant="primary" loading={submitting} onClick={() => { void submitExam() }}>提交考试</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 py-5 sm:gap-5 lg:grid-cols-2" style={pageGutter}>
        {timeExpired && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 lg:col-span-2">
            时间已到，请尽快提交考试。
          </div>
        )}

        <section className="min-w-0 rounded-2xl border border-line bg-white lg:col-span-2" style={{ padding: '16px' }}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {passages.map(passage => {
              const selected = passage.id === activePassage.id
              const answerCount = countPracticeWords(answersByPassage[passage.id] || '')
              return (
                <button
                  key={passage.id}
                  type="button"
                  onClick={() => setActivePassageId(passage.id)}
                  className={cn(
                    'min-w-0 rounded-xl border text-left transition',
                    selected ? 'border-ink-900 bg-ink-900 text-white' : 'border-line bg-canvas/40 text-ink-800 hover:border-ink-300'
                  )}
                  style={passageTabPadding}
                >
                  <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
                    <span className="text-xs font-medium">{passageLabel(passage)}</span>
                    <span className={cn('rounded-full border px-2 py-0.5 text-[10px]', selected ? 'border-white/30 text-white' : 'border-line text-ink-500')}>
                      {displayDirection(passage.direction)}
                    </span>
                  </div>
                  <p className={cn('truncate font-serif text-lg', selected ? 'text-white' : 'text-ink-900')}>{passage.title || passageLabel(passage)}</p>
                  <p className={cn('mt-2 text-xs', selected ? 'text-white/70' : 'text-ink-500')}>
                    原文 {countPracticeWords(passage.source_text)} 字 · 译文 {answerCount} 字
                  </p>
                </button>
              )
            })}
          </div>
        </section>

        <section className="flex min-h-[calc(100vh-300px)] min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-line" style={panelHeaderPadding}>
            <div className="min-w-0">
              <h2 className="font-serif text-lg">{passageLabel(activePassage)} · 原文阅读区</h2>
              <p className="mt-1 text-xs text-ink-500">原文字数：{countPracticeWords(activePassage.source_text)}</p>
            </div>
            <span className="shrink-0 rounded-full border border-line bg-canvas px-2 py-1 text-[11px] text-ink-600">{displayDirection(activePassage.direction)}</span>
          </div>
          <div className="flex-1 overflow-auto whitespace-pre-wrap break-words text-base leading-8 text-ink-800" style={panelBodyPadding}>
            {activePassage.source_text}
          </div>
        </section>

        <section className="flex min-h-[calc(100vh-300px)] min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line" style={panelHeaderPadding}>
            <div className="min-w-0">
              <h2 className="font-serif text-lg">{passageLabel(activePassage)} · 译文输入区</h2>
              <p className="mt-1 text-xs text-ink-500">当前译文：{countPracticeWords(activeAnswer)} 字 · 总译文：{totalAnswerWordCount} 字</p>
            </div>
            <p className="text-xs text-ink-500">{saveMessage}</p>
          </div>
          <textarea
            value={activeAnswer}
            onChange={e => updateActiveAnswer(e.target.value)}
            className="min-h-[560px] flex-1 resize-none border-0 bg-white text-base leading-8 text-ink-900 outline-none placeholder:text-ink-300"
            style={panelBodyPadding}
            placeholder={`在此输入${passageLabel(activePassage)}译文...`}
          />
        </section>
      </main>
    </div>
  )
}

async function loadAnswerMap(attempt: CattiMockAttempt, passages: CattiMockPassage[]) {
  const fallback = emptyAnswerMap(passages)
  const { data, error } = await supabase
    .from('catti_mock_attempt_answers')
    .select(attemptAnswerSelect)
    .eq('attempt_id', attempt.id)

  if (error) {
    return {
      ...fallback,
      [passages[0]?.id || '']: attempt.answer_text || '',
    }
  }

  const rows = (data ?? []) as CattiMockAttemptAnswer[]
  const answerMap = new Map(rows.map(row => [row.passage_id, row.answer_text || '']))
  const next = { ...fallback }
  passages.forEach((passage, index) => {
    next[passage.id] = answerMap.get(passage.id) ?? (index === 0 ? attempt.answer_text || '' : '')
  })
  return next
}

async function loadRecordingMap(attempt: CattiMockAttempt, segments: CattiMockSegment[]) {
  const { data, error } = await supabase
    .from('catti_mock_attempt_segments')
    .select(attemptSegmentSelect)
    .eq('attempt_id', attempt.id)

  if (error) return {}

  const rows = (data ?? []) as CattiMockAttemptSegment[]
  const segmentIds = new Set(segments.map(segment => segment.id))
  return rows.reduce<Record<string, SegmentRecording>>((out, row) => {
    if (!row.user_audio_url || !row.segment_id || !segmentIds.has(row.segment_id)) return out
    out[row.segment_id] = { url: row.user_audio_url, size: 0, uploaded: true }
    return out
  }, {})
}

function completedMapFromRecordings(recordings: Record<string, SegmentRecording>) {
  return Object.entries(recordings).reduce<Record<string, boolean>>((out, [segmentId, recording]) => {
    if (recording.uploaded) out[segmentId] = true
    return out
  }, {})
}

function playedMapFromRecordings(recordings: Record<string, SegmentRecording>) {
  return Object.entries(recordings).reduce<Record<string, boolean>>((out, [segmentId, recording]) => {
    if (recording.uploaded) out[segmentId] = true
    return out
  }, {})
}

function emptyAnswerMap(passages: CattiMockPassage[]) {
  return passages.reduce<Record<string, string>>((out, passage) => {
    out[passage.id] = ''
    return out
  }, {})
}

function buildCombinedAnswer(passages: CattiMockPassage[], answers: Record<string, string>) {
  return passages
    .map(passage => {
      const answer = (answers[passage.id] || '').trim()
      if (!answer) return ''
      return `【${passageLabel(passage)}】\n${answer}`
    })
    .filter(Boolean)
    .join('\n\n')
}

function legacyPassageFromExam(exam: CattiMockExam): CattiMockPassage {
  return {
    id: `legacy-${exam.id}`,
    exam_id: exam.id,
    passage_order: 1,
    direction: exam.direction,
    title: '原文',
    source_text: exam.source_text,
    max_score: 100,
  }
}

function isLegacyPassage(passage: CattiMockPassage) {
  return passage.id.startsWith('legacy-')
}

function passageLabel(passage: CattiMockPassage) {
  if (passage.passage_order === 1) return '英译中一'
  if (passage.passage_order === 2) return '英译中二'
  if (passage.passage_order === 3) return '中译英一'
  if (passage.passage_order === 4) return '中译英二'
  return passage.direction === 'C-E' ? `中译英${passage.passage_order}` : `英译中${passage.passage_order}`
}

function erkouPassageTitle(segment: Pick<CattiMockSegment, 'passage_order' | 'direction'>) {
  const order = segment.passage_order ?? 1
  if (order === 1) return 'E-C Passage 1'
  if (order === 2) return 'E-C Passage 2'
  if (order === 3) return 'C-E Passage 1'
  if (order === 4) return 'C-E Passage 2'
  return segment.direction === 'C-E' ? 'C-E Passage' : 'E-C Passage'
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function displayDirection(value: string) {
  if (value === 'E-C') return '英译中'
  if (value === 'C-E') return '中译英'
  return value
}

function displayExamDirections(passages: CattiMockPassage[], fallback: string) {
  const directions = Array.from(new Set(passages.map(passage => passage.direction))).filter(Boolean)
  if (directions.length > 1) return '英译中 / 中译英'
  return displayDirection(directions[0] || fallback)
}

function recordingStatus(recording?: SegmentRecording) {
  if (!recording) return '暂无'
  if (recording.uploading) return '上传中...'
  if (recording.uploaded) return recording.size > 0 ? `已上传 · ${Math.max(1, Math.round(recording.size / 1024))} KB` : '已上传'
  return recording.error ? '上传失败' : '未上传'
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-canvas/40 px-4 py-3">
      <span className="text-xs text-ink-500">{label}</span>
      <span className="text-sm font-medium text-ink-900">{value}</span>
    </div>
  )
}

function speechRateValue(value: string | null) {
  if (value === 'slow') return 0.82
  if (value === 'fast') return 1.15
  return 1
}
