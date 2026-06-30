/**
 * Tracks user feedback ("정확"/"부정확") on which swing-phase frame the AI picked,
 * persisted site-wide (Netlify Blobs, via /api/phase-feedback) so future detections
 * can be nudged toward phases that have repeatedly been marked inaccurate.
 */

interface PhaseTally {
  correct: number
  incorrect: number
}

type FeedbackStats = Record<string, PhaseTally>

/** Minimum number of "부정확" votes (net of "정확" votes) before a phase earns a hint. */
const INACCURACY_THRESHOLD = 2

/** Records whether the frame the AI picked for `phaseKey` was accurate. */
export async function recordPhaseFeedback(phaseKey: string, accurate: boolean): Promise<void> {
  await fetch('/api/phase-feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phaseKey, accurate }),
  })
}

async function fetchPhaseFeedbackStats(): Promise<FeedbackStats> {
  try {
    const res = await fetch('/api/phase-feedback')
    if (!res.ok) return {}
    const data = await res.json()
    return data?.stats && typeof data.stats === 'object' ? (data.stats as FeedbackStats) : {}
  } catch {
    return {}
  }
}

/**
 * Builds a Korean instruction snippet calling out phases that have repeatedly
 * been marked inaccurate, so the detection prompt can pay extra attention to them.
 * Returns null when there's no notable feedback for the given phase keys.
 */
export async function buildPhaseFeedbackHint(
  phaseKeys: string[],
  phaseLabelByKey: Record<string, string>,
): Promise<string | null> {
  const stats = await fetchPhaseFeedbackStats()
  const flagged = phaseKeys.filter((key) => {
    const tally = stats[key]
    if (!tally) return false
    return tally.incorrect - tally.correct >= INACCURACY_THRESHOLD
  })
  if (flagged.length === 0) return null

  const labels = flagged.map((key) => phaseLabelByKey[key] ?? key).join(', ')
  return `참고: 사용자들이 과거 분석에서 다음 단계의 프레임 선택을 반복적으로 "부정확하다"고 평가했습니다 — ${labels}. 이 단계들을 고를 때는 인접 프레임들을 평소보다 더 꼼꼼히 비교하고, 단계 설명과 어긋나는 디테일(클럽 각도, 체중 이동, 회전 정도 등)이 없는지 다시 한번 확인한 뒤 선택하세요.`
}
