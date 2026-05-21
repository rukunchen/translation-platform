// 服务端 AI 翻译调用层 — 只在 API route 中使用
// ⚠️ 不要在客户端组件里 import 这个文件，否则会把 SDK 打进浏览器 bundle

import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { ReasoningEffort } from 'openai/resources/shared'
import { composePrompt, type ProviderId } from './translateShared'

// 重导出共享类型，方便服务端代码继续从这里 import
export type { ProviderId } from './translateShared'
export { DEFAULT_PROMPT, langNames, composePrompt } from './translateShared'

export type TranslateOpts = {
  model: string
  temperature: number
  prompt: string
  source: string
  sourceLang: string
  targetLang: string
}

export type TranslateResult = {
  text: string
  error?: string
}

export type GenerateOpts = {
  model: string
  temperature: number
  prompt: string
}

function errorMessage(error: unknown, fallback: string): string {
  return redactSecrets(error instanceof Error ? error.message : fallback)
}

function redactSecrets(message: string): string {
  return message.replace(/sk-[A-Za-z0-9_*.-]+/g, (key) => {
    if (key.length <= 16) return 'sk-***'
    return `${key.slice(0, 8)}...${key.slice(-4)}`
  })
}

// ============ Anthropic (Claude) ============
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function callClaude(opts: TranslateOpts): Promise<TranslateResult> {
  try {
    const res = await anthropic.messages.create({
      model: opts.model,
      max_tokens: 4096,
      temperature: opts.temperature,
      messages: [{ role: 'user', content: composePrompt(opts) }],
    })
    const block = res.content[0]
    const text = block.type === 'text' ? block.text : ''
    return { text }
  } catch (e: unknown) {
    return { text: '', error: errorMessage(e, 'Claude 调用失败') }
  }
}

// ============ DeepSeek（OpenAI 兼容协议）============
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
})

async function callDeepseek(opts: TranslateOpts): Promise<TranslateResult> {
  try {
    const res = await deepseek.chat.completions.create({
      model: opts.model,
      temperature: opts.temperature,
      messages: [{ role: 'user', content: composePrompt(opts) }],
    })
    const text = res.choices[0]?.message?.content || ''
    return { text }
  } catch (e: unknown) {
    return { text: '', error: errorMessage(e, 'DeepSeek 调用失败') }
  }
}

// ============ Doubao 豆包（火山方舟 Ark，OpenAI 兼容协议）============
// 接入文档: https://www.volcengine.com/docs/82379/1099455
// 需要的环境变量:
//   DOUBAO_API_KEY     —— 火山方舟 API Key
//   ARK_API_KEY        —— 可选别名，兼容火山方舟官方文档命名
//   DOUBAO_BASE_URL    —— 可选，默认 https://ark.cn-beijing.volces.com/api/v3
//   ARK_BASE_URL       —— 可选别名
let doubaoClient: OpenAI | null = null
const DOUBAO_MODEL_ALIASES: Record<string, string> = {
  'doubao-1-5-pro-32k': 'doubao-1-5-pro-32k-250115',
  'doubao-1-5-lite-32k': 'doubao-1-5-lite-32k-250115',
  'doubao-1-5-pro-256k': 'doubao-seed-1-6-250615',
  'doubao-pro-32k': 'doubao-1-5-pro-32k-250115',
}

function getDoubao(): OpenAI | null {
  const apiKey = process.env.DOUBAO_API_KEY || process.env.ARK_API_KEY
  if (!apiKey) return null
  if (!doubaoClient) {
    doubaoClient = new OpenAI({
      apiKey,
      baseURL: process.env.DOUBAO_BASE_URL || process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    })
  }
  return doubaoClient
}

async function callDoubao(opts: TranslateOpts): Promise<TranslateResult> {
  const client = getDoubao()
  if (!client) {
    return { text: '', error: 'Doubao 尚未配置：请在运行环境中设置 DOUBAO_API_KEY 或 ARK_API_KEY' }
  }
  try {
    const res = await client.chat.completions.create({
      model: DOUBAO_MODEL_ALIASES[opts.model] || opts.model,
      temperature: opts.temperature,
      messages: [{ role: 'user', content: composePrompt(opts) }],
    })
    const text = res.choices[0]?.message?.content || ''
    return { text }
  } catch (e: unknown) {
    return { text: '', error: errorMessage(e, 'Doubao 调用失败') }
  }
}

// ============ OpenAI（ChatGPT）============
// 需要的环境变量:
//   OPENAI_API_KEY     —— OpenAI Platform 的 sk-... key
//   OPENAI_BASE_URL    —— 可选，自建代理 / Azure OpenAI 时填
let openaiClient: OpenAI | null = null
const OPENAI_MODEL_ALIASES: Record<string, string> = {
  'chatgpt-4.0': 'gpt-4o',
  'chatgpt4.0': 'gpt-4o',
  'chatgpt-4o': 'gpt-4o',
  'chatgpt4o': 'gpt-4o',
  'chatgpt-4o-latest': 'gpt-4o',
  'gpt-4.0': 'gpt-4o',
}

