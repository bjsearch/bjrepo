'use client'

import { useState } from 'react'
import { RoundState } from '@/lib/types'

interface RoundPanelProps {
  round: RoundState
  onSelectHole: (hole: number) => void
  onUpdateHole: (hole: number, patch: { par?: number; strokes?: number; putts?: number }) => void
  onManualDistance: (meters: number) => void
  onResetRound: () => void
}

export default function RoundPanel({
  round,
  onSelectHole,
  onUpdateHole,
  onManualDistance,
  onResetRound,
}: RoundPanelProps) {
  const [manualInput, setManualInput] = useState('')
  const current = round.holes.find((h) => h.hole === round.currentHole) ?? round.holes[0]

  const totalPar = round.holes.reduce((sum, h) => sum + h.par, 0)
  const totalStrokes = round.holes.reduce((sum, h) => sum + h.strokes, 0)
  const playedHoles = round.holes.filter((h) => h.strokes > 0)
  const toPar = playedHoles.reduce((sum, h) => sum + (h.strokes - h.par), 0)

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">라운드 스코어</h2>
        <button onClick={onResetRound} className="text-xs text-slate-500 hover:text-rose-400">
          새 라운드
        </button>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => onSelectHole(Math.max(1, round.currentHole - 1))}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          이전
        </button>
        <div className="text-center">
          <div className="text-3xl font-bold text-white">{round.currentHole}번 홀</div>
          <div className="text-xs text-slate-500">Par {current.par}</div>
        </div>
        <button
          onClick={() => onSelectHole(Math.min(18, round.currentHole + 1))}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          다음
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <ScoreStepper
          label="파(Par)"
          value={current.par}
          min={3}
          max={5}
          onChange={(v) => onUpdateHole(round.currentHole, { par: v })}
        />
        <ScoreStepper
          label="타수"
          value={current.strokes}
          min={0}
          max={12}
          onChange={(v) => onUpdateHole(round.currentHole, { strokes: v })}
        />
        <ScoreStepper
          label="퍼트"
          value={current.putts}
          min={0}
          max={6}
          onChange={(v) => onUpdateHole(round.currentHole, { putts: v })}
        />
      </div>

      <div className="flex gap-2">
        <input
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          inputMode="numeric"
          placeholder="핀까지 거리 직접 입력 (m)"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
        />
        <button
          onClick={() => {
            const meters = Number(manualInput)
            if (Number.isFinite(meters) && meters > 0) {
              onManualDistance(meters)
              setManualInput('')
            }
          }}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950"
        >
          적용
        </button>
      </div>
      <p className="text-xs text-slate-500">
        워치가 홀·핀 거리를 자동 전송하지 않는 경우(대부분의 실제 기기), 워치 화면에 표시된
        거리를 여기 입력하면 HUD와 클럽 추천에 반영됩니다.
      </p>

      <div className="rounded-xl bg-slate-800/50 p-3 text-sm">
        <div className="flex justify-between text-slate-300">
          <span>합계 (Par {totalPar})</span>
          <span className="font-mono">
            {totalStrokes || '-'} {playedHoles.length > 0 && (
              <span className={toPar > 0 ? 'text-rose-400' : toPar < 0 ? 'text-emerald-400' : 'text-slate-400'}>
                ({toPar > 0 ? `+${toPar}` : toPar})
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}

function ScoreStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-2 text-center">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-xl font-mono text-white">{value}</div>
      <div className="mt-1 flex justify-center gap-1">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="h-6 w-6 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
        >
          −
        </button>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="h-6 w-6 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
        >
          +
        </button>
      </div>
    </div>
  )
}
