// 导出文档：
//   target              纯译文
//   bilingual           双语对照（#、原文、译文）
//   bilingual_notes     双语对照 + 备注列
//   review_comparison   审校对照（#、原文、原译、改译、修改理由），横向
//   delivery_package    完整成果包（定稿译文、术语资产、审校统计、代表性对照）

import {
  BorderStyle,
  Document,
  PageOrientation,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import type { Segment } from './sentenceSplit'

export type ExportMode = 'target' | 'bilingual' | 'bilingual_notes' | 'review_comparison' | 'delivery_package'

export type ExportGlossaryTerm = {
  source_term: string
  translated_term: string
  revision_term?: string | null
  definition?: string | null
  note?: string | null
}

export type ProjectDeliveryDocument = {
  title: string
  sourceLang: string
  targetLang: string
  segments: Segment[]
  translatorTargets?: Record<string, string>
  reviewOverallNote?: string
}

export type ProjectReviewRecapSample = {
  docTitle: string
  source: string
  translatorText: string
  reviewText: string
  issueTypes: string[]
  reviewNote?: string
  sentBack?: boolean
}

export type ProjectReviewRecapDocument = {
  title: string
  translated: number
  total: number
  reviewed: number
  locked: number
}

export type ProjectReviewRecapExperiment = {
  docTitle: string
  modelCount: number
  promptCount: number
  tempRange: string
  status: string
}

export type ProjectReviewRecapExport = {
  projectName: string
  description?: string | null
  langPair?: string | null
  brandFooter?: boolean
  progress: {
    documents: number
    totalSegments: number
    translatedSegments: number
    reviewedSegments: number
    lockedSegments: number
    glossaryCount: number
    issueTotal: number
    sentBackSegments: number
    modifiedSegments: number
  }
  nextFocus: string
  documents: ProjectReviewRecapDocument[]
  issues: Array<{ type: string; count: number }>
  samples: ProjectReviewRecapSample[]
  glossary?: ExportGlossaryTerm[]
  experiments?: ProjectReviewRecapExperiment[]
}

const langNames: Record<string, string> = {
  en: 'English', zh: '中文', ja: '日本語', ko: '한국어',
  fr: 'Français', de: 'Deutsch', es: 'Español', ru: 'Русский'
}

function exportBrandFooter() {
  return new Paragraph({
    spacing: { before: pt(20) },
    children: [new TextRun({ text: '由译境 — 技大25级MTIer翻译平台导出', size: 18, color: '999999', font: '宋体' })],
  })
}

const modeMeta: Record<ExportMode, { suffix: string; label: string }> = {
  target: { suffix: '_译文', label: '译文' },
  bilingual: { suffix: '_双语对照', label: '双语对照' },
  bilingual_notes: { suffix: '_双语对照_带备注', label: '双语对照（含备注）' },
  review_comparison: { suffix: '_审校对照', label: '审校对照' },
  delivery_package: { suffix: '_完整成果包', label: '完整成果包' },
}

const pt = (value: number) => Math.round(value * 20)
const border = { style: BorderStyle.SINGLE, size: 1, color: 'D8D1C6' }
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

type DocxChild = Paragraph | Table
type TermConsistencySample = {
  index: number
  source: string
  target: string
  matched: boolean
  sourceText: string
  finalText: string
}
type TermConsistencyReport = {
  totalHits: number
  matchedHits: number
  warningHits: number
  hitSegments: number
  matchedSegments: number
  warningSegments: number
  samples: TermConsistencySample[]
}

export async function exportBilingualDoc(opts: {
  title: string
  sourceLang: string
  targetLang: string
  segments: Segment[]
  mode?: ExportMode
  translatorTargets?: Record<string, string>
  glossary?: ExportGlossaryTerm[]
  reviewOverallNote?: string
  brandFooter?: boolean
}) {
  const { title, sourceLang, targetLang, segments, translatorTargets = {}, glossary = [], reviewOverallNote = '', brandFooter = true } = opts
  const mode: ExportMode = opts.mode ?? 'bilingual'
  const safeTitle = safeFileName(title || 'translation')
  const date = new Date().toLocaleDateString('zh-CN')
  const landscape = mode === 'review_comparison'

  const subtitle = mode === 'target'
    ? `${langNames[targetLang] || targetLang} · 共 ${segments.filter(s => (s.target || '').trim()).length} 段 · 导出于 ${date}`
    : `${langNames[sourceLang] || sourceLang} → ${langNames[targetLang] || targetLang} · 共 ${segments.length} 句 · 导出于 ${date}`

  const children: DocxChild[] = [
    new Paragraph({
      spacing: { after: pt(6) },
      children: [new TextRun({ text: title || 'translation', bold: true, size: 40, font: '宋体' })],
    }),
    new Paragraph({
      spacing: { after: pt(18) },
      children: [new TextRun({ text: subtitle, size: 20, color: '666666', font: '宋体' })],
    }),
    ...contentForMode(mode, { sourceLang, targetLang, segments, translatorTargets, glossary, reviewOverallNote }),
    ...(brandFooter ? [exportBrandFooter()] : []),
  ]

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: '宋体', size: landscape ? 21 : 24 },
          paragraph: { spacing: { line: 330 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
          margin: {
            top: landscape ? 560 : 720,
            bottom: landscape ? 560 : 720,
            left: landscape ? 560 : 720,
            right: landscape ? 560 : 720,
          },
        },
      },
      children,
    }],
  })

  await downloadDocx(doc, `${safeTitle}${modeMeta[mode].suffix}.docx`)
}

