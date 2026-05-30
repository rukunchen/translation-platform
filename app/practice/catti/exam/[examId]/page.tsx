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

type ErkouPhase = '准备中' | '考试说明' | '正在播放原文' | '请开始口译' | '录音即将开始' | '录音中' | '录音上传中' | '过渡中' | '上传失败' | '考试完成'

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

type CueAudioResponse = {
  audioUrl?: string
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
  const audioContextRef = useRef<AudioContext | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<BlobPart[]>([])
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const autoFlowRef = useRef(false)
  const cueAudioCacheRef = useRef<Record<string, string>>({})

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
        setErkouPhase(firstIncompleteIndex >= 0 ? '准备中' : '考试完成')
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
      void audioContextRef.current?.close()
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

  function getAudioContext() {
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return null
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContextCtor()
    }
    return audioContextRef.current
  }

  async function playBeep(frequency = 880, durationMs = 240) {
    const context = getAudioContext()
    if (!context) return
    if (context.state === 'suspended') {
      await context.resume().catch(() => undefined)
    }

    await new Promise<void>(resolve => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const now = context.currentTime
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.onended = () => resolve()
      oscillator.start(now)
      oscillator.stop(now + durationMs / 1000 + 0.02)
    })
  }

  async function speakChineseCue(text: string) {
    const content = text.trim()
    if (!content) return

    const cachedUrl = cueAudioCacheRef.current[content]
    if (cachedUrl) {
      try {
        await playCueAudioUrl(cachedUrl, content)
        return
      } catch {
        delete cueAudioCacheRef.current[content]
      }
    }

    const { data, error } = await apiJSON<CueAudioResponse>('/api/catti/erkou/cue-audio', {
      method: 'POST',
      body: JSON.stringify({ examId, text: content }),
    })
    if (!error && data?.audioUrl) {
      cueAudioCacheRef.current[content] = data.audioUrl
      try {
        await playCueAudioUrl(data.audioUrl, content)
        return
      } catch {
        delete cueAudioCacheRef.current[content]
      }
    }

    await speakChineseCueWithBrowserVoice(content)
  }

  async function playCueAudioUrl(audioUrl: string, text: string) {
    await new Promise<void>((resolve, reject) => {
      let finished = false
      const audio = new Audio(audioUrl)
      let timeout: number | null = null
      const finish = (error?: Error) => {
        if (finished) return
        finished = true
        if (timeout) window.clearTimeout(timeout)
        audio.onended = null
        audio.onerror = null
        audioRef.current = null
        if (error) reject(error)
        else resolve()
      }

      timeout = window.setTimeout(() => finish(new Error('引导音频播放超时')), Math.max(15000, text.length * 650))
      audio.preload = 'auto'
      audioRef.current = audio
      audio.onended = () => finish()
      audio.onerror = () => finish(new Error('引导音频播放失败'))
      void audio.play().catch(error => finish(error instanceof Error ? error : new Error('引导音频播放失败')))
    })
  }

  async function speakChineseCueWithBrowserVoice(content: string) {
    if (!('speechSynthesis' in window)) return

    const voices = await getSpeechVoices()
    const voice = chooseChineseVoice(voices)
    const parts = splitCueText(content)
    window.speechSynthesis.cancel()

    for (const part of parts) {
      await new Promise<void>(resolve => {
        let done = false
        let timeout: number | null = null
        const finish = () => {
          if (done) return
          done = true
          if (timeout) window.clearTimeout(timeout)
          resolve()
        }

        const utterance = new SpeechSynthesisUtterance(part)
        utterance.lang = 'zh-CN'
        utterance.rate = 0.9
        utterance.pitch = 1
        if (voice) utterance.voice = voice
        utterance.onend = finish
        utterance.onerror = finish
        timeout = window.setTimeout(finish, Math.max(45000, part.length * 1200))
        window.speechSynthesis.speak(utterance)
      })
    }
  }

  async function getSpeechVoices() {
    if (!('speechSynthesis' in window)) return []
    const currentVoices = window.speechSynthesis.getVoices()
    if (currentVoices.length > 0) return currentVoices

    return await new Promise<SpeechSynthesisVoice[]>(resolve => {
      let done = false
      let timeout: number | null = null
      const finish = () => {
        if (done) return
        done = true
        if (timeout) window.clearTimeout(timeout)
        window.speechSynthesis.onvoiceschanged = null
        resolve(window.speechSynthesis.getVoices())
      }

      window.speechSynthesis.onvoiceschanged = finish
      timeout = window.setTimeout(finish, 1200)
    })
  }

  function chooseChineseVoice(voices: SpeechSynthesisVoice[]) {
    const chineseVoices = voices.filter(voice => voice.lang.toLowerCase().startsWith('zh'))
    return (
      chineseVoices.find(voice => /xiaoxiao|xiaoyi|tingting|mei-jia|sin-ji|hanhan|huihui/i.test(voice.name)) ||
      chineseVoices.find(voice => !voice.localService) ||
      chineseVoices[0] ||
      null
    )
  }

  function splitCueText(content: string) {
    const sentences = content
      .split(/(?<=[。！？；])/u)
      .map(part => part.trim())
      .filter(Boolean)
    if (sentences.length === 0) return [content]

    const chunks: string[] = []
    let chunk = ''
    for (const sentence of sentences) {
      if (chunk && `${chunk}${sentence}`.length > 48) {
        chunks.push(chunk)
        chunk = sentence
      } else {
        chunk += sentence
      }
    }
    if (chunk) chunks.push(chunk)
    return chunks
  }

  async function playRecordingStartCue() {
    setErkouPhase('录音即将开始')
    await speakChineseCue('开始口译。听到提示音后开始录音。')
    await playBeep(920, 260)
  }

  async function playRecordingEndCue() {
    await playBeep(660, 260)
    await speakChineseCue('本段录音结束。')
  }

  async function startCandidateErkouFlow() {
    if (!activeSegment || uploadingSegmentCount > 0 || submitting) return
    if (recorderRef.current && recorderRef.current.state !== 'inactive') return

    const nextIndex = segments.findIndex(segment => !completedSegments[segment.id])
    if (nextIndex < 0) {
      setErkouPhase('考试完成')
      return
    }

    const nextSegment = segments[nextIndex]
    autoFlowRef.current = true
    setActiveSegmentIndex(nextIndex)

    if (playedSegments[nextSegment.id]) {
      await startRecordingForSegment(nextSegment, true)
      return
    }

    if (completedSegmentCount === 0 && nextIndex === 0) {
      setErkouPhase('考试说明')
      await speakChineseCue('CATTI 二级口译实务模拟考试现在开始。本考试不显示原文。请认真听每段录音并连续完成口译。系统会自动录音；听到提示音后开始口译，再次听到提示音表示本段录音结束。')
    } else {
      setErkouPhase('考试说明')
      await speakChineseCue('考试继续。请听下一段录音。')
    }

    await playSegmentWithCue(nextSegment, nextIndex)
  }

  async function playSegmentWithCue(segment: CattiMockSegment, index: number) {
    stopPlayback()
    stopPhaseTimers()
    setActiveSegmentIndex(index)
    setErkouPhase('准备中')

    const previousSegment = segments[index - 1]
    const passageChanged = !previousSegment || previousSegment.passage_order !== segment.passage_order
    const passageCue = passageChanged ? `${erkouPassageChineseTitle(segment)}开始。` : ''
    await speakChineseCue(`${passageCue}第 ${index + 1} 段录音即将播放，请注意听。`)
    void playSegment(segment)
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
    void startRecordingForSegment(segment, true)
  }

  async function playSegment(segment: CattiMockSegment) {
    stopPlayback()
    stopPhaseTimers()
    setPlayedSegments(prev => ({ ...prev, [segment.id]: true }))
    setErkouPhase('正在播放原文')

    if (segment.audio_url) {
      const audio = new Audio(segment.audio_url)
      audioRef.current = audio
      audio.onended = () => finishSegmentPlayback(segment)
      audio.onerror = () => playSegmentWithSpeechSynthesis(segment)
      await audio.play().catch(() => playSegmentWithSpeechSynthesis(segment))
      return
    }

    playSegmentWithSpeechSynthesis(segment)
  }

  function playSegmentWithSpeechSynthesis(segment: CattiMockSegment) {
    audioRef.current = null
    const utterance = new SpeechSynthesisUtterance(segment.source_text)
    utterance.rate = speechRateValue(segment.speech_rate, segment.direction)
    utterance.onend = () => finishSegmentPlayback(segment)
    utterance.onerror = () => {
      setPlayedSegments(prev => {
        const next = { ...prev }
        delete next[segment.id]
        return next
      })
      setErkouPhase('准备中')
      alert('本段音频播放失败，请检查浏览器音频设置后重试。')
    }
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  async function startRecordingForSegment(segment: CattiMockSegment, autoAdvance: boolean) {
    stopPlayback()
    if (!('MediaRecorder' in window) || !navigator.mediaDevices?.getUserMedia) {
      setErkouPhase('请开始口译')
      alert('当前浏览器不支持录音，无法完成二口考试。请更换支持麦克风录音的浏览器。')
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
        const blob = new Blob(recordingChunksRef.current, { type: recordingBlobType(recorder.mimeType) })
        const url = URL.createObjectURL(blob)
        stopRecordingTracks()
        recorderRef.current = null
        recordingChunksRef.current = []
        void finalizeSegmentRecording(segment, blob, url)
      }

      autoFlowRef.current = autoAdvance
      await playRecordingStartCue()
      recorder.start()
      setErkouPhase('录音中')
      const recordingSeconds = segment.recording_seconds ?? segment.pause_seconds ?? 75
      startPhaseCountdown(recordingSeconds)
      if (autoAdvance) {
        recordingTimerRef.current = window.setTimeout(() => {
          stopRecording()
        }, recordingSeconds * 1000)
      }
    } catch {
      alert('无法开始录音，请检查麦克风权限。')
      setErkouPhase('请开始口译')
    }
  }

  async function finalizeSegmentRecording(segment: CattiMockSegment, blob: Blob, localUrl: string) {
    setErkouPhase('录音上传中')
    setPhaseRemainingSeconds(null)
    setRecordingsBySegment(prev => ({ ...prev, [segment.id]: { url: localUrl, size: blob.size, blob, uploaded: false, uploading: true } }))
    await playRecordingEndCue()
    await uploadSegmentRecording(segment, blob, localUrl)
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
      setErkouPhase('上传失败')
      alert('录音上传失败：' + (error || '未知错误'))
      return
    }

    setRecordingsBySegment(prev => ({
      ...prev,
      [segment.id]: { url: data.attemptSegment?.user_audio_url || localUrl, size: blob.size, uploaded: true, uploading: false },
    }))
    setCompletedSegments(prev => ({ ...prev, [segment.id]: true }))
    if (autoFlowRef.current) {
      beginSegmentTransition(segment)
    } else {
      const currentIndex = segments.findIndex(item => item.id === segment.id)
      setErkouPhase(currentIndex >= segments.length - 1 ? '考试完成' : '准备中')
    }
  }

  function beginSegmentTransition(segment: CattiMockSegment) {
    const currentIndex = segments.findIndex(item => item.id === segment.id)
    const nextSegment = currentIndex >= 0 ? segments[currentIndex + 1] : null
    if (!nextSegment) {
      autoFlowRef.current = false
      setErkouPhase('考试完成')
      setPhaseRemainingSeconds(null)
      void speakChineseCue('本场考试全部录音完成。请确认后提交考试录音。')
      return
    }

    const seconds = segment.transition_seconds ?? 5
    setErkouPhase('过渡中')
    startPhaseCountdown(seconds)
    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = null
      void playSegmentWithCue(nextSegment, currentIndex + 1)
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
    autoFlowRef.current = true
    setErkouPhase('录音上传中')
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
      setErkouPhase('请开始口译')
    }
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
    const flowBusy = erkouPhase === '考试说明' || erkouPhase === '正在播放原文' || erkouPhase === '录音即将开始' || recording || erkouPhase === '录音上传中' || erkouPhase === '过渡中'
    const flowStarted = completedSegmentCount > 0 || Object.keys(playedSegments).length > 0 || erkouPhase !== '准备中'
    const canStartFlow = !allSegmentsCompleted && !flowBusy && !currentRecording?.uploading && !currentRecording?.error
    const activeDirection = activeSegment.direction || exam.direction
    const activePartTitle = erkouPassageDisplayTitle(activeSegment)
    const activeAudioType = erkouAudioType(activeSegment)
    const progressPercent = Math.round((completedSegmentCount / segments.length) * 100)
    const phaseTitle = timeExpired && !allSegmentsCompleted ? '考试时间已到' : allSegmentsCompleted ? '考试录音已完成' : erkouPhaseTitle(erkouPhase)
    const phaseDescription = timeExpired && !allSegmentsCompleted ? '请尽快完成当前录音流程并提交考试录音。' : erkouPhaseDescription(erkouPhase, activeSegmentIndex, segments.length)
    const primaryFlowLabel = !flowStarted ? '开始考试' : activePlayed && !activeCompleted ? '继续录音' : '继续考试'

    return (
      <div className="min-h-screen overflow-x-hidden bg-canvas text-ink-900">
        <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 px-4 py-4 sm:px-[clamp(20px,3vw,56px)] lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">CATTI 二口实务模拟考试</p>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="min-w-0 max-w-full truncate font-serif text-2xl leading-tight text-ink-900">{exam.title}</h1>
                <span className="rounded-full border border-line bg-canvas px-2 py-1 text-xs text-ink-600">{displayDirection(activeDirection)}</span>
                {isAdmin && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">管理员预览</span>}
              </div>
            </div>
            <div className="flex w-full min-w-0 flex-wrap items-center gap-3 lg:w-auto lg:justify-end">
              <div className={cn(
                'min-w-[110px] rounded-2xl border px-4 py-3 text-center font-mono text-2xl shadow-sm sm:px-5',
                timeExpired ? 'border-red-200 bg-red-50 text-red-700' : 'border-line bg-canvas-2 text-ink-900'
              )}>
                {timerText}
              </div>
              <span className="min-w-0 rounded-xl border border-line bg-canvas-2 px-3 py-3 text-sm text-ink-700 sm:px-4">考试时间：{exam.duration_minutes ?? 60} 分钟</span>
              <Button className="w-full sm:w-auto" variant="secondary" disabled={flowBusy} onClick={() => router.push('/practice/catti')}>返回列表</Button>
            </div>
          </div>
        </header>

        <main className="mx-auto flex min-h-[calc(100vh-96px)] w-full max-w-[1680px] flex-col justify-start px-4 py-5 sm:px-[clamp(20px,3vw,56px)] sm:py-8 lg:justify-center">
          {timeExpired && (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
              时间已到，请尽快提交考试。
            </div>
          )}

          <section className="overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-[var(--shadow-card)] sm:rounded-[24px]">
            <div className="grid min-h-[620px] min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]">
              <div className="flex min-h-[520px] min-w-0 flex-col px-5 py-6 sm:px-[clamp(28px,4vw,72px)] sm:py-[clamp(28px,4vw,64px)]">
                <div className="flex flex-col gap-5 border-b border-line pb-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 max-w-3xl">
                    <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">考试状态</p>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={cn(
                        'h-3 w-3 rounded-full',
                        timeExpired && !allSegmentsCompleted ? 'bg-red-500' : recording ? 'bg-brand' : flowBusy ? 'bg-status-info-text' : allSegmentsCompleted ? 'bg-status-success' : 'bg-ink-400'
                      )} />
                      <h2 className="min-w-0 break-words font-serif text-[clamp(26px,8vw,56px)] leading-tight text-ink-900">{phaseTitle}</h2>
                    </div>
                    <p className="mt-4 max-w-2xl text-base leading-8 text-ink-600">{phaseDescription}</p>
                  </div>
                  <div className="w-full min-w-0 rounded-2xl border border-line bg-canvas-2 px-4 py-4 sm:w-auto sm:min-w-[160px] sm:px-5">
                    <p className="text-[11px] text-ink-500">完成进度</p>
                    <p className="mt-1 break-words font-mono text-2xl text-ink-900 sm:text-3xl">{completedSegmentCount} / {segments.length}</p>
                  </div>
                </div>

                <div className="mt-8 min-w-0 rounded-2xl border border-line bg-canvas-2 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs font-medium text-ink-500">整体进度</p>
                    <p className="font-mono text-sm text-ink-700">{progressPercent}%</p>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
                    <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
                    <StatusLine label="当前进度" value={`第 ${Math.min(activeSegmentIndex + 1, segments.length)} / ${segments.length} 段`} />
                    <StatusLine label="当前部分" value={activePartTitle} />
                    <StatusLine label="音频类型" value={activeAudioType} />
                    <StatusLine
                      label="阶段计时"
                      value={phaseRemainingSeconds != null && phaseRemainingSeconds > 0 ? formatCountdown(phaseRemainingSeconds) : recordingStatus(currentRecording)}
                    />
                  </div>
                </div>

                <div className="mt-8 flex min-w-0 flex-1 flex-col items-center justify-center rounded-2xl border border-line bg-white px-5 py-10 text-center sm:px-6 sm:py-12">
                  <div className="mb-8 flex h-24 items-end justify-center gap-2" aria-hidden="true">
                    {[40, 68, 92, 58, 78, 48, 64].map((height, index) => (
                      <span
                        key={index}
                        className={cn(
                          'w-3 rounded-full transition-colors',
                          recording ? 'bg-brand' : flowBusy ? 'bg-ink-900' : 'bg-ink-200'
                        )}
                        style={{ height }}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">听音口译</p>
                  <h3 className="mt-3 break-words font-serif text-[clamp(28px,8vw,52px)] leading-tight text-ink-900">{displayDirection(activeDirection)}口译</h3>
                  <p className="mt-5 max-w-2xl text-base leading-8 text-ink-600">
                    考试过程中不显示原文。请根据中文语音提示和提示音完成听辨、口译与录音。
                  </p>
                </div>
              </div>

              <div className="flex min-w-0 flex-col border-t border-line bg-canvas-2 lg:border-l lg:border-t-0">
                <div className="border-b border-line px-5 py-5 sm:px-6">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">考试引导</p>
                  <p className="mt-2 break-words font-serif text-xl text-ink-900 sm:text-2xl">全程自动进行</p>
                  <p className="mt-3 text-sm leading-7 text-ink-600">听提示音开始与结束口译。除上传失败重试外，考试过程中不需要手动切段。</p>
                </div>

                <div className="space-y-3 px-5 py-5 sm:px-6">
                  <ExamStep done={completedSegmentCount > 0 || flowStarted} active={!flowStarted} label="开始考试" />
                  <ExamStep done={activePlayed} active={erkouPhase === '正在播放原文'} label="听原文录音" />
                  <ExamStep done={activeCompleted} active={recording || erkouPhase === '录音即将开始'} label="口译录音" />
                  <ExamStep done={allSegmentsCompleted} active={erkouPhase === '录音上传中' || erkouPhase === '过渡中'} label="保存并进入下一段" />
                </div>

                <div className="mt-auto border-t border-line px-5 py-5 sm:px-6">
                  {currentRecording?.error && (
                    <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
                      <p className="text-sm font-medium text-red-700">录音上传失败</p>
                      <p className="mt-1 text-sm leading-7 text-red-700">{currentRecording.error}</p>
                      <Button
                        variant="secondary"
                        className="mt-3 w-full"
                        loading={currentRecording.uploading}
                        onClick={() => { void retrySegmentUpload(activeSegment) }}
                      >
                        重试上传录音
                      </Button>
                    </div>
                  )}

                  {allSegmentsCompleted && (
                    <div className="mb-4 rounded-2xl border border-line bg-white px-4 py-4">
                      <p className="font-serif text-xl text-ink-900">确认已完成考试</p>
                      <p className="mt-2 text-sm leading-7 text-ink-600">所有口译录音已完成，请确认后提交考试录音。</p>
                    </div>
                  )}

                  {!allSegmentsCompleted && (
                    <Button
                      variant="primary"
                      size="lg"
                      fullWidth
                      loading={flowBusy}
                      disabled={!canStartFlow}
                      onClick={() => { void startCandidateErkouFlow() }}
                    >
                      {primaryFlowLabel}
                    </Button>
                  )}
                  {allSegmentsCompleted && (
                    <Button
                      variant="primary"
                      size="lg"
                      fullWidth
                      loading={submitting}
                      disabled={uploadingSegmentCount > 0}
                      onClick={() => { void submitErkouExam() }}
                    >
                      提交考试录音
                    </Button>
                  )}
                </div>
              </div>
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

function erkouPassageChineseTitle(segment: Pick<CattiMockSegment, 'passage_order' | 'direction'>) {
  const order = segment.passage_order ?? 1
  if (order === 1) return '第一篇英译中'
  if (order === 2) return '第二篇英译中'
  if (order === 3) return '第一篇中译英'
  if (order === 4) return '第二篇中译英'
  return segment.direction === 'C-E' ? '中译英' : '英译中'
}

function erkouPassageDisplayTitle(segment: Pick<CattiMockSegment, 'passage_order' | 'direction'>) {
  const order = segment.passage_order ?? 1
  if (segment.direction === 'C-E') return `C-E Passage ${order <= 2 ? 1 : order - 2}`
  return `E-C Passage ${order <= 2 ? order : 1}`
}

function erkouAudioType(segment: Pick<CattiMockSegment, 'direction'>) {
  return segment.direction === 'C-E' ? '中文原文' : '英文原文'
}

function erkouPhaseTitle(phase: ErkouPhase) {
  if (phase === '准备中') return '请开始考试'
  if (phase === '考试说明') return '考试说明播放中'
  if (phase === '正在播放原文') return '请认真听录音'
  if (phase === '请开始口译') return '准备录音'
  if (phase === '录音即将开始') return '听到提示音后开始口译'
  if (phase === '录音中') return '口译录音中'
  if (phase === '录音上传中') return '正在保存录音'
  if (phase === '过渡中') return '请等待下一段'
  if (phase === '上传失败') return '录音上传失败'
  return '考试录音已完成'
}

function erkouPhaseDescription(phase: ErkouPhase, index: number, total: number) {
  if (phase === '准备中') return '点击开始考试后，系统将播放中文考试说明，并自动进入连续口译流程。'
  if (phase === '考试说明') return '请听中文考试说明。说明结束后会自动播放第一段录音。'
  if (phase === '正在播放原文') return `第 ${index + 1} / ${total} 段录音正在播放，请只听不看。`
  if (phase === '请开始口译') return '系统正在准备麦克风录音。'
  if (phase === '录音即将开始') return '听到提示音后立即开始口译。'
  if (phase === '录音中') return '正在录制你的口译，录音结束时会再次播放提示音。'
  if (phase === '录音上传中') return '本段录音正在保存，成功后会自动进入下一段。'
  if (phase === '过渡中') return '本段已完成，下一段录音即将开始。'
  if (phase === '上传失败') return '本段录音未能上传，请重试上传后继续考试。'
  return '所有口译录音已完成，请确认后提交考试录音。'
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

function recordingBlobType(type: string) {
  const baseType = type.split(';')[0]?.trim().toLowerCase()
  return baseType || 'audio/webm'
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-canvas/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-xs text-ink-500">{label}</span>
      <span className="min-w-0 break-words text-sm font-medium text-ink-900 sm:text-right">{value}</span>
    </div>
  )
}

function ExamStep({ done, active, label }: { done: boolean; active: boolean; label: string }) {
  return (
    <div className={cn(
      'flex min-w-0 items-center gap-3 rounded-xl border px-3 py-3 sm:px-4',
      done ? 'border-brand-200 bg-brand-50 text-ink-900' : active ? 'border-ink-900 bg-white text-ink-900' : 'border-line bg-white/70 text-ink-500'
    )}>
      <span className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
        done ? 'border-brand bg-brand text-white' : active ? 'border-ink-900 bg-ink-900 text-white' : 'border-line bg-canvas text-ink-400'
      )}>
        {done ? '✓' : active ? '•' : ''}
      </span>
      <span className="min-w-0 break-words text-sm font-medium leading-6">{label}</span>
    </div>
  )
}

function speechRateValue(value: string | null, direction?: string | null) {
  if (value === 'slow') return 0.82
  if (value === 'fast') return 1.15
  if (value === 'slow_training') return 0.85
  if (value === 'fast_challenge') return direction === 'C-E' ? 1.08 : 1.1
  if (value === 'pressure_training') return direction === 'C-E' ? 1.15 : 1.2
  return 1
}
