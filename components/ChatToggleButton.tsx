'use client'

type Props = {
  unread: number
  onClick: () => void
  active?: boolean
}

export default function ChatToggleButton({ unread, onClick, active }: Props) {
  return (
    <button onClick={onClick}
      className={`relative flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
        active
          ? 'bg-[#1F1E1D] text-white'
          : 'bg-[#F0EEE5] hover:bg-[#E0DDD3] text-[#1F1E1D]'
      }`}>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      聊天
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#D97757] text-white text-[10px] font-semibold rounded-full flex items-center justify-center">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  )
}
