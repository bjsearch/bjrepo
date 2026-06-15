import { NextRequest, NextResponse } from 'next/server'
import { getUsersDueForReminder, getPushSubscriptions, markReminderSent, removePushSubscription } from '@/lib/db'
import { sendPushNotification } from '@/lib/push'

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
  const users = await getUsersDueForReminder(time, date)

  let sent = 0
  for (const user of users) {
    const subs = await getPushSubscriptions(user.id)
    for (const sub of subs) {
      try {
        await sendPushNotification(sub, {
          title: '영어 일기 작성 알림',
          body: '어제의 기억을 정리할 시간입니다!',
          url: '/',
        })
        sent++
      } catch (error) {
        const statusCode = (error as { statusCode?: number })?.statusCode
        if (statusCode === 404 || statusCode === 410) {
          await removePushSubscription(sub.endpoint)
        }
      }
    }
    await markReminderSent(user.id, date)
  }

  return NextResponse.json({ ok: true, time, date, checked: users.length, sent })
}
