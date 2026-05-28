import { sql } from '@vercel/postgres'
import { DiaryEntry } from './types'
import { hashPassword, generateSalt } from './auth'

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS diary_entries (
      id          TEXT PRIMARY KEY,
      date        TEXT NOT NULL,
      content     TEXT NOT NULL DEFAULT '',
      analysis    JSONB,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      user_id     TEXT
    )
  `
  // Migration: add user_id if not exists
  await sql`ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS user_id TEXT`
}

async function ensureUsersTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      username     TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt         TEXT NOT NULL,
      role         TEXT NOT NULL DEFAULT 'user',
      created_at   TEXT NOT NULL
    )
  `
  // Create default admin if none exists
  const { rows } = await sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`
  if (rows.length === 0) {
    const salt = generateSalt()
    const hash = hashPassword('admin123', salt)
    await sql`
      INSERT INTO users (id, username, password_hash, salt, role, created_at)
      VALUES ('admin', 'admin', ${hash}, ${salt}, 'admin', ${new Date().toISOString()})
      ON CONFLICT (username) DO NOTHING
    `
  }
}

export async function getAllEntries(userId: string): Promise<DiaryEntry[]> {
  await ensureTable()
  const { rows } = await sql`
    SELECT * FROM diary_entries WHERE user_id = ${userId}
    ORDER BY date DESC, created_at DESC
  `
  return rows.map(rowToEntry)
}

export async function getAllEntriesForAdmin(): Promise<DiaryEntry[]> {
  await ensureTable()
  const { rows } = await sql`SELECT * FROM diary_entries ORDER BY date DESC, created_at DESC`
  return rows.map(rowToEntry)
}

export async function upsertEntry(entry: DiaryEntry): Promise<void> {
  await ensureTable()
  const analysis = entry.analysis ? JSON.stringify(entry.analysis) : null
  await sql`
    INSERT INTO diary_entries (id, date, content, analysis, created_at, updated_at, user_id)
    VALUES (${entry.id}, ${entry.date}, ${entry.content}, ${analysis}::jsonb, ${entry.createdAt}, ${entry.updatedAt}, ${entry.userId ?? null})
    ON CONFLICT (id) DO UPDATE SET
      content    = EXCLUDED.content,
      analysis   = EXCLUDED.analysis,
      updated_at = EXCLUDED.updated_at
  `
}

export async function deleteEntry(id: string): Promise<void> {
  await ensureTable()
  await sql`DELETE FROM diary_entries WHERE id = ${id}`
}

// --- User functions ---

export async function createUser(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
  await ensureUsersTable()
  const existing = await sql`SELECT id FROM users WHERE username = ${username}`
  if (existing.rows.length > 0) return { ok: false, error: '이미 사용 중인 아이디예요' }

  const salt = generateSalt()
  const hash = hashPassword(password, salt)
  const id = Date.now().toString()
  await sql`
    INSERT INTO users (id, username, password_hash, salt, role, created_at)
    VALUES (${id}, ${username}, ${hash}, ${salt}, 'user', ${new Date().toISOString()})
  `
  return { ok: true }
}

export async function verifyUser(username: string, password: string) {
  await ensureUsersTable()
  const { rows } = await sql`SELECT * FROM users WHERE username = ${username}`
  if (rows.length === 0) return null
  const user = rows[0]
  const hash = hashPassword(password, user.salt)
  if (hash !== user.password_hash) return null
  return { userId: user.id as string, username: user.username as string, role: user.role as 'user' | 'admin' }
}

export async function getAllUsers() {
  await ensureUsersTable()
  const { rows } = await sql`
    SELECT u.id, u.username, u.role, u.created_at,
           COUNT(e.id)::int AS entry_count
    FROM users u
    LEFT JOIN diary_entries e ON e.user_id = u.id AND e.content != ''
    GROUP BY u.id, u.username, u.role, u.created_at
    ORDER BY u.created_at ASC
  `
  return rows.map(r => ({
    id: r.id as string,
    username: r.username as string,
    role: r.role as 'user' | 'admin',
    createdAt: r.created_at as string,
    entryCount: r.entry_count as number,
  }))
}

function rowToEntry(row: Record<string, unknown>): DiaryEntry {
  return {
    id:        row.id as string,
    date:      row.date as string,
    content:   row.content as string,
    analysis:  (row.analysis as DiaryEntry['analysis']) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    userId:    row.user_id as string | undefined,
  }
}
