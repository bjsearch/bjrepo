export type WatchConnectionState = 'disconnected' | 'connecting' | 'connected' | 'demo' | 'error'

export interface WatchTelemetry {
  holeNumber: number
  distanceToPinFront: number
  distanceToPinCenter: number
  distanceToPinBack: number
  lastShotDistance: number | null
  heartRate: number | null
  batteryPercent: number | null
  updatedAt: number
}

export interface ClubProfileEntry {
  id: string
  label: string
  avgDistance: number
}

export interface HoleScore {
  hole: number
  par: number
  strokes: number
  putts: number
}

export interface RoundState {
  id: string
  startedAt: number
  currentHole: number
  holes: HoleScore[]
}

export interface VoiceExchange {
  id: string
  heard: string
  reply: string
  at: number
}
