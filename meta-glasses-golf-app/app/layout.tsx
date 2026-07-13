import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Glasses Caddie - Meta 스마트 안경 골프 워치 연동 앱 (오디오 전용)',
  description:
    '디스플레이가 없는 Meta 스마트 안경용 골프 오디오 컴패니언 앱. 스마트 골프 워치와 연동해 핀까지 거리, 클럽 추천, 스코어를 음성 안내로 전달합니다.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-950 text-slate-100">{children}</body>
    </html>
  )
}
