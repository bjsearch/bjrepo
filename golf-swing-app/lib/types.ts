export type ClubCategory = 'driver' | 'iron' | 'wedge'

export interface ClubSelection {
  category: ClubCategory
  /** e.g. 7 for a 7-iron, 56 for a 56-degree wedge. Drivers have no number. */
  number: number | null
}

export interface SwingAnalysisResult {
  score: number
  scoreSummary: string
  analysis: string[]
  practiceTips: string[]
  recommendedPlayers: {
    name: string
    reason: string
  }[]
}

export const CLUB_LABELS: Record<ClubCategory, string> = {
  driver: '드라이버',
  iron: '아이언',
  wedge: '웻지',
}

export function describeClub(club: ClubSelection): string {
  if (club.category === 'driver') return CLUB_LABELS.driver
  if (club.number == null) return CLUB_LABELS[club.category]
  return `${club.number}번 ${CLUB_LABELS[club.category]}`
}
