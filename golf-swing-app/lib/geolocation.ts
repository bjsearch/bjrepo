import { AnalysisLocation } from './types'

export interface Coordinates {
  lat: number
  lng: number
  /** Accuracy radius of the coordinates, in meters. */
  accuracy?: number
}

/** Requests the browser's current location. Resolves to null if unsupported, denied, or timed out. */
export function getCurrentLocation(): Promise<Coordinates | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 5 * 60 * 1000 },
    )
  })
}

interface GeocodeResult {
  region: string | null
  district: string | null
  state: string | null
  country: string | null
  address: string | null
}

/** Reverse-geocodes coordinates to human-readable place names. Returns null on failure. */
async function fetchGeocode(coords: Coordinates): Promise<GeocodeResult | null> {
  try {
    const res = await fetch(`/api/geocode?lat=${coords.lat}&lng=${coords.lng}`)
    if (!res.ok) return null
    const data = await res.json()
    return {
      region: typeof data?.region === 'string' ? data.region : null,
      district: typeof data?.district === 'string' ? data.district : null,
      state: typeof data?.state === 'string' ? data.state : null,
      country: typeof data?.country === 'string' ? data.country : null,
      address: typeof data?.address === 'string' ? data.address : null,
    }
  } catch {
    return null
  }
}

/** Reverse-geocodes coordinates to a human-readable region label (e.g. "서울특별시"). Returns null on failure. */
export async function fetchRegion(coords: Coordinates): Promise<string | null> {
  const geocode = await fetchGeocode(coords)
  return geocode?.region ?? null
}

/**
 * Best-effort: gets the user's current location and reverse-geocodes it into a
 * detailed `AnalysisLocation` (coordinates, accuracy, region/district/state/country,
 * and full address) suitable for plotting on a map later. Returns null if anything fails.
 */
export async function detectAnalysisLocation(): Promise<AnalysisLocation | null> {
  const coords = await getCurrentLocation()
  if (!coords) return null

  const geocode = await fetchGeocode(coords)
  return {
    lat: coords.lat,
    lng: coords.lng,
    ...(coords.accuracy != null ? { accuracy: coords.accuracy } : {}),
    ...(geocode?.region ? { region: geocode.region } : {}),
    ...(geocode?.district ? { district: geocode.district } : {}),
    ...(geocode?.state ? { state: geocode.state } : {}),
    ...(geocode?.country ? { country: geocode.country } : {}),
    ...(geocode?.address ? { address: geocode.address } : {}),
  }
}
