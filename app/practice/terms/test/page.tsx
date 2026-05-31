'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { PageHeader } from '@/components/ui/PageHeader'
import { MainContent } from '@/components/ui/MainContent'
import { supabase } from '@/lib/supabase'

type TermCategory = {
  id: string
  name: string
  description: string | null
  sort_order: number | null
}

type TestSource = 'public' | 'termbook'
type TestDirection = 'zh-en' | 'en-zh' | 'random'
type QuizDirection = 'zh-en' | 'en-zh'
type NoticeTone = 'success' | 'error' | 'warning'
type TestPhase = 'settings' | 'quiz' | 'result'

type QuizTerm = {
  id: string
  publicTermId: string | null
  termbookItemId: string | null
  source_text: string
  target_text: string
  definition: string | null
  example_sentence: string | null
  categoryName: string | null
  tags: string[] | null
  isSaved: boolean
}

type QuizQuestion = {
  id: string
  term: QuizTerm
  direction: QuizDirection
  prompt: string
  correctAnswer: string
  options: string[]
  distractorReasons: Record<string, string>
}

type AIDistractor = {
  text: string
  reason: string
}

type QuizAnswer = {
  questionId: string
  selectedAnswer: string
  isCorrect: boolean
  explanation: string
}

const QUESTION_COUNT_OPTIONS = [5, 10, 20, 30]
const OPTION_LABELS = ['A', 'B', 'C', 'D']

