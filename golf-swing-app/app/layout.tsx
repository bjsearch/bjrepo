import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Carry Coach',
  description: '스윙 영상을 업로드하면 AI가 점수, 분석, 연습법, 참고 선수를 알려줍니다.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" className="dark">
      <body className="relative min-h-screen bg-[#0b1410] text-slate-200 overflow-x-hidden">
        {/* Ambient golf-course glow */}
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-emerald-500/20 blur-[120px]" />
          <div className="absolute top-1/3 -right-32 w-[28rem] h-[28rem] rounded-full bg-lime-400/10 blur-[140px]" />
          <div className="absolute bottom-0 left-1/4 w-80 h-80 rounded-full bg-teal-500/10 blur-[120px]" />
          {/* subtle fairway stripe texture */}
          <div className="absolute inset-0 bg-[repeating-linear-gradient(100deg,rgba(255,255,255,0.015)_0px,rgba(255,255,255,0.015)_2px,transparent_2px,transparent_42px)]" />
        </div>
        {children}
      </body>
    </html>
  )
}
