'use client'

import { useState } from 'react'
import { PROVIDERS, PROMPT_PRESETS, windowLabel, type WindowConfig } from '@/lib/modelPresets'
import type { ProviderId } from '@/lib/translateShared'
import { cn } from './ui/cn'
import { Eyebrow } from './ui/Eyebrow'

type Props = {
  idx: number
  config: WindowConfig
  onChange: (next: WindowConfig) => void
  onToggleEnabled?: () => void
  onRemove?: () => void
  canRemove?: boolean
}

export default function ModelConfigPanel({ idx, config, onChange, onToggleEnabled, onRemove, canRemove }: Props) {
  const [expanded, setExpanded] = useState(false)
  const providerPreset = PROVIDERS.find(p => p.id === config.provider) || PROVIDERS[0]
  const currentModel = providerPreset.models.find(m => m.value === config.model)

  const setProvider = (provider: ProviderId) => {
    const preset = PROVIDERS.find(p => p.id === provider)
    if (!preset) return
    onChange({
      ...config,
      provider,
      model: preset.models.some(m => m.value === config.model)
        ? config.model
        : preset.models[0].value,
    })
  }

  return (
    <div className={cn(
      'flex flex-col bg-white border rounded-2xl overflow-hidden transition-all',
      config.enabled ? 'border-line' : 'border-line opacity-50'
    )}>
      {/* 头部 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-surface">
        <span
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white text-sm font-bold flex-shrink-0"
          style={{ background: providerPreset.color }}
        >
          {['A','B','C','D'][idx]}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm text-ink-900">{windowLabel(idx)}</p>
            <span
              className="text-[10px] font-medium uppercase tracking-[0.12em] px-1.5 py-0.5 rounded text-white"
              style={{ background: providerPreset.color }}
            >
              {providerPreset.label}
            </span>
          </div>
          <p className="text-[11px] text-ink-500 truncate font-mono mt-0.5">
            {currentModel?.label || config.model} · T={config.temperature}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-ink-500 hover:text-ink-900 px-2 py-1 transition-colors"
          >
            {expanded ? '收起' : '设置'}
          </button>
          {onToggleEnabled && (
            <button
              onClick={onToggleEnabled}
              title={config.enabled ? '禁用此窗口' : '启用此窗口'}
              className={cn(
                'w-9 h-5 rounded-full transition-colors relative flex-shrink-0',
                config.enabled ? 'bg-ink-900' : 'bg-line'
              )}
            >
              <span className={cn(
                'absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all',
                config.enabled ? 'left-[18px]' : 'left-0.5'
              )} />
            </button>
          )}
          {canRemove && onRemove && (
            <button onClick={onRemove} title="移除此窗口"
              className="text-ink-400 hover:text-red-600 p-1 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 配置区 */}
      {expanded && (
        <div className="px-5 py-5 space-y-5 border-b border-line bg-white">
          {/* Provider */}
          <div>
            <Eyebrow className="mb-2">Provider</Eyebrow>
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className={cn(
                    'px-3 py-2 rounded-lg text-xs font-medium border-2 transition-all',
                    config.provider === p.id
                      ? 'border-ink-900 bg-ink-900 text-white'
                      : 'border-line text-ink-500 hover:border-ink-900/30'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          <div>
            <Eyebrow className="mb-2">Model</Eyebrow>
            <select
              value={config.model}
              onChange={e => onChange({ ...config, model: e.target.value })}
              className="w-full bg-white border-2 border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand"
            >
              {providerPreset.models.map(m => (
                <option key={m.value} value={m.value}>{m.label}{m.hint ? ` · ${m.hint}` : ''}</option>
              ))}
            </select>
          </div>

          {/* Temperature */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <Eyebrow>Temperature</Eyebrow>
              <span className="text-xs font-mono text-ink-900">{config.temperature.toFixed(2)}</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.1}
              value={config.temperature}
              onChange={e => onChange({ ...config, temperature: parseFloat(e.target.value) })}
              className="w-full accent-brand cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-ink-400 font-mono mt-1">
              <span>0 · 严谨</span>
              <span>1 · 创意</span>
            </div>
          </div>

          {/* Prompt 预设 */}
          <div>
            <Eyebrow className="mb-2">Prompt 预设</Eyebrow>
            <div className="flex flex-wrap gap-1.5">
              {PROMPT_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => onChange({ ...config, prompt: p.prompt })}
                  className={cn(
                    'text-[11px] px-2.5 py-1 rounded-md border transition-colors',
                    config.prompt === p.prompt
                      ? 'border-brand bg-brand-50 text-brand'
                      : 'border-line text-ink-500 hover:border-ink-900/30 hover:text-ink-900'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 自定义 prompt */}
          <div>
            <Eyebrow className="mb-2">
              翻译指令 <span className="text-ink-400 normal-case tracking-normal">（支持 {'{sourceLang}'} {'{targetLang}'} {'{source}'}）</span>
            </Eyebrow>
            <textarea
              value={config.prompt}
              onChange={e => onChange({ ...config, prompt: e.target.value })}
              rows={3}
              placeholder="请将以下{sourceLang}文本翻译成{targetLang}..."
              className="w-full bg-white border-2 border-line rounded-lg px-3 py-2 text-xs font-mono text-ink-900 focus:outline-none focus:border-brand resize-none leading-relaxed"
            />
          </div>
        </div>
      )}
    </div>
  )
}
