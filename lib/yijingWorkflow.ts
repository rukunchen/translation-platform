export type YijingWorkflowIcon =
  | 'upload'
  | 'translate'
  | 'search'
  | 'bookmark'
  | 'chart'
  | 'document'

export type YijingWorkflowStep = {
  no: string
  title: string
  homepageBody: string
  dashboardNote: string
  href: string
  icon: YijingWorkflowIcon
}

export const yijingWorkflowSteps: YijingWorkflowStep[] = [
  {
    no: '01',
    title: '原文输入',
    homepageBody: '导入文档或粘贴文本，建立项目语境',
    dashboardNote: '导入文档、PPT 或粘贴文本',
    href: '/projects',
    icon: 'upload',
  },
  {
    no: '02',
    title: '句段翻译',
    homepageBody: '高效翻译与 AI 辅助，生成候选译文',
    dashboardNote: '分句推进基础译文',
    href: '/projects',
    icon: 'translate',
  },
  {
    no: '03',
    title: '审校定稿',
    homepageBody: '协同审核、批注讨论，输出高质量译文',
    dashboardNote: '形成可追溯共识译文',
    href: '/projects',
    icon: 'search',
  },
  {
    no: '04',
    title: '术语沉淀',
    homepageBody: '提取术语并沉淀资产，保障一致性与复用',
    dashboardNote: '把项目经验变成可复用资产',
    href: '/practice/terms',
    icon: 'bookmark',
  },
  {
    no: '05',
    title: '训练复盘',
    homepageBody: '译训与对照实验，沉淀经验与方法论',
    dashboardNote: '回看错题、表达与译例',
    href: '/practice',
    icon: 'chart',
  },
  {
    no: '06',
    title: '论文写作',
    homepageBody: '结构化整合资料，完成研究与写作输出',
    dashboardNote: '输出案例、报告与研究文本',
    href: '/writing',
    icon: 'document',
  },
]
