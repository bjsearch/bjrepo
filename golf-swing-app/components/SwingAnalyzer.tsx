'use client'

import { useRef, useState } from 'react'
import ClubSelector from './ClubSelector'
import AnalysisResult from './AnalysisResult'
import { extractFrames } from '@/lib/extractFrames'
import { ClubSelection, SwingAnalysisResult, describeClub } from '@/lib/types'

type Status = 'idle' | 'extracting' | 'analyzing' | 'done' | 'error'

const FRAME_COUNT = 6

export default function SwingAnalyzer() {
  const [file, setFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [club, setClub] = useState<ClubSelection>({ category: 'iron', number: 7 })
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SwingAnalysisResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    setFile(selected)
    setResult(null)
    setError(null)
    setStatus('idle')
    setProgress(0)
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoUrl(selected ? URL.createObjectURL(selected) : null)
  }

  async function handleAnalyze() {
    if (!file) return
    setError(null)
    setResult(null)
    setProgress(0)

    try {
      setStatus('extracting')
      const frames = await extractFrames(file, FRAME_COUNT, (done, total) => {
        // Frame extraction = first half of the progress bar (0–50%)
        setProgress(Math.round((done / total) * 50))
      })

      setStatus('analyzing')
      // The analysis call itself can't report real progress, so animate
      // smoothly from 50% toward 90% while waiting for the response.
      const analyzingTimer = window.setInterval(() => {
        setProgress((p) => (p < 90 ? p + 1 : p))
      }, 400)

      let res: Response
      try {
        res = await fetch('/api/analyze-swing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frames, clubDescription: describeClub(club) }),
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
      setResult(data as SwingAnalysisResult)
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.')
      setStatus('error')
    }
  }

  const isBusy = status === 'extracting' || status === 'analyzing'

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200/70 bg-white/80 backdrop-blur shadow-sm p-6 space-y-5">
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">스윙 영상 업로드</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-5 file:rounded-full file:border-0 file:bg-gradient-to-r file:from-emerald-500 file:to-teal-500 file:text-white file:text-sm file:font-semibold file:shadow-sm hover:file:shadow-md file:transition cursor-pointer"
          />
        </div>

        {videoUrl && (
          <video src={videoUrl} controls className="w-full max-h-96 rounded-xl bg-black shadow-inner" />
        )}

        <ClubSelector value={club} onChange={setClub} />

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={!file || isBusy}
          className="w-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-semibold py-3.5 shadow-md transition hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 disabled:bg-none disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed disabled:translate-y-0"
        >
          {status === 'extracting' && '영상에서 프레임 추출 중...'}
          {status === 'analyzing' && 'AI가 스윙을 분석하는 중...'}
          {(status === 'idle' || status === 'done' || status === 'error') && '스윙 분석하기'}
        </button>

        {isBusy && (
          <div className="space-y-1.5">
            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 text-right">
              {status === 'extracting' ? '프레임 추출' : 'AI 분석'} · {progress}%
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-3">{error}</p>
        )}
      </section>

      {result && <AnalysisResult result={result} />}
    </div>
  )
}
