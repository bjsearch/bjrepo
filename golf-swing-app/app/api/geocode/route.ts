import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Reverse-geocodes coordinates to a human-readable region label using OpenStreetMap's Nominatim. */
export async function GET(req: Request) {
  const user = getSessionUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const lat = Number(searchParams.get('lat'))
  const lng = Number(searchParams.get('lng'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: '위치 정보가 올바르지 않습니다.' }, { status: 400 })
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1&accept-language=ko`,
      { headers: { 'User-Agent': 'golf-swing-analyzer/1.0' } },
    )
    if (!res.ok) return NextResponse.json({ region: null })

    const data = await res.json()
    const addr = data?.address ?? {}
    const region = addr.city ?? addr.county ?? addr.state ?? addr.region ?? null
    const district = addr.borough ?? addr.city_district ?? addr.district ?? addr.suburb ?? null
    const state = addr.state ?? null
    const country = addr.country ?? null
    const address = typeof data?.display_name === 'string' ? data.display_name : null
    return NextResponse.json({ region, district, state, country, address })
  } catch {
    return NextResponse.json({ region: null })
  }
}