export async function exportProjectDeliveryPackage(opts: {
  projectName: string
  description?: string | null
  documents: ProjectDeliveryDocument[]
  glossary?: ExportGlossaryTerm[]
  brandFooter?: boolean
}) {
  const { projectName, description, documents, glossary = [], brandFooter = true } = opts
  const safeTitle = safeFileName(projectName || 'yijing-project')
  const date = new Date().toLocaleDateString('zh-CN')
  const allSegments = documents.flatMap(doc => doc.segments)
  const issueCounts = collectIssueCounts(allSegments)
  const termReport = collectTermConsistency(allSegments, glossary)
  const reviewedCount = allSegments.filter(s => s.status === 'reviewed' || s.status === 'locked').length
  const lockedCount = allSegments.filter(s => s.status === 'locked').length
  const translatedCount = allSegments.filter(s => finalTargetOf(s).trim()).length

  const children: DocxChild[] = [
    new Paragraph({
      spacing: { after: pt(6) },
      children: [new TextRun({ text: `${projectName || '译境研译项目'} · 项目交付包`, bold: true, size: 40, font: '宋体' })],
    }),
    new Paragraph({
      spacing: { after: pt(18) },
      children: [new TextRun({ text: `共 ${documents.length} 个文档 · ${allSegments.length} 个句段 · 导出于 ${date}`, size: 20, color: '666666', font: '宋体' })],
    }),
    ...(description?.trim() ? [textParagraph(description.trim(), { color: '555555', spacingAfter: 12 })] : []),
    sectionTitle('一、项目交付摘要'),
    exportTable([
      tableRow([{ text: '项目指标', width: 40, header: true }, { text: '数量', width: 20, header: true, align: 'center' }, { text: '说明', width: 40, header: true }]),
      tableRow([{ text: '原文文档', width: 40 }, { text: String(documents.length), width: 20, align: 'center' }, { text: '项目内全部文档', width: 40 }]),
      tableRow([{ text: '句段总数', width: 40 }, { text: String(allSegments.length), width: 20, align: 'center' }, { text: '用于翻译、审校和复盘', width: 40 }]),
      tableRow([{ text: '已形成译文', width: 40 }, { text: String(translatedCount), width: 20, align: 'center' }, { text: '优先统计共识译文', width: 40 }]),
      tableRow([{ text: '已共识审校', width: 40 }, { text: String(reviewedCount), width: 20, align: 'center' }, { text: '包含已定稿句段', width: 40 }]),
      tableRow([{ text: '已定稿句段', width: 40 }, { text: String(lockedCount), width: 20, align: 'center' }, { text: '作为最终交付依据', width: 40 }]),
      tableRow([{ text: '项目术语资产', width: 40 }, { text: String(glossary.length), width: 20, align: 'center' }, { text: '可复用到后续项目和论文写作', width: 40 }]),
      tableRow([{ text: '术语一致性风险', width: 40 }, { text: String(termReport.warningHits), width: 20, align: 'center' }, { text: '推荐译名未出现在定稿译文中的命中项', width: 40 }]),
    ]),
    sectionTitle('二、文档清单'),
    exportTable([
      tableRow([
        { text: '#', width: 6, header: true, align: 'center' },
        { text: '文档', width: 34, header: true },
        { text: '语言方向', width: 22, header: true },
        { text: '句段', width: 12, header: true, align: 'center' },
        { text: '已审校', width: 13, header: true, align: 'center' },
        { text: '已定稿', width: 13, header: true, align: 'center' },
      ]),
      ...documents.map((doc, index) => tableRow([
        { text: String(index + 1), width: 6, align: 'center', color: '888888' },
        { text: doc.title || `文档 ${index + 1}`, width: 34 },
        { text: `${langNames[doc.sourceLang] || doc.sourceLang} → ${langNames[doc.targetLang] || doc.targetLang}`, width: 22 },
        { text: String(doc.segments.length), width: 12, align: 'center' },
        { text: String(doc.segments.filter(s => s.status === 'reviewed' || s.status === 'locked').length), width: 13, align: 'center' },
        { text: String(doc.segments.filter(s => s.status === 'locked').length), width: 13, align: 'center' },
      ])),
    ]),
    sectionTitle('三、项目术语资产'),
    ...glossarySection(glossary),
    sectionTitle('四、术语一致性检查'),
    ...termConsistencySection(termReport, glossary.length),
    sectionTitle('五、审校问题统计'),
    ...issueSummarySection(issueCounts),
    ...documents.flatMap((doc, index) => [
      sectionTitle(`六.${index + 1} ${doc.title || `文档 ${index + 1}`} · 定稿译文`),
      ...(doc.reviewOverallNote?.trim() ? [textParagraph(`共识审校原则：${doc.reviewOverallNote.trim()}`, { color: '555555', spacingAfter: 10 })] : []),
      ...finalTranslationParagraphs(doc.segments),
      sectionTitle(`六.${index + 1} ${doc.title || `文档 ${index + 1}`} · 代表性审校对照`),
      ...reviewSampleSection({
        sourceLang: doc.sourceLang,
        segments: doc.segments.filter(s => {
          const translatorText = doc.translatorTargets?.[s.id] ?? s.translator_target ?? s.target ?? ''
          return finalTargetOf(s).trim() && translatorText.trim() && finalTargetOf(s).trim() !== translatorText.trim()
        }).slice(0, 8),
        translatorTargets: doc.translatorTargets ?? {},
      }),
    ]),
    ...(brandFooter ? [exportBrandFooter()] : []),
  ]

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: '宋体', size: 24 },
          paragraph: { spacing: { line: 330 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.PORTRAIT },
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      children,
    }],
  })

  await downloadDocx(doc, `${safeTitle}_项目交付包.docx`)
}

