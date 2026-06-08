'use client'

import { useState } from 'react'
import SwingAnalyzer from './SwingAnalyzer'
import HistoryCalendar from './HistoryCalendar'

type Tab = 'analyze' | 'calendar'

export default function AppShell() {
  const [tab, setTab] = useState<Tab>('analyze')

  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <div className="inline-flex p-1 rounded-full bg-white/[0.04] border border-white/10 backdrop-blur">
          <button
            type="button"
            onClick={() => setTab('analyze')}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition ${
              tab === 'analyze'
                ? 'bg-gradient-to-r from-lime-400 to-emerald-500 text-emerald-950 shadow-[0_0_16px_rgba(132,204,22,0.35)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🎥 스윙 분석
          </button>
          <button
            type="button"
            onClick={() => setTab('calendar')}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition ${
              tab === 'calendar'
                ? 'bg-gradient-to-r from-lime-400 to-emerald-500 text-emerald-950 shadow-[0_0_16px_rgba(132,204,22,0.35)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            📅 캘린더
          </button>
        </div>
      </div>

      {tab === 'analyze' ? <SwingAnalyzer /> : <HistoryCalendar />}
    </div>
  )
}
