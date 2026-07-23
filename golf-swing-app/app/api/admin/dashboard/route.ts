import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ error: '대시보드가 준비 중입니다.' }, { status: 503 })
}
