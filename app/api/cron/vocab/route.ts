import { NextRequest, NextResponse } from 'next/server'
import { getUsersDueForVocab, markVocabSent } from '@/lib/db'
import { getAppUrl } from '@/lib/appUrl'
import { sendVocabToUser } from '@/lib/sendVocab'

export const dynamic = 'force-dynamic'

function getKstTime() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
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
  const users = await getUsersDueForVocab(time, date)

  let sent = 0
  for (const user of users) {
    const result = await sendVocabToUser(user.id, user.level, appUrl)
    if (result.ok) {
      sent++
      await markVocabSent(user.id, date, time)
    } else {
      console.error(`Vocab send failed for user ${user.id}: ${result.error}`)
    }
  }

  return NextResponse.json({ ok: true, time, date, checked: users.length, sent })
}
