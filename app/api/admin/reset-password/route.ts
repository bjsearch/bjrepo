import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { username, hash } = await req.json()
  if (!username || !hash) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  await sql`UPDATE users SET password_hash = ${hash}, salt = 'bcrypt' WHERE username = ${username}`
  return NextResponse.json({ ok: true })
}
