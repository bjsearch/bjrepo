'use client'

import { useCallback, useState } from 'react'
import { useI18n } from '@/lib/i18n'

declare global {
  interface Window {
    Kakao?: {
      isInitialized: () => boolean
      init: (key: string) => void
      Share: {
        sendDefault: (options: Record<string, unknown>) => void
        uploadImage: (options: { file: File[] }) => Promise<{ infos: { original: { url: string } } }>
      }
    }
  }
}

const KAKAO_SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js'
const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY || '200cb8d714463d5558c7a3454e161fcf'
let kakaoLoadPromise: Promise<boolean> | null = null

function loadKakaoSdk(): Promise<boolean> {
  if (kakaoLoadPromise) return kakaoLoadPromise

  if (window.Kakao) {
    if (!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_JS_KEY)
    kakaoLoadPromise = Promise.resolve(true)
    return kakaoLoadPromise
  }

  kakaoLoadPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement('script')
    script.src = KAKAO_SDK_URL
    script.async = true
    script.onload = () => {
      try {
        if (window.Kakao && !window.Kakao.isInitialized()) {
          window.Kakao.init(KAKAO_JS_KEY)
        }
      } catch (e) {
        console.error('Kakao SDK init failed', e)
      }
      resolve(!!window.Kakao?.isInitialized())
    }
    script.onerror = () => {
      kakaoLoadPromise = null
      resolve(false)
    }
    document.head.appendChild(script)
  })
  return kakaoLoadPromise
}

interface ShareButtonsProps {
  title: string
  description: string
  captureTargetRef: React.RefObject<HTMLDivElement | null>
}

export default function ShareButtons({ title, description, captureTargetRef }: ShareButtonsProps) {
  const { t } = useI18n()
  const [toast, setToast] = useState<string | null>(null)
  const [kakaoLoading, setKakaoLoading] = useState(false)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  const pageUrl = typeof window !== 'undefined' ? window.location.href : ''
  const plainDesc = description.replace(/\*\*/g, '').replace(/__/g, '')

  const captureToBlob = useCallback(async (): Promise<Blob | null> => {
    const target = captureTargetRef.current
    if (!target) return null
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(target, {
      backgroundColor: '#0b1410',
      scale: 2,
      useCORS: true,
      logging: false,
    })
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
  }, [captureTargetRef])

  const handleKakao = useCallback(async () => {
    setKakaoLoading(true)
    try {
      const sdkReady = await loadKakaoSdk()

      if (!sdkReady || !window.Kakao?.isInitialized()) {
        await navigator.clipboard.writeText(`${title}\n${plainDesc}\n${pageUrl}`)
        showToast(t('share.kakaoNotReady'))
        return
      }

      const blob = await captureToBlob()

      let imageUrl = 'https://carry-coach.netlify.app/og-image.png'
      if (blob) {
        try {
          const file = new File([blob], 'carry-coach-report.png', { type: 'image/png' })
          const uploaded = await window.Kakao!.Share.uploadImage({ file: [file] })
          imageUrl = uploaded.infos.original.url
        } catch (e) {
          console.warn('Kakao image upload failed, using default image', e)
        }
      }

      window.Kakao!.Share.sendDefault({
        objectType: 'feed',
        content: {
          title,
          description: plainDesc.slice(0, 200),
          imageUrl,
          imageWidth: 800,
          imageHeight: 600,
          link: { mobileWebUrl: pageUrl, webUrl: pageUrl },
        },
        buttons: [
          { title: t('share.kakaoViewResult'), link: { mobileWebUrl: pageUrl, webUrl: pageUrl } },
        ],
      })
    } catch (e) {
      console.error('Kakao share failed', e)
      try {
        await navigator.clipboard.writeText(`${title}\n${plainDesc}\n${pageUrl}`)
        showToast(t('share.copied'))
      } catch {
        showToast(t('share.copyFailed'))
      }
    } finally {
      setKakaoLoading(false)
    }
  }, [title, plainDesc, pageUrl, t, showToast, captureToBlob])

  const handleTwitter = useCallback(() => {
    const text = encodeURIComponent(`${title}\n${plainDesc.slice(0, 200)}`)
    const url = encodeURIComponent(pageUrl)
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'noopener,noreferrer,width=600,height=400')
  }, [title, plainDesc, pageUrl])

  const handleSaveImage = useCallback(async () => {
    try {
      const blob = await captureToBlob()
      if (!blob) { showToast(t('share.imageFailed')); return }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `carry-coach-${Date.now()}.png`
      a.click()
      URL.revokeObjectURL(url)
      showToast(t('share.imageSaved'))
    } catch {
      showToast(t('share.imageFailed'))
    }
  }, [captureToBlob, showToast, t])

  const handleInstagram = useCallback(async () => {
    try {
      const blob = await captureToBlob()
      if (!blob) { showToast(t('share.imageFailed')); return }
      if (navigator.share && navigator.canShare?.({ files: [new File([blob], 'swing.png', { type: 'image/png' })] })) {
        await navigator.share({
          title,
          files: [new File([blob], 'carry-coach-swing.png', { type: 'image/png' })],
        })
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `carry-coach-instagram-${Date.now()}.png`
      a.click()
      URL.revokeObjectURL(url)
      showToast(t('share.imageSaved'))
    } catch {
      showToast(t('share.imageFailed'))
    }
  }, [captureToBlob, title, showToast, t])

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">{t('share.shareTitle')}</p>
      <div className="flex items-center gap-2 flex-wrap justify-center">
        <button
          type="button"
          onClick={handleKakao}
          disabled={kakaoLoading}
          className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-4 py-2 border border-yellow-400/30 text-yellow-300 bg-yellow-400/10 hover:bg-yellow-400/20 transition disabled:opacity-60 disabled:cursor-wait"
        >
          {kakaoLoading ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 3C6.48 3 2 6.58 2 10.94c0 2.8 1.86 5.27 4.66 6.68l-1.19 4.38 5.08-3.35c.47.05.95.07 1.45.07 5.52 0 10-3.58 10-7.78S17.52 3 12 3z" />
            </svg>
          )}
          {kakaoLoading ? t('share.kakaoUploading') : t('share.kakao')}
        </button>
        <button
          type="button"
          onClick={handleTwitter}
          className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-4 py-2 border border-slate-400/30 text-slate-300 bg-white/5 hover:bg-white/10 transition"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          {t('share.twitter')}
        </button>
        <button
          type="button"
          onClick={handleInstagram}
          className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-4 py-2 border border-pink-400/30 text-pink-300 bg-pink-400/10 hover:bg-pink-400/20 transition"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
          </svg>
          {t('share.instagram')}
        </button>
        <button
          type="button"
          onClick={handleSaveImage}
          className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-4 py-2 border border-emerald-400/30 text-emerald-300 bg-emerald-400/10 hover:bg-emerald-400/20 transition"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {t('share.saveImage')}
        </button>
      </div>
      {toast && (
        <p className="text-xs text-yellow-300 bg-yellow-400/10 border border-yellow-400/20 rounded-full px-3 py-1 animate-[fadeIn_0.2s_ease-out]">
          {toast}
        </p>
      )}
    </div>
  )
}
