import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Glasses Caddie - Meta 스마트 안경 골프 워치 연동 앱',
  description:
    'Meta 스마트 안경용 골프 HUD 컴패니언 앱. 스마트 골프 워치와 연동해 핀까지 거리, 클럽 추천, 스코어를 안경 디스플레이 형태로 보여줍니다.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-950 text-slate-100">{children}</body>
    </html>
  )
}
