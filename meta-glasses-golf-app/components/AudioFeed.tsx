'use client'

import {
  AnnouncementEvent,
  AudioSettings,
  ClubProfileEntry,
  WatchConnectionState,
  WatchTelemetry,
} from '@/lib/types'

const REASON_ICON: Record<AnnouncementEvent['reason'], string> = {
  hole: '🏌️',
  shot: '⛳',
  query: '🎙️',
  manual: '🔁',
}

interface AudioFeedProps {
  telemetry: WatchTelemetry | null
  recommendedClub: ClubProfileEntry | null
  connectionState: WatchConnectionState
  settings: AudioSettings
  onSettingsChange: (settings: AudioSettings) => void
  announcements: AnnouncementEvent[]
  onReplayDistance: () => void
}

export default function AudioFeed({
  telemetry,
  recommendedClub,
  connectionState,
  settings,
  onSettingsChange,
  announcements,
  onReplayDistance,
}: AudioFeedProps) {
  const hasData = connectionState === 'demo' || connectionState === 'connected'

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">오디오 안내</h2>
        <span className="text-xs text-slate-500">디스플레이 없는 기기 전용</span>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        이 기기는 화면이 없다고 가정합니다. 안경으로 전달되는 정보는 모두{' '}
        <span className="text-slate-300">음성 안내(스피커)</span>로만 나갑니다. 아래 목록은
        안경이 아니라 <span className="text-slate-300">폰 화면에서 보는 자막/로그</span>일
        뿐입니다.
      </p>

      <div className="rounded-xl bg-slate-800/50 p-3 text-sm">
        {!hasData ? (
          <span className="text-slate-500">워치 연결 대기 중 — 데모 모드나 워치를 연결하세요.</span>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-slate-300">
              {telemetry?.holeNumber ?? '-'}번 홀 · 핀까지 {telemetry?.distanceToPinCenter ?? '--'}m
            </span>
            <span className="rounded bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300">
              {recommendedClub?.label ?? '-'}
            </span>
          </div>
        )}
      </div>

      <button
        onClick={onReplayDistance}
        disabled={!hasData}
        className="w-full rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-600"
      >
        🔊 지금 거리 다시 듣기
      </button>

      <div className="space-y-2">
        <ToggleRow
          label="홀 시작 시 자동 음성 안내"
          checked={settings.autoAnnounceHole}
          onChange={(v) => onSettingsChange({ ...settings, autoAnnounceHole: v })}
        />
        <ToggleRow
          label="샷 감지 후 자동 음성 안내"
          checked={settings.autoAnnounceShot}
          onChange={(v) => onSettingsChange({ ...settings, autoAnnounceShot: v })}
        />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          최근 음성 안내 기록
        </h3>
        {announcements.length === 0 ? (
          <p className="text-xs text-slate-600">아직 안내된 내용이 없어요.</p>
        ) : (
          <div className="space-y-1.5">
            {announcements.slice(0, 6).map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-2 rounded-lg bg-slate-800/40 px-2 py-1.5 text-xs text-slate-300"
              >
                <span>{REASON_ICON[a.reason]}</span>
                <span>{a.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between rounded-lg bg-slate-800/40 px-3 py-2 text-sm text-slate-300">
      {label}
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`h-5 w-9 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-700'}`}
      >
        <span
          className={`block h-4 w-4 translate-x-0.5 rounded-full bg-white transition ${
            checked ? 'translate-x-4' : ''
          }`}
        />
      </button>
    </label>
  )
}
