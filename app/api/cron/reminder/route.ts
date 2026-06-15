import { NextRequest, NextResponse } from 'next/server'
import {
  getUsersDueForReminder,
  markReminderSent,
  getBuddyInfo,
} from '@/lib/db'
import { getReminderMessage, getBuddyReminderMessage } from '@/lib/reminderMessages'
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
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { time, date } = getKstTime()
  const appUrl = `${getAppUrl()}/`
  const users = await getUsersDueForReminder(time, date)

  let sent = 0
  for (const user of users) {
    const text = getReminderMessage(user.tone)

    const result = await sendKakaoReminder(user.id, appUrl, text)
    if (result.ok) sent++
    else console.error(`Kakao reminder failed for user ${user.id}: ${result.error}`)

    const buddy = await getBuddyInfo(user.id)
    if (buddy?.kakaoConnected) {
      const buddyText = getBuddyReminderMessage(user.username)
      const buddyResult = await sendKakaoReminder(buddy.userId, appUrl, buddyText)
      if (!buddyResult.ok) console.error(`Kakao buddy reminder failed for user ${buddy.userId}: ${buddyResult.error}`)
    }

    await markReminderSent(user.id, date)
  }

  return NextResponse.json({ ok: true, time, date, checked: users.length, sent })
}