function getOpenAI(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null
  if (!isValidOpenAIKey(apiKey)) return null
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL?.trim() || undefined,
    })
  }
  return openaiClient
}

async function callOpenAI(opts: TranslateOpts): Promise<TranslateResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (apiKey && !isValidOpenAIKey(apiKey)) {
    return { text: '', error: 'OpenAI API Key 格式不正确：请在 .env.local 中设置有效的 OPENAI_API_KEY（通常以 sk- 开头，且不能包含中文或说明文字）' }
  }
  const client = getOpenAI()
  if (!client) {
    return { text: '', error: 'OpenAI 尚未配置：请在运行环境中设置 OPENAI_API_KEY' }
  }
  const model = normalizeOpenAIModel(opts.model)
  try {
    if (isOpenAIReasoningModel(model)) {
      const res = await client.responses.create({
        model,
        input: composePrompt(opts),
        reasoning: { effort: openAIReasoningEffort(model) },
        max_output_tokens: 4096,
      })
      return { text: res.output_text || '' }
    }

    const res = await client.chat.completions.create({
      model,
      temperature: opts.temperature,
      messages: [{ role: 'user', content: composePrompt(opts) }],
    })
    const text = res.choices[0]?.message?.content || ''
    return { text }
  } catch (e: unknown) {
    return { text: '', error: errorMessage(e, 'OpenAI 调用失败') }
  }
}

function normalizeOpenAIModel(model: string): string {
  const normalized = model.trim().toLowerCase()
  return OPENAI_MODEL_ALIASES[normalized] || model
}

function isValidOpenAIKey(apiKey: string): boolean {
  return /^sk-[\x21-\x7E]+$/.test(apiKey)
}

function isOpenAIReasoningModel(model: string): boolean {
  return /^gpt-5(?:\.|$|-)/.test(model) || /^o[1-9]/.test(model)
}

function openAIReasoningEffort(model: string): ReasoningEffort {
  if (model.includes('pro')) return 'high'
  return 'medium'
}

// ============ 统一入口 ============
export async function translateWith(
  provider: ProviderId,
  opts: TranslateOpts
): Promise<TranslateResult> {
  switch (provider) {
    case 'claude':   return callClaude(opts)
    case 'deepseek': return callDeepseek(opts)
    case 'doubao':   return callDoubao(opts)
    case 'openai':   return callOpenAI(opts)
    default: return { text: '', error: `未知的 provider: ${provider}` }
  }
}

export function providerConfigured(provider: ProviderId): boolean {
  switch (provider) {
    case 'claude': return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
    case 'deepseek': return Boolean(process.env.DEEPSEEK_API_KEY?.trim())
    case 'doubao': return Boolean((process.env.DOUBAO_API_KEY || process.env.ARK_API_KEY)?.trim())
    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY?.trim()
      return Boolean(apiKey && isValidOpenAIKey(apiKey))
    }
    default: return false
  }
}

export async function generateWith(provider: ProviderId, opts: GenerateOpts): Promise<TranslateResult> {
  if (!providerConfigured(provider)) {
    return { text: '', error: `${provider} 未配置` }
  }
  const temperature = Math.max(0, Math.min(2, opts.temperature))
  try {
    switch (provider) {
      case 'claude': {
        const res = await anthropic.messages.create({
          model: opts.model,
          max_tokens: 4096,
          temperature,
          messages: [{ role: 'user', content: opts.prompt }],
        })
        const block = res.content[0]
        return { text: block.type === 'text' ? block.text : '' }
      }
      case 'deepseek': {
        const res = await deepseek.chat.completions.create({
          model: opts.model,
          temperature,
          messages: [{ role: 'user', content: opts.prompt }],
        })
        return { text: res.choices[0]?.message?.content || '' }
      }
      case 'doubao': {
        const client = getDoubao()
        if (!client) return { text: '', error: 'Doubao 尚未配置' }
        const res = await client.chat.completions.create({
          model: DOUBAO_MODEL_ALIASES[opts.model] || opts.model,
          temperature,
          messages: [{ role: 'user', content: opts.prompt }],
        })
        return { text: res.choices[0]?.message?.content || '' }
      }
      case 'openai': {
        const client = getOpenAI()
        if (!client) return { text: '', error: 'OpenAI 尚未配置' }
        const model = normalizeOpenAIModel(opts.model)
        if (isOpenAIReasoningModel(model)) {
          const res = await client.responses.create({
            model,
            input: opts.prompt,
            reasoning: { effort: openAIReasoningEffort(model) },
            max_output_tokens: 4096,
          })
          return { text: res.output_text || '' }
        }
        const res = await client.chat.completions.create({
          model,
          temperature,
          messages: [{ role: 'user', content: opts.prompt }],
        })
        return { text: res.choices[0]?.message?.content || '' }
      }
      default:
        return { text: '', error: `未知的 provider: ${provider}` }
    }
  } catch (e: unknown) {
    return { text: '', error: errorMessage(e, 'AI 调用失败') }
  }
}
