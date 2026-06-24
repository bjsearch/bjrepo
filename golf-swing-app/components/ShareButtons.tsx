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
  const color = scoreColor(score)
  const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

  // Card outer background (dark with subtle texture)
  ctx.fillStyle = '#080d0a'
  ctx.fillRect(0, 0, S, S)

  // Card border - holographic gradient effect
  const pad = 24
  const cardR = 40
  const borderW = 4

  // Outer glow
  ctx.shadowColor = color
  ctx.shadowBlur = 30
  roundRect(ctx, pad, pad, S - pad * 2, S - pad * 2, cardR)
  ctx.strokeStyle = color
  ctx.lineWidth = borderW
  ctx.stroke()
  ctx.shadowBlur = 0

  // Inner holographic border shimmer
  const holoGrad = ctx.createLinearGradient(pad, pad, S - pad, S - pad)
  holoGrad.addColorStop(0, 'rgba(163,230,53,0.8)')
  holoGrad.addColorStop(0.25, 'rgba(52,211,153,0.6)')
  holoGrad.addColorStop(0.5, 'rgba(56,189,248,0.8)')
  holoGrad.addColorStop(0.75, 'rgba(168,85,247,0.6)')
  holoGrad.addColorStop(1, 'rgba(251,191,36,0.8)')
  roundRect(ctx, pad, pad, S - pad * 2, S - pad * 2, cardR)
  ctx.strokeStyle = holoGrad
  ctx.lineWidth = borderW
  ctx.stroke()

  // Card inner fill
  const innerPad = pad + borderW + 2
  const cardBg = ctx.createLinearGradient(0, 0, 0, S)
  cardBg.addColorStop(0, '#0d1a14')
  cardBg.addColorStop(0.4, '#0f2118')
  cardBg.addColorStop(1, '#0a1610')
  roundRect(ctx, innerPad, innerPad, S - innerPad * 2, S - innerPad * 2, cardR - 4)
  ctx.fillStyle = cardBg
  ctx.fill()

  // Diagonal holographic shine overlay
  ctx.save()
  ctx.globalAlpha = 0.04
  const shine = ctx.createLinearGradient(0, 0, S, S)
  shine.addColorStop(0, 'transparent')
  shine.addColorStop(0.3, 'transparent')
  shine.addColorStop(0.45, '#ffffff')
  shine.addColorStop(0.55, '#ffffff')
  shine.addColorStop(0.7, 'transparent')
  shine.addColorStop(1, 'transparent')
  roundRect(ctx, innerPad, innerPad, S - innerPad * 2, S - innerPad * 2, cardR - 4)
  ctx.fillStyle = shine
  ctx.fill()
  ctx.restore()

  // Top bar: CARRY COACH + type badge
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(163,230,53,0.9)'
  ctx.font = `800 28px ${font}`
  ctx.letterSpacing = '5px'
  ctx.fillText('CARRY COACH', 70, 90)
  ctx.letterSpacing = '0px'

  // Type badge (right side)
  ctx.textAlign = 'right'
  ctx.fillStyle = color
  ctx.font = `bold 22px ${font}`
  ctx.fillText(`SCORE ${score}`, S - 70, 90)

  // Decorative line under header
  const lineGrad = ctx.createLinearGradient(60, 0, S - 60, 0)
  lineGrad.addColorStop(0, color)
  lineGrad.addColorStop(0.5, 'rgba(56,189,248,0.6)')
  lineGrad.addColorStop(1, 'rgba(168,85,247,0.6)')
  ctx.fillStyle = lineGrad
  ctx.fillRect(60, 110, S - 120, 2)

  // Main image frame (centered, like Pokémon card art window)
  const imgX = 60
  const imgY = 130
  const imgW = S - 120
  const imgH = 560

  // Image border glow
  ctx.shadowColor = color
  ctx.shadowBlur = 15
  roundRect(ctx, imgX - 2, imgY - 2, imgW + 4, imgH + 4, 20)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.shadowBlur = 0

  try {
    const img = await loadImage(`data:image/jpeg;base64,${topFrameBase64}`)

    ctx.save()
    roundRect(ctx, imgX, imgY, imgW, imgH, 18)
    ctx.clip()

    // Center crop: for golf swing, golfer is typically in the center
    // Use center-weighted crop to keep the person centered
    const srcAspect = img.width / img.height
    const dstAspect = imgW / imgH
    let sx = 0, sy = 0, sw = img.width, sh = img.height
    if (srcAspect > dstAspect) {
      sw = img.height * dstAspect
      sx = (img.width - sw) / 2
    } else {
      sh = img.width / dstAspect
      // Bias toward upper-center (golfer's body in backswing top)
      sy = (img.height - sh) * 0.35
    }
    ctx.drawImage(img, sx, sy, sw, sh, imgX, imgY, imgW, imgH)

    // Cinematic vignette on image
    const vig = ctx.createRadialGradient(
      imgX + imgW / 2, imgY + imgH / 2, imgH * 0.3,
      imgX + imgW / 2, imgY + imgH / 2, imgH * 0.75,
    )
    vig.addColorStop(0, 'rgba(0,0,0,0)')
    vig.addColorStop(1, 'rgba(0,0,0,0.5)')
    ctx.fillStyle = vig
    ctx.fillRect(imgX, imgY, imgW, imgH)

    // Bottom gradient fade on image
    const imgFade = ctx.createLinearGradient(imgX, imgY + imgH - 100, imgX, imgY + imgH)
    imgFade.addColorStop(0, 'rgba(13,26,20,0)')
    imgFade.addColorStop(1, 'rgba(13,26,20,0.85)')
    ctx.fillStyle = imgFade
    ctx.fillRect(imgX, imgY + imgH - 100, imgW, 100)

    ctx.restore()

    // Phase label on image bottom
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(163,230,53,0.9)'
    ctx.font = `700 18px ${font}`
    ctx.fillText('TOP OF BACKSWING', imgX + 20, imgY + imgH - 18)

    // Stars decoration on image top-right
    ctx.textAlign = 'right'
    const starColor = score >= 80 ? '#fbbf24' : score >= 60 ? '#94a3b8' : '#78716c'
    ctx.fillStyle = starColor
    ctx.shadowColor = starColor
    ctx.shadowBlur = 8
    const starCount = score >= 80 ? 3 : score >= 60 ? 2 : 1
    ctx.font = `24px ${font}`
    ctx.fillText('★'.repeat(starCount), imgX + imgW - 16, imgY + 36)
    ctx.shadowBlur = 0
  } catch {
    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    roundRect(ctx, imgX, imgY, imgW, imgH, 18)
    ctx.fill()
  }

  // Score section below image
  const scoreY = 720

  // Decorative line
  ctx.fillStyle = lineGrad
  ctx.fillRect(60, scoreY, S - 120, 2)

  // Large score with glow
  ctx.textAlign = 'center'
  ctx.shadowColor = color
  ctx.shadowBlur = 40
  ctx.fillStyle = color
  ctx.font = `900 120px ${font}`
  ctx.fillText(`${score}`, S / 2, scoreY + 120)
  ctx.shadowBlur = 0

  // /100
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.font = `500 32px ${font}`
  ctx.fillText('/ 100', S / 2, scoreY + 160)

  // Grade badge with glow border
  const badgeW = 340
  const badgeH = 52
  const badgeX = (S - badgeW) / 2
  const badgeY2 = scoreY + 185

  // Badge glow
  ctx.shadowColor = 'rgba(52,211,153,0.5)'
  ctx.shadowBlur = 12
  const badgeBg = ctx.createLinearGradient(badgeX, badgeY2, badgeX + badgeW, badgeY2)
  badgeBg.addColorStop(0, 'rgba(16,185,129,0.2)')
  badgeBg.addColorStop(0.5, 'rgba(52,211,153,0.15)')
  badgeBg.addColorStop(1, 'rgba(16,185,129,0.2)')
  roundRect(ctx, badgeX, badgeY2, badgeW, badgeH, 26)
  ctx.fillStyle = badgeBg
  ctx.fill()
  ctx.shadowBlur = 0

  const badgeBorder = ctx.createLinearGradient(badgeX, badgeY2, badgeX + badgeW, badgeY2)
  badgeBorder.addColorStop(0, 'rgba(163,230,53,0.4)')
  badgeBorder.addColorStop(0.5, 'rgba(52,211,153,0.6)')
  badgeBorder.addColorStop(1, 'rgba(56,189,248,0.4)')
  roundRect(ctx, badgeX, badgeY2, badgeW, badgeH, 26)
  ctx.strokeStyle = badgeBorder
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.fillStyle = '#6ee7b7'
  ctx.font = `bold 24px ${font}`
  ctx.fillText(grade, S / 2, badgeY2 + 35)

  // Bottom bar
  const bottomY = S - 70

  // Decorative line
  ctx.fillStyle = lineGrad
  ctx.fillRect(60, bottomY - 20, S - 120, 1)

  // Date left, branding right
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(148,163,184,0.5)'
  ctx.font = `400 20px ${font}`
  ctx.fillText(dateStr, 70, bottomY + 10)

  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(148,163,184,0.35)'
  ctx.font = `500 18px ${font}`
  ctx.letterSpacing = '3px'
  ctx.fillText('carry-coach.netlify.app', S - 70, bottomY + 10)
  ctx.letterSpacing = '0px'

  // Corner holographic sparkle dots
  const sparkles = [
    [56, 56], [S - 56, 56], [56, S - 56], [S - 56, S - 56],
  ]
  sparkles.forEach(([x, y]) => {
    const sg = ctx.createRadialGradient(x, y, 0, x, y, 12)
    sg.addColorStop(0, 'rgba(163,230,53,0.6)')
    sg.addColorStop(0.5, 'rgba(56,189,248,0.3)')
    sg.addColorStop(1, 'transparent')
    ctx.fillStyle = sg
    ctx.beginPath()
    ctx.arc(x, y, 12, 0, Math.PI * 2)
    ctx.fill()
  })

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
