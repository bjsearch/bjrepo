'use client'

import { ClubProfileEntry } from '@/lib/types'
import { DEFAULT_CLUB_PROFILE } from '@/lib/clubRecommend'

interface ClubProfileProps {
  profile: ClubProfileEntry[]
  onChange: (profile: ClubProfileEntry[]) => void
}

export default function ClubProfile({ profile, onChange }: ClubProfileProps) {
  const update = (id: string, avgDistance: number) => {
    onChange(profile.map((c) => (c.id === id ? { ...c, avgDistance } : c)))
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">내 클럽별 평균 거리</h2>
        <button
          onClick={() => onChange(DEFAULT_CLUB_PROFILE)}
          className="text-xs text-slate-500 hover:text-emerald-400"
        >
          기본값으로 초기화
        </button>
      </div>
      <p className="text-xs text-slate-500">
        핀까지 거리에 맞춰 자동으로 클럽을 추천해 드릴 때 사용하는 나만의 평균 비거리입니다.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {profile.map((club) => (
          <div key={club.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-2">
            <div className="text-xs text-slate-400">{club.label}</div>
            <div className="mt-1 flex items-center gap-1">
              <input
                type="number"
                value={club.avgDistance}
                onChange={(e) => update(club.id, Number(e.target.value) || 0)}
                className="w-full rounded bg-slate-900 px-2 py-1 text-sm font-mono text-white"
              />
              <span className="text-xs text-slate-500">m</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
