'use client'

import { useEffect, useMemo, useState } from 'react'
import AnalysisResult from './AnalysisResult'
import { countByDate, deleteAnalysis, fetchGlobalStats, fetchHistory, fetchRegionalStats, getAnalysesByDate } from '@/lib/history'
import { ClubSelection, SavedAnalysis } from '@/lib/types'
import { useI18n, type TranslationKey } from '@/lib/i18n'

function toKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function todayKey(): string {
  const d = new Date()
  return toKey(d.getFullYear(), d.getMonth(), d.getDate())
}

const MONTH_NAMES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const CLUB_KEYS: Record<string, TranslationKey> = {
  driver: 'club.driver', wood: 'club.wood', utility: 'club.utility', iron: 'club.iron', wedge: 'club.wedge',
}

function describeClubI18n(club: ClubSelection, t: (k: TranslationKey) => string): string {
  const label = t(CLUB_KEYS[club.category] ?? 'club.iron')
  if (club.category === 'driver') return label
  if (club.number == null) return label
  const suffix = t('club.numberSuffix')
  return suffix ? `${club.number}${suffix} ${label}` : `${club.number} ${label}`
}

export default function HistoryCalendar({ initialDate }: { initialDate?: string | null }) {
  const { t, locale } = useI18n()
  const [history, setHistory] = useState<SavedAnalysis[]>([])
  const [cursor, setCursor] = useState(() => {
    if (initialDate) {
      const [y, m] = initialDate.split('-').map(Number)
      if (y && m) return { year: y, month: m - 1 }
    }
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate ?? null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [globalAverageScore, setGlobalAverageScore] = useState<number | null>(null)
  const [regionStats, setRegionStats] = useState<Record<string, number | null>>({})

  const weekdays = [
    t('weekday.sun'), t('weekday.mon'), t('weekday.tue'), t('weekday.wed'),
    t('weekday.thu'), t('weekday.fri'), t('weekday.sat'),
  ]

  async function reload() {
    setLoading(true)
    setLoadError(null)
    try {
      setHistory(await fetchHistory())
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t('calendar.loadError'))
    } finally {
      setLoading(false)
    }

    try {
      const stats = await fetchGlobalStats()
      setGlobalAverageScore(stats.average)
    } catch {
      setGlobalAverageScore(null)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  const counts = useMemo(() => countByDate(history), [history])

  const myAverageScore = useMemo(() => {
    if (history.length === 0) return null
    return history.reduce((sum, e) => sum + e.result.score, 0) / history.length
  }, [history])

  const cells = useMemo(() => {
    const { year, month } = cursor
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const items: { day: number | null; key: string | null }[] = []
    for (let i = 0; i < firstDay; i++) items.push({ day: null, key: null })
    for (let day = 1; day <= daysInMonth; day++) items.push({ day, key: toKey(year, month, day) })
    return items
  }, [cursor])

  function changeMonth(delta: number) {
    setCursor(({ year, month }) => {
      const date = new Date(year, month + delta, 1)
      return { year: date.getFullYear(), month: date.getMonth() }
    })
    setSelectedDate(null)
    setExpandedId(null)
  }

  async function handleExpand(entry: SavedAnalysis) {
    const next = expandedId === entry.id ? null : entry.id
    setExpandedId(next)

    const region = entry.location?.region
    if (next && region && !(region in regionStats)) {
      try {
        const stats = await fetchRegionalStats(region)
        setRegionStats((cur) => ({ ...cur, [region]: stats.average }))
      } catch {
        setRegionStats((cur) => ({ ...cur, [region]: null }))
      }
    }
  }

  async function handleDelete(id: string) {
    setDeleteError(null)
    try {
      await deleteAnalysis(id)
      setHistory((cur) => cur.filter((e) => e.id !== id))
      setExpandedId((cur) => (cur === id ? null : cur))
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('calendar.deleteError'))
    }
  }

  const selectedEntries = selectedDate ? getAnalysesByDate(history, selectedDate) : []
  const today = todayKey()

  const monthTitle = t('calendar.yearMonth')
    .replace('{year}', String(cursor.year))
    .replace('{month}', locale === 'ko' ? String(cursor.month + 1) : MONTH_NAMES_EN[cursor.month])

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-10 text-center text-sm text-slate-400">
        {t('calendar.loading')}
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <p className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">{loadError}</p>
        <button
          type="button"
          onClick={reload}
          className="text-xs font-semibold text-lime-300 bg-lime-400/10 border border-lime-400/20 rounded-full px-4 py-2 hover:bg-lime-400/20 transition"
        >
          {t('calendar.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.35)] p-6">
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 text-slate-300 hover:text-lime-300 hover:border-lime-400/30 transition flex items-center justify-center"
          >
            ‹
          </button>
          <h2 className="font-bold text-lg text-slate-100">
            {monthTitle}
          </h2>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 text-slate-300 hover:text-lime-300 hover:border-lime-400/30 transition flex items-center justify-center"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-slate-500 mb-2">
          {weekdays.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((cell, i) => {
            if (cell.day == null || cell.key == null) {
              return <div key={i} />
            }
            const count = counts[cell.key] ?? 0
            const isSelected = selectedDate === cell.key
            const isToday = cell.key === today
            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => {
                  setSelectedDate((cur) => (cur === cell.key ? null : cell.key))
                  setExpandedId(null)
                }}
                className={`relative aspect-square rounded-lg text-sm flex flex-col items-center justify-center gap-0.5 transition border ${
                  isSelected
                    ? 'bg-gradient-to-br from-lime-400 to-emerald-500 text-emerald-950 font-bold border-transparent shadow-[0_0_16px_rgba(132,204,22,0.4)]'
                    : isToday
                      ? 'border-lime-400/50 text-lime-300 bg-white/5'
                      : 'border-white/5 text-slate-300 bg-white/[0.02] hover:bg-white/5 hover:border-white/15'
                }`}
              >
                <span>{cell.day}</span>
                {count > 0 && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isSelected ? 'bg-emerald-950/70' : 'bg-lime-400 shadow-[0_0_6px_rgba(163,230,53,0.8)]'
                    }`}
                  />
                )}
              </button>
            )
          })}
        </div>
      </section>

      {selectedDate && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 px-1">
            {selectedDate} {t('calendar.records')} {selectedEntries.length > 0 && `(${selectedEntries.length}${t('unit.count')})`}
          </h3>

          {deleteError && (
            <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">{deleteError}</p>
          )}

          {selectedEntries.length === 0 && (
            <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-slate-500">
              {t('calendar.noRecords')}
            </p>
          )}

          {selectedEntries.map((entry) => {
            const time = new Date(entry.createdAt).toLocaleTimeString(locale === 'ko' ? 'ko-KR' : 'en-US', {
              hour: '2-digit',
              minute: '2-digit',
            })
            const isExpanded = expandedId === entry.id
            return (
              <div
                key={entry.id}
                className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.35)] overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => handleExpand(entry)}
                  className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-white/[0.03] transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 shrink-0 rounded-full bg-gradient-to-br from-lime-400/20 to-emerald-400/10 border border-lime-400/20 flex items-center justify-center font-bold text-lime-300 text-sm">
                      {entry.result.score}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-200 truncate">{describeClubI18n(entry.club, t)} {t('calendar.swingAnalysis')}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1.5">
                        <span>{time}</span>
                        {entry.location?.region && (
                          <span className="text-slate-400" title={entry.location.address}>
                            <span aria-hidden>📍</span> {entry.location.region}
                            {entry.location.district ? ` ${entry.location.district}` : ''}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        if (window.confirm(t('calendar.deleteConfirm'))) handleDelete(entry.id)
                      }}
                      role="button"
                      className="text-xs text-rose-300/80 hover:text-rose-300 px-2 py-1 rounded-full hover:bg-rose-500/10 transition"
                    >
                      {t('calendar.delete')}
                    </span>
                    <span className="text-slate-500 text-sm">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4">
                    <AnalysisResult
                      result={entry.result}
                      myAverageScore={myAverageScore}
                      globalAverageScore={globalAverageScore}
                      regionAverageScore={entry.location?.region ? regionStats[entry.location.region] ?? null : null}
                      regionLabel={entry.location?.region}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </section>
      )}

      {!selectedDate && (
        <p className="text-center text-sm text-slate-500">
          {t('calendar.selectDateHint')}
        </p>
      )}
    </div>
  )
}
