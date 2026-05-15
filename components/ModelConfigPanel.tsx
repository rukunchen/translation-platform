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
      <div className="flex items-center border-b border-line bg-surface"
        style={{ gap: 12, paddingLeft: 18, paddingRight: 18, paddingTop: 14, paddingBottom: 14 }}>
        <span
          className="inline-flex items-center justify-center rounded-lg text-white font-bold flex-shrink-0"
          style={{ background: providerPreset.color, width: 32, height: 32, fontSize: 14 }}
        >
          {['A','B','C','D'][idx]}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center" style={{ gap: 8 }}>
            <p className="font-medium text-ink-900" style={{ fontSize: 14 }}>{windowLabel(idx)}</p>
            <span
              className="inline-flex items-center font-medium uppercase rounded text-white"
              style={{
                background: providerPreset.color,
                fontSize: 10,
                letterSpacing: '0.12em',
                paddingLeft: 8, paddingRight: 8, paddingTop: 3, paddingBottom: 3,
              }}
            >
              {providerPreset.label}
            </span>
          </div>
          <p className="text-ink-500 truncate font-mono"
            style={{ fontSize: 11, marginTop: 3 }}>
            {currentModel?.label || config.model} · T={config.temperature}
          </p>
        </div>

        <div className="flex items-center" style={{ gap: 8 }}>
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-ink-500 hover:text-ink-900 transition-colors rounded-md hover:bg-canvas"
            style={{ fontSize: 12, paddingLeft: 10, paddingRight: 10, paddingTop: 5, paddingBottom: 5 }}
          >
            {expanded ? '收起' : '设置'}
          </button>
          {onToggleEnabled && (
            <button
              onClick={onToggleEnabled}
              title={config.enabled ? '禁用此窗口' : '启用此窗口'}
              className={cn(
                'rounded-full transition-colors relative flex-shrink-0',
                config.enabled ? 'bg-ink-900' : 'bg-line'
              )}
              style={{ width: 36, height: 20 }}
            >
              <span className="bg-white rounded-full transition-all"
                style={{ position: 'absolute', top: 2, left: config.enabled ? 18 : 2, width: 16, height: 16 }} />
            </button>
          )}
          {canRemove && onRemove && (
            <button onClick={onRemove} title="移除此窗口"
              className="text-ink-400 hover:text-red-600 transition-colors"
              style={{ padding: 6, borderRadius: 6 }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 配置区 */}
      {expanded && (
        <div className="border-b border-line bg-white"
          style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 20, paddingBottom: 22, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Provider */}
          <div>
            <div style={{ marginBottom: 10 }}><Eyebrow>Provider</Eyebrow></div>
            <div className="grid grid-cols-2" style={{ gap: 8 }}>
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className={cn(
                    'rounded-lg font-medium border-2 transition-all',
                    config.provider === p.id
                      ? 'border-ink-900 bg-ink-900 text-white'
                      : 'border-line text-ink-500 hover:border-ink-900/30'
                  )}
                  style={{ fontSize: 12, paddingLeft: 14, paddingRight: 14, paddingTop: 9, paddingBottom: 9 }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          <div>
            <div style={{ marginBottom: 10 }}><Eyebrow>Model</Eyebrow></div>
            <select
              value={config.model}
              onChange={e => onChange({ ...config, model: e.target.value })}
              className="bg-white border-2 border-line rounded-lg focus:outline-none focus:border-brand"
              style={{ width: '100%', fontSize: 13, paddingLeft: 12, paddingRight: 12, paddingTop: 9, paddingBottom: 9 }}
            >
              {providerPreset.models.map(m => (
                <option key={m.value} value={m.value}>{m.label}{m.hint ? ` · ${m.hint}` : ''}</option>
              ))}
            </select>
          </div>

          {/* Temperature */}
          <div>
            <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
              <Eyebrow>Temperature</Eyebrow>
              <span className="font-mono text-ink-900" style={{ fontSize: 12 }}>{config.temperature.toFixed(2)}</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.1}
              value={config.temperature}
              onChange={e => onChange({ ...config, temperature: parseFloat(e.target.value) })}
              className="accent-brand cursor-pointer"
              style={{ width: '100%' }}
            />
            <div className="flex justify-between text-ink-400 font-mono"
              style={{ fontSize: 10, marginTop: 6 }}>
              <span>0 · 严谨</span>
              <span>1 · 创意</span>
            </div>
          </div>

          {/* Prompt 预设 */}
          <div>
            <div style={{ marginBottom: 10 }}><Eyebrow>Prompt 预设</Eyebrow></div>
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              {PROMPT_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => onChange({ ...config, prompt: p.prompt })}
                  className={cn(
                    'rounded-md border transition-colors',
                    config.prompt === p.prompt
                      ? 'border-brand bg-brand-50 text-brand'
                      : 'border-line text-ink-500 hover:border-ink-900/30 hover:text-ink-900'
                  )}
                  style={{ fontSize: 11, paddingLeft: 10, paddingRight: 10, paddingTop: 5, paddingBottom: 5 }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 自定义 prompt */}
          <div>
            <div style={{ marginBottom: 10 }}>
              <Eyebrow>
                翻译指令 <span className="text-ink-400 normal-case tracking-normal">（支持 {'{sourceLang}'} {'{targetLang}'} {'{source}'}）</span>
              </Eyebrow>
            </div>
            <textarea
              value={config.prompt}
              onChange={e => onChange({ ...config, prompt: e.target.value })}
              rows={3}
              placeholder="请将以下{sourceLang}文本翻译成{targetLang}..."
              className="bg-white border-2 border-line rounded-lg font-mono text-ink-900 focus:outline-none focus:border-brand resize-none leading-relaxed"
              style={{ width: '100%', fontSize: 12, paddingLeft: 14, paddingRight: 14, paddingTop: 11, paddingBottom: 11, lineHeight: 1.6 }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
