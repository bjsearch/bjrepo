/**
 * Tracks user feedback ("정확"/"부정확") on which swing-phase frame the AI picked,
 * persisted locally so future detections can be nudged toward phases that have
 * repeatedly been marked inaccurate.
 */
const STORAGE_KEY = 'swingPhaseFeedback.v1'

interface PhaseTally {
  correct: number
  incorrect: number
}

type FeedbackStore = Record<string, PhaseTally>

/** Minimum number of "부정확" votes (net of "정확" votes) before a phase earns a hint. */
const INACCURACY_THRESHOLD = 2

function loadStore(): FeedbackStore {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as FeedbackStore) : {}
  } catch {
    return {}
  }
}

function saveStore(store: FeedbackStore): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
}

/** Records whether the frame the AI picked for `phaseKey` was accurate. */
export function recordPhaseFeedback(phaseKey: string, accurate: boolean): void {
  const store = loadStore()
  const tally = store[phaseKey] ?? { correct: 0, incorrect: 0 }
  if (accurate) tally.correct += 1
  else tally.incorrect += 1
  store[phaseKey] = tally
  saveStore(store)
}

/**
 * Builds a Korean instruction snippet calling out phases that have repeatedly
 * been marked inaccurate, so the detection prompt can pay extra attention to them.
 * Returns null when there's no notable feedback for the given phase keys.
 */
export function buildPhaseFeedbackHint(phaseKeys: string[], phaseLabelByKey: Record<string, string>): string | null {
  const store = loadStore()
  const flagged = phaseKeys.filter((key) => {
    const tally = store[key]
    if (!tally) return false
    return tally.incorrect - tally.correct >= INACCURACY_THRESHOLD
  })
  if (flagged.length === 0) return null

  const labels = flagged.map((key) => phaseLabelByKey[key] ?? key).join(', ')
  return `참고: 사용자가 과거 분석에서 다음 단계의 프레임 선택을 반복적으로 "부정확하다"고 평가했습니다 — ${labels}. 이 단계들을 고를 때는 인접 프레임들을 평소보다 더 꼼꼼히 비교하고, 단계 설명과 어긋나는 디테일(클럽 각도, 체중 이동, 회전 정도 등)이 없는지 다시 한번 확인한 뒤 선택하세요.`
}