export async function exportProjectReviewRecap(opts: ProjectReviewRecapExport) {
  const {
    projectName,
    description,
    langPair,
    progress,
    nextFocus,
    documents,
    issues,
    samples,
    glossary = [],
    experiments = [],
    brandFooter = true,
  } = opts
  const safeTitle = safeFileName(projectName || 'yijing-project')
  const date = new Date().toLocaleDateString('zh-CN')

  const children: DocxChild[] = [
    new Paragraph({
      spacing: { after: pt(6) },
      children: [new TextRun({ text: `${projectName || '译境研译项目'} · 项目复盘文档`, bold: true, size: 40, font: '宋体' })],
    }),
    new Paragraph({
      spacing: { after: pt(18) },
      children: [new TextRun({ text: `${langPair || '研译项目'} · 导出于 ${date}`, size: 20, color: '666666', font: '宋体' })],
    }),
    ...(description?.trim() ? [textParagraph(description.trim(), { color: '555555', spacingAfter: 12 })] : []),
    sectionTitle('一、复盘摘要'),
    exportTable([
      tableRow([{ text: '复盘指标', width: 42, header: true }, { text: '数量', width: 18, header: true, align: 'center' }, { text: '说明', width: 40, header: true }]),
      tableRow([{ text: '原文文档', width: 42 }, { text: String(progress.documents), width: 18, align: 'center' }, { text: '纳入本次项目复盘的文档数量', width: 40 }]),
      tableRow([{ text: '句段总数', width: 42 }, { text: String(progress.totalSegments), width: 18, align: 'center' }, { text: '项目内全部句段', width: 40 }]),
      tableRow([{ text: '已翻译句段', width: 42 }, { text: String(progress.translatedSegments), width: 18, align: 'center' }, { text: '已有译者译文或定稿译文', width: 40 }]),
      tableRow([{ text: '已共识审校', width: 42 }, { text: String(progress.reviewedSegments), width: 18, align: 'center' }, { text: '包含已定稿句段', width: 40 }]),
      tableRow([{ text: '已定稿句段', width: 42 }, { text: String(progress.lockedSegments), width: 18, align: 'center' }, { text: '可作为最终成果依据', width: 40 }]),
      tableRow([{ text: '审校修改句段', width: 42 }, { text: String(progress.modifiedSegments), width: 18, align: 'center' }, { text: '译者译文与共识译文不同，或有审校意见', width: 40 }]),
      tableRow([{ text: '退回修改句段', width: 42 }, { text: String(progress.sentBackSegments), width: 18, align: 'center' }, { text: '协作返工与重点复盘对象', width: 40 }]),
      tableRow([{ text: '术语资产', width: 42 }, { text: String(progress.glossaryCount), width: 18, align: 'center' }, { text: '可用于后续项目和论文写作', width: 40 }]),
      tableRow([{ text: '审校问题记录', width: 42 }, { text: String(progress.issueTotal), width: 18, align: 'center' }, { text: '来自逐句共识审校的问题类型', width: 40 }]),
    ]),
    sectionTitle('二、当前复盘重点'),
    textParagraph(nextFocus || '（暂无复盘重点）', { color: nextFocus ? '222222' : '999999', spacingAfter: 10 }),
    sectionTitle('三、文档清单'),
    ...reviewRecapDocumentsSection(documents),
    sectionTitle('四、审校问题分布'),
    ...reviewRecapIssueSection(issues),
    sectionTitle('五、代表性审校样例'),
    ...reviewRecapSampleSection(samples),
    sectionTitle('六、术语资产摘要'),
    ...glossarySection(glossary.slice(0, 40)),
    ...(glossary.length > 40 ? [textParagraph(`另有 ${glossary.length - 40} 条术语资产未展开。`, { color: '666666' })] : []),
    sectionTitle('七、AI 对照实验摘要'),
    ...reviewRecapExperimentSection(experiments),
    sectionTitle('八、可展开写作结构'),
    ...[
      '1. 项目背景与文本类型',
      '2. 翻译难点与策略选择',
      '3. 术语一致性与共识形成',
      '4. 审校问题类型与修订依据',
      '5. AI 对照实验观察',
      '6. 训练复盘与后续改进',
    ].map(line => textParagraph(line, { spacingAfter: 6 })),
    ...(brandFooter ? [exportBrandFooter()] : []),
  ]

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: '宋体', size: 24 },
          paragraph: { spacing: { line: 330 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.PORTRAIT },
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      children,
    }],
  })

  await downloadDocx(doc, `${safeTitle}_项目复盘文档.docx`)
}

