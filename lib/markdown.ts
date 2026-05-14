// 极简 Markdown 渲染器：支持 **粗体** `代码` [链接](url) 换行
// 输出安全的 HTML 字符串（已转义）

export function renderInlineMd(text: string): string {
  // 先转义 HTML
  let out = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  // [text](url) — 链接（限制 http/https/mailto）
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g,
    (_, label, url) => `<a href="${url}" target="_blank" rel="noopener" class="text-[#D97757] underline-offset-2 hover:underline">${label}</a>`)

  // `inline code`
  out = out.replace(/`([^`]+)`/g,
    '<code class="bg-[#F0EEE5] text-[#1F1E1D] px-1.5 py-0.5 rounded text-[12px] font-mono">$1</code>')

  // **bold**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

  // 换行
  out = out.replace(/\n/g, '<br/>')

  // 裸 URL 自动链接（不在 markdown 链接里的）
  out = out.replace(/(?<!["=>])(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener" class="text-[#D97757] underline-offset-2 hover:underline">$1</a>')

  return out
}
