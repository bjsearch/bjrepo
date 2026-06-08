export type ClubCategory = 'driver' | 'iron' | 'wedge'

export interface ClubSelection {
  category: ClubCategory
  /** e.g. 7 for a 7-iron, 56 for a 56-degree wedge. Drivers have no number. */
  number: number | null
}

export interface SwingStageScore {
  /** e.g. 어드레스, 백스윙, 탑, 다운스윙, 임팩트, 팔로우스루 */
  stage: string
  score: number
  comment: string
}

export interface RecommendedPlayer {
  name: string
  reason: string
}

export interface SwingAnalysisResult {
  score: number
  scoreSummary: string
  stageScores: SwingStageScore[]
  analysis: string[]
  practiceTips: string[]
  recommendedPlayers: RecommendedPlayer[]
}

/** A persisted analysis run, keyed by the calendar date it was performed on. */
export interface SavedAnalysis {
  id: string
  /** YYYY-MM-DD, local date */
  date: string
  createdAt: string
  club: ClubSelection
  result: SwingAnalysisResult
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

export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
}