function contentForMode(mode: ExportMode, opts: {
  sourceLang: string
  targetLang: string
  segments: Segment[]
  translatorTargets: Record<string, string>
  glossary: ExportGlossaryTerm[]
  reviewOverallNote: string
}): DocxChild[] {
  const { sourceLang, targetLang, segments, translatorTargets, glossary, reviewOverallNote } = opts

  if (mode === 'target') {
    const paragraphs = segments
      .map(s => finalTargetOf(s).trim())
      .filter(Boolean)
      .map(t => textParagraph(t, { spacingAfter: 10 }))
    return paragraphs.length > 0 ? paragraphs : [textParagraph('（无译文内容）', { color: '999999' })]
  }

  if (mode === 'delivery_package') {
    return deliveryPackageContent({ sourceLang, targetLang, segments, translatorTargets, glossary, reviewOverallNote })
  }

  if (mode === 'review_comparison') {
    const rows = segments.map((s, i) => {
      const translatorText = translatorTargets[s.id] ?? s.translator_target ?? s.target ?? ''
      const reviewerText = s.review_target || s.target || ''
      const note = formatNotesForExport(s.notes || '')
      return tableRow([
        { text: String(i + 1), width: 4, align: 'center', color: '888888' },
        { text: s.source, width: 26 },
        { text: translatorText, width: 25 },
        { text: reviewerText, width: 25 },
        { text: note, width: 20, color: '555555' },
      ])
    })

    return [exportTable([
      tableRow([
        { text: '#', width: 4, header: true, align: 'center' },
        { text: `${langNames[sourceLang] || sourceLang}（原文）`, width: 26, header: true },
        { text: '原译', width: 25, header: true },
        { text: '改译', width: 25, header: true },
        { text: '修改理由', width: 20, header: true },
      ]),
      ...rows,
    ])]
  }

  const withNotes = mode === 'bilingual_notes'
  const header = withNotes
    ? [
        { text: '#', width: 4, header: true, align: 'center' as const },
        { text: `${langNames[sourceLang] || sourceLang}（原文）`, width: 36, header: true },
        { text: `${langNames[targetLang] || targetLang}（译文）`, width: 36, header: true },
        { text: '备注', width: 24, header: true },
      ]
    : [
        { text: '#', width: 5, header: true, align: 'center' as const },
        { text: `${langNames[sourceLang] || sourceLang}（原文）`, width: 47, header: true },
        { text: `${langNames[targetLang] || targetLang}（译文）`, width: 48, header: true },
      ]

  const rows = segments.map((s, i) => withNotes
    ? tableRow([
        { text: String(i + 1), width: 4, align: 'center', color: '888888' },
        { text: s.source, width: 36 },
        { text: s.target, width: 36 },
        { text: s.notes || '', width: 24, color: '555555' },
      ])
    : tableRow([
        { text: String(i + 1), width: 5, align: 'center', color: '888888' },
        { text: s.source, width: 47 },
        { text: s.target, width: 48 },
      ]))

  return [exportTable([tableRow(header), ...rows])]
}

