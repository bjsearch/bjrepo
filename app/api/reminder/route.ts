import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getReminderSettings, setReminderSettings } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await getReminderSettings(session.userId)
  return NextResponse.json(settings)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { enabled, time } = await req.json()
  if (typeof enabled !== 'boolean' || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  await setReminderSettings(session.userId, enabled, time)
  return NextResponse.json({ ok: true })
}
