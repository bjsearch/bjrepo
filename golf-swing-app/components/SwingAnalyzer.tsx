'use client'

import { useRef, useState, useCallback } from 'react'
import ClubSelector from './ClubSelector'
import AnalysisResult from './AnalysisResult'
import { extractFrames } from '@/lib/extractFrames'
import SwingLoaderAnimation from './SwingLoaderAnimation'
import { PHASE_SETS, phaseCountForProvider, phaseFractions, phaseLabels } from '@/lib/swingPhases'
import { buildPhaseFeedbackHint, recordPhaseFeedback } from '@/lib/phaseFeedback'
import { fetchGlobalStats, fetchHistory, fetchRegionalStats, saveAnalysis } from '@/lib/history'
import { detectAnalysisLocation } from '@/lib/geolocation'
import { detectClubFromFrame, recordClubFeedback } from '@/lib/clubDetection'
import { useI18n } from '@/lib/i18n'
import {
  AI_PROVIDERS,
  AIProvider,
  ClubCategory,
  ClubSelection,
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODELS,
  SwingAnalysisResult,
  describeClub,
} from '@/lib/types'

type Status = 'idle' | 'extracting' | 'detecting' | 'analyzing' | 'done' | 'error'

function candidateFrameCount(phaseCount: 4 | 6): number {
  return phaseCount === 6 ? 18 : 10
}

const MIN_TRIM_SPAN = 0.5

function formatTime(seconds: number): string {
  const total = Math.max(0, seconds)
  const minutes = Math.floor(total / 60)
  const secs = (total % 60).toFixed(1).padStart(4, '0')
  return `${minutes}:${secs}`
}