function deliveryPackageContent(opts: {
  sourceLang: string
  targetLang: string
  segments: Segment[]
  translatorTargets: Record<string, string>
  glossary: ExportGlossaryTerm[]
  reviewOverallNote: string
}): DocxChild[] {
  const { sourceLang, targetLang, segments, translatorTargets, glossary, reviewOverallNote } = opts
  const translatedCount = segments.filter(s => (s.target || '').trim()).length
  const reviewedCount = segments.filter(s => s.status === 'reviewed' || s.status === 'locked').length
  const lockedCount = segments.filter(s => s.status === 'locked').length
  const issueCounts = collectIssueCounts(segments)
  const termReport = collectTermConsistency(segments, glossary)
  const issueTotal = Object.values(issueCounts).reduce((sum, count) => sum + count, 0)
  const changedSamples = segments.filter(s => {
    const translatorText = translatorTargets[s.id] ?? s.translator_target ?? s.target ?? ''
    return finalTargetOf(s).trim() && translatorText.trim() && finalTargetOf(s).trim() !== translatorText.trim()
  }).slice(0, 12)

  return [
    sectionTitle('一、交付摘要'),
    exportTable([
      tableRow([{ text: '项目指标', width: 36, header: true }, { text: '数量', width: 20, header: true }, { text: '说明', width: 44, header: true }]),
      tableRow([{ text: '句段总数', width: 36 }, { text: String(segments.length), width: 20 }, { text: `${langNames[sourceLang] || sourceLang} → ${langNames[targetLang] || targetLang}`, width: 44 }]),
      tableRow([{ text: '已翻译句段', width: 36 }, { text: String(translatedCount), width: 20 }, { text: '含译者译文或定稿译文', width: 44 }]),
      tableRow([{ text: '已共识审校', width: 36 }, { text: String(reviewedCount), width: 20 }, { text: '包含已定稿句段', width: 44 }]),
      tableRow([{ text: '已定稿句段', width: 36 }, { text: String(lockedCount), width: 20 }, { text: '锁定后作为交付译文依据', width: 44 }]),
      tableRow([{ text: '术语资产', width: 36 }, { text: String(glossary.length), width: 20 }, { text: '用于一致性复盘和后续项目复用', width: 44 }]),
      tableRow([{ text: '术语一致性风险', width: 36 }, { text: String(termReport.warningHits), width: 20 }, { text: '推荐译名未出现在定稿译文中的命中项', width: 44 }]),
      tableRow([{ text: '审校问题记录', width: 36 }, { text: String(issueTotal), width: 20 }, { text: '来自逐句共识审校意见的问题类型', width: 44 }]),
    ]),
    ...(reviewOverallNote.trim()
      ? [sectionTitle('二、共识审校原则'), textParagraph(reviewOverallNote.trim(), { spacingAfter: 14 })]
      : [sectionTitle('二、共识审校原则'), textParagraph('（暂无整体审校原则记录）', { color: '999999' })]),
    sectionTitle('三、定稿译文'),
    ...finalTranslationParagraphs(segments),
    sectionTitle('四、术语资产'),
    ...glossarySection(glossary),
    sectionTitle('五、术语一致性检查'),
    ...termConsistencySection(termReport, glossary.length),
    sectionTitle('六、审校问题统计'),
    ...issueSummarySection(issueCounts),
    sectionTitle('七、代表性审校对照'),
    ...reviewSampleSection({ sourceLang, segments: changedSamples, translatorTargets }),
  ]
}

function exportTable(rows: TableRow[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  })
}

function sectionTitle(text: string) {
  return new Paragraph({
    spacing: { before: pt(18), after: pt(8) },
    children: [new TextRun({ text, bold: true, size: 28, color: '1F1E1D', font: '宋体' })],
  })
}

function finalTargetOf(segment: Segment): string {
  return segment.review_target || segment.target || ''
}

function finalTranslationParagraphs(segments: Segment[]): DocxChild[] {
  const paragraphs = segments
    .map(s => finalTargetOf(s).trim())
    .filter(Boolean)
    .map(text => textParagraph(text, { spacingAfter: 8 }))
  return paragraphs.length > 0 ? paragraphs : [textParagraph('（暂无定稿译文）', { color: '999999' })]
}

function glossarySection(glossary: ExportGlossaryTerm[]): DocxChild[] {
  if (glossary.length === 0) return [textParagraph('（暂无术语资产）', { color: '999999' })]
  return [exportTable([
    tableRow([
      { text: '原文术语', width: 24, header: true },
      { text: '推荐译名', width: 24, header: true },
      { text: '共识译名', width: 24, header: true },
      { text: '释义 / 备注', width: 28, header: true },
    ]),
    ...glossary.map(term => tableRow([
      { text: term.source_term || '', width: 24 },
      { text: term.translated_term || '', width: 24 },
      { text: preferredGlossaryTarget(term), width: 24 },
      { text: cleanGlossaryNote(term.definition || term.note || ''), width: 28, color: '555555' },
    ])),
  ])]
}

