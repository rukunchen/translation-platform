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

  // 共用：徽章内联样式
  const badgeBase: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: '0.12em',
    paddingLeft: 8, paddingRight: 8, paddingTop: 3, paddingBottom: 3,
    borderRadius: 4,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  }

  return (
    <div className={cn(
      'rounded-xl border transition-colors',
      isAdopted ? 'border-green-400 bg-green-50/50'
      : status === 'failed' ? 'border-red-200 bg-red-50/50'
      : status === 'running' ? 'border-brand/40 bg-brand-50/40'
      : 'border-line bg-white'
    )}
    style={{ display: 'flex', flexDirection: 'column', minHeight: 140 }}>

      {/* 状态行 */}
      <div className="flex items-center flex-wrap"
        style={{ gap: 6, paddingLeft: 14, paddingRight: 14, paddingTop: 12, paddingBottom: 10 }}>
        {status === 'idle' && (
          <span className="font-mono uppercase bg-canvas text-ink-400" style={badgeBase}>未开始</span>
        )}
        {status === 'running' && (
          <span className="inline-flex items-center font-mono uppercase bg-brand text-white"
            style={{ ...badgeBase, gap: 4 }}>
            <span className="w-2 h-2 border border-white border-t-transparent rounded-full animate-spin" />
            翻译中
          </span>
        )}
        {status === 'success' && (
          <span className="font-mono uppercase bg-green-600 text-white" style={badgeBase}>✓ 完成</span>
        )}
        {status === 'failed' && (
          <span className="font-mono uppercase bg-red-600 text-white" style={badgeBase}>✗ 失败</span>
        )}
        {isAdopted && (
          <span className="font-mono uppercase bg-green-700 text-white" style={badgeBase}>已采用</span>
        )}
      </div>

      {/* 内容区（flex-1，徽章绝对不会盖到文字） */}
      <div className="text-ink-900 whitespace-pre-wrap break-words"
        style={{
          flex: 1,
          paddingLeft: 18, paddingRight: 18, paddingTop: 2, paddingBottom: 14,
          fontSize: 14, lineHeight: 1.75,
        }}>
        {status === 'failed' ? (
          <p style={{ fontSize: 12, color: '#DC2626' }}>{error || '未知错误'}</p>
        ) : text ? (
          text
        ) : status === 'running' ? (
          <span className="text-ink-400" style={{ fontSize: 12 }}>正在生成…</span>
        ) : (
          <span className="text-ink-400" style={{ fontSize: 12 }}>点击「翻译选中」开始</span>
        )}
      </div>

      {/* 底部操作栏（普通 flex 项，不再 absolute） */}
      {(status === 'failed' || status === 'success') && (
        <div className="flex items-center border-t border-line bg-white/85"
          style={{ gap: 8, paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }}>
          {status === 'failed' && (
            <button onClick={onRetry}
              className="bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
              style={{ fontSize: 11, paddingLeft: 10, paddingRight: 10, paddingTop: 4, paddingBottom: 4, borderRadius: 6 }}>
              ↻ 重试
            </button>
          )}
          {status === 'success' && (
            <>
              <button onClick={onRetry} title="重新翻译"
                className="text-ink-500 hover:text-ink-900 transition-colors"
                style={{ fontSize: 11, paddingLeft: 6, paddingRight: 6, paddingTop: 4, paddingBottom: 4 }}>
                ↻
              </button>
              <button onClick={copy} title="复制译文"
                className="text-ink-500 hover:text-ink-900 transition-colors"
                style={{ fontSize: 11, paddingLeft: 6, paddingRight: 6, paddingTop: 4, paddingBottom: 4 }}>
                📋
              </button>
              <button
                onClick={onAdopt}
                disabled={adopting || isAdopted}
                className={cn(
                  'font-medium transition-colors disabled:opacity-50',
                  isAdopted ? 'bg-green-100 text-green-700 cursor-default'
                  : 'bg-ink-900 hover:bg-ink-700 text-white'
                )}
                style={{ marginLeft: 'auto', fontSize: 11, paddingLeft: 12, paddingRight: 12, paddingTop: 5, paddingBottom: 5, borderRadius: 6 }}
              >
                {adopting ? '采用中...' : isAdopted ? '✓ 已采用' : '采用此译文'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
