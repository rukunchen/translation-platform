'use client'

import { cn } from './ui/cn'

export type CellStatus = 'idle' | 'running' | 'success' | 'failed'

export type ParallelResult = {
  id: string
  segment_id: string
  provider: string
  model: string
  translated_text: string
  status: CellStatus
  error_message?: string | null
}

type Props = {
  result: ParallelResult | null
  segmentTarget?: string
  onRetry: () => void
  onAdopt: () => void
  adopting?: boolean
}

export default function ParallelTranslationCell({ result, segmentTarget, onRetry, onAdopt, adopting }: Props) {
  const status: CellStatus = result?.status || 'idle'
  const text = result?.translated_text || ''
  const error = result?.error_message
  const isAdopted = !!(segmentTarget && text && segmentTarget.trim() === text.trim())

  const copy = async () => {
    if (!text) return
    await navigator.clipboard.writeText(text)
  }

  return (
    <div className={cn(
      'relative min-h-[120px] rounded-xl border transition-colors',
      isAdopted ? 'border-green-400 bg-green-50/50'
      : status === 'failed' ? 'border-red-200 bg-red-50/50'
      : status === 'running' ? 'border-brand/40 bg-brand-50/40'
      : 'border-line bg-white'
    )}>
      {/* 状态徽章（左上） */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
        {status === 'idle' && (
          <span className="text-[10px] font-mono uppercase tracking-[0.12em] px-2 py-0.5 bg-canvas text-ink-400 rounded">未开始</span>
        )}
        {status === 'running' && (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.12em] px-2 py-0.5 bg-brand text-white rounded">
            <span className="w-2 h-2 border border-white border-t-transparent rounded-full animate-spin" />
            翻译中
          </span>
        )}
        {status === 'success' && (
          <span className="text-[10px] font-mono uppercase tracking-[0.12em] px-2 py-0.5 bg-green-600 text-white rounded">✓ 完成</span>
        )}
        {status === 'failed' && (
          <span className="text-[10px] font-mono uppercase tracking-[0.12em] px-2 py-0.5 bg-red-600 text-white rounded">✗ 失败</span>
        )}
        {isAdopted && (
          <span className="text-[10px] font-mono uppercase tracking-[0.12em] px-2 py-0.5 bg-green-700 text-white rounded">已采用</span>
        )}
      </div>

      {/* 内容区 */}
      <div className="px-5 pt-10 pb-14 text-sm leading-7 text-ink-900 whitespace-pre-wrap break-words">
        {status === 'failed' ? (
          <p className="text-xs text-red-600">{error || '未知错误'}</p>
        ) : text ? (
          text
        ) : status === 'running' ? (
          <span className="text-ink-400 text-xs">正在生成…</span>
        ) : (
          <span className="text-ink-400 text-xs">点击「翻译选中」开始</span>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="absolute bottom-0 inset-x-0 flex items-center gap-1.5 px-3 py-2 border-t border-line bg-white/85 backdrop-blur-sm rounded-b-xl">
        {status === 'failed' && (
          <button onClick={onRetry}
            className="text-[11px] bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded-md font-medium transition-colors">
            ↻ 重试
          </button>
        )}
        {status === 'success' && (
          <>
            <button onClick={onRetry} title="重新翻译"
              className="text-[11px] text-ink-500 hover:text-ink-900 px-1.5 py-1 transition-colors">
              ↻
            </button>
            <button onClick={copy} title="复制译文"
              className="text-[11px] text-ink-500 hover:text-ink-900 px-1.5 py-1 transition-colors">
              📋
            </button>
            <button
              onClick={onAdopt}
              disabled={adopting || isAdopted}
              className={cn(
                'ml-auto text-[11px] px-3 py-1 rounded-md font-medium transition-colors disabled:opacity-50',
                isAdopted ? 'bg-green-100 text-green-700 cursor-default'
                : 'bg-ink-900 hover:bg-ink-700 text-white'
              )}
            >
              {adopting ? '采用中...' : isAdopted ? '✓ 已采用' : '采用此译文'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
