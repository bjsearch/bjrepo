'use client'

import { ClubCategory, ClubSelection, CLUB_LABELS } from '@/lib/types'

const IRON_NUMBERS = [3, 4, 5, 6, 7, 8, 9]
const WEDGE_NUMBERS = [46, 48, 50, 52, 54, 56, 58, 60]

export default function ClubSelector({
  value,
  onChange,
}: {
  value: ClubSelection
  onChange: (club: ClubSelection) => void
}) {
  const categories: ClubCategory[] = ['driver', 'iron', 'wedge']

  function handleCategoryChange(category: ClubCategory) {
    if (category === 'driver') {
      onChange({ category, number: null })
    } else {
      const defaultNumber = category === 'iron' ? IRON_NUMBERS[4] : WEDGE_NUMBERS[5]
      onChange({ category, number: defaultNumber })
    }
  }

  const numberOptions = value.category === 'iron' ? IRON_NUMBERS : value.category === 'wedge' ? WEDGE_NUMBERS : []

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700">사용한 골프채를 선택하세요</p>
      <div className="flex gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => handleCategoryChange(cat)}
            className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${
              value.category === cat
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-400'
            }`}
          >
            {CLUB_LABELS[cat]}
          </button>
        ))}
      </div>

      {numberOptions.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            {value.category === 'iron' ? '아이언 번호' : '웻지 로프트 각도'}
          </p>
          <div className="flex flex-wrap gap-2">
            {numberOptions.map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => onChange({ category: value.category, number: num })}
                className={`px-3 py-1.5 rounded-md border text-sm transition ${
                  value.number === num
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-400'
                }`}
              >
                {num}{value.category === 'wedge' ? '°' : '번'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
