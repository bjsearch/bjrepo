'use client'

import { useRef, useState } from 'react'
import ClubSelector from './ClubSelector'
import AnalysisResult from './AnalysisResult'
import { extractFrames } from '@/lib/extractFrames'
import SwingLoaderAnimation from './SwingLoaderAnimation'
import { fetchGlobalStats, fetchHistory, saveAnalysis } from '@/lib/history'
import { AI_PROVIDERS, AIProvider, ClubSelection, SwingAnalysisResult, describeClub } from '@/lib/types'

type Status = 'idle' | 'extracting' | 'detecting' | 'analyzing' | 'done' | 'error'

/** Frames sampled across the clip for the AI to pick swing-phase frames from. */
const CANDIDATE_FRAME_COUNT = 10

const PHASE_KEYS = ['address', 'backswingTop', 'impact', 'finish'] as const

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
async function detectPhaseFrames(candidateFrames: string[], provider: AIProvider): Promise<string[]> {
  try {
    const res = await fetch('/api/detect-phases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frames: candidateFrames, provider }),
    })
    const raw = await res.text()
    const data = raw ? JSON.parse(raw) : null
    const indices = PHASE_KEYS.map((key) => data?.indices?.[key])
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

  const fallbackFractions = [0.05, 0.35, 0.65, 0.95]
  return fallbackFractions.map(
    (f) => candidateFrames[Math.min(candidateFrames.length - 1, Math.floor(f * candidateFrames.length))],
  )
}

export default function SwingAnalyzer() {
  const [file, setFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [club, setClub] = useState<ClubSelection>({ category: 'iron', number: 7 })
  const [provider, setProvider] = useState<AIProvider>('anthropic')
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SwingAnalysisResult | null>(null)
  const [frames, setFrames] = useState<string[]>([])
  const [myAverageScore, setMyAverageScore] = useState<number | null>(null)
  const [globalAverageScore, setGlobalAverageScore] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoUrl(selected ? URL.createObjectURL(selected) : null)
  }

  async function handleAnalyze() {
    if (!file) return
    setError(null)
    setSaveError(null)
    setResult(null)
    setProgress(0)

    try {
      // 1단계: 영상에서 후보 프레임 추출 (0–33%)
      setStatus('extracting')
      const candidateFrames = await extractFrames(file, CANDIDATE_FRAME_COUNT, (done, total) => {
        setProgress(Math.round((done / total) * 33))
      })

      // 2단계: 어드레스·백스윙 탑·임팩트·피니쉬 구간 탐지 (33–66%, 애니메이션)
      setStatus('detecting')
      const detectingTimer = window.setInterval(() => {
        setProgress((p) => (p < 65 ? p + 1 : p))
      }, 250)

      let phaseFrames: string[]
      try {
        phaseFrames = await detectPhaseFrames(candidateFrames, provider)
      } finally {
        window.clearInterval(detectingTimer)
      }
      setProgress(66)
      setFrames(phaseFrames)

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
          body: JSON.stringify({ frames: phaseFrames, clubDescription: describeClub(club), provider }),
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
          <video src={videoUrl} controls className="w-full max-h-96 rounded-xl bg-black ring-1 ring-white/10 shadow-inner" />
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
          />
        </>
      )}
    </div>
  )
}
