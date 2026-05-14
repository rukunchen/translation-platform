// 服务端 AI 翻译调用层 — 只在 API route 中使用
// ⚠️ 不要在客户端组件里 import 这个文件，否则会把 SDK 打进浏览器 bundle

import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
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
    const block = res.content[0] as any
    const text = block?.text || ''
    return { text }
  } catch (e: any) {
    return { text: '', error: e?.message || 'Claude 调用失败' }
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
  } catch (e: any) {
    return { text: '', error: e?.message || 'DeepSeek 调用失败' }
  }
}

// ============ 统一入口 ============
export async function translateWith(
  provider: ProviderId,
  opts: TranslateOpts
): Promise<TranslateResult> {
  switch (provider) {
    case 'claude': return callClaude(opts)
    case 'deepseek': return callDeepseek(opts)
    default: return { text: '', error: `未知的 provider: ${provider}` }
  }
}
