'use client'

interface Props {
  onTextChange?: (text: string) => void
  setContent?: string | null
}

export default function CollaborativeEditor({ onTextChange, setContent }: Props) {
  return (
    <textarea
      className="w-full h-full p-4 text-sm text-gray-800 leading-relaxed resize-none focus:outline-none border-none"
      onChange={e => onTextChange?.(e.target.value)}
      value={setContent || ''}
      placeholder="译文将在这里显示，点击 AI 初翻后开始翻译..."
    />
  )
}