'use client'

import AppShell from '@/components/AppShell'
import LanguageToggle from '@/components/LanguageToggle'
import { I18nProvider, useI18n } from '@/lib/i18n'

function HomeContent() {
  const { t } = useI18n()

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <LanguageToggle />
      <header className="mb-10 text-center space-y-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-widest text-lime-300 bg-lime-400/10 ring-1 ring-lime-400/30 rounded-full px-4 py-1.5 uppercase">
          <span aria-hidden>⛳</span> Carry Coach
        </span>
        <h1 className="text-4xl font-extrabold bg-gradient-to-r from-lime-300 via-emerald-300 to-teal-300 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(132,204,22,0.15)]">
          Carry Coach
        </h1>
        <p className="text-slate-400 max-w-md mx-auto leading-relaxed">
          {t('hero.description')}
        </p>
      </header>
      <AppShell />
    </main>
  )
}

export default function Home() {
  return (
    <I18nProvider>
      <HomeContent />
    </I18nProvider>
  )
}
