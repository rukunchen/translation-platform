'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import JSZip from 'jszip'
import Sidebar from '@/components/Sidebar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select, Textarea } from '@/components/ui/Input'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { MainContent } from '@/components/ui/MainContent'
import { apiJSON } from '@/lib/apiFetch'
import { supabase } from '@/lib/supabase'
import { cn } from '@/components/ui/cn'
import type { ProviderId } from '@/lib/translateShared'

type Project = {
  id: string
  name: string
  description?: string | null
  type?: string | null
  metadata?: Record<string, unknown> | null
}

type DocumentRow = {
  id: string
  project_id: string
  title: string
  source_language: string
  target_language: string
  document_type?: string | null
  created_at: string
  updated_at?: string | null
}

type ElementType = 'title' | 'subtitle' | 'bullet' | 'body' | 'chart_label' | 'footnote' | 'other'
type SegmentStatus = 'untranslated' | 'draft' | 'reviewed' | 'locked'
type EditorMode = 'translate' | 'review'
type SlideDraft = {
  source: string
  target: string
  translator_target: string
  review_target: string
  notes: string
}

type PptMetadata = {
  slide_number?: number
  element_order?: number
  element_type?: ElementType
  original_slide_index?: number
  original_shape_id?: string
}

type SegmentRow = {
  id: string
  document_id: string
  position: number
  source: string
  target: string
  translator_target?: string | null
  review_target?: string | null
  notes?: string | null
  status: SegmentStatus
  metadata?: PptMetadata | null
}

type PreviewItem = {
  id: string
  selected: boolean
  slide_number: number
  element_order: number
  element_type: ElementType
  source_text: string
}

const ELEMENT_LABEL: Record<ElementType, string> = {
  title: 'Title',
  subtitle: 'Subtitle',
  bullet: 'Bullet',
  body: 'Body',
  chart_label: 'Chart Label',
  footnote: 'Footnote',
  other: 'Other',
}

const LANG_NAMES: Record<string, string> = {
  en: '英语', zh: '中文', ja: '日语', ko: '韩语',
  fr: '法语', de: '德语', es: '西班牙语', ru: '俄语',
}

const REVIEW_ISSUE_TYPES = ['意义问题', '风格问题', '文化问题', '术语问题', '自然度问题', '格式问题', '其他']
const PPT_FALLBACK_PREFIX = '__PPT_SLIDE_TRANSLATION_META__'
const SEGMENT_FALLBACK_PREFIX = '__PPT_SEGMENT_META__'

const PPT_PROMPT = `请将以下 PPT 商务文本翻译为自然、专业、简洁的目标语言。译文应适合商业演示场景，保留品牌传播语气，标题应简洁有力，bullet points 应清晰、自然、适合放入 PPT。不要过度解释，不要把简短标题翻译成长句。请只输出译文。

如果是品牌、营销、市场、商业汇报类文本，请注意：
- 商务简洁度；
- 品牌语气；
- 标题冲击力；
- bullet points 的自然度；
- 图表标签的清晰度；
- 译文不要过长。`

const PPTX_NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}

function fallbackSegmentMetadata(source: string): PptMetadata {
  if (!source.startsWith(SEGMENT_FALLBACK_PREFIX)) return {}
  const firstLine = source.split('\n')[0] || ''
  try {
    return JSON.parse(firstLine.slice(SEGMENT_FALLBACK_PREFIX.length)) as PptMetadata
  } catch {
    return {}
  }
}

function sourceTextOf(seg: SegmentRow): string {
  if (!seg.source.startsWith(SEGMENT_FALLBACK_PREFIX)) return seg.source
  return seg.source.split('\n').slice(1).join('\n')
}

function sourceWithFallbackMeta(text: string, metadata: PptMetadata): string {
  return `${SEGMENT_FALLBACK_PREFIX}${JSON.stringify(metadata)}\n${text}`
}

function metadataOf(seg: SegmentRow): Required<Pick<PptMetadata, 'slide_number' | 'element_order' | 'element_type'>> {
  const fallback = fallbackSegmentMetadata(seg.source)
  return {
    slide_number: Number(seg.metadata?.slide_number || fallback.slide_number || 1),
    element_order: Number(seg.metadata?.element_order || fallback.element_order || seg.position + 1),
    element_type: (seg.metadata?.element_type || fallback.element_type || 'body') as ElementType,
  }
}

function finalTranslation(seg: SegmentRow): string {
  return (seg.review_target || '').trim()
    || (seg.translator_target || '').trim()
    || (seg.target || '').trim()
    || '未翻译'
}

function slideDraftFromRows(rows: SegmentRow[]): SlideDraft {
  const first = rows[0]
  return {
    source: rows.map(sourceTextOf).filter(Boolean).join('\n'),
    target: rows.map(row => row.target || '').filter(Boolean).join('\n'),
    translator_target: rows.map(row => row.translator_target || '').filter(Boolean).join('\n'),
    review_target: rows.map(row => row.review_target || '').filter(Boolean).join('\n'),
    notes: first?.notes || '',
  }
}