function collectTermConsistency(segments: Segment[], glossary: ExportGlossaryTerm[]): TermConsistencyReport {
  const samples: TermConsistencySample[] = []
  let totalHits = 0
  let matchedHits = 0
  let warningHits = 0
  let hitSegments = 0
  let matchedSegments = 0
  let warningSegments = 0

  segments.forEach((segment, index) => {
    const hits = findTermHits(segment.source || '', finalTargetOf(segment), glossary)
    if (hits.length === 0) return
    hitSegments++
    totalHits += hits.length
    const warnings = hits.filter(hit => !hit.matched)
    matchedHits += hits.length - warnings.length
    warningHits += warnings.length
    if (warnings.length === 0) matchedSegments++
    else warningSegments++
    warnings.slice(0, Math.max(0, 12 - samples.length)).forEach(hit => {
      samples.push({
        index,
        source: hit.source,
        target: hit.target,
        matched: hit.matched,
        sourceText: segment.source || '',
        finalText: finalTargetOf(segment),
      })
    })
  })

  return { totalHits, matchedHits, warningHits, hitSegments, matchedSegments, warningSegments, samples }
}

function findTermHits(sourceText: string, checkText: string, glossary: ExportGlossaryTerm[]): Array<{ source: string; target: string; matched: boolean }> {
  if (!sourceText || glossary.length === 0) return []
  const seen = new Set<string>()
  return glossary.flatMap(term => {
    const source = (term.source_term || '').trim()
    const target = preferredGlossaryTarget(term)
    if (!source || !target || seen.has(`${source}\u0000${target}`)) return []
    if (!sourceText.includes(source)) return []
    seen.add(`${source}\u0000${target}`)
    return [{ source, target, matched: Boolean(checkText && checkText.includes(target)) }]
  })
}

function preferredGlossaryTarget(term: ExportGlossaryTerm): string {
  if (term.revision_term?.trim()) return term.revision_term.trim()
  const raw = term.definition || term.note || ''
  if (raw.startsWith('__GLOSSARY_META_V1__\n')) {
    try {
      const meta = JSON.parse(raw.slice('__GLOSSARY_META_V1__\n'.length)) as Record<string, unknown>
      const revision = typeof meta.revision_term === 'string' ? meta.revision_term.trim() : ''
      if (revision) return revision
    } catch {}
  }
  return (term.translated_term || '').trim()
}

function termConsistencySection(report: TermConsistencyReport, glossaryCount: number): DocxChild[] {
  if (glossaryCount === 0) return [textParagraph('（暂无术语资产，无法进行一致性检查）', { color: '999999' })]
  if (report.totalHits === 0) return [textParagraph('（当前句段未命中项目术语资产）', { color: '999999' })]
  const adoptionRate = Math.round((report.matchedHits / report.totalHits) * 100)
  const children: DocxChild[] = [
    exportTable([
      tableRow([{ text: '检查项', width: 42, header: true }, { text: '数量', width: 18, header: true, align: 'center' }, { text: '说明', width: 40, header: true }]),
      tableRow([{ text: '命中术语句段', width: 42 }, { text: String(report.hitSegments), width: 18, align: 'center' }, { text: '原文包含项目术语资产的句段', width: 40 }]),
      tableRow([{ text: '已采用推荐译法句段', width: 42 }, { text: String(report.matchedSegments), width: 18, align: 'center' }, { text: '命中项均已在定稿译文中出现', width: 40 }]),
      tableRow([{ text: '疑似不一致句段', width: 42 }, { text: String(report.warningSegments), width: 18, align: 'center' }, { text: '至少一个推荐译名未出现在定稿译文中', width: 40 }]),
      tableRow([{ text: '术语命中总数', width: 42 }, { text: String(report.totalHits), width: 18, align: 'center' }, { text: `采用率 ${adoptionRate}%`, width: 40 }]),
    ]),
  ]

  if (report.samples.length === 0) {
    children.push(textParagraph('当前命中的术语均已采用推荐译法。', { color: '227A45' }))
    return children
  }

  children.push(exportTable([
    tableRow([
      { text: '#', width: 6, header: true, align: 'center' },
      { text: '原文术语', width: 16, header: true },
      { text: '推荐 / 共识译法', width: 20, header: true },
      { text: '来源句段', width: 28, header: true },
      { text: '当前定稿译文', width: 30, header: true },
    ]),
    ...report.samples.map(sample => tableRow([
      { text: String(sample.index + 1), width: 6, align: 'center', color: '888888' },
      { text: sample.source, width: 16 },
      { text: sample.target, width: 20 },
      { text: sample.sourceText, width: 28, color: '555555' },
      { text: sample.finalText || '（暂无定稿译文）', width: 30, color: sample.finalText ? '555555' : '999999' },
    ])),
  ]))

  return children
}

