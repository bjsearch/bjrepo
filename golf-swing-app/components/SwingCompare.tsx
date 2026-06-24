'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { extractFrames } from '@/lib/extractFrames'
import { PHASE_SETS, phaseCountForProvider } from '@/lib/swingPhases'
import { buildPhaseFeedbackHint } from '@/lib/phaseFeedback'
import { AI_PROVIDERS, AIProvider, DEFAULT_GEMINI_MODEL, GEMINI_MODELS } from '@/lib/types'
import { useI18n } from '@/lib/i18n'
import SwingLoaderAnimation from './SwingLoaderAnimation'
import ShareButtons from './ShareButtons'

const MIN_TRIM_SPAN = 0.3

function formatTime(seconds: number): string {
  const total = Math.max(0, seconds)
  const m = Math.floor(total / 60)
  const s = (total % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

interface VideoSlot {
  file: File | null
  url: string | null
  duration: number | null
  trimStart: number
  trimEnd: number
}

function emptySlot(): VideoSlot {
  return { file: null, url: null, duration: null, trimStart: 0, trimEnd: 0 }
}

interface StageComparison {
  stage: string
  scoreA: number
  scoreB: number
  comparison: string
}

interface ComparisonResult {
  overallScoreA: number
  overallScoreB: number
  summary: string
  stageComparisons: StageComparison[]
  aStrengths: string[]
  bStrengths: string[]
  commonIssues: string[]
  recommendation: string
}

function renderEmphasis(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-bold text-lime-200">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('__') && part.endsWith('__')) {
      return (
        <span key={i} className="font-semibold text-slate-100 underline decoration-2 decoration-rose-400 underline-offset-4">
          {part.slice(2, -2)}
        </span>
      )
    }
    return part
  })
}

function scoreColor(score: number): { text: string; bar: string; stroke: string; glow: string } {
  if (score >= 80) return { text: 'text-lime-300', bar: 'bg-lime-400', stroke: '#a3e635', glow: 'rgba(163,230,53,0.45)' }
  if (score >= 60) return { text: 'text-amber-300', bar: 'bg-amber-400', stroke: '#fbbf24', glow: 'rgba(251,191,36,0.4)' }
  return { text: 'text-rose-300', bar: 'bg-rose-400', stroke: '#fb7185', glow: 'rgba(251,113,133,0.4)' }
}

function ScoreGauge({ score, label, color }: { score: number; label: string; color: string }) {
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - score / 100)
  const { glow } = scoreColor(score)
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 100 100" className="-rotate-90 w-full h-full">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={radius} fill="none"
            stroke={color}
            strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            style={{ filter: `drop-shadow(0 0 6px ${glow})`, transition: 'stroke-dashoffset 0.8s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-extrabold ${scoreColor(score).text}`}>{score}</span>
          <span className="text-[10px] text-slate-500">/ 100</span>
        </div>
      </div>
      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
    </div>
  )
}

type AnalysisStatus = 'idle' | 'extracting' | 'detecting' | 'analyzing' | 'done' | 'error'

const card = 'rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.35)]'