export default function TermTestSettingsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [categories, setCategories] = useState<TermCategory[]>([])
  const [source, setSource] = useState<TestSource>('public')
  const [categoryId, setCategoryId] = useState('')
  const [questionCount, setQuestionCount] = useState(10)
  const [direction, setDirection] = useState<TestDirection>('random')
  const [phase, setPhase] = useState<TestPhase>('settings')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [answers, setAnswers] = useState<QuizAnswer[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState('')
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [savingReport, setSavingReport] = useState(false)
  const [reportSaveNotice, setReportSaveNotice] = useState<{ tone: NoticeTone; text: string } | null>(null)
  const [addingTermId, setAddingTermId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null)

  const selectedCategory = useMemo(
    () => categories.find(category => category.id === categoryId) ?? null,
    [categories, categoryId]
  )
  const currentQuestion = questions[currentIndex] ?? null
  const currentAnswer = currentQuestion ? answers.find(answer => answer.questionId === currentQuestion.id) ?? null : null
  const correctCount = useMemo(() => answers.filter(answer => answer.isCorrect).length, [answers])
  const wrongAnswers = useMemo(() => answers.filter(answer => !answer.isCorrect), [answers])

  const loadCategories = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/')
      return
    }

    setUserId(user.id)
    const { data, error } = await supabase
      .from('term_categories')
      .select('id, name, description, sort_order')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      setCategories([])
      setCategoryId('')
      setErrorMessage(error.message)
      setLoading(false)
      return
    }

    const nextCategories = (data ?? []) as TermCategory[]
    setCategories(nextCategories)
    setCategoryId(current => current || nextCategories[0]?.id || '')
    setLoading(false)
  }, [router])

  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  async function startTest() {
    setNotice(null)
    setReportSaveNotice(null)

    if (!userId) {
      setNotice({ tone: 'error', text: '请先登录后再开始测试。' })
      return
    }

    if (source === 'public' && !categoryId) {
      setNotice({ tone: 'error', text: '请先选择一个公共分类。' })
      return
    }

    setChecking(true)
    const { terms, error } = source === 'public'
      ? await loadPublicTermsForTest(userId, categoryId, selectedCategory?.name ?? null)
      : await loadTermbookTermsForTest(userId)

    if (error) {
      setChecking(false)
      setNotice({ tone: 'error', text: `词条加载失败：${error}` })
      return
    }

    if (terms.length < questionCount) {
      setChecking(false)
      setNotice({ tone: 'error', text: '当前词条数量不足，请减少测试题数或选择其他分类。' })
      return
    }

    const sampledTerms = shuffleItems(terms).slice(0, questionCount)
    const nextQuestions = await createQuestionsWithAIDistractors(sampledTerms, direction)

    setQuestions(nextQuestions)
    setAnswers([])
    setCurrentIndex(0)
    setSelectedAnswer('')
    setChecking(false)
    setPhase('quiz')
  }

  function chooseAnswer(option: string) {
    if (!currentQuestion || currentAnswer) return
    const isCorrect = option === currentQuestion.correctAnswer
    setSelectedAnswer(option)
    setAnswers(prev => [
      ...prev,
      {
        questionId: currentQuestion.id,
        selectedAnswer: option,
        isCorrect,
        explanation: buildExplanation(currentQuestion, isCorrect, option),
      },
    ])
  }

  async function goNextQuestion() {
    if (!currentAnswer || savingReport) return
    if (currentIndex >= questions.length - 1) {
      setSavingReport(true)
      await saveTestAttempt()
      setSavingReport(false)
      setPhase('result')
      return
    }
    setCurrentIndex(prev => prev + 1)
    setSelectedAnswer('')
  }

  function resetToSettings() {
    setPhase('settings')
    setQuestions([])
    setAnswers([])
    setCurrentIndex(0)
    setSelectedAnswer('')
    setReportSaveNotice(null)
    setNotice(null)
  }

  async function saveTestAttempt() {
    if (!userId || questions.length === 0 || answers.length === 0) return

    const totalQuestions = questions.length
    const finalCorrectCount = answers.filter(answer => answer.isCorrect).length
    const accuracy = Number(((finalCorrectCount / totalQuestions) * 100).toFixed(2))

    const { data: attempt, error: attemptError } = await supabase
      .from('term_test_attempts')
      .insert({
        user_id: userId,
        source_type: source === 'public' ? 'public_category' : 'my_termbook',
        category_id: source === 'public' ? categoryId : null,
        total_questions: totalQuestions,
        correct_count: finalCorrectCount,
        accuracy,
        direction_mode: directionModeForSave(direction),
      })
      .select('id')
      .single()

    if (attemptError || !attempt) {
      setReportSaveNotice({ tone: 'error', text: `测试记录保存失败：${attemptError?.message ?? '未返回记录 ID'}` })
      return
    }

    const answerByQuestionId = new Map(answers.map(answer => [answer.questionId, answer]))
    const questionRows = questions.flatMap(question => {
      const answer = answerByQuestionId.get(question.id)
      if (!answer) return []
      return [{
        attempt_id: attempt.id,
        public_term_id: question.term.publicTermId,
        termbook_item_id: question.term.termbookItemId,
        question_text: question.prompt,
        correct_answer: question.correctAnswer,
        selected_answer: answer.selectedAnswer,
        is_correct: answer.isCorrect,
        options: question.options,
        explanation: answer.explanation,
      }]
    })

    const { error: questionError } = await supabase
      .from('term_test_questions')
      .insert(questionRows)

    if (questionError) {
      setReportSaveNotice({ tone: 'error', text: `逐题记录保存失败：${questionError.message}` })
      return
    }

    setReportSaveNotice({ tone: 'success', text: '已保存测试记录。' })
  }

  async function addPublicTermToBook(term: QuizTerm) {
    if (!userId || !term.publicTermId) return
    setAddingTermId(term.publicTermId)

    const { data: existing, error: existingError } = await supabase
      .from('user_termbook_items')
      .select('id')
      .eq('user_id', userId)
      .eq('public_term_id', term.publicTermId)
      .maybeSingle()

    if (existingError) {
      setAddingTermId(null)
      setNotice({ tone: 'error', text: `加入词条本失败：${existingError.message}` })
      return
    }

    if (!existing) {
      const { error } = await supabase.from('user_termbook_items').insert({
        user_id: userId,
        public_term_id: term.publicTermId,
        source_text: term.source_text,
        target_text: term.target_text,
        definition: term.definition,
        example_sentence: term.example_sentence,
        mastery_status: 'new',
        review_count: 0,
      })

      if (error) {
        setAddingTermId(null)
        setNotice({ tone: 'error', text: `加入词条本失败：${error.message}` })
        return
      }
    }

    setQuestions(prev => prev.map(question => (
      question.term.publicTermId === term.publicTermId
        ? { ...question, term: { ...question.term, isSaved: true } }
        : question
    )))
    setAddingTermId(null)
    setNotice({ tone: 'success', text: '已加入我的词条本。' })
  }

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="min-h-[calc(100vh-40px)] rounded-2xl border border-line bg-white">
          <MainContent size="wide">
            <PageHeader
              backHref="/practice/terms"
              backLabel="返回词条学习"
              eyebrow="Term Test"
              title="词条测试"
              description="选择公共分类或个人词条本，生成选择题训练常见错译辨析。"
              actions={<Button variant="secondary" onClick={() => router.push('/practice/terms')}>词条学习</Button>}
            />

            {phase === 'settings' && (
              <SettingsView
                categories={categories}
                source={source}
                categoryId={categoryId}
                questionCount={questionCount}
                direction={direction}
                loading={loading}
                checking={checking}
                errorMessage={errorMessage}
                notice={notice}
                selectedCategory={selectedCategory}
                onSourceChange={nextSource => {
                  setSource(nextSource)
                  setNotice(null)
                }}
                onCategoryChange={nextCategoryId => {
                  setCategoryId(nextCategoryId)
                  setNotice(null)
                }}
                onQuestionCountChange={nextCount => {
                  setQuestionCount(nextCount)
                  setNotice(nextCount === 30
                    ? { tone: 'warning', text: '30 题会逐题调用 AI 生成干扰项，可能较慢；日常练习建议 20 题以内。' }
                    : null
                  )
                }}
                onDirectionChange={nextDirection => {
                  setDirection(nextDirection)
                  setNotice(null)
                }}
                onStart={startTest}
              />
            )}

            {phase === 'quiz' && currentQuestion && (
              <QuizView
                question={currentQuestion}
                questionIndex={currentIndex}
                totalQuestions={questions.length}
                selectedAnswer={selectedAnswer}
                answer={currentAnswer}
                onChoose={chooseAnswer}
                onNext={goNextQuestion}
                onExit={resetToSettings}
                savingReport={savingReport}
              />
            )}

            {phase === 'result' && (
              <ResultView
                questions={questions}
                answers={answers}
                correctCount={correctCount}
                wrongAnswers={wrongAnswers}
                source={source}
                notice={notice}
                reportSaveNotice={reportSaveNotice}
                addingTermId={addingTermId}
                onRetest={() => void startTest()}
                onReturn={() => router.push('/practice/terms')}
                onOpenTermbook={() => router.push('/practice/terms#my-termbook')}
                onAddTerm={addPublicTermToBook}
              />
            )}
          </MainContent>
        </div>
      </main>
    </div>
  )
}

