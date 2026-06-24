'use client'

import { useEffect, useState } from 'react'
import { AdminDashboardData, fetchAdminDashboard } from '@/lib/adminDashboard'
import { ClubCategory } from '@/lib/types'
import { phaseLabelByKey } from '@/lib/swingPhases'
import { useI18n, type TranslationKey } from '@/lib/i18n'

const cardCls = 'rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.35)]'

const CLUB_I18N_KEYS: Record<ClubCategory, TranslationKey> = {
  driver: 'club.driver',
  wood: 'club.wood',
  utility: 'club.utility',
  iron: 'club.iron',
  wedge: 'club.wedge',
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${cardCls} p-5 flex flex-col gap-1`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-extrabold text-lime-300">{value}</p>
    </div>
  )
}

export default function AdminDashboard() {
  const { t, locale } = useI18n()
  const [data, setData] = useState<AdminDashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAdminDashboard()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t('admin.loadError')))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className={`${cardCls} p-10 text-center text-sm text-slate-400`}>{t('admin.loading')}</div>
    )
  }

  if (error || !data) {
    return (
      <p className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
        {error ?? t('admin.loadError')}
      </p>
    )
  }

  const labelByKey = phaseLabelByKey()
  const clubEntries = Object.entries(data.clubBreakdown).sort((a, b) => b[1] - a[1])
  const regionEntries = Object.entries(data.regionBreakdown).sort((a, b) => b[1].count - a[1].count)
  const phaseFeedbackEntries = Object.entries(data.phaseFeedback)

  const userCount = locale === 'ko' ? `${data.totalUsers.toLocaleString()}명` : data.totalUsers.toLocaleString()
  const analysesCount = locale === 'ko' ? `${data.totalAnalyses.toLocaleString()}건` : data.totalAnalyses.toLocaleString()

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label={t('admin.users')} value={userCount} />
        <StatCard label={t('admin.totalAnalyses')} value={analysesCount} />
        <StatCard label={t('admin.avgScore')} value={data.averageScore != null ? data.averageScore.toFixed(1) : '-'} />
      </div>

      <section className={`${cardCls} p-6`}>
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-slate-100">
          <span className="text-xl" aria-hidden>🏌️</span> {t('admin.clubBreakdown')}
        </h3>
        {clubEntries.length === 0 ? (
          <p className="text-sm text-slate-500">{t('admin.noAnalyses')}</p>
        ) : (
          <div className="space-y-2.5">
            {clubEntries.map(([category, count]) => {
              const pct = data.totalAnalyses > 0 ? Math.round((count / data.totalAnalyses) * 100) : 0
              const clubLabel = (category in CLUB_I18N_KEYS) ? t(CLUB_I18N_KEYS[category as ClubCategory]) : category
              return (
                <div key={category} className="space-y-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-slate-200 font-semibold">{clubLabel}</span>
                    <span className="text-slate-400">
                      {count.toLocaleString()}{locale === 'ko' ? '건' : ''} ({pct}%)
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

      <section className={`${cardCls} p-6`}>
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-slate-100">
          <span className="text-xl" aria-hidden>📍</span> {t('admin.regionScores')}
        </h3>
        {regionEntries.length === 0 ? (
          <p className="text-sm text-slate-500">{t('admin.noRegionData')}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {regionEntries.map(([region, stats]) => (
              <div key={region} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 flex items-center justify-between">
                <span className="text-sm text-slate-200">{region}</span>
                <span className="text-sm font-semibold text-lime-300">
                  {stats.average != null ? stats.average.toFixed(1) : '-'}{locale === 'ko' ? '점' : 'pts'} ({stats.count}{locale === 'ko' ? '건' : ''})
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={`${cardCls} p-6`}>
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-slate-100">
          <span className="text-xl" aria-hidden>🎯</span> {t('admin.phaseFeedback')}
        </h3>
        {phaseFeedbackEntries.length === 0 ? (
          <p className="text-sm text-slate-500">{t('admin.noFeedback')}</p>
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
