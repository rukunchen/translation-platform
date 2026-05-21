export type WritingLanguage = 'zh' | 'en'

export type WritingSectionDefinition = {
  key: string
  title: string
  order: number
  required: boolean
  description: string
}

export type WritingFormatRules = {
  page: {
    size: 'A4' | 'Letter'
    marginTopCm: number
    marginBottomCm: number
    marginLeftCm: number
    marginRightCm: number
  }
  body: {
    fontChinese: string
    fontEnglish: string
    fontSizePt: number
    lineSpacing: number
    paragraphSpacingBeforePt: number
    paragraphSpacingAfterPt: number
    firstLineIndent: string
  }
  headings: {
    h1: HeadingRule
    h2: HeadingRule
    h3: HeadingRule
  }
  abstract: {
    requireChineseAbstract: boolean
    requireEnglishAbstract: boolean
    maxChineseAbstractChars: number
    maxEnglishAbstractWords: number
    keywordCountMin: number
    keywordCountMax: number
    keywordSeparator: string
  }
  references: {
    style: 'GB/T 7714' | 'APA' | 'MLA' | 'Chicago' | 'Custom'
    heading: string
    hangingIndent: boolean
    sortByAuthor: boolean
    requireDoi?: boolean
    requireAccessDate?: boolean
  }
}

type HeadingRule = {
  fontChinese: string
  fontEnglish: string
  fontSizePt: number
  bold: boolean
  alignment: 'left' | 'center' | 'right'
  spacingBeforePt: number
  spacingAfterPt: number
}

export type WritingTemplate = {
  id: string
  name: string
  language: WritingLanguage
  paperType: string
  templateType: string
  description: string
  sections: string[]
  formatRules: LegacyFormatRules | WritingFormatRules
  sectionStructure?: WritingSectionDefinition[]
  isSystemTemplate?: boolean
  createdBy?: string | null
}

type LegacyFormatRules = {
  pageSize: string
  margins: string
  bodyFont: string
  latinFont: string
  fontSize: string
  lineSpacing: string
  paragraphIndent: string
  heading: string
  references: string
}

