'use client'

import { useEffect, useMemo, useState } from 'react'
import AnalysisResult from './AnalysisResult'
import { countByDate, deleteAnalysis, fetchGlobalStats, fetchHistory, fetchRegionalStats, getAnalysesByDate } from '@/lib/history'
import { SavedAnalysis, describeClub } from '@/lib/types'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function toKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function todayKey(): string {
  const d = new Date()
  return toKey(d.getFullYear(), d.getMonth(), d.getDate())
}

export default function HistoryCalendar() {
  const [history, setHistory] = useState<SavedAnalysis[]>([])
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [globalAverageScore, setGlobalAverageScore] = useState<number | null>(null)
  const [regionStats, setRegionStats] = useState<Record<string, number | null>>({})

  async function reload() {
    setLoading(true)
    setLoadError(null)
    try {
      setHistory(await fetchHistory())
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '분석 기록을 불러오지 못했습니다.')
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
      setDeleteError(err instanceof Error ? err.message : '기록을 삭제하지 못했습니다.')
    }
  }

  const selectedEntries = selectedDate ? getAnalysesByDate(history, selectedDate) : []
  const today = todayKey()

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-10 text-center text-sm text-slate-400">
        분석 기록을 불러오는 중...
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
          다시 시도
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
            aria-label="이전 달"
          >
            ‹
          </button>
          <h2 className="font-bold text-lg text-slate-100">
            {cursor.year}년 {cursor.month + 1}월
          </h2>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 text-slate-300 hover:text-lime-300 hover:border-lime-400/30 transition flex items-center justify-center"
            aria-label="다음 달"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-slate-500 mb-2">
          {WEEKDAYS.map((w) => (
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
            {selectedDate} 분석 기록 {selectedEntries.length > 0 && `(${selectedEntries.length}건)`}
          </h3>

          {deleteError && (
            <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">{deleteError}</p>
          )}

          {selectedEntries.length === 0 && (
            <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-slate-500">
              이 날짜에는 저장된 스윙 분석 기록이 없습니다.
            </p>
          )}

          {selectedEntries.map((entry) => {
            const time = new Date(entry.createdAt).toLocaleTimeString('ko-KR', {
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
                      <p className="text-sm font-semibold text-slate-200 truncate">{describeClub(entry.club)} 스윙 분석</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1.5">
                        <span>{time}</span>
                        {entry.location?.region && (
                          <span className="text-slate-400">
                            <span aria-hidden>📍</span> {entry.location.region}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        if (window.confirm('이 분석 기록을 삭제할까요?')) handleDelete(entry.id)
                      }}
                      role="button"
                      aria-label="삭제"
                      className="text-xs text-rose-300/80 hover:text-rose-300 px-2 py-1 rounded-full hover:bg-rose-500/10 transition"
                    >
                      삭제
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
          날짜를 선택하면 해당 날짜의 스윙 분석 기록을 볼 수 있습니다. (점이 표시된 날짜에 기록이 있어요)
        </p>
      )}
    </div>
  )
}
