'use client'

import { useState } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isSameMonth, addMonths, subMonths, isToday, parseISO } from 'date-fns'
import { DiaryEntry } from '@/lib/types'

interface Props {
  entries: DiaryEntry[]
  currentEntry: DiaryEntry
  onSelectDate: (date: Date) => void
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function DiaryCalendar({ entries, currentEntry, onSelectDate }: Props) {
  const [viewMonth, setViewMonth] = useState(new Date())

  const monthStart = startOfMonth(viewMonth)
  const monthEnd = endOfMonth(viewMonth)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startPad = getDay(monthStart) // 0=Sun

  const entryByDate = entries.reduce((acc, e) => {
    acc[e.date] = e
    return acc
  }, {} as Record<string, DiaryEntry>)

  const scoreColor = (score: number) => {
    if (score >= 80) return 'bg-emerald-500'
    if (score >= 60) return 'bg-amber-400'
    return 'bg-red-400'
  }

  const currentDateStr = format(parseISO(currentEntry.date), 'yyyy-MM-dd')

  const writtenDays = entries.filter(e => e.content.trim()).length
  const analyzedDays = entries.filter(e => e.analysis).length

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-slate-700 flex items-center gap-2">
            <span>📅</span>
            <span>Diary Calendar</span>
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMonth(subMonths(viewMonth, 1))}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-slate-700 w-28 text-center">
              {format(viewMonth, 'MMMM yyyy')}
            </span>
            <button
              onClick={() => setViewMonth(addMonths(viewMonth, 1))}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
        {/* Stats */}
        <div className="flex gap-3 mt-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-400"></div>
            <span>{writtenDays} written</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
            <span>{analyzedDays} analyzed</span>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="p-4">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-y-1">
          {/* Leading empty cells */}
          {Array.from({ length: startPad }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}

          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const entry = entryByDate[dateStr]
            const hasContent = entry && entry.content.trim().length > 0
            const hasAnalysis = entry?.analysis
            const isSelected = dateStr === currentDateStr
            const isCurrentMonth = isSameMonth(day, viewMonth)
            const isTodayDate = isToday(day)

            return (
              <button
                key={dateStr}
                onClick={() => onSelectDate(day)}
                className={`
                  relative flex flex-col items-center justify-center rounded-xl py-1.5 transition-all
                  ${isSelected ? 'bg-indigo-600 text-white shadow-sm' : ''}
                  ${!isSelected && hasContent ? 'hover:bg-indigo-50' : ''}
                  ${!isSelected && !hasContent ? 'hover:bg-slate-50' : ''}
                  ${!isCurrentMonth ? 'opacity-30' : ''}
                `}
              >
                <span className={`
                  text-xs font-medium leading-none
                  ${isSelected ? 'text-white' : isTodayDate ? 'text-indigo-600' : 'text-slate-700'}
                `}>
                  {format(day, 'd')}
                </span>

                {/* Dot indicator */}
                <div className="h-1.5 mt-0.5 flex items-center justify-center">
                  {hasAnalysis && !isSelected && (
                    <div className={`w-1.5 h-1.5 rounded-full ${scoreColor(entry.analysis!.score)}`} />
                  )}
                  {hasContent && !hasAnalysis && !isSelected && (
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-300" />
                  )}
                  {isSelected && hasContent && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white/70" />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 pb-4 flex flex-wrap gap-x-4 gap-y-1">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <div className="w-2 h-2 rounded-full bg-indigo-300"></div>
          <span>Written</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          <span>Score 80+</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <div className="w-2 h-2 rounded-full bg-amber-400"></div>
          <span>Score 60+</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <div className="w-2 h-2 rounded-full bg-red-400"></div>
          <span>Score &lt;60</span>
        </div>
      </div>
    </div>
  )
}
