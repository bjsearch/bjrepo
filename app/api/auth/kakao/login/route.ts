import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getSession } from '@/lib/auth'
import { getKakaoAuthorizeUrl } from '@/lib/kakaoAuth'
import { getAppUrl } from '@/lib/appUrl'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.redirect(new URL('/', req.url))

  const redirectUri = `${getAppUrl(req)}/api/auth/kakao/callback`
  const state = crypto.randomBytes(16).toString('hex')

  const res = NextResponse.redirect(getKakaoAuthorizeUrl(redirectUri, state))
  res.cookies.set('kakao_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300,
    path: '/',
  })
  return res
}
