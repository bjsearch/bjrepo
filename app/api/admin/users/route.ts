import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAllUsers, getAllEntries, getUsageStats, getRecentLogins } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  if (userId) {
    const entries = await getAllEntries(userId)
    return NextResponse.json(entries)
  }

  const [users, stats, recentLogins] = await Promise.all([
    getAllUsers(),
    getUsageStats(),
    getRecentLogins(20),
  ])
  return NextResponse.json({ users, stats, recentLogins })
}
