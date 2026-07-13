'use client'

import { useEffect, useRef, useState } from 'react'
import { ClubProfileEntry, RoundState, VoiceExchange, WatchTelemetry } from '@/lib/types'

interface VoiceBarProps {
  telemetry: WatchTelemetry | null
  recommendedClub: ClubProfileEntry | null
  round: RoundState
  onNextHole: () => void
  onPrevHole: () => void
}

function buildReply(
  heard: string,
  telemetry: WatchTelemetry | null,
  recommendedClub: ClubProfileEntry | null,
  round: RoundState,
  onNextHole: () => void,
  onPrevHole: () => void
): string {
  const text = heard.toLowerCase()

  if (text.includes('다음 홀') || text.includes('다음홀')) {
    onNextHole()
    return `다음 홀로 이동합니다.`
  }
  if (text.includes('이전 홀') || text.includes('이전홀')) {
    onPrevHole()
    return `이전 홀로 이동합니다.`
  }
  if (text.includes('클럽')) {
    return recommendedClub
      ? `추천 클럽은 ${recommendedClub.label}입니다.`
      : '아직 거리 정보가 없어 클럽을 추천할 수 없어요.'
  }
  if (text.includes('거리') || text.includes('미터') || text.includes('남았')) {
    if (!telemetry) return '워치를 먼저 연결하거나 거리를 입력해 주세요.'
    return `핀까지 ${telemetry.distanceToPinCenter}미터 남았습니다.`
  }
  if (text.includes('스코어') || text.includes('타수')) {
    const played = round.holes.filter((h) => h.strokes > 0)
    const toPar = played.reduce((sum, h) => sum + (h.strokes - h.par), 0)
    if (played.length === 0) return '아직 입력된 타수가 없어요.'
    return `현재 ${played.length}개 홀 기준 ${toPar > 0 ? `+${toPar}` : toPar}타입니다.`
  }
  return '다시 한번 말씀해 주세요. "핀까지 거리", "클럽 추천", "다음 홀"처럼 말해보세요.'
}

export default function VoiceBar({
  telemetry,
  recommendedClub,
  round,
  onNextHole,
  onPrevHole,
}: VoiceBarProps) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [exchanges, setExchanges] = useState<VoiceExchange[]>([])
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition
    setSupported(!!Ctor)
    if (!Ctor) return

    const recognition = new Ctor()
    recognition.lang = 'ko-KR'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (event) => {
      const heard = event.results[0]?.[0]?.transcript ?? ''
      const reply = buildReply(heard, telemetry, recommendedClub, round, onNextHole, onPrevHole)
      setExchanges((prev) =>
        [{ id: Date.now().toString(), heard, reply, at: Date.now() }, ...prev].slice(0, 5)
      )
      speak(reply)
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)

    recognitionRef.current = recognition
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telemetry, recommendedClub, round])

  function speak(text: string) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ko-KR'
    window.speechSynthesis.speak(utterance)
  }

  function toggleListening() {
    if (!recognitionRef.current) return
    if (listening) {
      recognitionRef.current.stop()
      setListening(false)
    } else {
      recognitionRef.current.start()
      setListening(true)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">음성 명령 ("Hey Meta" 시뮬레이션)</h2>
      </div>

      {supported ? (
        <button
          onClick={toggleListening}
          className={`w-full rounded-xl px-4 py-3 text-sm font-medium transition ${
            listening
              ? 'bg-rose-500 text-white'
              : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
          }`}
        >
          {listening ? '듣는 중... 탭하여 중지' : '마이크로 말하기'}
        </button>
      ) : (
        <p className="text-xs text-rose-400">
          이 브라우저는 음성 인식을 지원하지 않습니다. Chrome에서 열어주세요.
        </p>
      )}

      <p className="text-xs text-slate-500">
        예: "핀까지 거리 알려줘", "클럽 추천해줘", "다음 홀", "스코어 알려줘"
      </p>

      {exchanges.length > 0 && (
        <div className="space-y-2">
          {exchanges.map((ex) => (
            <div key={ex.id} className="rounded-lg bg-slate-800/50 p-2 text-xs">
              <div className="text-slate-400">🎤 {ex.heard}</div>
              <div className="text-emerald-300">🔊 {ex.reply}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
