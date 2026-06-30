import type { PhaseFeedbackStats, ScoreStats } from './db'

export interface AdminDashboardData {
  totalUsers: number
  totalAnalyses: number
  averageScore: number | null
  clubBreakdown: Record<string, number>
  regionBreakdown: Record<string, ScoreStats>
  phaseFeedback: PhaseFeedbackStats
}

async function readJson(res: Response): Promise<any> {
  const raw = await res.text()
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function fetchAdminDashboard(): Promise<AdminDashboardData> {
  const res = await fetch('/api/admin/dashboard')
  const data = await readJson(res)
  if (!res.ok || !data) {
    throw new Error(data?.error ?? `대시보드를 불러오지 못했습니다. (HTTP ${res.status})`)
  }
  return data as AdminDashboardData
}
