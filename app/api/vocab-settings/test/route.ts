import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getVocabSettings } from '@/lib/db'
import { getAppUrl } from '@/lib/appUrl'
import { sendVocabToUser } from '@/lib/sendVocab'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await getVocabSettings(session.userId)
  if (!settings?.kakaoConnected) {
    return NextResponse.json({ error: '카카오톡이 연동되어 있지 않아요' }, { status: 400 })
  }

  const appUrl = `${getAppUrl()}/`
  const result = await sendVocabToUser(session.userId, settings.level, appUrl)

  if (!result.ok) {
    return NextResponse.json({ error: result.error || '전송에 실패했어요' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
