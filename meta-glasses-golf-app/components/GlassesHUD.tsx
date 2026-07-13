'use client'

import { ClubProfileEntry, WatchConnectionState, WatchTelemetry } from '@/lib/types'

interface GlassesHUDProps {
  telemetry: WatchTelemetry | null
  recommendedClub: ClubProfileEntry | null
  connectionState: WatchConnectionState
}

export default function GlassesHUD({ telemetry, recommendedClub, connectionState }: GlassesHUDProps) {
  const hasData = connectionState === 'demo' || connectionState === 'connected'

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">글래스 디스플레이 미리보기</h2>
        <span className="text-xs text-slate-500">Meta 스마트 안경 HUD 시뮬레이션</span>
      </div>

      {/* Simulated in-lens HUD panel — small, high-contrast, glanceable */}
      <div className="mx-auto aspect-[3/2] w-full max-w-xs rounded-xl bg-black p-4 font-mono text-white shadow-[0_0_40px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30">
        {!hasData ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <span className="text-xs text-slate-500">워치 연결 대기 중</span>
            <span className="text-[10px] text-slate-600">데모 모드 또는 워치를 연결하세요</span>
          </div>
        ) : (
          <div className="flex h-full flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-emerald-400">
              <span>Hole {telemetry?.holeNumber ?? '-'}</span>
              <span>{telemetry?.batteryPercent ?? '--'}%</span>
            </div>

            <div className="text-center">
              <div className="text-5xl font-bold leading-none tabular-nums">
                {telemetry?.distanceToPinCenter ?? '--'}
                <span className="ml-1 text-lg font-normal text-slate-400">m</span>
              </div>
              <div className="mt-1 text-[10px] text-slate-500">
                F {telemetry?.distanceToPinFront ?? '--'} · C{' '}
                {telemetry?.distanceToPinCenter ?? '--'} · B {telemetry?.distanceToPinBack ?? '--'}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="rounded bg-emerald-500/20 px-2 py-1 text-emerald-300">
                추천 클럽: {recommendedClub?.label ?? '-'}
              </span>
              {telemetry?.lastShotDistance ? (
                <span className="text-slate-400">직전 샷 {telemetry.lastShotDistance}m</span>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Meta 스마트 안경은 서드파티 앱을 직접 설치하는 공개 SDK를 제공하지 않아, 이 패널은 안경
        디스플레이에 표시될 화면을 폰/웹에서 미리보는 시뮬레이션입니다. Meta의 Wearables Device
        Access Toolkit이 지원되는 환경에서는 동일한 데이터를 안경으로 캐스팅하도록 연동할 수 있습니다.
      </p>
    </div>
  )
}
