import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { deleteAnalysisById } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = getSessionUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }
  try {
    if (!params.id) {
      return NextResponse.json({ error: '삭제할 기록 ID가 필요합니다.' }, { status: 400 })
    }
    await deleteAnalysisById(user.id, params.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('delete history error', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `기록을 삭제하지 못했습니다. (${message})` }, { status: 500 })
  }
}
