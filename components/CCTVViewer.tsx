'use client'

import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'

export default function CCTVViewer() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const src = '/api/cctv/stream.m3u8'
    setError(null)
    setIsLive(false)

    let hls: Hls | null = null

    if (Hls.isSupported()) {
      hls = new Hls({ liveSyncDuration: 3, liveMaxLatencyDuration: 10 })
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLive(true)
        video.play().catch(() => {})
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setIsLive(false)
          setError('CCTV 스트림을 불러올 수 없어요. 카메라 연결을 확인해주세요.')
        }
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      const onLoaded = () => {
        setIsLive(true)
        video.play().catch(() => {})
      }
      const onError = () => setError('CCTV 스트림을 불러올 수 없어요. 카메라 연결을 확인해주세요.')
      video.addEventListener('loadedmetadata', onLoaded)
      video.addEventListener('error', onError)
      return () => {
        video.removeEventListener('loadedmetadata', onLoaded)
        video.removeEventListener('error', onError)
      }
    } else {
      setError('이 브라우저는 실시간 스트리밍을 지원하지 않아요.')
    }

    return () => {
      hls?.destroy()
    }
  }, [])

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-slate-700">🏠 우리집 CCTV</h3>
        {isLive && !error && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-red-500">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            LIVE
          </span>
        )}
      </div>
      <div className="aspect-video bg-slate-900 flex items-center justify-center">
        {error ? (
          <div className="text-center px-6 py-10">
            <div className="text-4xl mb-3">📡</div>
            <p className="text-slate-300 text-sm">{error}</p>
          </div>
        ) : (
          <video ref={videoRef} className="w-full h-full" controls muted playsInline />
        )}
      </div>
    </div>
  )
}
