import { sql } from '@vercel/postgres'
import { DiaryEntry, PushSubscriptionJSON } from './types'
import { hashPassword, generateSalt } from './auth'
import { GeoInfo } from './geo'

export const ADMIN_USERNAME = 'psyche8310'

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
  // Migration: track last login info
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TEXT`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip TEXT`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_country TEXT`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_region TEXT`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_city TEXT`

  // Migration: daily diary reminder settings
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_time TEXT NOT NULL DEFAULT '21:00'`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_tone TEXT NOT NULL DEFAULT 'friend'`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_reminder_sent_date TEXT`

  // Migration: Kakao account link for "나에게 보내기" reminders
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS kakao_access_token TEXT`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS kakao_refresh_token TEXT`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS kakao_token_expires_at TEXT`

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

  // Designated admin account: always promote to admin role
  await sql`UPDATE users SET role = 'admin' WHERE username = ${ADMIN_USERNAME} AND role != 'admin'`
}

async function ensureLoginLogsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS login_logs (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      username    TEXT NOT NULL,
      login_at    TEXT NOT NULL,
      ip          TEXT,
      country     TEXT,
      region      TEXT,
      city        TEXT,
      latitude    TEXT,
      longitude   TEXT
    )
  `
}

async function ensurePushSubscriptionsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      endpoint    TEXT UNIQUE NOT NULL,
      p256dh      TEXT NOT NULL,
      auth        TEXT NOT NULL,
      created_at  TEXT NOT NULL
    )
  `
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
  const role = username === ADMIN_USERNAME ? 'admin' : 'user'
  await sql`
    INSERT INTO users (id, username, password_hash, salt, role, created_at)
    VALUES (${id}, ${username}, ${hash}, ${salt}, ${role}, ${new Date().toISOString()})
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
  await ensureTable()
  const { rows } = await sql`
    SELECT u.id, u.username, u.role, u.created_at,
           u.last_login_at, u.last_login_ip, u.last_login_country, u.last_login_region, u.last_login_city,
           u.reminder_enabled, u.reminder_time, u.reminder_tone, u.kakao_access_token,
           COUNT(e.id)::int AS entry_count,
           COUNT(e.analysis)::int AS analyzed_count,
           COALESCE(AVG((e.analysis->>'score')::numeric), 0) AS avg_score
    FROM users u
    LEFT JOIN diary_entries e ON e.user_id = u.id AND e.content != ''
    GROUP BY u.id, u.username, u.role, u.created_at,
             u.last_login_at, u.last_login_ip, u.last_login_country, u.last_login_region, u.last_login_city,
             u.reminder_enabled, u.reminder_time, u.reminder_tone, u.kakao_access_token
    ORDER BY u.created_at ASC
  `
  return rows.map(r => ({
    id: r.id as string,
    username: r.username as string,
    role: r.role as 'user' | 'admin',
    createdAt: r.created_at as string,
    entryCount: r.entry_count as number,
    analyzedCount: r.analyzed_count as number,
    avgScore: Math.round(Number(r.avg_score) * 10) / 10,
    lastLoginAt: (r.last_login_at as string) ?? undefined,
    lastLoginIp: (r.last_login_ip as string) ?? undefined,
    lastLoginCountry: (r.last_login_country as string) ?? undefined,
    lastLoginRegion: (r.last_login_region as string) ?? undefined,
    lastLoginCity: (r.last_login_city as string) ?? undefined,
    reminderEnabled: r.reminder_enabled as boolean,
    reminderTime: r.reminder_time as string,
    reminderTone: r.reminder_tone as string,
    kakaoConnected: !!r.kakao_access_token,
  }))
}

export async function recordLogin(userId: string, username: string, geo: GeoInfo): Promise<void> {
  await ensureUsersTable()
  await ensureLoginLogsTable()
  const now = new Date().toISOString()

  await sql`
    UPDATE users SET
      last_login_at = ${now},
      last_login_ip = ${geo.ip ?? null},
      last_login_country = ${geo.country ?? null},
      last_login_region = ${geo.region ?? null},
      last_login_city = ${geo.city ?? null}
    WHERE id = ${userId}
  `

  await sql`
    INSERT INTO login_logs (id, user_id, username, login_at, ip, country, region, city, latitude, longitude)
    VALUES (${`${userId}-${now}`}, ${userId}, ${username}, ${now}, ${geo.ip ?? null}, ${geo.country ?? null}, ${geo.region ?? null}, ${geo.city ?? null}, ${geo.latitude ?? null}, ${geo.longitude ?? null})
  `
}

export async function getRecentLogins(limit = 20) {
  await ensureLoginLogsTable()
  const { rows } = await sql`
    SELECT * FROM login_logs ORDER BY login_at DESC LIMIT ${limit}
  `
  return rows.map(r => ({
    id: r.id as string,
    userId: r.user_id as string,
    username: r.username as string,
    loginAt: r.login_at as string,
    ip: (r.ip as string) ?? undefined,
    country: (r.country as string) ?? undefined,
    region: (r.region as string) ?? undefined,
    city: (r.city as string) ?? undefined,
    latitude: (r.latitude as string) ?? undefined,
    longitude: (r.longitude as string) ?? undefined,
  }))
}

