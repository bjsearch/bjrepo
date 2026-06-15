import { NextRequest, NextResponse } from 'next/server'
import { createUser, verifyUser, recordLogin } from '@/lib/db'
import { signToken } from '@/lib/auth'
import { getGeoFromRequest } from '@/lib/geo'

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()
    if (!username || !password) {
      return NextResponse.json({ error: '아이디와 비밀번호를 입력하세요' }, { status: 400 })
    }
    if (username.length < 2 || username.length > 20) {
      return NextResponse.json({ error: '아이디는 2~20자로 입력하세요' }, { status: 400 })
    }
    if (password.length < 4) {
      return NextResponse.json({ error: '비밀번호는 4자 이상 입력하세요' }, { status: 400 })
    }

    const result = await createUser(username.trim(), password)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 })
    }

    const user = await verifyUser(username.trim(), password)
    if (!user) throw new Error('User created but could not log in')

    await recordLogin(user.userId, user.username, getGeoFromRequest(req))

    const token = await signToken(user)
    const res = NextResponse.json({ ok: true, user: { userId: user.userId, username: user.username, role: user.role } })
    res.cookies.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })
    return res
  } catch (error) {
    console.error('Register error:', error)
    return NextResponse.json({ error: '회원가입 중 오류가 발생했어요' }, { status: 500 })
  }
}
