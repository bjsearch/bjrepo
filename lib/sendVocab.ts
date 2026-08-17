import { getKakaoTokens, updateKakaoAccessToken, disconnectKakao } from '@/lib/db'
import { sendKakaoVocabMemo, refreshKakaoToken } from '@/lib/kakaoAuth'
import { generateDailyVocab, formatVocabMessage } from '@/lib/generateVocab'

export interface SendVocabResult {
  ok: boolean
  error?: string
}

export async function sendVocabToUser(userId: string, level: string, appUrl: string): Promise<SendVocabResult> {
  const tokens = await getKakaoTokens(userId)
  if (!tokens) return { ok: false, error: '카카오톡이 연동되어 있지 않아요' }

  let accessToken = tokens.accessToken
  if (new Date(tokens.expiresAt).getTime() < Date.now() + 60_000) {
    try {
      const refreshed = await refreshKakaoToken(tokens.refreshToken)
      accessToken = refreshed.accessToken
      await updateKakaoAccessToken(userId, refreshed.accessToken, refreshed.expiresIn, refreshed.refreshToken)
    } catch (err) {
      console.error('Kakao token refresh failed:', err)
      await disconnectKakao(userId)
      return { ok: false, error: '카카오 토큰 갱신에 실패해 연동이 해제되었어요. 다시 연동해주세요' }
    }
  }

  try {
    const vocab = await generateDailyVocab(level)
    const { title, description } = formatVocabMessage(vocab)
    return await sendKakaoVocabMemo(accessToken, title, description, appUrl)
  } catch (err) {
    console.error('Vocab send failed:', err)
    return { ok: false, error: err instanceof Error ? err.message : '전송 중 오류가 발생했어요' }
  }
}
