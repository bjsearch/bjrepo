import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getKakaoTokens, disconnectKakao } from '@/lib/db'
import { unlinkKakao } from '@/lib/kakaoAuth'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tokens = await getKakaoTokens(session.userId)
  if (tokens) {
    try {
      await unlinkKakao(tokens.accessToken)
    } catch (err) {
      console.error('Kakao unlink error:', err)
    }
  }
  await disconnectKakao(session.userId)
  return NextResponse.json({ ok: true })
}
