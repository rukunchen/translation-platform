import type { Metadata, Viewport } from 'next'
import AuthGate from '@/components/AuthGate'
import './globals.css'

export const metadata: Metadata = {
  title: '译境 — 技大25级MTIer翻译平台',
  description: '专为25级深技大MTI同学打造的翻译平台，AI 辅助初翻，自动生成术语表',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#F0EEE5',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className="font-sans" suppressHydrationWarning>
        <AuthGate />
        {children}
      </body>
    </html>
  )
}
