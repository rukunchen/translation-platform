// 导出并行翻译矩阵：原文 + 各模型译文 + 已采用译文
// 支持两种格式：
//   - word  → .doc（HTML 表格，Word 直接打开）
//   - xlsx  → .xlsx（SheetJS 生成）

import * as XLSX from 'xlsx'
import type { Segment } from './sentenceSplit'
import type { ParallelResult } from '@/components/ParallelTranslationCell'
import type { WindowConfig } from './modelPresets'
import { windowLabel } from './modelPresets'
import { parallelConfigRunKey, parallelResultKey } from './parallelKeys'

export type ParallelExportFormat = 'word' | 'xlsx'

const langNames: Record<string, string> = {
  en: 'English', zh: '中文', ja: '日本語', ko: '한국어',
  fr: 'Français', de: 'Deutsch', es: 'Español', ru: 'Русский',
}

type Opts = {
  title: string
  sourceLang: string
  targetLang: string
  segments: Segment[]
  configs: WindowConfig[]           // 4 个窗口（含未启用的）
  results: Map<string, ParallelResult>
  format: ParallelExportFormat
}

function makeKey(segmentId: string, config: WindowConfig) {
  return parallelResultKey(segmentId, parallelConfigRunKey(config))
}

function escape(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\n/g, '<br/>')
}

function safeFileName(title: string): string {
  return title.replace(/[^\w一-龥]+/g, '_') || 'parallel'
}

// 标题：「Model A · Claude Opus 4.7」
function columnHeader(cfg: WindowConfig, idx: number): string {
  return `${windowLabel(idx)} · ${cfg.model}`
}

export function exportParallelMatrix(opts: Opts) {
  const { format } = opts
  if (format === 'xlsx') return exportXlsx(opts)
  return exportWord(opts)
}

// ─────────────────────── Excel ───────────────────────

function exportXlsx({ title, sourceLang, targetLang, segments, configs, results }: Opts) {
  const enabled = configs.map((c, i) => ({ c, i })).filter(({ c }) => c.enabled)
  if (enabled.length === 0) {
    alert('请至少启用一个模型窗口再导出')
    return
  }

  // 表头：# | 原文 | Model A · xxx | Model B · xxx | ... | 已采用译文
  const header: string[] = ['#', `原文（${langNames[sourceLang] || sourceLang}）`]
  enabled.forEach(({ c, i }) => header.push(columnHeader(c, i)))
  header.push(`已采用译文（${langNames[targetLang] || targetLang}）`)

  const rows: (string | number)[][] = [header]

  segments.forEach((seg, idx) => {
    const row: (string | number)[] = [idx + 1, seg.source || '']
    enabled.forEach(({ c }) => {
      const r = results.get(makeKey(seg.id, c))
      if (!r) { row.push(''); return }
      if (r.status === 'failed') { row.push(`[失败] ${r.error_message || ''}`); return }
      if (r.status === 'running') { row.push('[翻译中]'); return }
      row.push(r.translated_text || '')
    })
    row.push(seg.target || '')
    rows.push(row)
  })

  const ws = XLSX.utils.aoa_to_sheet(rows)

  // 列宽：#=5, 原文=42, 各模型=42, 已采用=42
  const colCount = header.length
  ws['!cols'] = Array.from({ length: colCount }, (_, i) =>
    i === 0 ? { wch: 5 } : { wch: 42 }
  )

  // 自动换行 + 行高估算
  ws['!rows'] = rows.map((r, idx) => {
    if (idx === 0) return { hpt: 22 }
    // 取本行最长文本估算行数
    const maxChars: number = r.slice(1).reduce<number>((m, cell) => {
      const len = String(cell ?? '').length
      return Math.max(m, len)
    }, 0)
    const lines = Math.max(1, Math.ceil(maxChars / 42))
    return { hpt: Math.min(20 + lines * 16, 320) }
  })

  // 给所有正文单元格加上 wrap text
  const range = XLSX.utils.decode_range(ws['!ref']!)
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      const cell = ws[addr]
      if (!cell) continue
      cell.s = {
        alignment: { wrapText: true, vertical: 'top', horizontal: R === 0 ? 'center' : 'left' },
        font: R === 0 ? { bold: true } : undefined,
      }
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '并行翻译对比')

  // 第二个 sheet：元信息
  const meta = XLSX.utils.aoa_to_sheet([
    ['标题', title],
    ['原文语言', langNames[sourceLang] || sourceLang],
    ['译文语言', langNames[targetLang] || targetLang],
    ['句段总数', segments.length],
    ['模型窗口', enabled.length],
    ['导出时间', new Date().toLocaleString('zh-CN')],
    [],
    ['窗口', '提供商', '模型', '温度', 'Prompt'],
    ...enabled.map(({ c, i }) => [windowLabel(i), c.provider, c.model, c.temperature, c.prompt || '']),
  ])
  meta['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 28 }, { wch: 8 }, { wch: 60 }]
  XLSX.utils.book_append_sheet(wb, meta, '元信息')

  XLSX.writeFile(wb, `${safeFileName(title)}_并行翻译对比.xlsx`)
}

