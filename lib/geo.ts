import { NextRequest } from 'next/server'

export interface GeoInfo {
  ip?: string
  country?: string
  region?: string
  city?: string
  latitude?: string
  longitude?: string
}

export function getGeoFromRequest(req: NextRequest): GeoInfo {
  const headers = req.headers
  const forwardedFor = headers.get('x-forwarded-for')
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : undefined
  const city = headers.get('x-vercel-ip-city')

  return {
    ip,
    country: headers.get('x-vercel-ip-country') ?? undefined,
    region: headers.get('x-vercel-ip-country-region') ?? undefined,
    city: city ? decodeURIComponent(city) : undefined,
    latitude: headers.get('x-vercel-ip-latitude') ?? undefined,
    longitude: headers.get('x-vercel-ip-longitude') ?? undefined,
  }
}
