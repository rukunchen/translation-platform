import type { Metadata } from 'next'
import { Inter, Fraunces } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  axes: ['SOFT', 'WONK'],
})

export const metadata: Metadata = {
  title: '译境 — 技大25级MTIer翻译平台',
  description: '专为25级深技大MTI同学打造的翻译平台，AI 辅助初翻，自动生成术语表',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" className={`${inter.variable} ${fraunces.variable}`}>
      <body className={inter.className} suppressHydrationWarning>{children}</body>
    </html>
  )
}
