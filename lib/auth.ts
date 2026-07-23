import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'

export interface SessionUser {
  userId: string
  username: string
  role: 'user' | 'admin'
}

if (!process.env.JWT_SECRET) {
  console.warn('[SECURITY] JWT_SECRET is not set. Using insecure default — do NOT use in production.')
}
const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-change-in-production'
)

export async function signToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret)
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return payload as unknown as SessionUser
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return null
  return verifyToken(token)
}

// Legacy SHA-256 — kept only for migrating existing passwords to bcrypt
export function hashPasswordLegacy(password: string, salt: string): string {
  return crypto.createHash('sha256').update(password + salt).digest('hex')
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex')
}

const BCRYPT_ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
