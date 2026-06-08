import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getGlobalScoreStats } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = getSessionUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }
  try {
    const stats = await getGlobalScoreStats()
    return NextResponse.json(stats)
  } catch (err) {
    console.error('global stats error', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `통계를 불러오지 못했습니다. (${message})` }, { status: 500 })
  }
}