function collectIssueCounts(segments: Segment[]): Record<string, number> {
  const counts: Record<string, number> = {}
  segments.forEach(segment => {
    const note = formatNotesForExport(segment.notes || '')
    const match = note.match(/类型:\s*([^\n]+)/)
    const rawTypes = match?.[1] || ''
    rawTypes
      .split(/[；;,，、]/)
      .map(type => type.trim())
      .filter(Boolean)
      .forEach(type => { counts[type] = (counts[type] ?? 0) + 1 })
  })
  return counts
}

function issueSummarySection(issueCounts: Record<string, number>): DocxChild[] {
  const entries = Object.entries(issueCounts).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return [textParagraph('（暂无结构化审校问题记录）', { color: '999999' })]
  return [exportTable([
    tableRow([{ text: '问题类型', width: 60, header: true }, { text: '数量', width: 40, header: true, align: 'center' }]),
    ...entries.map(([type, count]) => tableRow([
      { text: type, width: 60 },
      { text: String(count), width: 40, align: 'center' },
    ])),
  ])]
}

function reviewSampleSection(opts: {
  sourceLang: string
  segments: Segment[]
  translatorTargets: Record<string, string>
}): DocxChild[] {
  const { sourceLang, segments, translatorTargets } = opts
  if (segments.length === 0) return [textParagraph('（暂无译者译文与共识译文不同的代表性对照）', { color: '999999' })]
  return [exportTable([
    tableRow([
      { text: '#', width: 5, header: true, align: 'center' },
      { text: `${langNames[sourceLang] || sourceLang}（原文）`, width: 30, header: true },
      { text: '译者译文', width: 25, header: true },
      { text: '共识译文', width: 25, header: true },
      { text: '审校依据', width: 15, header: true },
    ]),
    ...segments.map((segment, index) => tableRow([
      { text: String(index + 1), width: 5, align: 'center', color: '888888' },
      { text: segment.source || '', width: 30 },
      { text: translatorTargets[segment.id] ?? segment.translator_target ?? segment.target ?? '', width: 25 },
      { text: finalTargetOf(segment), width: 25 },
      { text: formatNotesForExport(segment.notes || ''), width: 15, color: '555555' },
    ])),
  ])]
}

function reviewRecapDocumentsSection(documents: ProjectReviewRecapDocument[]): DocxChild[] {
  if (documents.length === 0) return [textParagraph('（暂无文档）', { color: '999999' })]
  return [exportTable([
    tableRow([
      { text: '#', width: 6, header: true, align: 'center' },
      { text: '文档', width: 42, header: true },
      { text: '已翻译', width: 17, header: true, align: 'center' },
      { text: '已审校', width: 17, header: true, align: 'center' },
      { text: '已定稿', width: 18, header: true, align: 'center' },
    ]),
    ...documents.map((doc, index) => tableRow([
      { text: String(index + 1), width: 6, align: 'center', color: '888888' },
      { text: doc.title || `文档 ${index + 1}`, width: 42 },
      { text: `${doc.translated}/${doc.total}`, width: 17, align: 'center' },
      { text: `${doc.reviewed}/${doc.total}`, width: 17, align: 'center' },
      { text: `${doc.locked}/${doc.total}`, width: 18, align: 'center' },
    ])),
  ])]
}

function reviewRecapIssueSection(issues: Array<{ type: string; count: number }>): DocxChild[] {
  if (issues.length === 0) return [textParagraph('（暂无结构化审校问题记录）', { color: '999999' })]
  const total = issues.reduce((sum, issue) => sum + issue.count, 0)
  return [exportTable([
    tableRow([
      { text: '问题类型', width: 54, header: true },
      { text: '数量', width: 18, header: true, align: 'center' },
      { text: '占比', width: 28, header: true, align: 'center' },
    ]),
    ...issues.map(issue => tableRow([
      { text: issue.type, width: 54 },
      { text: String(issue.count), width: 18, align: 'center' },
      { text: `${Math.round((issue.count / Math.max(1, total)) * 100)}%`, width: 28, align: 'center' },
    ])),
  ])]
}

