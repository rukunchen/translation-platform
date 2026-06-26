export type PlanKey = 'trial' | 'pro' | 'team' | 'enterprise'

export type PlanLimit = number | null

export type PlanConfig = {
  key: PlanKey
  label: string
  tagline: string
  monthlyPriceCny: number | null
  ctaLabel: string
  memberLimit: PlanLimit
  projectLimit: PlanLimit
  aiCreditLimit: PlanLimit
  highlights: string[]
}

export const planCatalog: Record<PlanKey, PlanConfig> = {
  trial: {
    key: 'trial',
    label: '试用版',
    tagline: '验证团队协作流程',
    monthlyPriceCny: 0,
    ctaLabel: '当前套餐',
    memberLimit: 3,
    projectLimit: 3,
    aiCreditLimit: 200,
    highlights: ['小团队试跑', '基础项目协作', 'AI 对照体验'],
  },
  pro: {
    key: 'pro',
    label: '专业版',
    tagline: '适合小型翻译团队',
    monthlyPriceCny: 199,
    ctaLabel: '输入专业版 Key',
    memberLimit: 8,
    projectLimit: 30,
    aiCreditLimit: 3000,
    highlights: ['多人项目交付', '术语资产沉淀', '项目权限管理'],
  },
  team: {
    key: 'team',
    label: '团队版',
    tagline: '适合持续交付项目组',
    monthlyPriceCny: 699,
    ctaLabel: '输入团队版 Key',
    memberLimit: 25,
    projectLimit: 120,
    aiCreditLimit: 15000,
    highlights: ['多项目并行', '客户/译员分工', '更高 AI 月额度'],
  },
  enterprise: {
    key: 'enterprise',
    label: '机构版',
    tagline: '私有化与定制结算',
    monthlyPriceCny: null,
    ctaLabel: '输入机构版 Key',
    memberLimit: null,
    projectLimit: null,
    aiCreditLimit: null,
    highlights: ['专属部署评估', '发票与合同流程', '定制安全边界'],
  },
}

export const planDisplayOrder: PlanKey[] = ['trial', 'pro', 'team', 'enterprise']

export function normalizePlanKey(planKey?: string | null): PlanKey {
  if (planKey === 'pro' || planKey === 'team' || planKey === 'enterprise') return planKey
  return 'trial'
}

export function getPlanConfig(planKey?: string | null): PlanConfig {
  return planCatalog[normalizePlanKey(planKey)]
}

export function formatPlanLimit(limit: PlanLimit, unit: string): string {
  return limit === null ? `不限${unit}` : `${limit} ${unit}`
}

export function formatPlanPrice(plan: PlanConfig): string {
  return '后台 Key 验证后开通'
}

export function planLimitExceededMessage(plan: PlanConfig, resource: 'member' | 'project'): string {
  if (resource === 'member') {
    return `${plan.label}最多支持 ${plan.memberLimit} 个成员/待接受邀请，请升级套餐后继续邀请。`
  }
  return `${plan.label}最多支持 ${plan.projectLimit} 个项目，请升级套餐后继续创建。`
}
