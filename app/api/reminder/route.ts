import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getReminderSettings, setReminderSettings } from '@/lib/db'
import { isValidReminderTone, DEFAULT_REMINDER_TONE } from '@/lib/reminderMessages'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await getReminderSettings(session.userId)
  return NextResponse.json(settings)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { enabled, time, tone } = await req.json()
  if (typeof enabled !== 'boolean' || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  await setReminderSettings(session.userId, enabled, time, isValidReminderTone(tone) ? tone : DEFAULT_REMINDER_TONE)

  return NextResponse.json({ ok: true })
}
