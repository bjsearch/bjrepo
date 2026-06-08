import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'crypto'
import { cookies } from 'next/headers'
import { getStore } from '@netlify/blobs'

export interface UserRecord {
  id: string
  email: string
  passwordHash: string
  salt: string
  createdAt: string
}

export interface SessionUser {
  id: string
  email: string
}

const USERS_STORE = 'swing-users'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export const SESSION_COOKIE_NAME = 'swing_session'
export const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_TTL_MS / 1000)

function getUsersStore() {
  return getStore(USERS_STORE)
}

function userKey(email: string): string {
  return `user:${email.trim().toLowerCase()}`
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('서버에 SESSION_SECRET이 설정되어 있지 않습니다.')
  return secret
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex')
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const store = getUsersStore()
  const data = await store.get(userKey(email), { type: 'json' })
  return (data as UserRecord) ?? null
}

export async function createUser(email: string, password: string): Promise<UserRecord> {
  const normalized = email.trim().toLowerCase()
  const existing = await findUserByEmail(normalized)
  if (existing) throw new Error('이미 가입된 이메일입니다.')

  const salt = randomBytes(16).toString('hex')
  const user: UserRecord = {
    id: `${Date.now()}-${randomBytes(4).toString('hex')}`,
    email: normalized,
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: new Date().toISOString(),
  }
  await getUsersStore().setJSON(userKey(normalized), user)
  return user
}

export async function verifyUser(email: string, password: string): Promise<UserRecord | null> {
  const user = await findUserByEmail(email)
  if (!user) return null
  const candidate = Buffer.from(hashPassword(password, user.salt), 'hex')
  const stored = Buffer.from(user.passwordHash, 'hex')
  if (candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) return null
  return user
}

function sign(payload: string): string {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('base64url')
}

export function createSessionToken(user: SessionUser): string {
  const payload = Buffer.from(
    JSON.stringify({ id: user.id, email: user.email, exp: Date.now() + SESSION_TTL_MS }),
  ).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function verifySessionToken(token: string | undefined | null): SessionUser | null {
  if (!token) return null
  const [payload, signature] = token.split('.')
  if (!payload || !signature || sign(payload) !== signature) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null
    if (typeof data.id !== 'string' || typeof data.email !== 'string') return null
    return { id: data.id, email: data.email }
  } catch {
    return null
  }
}

/** Reads and verifies the session cookie for the current request (Route Handlers / Server Components). */
export function getSessionUser(): SessionUser | null {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value
  return verifySessionToken(token)
}