function SettingsView({
  categories,
  source,
  categoryId,
  questionCount,
  direction,
  loading,
  checking,
  errorMessage,
  notice,
  selectedCategory,
  onSourceChange,
  onCategoryChange,
  onQuestionCountChange,
  onDirectionChange,
  onStart,
}: {
  categories: TermCategory[]
  source: TestSource
  categoryId: string
  questionCount: number
  direction: TestDirection
  loading: boolean
  checking: boolean
  errorMessage: string
  notice: { tone: NoticeTone; text: string } | null
  selectedCategory: TermCategory | null
  onSourceChange: (value: TestSource) => void
  onCategoryChange: (value: string) => void
  onQuestionCountChange: (value: number) => void
  onDirectionChange: (value: TestDirection) => void
  onStart: () => Promise<void>
}) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card padding="lg" className="border-line/80">
        <form className="space-y-8" onSubmit={event => { event.preventDefault(); void onStart() }}>
          <SettingBlock title="测试来源">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ChoiceButton
                title="公共分类"
                description="从公共分类中选择一组词条。"
                selected={source === 'public'}
                onClick={() => onSourceChange('public')}
              />
              <ChoiceButton
                title="我的词条本"
                description="使用已加入个人词条本的词条。"
                selected={source === 'termbook'}
                onClick={() => onSourceChange('termbook')}
              />
            </div>
          </SettingBlock>

          {source === 'public' && (
            <SettingBlock title="公共分类选择">
              <Select
                label="公共分类"
                value={categoryId}
                onChange={event => onCategoryChange(event.target.value)}
                disabled={loading || categories.length === 0}
                hint="分类数据来自 term_categories。"
              >
                {categories.length === 0 ? (
                  <option value="">暂无公共分类</option>
                ) : (
                  categories.map(category => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))
                )}
              </Select>
              {selectedCategory?.description && (
                <p className="mt-3 text-sm leading-relaxed text-ink-500">{selectedCategory.description}</p>
              )}
            </SettingBlock>
          )}

          <SettingBlock title="测试词条数">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {QUESTION_COUNT_OPTIONS.map(count => (
                <ChoiceButton
                  key={count}
                  title={`${count}`}
                  description="题"
                  selected={questionCount === count}
                  compact
                  onClick={() => onQuestionCountChange(count)}
                />
              ))}
            </div>
          </SettingBlock>

          <SettingBlock title="出题方向">
            <Select
              label="方向"
              value={direction}
              onChange={event => onDirectionChange(event.target.value as TestDirection)}
            >
              <option value="zh-en">中文选英文</option>
              <option value="en-zh">英文选中文</option>
              <option value="random">随机方向</option>
            </Select>
          </SettingBlock>

          <SettingBlock title="干扰项模式">
            <div className="rounded-xl border border-line bg-canvas/70 px-5 py-4">
              <p className="text-sm font-medium text-ink-900">常见错误译法</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                干扰项将根据常见误译、直译错误、搭配错误和近义混淆生成，不会简单抽取其他无关词条。
              </p>
            </div>
          </SettingBlock>

          {errorMessage && (
            <Notice tone="error">公共分类加载失败：{errorMessage}</Notice>
          )}
          {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-ink-500">本轮优先使用 AI 生成干扰项；AI 失败时回退到本地规则，不保存测试历史。</p>
            <Button type="submit" variant="primary" loading={checking} disabled={loading || checking}>
              {checking ? '正在生成测试题' : '开始测试'}
            </Button>
          </div>
        </form>
      </Card>

      <Card padding="md" className="border-line/80 bg-surface/60">
        <Eyebrow tone="muted" className="mb-3">Current Setup</Eyebrow>
        <div className="space-y-5">
          <SummaryItem label="来源" value={source === 'public' ? '公共分类' : '我的词条本'} />
          <SummaryItem label="分类" value={source === 'public' ? selectedCategory?.name || '未选择' : '个人词条本'} />
          <SummaryItem label="题数" value={`${questionCount} 题`} />
          <SummaryItem label="方向" value={directionLabel(direction)} />
          <SummaryItem label="干扰项" value="常见错误译法" />
        </div>
      </Card>
    </div>
  )
}

