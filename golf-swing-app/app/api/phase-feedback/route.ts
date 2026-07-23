import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getPhaseFeedbackStats, recordPhaseFeedback } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = getSessionUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }
  try {
    const stats = await getPhaseFeedbackStats()
    return NextResponse.json({ stats })
  } catch (err) {
    return NextResponse.json({ error: errorDetail(err, '피드백 통계를 불러오지 못했습니다.') }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const user = getSessionUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }
  try {
    const { phaseKey, accurate } = await req.json()
    if (typeof phaseKey !== 'string' || !phaseKey.trim() || typeof accurate !== 'boolean') {
      return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
    }

    const stats = await recordPhaseFeedback(phaseKey, accurate)
    return NextResponse.json({ stats })
  } catch (err) {
    return NextResponse.json({ error: errorDetail(err, '피드백을 저장하지 못했습니다.') }, { status: 500 })
  }
}

function errorDetail(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : String(err)
  return `${fallback} (${message})`
}
