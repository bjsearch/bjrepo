import { NextResponse } from 'next/server'
import { createSessionToken, verifyUser, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const email = typeof body?.email === 'string' ? body.email.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!email || !password) {
      return NextResponse.json({ error: '이메일과 비밀번호를 입력해주세요.' }, { status: 400 })
    }

    const user = await verifyUser(email, password)
    if (!user) {
      return NextResponse.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
    }

    const token = createSessionToken({ id: user.id, email: user.email })
    const res = NextResponse.json({ user: { id: user.id, email: user.email } })
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    })
    return res
  } catch (err) {
    console.error('login error', err)
    return NextResponse.json({ error: '로그인에 실패했습니다.' }, { status: 500 })
  }
}
