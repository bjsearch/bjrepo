import { ClubProfileEntry, RoundState } from './types'
import { DEFAULT_CLUB_PROFILE } from './clubRecommend'

const CLUB_PROFILE_KEY = 'glasses-caddie:club-profile'
const ROUND_KEY = 'glasses-caddie:round'

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function loadClubProfile(): ClubProfileEntry[] {
  return readJSON(CLUB_PROFILE_KEY, DEFAULT_CLUB_PROFILE)
}

export function saveClubProfile(profile: ClubProfileEntry[]) {
  writeJSON(CLUB_PROFILE_KEY, profile)
}

export function newRound(): RoundState {
  return {
    id: Date.now().toString(),
    startedAt: Date.now(),
    currentHole: 1,
    holes: Array.from({ length: 18 }, (_, i) => ({
      hole: i + 1,
      par: 4,
      strokes: 0,
      putts: 0,
    })),
  }
}

export function loadRound(): RoundState {
  return readJSON(ROUND_KEY, newRound())
}

export function saveRound(round: RoundState) {
  writeJSON(ROUND_KEY, round)
}
