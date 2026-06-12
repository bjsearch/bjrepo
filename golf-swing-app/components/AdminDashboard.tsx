'use client'

import { useEffect, useState } from 'react'
import { AdminDashboardData, fetchAdminDashboard } from '@/lib/adminDashboard'
import { CLUB_LABELS, ClubCategory } from '@/lib/types'
import { phaseLabelByKey } from '@/lib/swingPhases'

const card = 'rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.35)]'

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${card} p-5 flex flex-col gap-1`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-extrabold text-lime-300">{value}</p>
    </div>
  )
}

export default function AdminDashboard() {
  const [data, setData] = useState<AdminDashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAdminDashboard()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : '대시보드를 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className={`${card} p-10 text-center text-sm text-slate-400`}>대시보드를 불러오는 중...</div>
    )
  }

  if (error || !data) {
    return (
      <p className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
        {error ?? '대시보드를 불러오지 못했습니다.'}
      </p>
    )
  }

  const labelByKey = phaseLabelByKey()
  const clubEntries = Object.entries(data.clubBreakdown).sort((a, b) => b[1] - a[1])
  const regionEntries = Object.entries(data.regionBreakdown).sort((a, b) => b[1].count - a[1].count)
  const phaseFeedbackEntries = Object.entries(data.phaseFeedback)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="가입자 수" value={`${data.totalUsers.toLocaleString()}명`} />
        <StatCard label="총 분석 수" value={`${data.totalAnalyses.toLocaleString()}건`} />
        <StatCard label="전체 평균 점수" value={data.averageScore != null ? data.averageScore.toFixed(1) : '-'} />
      </div>

      <section className={`${card} p-6`}>
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-slate-100">
          <span className="text-xl" aria-hidden>🏌️</span> 클럽별 분석 비율
        </h3>
        {clubEntries.length === 0 ? (
          <p className="text-sm text-slate-500">아직 분석 기록이 없습니다.</p>
        ) : (
          <div className="space-y-2.5">
            {clubEntries.map(([category, count]) => {
              const pct = data.totalAnalyses > 0 ? Math.round((count / data.totalAnalyses) * 100) : 0
              return (
                <div key={category} className="space-y-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-slate-200 font-semibold">{CLUB_LABELS[category as ClubCategory] ?? category}</span>
                    <span className="text-slate-400">
                      {count.toLocaleString()}건 ({pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full bg-lime-400" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className={`${card} p-6`}>
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-slate-100">
          <span className="text-xl" aria-hidden>📍</span> 지역별 평균 점수
        </h3>
        {regionEntries.length === 0 ? (
          <p className="text-sm text-slate-500">위치 정보가 포함된 분석 기록이 없습니다.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {regionEntries.map(([region, stats]) => (
              <div key={region} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 flex items-center justify-between">
                <span className="text-sm text-slate-200">{region}</span>
                <span className="text-sm font-semibold text-lime-300">
                  {stats.average != null ? stats.average.toFixed(1) : '-'}점 ({stats.count}건)
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={`${card} p-6`}>
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-slate-100">
          <span className="text-xl" aria-hidden>🎯</span> 프레임 선택 정확도 피드백
        </h3>
        {phaseFeedbackEntries.length === 0 ? (
          <p className="text-sm text-slate-500">아직 수집된 피드백이 없습니다.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {phaseFeedbackEntries.map(([key, tally]) => (
              <div key={key} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 flex items-center justify-between">
                <span className="text-sm text-slate-200">{labelByKey[key] ?? key}</span>
                <span className="text-sm text-slate-400">
                  <span className="text-lime-300 font-semibold">👍 {tally.correct}</span>
                  {' / '}
                  <span className="text-rose-300 font-semibold">👎 {tally.incorrect}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
