import { NextRequest, NextResponse } from 'next/server'
import { verifyUser } from '@/lib/db'
import { signToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()
    if (!username || !password) {
      return NextResponse.json({ error: '아이디와 비밀번호를 입력하세요' }, { status: 400 })
    }

    const user = await verifyUser(username.trim(), password)
    if (!user) {
      return NextResponse.json({ error: '아이디 또는 비밀번호가 틀렸어요' }, { status: 401 })
    }

    const token = await signToken(user)
    const res = NextResponse.json({ ok: true, user: { userId: user.userId, username: user.username, role: user.role } })
    res.cookies.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })
    return res
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: '로그인 중 오류가 발생했어요' }, { status: 500 })
  }
}
