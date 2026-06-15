import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getReminderSettings } from '@/lib/db'
import { getReminderMessage } from '@/lib/reminderMessages'
import { getAppUrl } from '@/lib/appUrl'
import { sendKakaoReminder } from '@/lib/sendReminder'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await getReminderSettings(session.userId)
  if (!settings?.kakaoConnected) {
    return NextResponse.json({ error: '카카오톡이 연동되어 있지 않아요' }, { status: 400 })
  }

  const appUrl = `${getAppUrl()}/`
  const text = getReminderMessage(settings.tone)
  const result = await sendKakaoReminder(session.userId, appUrl, text)

  if (!result.ok) {
    return NextResponse.json({ error: result.error || '카카오톡 전송에 실패했어요' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
