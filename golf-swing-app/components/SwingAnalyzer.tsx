'use client'

import { useRef, useState } from 'react'
import ClubSelector from './ClubSelector'
import AnalysisResult from './AnalysisResult'
import { extractFrames } from '@/lib/extractFrames'
import { ClubSelection, SwingAnalysisResult, describeClub } from '@/lib/types'

type Status = 'idle' | 'extracting' | 'analyzing' | 'done' | 'error'

export default function SwingAnalyzer() {
  const [file, setFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [club, setClub] = useState<ClubSelection>({ category: 'iron', number: 7 })
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SwingAnalysisResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    setFile(selected)
    setResult(null)
    setError(null)
    setStatus('idle')
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoUrl(selected ? URL.createObjectURL(selected) : null)
  }

  async function handleAnalyze() {
    if (!file) return
    setError(null)
    setResult(null)

    try {
      setStatus('extracting')
      const frames = await extractFrames(file, 6)

      setStatus('analyzing')
      const res = await fetch('/api/analyze-swing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames, clubDescription: describeClub(club) }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error ?? '분석 요청이 실패했습니다.')
      }

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
      <section className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">스윙 영상 업로드</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:text-sm file:font-medium hover:file:bg-emerald-700 cursor-pointer"
          />
        </div>

        {videoUrl && (
          <video src={videoUrl} controls className="w-full max-h-96 rounded-lg bg-black" />
        )}

        <ClubSelector value={club} onChange={setClub} />

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={!file || isBusy}
          className="w-full rounded-lg bg-emerald-600 text-white font-medium py-3 transition hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {status === 'extracting' && '영상에서 프레임 추출 중...'}
          {status === 'analyzing' && 'AI가 스윙을 분석하는 중...'}
          {(status === 'idle' || status === 'done' || status === 'error') && '스윙 분석하기'}
        </button>

        {error && (
          <p className="text-sm text-rose-600 bg-rose-50 rounded-lg p-3">{error}</p>
        )}
      </section>

      {result && <AnalysisResult result={result} />}
    </div>
  )
}
