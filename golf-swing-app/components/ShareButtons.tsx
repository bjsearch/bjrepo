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

function scoreColor(score: number): string {
  if (score >= 80) return '#a3e635'
  if (score >= 60) return '#fbbf24'
  return '#fb7185'
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function renderInstagramCard(
  score: number,
  grade: string,
  topFrameBase64: string,
  dateStr: string,
): Promise<HTMLCanvasElement> {
  const S = 1080
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')!

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, S)
  bg.addColorStop(0, '#0b1410')
  bg.addColorStop(1, '#0f2118')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, S, S)

  // Top frame image (left half, with rounded mask)
  try {
    const img = await loadImage(`data:image/jpeg;base64,${topFrameBase64}`)
    const imgW = 500
    const imgH = 680
    const imgX = 40
    const imgY = 160
    ctx.save()
    roundRect(ctx, imgX, imgY, imgW, imgH, 24)
    ctx.clip()

    const srcAspect = img.width / img.height
    const dstAspect = imgW / imgH
    let sx = 0, sy = 0, sw = img.width, sh = img.height
    if (srcAspect > dstAspect) {
      sw = img.height * dstAspect
      sx = (img.width - sw) / 2
    } else {
      sh = img.width / dstAspect
      sy = (img.height - sh) / 2
    }
    ctx.drawImage(img, sx, sy, sw, sh, imgX, imgY, imgW, imgH)

    // Subtle overlay gradient on image
    const overlay = ctx.createLinearGradient(imgX, imgY, imgX, imgY + imgH)
    overlay.addColorStop(0, 'rgba(11,20,16,0)')
    overlay.addColorStop(0.85, 'rgba(11,20,16,0)')
    overlay.addColorStop(1, 'rgba(11,20,16,0.7)')
    ctx.fillStyle = overlay
    ctx.fillRect(imgX, imgY, imgW, imgH)
    ctx.restore()

    // "Top of Backswing" label on image
    ctx.fillStyle = 'rgba(163,230,53,0.8)'
    ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('Top of Backswing', imgX + 20, imgY + imgH - 20)
  } catch {
    // If image fails, draw placeholder
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    roundRect(ctx, 40, 160, 500, 680, 24)
    ctx.fill()
  }

  // Right side: Score section
  const rightCx = 790
  const color = scoreColor(score)

  // App name
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(163,230,53,0.6)'
  ctx.font = '600 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  ctx.letterSpacing = '6px'
  ctx.fillText('CARRY COACH', rightCx, 210)
  ctx.letterSpacing = '0px'

  // Score ring
  const ringCy = 420
  const radius = 130
  const lineW = 18

  ctx.beginPath()
  ctx.arc(rightCx, ringCy, radius, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = lineW
  ctx.stroke()

  const startAngle = -Math.PI / 2
  const endAngle = startAngle + (Math.PI * 2 * score) / 100
  ctx.beginPath()
  ctx.arc(rightCx, ringCy, radius, startAngle, endAngle)
  ctx.strokeStyle = color
  ctx.lineWidth = lineW
  ctx.lineCap = 'round'
  ctx.shadowColor = color
  ctx.shadowBlur = 25
  ctx.stroke()
  ctx.shadowBlur = 0

  // Score number
  ctx.fillStyle = color
  ctx.font = 'bold 90px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  ctx.fillText(`${score}`, rightCx, ringCy + 32)

  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.font = '500 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  ctx.fillText('/ 100', rightCx, ringCy + 68)

  // Grade badge
  ctx.fillStyle = 'rgba(16,185,129,0.15)'
  const badgeW = 260
  const badgeH = 48
  const badgeX = rightCx - badgeW / 2
  const badgeY = 620
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 24)
  ctx.fill()
  ctx.strokeStyle = 'rgba(52,211,153,0.3)'
  ctx.lineWidth = 1.5
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 24)
  ctx.stroke()

  ctx.fillStyle = '#6ee7b7'
  ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  ctx.fillText(grade, rightCx, badgeY + 33)

  // Date
  ctx.fillStyle = 'rgba(148,163,184,0.5)'
  ctx.font = '400 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  ctx.fillText(dateStr, rightCx, 770)

  // Bottom bar
  ctx.fillStyle = 'rgba(255,255,255,0.03)'
  ctx.fillRect(0, S - 100, S, 100)
  ctx.fillStyle = 'rgba(148,163,184,0.3)'
  ctx.font = '400 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  ctx.letterSpacing = '3px'
  ctx.fillText('carry-coach.netlify.app', S / 2, S - 40)
  ctx.letterSpacing = '0px'

  return canvas
}