export default function SwingCompare() {
  const { t, locale } = useI18n()
  const [slots, setSlots] = useState<[VideoSlot, VideoSlot]>([emptySlot(), emptySlot()])
  const videoRefs = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)]
  const fileInputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const compareResultRef = useRef<HTMLDivElement>(null)

  const [playing, setPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)

  const [provider, setProvider] = useState<AIProvider>('gemini')
  const [geminiModel, setGeminiModel] = useState<string>(DEFAULT_GEMINI_MODEL)
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('idle')
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null)

  const bothLoaded = slots[0].duration != null && slots[1].duration != null
  const isBusy = analysisStatus === 'extracting' || analysisStatus === 'detecting' || analysisStatus === 'analyzing'

  const updateSlot = useCallback((idx: 0 | 1, patch: Partial<VideoSlot>) => {
    setSlots((prev) => {
      const next = [...prev] as [VideoSlot, VideoSlot]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }, [])

  function handleFileChange(idx: 0 | 1, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    const old = slots[idx]
    if (old.url) URL.revokeObjectURL(old.url)
    updateSlot(idx, { file, url: file ? URL.createObjectURL(file) : null, duration: null, trimStart: 0, trimEnd: 0 })
    setPlaying(false)
    setCapturedImage(null)
    setComparisonResult(null)
  }

  function handleMetadata(idx: 0 | 1, e: React.SyntheticEvent<HTMLVideoElement>) {
    const dur = e.currentTarget.duration
    if (isFinite(dur) && dur > 0) updateSlot(idx, { duration: dur, trimStart: 0, trimEnd: dur })
  }

  function handleTrimStart(idx: 0 | 1, value: number) {
    const slot = slots[idx]
    const next = Math.min(Math.max(0, value), slot.trimEnd - MIN_TRIM_SPAN)
    updateSlot(idx, { trimStart: next })
    const video = videoRefs[idx].current
    if (video) video.currentTime = next
  }

  function handleTrimEnd(idx: 0 | 1, value: number) {
    const slot = slots[idx]
    const max = slot.duration ?? value
    const next = Math.max(Math.min(max, value), slot.trimStart + MIN_TRIM_SPAN)
    updateSlot(idx, { trimEnd: next })
    const video = videoRefs[idx].current
    if (video) video.currentTime = next
  }

  function resetTrim(idx: 0 | 1) {
    if (slots[idx].duration == null) return
    updateSlot(idx, { trimStart: 0, trimEnd: slots[idx].duration! })
  }

  function isTrimmed(idx: 0 | 1) {
    const s = slots[idx]
    return s.duration != null && (s.trimStart > 0.05 || s.duration - s.trimEnd > 0.05)
  }

  function handlePlayPause() {
    if (!bothLoaded) return
    const [v0, v1] = [videoRefs[0].current, videoRefs[1].current]
    if (!v0 || !v1) return
    if (playing) {
      v0.pause(); v1.pause(); setPlaying(false)
    } else {
      v0.currentTime = slots[0].trimStart; v1.currentTime = slots[1].trimStart
      v0.playbackRate = playbackRate; v1.playbackRate = playbackRate
      v0.play(); v1.play(); setPlaying(true)
    }
  }

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      for (let i = 0; i < 2; i++) {
        const v = videoRefs[i].current
        if (v && v.currentTime >= slots[i].trimEnd) { v.pause(); v.currentTime = slots[i].trimEnd }
      }
      const v0 = videoRefs[0].current; const v1 = videoRefs[1].current
      if (v0 && v1 && v0.paused && v1.paused) setPlaying(false)
    }, 50)
    return () => clearInterval(id)
  }, [playing, slots])

  function handleRateChange(rate: number) {
    setPlaybackRate(rate)
    for (const ref of videoRefs) { if (ref.current) ref.current.playbackRate = rate }
  }

  function handleCapture() {
    const v0 = videoRefs[0].current; const v1 = videoRefs[1].current; const canvas = canvasRef.current
    if (!v0 || !v1 || !canvas) return
    const w0 = v0.videoWidth || 640; const h0 = v0.videoHeight || 360
    const w1 = v1.videoWidth || 640; const h1 = v1.videoHeight || 360
    const targetH = Math.max(h0, h1)
    const cw0 = Math.round(w0 * (targetH / h0)); const cw1 = Math.round(w1 * (targetH / h1))
    const gap = 8
    canvas.width = cw0 + gap + cw1; canvas.height = targetH
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(v0, 0, 0, cw0, targetH); ctx.drawImage(v1, cw0 + gap, 0, cw1, targetH)
    setCapturedImage(canvas.toDataURL('image/jpeg', 0.92))
  }

  function downloadCapture() {
    if (!capturedImage) return
    const a = document.createElement('a'); a.href = capturedImage
    a.download = `swing-compare-${Date.now()}.jpg`; a.click()
  }

  async function detectPhaseFrames(
    candidateFrames: string[], phaseCount: 4 | 6, feedbackHint?: string | null,
  ): Promise<string[]> {
    const phaseKeys = PHASE_SETS[phaseCount].map((p) => p.key)
    try {
      const res = await fetch('/api/detect-phases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames: candidateFrames, phaseCount, provider, geminiModel, feedbackHint }),
      })
      const data = await res.json()
      const indices = phaseKeys.map((key) => data?.indices?.[key])
      const valid =
        res.ok &&
        indices.every((n) => typeof n === 'number' && n >= 0 && n < candidateFrames.length) &&
        indices.every((n, i) => i === 0 || (n as number) > (indices[i - 1] as number))
      if (valid) return indices.map((i) => candidateFrames[i as number])
    } catch {}
    const { phaseFractions } = await import('@/lib/swingPhases')
    return phaseFractions(phaseCount).map(
      (f) => candidateFrames[Math.min(candidateFrames.length - 1, Math.floor(f * candidateFrames.length))],
    )
  }

  async function handleCompareAnalyze() {
    if (!slots[0].file || !slots[1].file) return
    setAnalysisError(null); setComparisonResult(null); setAnalysisProgress(0)

    try {
      const phaseCount = phaseCountForProvider(provider)
      const candidateCount = phaseCount === 6 ? 18 : 10

      setAnalysisStatus('extracting')
      const rangeA = isTrimmed(0) ? { start: slots[0].trimStart, end: slots[0].trimEnd } : undefined
      const rangeB = isTrimmed(1) ? { start: slots[1].trimStart, end: slots[1].trimEnd } : undefined

      const candidatesA = await extractFrames(slots[0].file!, candidateCount, (d, tt) => setAnalysisProgress(Math.round((d / tt) * 16)), rangeA)
      const candidatesB = await extractFrames(slots[1].file!, candidateCount, (d, tt) => setAnalysisProgress(16 + Math.round((d / tt) * 16)), rangeB)
      setAnalysisProgress(33)

      setAnalysisStatus('detecting')
      const detectTimer = window.setInterval(() => setAnalysisProgress((p) => (p < 62 ? p + 1 : p)), 300)

      const activePhases = PHASE_SETS[phaseCount]
      const phaseLabelByKey = Object.fromEntries(activePhases.map((p) => [p.key, p.label]))
      const feedbackHint = await buildPhaseFeedbackHint(activePhases.map((p) => p.key), phaseLabelByKey)

      let framesA: string[], framesB: string[]
      try {
        ;[framesA, framesB] = await Promise.all([
          detectPhaseFrames(candidatesA, phaseCount, feedbackHint),
          detectPhaseFrames(candidatesB, phaseCount, feedbackHint),
        ])
      } finally { window.clearInterval(detectTimer) }
      setAnalysisProgress(66)

      setAnalysisStatus('analyzing')
      const analyzeTimer = window.setInterval(() => setAnalysisProgress((p) => (p < 96 ? p + 1 : p)), 400)

      let res: Response
      try {
        res = await fetch('/api/compare-swings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ framesA, framesB, provider, geminiModel, phaseCount, locale }),
        })
      } finally { window.clearInterval(analyzeTimer) }

      const raw = await res.text()
      let data: any = null
      try { data = raw ? JSON.parse(raw) : null } catch {}

      if (!res.ok || !data) {
        throw new Error(data?.error ?? `${t('compare.analysisFailed')} (${res.status})`)
      }

      setAnalysisProgress(100)
      setComparisonResult(data as ComparisonResult)
      setAnalysisStatus('done')
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : t('analyzer.unknownError'))
      setAnalysisStatus('error')
    }
  }

  const RATES = [0.25, 0.5, 1, 1.5, 2]
  const slotLabels = [t('compare.videoA'), t('compare.videoB')]
  const stageLabel = analysisStatus === 'extracting' ? t('step.extracting') : analysisStatus === 'detecting' ? t('step.detecting') : analysisStatus === 'analyzing' ? t('compare.aiComparisonLabel') : ''

  return (
    <div className="space-y-6">
      <section className={`${card} p-6 space-y-5`}>
        <p className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
          <span aria-hidden>🆚</span> {t('compare.uploadPrompt')}
        </p>

        <div className="grid md:grid-cols-2 gap-5">
          {([0, 1] as const).map((idx) => {
            const slot = slots[idx]
            return (
              <div key={idx} className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{slotLabels[idx]}</p>
                <input
                  ref={fileInputRefs[idx]} type="file" accept="video/*"
                  onChange={(e) => handleFileChange(idx, e)}
                  className="block w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-gradient-to-r file:from-lime-500 file:to-emerald-500 file:text-emerald-950 file:text-sm file:font-semibold file:shadow-[0_0_12px_rgba(132,204,22,0.25)] hover:file:shadow-[0_0_20px_rgba(132,204,22,0.4)] file:transition cursor-pointer"
                />
                {slot.url && (
                  <video
                    ref={videoRefs[idx]} src={slot.url}
                    onLoadedMetadata={(e) => handleMetadata(idx, e)} playsInline muted
                    className="w-full rounded-xl bg-black ring-1 ring-white/10 shadow-inner aspect-video object-contain"
                  />
                )}
                {slot.url && slot.duration != null && slot.duration > MIN_TRIM_SPAN * 2 && (
                  <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                        <span aria-hidden>✂️</span> {t('compare.trimRange')}
                      </p>
                      {isTrimmed(idx) && (
                        <button type="button" onClick={() => resetTrim(idx)}
                          className="text-[10px] text-slate-400 hover:text-lime-300 underline underline-offset-2">{t('compare.fullRange')}</button>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>{t('compare.start')}</span><span className="font-mono text-slate-300">{formatTime(slot.trimStart)}</span>
                      </label>
                      <input type="range" min={0} max={slot.duration} step={0.05} value={slot.trimStart}
                        onChange={(e) => handleTrimStart(idx, Number(e.target.value))} disabled={isBusy} className="w-full accent-lime-400 disabled:cursor-not-allowed disabled:opacity-60" />
                    </div>
                    <div className="space-y-1">
                      <label className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>{t('compare.end')}</span><span className="font-mono text-slate-300">{formatTime(slot.trimEnd)}</span>
                      </label>
                      <input type="range" min={0} max={slot.duration} step={0.05} value={slot.trimEnd}
                        onChange={(e) => handleTrimEnd(idx, Number(e.target.value))} disabled={isBusy} className="w-full accent-lime-400 disabled:cursor-not-allowed disabled:opacity-60" />
                    </div>
                    <p className="text-[10px] text-slate-500 text-right">
                      {t('compare.selectedRange')} <span className="font-mono text-lime-300/80">{formatTime(slot.trimEnd - slot.trimStart)}</span>{' '}
                      / {t('compare.total')} <span className="font-mono">{formatTime(slot.duration)}</span>
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {bothLoaded && (
        <section className={`${card} p-5 space-y-4`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={handlePlayPause}
                className="rounded-full bg-gradient-to-r from-lime-400 via-emerald-400 to-teal-400 text-emerald-950 font-bold px-6 py-2.5 shadow-[0_0_20px_rgba(132,204,22,0.3)] hover:shadow-[0_0_32px_rgba(132,204,22,0.45)] hover:-translate-y-0.5 active:translate-y-0 transition">
                {playing ? t('compare.pause') : t('compare.syncPlay')}
              </button>
              <button type="button" onClick={handleCapture}
                className="rounded-full bg-white/5 border border-white/10 text-slate-300 font-semibold px-5 py-2.5 hover:bg-white/10 hover:border-white/20 transition text-sm">
                {t('compare.capture')}
              </button>
              <button type="button" onClick={handleCompareAnalyze} disabled={isBusy}
                className="rounded-full bg-gradient-to-r from-sky-400 to-indigo-500 text-white font-bold px-6 py-2.5 shadow-[0_0_20px_rgba(56,189,248,0.3)] hover:shadow-[0_0_32px_rgba(56,189,248,0.45)] hover:-translate-y-0.5 active:translate-y-0 transition disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-[0_0_20px_rgba(56,189,248,0.3)] disabled:hover:translate-y-0">
                {isBusy ? t('compare.aiComparing') : t('compare.aiCompare')}
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 mr-1">{t('compare.speed')}</span>
              {RATES.map((r) => (
                <button key={r} type="button" onClick={() => handleRateChange(r)}
                  className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border transition ${
                    playbackRate === r ? 'border-lime-400/50 bg-lime-400/10 text-lime-300' : 'border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20'
                  }`}>{r}x</button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-slate-500">{t('compare.analysisAI')}</span>
            {AI_PROVIDERS.map((p) => (
              <button key={p.id} type="button" onClick={() => setProvider(p.id)} disabled={isBusy}
                className={`text-[11px] font-semibold rounded-full px-3 py-1 border transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  provider === p.id ? 'border-sky-400/50 bg-sky-400/10 text-sky-300' : 'border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20'
                }`}>{p.label}</button>
            ))}
            {provider === 'gemini' && GEMINI_MODELS.map((m) => (
              <button key={m.id} type="button" onClick={() => setGeminiModel(m.id)} disabled={isBusy}
                className={`text-[11px] font-semibold rounded-full px-3 py-1 border transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  geminiModel === m.id ? 'border-violet-400/50 bg-violet-400/10 text-violet-300' : 'border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20'
                }`}>{m.label}</button>
            ))}
          </div>
        </section>
      )}

      {isBusy && (
        <section className={`${card} p-5 space-y-3`}>
          <SwingLoaderAnimation />
          <div className="space-y-1.5">
            <div className="h-2.5 w-full rounded-full bg-white/5 ring-1 ring-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-sky-400 via-indigo-400 to-violet-400 shadow-[0_0_10px_rgba(56,189,248,0.6)] transition-all duration-300 ease-out" style={{ width: `${analysisProgress}%` }} />
            </div>
            <p className="text-xs text-slate-400 text-right">{stageLabel} · {analysisProgress}%</p>
          </div>
        </section>
      )}

      {analysisError && (
        <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">{analysisError}</p>
      )}

      {capturedImage && (
        <section className={`${card} p-5 space-y-3`}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-300 flex items-center gap-1.5"><span aria-hidden>📸</span> {t('compare.captureResult')}</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={downloadCapture}
                className="text-xs font-semibold text-lime-300 bg-lime-400/10 border border-lime-400/20 rounded-full px-3.5 py-1.5 hover:bg-lime-400/20 transition">{t('compare.download')}</button>
              <button type="button" onClick={() => setCapturedImage(null)} className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1">{t('compare.close')}</button>
            </div>
          </div>
          <img src={capturedImage} alt="Swing comparison capture" className="w-full rounded-xl ring-1 ring-white/10" />
        </section>
      )}

      {comparisonResult && (
        <div className="space-y-5 animate-[fadeIn_0.4s_ease-out]">
          <div ref={compareResultRef} className="space-y-5">
          <section className={`${card} p-8 flex flex-col items-center text-center gap-5`}>
            <div className="flex items-center gap-8">
              <ScoreGauge score={comparisonResult.overallScoreA} label={t('compare.videoA')} color={scoreColor(comparisonResult.overallScoreA).stroke} />
              <div className="text-2xl font-bold text-slate-500">VS</div>
              <ScoreGauge score={comparisonResult.overallScoreB} label={t('compare.videoB')} color={scoreColor(comparisonResult.overallScoreB).stroke} />
            </div>
            <p className="text-slate-300 max-w-lg leading-relaxed">{renderEmphasis(comparisonResult.summary)}</p>
          </section>

          <section className={`${card} p-6`}>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-100">
              <span className="text-xl" aria-hidden>📊</span> {t('compare.stageScores')}
            </h3>
            <div className="space-y-4">
              {comparisonResult.stageComparisons.map((sc, i) => (
                <div key={i} className="space-y-1.5">
                  <p className="text-sm font-semibold text-slate-200">{sc.stage}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex items-baseline justify-between text-[11px]">
                        <span className="text-slate-400">{t('compare.videoA')}</span>
                        <span className={`font-bold ${scoreColor(sc.scoreA).text}`}>{sc.scoreA}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                        <div className={`h-full rounded-full ${scoreColor(sc.scoreA).bar} transition-all duration-700`} style={{ width: `${sc.scoreA}%` }} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-baseline justify-between text-[11px]">
                        <span className="text-slate-400">{t('compare.videoB')}</span>
                        <span className={`font-bold ${scoreColor(sc.scoreB).text}`}>{sc.scoreB}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                        <div className={`h-full rounded-full ${scoreColor(sc.scoreB).bar} transition-all duration-700`} style={{ width: `${sc.scoreB}%` }} />
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{renderEmphasis(sc.comparison)}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid md:grid-cols-2 gap-5">
            <section className={`${card} p-6`}>
              <h3 className="font-bold text-base mb-3 flex items-center gap-2 text-slate-100">
                <span className="text-lg" aria-hidden>🅰️</span> {t('compare.strengthsA')}
              </h3>
              <ul className="space-y-2">
                {comparisonResult.aStrengths.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-slate-300 text-sm leading-relaxed">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-lime-400 shadow-[0_0_6px_rgba(163,230,53,0.7)] shrink-0" />
                    <span>{renderEmphasis(s)}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className={`${card} p-6`}>
              <h3 className="font-bold text-base mb-3 flex items-center gap-2 text-slate-100">
                <span className="text-lg" aria-hidden>🅱️</span> {t('compare.strengthsB')}
              </h3>
              <ul className="space-y-2">
                {comparisonResult.bStrengths.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-slate-300 text-sm leading-relaxed">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.7)] shrink-0" />
                    <span>{renderEmphasis(s)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {comparisonResult.commonIssues.length > 0 && (
            <section className={`${card} p-6`}>
              <h3 className="font-bold text-base mb-3 flex items-center gap-2 text-slate-100">
                <span className="text-lg" aria-hidden>⚠️</span> {t('compare.commonIssues')}
              </h3>
              <ul className="space-y-2">
                {comparisonResult.commonIssues.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-slate-300 text-sm leading-relaxed">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)] shrink-0" />
                    <span>{renderEmphasis(s)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={`${card} p-6`}>
            <h3 className="font-bold text-base mb-3 flex items-center gap-2 text-slate-100">
              <span className="text-lg" aria-hidden>💡</span> {t('compare.recommendation')}
            </h3>
            <p className="text-slate-300 text-sm leading-relaxed">{renderEmphasis(comparisonResult.recommendation)}</p>
          </section>
          </div>

          <section className={`${card} p-5`}>
            <ShareButtons
              title={t('share.kakaoCompareTitle')}
              description={`${t('share.compareScoreLabel')}: ${t('compare.videoA')} ${comparisonResult.overallScoreA}/100 vs ${t('compare.videoB')} ${comparisonResult.overallScoreB}/100\n${comparisonResult.summary}`}
              captureTargetRef={compareResultRef}
            />
          </section>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />

      {!slots[0].file && !slots[1].file && (
        <p className="text-center text-sm text-slate-500">
          {t('compare.emptyHint')}
        </p>
      )}
    </div>
  )
}
