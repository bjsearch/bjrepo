export type AIProvider = 'anthropic' | 'gemini'

export const AI_PROVIDERS: { id: AIProvider; label: string; description: string }[] = [
  { id: 'anthropic', label: 'Claude', description: 'Anthropic Claude로 분석합니다' },
  { id: 'gemini', label: 'Gemini', description: 'Google Gemini로 분석합니다' },
]

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

export interface SwingGrade {
  label: string
  description: string
}

/** Maps a 0-100 swing score to a coach-style expert tier. */
export function swingGrade(score: number): SwingGrade {
  if (score >= 90) {
    return { label: '투어 프로급', description: '프로 선수에 견줄 만큼 안정적이고 정교한 스윙이에요.' }
  }
  if (score >= 80) {
    return { label: '상급자', description: '기본기가 탄탄하고 군더더기 없는 스윙을 갖췄어요.' }
  }
  if (score >= 70) {
    return { label: '중상급자', description: '전반적으로 안정적이라 디테일만 다듬으면 한 단계 올라갈 수 있어요.' }
  }
  if (score >= 60) {
    return { label: '중급자', description: '기본 동작은 자리 잡았고, 일관성을 더 키우면 좋아요.' }
  }
  if (score >= 50) {
    return { label: '초중급자', description: '기본기를 다지는 단계로, 핵심 동작 위주의 반복 연습이 도움이 돼요.' }
  }
  return { label: '입문자', description: '기본 자세와 그립부터 차근차근 익혀나가는 단계예요.' }
}
