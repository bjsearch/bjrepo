'use client'

import { useI18n, type Locale } from '@/lib/i18n'

const LANGS: { id: Locale; label: string; flag: string }[] = [
  { id: 'ko', label: '한국어', flag: '🇰🇷' },
  { id: 'en', label: 'English', flag: '🇺🇸' },
]

export default function LanguageToggle() {
  const { locale, setLocale } = useI18n()

  return (
    <div className="fixed top-4 right-4 z-50 flex rounded-full border border-white/15 bg-white/[0.06] backdrop-blur-md shadow-lg overflow-hidden">
      {LANGS.map((lang) => (
        <button
          key={lang.id}
          type="button"
          onClick={() => setLocale(lang.id)}
          className={`flex items-center gap-1 text-xs font-semibold px-3 py-2 transition ${
            locale === lang.id
              ? 'bg-lime-400/15 text-lime-300'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <span className="text-sm">{lang.flag}</span>
          {lang.label}
        </button>
      ))}
    </div>
  )
}
