'use client'

import { useEffect, useState } from 'react'
import WatchConnect from '@/components/WatchConnect'
import GlassesHUD from '@/components/GlassesHUD'
import RoundPanel from '@/components/RoundPanel'
import ClubProfile from '@/components/ClubProfile'
import VoiceBar from '@/components/VoiceBar'
import { golfWatchLink } from '@/lib/bluetoothWatch'
import { recommendClub } from '@/lib/clubRecommend'
import { loadClubProfile, loadRound, newRound, saveClubProfile, saveRound } from '@/lib/storage'
import { ClubProfileEntry, RoundState, WatchConnectionState, WatchTelemetry } from '@/lib/types'

type Tab = 'connect' | 'hud' | 'round' | 'voice' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'connect', label: '연결' },
  { id: 'hud', label: 'HUD' },
  { id: 'round', label: '라운드' },
  { id: 'voice', label: '음성' },
  { id: 'settings', label: '설정' },
]

export default function Home() {
  const [tab, setTab] = useState<Tab>('connect')
  const [watchState, setWatchState] = useState<WatchConnectionState>('disconnected')
  const [telemetry, setTelemetry] = useState<WatchTelemetry | null>(null)
  const [bluetoothSupported, setBluetoothSupported] = useState(false)
  const [clubProfile, setClubProfile] = useState<ClubProfileEntry[]>([])
  const [round, setRound] = useState<RoundState>(newRound())
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setBluetoothSupported(golfWatchLink.isWebBluetoothSupported())
    setClubProfile(loadClubProfile())
    setRound(loadRound())
    setHydrated(true)

    const offState = golfWatchLink.onStateChange(setWatchState)
    const offTelemetry = golfWatchLink.onTelemetry((partial) => {
      setTelemetry((prev) => ({
        holeNumber: partial.holeNumber ?? prev?.holeNumber ?? 1,
        distanceToPinFront: partial.distanceToPinFront ?? prev?.distanceToPinFront ?? 0,
        distanceToPinCenter: partial.distanceToPinCenter ?? prev?.distanceToPinCenter ?? 0,
        distanceToPinBack: partial.distanceToPinBack ?? prev?.distanceToPinBack ?? 0,
        lastShotDistance: partial.lastShotDistance ?? prev?.lastShotDistance ?? null,
        heartRate: partial.heartRate ?? prev?.heartRate ?? null,
        batteryPercent: partial.batteryPercent ?? prev?.batteryPercent ?? null,
        updatedAt: partial.updatedAt ?? Date.now(),
      }))
    })

    return () => {
      offState()
      offTelemetry()
      golfWatchLink.stopDemo()
    }
  }, [])

  useEffect(() => {
    if (hydrated) saveClubProfile(clubProfile)
  }, [clubProfile, hydrated])

  useEffect(() => {
    if (hydrated) saveRound(round)
  }, [round, hydrated])

  const recommendedClub = telemetry
    ? recommendClub(telemetry.distanceToPinCenter, clubProfile)
    : null

  function applyManualDistance(meters: number) {
    setTelemetry((prev) => ({
      holeNumber: round.currentHole,
      distanceToPinFront: Math.max(meters - 6, 0),
      distanceToPinCenter: meters,
      distanceToPinBack: meters + 6,
      lastShotDistance: prev?.lastShotDistance ?? null,
      heartRate: prev?.heartRate ?? null,
      batteryPercent: prev?.batteryPercent ?? null,
      updatedAt: Date.now(),
    }))
  }

  function goToHole(hole: number) {
    setRound((prev) => ({ ...prev, currentHole: hole }))
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-white">⛳ Glasses Caddie</h1>
        <p className="text-sm text-slate-400">
          Meta 스마트 안경 × 스마트 골프 워치 컴패니언 앱
        </p>
      </header>

      <nav className="flex gap-1 rounded-xl bg-slate-900/60 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              tab === t.id ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'connect' && (
        <WatchConnect
          state={watchState}
          telemetry={telemetry}
          bluetoothSupported={bluetoothSupported}
          onConnectReal={() => golfWatchLink.connectReal().catch(() => {})}
          onStartDemo={() => golfWatchLink.startDemo()}
          onDisconnect={() => golfWatchLink.disconnect()}
        />
      )}

      {tab === 'hud' && (
        <GlassesHUD telemetry={telemetry} recommendedClub={recommendedClub} connectionState={watchState} />
      )}

      {tab === 'round' && (
        <RoundPanel
          round={round}
          onSelectHole={goToHole}
          onUpdateHole={(hole, patch) =>
            setRound((prev) => ({
              ...prev,
              holes: prev.holes.map((h) => (h.hole === hole ? { ...h, ...patch } : h)),
            }))
          }
          onManualDistance={applyManualDistance}
          onResetRound={() => setRound(newRound())}
        />
      )}

      {tab === 'voice' && (
        <VoiceBar
          telemetry={telemetry}
          recommendedClub={recommendedClub}
          round={round}
          onNextHole={() => goToHole(Math.min(18, round.currentHole + 1))}
          onPrevHole={() => goToHole(Math.max(1, round.currentHole - 1))}
        />
      )}

      {tab === 'settings' && <ClubProfile profile={clubProfile} onChange={setClubProfile} />}
    </main>
  )
}