function QuizView({
  question,
  questionIndex,
  totalQuestions,
  selectedAnswer,
  answer,
  onChoose,
  onNext,
  onExit,
  savingReport,
}: {
  question: QuizQuestion
  questionIndex: number
  totalQuestions: number
  selectedAnswer: string
  answer: QuizAnswer | null
  onChoose: (option: string) => void
  onNext: () => Promise<void>
  onExit: () => void
  savingReport: boolean
}) {
  return (
    <div className="mx-auto max-w-4xl">
      <Card padding="lg" className="border-line/80">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Eyebrow tone="muted" className="mb-2">{directionLabel(question.direction)}</Eyebrow>
            <h2 className="font-serif text-2xl text-ink-900">第 {questionIndex + 1} / {totalQuestions} 题</h2>
          </div>
          <Button variant="ghost" onClick={onExit}>退出测试</Button>
        </div>

        <div className="mb-7 rounded-2xl border border-line bg-surface/70 px-7 py-6 text-center sm:px-8 sm:py-7">
          <p className="mb-3 text-xs text-ink-500">题干</p>
          <p className="break-words font-serif text-2xl leading-snug text-ink-900 sm:text-3xl">{question.prompt}</p>
        </div>

        <div className="space-y-4">
          {question.options.map((option, index) => (
            <OptionButton
              key={`${question.id}-${option}`}
              label={OPTION_LABELS[index]}
              option={option}
              selected={selectedAnswer === option}
              correct={answer ? option === question.correctAnswer : false}
              wrong={!!answer && selectedAnswer === option && option !== question.correctAnswer}
              disabled={!!answer}
              onClick={() => onChoose(option)}
            />
          ))}
        </div>

        {answer && (
          <div className={answer.isCorrect
            ? 'mt-7 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800'
            : 'mt-7 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700'
          }>
            <p className="font-medium">{answer.isCorrect ? '回答正确' : '回答错误'}</p>
            <p className="mt-2">正确答案：{question.correctAnswer}</p>
            <p className="mt-2 leading-relaxed">{answer.explanation}</p>
          </div>
        )}

        <div className="mt-8 flex justify-end">
          <Button variant="primary" onClick={() => void onNext()} loading={savingReport} disabled={!answer || savingReport}>
            {savingReport ? '正在保存记录' : questionIndex >= totalQuestions - 1 ? '查看报告' : '下一题'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

function ResultView({
  questions,
  answers,
  correctCount,
  wrongAnswers,
  source,
  notice,
  reportSaveNotice,
  addingTermId,
  onRetest,
  onReturn,
  onOpenTermbook,
  onAddTerm,
}: {
  questions: QuizQuestion[]
  answers: QuizAnswer[]
  correctCount: number
  wrongAnswers: QuizAnswer[]
  source: TestSource
  notice: { tone: NoticeTone; text: string } | null
  reportSaveNotice: { tone: NoticeTone; text: string } | null
  addingTermId: string | null
  onRetest: () => void
  onReturn: () => void
  onOpenTermbook: () => void
  onAddTerm: (term: QuizTerm) => Promise<void>
}) {
  const accuracy = questions.length === 0 ? 0 : Math.round((correctCount / questions.length) * 100)

  return (
    <div className="space-y-6">
      <Card padding="lg" className="border-line/80">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Eyebrow tone="muted" className="mb-2">Test Report</Eyebrow>
            <h2 className="font-serif text-3xl text-ink-900">测试结束</h2>
            <p className="mt-2 text-sm text-ink-500">本次测试结果已用于生成当前报告。</p>
            {reportSaveNotice && (
              <p className={reportSaveNotice.tone === 'success'
                ? 'mt-2 text-sm font-medium text-emerald-700'
                : 'mt-2 text-sm font-medium text-red-700'
              }>
                {reportSaveNotice.text}
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <ReportStat label="总题数" value={String(questions.length)} />
            <ReportStat label="正确数" value={String(correctCount)} />
            <ReportStat label="正确率" value={`${accuracy}%`} />
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row">
          <Button variant="primary" onClick={onRetest}>再测一次</Button>
          <Button variant="secondary" onClick={onReturn}>返回词条学习</Button>
          <Button variant="ghost" onClick={onOpenTermbook}>进入我的词条本</Button>
        </div>
      </Card>

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <section>
        <div className="mb-4">
          <Eyebrow tone="muted" className="mb-2">Mistakes</Eyebrow>
          <h2 className="font-serif text-xl text-ink-900">错题列表</h2>
        </div>

        {wrongAnswers.length === 0 ? (
          <Card padding="lg" className="text-center text-sm text-ink-500">本次没有错题。</Card>
        ) : (
          <div className="space-y-4">
            {wrongAnswers.map(answer => {
              const question = questions.find(item => item.id === answer.questionId)
              if (!question) return null
              const canAddTerm = source === 'public' && !!question.term.publicTermId && !question.term.isSaved
              return (
                <Card key={answer.questionId} padding="md" className="border-line/80">
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="min-w-0">
                      <Eyebrow tone="muted" className="mb-2">{directionLabel(question.direction)}</Eyebrow>
                      <h3 className="break-words font-serif text-xl text-ink-900">{question.prompt}</h3>
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <MistakeField label="用户答案" value={answer.selectedAnswer} />
                        <MistakeField label="正确答案" value={question.correctAnswer} />
                      </div>
                      <p className="mt-4 text-sm leading-relaxed text-ink-600">{answer.explanation}</p>
                    </div>
                    <div className="flex flex-col justify-end gap-2">
                      {canAddTerm ? (
                        <Button
                          variant="secondary"
                          loading={addingTermId === question.term.publicTermId}
                          onClick={() => void onAddTerm(question.term)}
                        >
                          加入我的词条本
                        </Button>
                      ) : source === 'public' ? (
                        <span className="rounded-xl border border-line bg-canvas px-4 py-2 text-center text-xs text-ink-500">已在词条本</span>
                      ) : null}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function SettingBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-serif text-xl text-ink-900">{title}</h2>
      {children}
    </section>
  )
}

function ChoiceButton({
  title,
  description,
  selected,
  compact,
  onClick,
}: {
  title: string
  description: string
  selected: boolean
  compact?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex w-full flex-col items-center justify-center rounded-xl border px-5 py-3 text-center transition-colors',
        selected ? 'border-ink-900 bg-ink-900 text-white' : 'border-line bg-white text-ink-900 hover:border-ink-400',
        compact ? 'min-h-16' : 'min-h-[64px]',
      ].filter(Boolean).join(' ')}
    >
      <span className={compact ? 'block font-mono text-lg' : 'block text-sm font-medium'}>{title}</span>
      <span className={selected ? 'mt-1 block text-xs text-white/70' : 'mt-1 block text-xs text-ink-500'}>{description}</span>
    </button>
  )
}

function OptionButton({
  label,
  option,
  selected,
  correct,
  wrong,
  disabled,
  onClick,
}: {
  label: string
  option: string
  selected: boolean
  correct: boolean
  wrong: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        'flex w-full items-center gap-5 rounded-xl border px-6 py-4 text-left transition-colors sm:px-7',
        correct && 'border-emerald-300 bg-emerald-50 text-emerald-900',
        wrong && 'border-red-300 bg-red-50 text-red-800',
        !correct && !wrong && selected && 'border-ink-900 bg-canvas text-ink-900',
        !correct && !wrong && !selected && 'border-line bg-white text-ink-900 hover:border-ink-400',
        disabled && 'cursor-default',
      ].filter(Boolean).join(' ')}
    >
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current font-mono text-xs">
        {label}
      </span>
      <span className="break-words text-base leading-relaxed">{option}</span>
    </button>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-line pb-4 last:border-b-0 last:pb-0">
      <p className="mb-1 text-[11px] text-ink-500">{label}</p>
      <p className="text-sm text-ink-900">{value}</p>
    </div>
  )
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-24 rounded-xl border border-line bg-surface/70 px-4 py-3 text-center">
      <p className="mb-1 text-[11px] text-ink-500">{label}</p>
      <p className="font-mono text-lg text-ink-900">{value}</p>
    </div>
  )
}

function MistakeField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface/70 px-4 py-3">
      <p className="mb-1 text-[11px] text-ink-500">{label}</p>
      <p className="break-words text-sm text-ink-900">{value}</p>
    </div>
  )
}

function Notice({ tone, children }: { tone: NoticeTone; children: React.ReactNode }) {
  if (tone === 'warning') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {children}
      </div>
    )
  }

  return (
    <div className={tone === 'error'
      ? 'rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'
      : 'rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700'
    }>
      {children}
    </div>
  )
}

async function loadPublicTermsForTest(userId: string, categoryId: string, categoryName: string | null): Promise<{ terms: QuizTerm[]; error: string | null }> {
  const { data, error } = await supabase
    .from('public_terms')
    .select('id, source_text, target_text, definition, example_sentence, tags')
    .eq('category_id', categoryId)
    .order('updated_at', { ascending: false })
    .limit(500)

  if (error) return { terms: [], error: error.message }

  const terms = ((data ?? []) as Array<Record<string, unknown>>)
    .map(row => normalizeTermRow(row, 'public', categoryName))
    .filter((term): term is QuizTerm => !!term)

  const publicTermIds = terms.map(term => term.publicTermId).filter((id): id is string => !!id)
  if (publicTermIds.length === 0) return { terms, error: null }

  const { data: savedRows, error: savedError } = await supabase
    .from('user_termbook_items')
    .select('public_term_id')
    .eq('user_id', userId)
    .in('public_term_id', publicTermIds)

  if (savedError) return { terms: [], error: savedError.message }

  const savedIds = new Set((savedRows ?? []).map(row => row.public_term_id).filter(Boolean))
  return {
    terms: terms.map(term => ({ ...term, isSaved: !!term.publicTermId && savedIds.has(term.publicTermId) })),
    error: null,
  }
}

async function loadTermbookTermsForTest(userId: string): Promise<{ terms: QuizTerm[]; error: string | null }> {
  const { data, error } = await supabase
    .from('user_termbook_items')
    .select('id, public_term_id, source_text, target_text, definition, example_sentence, personal_tags')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(500)

  if (error) return { terms: [], error: error.message }

  return {
    terms: ((data ?? []) as Array<Record<string, unknown>>)
      .map(row => normalizeTermRow(row, 'termbook', null))
      .filter((term): term is QuizTerm => !!term),
    error: null,
  }
}

function normalizeTermRow(row: Record<string, unknown>, sourceType: TestSource, categoryName: string | null): QuizTerm | null {
  const sourceText = String(row.source_text ?? '').trim()
  const targetText = String(row.target_text ?? '').trim()
  if (!sourceText || !targetText) return null

  return {
    id: String(row.id),
    publicTermId: sourceType === 'public' ? String(row.id) : row.public_term_id ? String(row.public_term_id) : null,
    termbookItemId: sourceType === 'termbook' ? String(row.id) : null,
    source_text: sourceText,
    target_text: targetText,
    definition: typeof row.definition === 'string' && row.definition.trim() ? row.definition.trim() : null,
    example_sentence: typeof row.example_sentence === 'string' && row.example_sentence.trim() ? row.example_sentence.trim() : null,
    categoryName,
    tags: normalizeTags(sourceType === 'public' ? row.tags : row.personal_tags),
    isSaved: sourceType === 'termbook',
  }
}

async function createQuestionsWithAIDistractors(terms: QuizTerm[], selectedDirection: TestDirection) {
  const questions: QuizQuestion[] = []
  const concurrency = 4

  for (let start = 0; start < terms.length; start += concurrency) {
    const batch = await Promise.all(
      terms.slice(start, start + concurrency).map((term, offset) => (
        createQuestion(term, selectedDirection, start + offset)
      ))
    )
    questions.push(...batch)
  }

  return questions
}

async function createQuestion(term: QuizTerm, selectedDirection: TestDirection, index: number): Promise<QuizQuestion> {
  const direction: QuizDirection = selectedDirection === 'random'
    ? Math.random() > 0.5 ? 'zh-en' : 'en-zh'
    : selectedDirection
  const prompt = direction === 'zh-en' ? term.source_text : term.target_text
  const correctAnswer = direction === 'zh-en' ? term.target_text : term.source_text
  const distractors = await generateQuestionDistractors(term, direction)

  return {
    id: `${term.id}-${index}`,
    term,
    direction,
    prompt,
    correctAnswer,
    options: shuffleItems([correctAnswer, ...distractors.map(item => item.text)]),
    distractorReasons: distractors.reduce<Record<string, string>>((out, item) => {
      out[normalizeOption(item.text)] = item.reason
      return out
    }, {}),
  }
}

async function generateQuestionDistractors(term: QuizTerm, direction: QuizDirection): Promise<AIDistractor[]> {
  try {
    const aiDistractors = await requestAIDistractors(term, direction)
    if (aiDistractors.length === 3) return aiDistractors
  } catch {
    // Fall through to the local rule-based generator.
  }

  return generateTermDistractors(term, direction).map(text => ({
    text,
    reason: '该选项属于常见误译或不规范表达。',
  }))
}

async function requestAIDistractors(term: QuizTerm, direction: QuizDirection): Promise<AIDistractor[]> {
  const correctAnswer = direction === 'zh-en' ? term.target_text : term.source_text
  const { data: { session } } = await supabase.auth.getSession()
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 35000)

  try {
    const response = await fetch('/api/terms/generate-distractors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        source_text: term.source_text,
        target_text: term.target_text,
        direction: direction === 'zh-en' ? 'zh_to_en' : 'en_to_zh',
        definition: term.definition,
        example_sentence: term.example_sentence,
        category_name: term.categoryName,
        tags: term.tags ?? [],
      }),
      signal: controller.signal,
    })

    if (!response.ok) throw new Error('AI distractor request failed')
    const payload = await response.json().catch(() => null) as { distractors?: unknown } | null
    const distractors = parseAIDistractors(payload?.distractors, correctAnswer)
    if (distractors.length !== 3) throw new Error('AI distractor response invalid')
    return distractors
  } finally {
    window.clearTimeout(timeout)
  }
}