function StepIndicator({ status }: { status: Status }) {
  const { t } = useI18n()
  const STEPS: { key: Status; label: string }[] = [
    { key: 'extracting', label: t('step.extracting') },
    { key: 'detecting', label: t('step.detecting') },
    { key: 'analyzing', label: t('step.analyzing') },
  ]
  const activeIndex = STEPS.findIndex((s) => s.key === status)
  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => {
        const state = activeIndex < 0 ? 'pending' : i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending'
        return (
          <div key={step.key} className={`flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border transition ${
                  state === 'done'
                    ? 'bg-lime-400 text-emerald-950 border-transparent'
                    : state === 'active'
                      ? 'bg-lime-400/15 text-lime-300 border-lime-400/50'
                      : 'bg-white/5 text-slate-500 border-white/10'
                }`}
              >
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span className={`text-[11px] whitespace-nowrap ${state === 'pending' ? 'text-slate-500' : 'text-slate-300'}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span className={`flex-1 h-px mx-2 ${state === 'done' ? 'bg-lime-400/40' : 'bg-white/10'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

async function detectPhaseFrames(
  candidateFrames: string[],
  phaseCount: 4 | 6,
  provider: AIProvider,
  geminiModel: string,
  feedbackHint?: string | null,
): Promise<string[]> {
  const phaseKeys = PHASE_SETS[phaseCount].map((p) => p.key)

  try {
    const res = await fetch('/api/detect-phases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frames: candidateFrames, phaseCount, provider, geminiModel, feedbackHint }),
    })
    const raw = await res.text()
    const data = raw ? JSON.parse(raw) : null
    const indices = phaseKeys.map((key) => data?.indices?.[key])
    const valid =
      res.ok &&
      indices.every((n) => typeof n === 'number' && n >= 0 && n < candidateFrames.length) &&
      indices.every((n, i) => i === 0 || (n as number) > (indices[i - 1] as number))

    if (valid) {
      return indices.map((i) => candidateFrames[i as number])
    }
  } catch {
    // fall through to the heuristic fallback below
  }

  return phaseFractions(phaseCount).map(
    (f) => candidateFrames[Math.min(candidateFrames.length - 1, Math.floor(f * candidateFrames.length))],
  )
}

export default function SwingAnalyzer() {
  const { t, locale } = useI18n()
  const [file, setFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoDuration, setVideoDuration] = useState<number | null>(null)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [club, setClub] = useState<ClubSelection>({ category: 'iron', number: 7 })
  const [provider, setProvider] = useState<AIProvider>('gemini')
  const [geminiModel, setGeminiModel] = useState<string>(DEFAULT_GEMINI_MODEL)
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SwingAnalysisResult | null>(null)
  const [frames, setFrames] = useState<string[]>([])
  const [framePhaseCount, setFramePhaseCount] = useState<4 | 6>(4)
  const [myAverageScore, setMyAverageScore] = useState<number | null>(null)
  const [globalAverageScore, setGlobalAverageScore] = useState<number | null>(null)
  const [regionAverageScore, setRegionAverageScore] = useState<number | null>(null)
  const [regionLabel, setRegionLabel] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [clubDetectStatus, setClubDetectStatus] = useState<'idle' | 'detecting' | 'done' | 'error'>('idle')
  const [detectedClub, setDetectedClub] = useState<{ category: ClubCategory; confidence: string; reason: string } | null>(null)
  const [clubFeedbackGiven, setClubFeedbackGiven] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    setFile(selected)
    setResult(null)
    setFrames([])
    setMyAverageScore(null)
    setGlobalAverageScore(null)
    setRegionAverageScore(null)
    setRegionLabel(null)
    setError(null)
    setStatus('idle')
    setProgress(0)
    setVideoDuration(null)
    setTrimStart(0)
    setTrimEnd(0)
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
    const duration = video.duration
    if (isFinite(duration) && duration > 0) {
      setVideoDuration(duration)
      setTrimStart(0)
      setTrimEnd(duration)
      runClubDetection(video)
    }
  }

  function handleTrimStartChange(value: number) {
    const next = Math.min(Math.max(0, value), trimEnd - MIN_TRIM_SPAN)
    setTrimStart(next)
    if (videoRef.current) videoRef.current.currentTime = next
  }

  function handleTrimEndChange(value: number) {
    const max = videoDuration ?? value
    const next = Math.max(Math.min(max, value), trimStart + MIN_TRIM_SPAN)
    setTrimEnd(next)
    if (videoRef.current) videoRef.current.currentTime = next
  }

  function resetTrim() {
    if (videoDuration == null) return
    setTrimStart(0)
    setTrimEnd(videoDuration)
  }

  const isTrimmed = videoDuration != null && (trimStart > 0.05 || videoDuration - trimEnd > 0.05)

  function handleFrameFeedback(frameIndex: number, accurate: boolean) {
    const phaseKey = PHASE_SETS[framePhaseCount][frameIndex]?.key
    if (phaseKey) recordPhaseFeedback(phaseKey, accurate)
  }

  async function handleAnalyze() {
    if (!file) return
    setError(null)
    setSaveError(null)
    setResult(null)
    setProgress(0)

    try {
      const phaseCount = phaseCountForProvider(provider)

      setStatus('extracting')
      const trimRange = isTrimmed ? { start: trimStart, end: trimEnd } : undefined
      const candidateFrames = await extractFrames(
        file,
        candidateFrameCount(phaseCount),
        (done, total) => {
          setProgress(Math.round((done / total) * 33))
        },
        trimRange,
      )

      setStatus('detecting')
      const detectingTimer = window.setInterval(() => {
        setProgress((p) => (p < 65 ? p + 1 : p))
      }, 250)

      const activePhases = PHASE_SETS[phaseCount]
      const phaseLabelByKey = Object.fromEntries(activePhases.map((p) => [p.key, p.label]))
      const feedbackHint = await buildPhaseFeedbackHint(
        activePhases.map((p) => p.key),
        phaseLabelByKey,
      )

      let phaseFrames: string[]
      try {
        phaseFrames = await detectPhaseFrames(candidateFrames, phaseCount, provider, geminiModel, feedbackHint)
      } finally {
        window.clearInterval(detectingTimer)
      }
      setProgress(66)
      setFrames(phaseFrames)
      setFramePhaseCount(phaseCount)

      setStatus('analyzing')
      const analyzingTimer = window.setInterval(() => {
        setProgress((p) => (p < 96 ? p + 1 : p))
      }, 350)

      let res: Response
      try {
        res = await fetch('/api/analyze-swing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            frames: phaseFrames,
            clubDescription: describeClub(club),
            provider,
            geminiModel,
            phaseCount,
            locale,
          }),
        })
      } finally {
        window.clearInterval(analyzingTimer)
      }

      const raw = await res.text()
      let data: any = null
      try {
        data = raw ? JSON.parse(raw) : null
      } catch {
        // Non-JSON response
      }

      if (!res.ok || !data) {
        const detail = data?.error ?? raw.slice(0, 200) ?? `HTTP ${res.status}`
        throw new Error(
          data?.error ??
            `${t('analyzer.requestFailed')}. (${res.status}) ${detail ? '- ' + detail : ''}`,
        )
      }

      setProgress(100)
      const analysisResult = data as SwingAnalysisResult
      setResult(analysisResult)
      setStatus('done')

      try {
        const pastEntries = await fetchHistory()
        setMyAverageScore(
          pastEntries.length > 0
            ? pastEntries.reduce((sum, e) => sum + e.result.score, 0) / pastEntries.length
            : null,
        )
      } catch {
        setMyAverageScore(null)
      }

      try {
        const stats = await fetchGlobalStats()
        setGlobalAverageScore(stats.average)
      } catch {
        setGlobalAverageScore(null)
      }

      const location = await detectAnalysisLocation()
      if (location?.region) {
        setRegionLabel(location.region)
        try {
          const stats = await fetchRegionalStats(location.region)
          setRegionAverageScore(stats.average)
        } catch {
          setRegionAverageScore(null)
        }
      } else {
        setRegionLabel(null)
        setRegionAverageScore(null)
      }

      try {
        await saveAnalysis(club, analysisResult, location)
        setSaveError(null)
      } catch (saveErr) {
        setSaveError(saveErr instanceof Error ? saveErr.message : t('analyzer.saveError'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('analyzer.unknownError'))
      setStatus('error')
    }
  }

  const isBusy = status === 'extracting' || status === 'detecting' || status === 'analyzing'

  const stageLabel =
    status === 'extracting'
      ? t('step.extracting')
      : status === 'detecting'
        ? t('step.detecting')
        : status === 'analyzing'
          ? t('step.aiAnalysis')
          : ''

  const providerDescs: Record<string, string> = {
    anthropic: t('ai.claudeDesc'),
    gemini: t('ai.geminiDesc'),
  }

  const geminiDescs: Record<string, string> = {
    'gemini-2.5-flash': t('ai.geminiFlashDesc'),
    'gemini-2.5-flash-lite': t('ai.geminiFlashLiteDesc'),
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.35)] p-6 space-y-5">
        <div>
          <p className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
            <span aria-hidden>🎥</span> {t('analyzer.upload')}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            className="block w-full text-sm text-slate-400 file:mr-4 file:py-2.5 file:px-5 file:rounded-full file:border-0 file:bg-gradient-to-r file:from-lime-500 file:to-emerald-500 file:text-emerald-950 file:text-sm file:font-semibold file:shadow-[0_0_16px_rgba(132,204,22,0.3)] hover:file:shadow-[0_0_24px_rgba(132,204,22,0.45)] file:transition cursor-pointer"
          />
        </div>

        {videoUrl && (
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            onLoadedMetadata={handleVideoLoadedMetadata}
            className="w-full max-h-96 rounded-xl bg-black ring-1 ring-white/10 shadow-inner"
          />
        )}

        {videoUrl && videoDuration != null && videoDuration > MIN_TRIM_SPAN * 2 && (
          <div className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
                <span aria-hidden>✂️</span> {t('analyzer.trimSection')}
              </p>
              {isTrimmed && (
                <button
                  type="button"
                  onClick={resetTrim}
                  disabled={isBusy}
                  className="text-[11px] text-slate-400 hover:text-lime-300 underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t('analyzer.trimReset')}
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              {t('analyzer.trimDescription')}
            </p>
            <p className="text-[11px] text-amber-200/70 bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-2 leading-relaxed">
              {t('analyzer.trimTip')}
            </p>

            <div className="space-y-1.5">
              <label className="flex items-center justify-between text-[11px] text-slate-400">
                <span>{t('analyzer.trimStart')}</span>
                <span className="font-mono text-slate-300">{formatTime(trimStart)}</span>
              </label>
              <input
                type="range"
                min={0}
                max={videoDuration}
                step={0.1}
                value={trimStart}
                onChange={(e) => handleTrimStartChange(Number(e.target.value))}
                disabled={isBusy}
                className="w-full accent-lime-400 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center justify-between text-[11px] text-slate-400">
                <span>{t('analyzer.trimEnd')}</span>
                <span className="font-mono text-slate-300">{formatTime(trimEnd)}</span>
              </label>
              <input
                type="range"
                min={0}
                max={videoDuration}
                step={0.1}
                value={trimEnd}
                onChange={(e) => handleTrimEndChange(Number(e.target.value))}
                disabled={isBusy}
                className="w-full accent-lime-400 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <p className="text-[11px] text-slate-500 text-right">
              {t('analyzer.trimLength')} <span className="font-mono text-lime-300/80">{formatTime(trimEnd - trimStart)}</span> / {t('analyzer.trimTotal')}{' '}
              <span className="font-mono">{formatTime(videoDuration)}</span>
            </p>
          </div>
        )}

        <ClubSelector value={club} onChange={(c) => { setClub(c); setClubFeedbackGiven(false) }} />

        {clubDetectStatus === 'detecting' && (
          <div className="flex items-center gap-2 text-xs text-sky-300 bg-sky-400/10 border border-sky-400/20 rounded-xl px-3 py-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin shrink-0" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
            </svg>
            {t('clubDetect.detecting')}
          </div>
        )}

        {clubDetectStatus === 'done' && detectedClub && (
          <div className="rounded-xl border border-lime-400/20 bg-lime-400/5 px-3 py-2 space-y-1.5">
            <p className="text-xs text-lime-300">
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

        <div>
          <p className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
            <span aria-hidden>🤖</span> {t('analyzer.selectAI')}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {AI_PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProvider(p.id)}
                disabled={isBusy}
                className={`rounded-xl border px-4 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  provider === p.id
                    ? 'border-lime-400/50 bg-lime-400/10 shadow-[0_0_16px_rgba(132,204,22,0.2)]'
                    : 'border-white/10 bg-white/[0.02] hover:bg-white/5 hover:border-white/20'
                }`}
              >
                <span className={`block text-sm font-bold ${provider === p.id ? 'text-lime-300' : 'text-slate-200'}`}>
                  {p.label}
                </span>
                <span className="block text-[11px] text-slate-500 mt-0.5">{providerDescs[p.id] ?? p.description}</span>
              </button>
            ))}
          </div>
        </div>

        {provider === 'gemini' && (
          <div>
            <p className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
              <span aria-hidden>✨</span> {t('analyzer.selectGeminiModel')}
            </p>
            <div className="grid sm:grid-cols-3 gap-2.5">
              {GEMINI_MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setGeminiModel(m.id)}
                  disabled={isBusy}
                  className={`rounded-xl border px-4 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    geminiModel === m.id
                      ? 'border-sky-400/50 bg-sky-400/10 shadow-[0_0_16px_rgba(56,189,248,0.2)]'
                      : 'border-white/10 bg-white/[0.02] hover:bg-white/5 hover:border-white/20'
                  }`}
                >
                  <span className={`block text-sm font-bold ${geminiModel === m.id ? 'text-sky-300' : 'text-slate-200'}`}>
                    {m.label}
                  </span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">{geminiDescs[m.id] ?? m.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={!file || isBusy}
          className="w-full rounded-full bg-gradient-to-r from-lime-400 via-emerald-400 to-teal-400 text-emerald-950 font-bold py-3.5 shadow-[0_0_24px_rgba(132,204,22,0.3)] transition hover:shadow-[0_0_36px_rgba(132,204,22,0.45)] hover:-translate-y-0.5 active:translate-y-0 disabled:bg-none disabled:bg-white/5 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed disabled:translate-y-0"
        >
          {status === 'extracting' && t('analyzer.extracting')}
          {status === 'detecting' && t('analyzer.detecting')}
          {status === 'analyzing' && t('analyzer.analyzing')}
          {(status === 'idle' || status === 'done' || status === 'error') && t('analyzer.analyzeButton')}
        </button>

        {isBusy && (
          <div className="space-y-3">
            <SwingLoaderAnimation />
            <StepIndicator status={status} />
            <div className="space-y-1.5">
              <div className="h-2.5 w-full rounded-full bg-white/5 ring-1 ring-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-lime-400 via-emerald-400 to-teal-400 shadow-[0_0_10px_rgba(132,204,22,0.6)] transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 text-right">
                {stageLabel} · {progress}%
              </p>
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">{error}</p>
        )}
      </section>

      {result && (
        <>
          {saveError ? (
            <p className="text-xs text-center text-amber-300/80 bg-amber-500/10 border border-amber-400/20 rounded-full px-3 py-1.5">
              ⚠️ {saveError}
            </p>
          ) : (
            <p className="text-xs text-center text-lime-300/70">
              {t('analyzer.savedToCalendar')}
            </p>
          )}
          <AnalysisResult
            result={result}
            myAverageScore={myAverageScore}
            globalAverageScore={globalAverageScore}
            regionAverageScore={regionAverageScore}
            regionLabel={regionLabel}
            frames={frames}
            frameLabels={phaseLabels(framePhaseCount, locale)}
            onFrameFeedback={handleFrameFeedback}
          />
        </>
      )}
    </div>
  )
}