function slideStatus(segs: SegmentRow[]): string {
  if (segs.length === 0) return '未开始'
  const translated = segs.filter(s => (s.target || s.translator_target || '').trim()).length
  const reviewed = segs.filter(s => s.status === 'reviewed' || s.status === 'locked').length
  const locked = segs.filter(s => s.status === 'locked').length
  if (locked === segs.length) return '已锁定'
  if (reviewed === segs.length) return '已审校'
  if (reviewed > 0) return '审校中'
  if (translated === segs.length) return '待审校'
  if (translated > 0) return '翻译中'
  return '未开始'
}

function statusLabel(status: SegmentStatus, seg?: SegmentRow): string {
  if (status === 'untranslated') return '未开始'
  if (status === 'draft' && seg && seg.target?.trim() && !seg.translator_target?.trim()) return 'AI 已译'
  if (status === 'draft') return '人工翻译中'
  if (status === 'reviewed') return '已审校'
  return '已锁定'
}

function cleanXmlText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function safeFileName(value: string): string {
  return (value || 'PPT项目').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 80)
}

function fallbackMetadata(description?: string | null): Record<string, unknown> {
  if (!description?.startsWith(PPT_FALLBACK_PREFIX)) return {}
  const firstLine = description.split('\n')[0] || ''
  try {
    return JSON.parse(firstLine.slice(PPT_FALLBACK_PREFIX.length)) as Record<string, unknown>
  } catch {
    return {}
  }
}

function guessElementType(text: string, slideIndex: number, paragraphIndex: number, isBullet: boolean): ElementType {
  if (isBullet) return 'bullet'
  if (paragraphIndex === 0) return 'title'
  if (paragraphIndex === 1 && text.length <= 80) return 'subtitle'
  if (/^\d+(\.\d+)?%?$|^[A-Z]{2,6}$/.test(text.trim())) return 'chart_label'
  if (text.length <= 24 && slideIndex > 0) return 'chart_label'
  if (text.length <= 40 && /备注|注：|source:|来源/i.test(text)) return 'footnote'
  return 'body'
}

async function parsePptx(file: File): Promise<PreviewItem[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml$/)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml$/)?.[1] || 0))
  if (slideFiles.length === 0) throw new Error('没有找到 PPT slide XML')

  const parser = new DOMParser()
  const items: PreviewItem[] = []
  for (const [slideIndex, path] of slideFiles.entries()) {
    const xml = await zip.file(path)?.async('string')
    if (!xml) continue
    const doc = parser.parseFromString(xml, 'application/xml')
    const paragraphs = Array.from(doc.getElementsByTagName('a:p'))
    let order = 1
    paragraphs.forEach((p, paragraphIndex) => {
      const text = cleanXmlText(Array.from(p.getElementsByTagName('a:t')).map(node => node.textContent || '').join(''))
      if (!text) return
      const isBullet = p.getElementsByTagName('a:buChar').length > 0 || p.getElementsByTagName('a:buAutoNum').length > 0
      const elementType = guessElementType(text, slideIndex, paragraphIndex, isBullet)
      items.push({
        id: `${slideIndex + 1}-${order}-${items.length}`,
        selected: true,
        slide_number: slideIndex + 1,
        element_order: order,
        element_type: elementType,
        source_text: text,
      })
      order += 1
    })
  }
  if (items.length === 0) throw new Error('没有提取到可编辑文字。MVP 暂不支持 OCR 图片文字。')
  return items
}

function pptParagraphs(text: string, options: { size: number; color?: string; bold?: boolean }) {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .slice(0, 80)
  const safeLines = lines.length > 0 ? lines : ['']
  return safeLines.map(line => `
        <a:p>
          <a:r>
            <a:rPr lang="zh-CN" sz="${options.size}"${options.bold ? ' b="1"' : ''}>
              <a:solidFill><a:srgbClr val="${options.color || '1F1E1D'}"/></a:solidFill>
            </a:rPr>
            <a:t>${escapeXml(line || ' ')}</a:t>
          </a:r>
          <a:endParaRPr lang="zh-CN" sz="${options.size}"/>
        </a:p>`).join('')
}

function pptTextShape({
  id,
  name,
  x,
  y,
  cx,
  cy,
  text,
  size,
  color = '1F1E1D',
  bold = false,
  fill,
  line = 'E0DDD3',
}: {
  id: number
  name: string
  x: number
  y: number
  cx: number
  cy: number
  text: string
  size: number
  color?: string
  bold?: boolean
  fill?: string
  line?: string
}) {
  return `
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="${id}" name="${escapeXml(name)}"/>
          <p:cNvSpPr txBox="1"/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="${x}" y="${y}"/>
            <a:ext cx="${cx}" cy="${cy}"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          ${fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>'}
          <a:ln w="6350"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>
        </p:spPr>
        <p:txBody>
          <a:bodyPr wrap="square" anchor="t" lIns="91440" tIns="91440" rIns="91440" bIns="91440">
            <a:normAutofit fontScale="76000" lnSpcReduction="18000"/>
          </a:bodyPr>
          <a:lstStyle/>
          ${pptParagraphs(text, { size, color, bold })}
        </p:txBody>
      </p:sp>`
}

function pptColumnText(rows: SegmentRow[], side: 'source' | 'target') {
  return rows.map(row => {
    const meta = metadataOf(row)
    const label = `${meta.element_order}. ${ELEMENT_LABEL[meta.element_type]}`
    const text = side === 'source' ? sourceTextOf(row) : finalTranslation(row)
    return `${label}\n${text.trim() || '未记录'}`
  }).join('\n\n')
}