function parseAIDistractors(value: unknown, correctAnswer: string): AIDistractor[] {
  if (!Array.isArray(value)) return []
  const seen = new Set([normalizeOption(correctAnswer)])
  const distractors: AIDistractor[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const text = typeof row.text === 'string' ? row.text.trim() : ''
    const reason = typeof row.reason === 'string' ? row.reason.trim() : ''
    const normalized = normalizeOption(text)
    if (!text || !normalized || seen.has(normalized)) continue
    seen.add(normalized)
    distractors.push({
      text,
      reason: reason || '该选项属于常见误译或不规范表达。',
    })
    if (distractors.length === 3) break
  }

  return distractors
}

function generateTermDistractors(term: QuizTerm, direction: QuizDirection) {
  const correctAnswer = direction === 'zh-en' ? term.target_text : term.source_text
  const candidates = direction === 'zh-en'
    ? englishDistractorCandidates(correctAnswer)
    : chineseDistractorCandidates(correctAnswer)
  const fallbacks = direction === 'zh-en'
    ? [`${correctAnswer} work`, `${correctAnswer} policy`, `the ${correctAnswer}`, `${correctAnswer} system`]
    : [`${correctAnswer}工作`, `${correctAnswer}机制`, `${correctAnswer}政策`, `可能误译：${correctAnswer}`]

  return uniqueOptions([...candidates, ...fallbacks], correctAnswer).slice(0, 3)
}

