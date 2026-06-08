import { getStore } from '@netlify/blobs'
import { ClubSelection, SavedAnalysis, SwingAnalysisResult } from './types'

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
): Promise<SavedAnalysis> {
  const now = new Date()
  const id = `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const entry: SavedAnalysis = { id, date: dateKey, createdAt: now.toISOString(), club, result }

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