function bilingualSlideXml(params: {
  slideNumber: number
  rows: SegmentRow[]
  sourceLabel: string
  targetLabel: string
  projectName: string
  documentTitle: string
}) {
  const width = 12192000
  const margin = 457200
  const gap = 228600
  const colWidth = Math.floor((width - margin * 2 - gap) / 2)
  const headerY = 960000
  const headerH = 365760
  const bodyY = headerY + headerH + 91440
  const bodyH = 4922520
  const leftX = margin
  const rightX = margin + colWidth + gap
  const title = `Slide ${params.slideNumber} · ${params.documentTitle}`
  const footer = `${params.projectName} · 由译境导出`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="${PPTX_NS.a}" xmlns:r="${PPTX_NS.r}" xmlns:p="${PPTX_NS.p}">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="FAF9F6"/></a:solidFill></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm>
      </p:grpSpPr>
      ${pptTextShape({ id: 2, name: 'Slide Title', x: margin, y: 274320, cx: width - margin * 2, cy: 457200, text: title, size: 2200, bold: true, line: 'FAF9F6' })}
      ${pptTextShape({ id: 3, name: 'Source Header', x: leftX, y: headerY, cx: colWidth, cy: headerH, text: params.sourceLabel, size: 1300, bold: true, fill: 'F0EEE5' })}
      ${pptTextShape({ id: 4, name: 'Target Header', x: rightX, y: headerY, cx: colWidth, cy: headerH, text: params.targetLabel, size: 1300, bold: true, fill: 'F0EEE5' })}
      ${pptTextShape({ id: 5, name: 'Source Text', x: leftX, y: bodyY, cx: colWidth, cy: bodyH, text: pptColumnText(params.rows, 'source'), size: 1050, fill: 'FFFFFF' })}
      ${pptTextShape({ id: 6, name: 'Target Text', x: rightX, y: bodyY, cx: colWidth, cy: bodyH, text: pptColumnText(params.rows, 'target'), size: 1050, fill: 'FFFFFF' })}
      ${pptTextShape({ id: 7, name: 'Footer', x: margin, y: 6507480, cx: width - margin * 2, cy: 274320, text: footer, size: 900, color: '7A7872', line: 'FAF9F6' })}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`
}

async function buildBilingualPptxBlob(params: {
  grouped: ReadonlyArray<readonly [number, SegmentRow[]]>
  projectName: string
  documentTitle: string
  sourceLang: string
  targetLang: string
}) {
  const zip = new JSZip()
  const slides = params.grouped
    .slice()
    .sort(([a], [b]) => a - b)
    .map(([slideNumber, rows]) => [slideNumber, rows.slice().sort((a, b) => metadataOf(a).element_order - metadataOf(b).element_order)] as const)
  const slideOverrides = slides.map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')
  const slideIds = slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join('')
  const slideRels = slides.map((_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join('')
  const sourceLabel = LANG_NAMES[params.sourceLang] || params.sourceLang || '原文'
  const targetLabel = LANG_NAMES[params.targetLang] || params.targetLang || '译文'

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  ${slideOverrides}
</Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`)
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(params.documentTitle)}</dc:title>
  <dc:creator>译境</dc:creator>
  <cp:lastModifiedBy>译境</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`)
  zip.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>译境</Application>
  <PresentationFormat>On-screen Show (16:9)</PresentationFormat>
  <Slides>${slides.length}</Slides>
</Properties>`)
  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="${PPTX_NS.a}" xmlns:r="${PPTX_NS.r}" xmlns:p="${PPTX_NS.p}">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${slideIds}</p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="wide"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`)
  zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${slideRels}
</Relationships>`)
  zip.file('ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="${PPTX_NS.a}" xmlns:r="${PPTX_NS.r}" xmlns:p="${PPTX_NS.p}">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
  <p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles>
</p:sldMaster>`)
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`)
  zip.file('ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="${PPTX_NS.a}" xmlns:r="${PPTX_NS.r}" xmlns:p="${PPTX_NS.p}" type="blank" preserve="1">
  <p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`)
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`)
  zip.file('ppt/theme/theme1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="${PPTX_NS.a}" name="YiJing">
  <a:themeElements>
    <a:clrScheme name="YiJing"><a:dk1><a:srgbClr val="1F1E1D"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="3D3D3A"/></a:dk2><a:lt2><a:srgbClr val="FAF9F6"/></a:lt2><a:accent1><a:srgbClr val="D97757"/></a:accent1><a:accent2><a:srgbClr val="5470D6"/></a:accent2><a:accent3><a:srgbClr val="91CC75"/></a:accent3><a:accent4><a:srgbClr val="FAC858"/></a:accent4><a:accent5><a:srgbClr val="EE6666"/></a:accent5><a:accent6><a:srgbClr val="73C0DE"/></a:accent6><a:hlink><a:srgbClr val="5470D6"/></a:hlink><a:folHlink><a:srgbClr val="7A7872"/></a:folHlink></a:clrScheme>
    <a:fontScheme name="YiJing"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme>
    <a:fmtScheme name="YiJing"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
  </a:themeElements>
</a:theme>`)

  slides.forEach(([slideNumber, rows], index) => {
    zip.file(`ppt/slides/slide${index + 1}.xml`, bilingualSlideXml({
      slideNumber,
      rows,
      sourceLabel,
      targetLabel,
      projectName: params.projectName,
      documentTitle: params.documentTitle,
    }))
    zip.file(`ppt/slides/_rels/slide${index + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`)
  })

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  })
}

export default function PptProjectPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string
  const fileRef = useRef<HTMLInputElement | null>(null)

  const [userId, setUserId] = useState<string | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [segments, setSegments] = useState<SegmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [preview, setPreview] = useState<PreviewItem[] | null>(null)
  const [previewFileName, setPreviewFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [savingAll, setSavingAll] = useState(false)
  const [expandedSlides, setExpandedSlides] = useState<Set<number>>(new Set())
  const [activeSlide, setActiveSlide] = useState<number | null>(null)
  const [mode, setMode] = useState<EditorMode>('translate')
  const [provider, setProvider] = useState<ProviderId>('deepseek')
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set())
  const [exportingPptx, setExportingPptx] = useState(false)
  const [exportingExcel, setExportingExcel] = useState(false)
  const [slideDrafts, setSlideDrafts] = useState<Record<number, SlideDraft>>({})

  const projectMeta = project?.metadata || fallbackMetadata(project?.description)
  const sourceLang = String(projectMeta.source_language || documents[0]?.source_language || 'en')
  const targetLang = String(projectMeta.target_language || documents[0]?.target_language || 'zh')
  const activeDoc = documents[0] || null

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    setUserId(user.id)
    const member = await supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).maybeSingle()
    if (!member.data) {
      setAccessDenied(true)
      setLoading(false)
      return
    }
    const [projectRes, docsRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).maybeSingle(),
      supabase.from('documents').select('*').eq('project_id', projectId).order('created_at', { ascending: true }),
    ])
    setProject(projectRes.data as Project | null)
    const docs = (docsRes.data || []) as DocumentRow[]
    setDocuments(docs)
    if (docs.length > 0) {
      const segRes = await supabase.from('segments').select('*').in('document_id', docs.map(d => d.id)).order('position', { ascending: true })
      const segs = (segRes.data || []) as SegmentRow[]
      setSegments(segs)
      setExpandedSlides(new Set(Array.from(new Set(segs.map(s => metadataOf(s).slide_number))).slice(0, 3)))
    } else {
      setSegments([])
      setExpandedSlides(new Set())
    }
    setLoading(false)
  }, [projectId, router])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadData])

  const grouped = useMemo(() => {
    const groups = new Map<number, SegmentRow[]>()
    for (const seg of segments) {
      const meta = metadataOf(seg)
      const list = groups.get(meta.slide_number) || []
      list.push(seg)
      groups.set(meta.slide_number, list)
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([slide, rows]) => [slide, rows.sort((a, b) => metadataOf(a).element_order - metadataOf(b).element_order)] as const)
  }, [segments])

  const progress = useMemo(() => {
    const total = segments.length
    const translated = segments.filter(s => (s.target || s.translator_target || '').trim()).length
    const reviewed = segments.filter(s => s.status === 'reviewed' || s.status === 'locked').length
    return {
      total,
      translated,
      reviewed,
      translationPct: total ? Math.round(translated / total * 100) : 0,
      reviewPct: total ? Math.round(reviewed / total * 100) : 0,
    }
  }, [segments])

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.pptx')) {
      alert('请上传 .pptx 文件')
      return
    }
    setParsing(true)
    try {
      const items = await parsePptx(file)
      setPreview(items)
      setPreviewFileName(file.name.replace(/\.pptx$/i, ''))
    } catch (err) {
      alert('解析失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setParsing(false)
    }
  }

  function updatePreview(id: string, patch: Partial<PreviewItem>) {
    setPreview(prev => prev ? prev.map(item => item.id === id ? { ...item, ...patch } : item) : prev)
  }

  async function confirmImport() {
    const rows = (preview || []).filter(item => item.selected && item.source_text.trim())
    if (rows.length === 0) { alert('没有可导入文本'); return }
    setImporting(true)
    const { data: { user } } = await supabase.auth.getUser()
    const rowsBySlide = new Map<number, PreviewItem[]>()
    rows.forEach(row => {
      const list = rowsBySlide.get(row.slide_number) || []
      list.push(row)
      rowsBySlide.set(row.slide_number, list)
    })
    const slideRows = Array.from(rowsBySlide.entries())
      .sort(([a], [b]) => a - b)
      .map(([slideNumber, slideItems]) => ({
        slideNumber,
        source: slideItems
          .sort((a, b) => a.element_order - b.element_order)
          .map(item => item.source_text.trim())
          .filter(Boolean)
          .join('\n'),
      }))
    const sourceText = slideRows.map(row => row.source).join('\n\n')
    const documentPayload = {
      project_id: projectId,
      title: previewFileName || 'PPT 分页翻译文档',
      source_text: sourceText,
      source_language: sourceLang,
      target_language: targetLang,
      created_by: user?.id || userId,
      document_type: 'pptx_slide_translation',
      metadata: { original_file_name: previewFileName ? `${previewFileName}.pptx` : null, import_mode: 'pptx_text_only' },
    }
    let { data: doc, error } = await supabase.from('documents')
      .insert(documentPayload)
      .select('*')
      .single()
    if (error && /document_type|metadata|schema cache|column/i.test(error.message)) {
      const fallback = await supabase.from('documents')
        .insert({
          project_id: documentPayload.project_id,
          title: documentPayload.title,
          source_text: documentPayload.source_text,
          source_language: documentPayload.source_language,
          target_language: documentPayload.target_language,
          created_by: documentPayload.created_by,
        })
        .select('*')
        .single()
      doc = fallback.data
      error = fallback.error
    }
    if (error || !doc) {
      setImporting(false)
      alert('创建 PPT 文档失败：' + (error?.message || '未知错误。请确认已执行 supabase/21_ppt_slide_translation_metadata.sql'))
      return
    }
    const segmentRows = slideRows.map((row, index) => {
      const metadata = {
        slide_number: row.slideNumber,
        element_order: 1,
        element_type: 'body' as ElementType,
        original_slide_index: row.slideNumber - 1,
      }
      return {
        document_id: doc.id,
        position: index,
        source: row.source,
        target: '',
        translator_target: '',
        review_target: '',
        notes: '',
        status: 'untranslated',
        metadata,
      }
    })
    let { error: segError } = await supabase.from('segments').insert(segmentRows)
    if (segError && /metadata|schema cache|column/i.test(segError.message)) {
      const fallbackRows = segmentRows.map(row => ({
        document_id: row.document_id,
        position: row.position,
        source: sourceWithFallbackMeta(row.source, row.metadata),
        target: row.target,
        translator_target: row.translator_target,
        review_target: row.review_target,
        notes: row.notes,
        status: row.status,
      }))
      const fallback = await supabase.from('segments').insert(fallbackRows)
      segError = fallback.error
    }
    setImporting(false)
    if (segError) {
      alert('写入文本条目失败：' + segError.message)
      return
    }
    setPreview(null)
    setPreviewFileName('')
    await loadData()
  }

  async function saveSlide(slide: number) {
    const rows = grouped.find(([n]) => n === slide)?.[1] || []
    const first = rows[0]
    if (!first) return
    const draft = slideDrafts[slide] || slideDraftFromRows(rows)
    setSavingIds(prev => new Set(prev).add(first.id))
    const { data, error } = await apiJSON<{ segment: SegmentRow }>(`/api/segments/${first.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        source: draft.source,
        target: draft.target,
        translator_target: draft.translator_target,
        review_target: draft.review_target,
        notes: draft.notes,
      }),
    })
    if (error) {
      alert('保存失败：' + error)
      setSavingIds(prev => { const next = new Set(prev); next.delete(first.id); return next })
      return
    }
    const extraRows = rows.slice(1)
    for (const row of extraRows) {
      await apiJSON(`/api/segments/${row.id}`, { method: 'DELETE' })
    }
    setSegments(prev => prev
      .filter(seg => !extraRows.some(row => row.id === seg.id))
      .map(seg => seg.id === first.id ? { ...(data?.segment || seg), source: draft.source, target: draft.target, translator_target: draft.translator_target, review_target: draft.review_target, notes: draft.notes } : seg)
    )
    setSlideDrafts(prev => {
      const next = { ...prev }
      delete next[slide]
      return next
    })
    setSavingIds(prev => { const next = new Set(prev); next.delete(first.id); return next })
  }

  async function saveAll() {
    setSavingAll(true)
    for (const [slide] of grouped) await saveSlide(slide)
    setSavingAll(false)
  }

  function updateSlideDraft(slide: number, rows: SegmentRow[], patch: Partial<SlideDraft>) {
    setSlideDrafts(prev => ({
      ...prev,
      [slide]: { ...(prev[slide] || slideDraftFromRows(rows)), ...patch },
    }))
  }

  async function translateSlide(slide: number, rows: SegmentRow[]) {
    if (!activeDoc) return
    const first = rows[0]
    if (!first || first.status === 'locked') return
    const draft = slideDrafts[slide] || slideDraftFromRows(rows)
    setTranslatingIds(prev => new Set(prev).add(first.id))
    try {
      const { data, error } = await apiJSON<{ translation: string }>('/api/translate', {
        method: 'POST',
        body: JSON.stringify({
          text: draft.source,
          sourceLang,
          targetLang,
          provider,
          documentId: activeDoc.id,
          prompt: PPT_PROMPT,
        }),
      })
      if (error) throw new Error(error)
      const translation = data?.translation || ''
      if (translation) updateSlideDraft(slide, rows, { target: translation })
    } catch (err) {
      alert('AI 翻译失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setTranslatingIds(prev => { const next = new Set(prev); next.delete(first.id); return next })
    }
  }

  async function translateAllSlides() {
    for (const [slide, rows] of grouped) {
      const draft = slideDrafts[slide] || slideDraftFromRows(rows)
      if (!draft.target.trim()) await translateSlide(slide, rows)
    }
  }

  async function exportExcel() {
    if (!activeDoc || segments.length === 0) { alert('暂无可导出的 PPT 分页文本'); return }
    setExportingExcel(true)
    try {
      const XLSX = await import('xlsx')
      const rows = segments
        .slice()
        .sort((a, b) => metadataOf(a).slide_number - metadataOf(b).slide_number || metadataOf(a).element_order - metadataOf(b).element_order)
        .map(seg => {
          const meta = metadataOf(seg)
          return {
            页码: meta.slide_number,
            顺序: meta.element_order,
            文本类型: ELEMENT_LABEL[meta.element_type],
            原文: sourceTextOf(seg),
            'AI 译文': seg.target || '',
            人工译文: seg.translator_target || seg.target || '',
            审校译文: seg.review_target || '',
            最终译文: finalTranslation(seg),
            备注: seg.notes || '',
            问题类型: '',
            审校意见: '',
            状态: statusLabel(seg.status, seg),
          }
        })
      const sheet = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, sheet, 'PPT对照表')
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      XLSX.writeFile(wb, `${project?.name || 'PPT项目'}_${activeDoc.title}_PPT中英对照表_${date}.xlsx`)
    } finally {
      setExportingExcel(false)
    }
  }

  async function exportBilingualPptx() {
    if (!activeDoc || grouped.length === 0) { alert('暂无可导出的 PPT 分页文本'); return }
    setExportingPptx(true)
    try {
      const blob = await buildBilingualPptxBlob({
        grouped,
        projectName: project?.name || 'PPT项目',
        documentTitle: activeDoc.title,
        sourceLang,
        targetLang,
      })
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${safeFileName(project?.name || 'PPT项目')}_${safeFileName(activeDoc.title)}_中英对照_${date}.pptx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('导出 PPTX 失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setExportingPptx(false)
    }
  }

  if (loading) {
    return <div className="h-screen flex items-center justify-center bg-canvas text-sm text-ink-600">加载中...</div>
  }

  if (accessDenied) {
    return <div className="h-screen flex items-center justify-center bg-canvas text-sm text-ink-600">你不是该项目成员，无法访问。</div>
  }

  const pillStyle: React.CSSProperties = {
    padding: '7px 13px',
    lineHeight: 1.45,
  }
  const modeButtonStyle: React.CSSProperties = {
    padding: '9px 18px',
    lineHeight: 1.45,
  }

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-5">
        <div className="bg-white rounded-2xl border border-line min-h-[calc(100vh-40px)]">
          <MainContent size="full" className="!py-10 !px-6 sm:!px-8 lg:!px-12">
            <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6 border-b border-line pb-7 mb-8">
              <div className="min-w-0 max-w-5xl">
                <button type="button" className="text-sm text-ink-500 hover:text-ink-900 mb-4" onClick={() => router.push('/dashboard')}>
                  ← 返回 Dashboard
                </button>
                <Eyebrow tone="muted" className="mb-2">PPT slide translation</Eyebrow>
                <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 tracking-tight leading-tight break-words">
                  {project?.name || 'PPT 分页翻译项目'}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-2.5 text-xs text-ink-600">
                  <span className="rounded-lg border border-brand-200 bg-brand-50 text-brand" style={pillStyle}>项目类型：PPT 分页翻译</span>
                  <span className="rounded-lg border border-line bg-canvas" style={pillStyle}>{LANG_NAMES[sourceLang] || sourceLang} → {LANG_NAMES[targetLang] || targetLang}</span>
                  <span className="rounded-lg border border-line bg-canvas" style={pillStyle}>翻译进度 {progress.translationPct}%</span>
                  <span className="rounded-lg border border-line bg-canvas" style={pillStyle}>审校进度 {progress.reviewPct}%</span>
                </div>
                {!project?.metadata && project?.description?.startsWith(PPT_FALLBACK_PREFIX) && (
                  <p className="mt-3 max-w-4xl text-xs leading-relaxed text-brand">
                    当前项目使用兼容模式创建。上传 PPT 前请执行 supabase/21_ppt_slide_translation_metadata.sql，以启用 Slide 元数据保存。
                  </p>
                )}
              </div>
              <div className="flex flex-wrap xl:justify-end gap-3">
                <input ref={fileRef} type="file" accept=".pptx" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) void handleFile(file); e.currentTarget.value = '' }} />
                <Button size="sm" variant="brand" loading={parsing} onClick={() => fileRef.current?.click()}>一键导入 PPT 文档</Button>
                <Button size="sm" variant="secondary" loading={exportingPptx} onClick={exportBilingualPptx}>导出中英对照 PPT</Button>
                <Button size="sm" variant="secondary" loading={exportingExcel} onClick={exportExcel}>导出 Excel 对照表</Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <Metric label="Slide 数" value={grouped.length} />
              <Metric label="条目数" value={progress.total} />
              <Metric label="已翻译 / 已审校" value={`${progress.translated} / ${progress.reviewed}`} />
            </div>

            {preview && (
              <ImportPreview
                items={preview}
                fileName={previewFileName}
                importing={importing}
                onUpdate={updatePreview}
                onConfirm={confirmImport}
                onCancel={() => setPreview(null)}
              />
            )}

            {!preview && segments.length === 0 && (
              <Card padding="lg" className="text-center py-20">
                <h2 className="font-serif text-xl text-ink-900 mb-3">还没有导入 PPT 文档</h2>
                <p className="text-sm text-ink-600 mb-7">上传 .pptx 后，系统会按 Slide 提取真实可编辑文字，并先进入导入预览。</p>
                <Button variant="brand" onClick={() => fileRef.current?.click()}>一键导入 PPT 文档</Button>
              </Card>
            )}

            {!preview && segments.length > 0 && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-1.5 rounded-xl border border-line bg-surface" style={{ padding: 6 }}>
                    <button type="button" onClick={() => setMode('translate')} style={modeButtonStyle} className={cn('rounded-lg text-sm transition-colors', mode === 'translate' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900')}>
                      翻译模式
                    </button>
                    <button type="button" onClick={() => setMode('review')} style={modeButtonStyle} className={cn('rounded-lg text-sm transition-colors', mode === 'review' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900')}>
                      审校模式
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="w-[150px]">
                      <Select value={provider} onChange={e => setProvider(e.target.value as ProviderId)} inputClassName="text-sm" style={{ paddingTop: 11, paddingBottom: 11, lineHeight: 1.45 }}>
                        <option value="deepseek">DeepSeek</option>
                        <option value="claude">Claude</option>
                        <option value="openai">OpenAI</option>
                        <option value="doubao">Doubao</option>
                      </Select>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setExpandedSlides(new Set(grouped.map(([slide]) => slide)))}>全部展开</Button>
                    <Button size="sm" variant="ghost" onClick={() => setExpandedSlides(new Set())}>全部折叠</Button>
                    <Button size="sm" variant="secondary" loading={savingAll} onClick={saveAll}>保存全部</Button>
                    <Button size="sm" variant="brand" onClick={translateAllSlides}>AI 翻译全部未翻译 Slide</Button>
                  </div>
                </div>

                <div className="space-y-5">
                  {grouped.map(([slide, rows]) => (
                    <SlideGroup
                      key={slide}
                      slide={slide}
                      rows={rows}
                      mode={mode}
                      expanded={expandedSlides.has(slide)}
                      active={activeSlide === slide}
                      savingIds={savingIds}
                      translatingIds={translatingIds}
                      draft={slideDrafts[slide]}
                      onToggle={() => setExpandedSlides(prev => {
                        const next = new Set(prev)
                        if (next.has(slide)) next.delete(slide)
                        else next.add(slide)
                        return next
                      })}
                      onActivate={() => setActiveSlide(slide)}
                      onPatch={patch => updateSlideDraft(slide, rows, patch)}
                      onSaveSlide={() => saveSlide(slide)}
                      onTranslateSlide={() => translateSlide(slide, rows)}
                    />
                  ))}
                </div>
              </>
            )}
          </MainContent>
        </div>
      </main>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card padding="sm" variant="surface">
      <p className="text-[11px] uppercase tracking-[0.14em] text-ink-500 mb-2">{label}</p>
      <p className="font-serif text-2xl text-ink-900">{value}</p>
    </Card>
  )
}