interface ShareButtonsProps {
  title: string
  description: string
  captureTargetRef: React.RefObject<HTMLDivElement | null>
  shareDate?: string
  score?: number
  grade?: string
  summary?: string
  topFrame?: string
}

export default function ShareButtons({ title, description, captureTargetRef, shareDate, score, grade, topFrame }: ShareButtonsProps) {
  const { t } = useI18n()
  const [toast, setToast] = useState<string | null>(null)
  const [kakaoLoading, setKakaoLoading] = useState(false)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  const pageUrl = (() => {
    if (typeof window === 'undefined') return ''
    const base = `${window.location.origin}${window.location.pathname}`
    const date = shareDate ?? new Date().toISOString().slice(0, 10)
    return `${base}?tab=calendar&date=${date}`
  })()
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

  const uploadImageToServer = useCallback(async (blob: Blob): Promise<string | null> => {
    try {
      const reader = new FileReader()
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })
      const res = await fetch('/api/share-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      })
      if (!res.ok) return null
      const data = await res.json()
      return data.url ?? null
    } catch {
      return null
    }
  }, [])

  const handleKakao = useCallback(async () => {
    setKakaoLoading(true)
    const fallbackCopy = async (toastKey: 'share.kakaoError' | 'share.kakaoNotReady' | 'share.copied') => {
      try {
        await navigator.clipboard.writeText(`${title}\n${plainDesc}\n${pageUrl}`)
        showToast(t(toastKey))
      } catch {
        showToast(t('share.copyFailed'))
      }
    }
    try {
      const sdkReady = await loadKakaoSdk()

      if (!sdkReady || !window.Kakao?.isInitialized()) {
        await fallbackCopy('share.kakaoNotReady')
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
          console.warn('Kakao image upload failed, trying server', e)
          const serverUrl = await uploadImageToServer(blob)
          if (serverUrl) imageUrl = serverUrl
        }
      }

      try {
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
          serverCallbackArgs: {},
          installTalk: true,
        })
      } catch (sdkErr) {
        console.error('Kakao sendDefault error', sdkErr)
        await fallbackCopy('share.kakaoError')
      }
    } catch (e) {
      console.error('Kakao share failed', e)
      await fallbackCopy('share.kakaoError')
    } finally {
      setKakaoLoading(false)
    }
  }, [title, plainDesc, pageUrl, t, showToast, captureToBlob, uploadImageToServer])

  const handleSaveReport = useCallback(async () => {
    try {
      const blob = await captureToBlob()
      if (!blob) { showToast(t('share.imageFailed')); return }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `carry-coach-report-${Date.now()}.png`
      a.click()
      URL.revokeObjectURL(url)
      showToast(t('share.imageSaved'))
    } catch {
      showToast(t('share.imageFailed'))
    }
  }, [captureToBlob, showToast, t])

  const handleSaveInstagram = useCallback(async () => {
    if (!topFrame) { showToast(t('share.imageFailed')); return }
    try {
      const dateStr = shareDate ?? new Date().toISOString().slice(0, 10)
      const canvas = await renderInstagramCard(score ?? 0, grade ?? '', topFrame, dateStr)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      )
      if (!blob) { showToast(t('share.imageFailed')); return }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `carry-coach-insta-${Date.now()}.png`
      a.click()
      URL.revokeObjectURL(url)
      showToast(t('share.imageSaved'))
    } catch {
      showToast(t('share.imageFailed'))
    }
  }, [topFrame, score, grade, shareDate, showToast, t])

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
          onClick={handleSaveInstagram}
          disabled={!topFrame}
          className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-4 py-2 border border-pink-400/30 text-pink-300 bg-pink-400/10 hover:bg-pink-400/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
          </svg>
          {t('share.instagram')}
        </button>
        <button
          type="button"
          onClick={handleSaveReport}
          className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-4 py-2 border border-emerald-400/30 text-emerald-300 bg-emerald-400/10 hover:bg-emerald-400/20 transition"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {t('share.saveReport')}
        </button>
        <button
          type="button"
          onClick={() => window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-4 py-2 border border-fuchsia-400/30 text-fuchsia-300 bg-gradient-to-r from-fuchsia-500/10 to-pink-500/10 hover:from-fuchsia-500/20 hover:to-pink-500/20 transition"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
          </svg>
          {t('share.openInstagram')}
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
