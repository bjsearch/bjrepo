'use client'

import { useRef, useState } from 'react'
import ClubSelector from './ClubSelector'
import AnalysisResult from './AnalysisResult'
import { extractFrames } from '@/lib/extractFrames'
import SwingLoaderAnimation from './SwingLoaderAnimation'
import { PHASE_SETS, phaseCountForProvider, phaseFractions, phaseLabels } from '@/lib/swingPhases'
import { fetchGlobalStats, fetchHistory, saveAnalysis } from '@/lib/history'
import {
  AI_PROVIDERS,
  AIProvider,
  ClubSelection,
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODELS,
  SwingAnalysisResult,
  describeClub,
} from '@/lib/types'

type Status = 'idle' | 'extracting' | 'detecting' | 'analyzing' | 'done' | 'error'

/** Frames sampled across the clip for the AI to pick swing-phase frames from (more candidates for finer 6-phase picks). */
function candidateFrameCount(phaseCount: 4 | 6): number {
  return phaseCount === 6 ? 18 : 10
}

/** Smallest allowed trimmed-clip length, in seconds, so there's still enough footage to sample frames from. */
const MIN_TRIM_SPAN = 0.5

function formatTime(seconds: number): string {
  const total = Math.max(0, seconds)
  const minutes = Math.floor(total / 60)
  const secs = (total % 60).toFixed(1).padStart(4, '0')
  return `${minutes}:${secs}`
}

const STEPS: { key: Status; label: string }[] = [
  { key: 'extracting', label: '프레임 추출' },
  { key: 'detecting', label: '스윙 구간 탐지' },
  { key: 'analyzing', label: 'AI 스윙 분석' },
]