function ImportPreview({
  items, fileName, importing, onUpdate, onConfirm, onCancel,
}: {
  items: PreviewItem[]
  fileName: string
  importing: boolean
  onUpdate: (id: string, patch: Partial<PreviewItem>) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const grouped = Array.from(items.reduce((map, item) => {
    const list = map.get(item.slide_number) || []
    list.push(item)
    map.set(item.slide_number, list)
    return map
  }, new Map<number, PreviewItem[]>()).entries()).sort(([a], [b]) => a - b)
  const selectedCount = items.filter(item => item.selected && item.source_text.trim()).length
  return (
    <Card padding="none" className="overflow-hidden mb-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-line bg-brand-50 px-6 py-5">
        <div>
          <h2 className="font-serif text-xl text-ink-900">PPT 导入预览</h2>
          <p className="text-sm text-ink-600 mt-1 break-words">{fileName}.pptx · {items.length} 条文本 · 将导入 {selectedCount} 条</p>
        </div>
        <div className="flex gap-3">
          <Button size="sm" variant="secondary" onClick={onCancel}>取消</Button>
          <Button size="sm" variant="brand" loading={importing} onClick={onConfirm}>确认导入</Button>
        </div>
      </div>
      <div className="divide-y divide-line">
        {grouped.map(([slide, rows]) => (
          <div key={slide} className="p-5 sm:p-6">
            <h3 className="font-serif text-lg text-ink-900 mb-4">Slide {slide}</h3>
            <div className="space-y-4">
              {rows.map(item => (
                <div key={item.id} className="grid grid-cols-1 lg:grid-cols-[32px_56px_180px_minmax(360px,1fr)_80px] gap-4 items-start rounded-xl border border-line bg-white p-4">
                  <input type="checkbox" checked={item.selected} onChange={e => onUpdate(item.id, { selected: e.target.checked })} className="mt-3 accent-brand" />
                  <div className="text-xs text-ink-500 lg:pt-3">#{item.element_order}</div>
                  <select value={item.element_type} onChange={e => onUpdate(item.id, { element_type: e.target.value as ElementType })} className="w-full rounded-lg border border-line bg-surface text-sm text-ink-700" style={{ padding: '10px 14px', lineHeight: 1.45 }}>
                    {(Object.keys(ELEMENT_LABEL) as ElementType[]).map(type => <option key={type} value={type}>{ELEMENT_LABEL[type]}</option>)}
                  </select>
                  <Textarea value={item.source_text} onChange={e => onUpdate(item.id, { source_text: e.target.value })} rows={3} inputClassName="text-sm min-h-[112px]" />
                  <Button size="sm" variant="ghost" onClick={() => onUpdate(item.id, { selected: false, source_text: '' })}>删除</Button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function SlideGroup({
  slide, rows, mode, expanded, active, savingIds, translatingIds, draft,
  onToggle, onActivate, onPatch, onSaveSlide, onTranslateSlide,
}: {
  slide: number
  rows: SegmentRow[]
  mode: EditorMode
  expanded: boolean
  active: boolean
  savingIds: Set<string>
  translatingIds: Set<string>
  draft?: SlideDraft
  onToggle: () => void
  onActivate: () => void
  onPatch: (patch: Partial<SlideDraft>) => void
  onSaveSlide: () => void
  onTranslateSlide: () => void
}) {
  const first = rows[0]
  const values = draft || slideDraftFromRows(rows)
  return (
    <Card padding="none" className={cn('overflow-hidden', active && 'border-brand shadow-[var(--shadow-card)]')}>
      <button type="button" className="w-full flex flex-wrap items-center justify-between gap-4 bg-surface text-left" style={{ padding: '22px 32px' }} onClick={() => { onActivate(); onToggle() }}>
        <div>
          <h2 className="font-serif text-xl text-ink-900">Slide {slide}</h2>
          <p className="text-xs text-ink-500 mt-1">{rows.length} 条文本 · {slideStatus(rows)}</p>
        </div>
        <span className="text-sm text-ink-500">{expanded ? '收起' : '展开'}</span>
      </button>
      {expanded && (
        <div>
          <div className="flex flex-wrap justify-end gap-3 border-y border-line bg-white" style={{ padding: '14px 32px' }}>
            <Button size="sm" variant="ghost" onClick={onTranslateSlide}>AI 翻译当前 Slide</Button>
            <Button size="sm" variant="secondary" onClick={onSaveSlide}>保存当前 Slide</Button>
          </div>
          <div className="bg-canvas/30" style={{ padding: 24 }}>
            <SlideEditor
              mode={mode}
              values={values}
              status={first ? statusLabel(first.status, first) : '未开始'}
              saving={Boolean(first && savingIds.has(first.id))}
              translating={Boolean(first && translatingIds.has(first.id))}
              onPatch={onPatch}
              onSave={onSaveSlide}
              onTranslate={onTranslateSlide}
            />
          </div>
        </div>
      )}
    </Card>
  )
}

function SlideEditor({
  mode, values, status, saving, translating, onPatch, onSave, onTranslate,
}: {
  mode: EditorMode
  values: SlideDraft
  status: string
  saving: boolean
  translating: boolean
  onPatch: (patch: Partial<SlideDraft>) => void
  onSave: () => void
  onTranslate: () => void
}) {
  const boxClass = 'rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(31,30,29,0.03)]'
  const labelClass = 'block text-[11px] uppercase tracking-[0.14em] text-ink-500 mb-3'
  const boxStyle: React.CSSProperties = { padding: '22px 24px' }
  const textAreaClass = 'text-sm min-h-[300px]'
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto pb-2">
        <div className={cn(
          'grid gap-4',
          mode === 'translate'
            ? 'min-w-[1320px] grid-cols-[1.15fr_1fr_1fr_0.9fr]'
            : 'min-w-[1680px] grid-cols-[1.05fr_0.9fr_0.9fr_0.9fr_0.85fr_220px]'
        )}>
          <div className={boxClass} style={boxStyle}>
            <span className={labelClass}>原文</span>
            <Textarea
              value={values.source}
              onChange={e => onPatch({ source: e.target.value })}
              rows={10}
              inputClassName={textAreaClass}
            />
          </div>
          <div className={boxClass} style={boxStyle}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <span className="text-[11px] uppercase tracking-[0.14em] text-ink-500">AI 译文</span>
              {mode === 'translate' && <Button size="sm" variant="ghost" loading={translating} onClick={onTranslate}>重新生成</Button>}
            </div>
            <Textarea
              value={values.target}
              onChange={e => onPatch({ target: e.target.value })}
              rows={10}
              inputClassName={textAreaClass}
            />
          </div>
          <div className={boxClass} style={boxStyle}>
            <span className={labelClass}>人工译文</span>
            <Textarea
              value={values.translator_target}
              onChange={e => onPatch({ translator_target: e.target.value })}
              rows={10}
              inputClassName={textAreaClass}
            />
          </div>
          {mode === 'review' && (
            <div className={boxClass} style={boxStyle}>
              <span className={labelClass}>审校译文</span>
              <Textarea
                value={values.review_target}
                onChange={e => onPatch({ review_target: e.target.value })}
                rows={10}
                inputClassName={textAreaClass}
              />
            </div>
          )}
          <div className={boxClass} style={boxStyle}>
            <span className={labelClass}>{mode === 'review' ? '审校意见 / 备注' : '备注'}</span>
            <Textarea
              value={values.notes}
              onChange={e => onPatch({ notes: e.target.value })}
              rows={10}
              inputClassName={textAreaClass}
            />
          </div>
          {mode === 'review' && (
            <div className={boxClass} style={boxStyle}>
              <span className={labelClass}>问题类型 / 状态</span>
              <select className="w-full rounded-lg border border-line bg-surface text-sm text-ink-700 mb-3" style={{ padding: '10px 14px', lineHeight: 1.45 }}>
                <option value="">问题类型</option>
                {REVIEW_ISSUE_TYPES.map(type => <option key={type}>{type}</option>)}
              </select>
              <span className="text-xs text-ink-500">{status}</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" loading={saving} onClick={onSave}>保存当前 Slide</Button>
      </div>
    </div>
  )
}
