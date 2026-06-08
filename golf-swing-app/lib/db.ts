import { getStore } from '@netlify/blobs'
import { ClubSelection, SavedAnalysis, SwingAnalysisResult } from './types'

const STORE_NAME = 'swing-analyses'
const HISTORY_KEY = 'history'
const MAX_ENTRIES = 500

function getHistoryStore() {
  return getStore(STORE_NAME)
}

async function readHistory(): Promise<SavedAnalysis[]> {
  const store = getHistoryStore()
  const data = await store.get(HISTORY_KEY, { type: 'json' })
  return Array.isArray(data) ? (data as SavedAnalysis[]) : []
}

async function writeHistory(entries: SavedAnalysis[]): Promise<void> {
  const store = getHistoryStore()
  await store.setJSON(HISTORY_KEY, entries)
}

export async function listAnalyses(): Promise<SavedAnalysis[]> {
  return readHistory()
}

export async function insertAnalysis(club: ClubSelection, result: SwingAnalysisResult): Promise<SavedAnalysis> {
  const now = new Date()
  const id = `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const entry: SavedAnalysis = { id, date: dateKey, createdAt: now.toISOString(), club, result }

  const entries = await readHistory()
  entries.unshift(entry)
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES
  await writeHistory(entries)
  return entry
}

export async function deleteAnalysisById(id: string): Promise<void> {
  const entries = await readHistory()
  const filtered = entries.filter((e) => e.id !== id)
  if (filtered.length !== entries.length) {
    await writeHistory(filtered)
  }
}
