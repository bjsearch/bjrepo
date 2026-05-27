import { sql } from '@vercel/postgres'
import { DiaryEntry } from './types'

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS diary_entries (
      id          TEXT PRIMARY KEY,
      date        TEXT NOT NULL,
      content     TEXT NOT NULL DEFAULT '',
      analysis    JSONB,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    )
  `
}

export async function getAllEntries(): Promise<DiaryEntry[]> {
  await ensureTable()
  const { rows } = await sql`SELECT * FROM diary_entries ORDER BY date DESC, created_at DESC`
  return rows.map(rowToEntry)
}

export async function upsertEntry(entry: DiaryEntry): Promise<void> {
  await ensureTable()
  const analysis = entry.analysis ? JSON.stringify(entry.analysis) : null
  await sql`
    INSERT INTO diary_entries (id, date, content, analysis, created_at, updated_at)
    VALUES (${entry.id}, ${entry.date}, ${entry.content}, ${analysis}::jsonb, ${entry.createdAt}, ${entry.updatedAt})
    ON CONFLICT (id) DO UPDATE SET
      content    = EXCLUDED.content,
      analysis   = EXCLUDED.analysis,
      updated_at = EXCLUDED.updated_at
  `
}

function rowToEntry(row: Record<string, unknown>): DiaryEntry {
  return {
    id:        row.id as string,
    date:      row.date as string,
    content:   row.content as string,
    analysis:  (row.analysis as DiaryEntry['analysis']) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}
