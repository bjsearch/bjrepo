'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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

const card = 'rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.35)]'

export default function SwingCompare() {
  const [slots, setSlots] = useState<[VideoSlot, VideoSlot]>([emptySlot(), emptySlot()])
  const videoRefs = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)]
  const fileInputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [playing, setPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)

  const bothLoaded = slots[0].duration != null && slots[1].duration != null

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
    updateSlot(idx, {
      file,
      url: file ? URL.createObjectURL(file) : null,
      duration: null,
      trimStart: 0,
      trimEnd: 0,
    })
    setPlaying(false)
    setCapturedImage(null)
  }

  function handleMetadata(idx: 0 | 1, e: React.SyntheticEvent<HTMLVideoElement>) {
    const dur = e.currentTarget.duration
    if (isFinite(dur) && dur > 0) {
      updateSlot(idx, { duration: dur, trimStart: 0, trimEnd: dur })
    }
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

  // --- Synced playback ---
  function handlePlayPause() {
    if (!bothLoaded) return
    const [v0, v1] = [videoRefs[0].current, videoRefs[1].current]
    if (!v0 || !v1) return

    if (playing) {
      v0.pause()
      v1.pause()
      setPlaying(false)
    } else {
      v0.currentTime = slots[0].trimStart
      v1.currentTime = slots[1].trimStart
      v0.playbackRate = playbackRate
      v1.playbackRate = playbackRate
      v0.play()
      v1.play()
      setPlaying(true)
    }
  }

  // Enforce trim boundaries during playback
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      for (let i = 0; i < 2; i++) {
        const v = videoRefs[i].current
        if (v && v.currentTime >= slots[i].trimEnd) {
          v.pause()
          v.currentTime = slots[i].trimEnd
        }
      }
      const v0 = videoRefs[0].current
      const v1 = videoRefs[1].current
      if (v0 && v1 && v0.paused && v1.paused) {
        setPlaying(false)
      }
    }, 50)
    return () => clearInterval(id)
  }, [playing, slots])

  function handleRateChange(rate: number) {
    setPlaybackRate(rate)
    for (const ref of videoRefs) {
      if (ref.current) ref.current.playbackRate = rate
    }
  }

  // --- Capture ---
  function handleCapture() {
    const v0 = videoRefs[0].current
    const v1 = videoRefs[1].current
    const canvas = canvasRef.current
    if (!v0 || !v1 || !canvas) return

    const w0 = v0.videoWidth || 640
    const h0 = v0.videoHeight || 360
    const w1 = v1.videoWidth || 640
    const h1 = v1.videoHeight || 360

    const targetH = Math.max(h0, h1)
    const scale0 = targetH / h0
    const scale1 = targetH / h1
    const cw0 = Math.round(w0 * scale0)
    const cw1 = Math.round(w1 * scale1)
    const gap = 8

    canvas.width = cw0 + gap + cw1
    canvas.height = targetH
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(v0, 0, 0, cw0, targetH)
    ctx.drawImage(v1, cw0 + gap, 0, cw1, targetH)

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    setCapturedImage(dataUrl)
  }

  function downloadCapture() {
    if (!capturedImage) return
    const a = document.createElement('a')
    a.href = capturedImage
    a.download = `swing-compare-${Date.now()}.jpg`
    a.click()
  }

  const RATES = [0.25, 0.5, 1, 1.5, 2]
  const slotLabels = ['영상 A', '영상 B'] as const

  return (
    <div className="space-y-6">
      {/* Upload section */}
      <section className={`${card} p-6 space-y-5`}>
        <p className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
          <span aria-hidden>🆚</span> 두 스윙 영상을 업로드해서 비교하세요
        </p>

        <div className="grid md:grid-cols-2 gap-5">
          {([0, 1] as const).map((idx) => {
            const slot = slots[idx]
            return (
              <div key={idx} className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{slotLabels[idx]}</p>
                <input
                  ref={fileInputRefs[idx]}
                  type="file"
                  accept="video/*"
                  onChange={(e) => handleFileChange(idx, e)}
                  className="block w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-gradient-to-r file:from-lime-500 file:to-emerald-500 file:text-emerald-950 file:text-sm file:font-semibold file:shadow-[0_0_12px_rgba(132,204,22,0.25)] hover:file:shadow-[0_0_20px_rgba(132,204,22,0.4)] file:transition cursor-pointer"
                />

                {slot.url && (
                  <video
                    ref={videoRefs[idx]}
                    src={slot.url}
                    onLoadedMetadata={(e) => handleMetadata(idx, e)}
                    playsInline
                    muted
                    className="w-full rounded-xl bg-black ring-1 ring-white/10 shadow-inner aspect-video object-contain"
                  />
                )}

                {slot.url && slot.duration != null && slot.duration > MIN_TRIM_SPAN * 2 && (
                  <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                        <span aria-hidden>✂️</span> 재생 구간
                      </p>
                      {isTrimmed(idx) && (
                        <button
                          type="button"
                          onClick={() => resetTrim(idx)}
                          className="text-[10px] text-slate-400 hover:text-lime-300 underline underline-offset-2"
                        >
                          전체 구간
                        </button>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>시작</span>
                        <span className="font-mono text-slate-300">{formatTime(slot.trimStart)}</span>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={slot.duration}
                        step={0.05}
                        value={slot.trimStart}
                        onChange={(e) => handleTrimStart(idx, Number(e.target.value))}
                        className="w-full accent-lime-400"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>끝</span>
                        <span className="font-mono text-slate-300">{formatTime(slot.trimEnd)}</span>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={slot.duration}
                        step={0.05}
                        value={slot.trimEnd}
                        onChange={(e) => handleTrimEnd(idx, Number(e.target.value))}
                        className="w-full accent-lime-400"
                      />
                    </div>

                    <p className="text-[10px] text-slate-500 text-right">
                      선택 구간: <span className="font-mono text-lime-300/80">{formatTime(slot.trimEnd - slot.trimStart)}</span>{' '}
                      / 전체 <span className="font-mono">{formatTime(slot.duration)}</span>
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Playback controls */}
      {bothLoaded && (
        <section className={`${card} p-5 space-y-4`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePlayPause}
                className="rounded-full bg-gradient-to-r from-lime-400 via-emerald-400 to-teal-400 text-emerald-950 font-bold px-6 py-2.5 shadow-[0_0_20px_rgba(132,204,22,0.3)] hover:shadow-[0_0_32px_rgba(132,204,22,0.45)] hover:-translate-y-0.5 active:translate-y-0 transition"
              >
                {playing ? '⏸ 정지' : '▶ 동시 재생'}
              </button>

              <button
                type="button"
                onClick={handleCapture}
                className="rounded-full bg-white/5 border border-white/10 text-slate-300 font-semibold px-5 py-2.5 hover:bg-white/10 hover:border-white/20 transition text-sm"
              >
                📸 캡쳐
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 mr-1">배속</span>
              {RATES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleRateChange(r)}
                  className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border transition ${
                    playbackRate === r
                      ? 'border-lime-400/50 bg-lime-400/10 text-lime-300'
                      : 'border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20'
                  }`}
                >
                  {r}x
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Captured image */}
      {capturedImage && (
        <section className={`${card} p-5 space-y-3`}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
              <span aria-hidden>📸</span> 캡쳐 결과
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={downloadCapture}
                className="text-xs font-semibold text-lime-300 bg-lime-400/10 border border-lime-400/20 rounded-full px-3.5 py-1.5 hover:bg-lime-400/20 transition"
              >
                다운로드
              </button>
              <button
                type="button"
                onClick={() => setCapturedImage(null)}
                className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1"
              >
                닫기
              </button>
            </div>
          </div>
          <img
            src={capturedImage}
            alt="스윙 비교 캡쳐"
            className="w-full rounded-xl ring-1 ring-white/10"
          />
        </section>
      )}

      <canvas ref={canvasRef} className="hidden" />

      {!slots[0].file && !slots[1].file && (
        <p className="text-center text-sm text-slate-500">
          두 개의 스윙 영상을 올리면 나란히 재생하며 비교할 수 있고, 원하는 순간을 캡쳐해 저장할 수 있습니다.
        </p>
      )}
    </div>
  )
}
