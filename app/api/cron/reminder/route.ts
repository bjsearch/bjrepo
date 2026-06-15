import { NextRequest, NextResponse } from 'next/server'
import {
  getUsersDueForReminder,
  markReminderSent,
  getKakaoTokens,
  updateKakaoAccessToken,
  disconnectKakao,
} from '@/lib/db'
import { sendKakaoMemo, refreshKakaoToken } from '@/lib/kakaoAuth'
import { getReminderMessage } from '@/lib/reminderMessages'
import { getAppUrl } from '@/lib/appUrl'

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

async function sendKakaoReminder(userId: string, appUrl: string, text: string): Promise<boolean> {
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
    return await sendKakaoMemo(accessToken, text, appUrl)
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
  const appUrl = `${getAppUrl(req)}/`
  const users = await getUsersDueForReminder(time, date)

  let sent = 0
  for (const user of users) {
    const text = getReminderMessage(user.tone)

    if (await sendKakaoReminder(user.id, appUrl, text)) sent++

    await markReminderSent(user.id, date)
  }

  return NextResponse.json({ ok: true, time, date, checked: users.length, sent })
}
