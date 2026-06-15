import { getKakaoTokens, updateKakaoAccessToken, disconnectKakao } from '@/lib/db'
import { sendKakaoMemo, refreshKakaoToken } from '@/lib/kakaoAuth'

export async function sendKakaoReminder(userId: string, appUrl: string, text: string): Promise<boolean> {
  const tokens = await getKakaoTokens(userId)
  if (!tokens) return false

  let accessToken = tokens.accessToken
  if (new Date(tokens.expiresAt).getTime() < Date.now() + 60_000) {
    try {
      const refreshed = await refreshKakaoToken(tokens.refreshToken)
      accessToken = refreshed.accessToken
      await updateKakaoAccessToken(userId, refreshed.accessToken, refreshed.expiresIn, refreshed.refreshToken)
    } catch (err) {
      console.error('Kakao token refresh failed:', err)
      await disconnectKakao(userId)
      return false
    }
  }

  try {
    return await sendKakaoMemo(accessToken, text, appUrl)
  } catch (err) {
    console.error('Kakao memo send failed:', err)
    return false
  }
}
