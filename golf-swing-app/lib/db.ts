import { getStore } from '@netlify/blobs'
import { AnalysisLocation, ClubSelection, SavedAnalysis, SwingAnalysisResult } from './types'

const STORE_NAME = 'swing-analyses'
const MAX_ENTRIES = 500

function getHistoryStore() {
  return getStore(STORE_NAME)
}

const HISTORY_KEY_PREFIX = 'history:'

function historyKey(userId: string): string {
  return `${HISTORY_KEY_PREFIX}${userId}`
}

async function readHistory(userId: string): Promise<SavedAnalysis[]> {
  const store = getHistoryStore()
  const data = await store.get(historyKey(userId), { type: 'json' })
  return Array.isArray(data) ? (data as SavedAnalysis[]) : []
}

async function writeHistory(userId: string, entries: SavedAnalysis[]): Promise<void> {
  const store = getHistoryStore()
  await store.setJSON(historyKey(userId), entries)
}

export async function listAnalyses(userId: string): Promise<SavedAnalysis[]> {
  return readHistory(userId)
}

export async function insertAnalysis(
  userId: string,
  club: ClubSelection,
  result: SwingAnalysisResult,
  location?: AnalysisLocation,
): Promise<SavedAnalysis> {
  const now = new Date()
  const id = `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const entry: SavedAnalysis = { id, date: dateKey, createdAt: now.toISOString(), club, result, ...(location ? { location } : {}) }

  const entries = await readHistory(userId)
  entries.unshift(entry)
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES
  await writeHistory(userId, entries)
  return entry
}

export async function deleteAnalysisById(userId: string, id: string): Promise<void> {
  const entries = await readHistory(userId)
  const filtered = entries.filter((e) => e.id !== id)
  if (filtered.length !== entries.length) {
    await writeHistory(userId, filtered)
  }
}

export interface ScoreStats {
  average: number | null
  count: number
}

/** Aggregates the swing score average across every user's saved analyses. */
export async function getGlobalScoreStats(): Promise<ScoreStats> {
  const store = getHistoryStore()
  const { blobs } = await store.list({ prefix: HISTORY_KEY_PREFIX })

  let total = 0
  let count = 0
  for (const blob of blobs) {
    const data = await store.get(blob.key, { type: 'json' })
    if (Array.isArray(data)) {
      for (const entry of data as SavedAnalysis[]) {
        total += entry.result.score
        count += 1
      }
    }
  }

  return { average: count > 0 ? total / count : null, count }
}

/** Aggregates the swing score average across every user's saved analyses recorded in the given region. */
export async function getRegionalScoreStats(region: string): Promise<ScoreStats> {
  const store = getHistoryStore()
  const { blobs } = await store.list({ prefix: HISTORY_KEY_PREFIX })

  let total = 0
  let count = 0
  for (const blob of blobs) {
    const data = await store.get(blob.key, { type: 'json' })
    if (Array.isArray(data)) {
      for (const entry of data as SavedAnalysis[]) {
        if (entry.location?.region === region) {
          total += entry.result.score
          count += 1
        }
      }
    }
  }

  return { average: count > 0 ? total / count : null, count }
}

const PHASE_FEEDBACK_STORE = 'swing-phase-feedback'
const PHASE_FEEDBACK_KEY = 'global-stats'

export interface PhaseFeedbackTally {
  correct: number
  incorrect: number
}

export type PhaseFeedbackStats = Record<string, PhaseFeedbackTally>

function getPhaseFeedbackStore() {
  return getStore(PHASE_FEEDBACK_STORE)
}

/** Reads the site-wide tally of "정확"/"부정확" votes per swing phase. */
export async function getPhaseFeedbackStats(): Promise<PhaseFeedbackStats> {
  const store = getPhaseFeedbackStore()
  const data = await store.get(PHASE_FEEDBACK_KEY, { type: 'json' })
  return data && typeof data === 'object' ? (data as PhaseFeedbackStats) : {}
}

/** Records a single accuracy vote for `phaseKey` into the site-wide tally. */
export async function recordPhaseFeedback(phaseKey: string, accurate: boolean): Promise<PhaseFeedbackStats> {
  const store = getPhaseFeedbackStore()
  const stats = await getPhaseFeedbackStats()
  const tally = stats[phaseKey] ?? { correct: 0, incorrect: 0 }
  if (accurate) tally.correct += 1
  else tally.incorrect += 1
  stats[phaseKey] = tally
  await store.setJSON(PHASE_FEEDBACK_KEY, stats)
  return stats
}
