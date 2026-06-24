import type { ClubCategory } from './types'

interface DetectClubResult {
  category: ClubCategory
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

interface ClubFeedbackTally {
  correct: number
  incorrect: number
}

type ClubFeedbackStats = Record<string, ClubFeedbackTally>

export async function detectClubFromFrame(
  frame: string,
  provider?: string,
  geminiModel?: string,
): Promise<DetectClubResult | null> {
  const feedbackHint = await buildClubFeedbackHint()

  try {
    const res = await fetch('/api/detect-club', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frame, provider, geminiModel, feedbackHint }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.category) return null
    return data as DetectClubResult
  } catch {
    return null
  }
}

export async function recordClubFeedback(
  detectedCategory: ClubCategory,
  actualCategory: ClubCategory,
  accurate: boolean,
): Promise<void> {
  await fetch('/api/club-feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ detectedCategory, actualCategory, accurate }),
  })
}

async function buildClubFeedbackHint(): Promise<string | null> {
  try {
    const res = await fetch('/api/club-feedback')
    if (!res.ok) return null
    const { stats } = await res.json() as { stats: ClubFeedbackStats }
    if (!stats || typeof stats !== 'object') return null

    const hints: string[] = []
    for (const [key, tally] of Object.entries(stats)) {
      if (key.includes('→')) {
        const [from, to] = key.split('→')
        if (tally.incorrect >= 2) {
          hints.push(`${from}으로 감지했지만 실제로는 ${to}인 경우가 ${tally.incorrect}회 있었음`)
        }
      } else if (tally.incorrect > tally.correct && tally.incorrect >= 3) {
        hints.push(`${key} 감지 정확도가 낮음 (정확 ${tally.correct}회, 부정확 ${tally.incorrect}회)`)
      }
    }

    return hints.length > 0 ? hints.join('\n') : null
  } catch {
    return null
  }
}
