// 导出文档：三种模式
//   target              纯译文
//   bilingual           双语对照（#、原文、译文）
//   bilingual_notes     双语对照 + 备注列
//   review_comparison   审校对照（#、原文、原译、改译、修改理由），横向

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

export function exportBilingualDoc(opts: {
  title: string
  sourceLang: string
  targetLang: string
  segments: Segment[]
  mode?: ExportMode
  translatorTargets?: Record<string, string>
}) {
  const { title, sourceLang, targetLang, segments, translatorTargets = {} } = opts
  const mode: ExportMode = opts.mode ?? 'bilingual'
  const safeTitle = title.replace(/[^\w一-龥]+/g, '_') || 'translation'
  const date = new Date().toLocaleDateString('zh-CN')

  let body = ''
  if (mode === 'target') {
    const paragraphs = segments
      .map(s => (s.target || '').trim())
      .filter(Boolean)
      .map(t => `<p style="margin:0 0 10pt;line-height:1.8;">${escape(t)}</p>`)
      .join('')
    body = `<div>${paragraphs || '<p style="color:#999;">（无译文内容）</p>'}</div>`
  } else if (mode === 'review_comparison') {
    const w = { num: '4%', src: '26%', translator: '25%', reviewer: '25%', note: '20%' }
    const header = `<th style="width:${w.num};text-align:center;">#</th>
      <th style="width:${w.src};">${langNames[sourceLang] || sourceLang}（原文）</th>
      <th style="width:${w.translator};">原译</th>
      <th style="width:${w.reviewer};">改译</th>
      <th style="width:${w.note};">修改理由</th>`
    const rows = segments.map((s, i) => {
      const translatorText = translatorTargets[s.id] ?? s.translator_target ?? s.target ?? ''
      const reviewerText = s.review_target || s.target || ''
      const note = formatNotesForExport(s.notes || '')
      return `<tr>
        <td style="border:1px solid #ccc;padding:8px;width:${w.num};text-align:center;color:#999;">${i + 1}</td>
        <td style="border:1px solid #ccc;padding:8px;width:${w.src};vertical-align:top;">${escape(s.source)}</td>
        <td style="border:1px solid #ccc;padding:8px;width:${w.translator};vertical-align:top;">${escape(translatorText)}</td>
        <td style="border:1px solid #ccc;padding:8px;width:${w.reviewer};vertical-align:top;">${escape(reviewerText)}</td>
        <td style="border:1px solid #ccc;padding:8px;width:${w.note};vertical-align:top;color:#555;font-size:10pt;">${escape(note)}</td>
      </tr>`
    }).join('')
    body = `<table style="border-collapse:collapse;width:100%;table-layout:fixed;">
      <thead><tr>${header}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`
  } else {
    const withNotes = mode === 'bilingual_notes'
    const w = withNotes
      ? { num: '4%', src: '36%', tgt: '36%', note: '24%' }
      : { num: '5%', src: '47.5%', tgt: '47.5%' }

    const header = withNotes
      ? `<th style="width:${w.num};text-align:center;">#</th>
         <th style="width:${w.src};">${langNames[sourceLang] || sourceLang}（原文）</th>
         <th style="width:${w.tgt};">${langNames[targetLang] || targetLang}（译文）</th>
         <th style="width:${w.note};">备注</th>`
      : `<th style="width:${w.num};text-align:center;">#</th>
         <th style="width:${w.src};">${langNames[sourceLang] || sourceLang}（原文）</th>
         <th style="width:${w.tgt};">${langNames[targetLang] || targetLang}（译文）</th>`

    const rows = segments.map((s, i) => withNotes
      ? `<tr>
          <td style="border:1px solid #ccc;padding:10px;width:${w.num};text-align:center;color:#999;">${i + 1}</td>
          <td style="border:1px solid #ccc;padding:10px;width:${w.src};vertical-align:top;">${escape(s.source)}</td>
          <td style="border:1px solid #ccc;padding:10px;width:${w.tgt};vertical-align:top;">${escape(s.target)}</td>
          <td style="border:1px solid #ccc;padding:10px;width:${w.note};vertical-align:top;color:#555;font-size:10pt;">${escape(s.notes || '')}</td>
        </tr>`
      : `<tr>
          <td style="border:1px solid #ccc;padding:10px;width:${w.num};text-align:center;color:#999;">${i + 1}</td>
          <td style="border:1px solid #ccc;padding:10px;width:${w.src};vertical-align:top;">${escape(s.source)}</td>
          <td style="border:1px solid #ccc;padding:10px;width:${w.tgt};vertical-align:top;">${escape(s.target)}</td>
        </tr>`).join('')

    body = `<table style="border-collapse:collapse;width:100%;">
      <thead><tr>${header}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`
  }

  const subtitle = mode === 'target'
    ? `${langNames[targetLang] || targetLang} · 共 ${segments.filter(s => (s.target || '').trim()).length} 段 · 导出于 ${date}`
    : `${langNames[sourceLang] || sourceLang} → ${langNames[targetLang] || targetLang} · 共 ${segments.length} 句 · 导出于 ${date}`
  const landscape = mode === 'review_comparison'

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${escape(title)} · ${modeMeta[mode].label}</title>
<style>
  ${landscape ? '@page Section1 { size: 841.9pt 595.3pt; mso-page-orientation: landscape; margin: 36pt 28pt 36pt 28pt; } div.Section1 { page: Section1; }' : ''}
  body { font-family: 'Segoe UI', SimSun, '宋体', 'Songti SC', serif; font-size: ${landscape ? '10.5pt' : '12pt'}; padding: ${landscape ? '0' : '24pt'}; }
  h1 { font-size: 20pt; margin: 0 0 6pt; }
  .meta { color: #666; font-size: 10pt; margin-bottom: 18pt; }
  th { background: #f5f5f0; border: 1px solid #ccc; padding: ${landscape ? '8px' : '10px'}; text-align: left; font-weight: 600; }
</style>
</head>
<body>
  ${landscape ? '<div class="Section1">' : ''}
  <h1>${escape(title)}</h1>
  <p class="meta">${subtitle}</p>
  ${body}
  <p style="margin-top:24pt;color:#999;font-size:9pt;text-align:center;">由译境 — 技大25级MTIer翻译平台导出</p>
  ${landscape ? '</div>' : ''}
</body>
</html>`

  const blob = new Blob(['﻿' + html], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeTitle}${modeMeta[mode].suffix}.doc`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
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

function escape(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\n/g, '<br/>')
}