function englishDistractorCandidates(answer: string) {
  return [
    replaceFirstMatch(answer, [
      ['rule of law', 'rule by law'],
      ['high-quality', 'high-level'],
      ['development', 'growth'],
      ['cooperation', 'collaboration'],
      ['governance', 'management'],
      ['modernization', 'modernity'],
      ['security', 'safety'],
      ['sustainable', 'lasting'],
      ['community', 'society'],
      ['organization', 'institution'],
      ['policy', 'strategy'],
      ['innovation', 'creation'],
      ['reform', 'change'],
      ['global', 'worldwide'],
      ['comprehensive', 'overall'],
    ]),
    adjustEnglishArticle(answer),
    adjustEnglishBoundary(answer),
    adjustEnglishWordForm(answer),
    adjustEnglishCollocation(answer),
  ]
}

function chineseDistractorCandidates(answer: string) {
  return [
    replaceFirstChinese(answer, [
      ['法治', '法制'],
      ['治理', '管理'],
      ['高质量', '高水平'],
      ['发展', '开发'],
      ['合作', '协作'],
      ['安全', '安保'],
      ['现代化', '现代性'],
      ['可持续', '持续性'],
      ['经济', '财经'],
      ['政策', '策略'],
      ['组织', '机构'],
      ['权利', '权力'],
      ['创新', '创造'],
      ['共同体', '社区'],
      ['全球', '世界'],
      ['协定', '协议'],
      ['公约', '大会'],
    ]),
    adjustChineseBoundary(answer),
    `${answer}工作`,
    `${answer}机制`,
    `关于${answer}`,
  ]
}

