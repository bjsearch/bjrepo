import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getVocabSettings, setVocabSettings } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await getVocabSettings(session.userId)
  return NextResponse.json(settings)
}

const VALID_LEVELS = new Set(['beginner', 'intermediate', 'advanced'])
const TIME_RE = /^\d{2}:\d{2}$/

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { enabled, times, level } = await req.json()

  if (
    typeof enabled !== 'boolean' ||
    !Array.isArray(times) ||
    times.length < 1 ||
    times.length > 5 ||
    !times.every((t: unknown) => typeof t === 'string' && TIME_RE.test(t)) ||
    !VALID_LEVELS.has(level)
  ) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  await setVocabSettings(session.userId, enabled, times, level)
  return NextResponse.json({ ok: true })
}
