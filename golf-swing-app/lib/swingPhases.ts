import { AIProvider } from './types'

export type PhaseCount = 4 | 6

export interface PhaseDef {
  /** Stable key used in API payloads (e.g. detect-phases indices, analyze-swing stage order). */
  key: string
  /** Short Korean label shown in the UI. */
  label: string
  /** Position in the standard P1–P10 swing sequence (1 = address, 10 = finish). */
  pNumber: number
  /** Visual description of the position, used to brief the AI on what to look for. */
  description: string
}

const ADDRESS: PhaseDef = {
  key: 'address',
  label: '어드레스',
  pNumber: 1,
  description:
    '스윙 시작 전 준비 자세. 클럽헤드가 공 옆 지면에 멈춰 있고, 두 팔과 클럽이 몸 앞으로 곧게 늘어진 채 정지해 있으며 아직 움직임이 시작되지 않은 프레임.',
}

const TAKEAWAY: PhaseDef = {
  key: 'takeaway',
  label: '테이크어웨이',
  pNumber: 2,
  description:
    '백스윙이 막 시작된 초기 단계. 클럽 헤드가 지면에서 떨어져 손과 클럽이 몸 옆으로 낮게 빠져나가기 시작하며, 어드레스에서 회전이 갓 시작된 프레임.',
}

const BACKSWING_TOP: PhaseDef = {
  key: 'backswingTop',
  label: '백스윙 탑',
  pNumber: 4,
  description:
    '백스윙이 끝나고 다운스윙으로 전환되기 직전의 정점. 클럽이 동작 중 가장 높이 들어 올려져 있고(머리 위 또는 등 뒤 높은 위치), 상체가 완전히 꼬이며 손과 클럽이 한순간 멈춘 듯 보이는 프레임.',
}

const IMPACT: PhaseDef = {
  key: 'impact',
  label: '임팩트',
  pNumber: 7,
  description:
    '클럽 헤드가 공에 닿는 순간. 손과 클럽 헤드가 어드레스 때의 공 위치 부근으로 돌아왔지만, 하체·골반이 이미 타깃 방향으로 회전해 몸통이 정면을 향해 열리기 시작한 모습.',
}

const FOLLOW_THROUGH: PhaseDef = {
  key: 'followThrough',
  label: '팔로우스루',
  pNumber: 8,
  description:
    '임팩트 직후 클럽이 공을 지나 계속 위로 올라가며, 몸이 타깃 방향으로 회전을 이어가고 체중이 앞발로 옮겨가는 중인 프레임.',
}

const FINISH: PhaseDef = {
  key: 'finish',
  label: '피니쉬',
  pNumber: 10,
  description:
    '스윙이 완전히 끝난 정지 자세. 상체와 골반이 타깃 쪽 정면을 향하고, 체중이 앞발에 완전히 실리며 뒷발은 발끝으로 가볍게 서 있고, 클럽이 어깨 뒤쪽 높은 위치에서 멈춘 균형 잡힌 마무리 프레임.',
}

/** Ordered phase sets the pipeline can target — 4 for a quick pass, 6 for a more granular breakdown. */
export const PHASE_SETS: Record<PhaseCount, PhaseDef[]> = {
  4: [ADDRESS, BACKSWING_TOP, IMPACT, FINISH],
  6: [ADDRESS, TAKEAWAY, BACKSWING_TOP, IMPACT, FOLLOW_THROUGH, FINISH],
}

/** Gemini gets the more granular 6-phase breakdown; Claude keeps the original 4-phase pipeline. */
export function phaseCountForProvider(provider: AIProvider): PhaseCount {
  return provider === 'gemini' ? 6 : 4
}

export function isPhaseCount(value: unknown): value is PhaseCount {
  return value === 4 || value === 6
}

/** Maps a P1–P10 position to a fraction of the clip's duration, matching the original 4-phase heuristic exactly. */
export function phaseFraction(pNumber: number): number {
  return 0.05 + ((pNumber - 1) / 9) * 0.9
}

export function phaseLabels(phaseCount: PhaseCount): string[] {
  return PHASE_SETS[phaseCount].map((p) => p.label)
}

export function phaseFractions(phaseCount: PhaseCount): number[] {
  return PHASE_SETS[phaseCount].map((p) => phaseFraction(p.pNumber))
}
