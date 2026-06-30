'use client'

import { useRef, useState, useCallback } from 'react'
import ClubSelector from './ClubSelector'
import TrajectoryView from './TrajectoryView'
import { extractFrames } from '@/lib/extractFrames'
import SwingLoaderAnimation from './SwingLoaderAnimation'
import { detectClubFromFrame, recordClubFeedback } from '@/lib/clubDetection'
import { useI18n } from '@/lib/i18n'
import {
  AI_PROVIDERS,
  AIProvider,
  ClubCategory,
  ClubSelection,
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODELS,
} from '@/lib/types'

type Status = 'idle' | 'extracting' | 'estimating' | 'done' | 'error'

interface TrajectoryData {
  headSpeed: number
  ballSpeed: number
  launchAngle: number
  carry: number
  apex: number
  smashFactor: number
}

const card = 'rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.35)]'

export default function CarryTracer() {
  const { t } = useI18n()
  const [file, setFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [club, setClub] = useState<ClubSelection>({ category: 'iron', number: 7 })
  const [provider, setProvider] = useState<AIProvider>('gemini')
  const [geminiModel, setGeminiModel] = useState<string>(DEFAULT_GEMINI_MODEL)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [trajectory, setTrajectory] = useState<TrajectoryData | null>(null)
  const [impactFrame, setImpactFrame] = useState<string | null>(null)
  const [clubDetectStatus, setClubDetectStatus] = useState<'idle' | 'detecting' | 'done' | 'error'>('idle')
  const [detectedClub, setDetectedClub] = useState<{ category: ClubCategory; confidence: string; reason: string } | null>(null)
  const [clubFeedbackGiven, setClubFeedbackGiven] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    setFile(selected)
    setTrajectory(null)
    setImpactFrame(null)
    setError(null)
    setStatus('idle')
    setClubDetectStatus('idle')
    setDetectedClub(null)
    setClubFeedbackGiven(false)
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoUrl(selected ? URL.createObjectURL(selected) : null)
  }

  const extractFrameFromVideo = useCallback((video: HTMLVideoElement): Promise<string | null> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = Math.round(640 * (video.videoHeight / video.videoWidth))
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(null); return }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
      const base64 = dataUrl.split(',')[1]
      resolve(base64 || null)
    })
  }, [])

  const runClubDetection = useCallback(async (video: HTMLVideoElement) => {
    setClubDetectStatus('detecting')
    try {
      const seekTo = video.duration * 0.3
      video.currentTime = seekTo
      await new Promise<void>((resolve) => {
        const handler = () => { video.removeEventListener('seeked', handler); resolve() }
        video.addEventListener('seeked', handler)
      })
      const frame = await extractFrameFromVideo(video)
      if (!frame) { setClubDetectStatus('error'); return }
      const result = await detectClubFromFrame(frame, provider, geminiModel)
      if (result) {
        setDetectedClub(result)
        setClub((prev) => ({ ...prev, category: result.category }))
        setClubDetectStatus('done')
      } else {
        setClubDetectStatus('error')
      }
    } catch {
      setClubDetectStatus('error')
    }
  }, [provider, geminiModel, extractFrameFromVideo])

  function handleVideoLoadedMetadata(e: React.SyntheticEvent<HTMLVideoElement>) {
    const video = e.currentTarget
    if (isFinite(video.duration) && video.duration > 0) {
      runClubDetection(video)
    }
  }

  const extractImpactFrame = useCallback(async (video: HTMLVideoElement): Promise<string | null> => {
    const seekTo = video.duration * 0.55
    video.currentTime = seekTo
    await new Promise<void>((r) => {
      const h = () => { video.removeEventListener('seeked', h); r() }
      video.addEventListener('seeked', h)
    })
    const c = document.createElement('canvas')
    c.width = video.videoWidth
    c.height = video.videoHeight
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, c.width, c.height)
    return c.toDataURL('image/png').split(',')[1] || null
  }, [])

  async function handleEstimate() {
    if (!file) return
    setError(null)
    setTrajectory(null)
    setStatus('extracting')

    try {
      const frames = await extractFrames(file, 6)

      if (videoRef.current) {
        try {
          const hiRes = await extractImpactFrame(videoRef.current)
          if (hiRes) setImpactFrame(hiRes)
        } catch {
          setImpactFrame(frames[Math.min(3, frames.length - 1)])
        }
      } else {
        setImpactFrame(frames[Math.min(3, frames.length - 1)])
      }

      setStatus('estimating')
      const res = await fetch('/api/estimate-trajectory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frames,
          clubCategory: club.category,
          provider,
          geminiModel,
        }),
      })

      if (!res.ok) {
        throw new Error(t('trajectory.failed'))
      }

      const data = await res.json()
      if (!data || data.carry <= 0) {
        throw new Error(t('trajectory.failed'))
      }

      setTrajectory(data)
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('trajectory.failed'))
      setStatus('error')
    }
  }

  function handleDownload() {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas')
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `carry-tracer-${Date.now()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const isBusy = status === 'extracting' || status === 'estimating'

  return (
    <div className="space-y-6">
      <section className={`${card} p-6 space-y-5`}>
        <div>
          <p className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
            <span aria-hidden>🎥</span> {t('tracer.upload')}
          </p>
          <input
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            className="block w-full text-sm text-slate-400 file:mr-4 file:py-2.5 file:px-5 file:rounded-full file:border-0 file:bg-gradient-to-r file:from-orange-500 file:to-amber-500 file:text-amber-950 file:text-sm file:font-semibold file:shadow-[0_0_16px_rgba(249,115,22,0.3)] hover:file:shadow-[0_0_24px_rgba(249,115,22,0.45)] file:transition cursor-pointer"
          />
        </div>

        {videoUrl && (
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            onLoadedMetadata={handleVideoLoadedMetadata}
            className="w-full max-h-72 rounded-xl bg-black ring-1 ring-white/10 shadow-inner"
          />
        )}

        {videoUrl && (
          <ClubSelector value={club} onChange={(c) => { setClub(c); setClubFeedbackGiven(false) }} />
        )}

        {clubDetectStatus === 'detecting' && (
          <div className="flex items-center gap-2 text-xs text-sky-300 bg-sky-400/10 border border-sky-400/20 rounded-xl px-3 py-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin shrink-0" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
            </svg>
            {t('clubDetect.detecting')}
          </div>
        )}

        {clubDetectStatus === 'done' && detectedClub && (
          <div className="rounded-xl border border-orange-400/20 bg-orange-400/5 px-3 py-2 space-y-1.5">
            <p className="text-xs text-orange-300">
              {t('clubDetect.detected')}: <span className="font-bold">{detectedClub.category}</span>
              <span className="ml-1.5 text-slate-400">({t(detectedClub.confidence === 'high' ? 'clubDetect.confidence.high' : detectedClub.confidence === 'medium' ? 'clubDetect.confidence.medium' : 'clubDetect.confidence.low')})</span>
            </p>
            {detectedClub.reason && (
              <p className="text-[11px] text-slate-500">{detectedClub.reason}</p>
            )}
            {!clubFeedbackGiven && (
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    recordClubFeedback(detectedClub.category, club.category, true)
                    setClubFeedbackGiven(true)
                  }}
                  className="text-[11px] font-semibold text-emerald-300 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-3 py-1 hover:bg-emerald-400/20 transition"
                >
                  {t('clubDetect.correct')} ✓
                </button>
                <button
                  type="button"
                  onClick={() => {
                    recordClubFeedback(detectedClub.category, club.category, false)
                    setClubFeedbackGiven(true)
                  }}
                  className="text-[11px] font-semibold text-rose-300 bg-rose-400/10 border border-rose-400/20 rounded-full px-3 py-1 hover:bg-rose-400/20 transition"
                >
                  {t('clubDetect.incorrect')} ✗
                </button>
              </div>
            )}
            {clubFeedbackGiven && (
              <p className="text-[11px] text-slate-500">{t('clubDetect.feedbackDone')}</p>
            )}
          </div>
        )}

        {clubDetectStatus === 'error' && (
          <p className="text-[11px] text-slate-500">{t('clubDetect.failed')}</p>
        )}

        {videoUrl && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">AI</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as AIProvider)}
                disabled={isBusy}
                className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-slate-300 disabled:opacity-50"
              >
                {AI_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            {provider === 'gemini' && (
              <select
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
                disabled={isBusy}
                className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-slate-300 disabled:opacity-50"
              >
                {GEMINI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleEstimate}
          disabled={!file || isBusy}
          className="w-full py-3.5 rounded-full text-sm font-bold transition shadow-[0_0_20px_rgba(249,115,22,0.3)] disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-orange-500 to-amber-500 text-amber-950 hover:shadow-[0_0_30px_rgba(249,115,22,0.5)]"
        >
          {isBusy ? t('trajectory.estimating') : t('tracer.analyze')}
        </button>
      </section>

      {isBusy && (
        <section className={`${card} p-8 flex flex-col items-center gap-4`}>
          <SwingLoaderAnimation />
          <p className="text-sm text-slate-400 animate-pulse">
            {status === 'extracting' ? t('tracer.extracting') : t('trajectory.estimating')}
          </p>
        </section>
      )}

      {error && (
        <section className={`${card} p-5`}>
          <p className="text-sm text-rose-300 text-center">{error}</p>
        </section>
      )}

      {status === 'done' && trajectory && impactFrame && (
        <section className={`${card} p-6 space-y-4`}>
          <TrajectoryView frame={impactFrame} trajectory={trajectory} />
          <button
            type="button"
            onClick={handleDownload}
            className="w-full py-3 rounded-full text-sm font-bold transition bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow-[0_0_16px_rgba(56,189,248,0.3)] hover:shadow-[0_0_24px_rgba(56,189,248,0.5)]"
          >
            {t('tracer.download')}
          </button>
        </section>
      )}
    </div>
  )
}
