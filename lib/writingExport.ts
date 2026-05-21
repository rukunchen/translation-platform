import {
  AlignmentType,
  Document,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import {
  findTemplate,
  getTemplateName,
  normalizeFormatRules,
  type WritingFormatRules,
  type WritingLanguage,
  type WritingTemplateRecord,
} from './writingTemplates'

type ExportProject = {
  title: string
  language: WritingLanguage
  template_id: string
}

type ExportSection = {
  section_title: string
  content: string
}

const cm = (value: number) => Math.round(value * 567)
const inch = (value: number) => Math.round(value * 1440)
const pt = (value: number) => Math.round(value * 20)

function alignment(value: string) {
  if (value === 'center') return AlignmentType.CENTER
  if (value === 'right') return AlignmentType.RIGHT
  return AlignmentType.LEFT
}

function firstLineIndent(value: string) {
  if (value === '2chars') return 480
  if (value.endsWith('in')) return inch(Number(value.replace('in', '')) || 0.5)
  return 0
}

type DocxChild = Paragraph | Table

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

function textParagraph(text: string, language: WritingLanguage, rules: WritingFormatRules, isReferences: boolean) {
  return new Paragraph({
    spacing: {
      before: pt(rules.body.paragraphSpacingBeforePt),
      after: pt(rules.body.paragraphSpacingAfterPt),
      line: Math.round(240 * rules.body.lineSpacing),
    },
    indent: isReferences && rules.references.hangingIndent
      ? { hanging: 360 }
      : { firstLine: firstLineIndent(rules.body.firstLineIndent) },
    children: [new TextRun({
      text,
      font: language === 'zh' ? rules.body.fontChinese : rules.body.fontEnglish,
      size: rules.body.fontSizePt * 2,
    })],
  })
}

function paragraphsFromPlainContent(content: string, language: WritingLanguage, rules: WritingFormatRules, isReferences: boolean): DocxChild[] {
  const lines = content.split(/\n+/).map(line => line.trim()).filter(Boolean)
  if (lines.length === 0) {
    return [new Paragraph({ text: '' })]
  }
  return lines.map(line => textParagraph(line, language, rules, isReferences))
}

function dataUrlToUint8Array(dataUrl: string) {
  const [, base64 = ''] = dataUrl.split(',')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function imageTypeFromDataUrl(dataUrl: string): 'png' | 'jpg' | 'gif' | 'bmp' {
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'jpg'
  if (dataUrl.startsWith('data:image/gif')) return 'gif'
  if (dataUrl.startsWith('data:image/bmp')) return 'bmp'
  return 'png'
}

async function imageParagraph(src: string): Promise<Paragraph | null> {
  try {
    const data = src.startsWith('data:image/') ? dataUrlToUint8Array(src) : new Uint8Array(await (await fetch(src)).arrayBuffer())
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 160 },
      children: [
        new ImageRun({
          data,
          type: imageTypeFromDataUrl(src),
          transformation: { width: 420, height: 260 },
        }),
      ],
    })
  } catch {
    return null
  }
}

async function childrenFromHtml(content: string, language: WritingLanguage, rules: WritingFormatRules, isReferences: boolean): Promise<DocxChild[]> {
  const doc = new DOMParser().parseFromString(content, 'text/html')
  const children: DocxChild[] = []

  for (const node of Array.from(doc.body.children)) {
    const tag = node.tagName.toLowerCase()
    if (tag === 'figure') {
      const img = node.querySelector('img')
      if (img?.src) {
        const paragraph = await imageParagraph(img.src)
        if (paragraph) children.push(paragraph)
      }
      const caption = node.querySelector('figcaption')?.textContent?.trim()
      if (caption) children.push(textParagraph(caption, language, rules, isReferences))
      continue
    }
    if (tag === 'img') {
      const paragraph = await imageParagraph((node as HTMLImageElement).src)
      if (paragraph) children.push(paragraph)
      continue
    }
    if (tag === 'table') {
      const rows = Array.from(node.querySelectorAll('tr')).map(row => {
        const cells = Array.from(row.querySelectorAll('th,td'))
        return new TableRow({
          children: cells.length > 0 ? cells.map(cell => new TableCell({
            width: { size: Math.floor(100 / Math.max(cells.length, 1)), type: WidthType.PERCENTAGE },
            children: paragraphsFromPlainContent(cell.textContent?.trim() || '', language, rules, false) as Paragraph[],
          })) : [new TableCell({ children: [new Paragraph({ text: '' })] })],
        })
      })
      if (rows.length > 0) {
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows,
        }))
      }
      continue
    }
    const text = node.textContent?.trim()
    if (text) children.push(textParagraph(text, language, rules, isReferences))
  }

  return children.length > 0 ? children : [new Paragraph({ text: '' })]
}

