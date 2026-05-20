'use client'

import { format, parseISO } from 'date-fns'
import { DiaryEntry } from '@/lib/types'

interface Props {
  entries: DiaryEntry[]
  currentId: string
  onSelect: (entry: DiaryEntry) => void
  onNew: () => void
}

export default function DiaryHistory({ entries, currentId, onSelect, onNew }: Props) {
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-slate-700 flex items-center gap-2">
          <span>📖</span>
          <span>Journal History</span>
          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
            {entries.length}
          </span>
        </h3>
        <button
          onClick={onNew}
          className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors font-medium"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Entry
        </button>
      </div>

      {sortedEntries.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-slate-400 text-sm">No past entries yet.</p>
          <p className="text-slate-300 text-xs mt-1">Start writing your first diary!</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-50 max-h-48 overflow-y-auto scrollbar-thin">
          {sortedEntries.map((entry) => {
            const wordCount = entry.content.trim() ? entry.content.trim().split(/\s+/).length : 0
            const preview = entry.content.slice(0, 80).trim()
            const isActive = entry.id === currentId

            return (
              <button
                key={entry.id}
                onClick={() => onSelect(entry)}
                className={`w-full text-left px-5 py-3 hover:bg-slate-50 transition-colors ${
                  isActive ? 'bg-indigo-50 border-l-2 border-indigo-500' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-xs font-semibold ${isActive ? 'text-indigo-600' : 'text-slate-500'}`}>
                    {format(parseISO(entry.date), 'MMM d, yyyy')}
                  </span>
                  <div className="flex items-center gap-2">
                    {entry.analysis && (
                      <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-medium">
                        {entry.analysis.score}pts
                      </span>
                    )}
                    <span className="text-xs text-slate-400">{wordCount}w</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 truncate">
                  {preview || <em className="text-slate-300">Empty entry</em>}
                  {entry.content.length > 80 ? '...' : ''}
                </p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
