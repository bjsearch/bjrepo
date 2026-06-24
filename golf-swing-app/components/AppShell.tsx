'use client'

import { useState } from 'react'
import SwingAnalyzer from './SwingAnalyzer'
import SwingCompare from './SwingCompare'
import HistoryCalendar from './HistoryCalendar'
import AdminDashboard from './AdminDashboard'
import AuthGate from './AuthGate'
import { useI18n } from '@/lib/i18n'

type Tab = 'analyze' | 'compare' | 'calendar' | 'dashboard'

export default function AppShell() {
  const [tab, setTab] = useState<Tab>('analyze')
  const { t } = useI18n()

  return (
    <AuthGate>
      {(user, onLogout) => (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500 truncate">
              <span aria-hidden>👤</span> {user.email}
            </p>
            <button
              type="button"
              onClick={onLogout}
              className="text-xs font-semibold text-slate-400 hover:text-rose-300 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 transition shrink-0"
            >
              {t('auth.logout')}
            </button>
          </div>

          <div className="flex justify-center">
            <div className="inline-flex p-1 rounded-full bg-white/[0.04] border border-white/10 backdrop-blur">
              {([
                { key: 'analyze' as Tab, label: t('tab.analyze') },
                { key: 'compare' as Tab, label: t('tab.compare') },
                { key: 'calendar' as Tab, label: t('tab.calendar') },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`px-5 py-2 rounded-full text-sm font-semibold transition ${
                    tab === key
                      ? 'bg-gradient-to-r from-lime-400 to-emerald-500 text-emerald-950 shadow-[0_0_16px_rgba(132,204,22,0.35)]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
              {user.isAdmin && (
                <button
                  type="button"
                  onClick={() => setTab('dashboard')}
                  className={`px-5 py-2 rounded-full text-sm font-semibold transition ${
                    tab === 'dashboard'
                      ? 'bg-gradient-to-r from-lime-400 to-emerald-500 text-emerald-950 shadow-[0_0_16px_rgba(132,204,22,0.35)]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t('tab.dashboard')}
                </button>
              )}
            </div>
          </div>

          {tab === 'analyze' && <SwingAnalyzer />}
          {tab === 'compare' && <SwingCompare />}
          {tab === 'calendar' && <HistoryCalendar />}
          {tab === 'dashboard' && user.isAdmin && <AdminDashboard />}
        </div>
      )}
    </AuthGate>
  )
}
