import { NextResponse } from 'next/server'
import { insertAnalysis, listAnalyses } from '@/lib/db'
import type { ClubCategory } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const entries = await listAnalyses()
    return NextResponse.json({ entries })
  } catch (err) {
    console.error('list history error', err)
    return NextResponse.json({ error: errorDetail(err, '분석 기록을 불러오지 못했습니다.') }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const club = body?.club
    const result = body?.result

    if (!isValidClub(club)) {
      return NextResponse.json({ error: '클럽 정보가 올바르지 않습니다.' }, { status: 400 })
    }
    if (!result || typeof result !== 'object') {
      return NextResponse.json({ error: '분석 결과가 올바르지 않습니다.' }, { status: 400 })
    }

    const entry = await insertAnalysis(club, result)
    return NextResponse.json({ entry }, { status: 201 })
  } catch (err) {
    console.error('save history error', err)
    return NextResponse.json({ error: errorDetail(err, '분석 결과를 저장하지 못했습니다.') }, { status: 500 })
  }
}

function isValidClub(club: any): club is { category: ClubCategory; number: number | null } {
  return (
    club &&
    typeof club === 'object' &&
    ['driver', 'iron', 'wedge'].includes(club.category) &&
    (club.number === null || typeof club.number === 'number')
  )
}

function errorDetail(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : String(err)
  return `${fallback} (${message})`
}