function StepIndicator({ status }: { status: Status }) {
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

/**
 * Asks the AI to pick which of the sampled candidate frames best represent
 * each swing phase (in time order). Falls back to heuristic positions if the
 * detection call fails or returns something unusable.
 */
async function detectPhaseFrames(
  candidateFrames: string[],
  phaseCount: 4 | 6,
  provider: AIProvider,
  geminiModel: string,
): Promise<string[]> {
  const phaseKeys = PHASE_SETS[phaseCount].map((p) => p.key)

  try {
    const res = await fetch('/api/detect-phases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frames: candidateFrames, phaseCount, provider, geminiModel }),
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
  const [file, setFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoDuration, setVideoDuration] = useState<number | null>(null)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [club, setClub] = useState<ClubSelection>({ category: 'iron', number: 7 })
  const [provider, setProvider] = useState<AIProvider>('anthropic')
  const [geminiModel, setGeminiModel] = useState<string>(DEFAULT_GEMINI_MODEL)
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SwingAnalysisResult | null>(null)
  const [frames, setFrames] = useState<string[]>([])
  const [framePhaseCount, setFramePhaseCount] = useState<4 | 6>(4)
  const [myAverageScore, setMyAverageScore] = useState<number | null>(null)
  const [globalAverageScore, setGlobalAverageScore] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    setFile(selected)
    setResult(null)
    setFrames([])
    setMyAverageScore(null)
    setGlobalAverageScore(null)
    setError(null)
    setStatus('idle')
    setProgress(0)
    setVideoDuration(null)
    setTrimStart(0)
    setTrimEnd(0)
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoUrl(selected ? URL.createObjectURL(selected) : null)
  }

  function handleVideoLoadedMetadata(e: React.SyntheticEvent<HTMLVideoElement>) {
    const duration = e.currentTarget.duration
    if (isFinite(duration) && duration > 0) {
      setVideoDuration(duration)
      setTrimStart(0)
      setTrimEnd(duration)
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

  async function handleAnalyze() {
    if (!file) return
    setError(null)
    setSaveError(null)
    setResult(null)
    setProgress(0)

    try {
      const phaseCount = phaseCountForProvider(provider)

      // 1단계: 영상에서 후보 프레임 추출 (0–33%)
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

      // 2단계: 스윙 구간 탐지 (33–66%, 애니메이션)
      setStatus('detecting')
      const detectingTimer = window.setInterval(() => {
        setProgress((p) => (p < 65 ? p + 1 : p))
      }, 250)

      let phaseFrames: string[]
      try {
        phaseFrames = await detectPhaseFrames(candidateFrames, phaseCount, provider, geminiModel)
      } finally {
        window.clearInterval(detectingTimer)
      }
      setProgress(66)
      setFrames(phaseFrames)
      setFramePhaseCount(phaseCount)

      // 3단계: AI 스윙 분석 (66–96%, 애니메이션)
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
        // Non-JSON response (e.g. function timeout/HTML error page from the host)
      }

      if (!res.ok || !data) {
        const detail = data?.error ?? raw.slice(0, 200) ?? `HTTP ${res.status}`
        throw new Error(
          data?.error ??
            `분석 요청이 실패했습니다. (${res.status}) ${detail ? '- ' + detail : ''}`,
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

      try {
        await saveAnalysis(club, analysisResult)
        setSaveError(null)
      } catch (saveErr) {
        setSaveError(saveErr instanceof Error ? saveErr.message : '분석 결과를 캘린더에 저장하지 못했습니다.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.')
      setStatus('error')
    }
  }

  const isBusy = status === 'extracting' || status === 'detecting' || status === 'analyzing'

  const stageLabel =
    status === 'extracting'
      ? '프레임 추출'
      : status === 'detecting'
        ? '스윙 구간 탐지'
        : status === 'analyzing'
          ? 'AI 분석'
          : ''

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.35)] p-6 space-y-5">
        <div>
          <p className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
            <span aria-hidden>🎥</span> 스윙 영상 업로드
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
                <span aria-hidden>✂️</span> 분석 구간 자르기
              </p>
              {isTrimmed && (
                <button
                  type="button"
                  onClick={resetTrim}
                  disabled={isBusy}
                  className="text-[11px] text-slate-400 hover:text-lime-300 underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  전체 구간으로 되돌리기
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              스윙 동작이 들어있는 구간만 잘라서 분석하면 더 정확한 결과를 얻을 수 있어요. 슬라이더를 옮기면 영상이 해당 지점으로 이동합니다.
            </p>

            <div className="space-y-1.5">
              <label className="flex items-center justify-between text-[11px] text-slate-400">
                <span>시작 지점</span>
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
                <span>끝 지점</span>
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
              선택한 구간 길이: <span className="font-mono text-lime-300/80">{formatTime(trimEnd - trimStart)}</span> / 전체{' '}
              <span className="font-mono">{formatTime(videoDuration)}</span>
            </p>
          </div>
        )}

        <ClubSelector value={club} onChange={setClub} />

        <div>
          <p className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
            <span aria-hidden>🤖</span> 분석 AI 선택
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
                <span className="block text-[11px] text-slate-500 mt-0.5">{p.description}</span>
              </button>
            ))}
          </div>
        </div>

        {provider === 'gemini' && (
          <div>
            <p className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
              <span aria-hidden>✨</span> Gemini 모델 선택
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
                  <span className="block text-[11px] text-slate-500 mt-0.5">{m.description}</span>
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
          {status === 'extracting' && '영상에서 프레임 추출 중...'}
          {status === 'detecting' && '스윙 구간(어드레스·백스윙 탑·임팩트·피니쉬) 탐지 중...'}
          {status === 'analyzing' && 'AI가 스윙을 분석하는 중...'}
          {(status === 'idle' || status === 'done' || status === 'error') && '⛳ 스윙 분석하기'}
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
              ✅ 분석 결과가 오늘 날짜의 캘린더에 저장되었습니다 — 상단 "캘린더" 탭에서 확인하세요.
            </p>
          )}
          <AnalysisResult
            result={result}
            myAverageScore={myAverageScore}
            globalAverageScore={globalAverageScore}
            frames={frames}
            frameLabels={phaseLabels(framePhaseCount)}
          />
        </>
      )}
    </div>
  )
}
