import type { WindowConfig } from './modelPresets'

export function parallelRunKey(input: {
  provider: string
  model: string
  temperature?: number | null
  prompt?: string | null
}): string {
  return JSON.stringify({
    provider: input.provider,
    model: input.model,
    temperature: Number(input.temperature ?? 0.3).toFixed(2),
    prompt: (input.prompt || '').trim(),
  })
}

export function parallelConfigRunKey(config: WindowConfig): string {
  return parallelRunKey({
    provider: config.provider,
    model: config.model,
    temperature: config.temperature,
    prompt: config.prompt,
  })
}

export function parallelResultKey(segmentId: string, runKey: string): string {
  return `${segmentId}:${runKey}`
}
