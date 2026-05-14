// 一键导出双语对照：生成 .doc 文件（Word 可直接打开）
// 浏览器端纯前端实现，无需后端

import type { Segment } from './sentenceSplit'

const langNames: Record<string, string> = {
  en: 'English', zh: '中文', ja: '日本語', ko: '한국어',
  fr: 'Français', de: 'Deutsch', es: 'Español', ru: 'Русский'
}

export function exportBilingualDoc(opts: {
  title: string
  sourceLang: string
  targetLang: string
  segments: Segment[]
}) {
  const { title, sourceLang, targetLang, segments } = opts
  const safeTitle = title.replace(/[^\w一-龥]+/g, '_') || 'translation'
  const date = new Date().toLocaleDateString('zh-CN')

  const rows = segments.map((s, i) => `
    <tr>
      <td style="border:1px solid #ccc;padding:10px;width:5%;text-align:center;color:#999;">${i + 1}</td>
      <td style="border:1px solid #ccc;padding:10px;width:47.5%;vertical-align:top;">${escape(s.source)}</td>
      <td style="border:1px solid #ccc;padding:10px;width:47.5%;vertical-align:top;">${escape(s.target)}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${escape(title)}</title>
<style>
  body { font-family: 'Times New Roman', '宋体', SimSun, serif; font-size: 12pt; padding: 24pt; }
  h1 { font-size: 20pt; margin: 0 0 6pt; }
  .meta { color: #666; font-size: 10pt; margin-bottom: 18pt; }
  table { border-collapse: collapse; width: 100%; }
  th { background: #f5f5f0; border: 1px solid #ccc; padding: 10px; text-align: left; font-weight: 600; }
</style>
</head>
<body>
  <h1>${escape(title)}</h1>
  <p class="meta">${langNames[sourceLang] || sourceLang} → ${langNames[targetLang] || targetLang} · 共 ${segments.length} 句 · 导出于 ${date}</p>
  <table>
    <thead>
      <tr>
        <th style="width:5%;text-align:center;">#</th>
        <th style="width:47.5%;">${langNames[sourceLang] || sourceLang}（原文）</th>
        <th style="width:47.5%;">${langNames[targetLang] || targetLang}（译文）</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin-top:24pt;color:#999;font-size:9pt;text-align:center;">由译境 — 技大25级MTIer翻译平台导出</p>
</body>
</html>`

  const blob = new Blob(['﻿' + html], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeTitle}_双语对照.doc`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function escape(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\n/g, '<br/>')
}
