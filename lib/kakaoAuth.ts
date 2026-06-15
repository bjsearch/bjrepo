const KAKAO_AUTHORIZE_URL = 'https://kauth.kakao.com/oauth/authorize'
const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token'
const KAKAO_MEMO_URL = 'https://kapi.kakao.com/v2/api/talk/memo/default/send'
const KAKAO_UNLINK_URL = 'https://kapi.kakao.com/v1/user/unlink'

export interface KakaoTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface KakaoRefreshedTokens {
  accessToken: string
  expiresIn: number
  refreshToken?: string
}

export function getKakaoAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.KAKAO_REST_API_KEY || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'talk_message',
    state,
  })
  return `${KAKAO_AUTHORIZE_URL}?${params.toString()}`
}

function tokenRequestParams(extra: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams({
    client_id: process.env.KAKAO_REST_API_KEY || '',
    ...extra,
  })
  if (process.env.KAKAO_CLIENT_SECRET) {
    params.set('client_secret', process.env.KAKAO_CLIENT_SECRET)
  }
  return params
}

export async function exchangeKakaoCode(code: string, redirectUri: string): Promise<KakaoTokens> {
  const params = tokenRequestParams({
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  })

  const res = await fetch(KAKAO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!res.ok) throw new Error(`Kakao token exchange failed: ${await res.text()}`)
  const data = await res.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}

export async function refreshKakaoToken(refreshToken: string): Promise<KakaoRefreshedTokens> {
  const params = tokenRequestParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })

  const res = await fetch(KAKAO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!res.ok) throw new Error(`Kakao token refresh failed: ${await res.text()}`)
  const data = await res.json()
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    refreshToken: data.refresh_token,
  }
}

export interface KakaoMemoResult {
  ok: boolean
  error?: string
}

export async function sendKakaoMemo(accessToken: string, text: string, linkUrl: string): Promise<KakaoMemoResult> {
  const templateObject = {
    object_type: 'text',
    text: `${text}\n\n${linkUrl}`,
    link: { web_url: linkUrl, mobile_web_url: linkUrl },
    button_title: '일기 쓰러 가기',
  }

  const res = await fetch(KAKAO_MEMO_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ template_object: JSON.stringify(templateObject) }).toString(),
  })

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    return { ok: false, error: data?.msg || `HTTP ${res.status}` }
  }
  if (data && typeof data.result_code === 'number' && data.result_code !== 0) {
    return { ok: false, error: data.msg || `result_code ${data.result_code}` }
  }
  return { ok: true }
}

export async function unlinkKakao(accessToken: string): Promise<void> {
  await fetch(KAKAO_UNLINK_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}
