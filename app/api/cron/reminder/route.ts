import { NextRequest, NextResponse } from 'next/server'
import {
  getUsersDueForReminder,
  getPushSubscriptions,
  markReminderSent,
  removePushSubscription,
  getKakaoTokens,
  updateKakaoAccessToken,
  disconnectKakao,
} from '@/lib/db'
import { sendPushNotification } from '@/lib/push'
import { sendKakaoMemo, refreshKakaoToken } from '@/lib/kakaoAuth'

export const dynamic = 'force-dynamic'

const REMINDER_TEXT = '어제의 기억을 정리할 시간입니다!'

function getKstTime() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000) // UTC+9
  const hours = kst.getUTCHours()
  const roundedMinutes = Math.floor(kst.getUTCMinutes() / 15) * 15
  const time = `${String(hours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`
  const date = kst.toISOString().slice(0, 10)
  return { time, date }
}

async function sendKakaoReminder(userId: string, appUrl: string): Promise<boolean> {
  const tokens = await getKakaoTokens(userId)
  if (!tokens) return false

  let accessToken = tokens.accessToken
  if (new Date(tokens.expiresAt).getTime() < Date.now() + 60_000) {
    try {
      const refreshed = await refreshKakaoToken(tokens.refreshToken)
      accessToken = refreshed.accessToken
      await updateKakaoAccessToken(userId, refreshed.accessToken, refreshed.expiresIn, refreshed.refreshToken)
    } catch (err) {
      console.error('Kakao token refresh failed:', err)
      await disconnectKakao(userId)
      return false
    }
  }

  try {
    return await sendKakaoMemo(accessToken, REMINDER_TEXT, appUrl)
  } catch (err) {
    console.error('Kakao memo send failed:', err)
    return false
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { time, date } = getKstTime()
  const appUrl = new URL('/', req.url).toString()
  const users = await getUsersDueForReminder(time, date)

  let sent = 0
  for (const user of users) {
    const subs = await getPushSubscriptions(user.id)
    for (const sub of subs) {
      try {
        await sendPushNotification(sub, {
          title: '영어 일기 작성 알림',
          body: REMINDER_TEXT,
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

    if (await sendKakaoReminder(user.id, appUrl)) sent++

    await markReminderSent(user.id, date)
  }

  return NextResponse.json({ ok: true, time, date, checked: users.length, sent })
}
