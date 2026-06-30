import { NextResponse } from 'next/server'
import { createSessionToken, createUser, isAdminEmail, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const email = typeof body?.email === 'string' ? body.email.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: '올바른 이메일 주소를 입력해주세요.' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 })
    }

    const user = await createUser(email, password)
    const token = createSessionToken({ id: user.id, email: user.email })

    const res = NextResponse.json({ user: { id: user.id, email: user.email, isAdmin: isAdminEmail(user.email) } }, { status: 201 })
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    })
    return res
  } catch (err) {
    console.error('signup error', err)
    const message = err instanceof Error ? err.message : '회원가입에 실패했습니다.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
