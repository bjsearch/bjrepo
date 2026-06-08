import { neon } from '@neondatabase/serverless'
import { ClubSelection, SavedAnalysis, SwingAnalysisResult } from './types'

function getSql() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('서버에 DATABASE_URL이 설정되어 있지 않습니다.')
  }
  return neon(url)
}

let schemaReady: Promise<void> | null = null

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const sql = getSql()
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS swing_analyses (
          id TEXT PRIMARY KEY,
          analysis_date DATE NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          club JSONB NOT NULL,
          result JSONB NOT NULL
        )
      `
      await sql`CREATE INDEX IF NOT EXISTS idx_swing_analyses_date ON swing_analyses (analysis_date)`
    })().catch((err) => {
      schemaReady = null
      throw err
    })
  }
  return schemaReady
}

function rowToSavedAnalysis(row: any): SavedAnalysis {
  const created = new Date(row.created_at)
  return {
    id: row.id,
    date: row.analysis_date instanceof Date
      ? row.analysis_date.toISOString().slice(0, 10)
      : String(row.analysis_date).slice(0, 10),
    createdAt: created.toISOString(),
    club: row.club,
    result: row.result,
  }
}

export async function listAnalyses(): Promise<SavedAnalysis[]> {
  await ensureSchema()
  const sql = getSql()
  const rows = await sql`
    SELECT id, analysis_date, created_at, club, result
    FROM swing_analyses
    ORDER BY created_at DESC
    LIMIT 500
  `
  return rows.map(rowToSavedAnalysis)
}

export async function insertAnalysis(club: ClubSelection, result: SwingAnalysisResult): Promise<SavedAnalysis> {
  await ensureSchema()
  const sql = getSql()
  const now = new Date()
  const id = `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const rows = await sql`
    INSERT INTO swing_analyses (id, analysis_date, created_at, club, result)
    VALUES (${id}, ${dateKey}, ${now.toISOString()}, ${JSON.stringify(club)}::jsonb, ${JSON.stringify(result)}::jsonb)
    RETURNING id, analysis_date, created_at, club, result
  `
  return rowToSavedAnalysis(rows[0])
}

export async function deleteAnalysisById(id: string): Promise<void> {
  await ensureSchema()
  const sql = getSql()
  await sql`DELETE FROM swing_analyses WHERE id = ${id}`
}