function replaceFirstMatch(value: string, pairs: Array<[string, string]>) {
  for (const [from, to] of pairs) {
    const pattern = new RegExp(`\\b${escapeRegExp(from)}\\b`, 'i')
    if (pattern.test(value)) return value.replace(pattern, to)
  }
  return ''
}

function replaceFirstChinese(value: string, pairs: Array<[string, string]>) {
  for (const [from, to] of pairs) {
    if (value.includes(from)) return value.replace(from, to)
  }
  return ''
}

function adjustEnglishArticle(value: string) {
  if (/^(the|a|an)\s+/i.test(value)) return value.replace(/^(the|a|an)\s+/i, '')
  return `the ${value}`
}

function adjustEnglishBoundary(value: string) {
  if (value.includes(' of ')) {
    const [head, ...tail] = value.split(' of ')
    return `${tail.join(' of ')} ${head}`.trim()
  }
  const words = value.split(/\s+/).filter(Boolean)
  if (words.length > 2) return words.slice(1).join(' ')
  if (value.includes('-')) return value.replace(/-/g, ' ')
  return ''
}

function adjustEnglishWordForm(value: string) {
  const words = value.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const last = words[words.length - 1]
  const nextLast = last.endsWith('s') && last.length > 3 ? last.slice(0, -1) : `${last}s`
  return [...words.slice(0, -1), nextLast].join(' ')
}

