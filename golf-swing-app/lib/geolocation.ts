import { AnalysisLocation } from './types'

export interface Coordinates {
  lat: number
  lng: number
}

/** Requests the browser's current location. Resolves to null if unsupported, denied, or timed out. */
export function getCurrentLocation(): Promise<Coordinates | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 5 * 60 * 1000 },
    )
  })
}

/** Reverse-geocodes coordinates to a human-readable region label (e.g. "서울특별시"). Returns null on failure. */
export async function fetchRegion(coords: Coordinates): Promise<string | null> {
  try {
    const res = await fetch(`/api/geocode?lat=${coords.lat}&lng=${coords.lng}`)
    if (!res.ok) return null
    const data = await res.json()
    return typeof data?.region === 'string' ? data.region : null
  } catch {
    return null
  }
}

/** Best-effort: gets the user's current location and reverse-geocodes it. Returns null if anything fails. */
export async function detectAnalysisLocation(): Promise<AnalysisLocation | null> {
  const coords = await getCurrentLocation()
  if (!coords) return null
  const region = await fetchRegion(coords)
  return { lat: coords.lat, lng: coords.lng, ...(region ? { region } : {}) }
}