export type WritingTemplateRecord = {
  id: string
  name: string
  language: WritingLanguage
  paper_type: string
  template_type: string
  description: string
  format_rules: WritingFormatRules | Record<string, unknown>
  section_structure: WritingSectionDefinition[] | Array<Record<string, unknown>>
  is_system_template: boolean
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export const CHINESE_PAPER_TYPES = [
  '课程论文',
  '本科毕业论文',
  '硕士论文',
  '开题报告',
  '文献综述',
  '翻译实践报告',
  '期刊论文',
]

export const ENGLISH_PAPER_TYPES = [
  'Course Paper',
  'Research Article',
  'Literature Review',
  'Research Proposal',
  'Thesis',
  'Translation Practice Report',
  'APA Paper',
  'MLA Paper',
  'Chicago Paper',
]

const zhCommonRules = {
  pageSize: 'A4',
  margins: '上 2.5cm，下 2.5cm，左 3cm，右 2.5cm',
  bodyFont: '宋体',
  latinFont: 'Times New Roman',
  fontSize: '12pt',
  lineSpacing: '1.5 倍',
  paragraphIndent: '2 字符',
  heading: '一级标题：黑体，四号，加粗；二级标题：黑体，小四，加粗',
  references: 'GB/T 7714',
}

const enApaRules = {
  pageSize: 'A4',
  margins: '1 inch',
  bodyFont: 'Times New Roman',
  latinFont: 'Times New Roman',
  fontSize: '12 pt',
  lineSpacing: 'double',
  paragraphIndent: '0.5 inch',
  heading: 'Headings bold',
  references: 'APA 7 style placeholder',
}

export const DEFAULT_ZH_FORMAT_RULES: WritingFormatRules = {
  page: { size: 'A4', marginTopCm: 2.5, marginBottomCm: 2.5, marginLeftCm: 3, marginRightCm: 2.5 },
  body: {
    fontChinese: 'SimSun',
    fontEnglish: 'Times New Roman',
    fontSizePt: 12,
    lineSpacing: 1.5,
    paragraphSpacingBeforePt: 0,
    paragraphSpacingAfterPt: 0,
    firstLineIndent: '2chars',
  },
  headings: {
    h1: { fontChinese: 'SimHei', fontEnglish: 'Times New Roman', fontSizePt: 14, bold: true, alignment: 'center', spacingBeforePt: 12, spacingAfterPt: 6 },
    h2: { fontChinese: 'SimHei', fontEnglish: 'Times New Roman', fontSizePt: 12, bold: true, alignment: 'left', spacingBeforePt: 10, spacingAfterPt: 6 },
    h3: { fontChinese: 'SimSun', fontEnglish: 'Times New Roman', fontSizePt: 12, bold: true, alignment: 'left', spacingBeforePt: 8, spacingAfterPt: 4 },
  },
  abstract: {
    requireChineseAbstract: true,
    requireEnglishAbstract: false,
    maxChineseAbstractChars: 500,
    maxEnglishAbstractWords: 250,
    keywordCountMin: 3,
    keywordCountMax: 5,
    keywordSeparator: '；',
  },
  references: { style: 'GB/T 7714', heading: '参考文献', hangingIndent: true, sortByAuthor: false },
}

export const DEFAULT_EN_FORMAT_RULES: WritingFormatRules = {
  page: { size: 'A4', marginTopCm: 2.54, marginBottomCm: 2.54, marginLeftCm: 2.54, marginRightCm: 2.54 },
  body: {
    fontChinese: 'SimSun',
    fontEnglish: 'Times New Roman',
    fontSizePt: 12,
    lineSpacing: 2,
    paragraphSpacingBeforePt: 0,
    paragraphSpacingAfterPt: 0,
    firstLineIndent: '0.5in',
  },
  headings: {
    h1: { fontChinese: 'SimHei', fontEnglish: 'Times New Roman', fontSizePt: 12, bold: true, alignment: 'center', spacingBeforePt: 12, spacingAfterPt: 6 },
    h2: { fontChinese: 'SimHei', fontEnglish: 'Times New Roman', fontSizePt: 12, bold: true, alignment: 'left', spacingBeforePt: 10, spacingAfterPt: 6 },
    h3: { fontChinese: 'SimSun', fontEnglish: 'Times New Roman', fontSizePt: 12, bold: true, alignment: 'left', spacingBeforePt: 8, spacingAfterPt: 4 },
  },
  abstract: {
    requireChineseAbstract: false,
    requireEnglishAbstract: true,
    maxChineseAbstractChars: 500,
    maxEnglishAbstractWords: 250,
    keywordCountMin: 3,
    keywordCountMax: 5,
    keywordSeparator: ';',
  },
  references: { style: 'APA', heading: 'References', hangingIndent: true, sortByAuthor: true },
}

export const WRITING_TEMPLATES: WritingTemplate[] = [
  {
    id: 'zh-course-paper',
    name: '通用中文课程论文模板',
    language: 'zh',
    paperType: '课程论文',
    templateType: 'course_paper',
    description: '适合课程论文、课堂研究报告和一般中文学术短论文。',
    sections: ['题目', '摘要', '关键词', '引言', '正文', '结论', '参考文献'],
    formatRules: zhCommonRules,
  },
  {
    id: 'zh-undergraduate-thesis',
    name: '中文本科毕业论文模板',
    language: 'zh',
    paperType: '本科毕业论文',
    templateType: 'thesis',
    description: '适合中文本科毕业论文初稿写作。',
    sections: ['题目', '摘要', '关键词', 'Abstract', 'Keywords', '引言', '文献综述', '研究方法', '分析与讨论', '结论', '参考文献', '致谢'],
    formatRules: zhCommonRules,
  },
  {
    id: 'zh-master-thesis',
    name: '中文硕士论文模板',
    language: 'zh',
    paperType: '硕士论文',
    templateType: 'thesis',
    description: '适合中文硕士论文结构化写作。',
    sections: ['题目', '中文摘要', '关键词', 'English Abstract', 'Keywords', '第一章 绪论', '第二章 文献综述', '第三章 研究设计', '第四章 分析与讨论', '第五章 结论', '参考文献', '附录'],
    formatRules: zhCommonRules,
  },
  {
    id: 'zh-proposal',
    name: '中文开题报告模板',
    language: 'zh',
    paperType: '开题报告',
    templateType: 'proposal',
    description: '覆盖研究背景、意义、现状、方法和计划。',
    sections: ['题目', '研究背景', '研究目的与意义', '国内外研究现状', '研究内容', '研究方法', '创新点', '研究计划', '参考文献'],
    formatRules: zhCommonRules,
  },
  {
    id: 'zh-translation-practice',
    name: '中文翻译实践报告模板',
    language: 'zh',
    paperType: '翻译实践报告',
    templateType: 'translation_practice',
    description: '适合翻译实践报告和 MTI 课程论文。',
    sections: ['题目', '中文摘要', '关键词', 'English Abstract', 'Keywords', '第一章 任务描述', '第二章 过程描述', '第三章 案例分析', '第四章 实践总结', '参考文献', '附录'],
    formatRules: zhCommonRules,
  },
  {
    id: 'zh-journal-article',
    name: '中文期刊论文模板',
    language: 'zh',
    paperType: '期刊论文',
    templateType: 'journal_article',
    description: '适合中文期刊论文结构初稿。',
    sections: ['题目', '摘要', '关键词', '引言', '文献综述', '研究设计', '分析与讨论', '结论', '参考文献'],
    formatRules: zhCommonRules,
  },
  {
    id: 'apa-7-paper',
    name: 'APA 7th Paper',
    language: 'en',
    paperType: 'APA Paper',
    templateType: 'apa',
    description: 'Basic APA 7th paper structure for English academic writing.',
    sections: ['Title Page', 'Abstract', 'Keywords', 'Introduction', 'Literature Review', 'Methodology', 'Results', 'Discussion', 'Conclusion', 'References', 'Appendix'],
    formatRules: enApaRules,
  },
  {
    id: 'mla-9-paper',
    name: 'MLA 9th Paper',
    language: 'en',
    paperType: 'MLA Paper',
    templateType: 'mla',
    description: 'Basic MLA paper structure for literature and humanities writing.',
    sections: ['Title', 'Introduction', 'Body', 'Conclusion', 'Works Cited'],
    formatRules: { ...enApaRules, references: 'MLA 9 Works Cited placeholder' },
  },
  {
    id: 'chicago-author-date',
    name: 'Chicago Author-Date Paper',
    language: 'en',
    paperType: 'Chicago Paper',
    templateType: 'chicago',
    description: 'Basic Chicago author-date structure.',
    sections: ['Title', 'Abstract', 'Introduction', 'Literature Review', 'Analysis', 'Conclusion', 'References'],
    formatRules: { ...enApaRules, references: 'Chicago author-date references placeholder' },
  },
  {
    id: 'en-research-article',
    name: 'English Research Article',
    language: 'en',
    paperType: 'Research Article',
    templateType: 'research_article',
    description: 'Standard English research article structure.',
    sections: ['Title', 'Abstract', 'Keywords', 'Introduction', 'Literature Review', 'Methodology', 'Results', 'Discussion', 'Conclusion', 'References'],
    formatRules: enApaRules,
  },
  {
    id: 'en-literature-review',
    name: 'English Literature Review',
    language: 'en',
    paperType: 'Literature Review',
    templateType: 'literature_review',
    description: 'Template for English literature review papers.',
    sections: ['Title', 'Abstract', 'Keywords', 'Introduction', 'Review Framework', 'Major Themes', 'Research Gaps', 'Conclusion', 'References'],
    formatRules: enApaRules,
  },
  {
    id: 'en-research-proposal',
    name: 'English Research Proposal',
    language: 'en',
    paperType: 'Research Proposal',
    templateType: 'proposal',
    description: 'Template for English research proposals.',
    sections: ['Title', 'Background', 'Research Questions', 'Significance', 'Literature Review', 'Methodology', 'Timeline', 'Expected Contributions', 'References'],
    formatRules: enApaRules,
  },
  {
    id: 'translation-studies-article',
    name: 'Translation Studies Article',
    language: 'en',
    paperType: 'Translation Practice Report',
    templateType: 'translation_studies',
    description: 'English article template for translation studies and practice analysis.',
    sections: ['Title', 'Abstract', 'Keywords', 'Introduction', 'Theoretical Framework', 'Case Analysis', 'Discussion', 'Conclusion', 'References'],
    formatRules: enApaRules,
  },
]

export function templatesForLanguage(language: WritingLanguage) {
  return WRITING_TEMPLATES.filter(t => t.language === language)
}

export function getWritingTemplate(id: string) {
  return WRITING_TEMPLATES.find(t => t.id === id) ?? WRITING_TEMPLATES[0]
}

export function getTemplateId(template: WritingTemplate | WritingTemplateRecord) {
  return template.id
}

export function getTemplateName(template: WritingTemplate | WritingTemplateRecord) {
  return template.name
}

export function getTemplateLanguage(template: WritingTemplate | WritingTemplateRecord): WritingLanguage {
  return template.language
}

export function getTemplatePaperType(template: WritingTemplate | WritingTemplateRecord) {
  return 'paperType' in template ? template.paperType : template.paper_type
}

export function getTemplateDescription(template: WritingTemplate | WritingTemplateRecord) {
  return template.description || ''
}

export function isSystemTemplate(template: WritingTemplate | WritingTemplateRecord) {
  return 'is_system_template' in template ? template.is_system_template : template.isSystemTemplate ?? true
}

export function makeSectionKey(title: string, index = 0) {
  const base = title.trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return base || `section-${index + 1}`
}

export function makeSectionDefinitions(sections: string[]): WritingSectionDefinition[] {
  return sections.map((title, index) => ({
    key: makeSectionKey(title, index),
    title,
    order: index + 1,
    required: true,
    description: title,
  }))
}

function isStructuredRules(value: unknown): value is WritingFormatRules {
  const v = value as Partial<WritingFormatRules> | null
  return Boolean(v?.page && v?.body && v?.headings && v?.abstract && v?.references)
}

export function normalizeFormatRules(templateOrRules: WritingTemplate | WritingTemplateRecord | unknown, language?: WritingLanguage): WritingFormatRules {
  const raw = templateOrRules && typeof templateOrRules === 'object' && 'formatRules' in templateOrRules
    ? (templateOrRules as WritingTemplate).formatRules
    : templateOrRules && typeof templateOrRules === 'object' && 'format_rules' in templateOrRules
      ? (templateOrRules as WritingTemplateRecord).format_rules
      : templateOrRules
  if (isStructuredRules(raw)) {
    const base = (language ?? (raw.references.heading === '参考文献' ? 'zh' : 'en')) === 'zh'
      ? DEFAULT_ZH_FORMAT_RULES
      : DEFAULT_EN_FORMAT_RULES
    return {
      ...base,
      ...raw,
      page: { ...base.page, ...raw.page },
      body: { ...base.body, ...raw.body },
      headings: {
        h1: { ...base.headings.h1, ...raw.headings.h1 },
        h2: { ...base.headings.h2, ...raw.headings.h2 },
        h3: { ...base.headings.h3, ...raw.headings.h3 },
      },
      abstract: { ...base.abstract, ...raw.abstract },
      references: { ...base.references, ...raw.references },
    }
  }
  const inferredLanguage = language ?? (
    templateOrRules && typeof templateOrRules === 'object' && 'language' in templateOrRules
      ? (templateOrRules as { language: WritingLanguage }).language
      : 'zh'
  )
  return inferredLanguage === 'zh' ? DEFAULT_ZH_FORMAT_RULES : DEFAULT_EN_FORMAT_RULES
}

export function getTemplateSections(template: WritingTemplate | WritingTemplateRecord): WritingSectionDefinition[] {
  if ('section_structure' in template && Array.isArray(template.section_structure) && template.section_structure.length > 0) {
    return template.section_structure.map((item, index) => ({
      key: String(item.key ?? makeSectionKey(String(item.title ?? `section-${index + 1}`), index)),
      title: String(item.title ?? `章节 ${index + 1}`),
      order: Number(item.order ?? index + 1),
      required: Boolean(item.required ?? true),
      description: String(item.description ?? ''),
    })).sort((a, b) => a.order - b.order)
  }
  if ('sectionStructure' in template && Array.isArray(template.sectionStructure) && template.sectionStructure.length > 0) {
    return template.sectionStructure
  }
  return makeSectionDefinitions('sections' in template ? template.sections : [])
}

export function systemTemplateToRecord(template: WritingTemplate): WritingTemplateRecord {
  return {
    id: template.id,
    name: template.name,
    language: template.language,
    paper_type: template.paperType,
    template_type: template.templateType,
    description: template.description,
    format_rules: normalizeFormatRules(template, template.language),
    section_structure: getTemplateSections(template),
    is_system_template: true,
    created_by: null,
  }
}

export function findTemplate(id: string, customTemplates: WritingTemplateRecord[] = []): WritingTemplateRecord {
  return customTemplates.find(t => t.id === id) ?? systemTemplateToRecord(getWritingTemplate(id))
}

export function countWords(text: string, language: WritingLanguage) {
  const trimmed = text.trim()
  if (!trimmed) return 0
  if (language === 'zh') {
    const chineseChars = trimmed.match(/[\u4e00-\u9fff]/g)?.length ?? 0
    const latinWords = trimmed.replace(/[\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0
    return chineseChars + latinWords
  }
  return trimmed.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0
}
