'use client'

import { WatchConnectionState, WatchTelemetry } from '@/lib/types'

const STATE_LABEL: Record<WatchConnectionState, string> = {
  disconnected: '연결 안 됨',
  connecting: '연결 중...',
  connected: '워치 연결됨',
  demo: '데모 모드',
  error: '연결 실패',
}

const STATE_DOT: Record<WatchConnectionState, string> = {
  disconnected: 'bg-slate-500',
  connecting: 'bg-amber-400 animate-pulse',
  connected: 'bg-emerald-400',
  demo: 'bg-sky-400 animate-pulse',
  error: 'bg-rose-500',
}

interface WatchConnectProps {
  state: WatchConnectionState
  telemetry: WatchTelemetry | null
  bluetoothSupported: boolean
  onConnectReal: () => void
  onStartDemo: () => void
  onDisconnect: () => void
}

export default function WatchConnect({
  state,
  telemetry,
  bluetoothSupported,
  onConnectReal,
  onStartDemo,
  onDisconnect,
}: WatchConnectProps) {
  const isActive = state === 'connected' || state === 'demo'

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">골프 워치 연결</h2>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className={`h-2 w-2 rounded-full ${STATE_DOT[state]}`} />
          {STATE_LABEL[state]}
        </div>
      </div>

      {!isActive && (
        <div className="space-y-3">
          <button
            onClick={onConnectReal}
            disabled={!bluetoothSupported || state === 'connecting'}
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            실제 워치와 Bluetooth 페어링
          </button>
          {!bluetoothSupported && (
            <p className="text-xs text-rose-400">
              이 브라우저는 Web Bluetooth를 지원하지 않습니다. Android Chrome에서 열어주세요.
            </p>
          )}
          <button
            onClick={onStartDemo}
            className="w-full rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            데모 모드로 미리보기
          </button>
          <p className="text-xs text-slate-500 leading-relaxed">
            워치 제조사(Garmin/Coros 등)는 홀·핀 거리 데이터를 공개 프로토콜로 제공하지 않아,
            실제 연결은 표준 심박수/배터리 정보만 받아옵니다. 홀·거리 정보는 데모 모드이거나
            라운드 탭에서 직접 입력해 사용하세요.
          </p>
        </div>
      )}

      {isActive && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-slate-800/70 py-3">
              <div className="text-2xl font-mono text-emerald-300">
                {telemetry?.heartRate ?? '--'}
              </div>
              <div className="text-xs text-slate-400">심박수 (bpm)</div>
            </div>
            <div className="rounded-xl bg-slate-800/70 py-3">
              <div className="text-2xl font-mono text-sky-300">
                {telemetry?.batteryPercent ?? '--'}%
              </div>
              <div className="text-xs text-slate-400">워치 배터리</div>
            </div>
          </div>
          <button
            onClick={onDisconnect}
            className="w-full rounded-xl border border-rose-800 px-4 py-2 text-sm font-medium text-rose-300 hover:bg-rose-950/40"
          >
            연결 해제
          </button>
        </div>
      )}
    </div>
  )
}
