import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'English Writing App - Daily Diary & AI Coaching',
  description: 'Write your daily diary in English and get AI-powered grammar corrections, sentence improvements, and video references',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 min-h-screen">
        <Script src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  )
}