async function childrenFromContent(content: string, language: WritingLanguage, rules: WritingFormatRules, isReferences: boolean): Promise<DocxChild[]> {
  if (looksLikeHtml(content) && typeof DOMParser !== 'undefined') {
    return childrenFromHtml(content, language, rules, isReferences)
  }
  return paragraphsFromPlainContent(content, language, rules, isReferences)
}

export async function exportWritingDocx(project: ExportProject, sections: ExportSection[], templates: WritingTemplateRecord[] = []) {
  const template = findTemplate(project.template_id, templates)
  const rules = normalizeFormatRules(template, project.language)
  const titleRule = rules.headings.h1
  const pageSize = rules.page.size === 'Letter'
    ? { width: 12240, height: 15840 }
    : { width: 11906, height: 16838 }

  const sectionChildren: DocxChild[] = [
    new Paragraph({
      alignment: alignment(titleRule.alignment),
      spacing: { before: pt(titleRule.spacingBeforePt), after: pt(titleRule.spacingAfterPt) },
      children: [new TextRun({
        text: project.title || 'Untitled Paper',
        bold: titleRule.bold,
        font: project.language === 'zh' ? titleRule.fontChinese : titleRule.fontEnglish,
        size: titleRule.fontSizePt * 2,
      })],
    }),
  ]

  for (const section of sections) {
    const isReferences = section.section_title.toLowerCase().includes('references') || section.section_title.includes('参考文献')
    const headingText = isReferences ? rules.references.heading : section.section_title
    sectionChildren.push(new Paragraph({
      alignment: alignment(rules.headings.h1.alignment),
      spacing: { before: pt(rules.headings.h1.spacingBeforePt), after: pt(rules.headings.h1.spacingAfterPt) },
      children: [new TextRun({
        text: headingText,
        bold: rules.headings.h1.bold,
        font: project.language === 'zh' ? rules.headings.h1.fontChinese : rules.headings.h1.fontEnglish,
        size: rules.headings.h1.fontSizePt * 2,
      })],
    }))
    sectionChildren.push(...await childrenFromContent(section.content, project.language, rules, isReferences))
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: project.language === 'zh' ? rules.body.fontChinese : rules.body.fontEnglish,
            size: rules.body.fontSizePt * 2,
          },
          paragraph: {
            spacing: { line: Math.round(240 * rules.body.lineSpacing) },
          },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: {
            orientation: PageOrientation.PORTRAIT,
            width: pageSize.width,
            height: pageSize.height,
          },
          margin: {
            top: cm(rules.page.marginTopCm),
            bottom: cm(rules.page.marginBottomCm),
            left: cm(rules.page.marginLeftCm),
            right: cm(rules.page.marginRightCm),
          },
        },
      },
      children: sectionChildren,
    }],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  const safeTitle = (project.title || '论文').replace(/[\\/:*?"<>|]/g, '_')
  const safeTemplate = getTemplateName(template).replace(/[\\/:*?"<>|]/g, '_')
  a.href = url
  a.download = `${safeTitle}_${safeTemplate}_${stamp}.docx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
