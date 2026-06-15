declare global {
  interface Window {
    Kakao?: {
      init: (key: string) => void
      isInitialized: () => boolean
      Share: {
        sendDefault: (settings: Record<string, unknown>) => void
      }
    }
  }
}

export function initKakao(): boolean {
  if (typeof window === 'undefined' || !window.Kakao) return false
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY
  if (!key) return false
  if (!window.Kakao.isInitialized()) {
    window.Kakao.init(key)
  }
  return true
}

export function isKakaoReady(): boolean {
  return typeof window !== 'undefined' && !!window.Kakao && !!process.env.NEXT_PUBLIC_KAKAO_JS_KEY
}

export function shareTextToKakao(text: string, linkUrl: string) {
  if (!initKakao() || !window.Kakao) return false
  window.Kakao.Share.sendDefault({
    objectType: 'text',
    text,
    link: {
      mobileWebUrl: linkUrl,
      webUrl: linkUrl,
    },
  })
  return true
}
