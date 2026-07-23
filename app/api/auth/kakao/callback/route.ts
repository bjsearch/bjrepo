import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { exchangeKakaoCode } from '@/lib/kakaoAuth'
import { saveKakaoTokens } from '@/lib/db'
import { getAppUrl } from '@/lib/appUrl'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.redirect(new URL('/', req.url))

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const savedState = req.cookies.get('kakao_oauth_state')?.value

  const redirectTo = new URL('/', req.url)

  if (error || !code || !state || state !== savedState) {
    redirectTo.searchParams.set('kakao', 'error')
    const res = NextResponse.redirect(redirectTo)
    res.cookies.delete('kakao_oauth_state')
    return res
  }

  try {
    const redirectUri = `${getAppUrl()}/api/auth/kakao/callback`
    const tokens = await exchangeKakaoCode(code, redirectUri)
    await saveKakaoTokens(session.userId, tokens.accessToken, tokens.refreshToken, tokens.expiresIn)
    redirectTo.searchParams.set('kakao', 'connected')
  } catch (err) {
    console.error('Kakao token exchange error:', err)
    redirectTo.searchParams.set('kakao', 'error')
  }

  const res = NextResponse.redirect(redirectTo)
  res.cookies.delete('kakao_oauth_state')
  return res
}
