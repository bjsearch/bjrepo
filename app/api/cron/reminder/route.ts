import { NextRequest, NextResponse } from 'next/server'
import {
  getUsersDueForReminder,
  markReminderSent,
  getMissedDays,
} from '@/lib/db'
import { getReminderMessage } from '@/lib/reminderMessages'
import { getAppUrl } from '@/lib/appUrl'
import { sendKakaoReminder } from '@/lib/sendReminder'

export const dynamic = 'force-dynamic'

function getKstTime() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000) // UTC+9
  const hours = kst.getUTCHours()
  const roundedMinutes = Math.floor(kst.getUTCMinutes() / 15) * 15
  const time = `${String(hours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`
  const date = kst.toISOString().slice(0, 10)
  return { time, date }
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { time, date } = getKstTime()
  const appUrl = `${getAppUrl()}/`
  const users = await getUsersDueForReminder(time, date)

  let sent = 0
  for (const user of users) {
    const missed = await getMissedDays(user.id)
    const text = getReminderMessage(user.tone, missed)

    const result = await sendKakaoReminder(user.id, appUrl, text)
    if (result.ok) sent++
    else console.error(`Kakao reminder failed for user ${user.id}: ${result.error}`)

    await markReminderSent(user.id, date)
  }

  return NextResponse.json({ ok: true, time, date, checked: users.length, sent })
}
