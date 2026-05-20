import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'English Writing App - Daily Diary & AI Coaching',
  description: 'Write your daily diary in English and get AI-powered grammar corrections, sentence improvements, and video references',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 min-h-screen">
        {children}
      </body>
    </html>
  )
}
