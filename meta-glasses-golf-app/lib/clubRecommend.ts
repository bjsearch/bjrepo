import { ClubProfileEntry } from './types'

export const DEFAULT_CLUB_PROFILE: ClubProfileEntry[] = [
  { id: 'driver', label: '드라이버', avgDistance: 200 },
  { id: 'w3', label: '3번 우드', avgDistance: 180 },
  { id: 'w5', label: '5번 우드', avgDistance: 165 },
  { id: 'i4', label: '4번 아이언', avgDistance: 150 },
  { id: 'i5', label: '5번 아이언', avgDistance: 140 },
  { id: 'i6', label: '6번 아이언', avgDistance: 130 },
  { id: 'i7', label: '7번 아이언', avgDistance: 120 },
  { id: 'i8', label: '8번 아이언', avgDistance: 110 },
  { id: 'i9', label: '9번 아이언', avgDistance: 100 },
  { id: 'pw', label: '피칭웨지', avgDistance: 90 },
  { id: 'aw', label: '어프로치웨지', avgDistance: 80 },
  { id: 'sw', label: '샌드웨지', avgDistance: 65 },
]

export function recommendClub(
  distanceMeters: number,
  profile: ClubProfileEntry[]
): ClubProfileEntry | null {
  if (profile.length === 0) return null
  const sortedAsc = [...profile].sort((a, b) => a.avgDistance - b.avgDistance)

  const reachable = sortedAsc.find((club) => club.avgDistance >= distanceMeters)
  if (reachable) return reachable

  return sortedAsc[sortedAsc.length - 1]
}