export async function getUsageStats() {
  await ensureUsersTable()
  await ensureTable()
  const { rows } = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS total_users,
      (SELECT COUNT(*)::int FROM diary_entries WHERE content != '') AS total_entries,
      (SELECT COUNT(*)::int FROM diary_entries WHERE analysis IS NOT NULL) AS analyzed_entries,
      (SELECT COALESCE(AVG((analysis->>'score')::numeric), 0) FROM diary_entries WHERE analysis IS NOT NULL) AS avg_score
  `
  const r = rows[0]
  return {
    totalUsers: r.total_users as number,
    totalEntries: r.total_entries as number,
    analyzedEntries: r.analyzed_entries as number,
    avgScore: Math.round(Number(r.avg_score) * 10) / 10,
  }
}

// --- Reminder & push subscription functions ---

export async function getReminderSettings(userId: string) {
  await ensureUsersTable()
  const { rows } = await sql`SELECT reminder_enabled, reminder_time, reminder_tone, kakao_access_token FROM users WHERE id = ${userId}`
  if (rows.length === 0) return null
  return {
    enabled: rows[0].reminder_enabled as boolean,
    time: rows[0].reminder_time as string,
    tone: rows[0].reminder_tone as string,
    kakaoConnected: !!rows[0].kakao_access_token,
  }
}

export async function setReminderSettings(userId: string, enabled: boolean, time: string, tone: string): Promise<void> {
  await ensureUsersTable()
  await sql`UPDATE users SET reminder_enabled = ${enabled}, reminder_time = ${time}, reminder_tone = ${tone} WHERE id = ${userId}`
}

export async function savePushSubscription(userId: string, sub: PushSubscriptionJSON): Promise<void> {
  await ensurePushSubscriptionsTable()
  const id = `${userId}-${Buffer.from(sub.endpoint).toString('base64').slice(-32)}`
  await sql`
    INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
    VALUES (${id}, ${userId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth}, ${new Date().toISOString()})
    ON CONFLICT (endpoint) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      p256dh  = EXCLUDED.p256dh,
      auth    = EXCLUDED.auth
  `
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await ensurePushSubscriptionsTable()
  await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`
}

export async function getPushSubscriptions(userId: string) {
  await ensurePushSubscriptionsTable()
  const { rows } = await sql`SELECT * FROM push_subscriptions WHERE user_id = ${userId}`
  return rows.map(r => ({
    endpoint: r.endpoint as string,
    keys: { p256dh: r.p256dh as string, auth: r.auth as string },
  }))
}

export async function getUsersDueForReminder(currentTime: string, today: string) {
  await ensureUsersTable()
  await ensurePushSubscriptionsTable()
  const { rows } = await sql`
    SELECT DISTINCT u.id, u.username, u.reminder_tone
    FROM users u
    LEFT JOIN push_subscriptions p ON p.user_id = u.id
    WHERE u.reminder_enabled = TRUE
      AND u.reminder_time = ${currentTime}
      AND (u.last_reminder_sent_date IS NULL OR u.last_reminder_sent_date != ${today})
      AND (p.id IS NOT NULL OR u.kakao_access_token IS NOT NULL)
  `
  return rows.map(r => ({ id: r.id as string, username: r.username as string, tone: r.reminder_tone as string }))
}

export async function markReminderSent(userId: string, today: string): Promise<void> {
  await sql`UPDATE users SET last_reminder_sent_date = ${today} WHERE id = ${userId}`
}

// --- Kakao account link ---

export async function saveKakaoTokens(userId: string, accessToken: string, refreshToken: string, expiresIn: number): Promise<void> {
  await ensureUsersTable()
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
  await sql`
    UPDATE users SET
      kakao_access_token = ${accessToken},
      kakao_refresh_token = ${refreshToken},
      kakao_token_expires_at = ${expiresAt}
    WHERE id = ${userId}
  `
}

export async function updateKakaoAccessToken(userId: string, accessToken: string, expiresIn: number, refreshToken?: string): Promise<void> {
  await ensureUsersTable()
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
  if (refreshToken) {
    await sql`
      UPDATE users SET kakao_access_token = ${accessToken}, kakao_token_expires_at = ${expiresAt}, kakao_refresh_token = ${refreshToken}
      WHERE id = ${userId}
    `
  } else {
    await sql`
      UPDATE users SET kakao_access_token = ${accessToken}, kakao_token_expires_at = ${expiresAt}
      WHERE id = ${userId}
    `
  }
}

export async function getKakaoTokens(userId: string) {
  await ensureUsersTable()
  const { rows } = await sql`SELECT kakao_access_token, kakao_refresh_token, kakao_token_expires_at FROM users WHERE id = ${userId}`
  if (rows.length === 0 || !rows[0].kakao_access_token) return null
  return {
    accessToken: rows[0].kakao_access_token as string,
    refreshToken: rows[0].kakao_refresh_token as string,
    expiresAt: rows[0].kakao_token_expires_at as string,
  }
}

export async function disconnectKakao(userId: string): Promise<void> {
  await ensureUsersTable()
  await sql`
    UPDATE users SET kakao_access_token = NULL, kakao_refresh_token = NULL, kakao_token_expires_at = NULL
    WHERE id = ${userId}
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
    userId:    row.user_id as string | undefined,
  }
}
