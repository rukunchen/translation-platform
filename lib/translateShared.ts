// 纯共享常量 / 类型 — 服务端和客户端都能安全引用
// ⚠️ 这个文件不要 import 任何 Node-only SDK，保持纯净

export type ProviderId = 'deepseek' | 'claude' | 'doubao' | 'openai'

export const ALL_PROVIDER_IDS: ProviderId[] = ['deepseek', 'claude', 'doubao', 'openai']

export const langNames: Record<string, string> = {
  en: '英语', zh: '中文', ja: '日语', ko: '韩语',
  fr: '法语', de: '德语', es: '西班牙语', ru: '俄语'
}

export const DEFAULT_PROMPT =
  '请将以下{sourceLang}文本翻译成{targetLang}。只输出译文，不要解释。'

// 占位符替换 + 拼出最终发送给模型的完整 prompt
export function composePrompt(opts: {
  prompt?: string
  source: string
  sourceLang: string
  targetLang: string
}): string {
  const sourceLangName = langNames[opts.sourceLang] || opts.sourceLang
  const targetLangName = langNames[opts.targetLang] || opts.targetLang
  const instruction = (opts.prompt?.trim() || DEFAULT_PROMPT)
    .replace(/\{sourceLang\}/g, sourceLangName)
    .replace(/\{targetLang\}/g, targetLangName)

  if (instruction.includes('{source}')) {
    return instruction.replace(/\{source\}/g, opts.source)
  }
  return `${instruction}\n\n原文：\n${opts.source}`
}
