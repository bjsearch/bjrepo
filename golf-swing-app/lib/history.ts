import { SavedAnalysis, SwingAnalysisResult, ClubSelection } from './types'

async function readJson(res: Response): Promise<any> {
  const raw = await res.text()
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export interface GlobalScoreStats {
  average: number | null
  count: number
}

export async function fetchGlobalStats(): Promise<GlobalScoreStats> {
  const res = await fetch('/api/stats')
  const data = await readJson(res)
  if (!res.ok) {
    throw new Error(data?.error ?? `통계를 불러오지 못했습니다. (HTTP ${res.status})`)
  }
  return {
    average: typeof data?.average === 'number' ? data.average : null,
    count: typeof data?.count === 'number' ? data.count : 0,
  }
}

export async function fetchHistory(): Promise<SavedAnalysis[]> {
  const res = await fetch('/api/history')
  const data = await readJson(res)
  if (!res.ok) {
    throw new Error(data?.error ?? `분석 기록을 불러오지 못했습니다. (HTTP ${res.status})`)
  }
  return Array.isArray(data?.entries) ? data.entries : []
}

export async function saveAnalysis(club: ClubSelection, result: SwingAnalysisResult): Promise<SavedAnalysis> {
  const res = await fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ club, result }),
  })
  const data = await readJson(res)
  if (!res.ok || !data?.entry) {
    throw new Error(data?.error ?? `분석 결과를 저장하지 못했습니다. (HTTP ${res.status})`)
  }
  return data.entry as SavedAnalysis
}

export async function deleteAnalysis(id: string): Promise<void> {
  const res = await fetch(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) {
    const data = await readJson(res)
    throw new Error(data?.error ?? `기록을 삭제하지 못했습니다. (HTTP ${res.status})`)
  }
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
