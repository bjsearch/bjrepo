import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { username, hash } = await req.json()
  if (!username || !hash) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  await sql`UPDATE users SET password_hash = ${hash}, salt = 'bcrypt' WHERE username = ${username}`
  return NextResponse.json({ ok: true })
}
