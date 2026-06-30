import { NextResponse } from 'next/server'
import { countUsers, getSessionUser } from '@/lib/auth'
import { getAdminDashboardStats, getPhaseFeedbackStats } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = getSessionUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }
  if (!user.isAdmin) {
    return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 })
  }

  try {
    const totalUsers = await countUsers()
    const [stats, phaseFeedback] = await Promise.all([getAdminDashboardStats(totalUsers), getPhaseFeedbackStats()])
    return NextResponse.json({ ...stats, phaseFeedback })
  } catch (err) {
    console.error('admin dashboard error', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `대시보드를 불러오지 못했습니다. (${message})` }, { status: 500 })
  }
}
