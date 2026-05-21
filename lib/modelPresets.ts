// 多模型翻译工作台：前端用的 provider/model 预设
// 把这些抽出来是为了：① 增删模型只改一个文件 ② 前端下拉框直接消费

import { DEFAULT_PROMPT, type ProviderId } from './translateShared'

export type ModelOption = {
  value: string         // 实际传给 API 的 model id
  label: string         // UI 显示的友好名
  hint?: string         // 二级说明
}

export type ProviderPreset = {
  id: ProviderId
  label: string
  color: string         // UI 标签色
  models: ModelOption[]
}

export const DEFAULT_MODEL_BY_PROVIDER: Record<ProviderId, string> = {
  deepseek: 'deepseek-chat',
  claude: 'claude-opus-4-7',
  doubao: 'doubao-seed-1-6-250615',
  openai: 'gpt-5.5',
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    color: '#3D8BFD',
    models: [
      { value: 'deepseek-chat', label: 'DeepSeek Chat', hint: '通用、快速' },
      { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner', hint: '推理增强，速度慢' },
    ],
  },
  {
    id: 'claude',
    label: 'Anthropic',
    color: '#D97757',
    models: [
      { value: 'claude-opus-4-7', label: 'Claude Opus 4.7', hint: '最强质量' },
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', hint: '均衡' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', hint: '最快' },
    ],
  },
  {
    id: 'doubao',
    label: 'Doubao',
    color: '#3656DF',
    models: [
      { value: 'doubao-seed-1-6-250615', label: 'Doubao Seed 1.6', hint: '通用主力' },
      { value: 'doubao-seed-1-6-flash-250615', label: 'Doubao Seed 1.6 Flash', hint: '更快' },
      { value: 'doubao-1-5-pro-32k-250115', label: 'Doubao 1.5 Pro 32k', hint: '经典稳定' },
      { value: 'doubao-1-5-lite-32k-250115', label: 'Doubao 1.5 Lite 32k', hint: '轻量、便宜' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    color: '#10A37F',
    models: [
      { value: 'gpt-5.5', label: 'GPT-5.5 Thinking', hint: '最强推理' },
      { value: 'gpt-5.2', label: 'GPT-5.2 Thinking', hint: '推理增强' },
      { value: 'gpt-5.1', label: 'GPT-5.1 Thinking', hint: '推理增强' },
      { value: 'gpt-5', label: 'GPT-5 Thinking', hint: '推理模型' },
      { value: 'gpt-4o', label: 'GPT-4o', hint: '主力多模态' },
      { value: 'gpt-4o-mini', label: 'GPT-4o mini', hint: '便宜、快' },
    ],
  },
]

// 一些常用的预设 prompt，供用户快速选择
export const PROMPT_PRESETS: { label: string; prompt: string }[] = [
  {
    label: '默认（自然流畅）',
    prompt: DEFAULT_PROMPT,
  },
  {
    label: '学术正式',
    prompt: '请将以下{sourceLang}文本翻译成{targetLang}，使用学术正式的语体，保留专业术语的准确性，避免口语化表达。只输出译文。',
  },
  {
    label: '政府公文',
    prompt: '请将以下{sourceLang}文本翻译成{targetLang}，保持政府公文严谨、规范的风格，使用正式书面语。只输出译文。',
  },
  {
    label: '出版级英文',
    prompt: '请将以下{sourceLang}文本翻译成{targetLang}，要求语言流畅自然、符合英文母语者表达习惯，适合正式出版物。只输出译文。',
  },
  {
    label: '严格直译',
    prompt: '请将以下{sourceLang}文本翻译成{targetLang}，严格按原文结构和语序翻译，不要自由改写或意译。只输出译文。',
  },
  {
    label: '术语优先',
    prompt: '请将以下{sourceLang}文本翻译成{targetLang}，优先保证专业术语翻译的一致性和准确性。只输出译文。',
  },
]

// 单个翻译窗口的配置
export type WindowConfig = {
  id: string                  // 前端用的唯一 id
  enabled: boolean
  provider: ProviderId
  model: string
  temperature: number
  prompt: string
}

// 创建一个默认窗口配置
//   A → DeepSeek（快速）   B → Claude（高质量）
//   C → Doubao（豆包）     D → OpenAI（ChatGPT）
export function makeDefaultConfig(idx: number): WindowConfig {
  const labels = ['A', 'B', 'C', 'D']
  const slot: { provider: ProviderId; model: string }[] = [
    { provider: 'deepseek', model: 'deepseek-chat' },
    { provider: 'claude',   model: 'claude-opus-4-7' },
    { provider: 'doubao',   model: DEFAULT_MODEL_BY_PROVIDER.doubao },
    { provider: 'openai',   model: DEFAULT_MODEL_BY_PROVIDER.openai },
  ]
  const { provider, model } = slot[idx] ?? slot[0]
  return {
    id: `model-${labels[idx]}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    enabled: idx < 2,         // 默认只启用 A / B；C/D 留空等用户接入 API
    provider,
    model,
    temperature: 0.3,
    prompt: DEFAULT_PROMPT,
  }
}

// 取窗口标签 (Model A / B / C / D)
export function windowLabel(idx: number): string {
  return `Model ${['A','B','C','D'][idx] || idx + 1}`
}

// localStorage 配置持久化
const LS_KEY_PREFIX = 'parallel-workbench-configs:'

export function loadConfigsFromLocal(documentId: string): WindowConfig[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LS_KEY_PREFIX + documentId)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveConfigsToLocal(documentId: string, configs: WindowConfig[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LS_KEY_PREFIX + documentId, JSON.stringify(configs))
  } catch { /* quota 满了无所谓 */ }
}