function adjustEnglishCollocation(value: string) {
  if (/development/i.test(value)) return value.replace(/development/i, 'construction')
  if (/cooperation/i.test(value)) return value.replace(/cooperation/i, 'coordination')
  if (/governance/i.test(value)) return value.replace(/governance/i, 'administration')
  return `${value} affairs`
}

function adjustChineseBoundary(value: string) {
  if (value.includes('的')) return value.replace('的', '')
  if (value.endsWith('化')) return `${value.slice(0, -1)}性`
  if (value.length > 4) return value.slice(0, -2)
  return ''
}

function uniqueOptions(candidates: string[], correctAnswer: string) {
  const seen = new Set([normalizeOption(correctAnswer)])
  const result: string[] = []

  for (const candidate of candidates) {
    const trimmed = candidate.trim()
    const normalized = normalizeOption(trimmed)
    if (!trimmed || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(trimmed)
    if (result.length >= 3) break
  }

  return result
}

function buildExplanation(question: QuizQuestion, isCorrect: boolean, selectedAnswer: string) {
  const selectedReason = question.distractorReasons[normalizeOption(selectedAnswer)]
  const lines = isCorrect
    ? [`回答正确。可记住该词条的固定表达：${question.correctAnswer}。`]
    : [`该词条的规范译法是 ${question.correctAnswer}。${selectedReason || '当前选项属于常见误译或不规范表达。'}`]

  if (question.term.definition) lines.push(`解释：${question.term.definition}`)
  if (question.term.example_sentence) lines.push(`例句：${question.term.example_sentence}`)
  return lines.join(' ')
}

function shuffleItems<T>(items: T[]) {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = next[index]
    next[index] = next[swapIndex]
    next[swapIndex] = current
  }
  return next
}

function normalizeOption(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function normalizeTags(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const tags = value.map(tag => typeof tag === 'string' ? tag.trim() : '').filter(Boolean)
  return tags.length > 0 ? tags : null
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function directionLabel(value: TestDirection | QuizDirection) {
  if (value === 'zh-en') return '中文选英文'
  if (value === 'en-zh') return '英文选中文'
  return '随机方向'
}

function directionModeForSave(value: TestDirection) {
  if (value === 'zh-en') return 'zh_to_en'
  if (value === 'en-zh') return 'en_to_zh'
  return 'random'
}
