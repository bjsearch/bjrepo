import { SavedAnalysis, SwingAnalysisResult, ClubSelection } from './types'

const STORAGE_KEY = 'golf-swing-history-v1'

function todayKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function loadHistory(): SavedAnalysis[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persist(entries: SavedAnalysis[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

export function saveAnalysis(club: ClubSelection, result: SwingAnalysisResult): SavedAnalysis {
  const now = new Date()
  const entry: SavedAnalysis = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    date: todayKey(now),
    createdAt: now.toISOString(),
    club,
    result,
  }
  const entries = loadHistory()
  entries.push(entry)
  persist(entries)
  return entry
}

export function deleteAnalysis(id: string): SavedAnalysis[] {
  const entries = loadHistory().filter((e) => e.id !== id)
  persist(entries)
  return entries
}

export function getAnalysesByDate(history: SavedAnalysis[], date: string): SavedAnalysis[] {
  return history
    .filter((e) => e.date === date)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Map of YYYY-MM-DD -> entry count, for calendar badges. */
export function countByDate(history: SavedAnalysis[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const entry of history) {
    map[entry.date] = (map[entry.date] ?? 0) + 1
  }
  return map
}