// ─────────────────────── Word ───────────────────────

function exportWord({ title, sourceLang, targetLang, segments, configs, results }: Opts) {
  const enabled = configs.map((c, i) => ({ c, i })).filter(({ c }) => c.enabled)
  if (enabled.length === 0) {
    alert('请至少启用一个模型窗口再导出')
    return
  }

  const date = new Date().toLocaleDateString('zh-CN')

  // 列宽分配（百分比）
  const numW = 4
  const adoptedW = 18
  const restW = 100 - numW - adoptedW           // 78
  const sourceW = Math.floor(restW / (enabled.length + 1))
  const modelW = sourceW

  const headerCells = [
    `<th style="width:${numW}%;text-align:center;">#</th>`,
    `<th style="width:${sourceW}%;">原文（${escape(langNames[sourceLang] || sourceLang)}）</th>`,
    ...enabled.map(({ c, i }) =>
      `<th style="width:${modelW}%;">${escape(columnHeader(c, i))}</th>`
    ),
    `<th style="width:${adoptedW}%;">已采用译文</th>`,
  ].join('')

  const bodyRows = segments.map((seg, idx) => {
    const cells: string[] = [
      `<td style="border:1px solid #ccc;padding:8px;text-align:center;color:#999;font-size:10pt;">${idx + 1}</td>`,
      `<td style="border:1px solid #ccc;padding:8px;vertical-align:top;">${escape(seg.source)}</td>`,
    ]
    enabled.forEach(({ c }) => {
      const r = results.get(makeKey(seg.id, c))
      let content = ''
      let style = 'border:1px solid #ccc;padding:8px;vertical-align:top;'
      if (!r) {
        content = '<span style="color:#bbb;">—</span>'
      } else if (r.status === 'failed') {
        content = `<span style="color:#c00;">[失败]</span> ${escape(r.error_message || '')}`
        style += 'background:#fff5f5;'
      } else if (r.status === 'running') {
        content = '<span style="color:#999;">[翻译中]</span>'
      } else {
        content = escape(r.translated_text || '')
        // 高亮已采用的格子
        if (seg.target?.trim() && seg.target.trim() === (r.translated_text || '').trim()) {
          style += 'background:#f0fdf4;'
        }
      }
      cells.push(`<td style="${style}">${content}</td>`)
    })
    const adoptedCell = seg.target?.trim()
      ? `<td style="border:1px solid #ccc;padding:8px;vertical-align:top;background:#f0fdf4;font-weight:500;">${escape(seg.target)}</td>`
      : `<td style="border:1px solid #ccc;padding:8px;vertical-align:top;color:#bbb;">—</td>`
    cells.push(adoptedCell)
    return `<tr>${cells.join('')}</tr>`
  }).join('')

  // 元信息块
  const metaRows = enabled.map(({ c, i }) =>
    `<tr>
      <td style="padding:4px 10px;color:#666;">${windowLabel(i)}</td>
      <td style="padding:4px 10px;">${escape(c.provider)}</td>
      <td style="padding:4px 10px;font-family:monospace;">${escape(c.model)}</td>
      <td style="padding:4px 10px;font-family:monospace;">T=${c.temperature}</td>
    </tr>`
  ).join('')

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${escape(title)} · 并行翻译对比</title>
<style>
  @page { size: A3 landscape; margin: 1cm; }
  body { font-family: 'Segoe UI', SimSun, '宋体', serif; font-size: 10pt; padding: 18pt; }
  h1 { font-size: 18pt; margin: 0 0 6pt; }
  .meta { color: #666; font-size: 9pt; margin-bottom: 14pt; }
  table.matrix { border-collapse: collapse; width: 100%; table-layout: fixed; word-wrap: break-word; }
  th { background: #f5f5f0; border: 1px solid #ccc; padding: 8px; text-align: left; font-weight: 600; font-size: 10pt; }
  td { font-size: 10pt; }
  .models-info { margin: 10pt 0 16pt; border: 1px solid #eee; }
  .models-info td { font-size: 9pt; }
</style>
</head>
<body>
  <h1>${escape(title)}</h1>
  <p class="meta">
    ${escape(langNames[sourceLang] || sourceLang)} → ${escape(langNames[targetLang] || targetLang)}
    · 共 ${segments.length} 句
    · ${enabled.length} 个模型
    · 导出于 ${date}
  </p>

  <table class="models-info">
    <tbody>${metaRows}</tbody>
  </table>

  <table class="matrix">
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>

  <p style="margin-top:18pt;color:#999;font-size:9pt;text-align:center;">由译境 — 技大25级MTIer翻译平台导出</p>
</body>
</html>`

  const blob = new Blob(['﻿' + html], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeFileName(title)}_并行翻译对比.doc`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
