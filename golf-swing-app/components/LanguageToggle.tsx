'use client'

import { useI18n } from '@/lib/i18n'

export default function LanguageToggle() {
  const { locale, setLocale } = useI18n()

  return (
    <button
      type="button"
      onClick={() => setLocale(locale === 'ko' ? 'en' : 'ko')}
      className="fixed top-4 right-4 z-50 flex items-center gap-1.5 text-xs font-semibold rounded-full px-3.5 py-2 border border-white/15 bg-white/[0.06] backdrop-blur-md text-slate-300 hover:text-lime-300 hover:border-lime-400/30 shadow-lg transition"
      aria-label={locale === 'ko' ? 'Switch to English' : '한국어로 변경'}
    >
      <span className="text-sm">{locale === 'ko' ? '🇺🇸' : '🇰🇷'}</span>
      {locale === 'ko' ? 'EN' : '한국어'}
    </button>
  )
}
