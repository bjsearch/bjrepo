import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '골프 스윙 분석기',
  description: '스윙 영상을 업로드하면 AI가 점수, 분석, 연습법, 참고 선수를 알려줍니다.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="bg-gradient-to-b from-emerald-50 to-white min-h-screen text-gray-800">
        {children}
      </body>
    </html>
  )
}
