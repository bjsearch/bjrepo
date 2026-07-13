'use client'

import { useEffect, useRef, useState } from 'react'
import WatchConnect from '@/components/WatchConnect'
import AudioFeed from '@/components/AudioFeed'
import RoundPanel from '@/components/RoundPanel'
import ClubProfile from '@/components/ClubProfile'
import VoiceBar from '@/components/VoiceBar'
import { golfWatchLink } from '@/lib/bluetoothWatch'
import { recommendClub } from '@/lib/clubRecommend'
import { distanceAnnouncement, holeAnnouncement, shotAnnouncement, speak } from '@/lib/audioAnnouncer'
import {
  loadAudioSettings,
  loadClubProfile,
  loadRound,
  newRound,
  saveAudioSettings,
  saveClubProfile,
  saveRound,
} from '@/lib/storage'
import {
  AnnouncementEvent,
  AnnouncementReason,
  AudioSettings,
  ClubProfileEntry,
  RoundState,
  WatchConnectionState,
  WatchTelemetry,
} from '@/lib/types'

type Tab = 'connect' | 'audio' | 'round' | 'voice' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'connect', label: '연결' },
  { id: 'audio', label: '오디오' },
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
  const [audioSettings, setAudioSettings] = useState<AudioSettings>({
    autoAnnounceHole: true,
    autoAnnounceShot: true,
  })
  const [announcements, setAnnouncements] = useState<AnnouncementEvent[]>([])
  const [hydrated, setHydrated] = useState(false)

  const lastAnnouncedHole = useRef<number | null>(null)
  const lastAnnouncedShotAt = useRef<number | null>(null)

  useEffect(() => {
    setBluetoothSupported(golfWatchLink.isWebBluetoothSupported())
    setClubProfile(loadClubProfile())
    setRound(loadRound())
    setAudioSettings(loadAudioSettings())
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

  useEffect(() => {
    if (hydrated) saveAudioSettings(audioSettings)
  }, [audioSettings, hydrated])

  function logAnnouncement(text: string, reason: AnnouncementReason) {
    setAnnouncements((prev) =>
      [{ id: `${Date.now()}-${Math.random()}`, text, reason, at: Date.now() }, ...prev].slice(0, 20)
    )
  }

  // Every update from the watch is a candidate for a spoken announcement, since
  // this device has no screen to glance at — the audio *is* the interface.
  useEffect(() => {
    if (!telemetry) return

    if (audioSettings.autoAnnounceHole && telemetry.holeNumber !== lastAnnouncedHole.current) {
      lastAnnouncedHole.current = telemetry.holeNumber
      const text = holeAnnouncement(telemetry)
      speak(text)
      logAnnouncement(text, 'hole')
    }

    if (
      audioSettings.autoAnnounceShot &&
      telemetry.lastShotDistance != null &&
      telemetry.updatedAt !== lastAnnouncedShotAt.current
    ) {
      lastAnnouncedShotAt.current = telemetry.updatedAt
      const text = shotAnnouncement(telemetry.lastShotDistance)
      speak(text)
      logAnnouncement(text, 'shot')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telemetry, audioSettings])

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

  function replayDistance() {
    if (!telemetry) return
    const text = distanceAnnouncement(telemetry)
    speak(text)
    logAnnouncement(text, 'manual')
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-white">⛳ Glasses Caddie</h1>
        <p className="text-sm text-slate-400">
          Meta 스마트 안경(디스플레이 없음) × 스마트 골프 워치 오디오 컴패니언 앱
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

      {tab === 'audio' && (
        <AudioFeed
          telemetry={telemetry}
          recommendedClub={recommendedClub}
          connectionState={watchState}
          settings={audioSettings}
          onSettingsChange={setAudioSettings}
          announcements={announcements}
          onReplayDistance={replayDistance}
        />
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
          onAnnounce={logAnnouncement}
        />
      )}

      {tab === 'settings' && <ClubProfile profile={clubProfile} onChange={setClubProfile} />}
    </main>
  )
}
