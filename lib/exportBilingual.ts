// 导出文档：三种模式
//   target              纯译文
//   bilingual           双语对照（#、原文、译文）
//   bilingual_notes     双语对照 + 备注列
//   review_comparison   审校对照（#、原文、原译、改译、修改理由），横向

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

export type ExportMode = 'target' | 'bilingual' | 'bilingual_notes' | 'review_comparison'

const langNames: Record<string, string> = {
  en: 'English', zh: '中文', ja: '日本語', ko: '한국어',
  fr: 'Français', de: 'Deutsch', es: 'Español', ru: 'Русский'
}

const modeMeta: Record<ExportMode, { suffix: string; label: string }> = {
  target: { suffix: '_译文', label: '译文' },
  bilingual: { suffix: '_双语对照', label: '双语对照' },
  bilingual_notes: { suffix: '_双语对照_带备注', label: '双语对照（含备注）' },
  review_comparison: { suffix: '_审校对照', label: '审校对照' },
}

const pt = (value: number) => Math.round(value * 20)
const border = { style: BorderStyle.SINGLE, size: 1, color: 'D8D1C6' }
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

type DocxChild = Paragraph | Table

export async function exportBilingualDoc(opts: {
  title: string
  sourceLang: string
  targetLang: string
  segments: Segment[]
  mode?: ExportMode
  translatorTargets?: Record<string, string>
}) {
  const { title, sourceLang, targetLang, segments, translatorTargets = {} } = opts
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
    ...contentForMode(mode, { sourceLang, targetLang, segments, translatorTargets }),
    new Paragraph({
      spacing: { before: pt(20) },
      children: [new TextRun({ text: '由译境 — 技大25级MTIer翻译平台导出', size: 18, color: '999999', font: '宋体' })],
    }),
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

  const packed = await Packer.toBlob(doc)
  const blob = packed.type === DOCX_MIME ? packed : new Blob([packed], { type: DOCX_MIME })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeTitle}${modeMeta[mode].suffix}.docx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function contentForMode(mode: ExportMode, opts: {
  sourceLang: string
  targetLang: string
  segments: Segment[]
  translatorTargets: Record<string, string>
}): DocxChild[] {
  const { sourceLang, targetLang, segments, translatorTargets } = opts

  if (mode === 'target') {
    const paragraphs = segments
      .map(s => (s.target || '').trim())
      .filter(Boolean)
      .map(t => textParagraph(t, { spacingAfter: 10 }))
    return paragraphs.length > 0 ? paragraphs : [textParagraph('（无译文内容）', { color: '999999' })]
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

function exportTable(rows: TableRow[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  })
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

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_') || 'translation'
}