function reviewRecapSampleSection(samples: ProjectReviewRecapSample[]): DocxChild[] {
  if (samples.length === 0) return [textParagraph('（暂无代表性审校样例）', { color: '999999' })]
  return [exportTable([
    tableRow([
      { text: '#', width: 5, header: true, align: 'center' },
      { text: '文档', width: 15, header: true },
      { text: '原文', width: 24, header: true },
      { text: '译者译文', width: 20, header: true },
      { text: '共识译文', width: 20, header: true },
      { text: '审校依据', width: 16, header: true },
    ]),
    ...samples.map((sample, index) => {
      const issueLine = Array.from(new Set(sample.issueTypes)).join('、')
      const reviewNote = [
        sample.sentBack ? '退回修改' : '',
        issueLine ? `问题类型：${issueLine}` : '',
        sample.reviewNote || '',
      ].filter(Boolean).join('\n')
      return tableRow([
        { text: String(index + 1), width: 5, align: 'center', color: '888888' },
        { text: sample.docTitle, width: 15 },
        { text: sample.source, width: 24 },
        { text: sample.translatorText, width: 20 },
        { text: sample.reviewText || sample.translatorText, width: 20 },
        { text: reviewNote || '（未记录）', width: 16, color: reviewNote ? '555555' : '999999' },
      ])
    }),
  ])]
}

function reviewRecapExperimentSection(experiments: ProjectReviewRecapExperiment[]): DocxChild[] {
  if (experiments.length === 0) return [textParagraph('（暂无 AI 对照实验记录）', { color: '999999' })]
  return [exportTable([
    tableRow([
      { text: '#', width: 6, header: true, align: 'center' },
      { text: '文档', width: 38, header: true },
      { text: '模型数', width: 16, header: true, align: 'center' },
      { text: '提示词', width: 16, header: true, align: 'center' },
      { text: '温度', width: 12, header: true, align: 'center' },
      { text: '状态', width: 12, header: true, align: 'center' },
    ]),
    ...experiments.map((exp, index) => tableRow([
      { text: String(index + 1), width: 6, align: 'center', color: '888888' },
      { text: exp.docTitle, width: 38 },
      { text: String(exp.modelCount), width: 16, align: 'center' },
      { text: String(exp.promptCount), width: 16, align: 'center' },
      { text: exp.tempRange, width: 12, align: 'center' },
      { text: exp.status, width: 12, align: 'center' },
    ])),
  ])]
}

function tableRow(cells: Array<{
  text: string
  width: number
  header?: boolean
  align?: 'left' | 'center'
  color?: string
}>) {
  return new TableRow({
    tableHeader: cells.some(cell => cell.header),
    children: cells.map(cell => new TableCell({
      width: { size: cell.width, type: WidthType.PERCENTAGE },
      shading: cell.header ? { fill: 'F5F2EC' } : undefined,
      borders: { top: border, bottom: border, left: border, right: border },
      margins: { top: 140, bottom: 140, left: 140, right: 140 },
      children: textToParagraphs(cell.text, {
        bold: cell.header,
        color: cell.color,
        align: cell.align,
        size: cell.header ? 21 : 20,
      }),
    })),
  })
}

function textToParagraphs(text: string, opts: { bold?: boolean; color?: string; align?: 'left' | 'center'; size?: number } = {}) {
  const lines = (text || '').split(/\n+/)
  const safeLines = lines.length > 0 ? lines : ['']
  return safeLines.map(line => textParagraph(line, opts))
}

function textParagraph(text: string, opts: { bold?: boolean; color?: string; align?: 'left' | 'center'; size?: number; spacingAfter?: number } = {}) {
  return new Paragraph({
    alignment: opts.align === 'center' ? 'center' : 'left',
    spacing: { after: pt(opts.spacingAfter ?? 4) },
    children: [new TextRun({
      text,
      bold: opts.bold,
      color: opts.color || '222222',
      size: opts.size ?? 24,
      font: '宋体',
    })],
  })
}

function formatNotesForExport(raw: string): string {
  if (!raw) return ''
  const sep = '\n———审校意见———\n'
  const idx = raw.indexOf(sep)
  if (idx === -1) return raw
  const translator = raw.slice(0, idx).trim()
  const review = raw.slice(idx + sep.length).trim()
  return [
    translator ? `译者备注：${translator}` : '',
    review ? `审校意见：${review}` : '',
  ].filter(Boolean).join('\n')
}

function cleanGlossaryNote(raw: string): string {
  if (!raw) return ''
  if (!raw.startsWith('__GLOSSARY_META_V1__\n')) return raw
  try {
    const meta = JSON.parse(raw.slice('__GLOSSARY_META_V1__\n'.length)) as Record<string, unknown>
    return [
      typeof meta.definition === 'string' ? meta.definition : '',
      typeof meta.note === 'string' ? meta.note : '',
      typeof meta.source_segment === 'string' ? `来源句段：${meta.source_segment}` : '',
    ].filter(Boolean).join('\n')
  } catch {
    return ''
  }
}

async function downloadDocx(doc: Document, fileName: string) {
  const packed = await Packer.toBlob(doc)
  const blob = packed.type === DOCX_MIME ? packed : new Blob([packed], { type: DOCX_MIME })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_') || 'translation'
}
