'use client'

import { ClubCategory, ClubSelection, CLUB_LABELS } from '@/lib/types'
import { useI18n } from '@/lib/i18n'

const WOOD_NUMBERS = [3, 5, 7]
const UTILITY_NUMBERS = [2, 3, 4, 5]
const IRON_NUMBERS = [3, 4, 5, 6, 7, 8, 9]
const WEDGE_NUMBERS = [46, 48, 50, 52, 54, 56, 58, 60]

const CLUB_ICONS: Record<ClubCategory, string> = {
  driver: '🏌️',
  wood: '🪵',
  utility: '🛠️',
  iron: '🏑',
  wedge: '⛳',
}

const CLUB_I18N_KEYS: Record<ClubCategory, 'club.driver' | 'club.wood' | 'club.utility' | 'club.iron' | 'club.wedge'> = {
  driver: 'club.driver',
  wood: 'club.wood',
  utility: 'club.utility',
  iron: 'club.iron',
  wedge: 'club.wedge',
}

export default function ClubSelector({
  value,
  onChange,
}: {
  value: ClubSelection
  onChange: (club: ClubSelection) => void
}) {
  const { t } = useI18n()
  const categories: ClubCategory[] = ['driver', 'wood', 'utility', 'iron', 'wedge']

  function handleCategoryChange(category: ClubCategory) {
    if (category === 'driver') {
      onChange({ category, number: null })
    } else {
      const defaultNumber =
        category === 'wood'
          ? WOOD_NUMBERS[0]
          : category === 'utility'
            ? UTILITY_NUMBERS[0]
            : category === 'iron'
              ? IRON_NUMBERS[4]
              : WEDGE_NUMBERS[5]
      onChange({ category, number: defaultNumber })
    }
  }

  const numberOptions =
    value.category === 'wood'
      ? WOOD_NUMBERS
      : value.category === 'utility'
        ? UTILITY_NUMBERS
        : value.category === 'iron'
          ? IRON_NUMBERS
          : value.category === 'wedge'
            ? WEDGE_NUMBERS
            : []

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-300 mb-2">{t('club.selectPrompt')}</p>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => handleCategoryChange(cat)}
              className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-semibold transition ${
                value.category === cat
                  ? 'bg-gradient-to-r from-lime-500 to-emerald-500 text-emerald-950 border-transparent shadow-[0_0_18px_rgba(132,204,22,0.35)]'
                  : 'bg-white/5 text-slate-300 border-white/10 hover:border-lime-400/40 hover:text-lime-300'
              }`}
            >
              <span aria-hidden>{CLUB_ICONS[cat]}</span>
              {t(CLUB_I18N_KEYS[cat])}
            </button>
          ))}
        </div>
      </div>

      {numberOptions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">
            {value.category === 'wood'
              ? t('club.woodNumber')
              : value.category === 'utility'
                ? t('club.utilityNumber')
                : value.category === 'iron'
                  ? t('club.ironNumber')
                  : t('club.wedgeLoft')}
          </p>
          <div className="flex flex-wrap gap-2">
            {numberOptions.map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => onChange({ category: value.category, number: num })}
                className={`px-3.5 py-1.5 rounded-full border text-sm font-medium transition ${
                  value.number === num
                    ? 'bg-lime-400/90 text-emerald-950 border-lime-400/90 shadow-[0_0_12px_rgba(132,204,22,0.35)]'
                    : 'bg-white/5 text-slate-300 border-white/10 hover:border-lime-400/40 hover:text-lime-300'
                }`}
              >
                {num}{value.category === 'wedge' ? '°' : t('club.numberSuffix')}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
