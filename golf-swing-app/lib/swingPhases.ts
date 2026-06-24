import { AIProvider } from './types'

export type PhaseCount = 4 | 6

export interface PhaseDef {
  /** Stable key used in API payloads (e.g. detect-phases indices, analyze-swing stage order). */
  key: string
  /** Short Korean label shown in the UI. */
  label: string
  /** English label for internationalized prompts and UI. */
  labelEn: string
  /** Position in the standard P1–P10 swing sequence (1 = address, 10 = finish). */
  pNumber: number
  /** Visual description of the position, used to brief the AI on what to look for. */
  description: string
}

const ADDRESS: PhaseDef = {
  key: 'address',
  label: '어드레스',
  labelEn: 'Address',
  pNumber: 1,
  description:
    '스윙 시작 전 준비 자세. 클럽헤드가 공 옆 지면에 멈춰 있고, 두 팔과 클럽이 몸 앞으로 곧게 늘어진 채 정지해 있으며 아직 움직임이 시작되지 않은 프레임. ' +
    '겉모습이 비슷한 P7(임팩트, 손 위치는 비슷하지만 하체가 이미 회전해 있고 체중이 앞발로 이동한 상태)과 혼동하지 말고, 클럽과 몸이 완전히 정지해 있는 가장 이른 프레임을 고를 것.',
}

const TAKEAWAY: PhaseDef = {
  key: 'takeaway',
  label: '테이크어웨이',
  labelEn: 'Takeaway',
  pNumber: 2,
  description:
    '백스윙이 막 시작된 초기 단계. 클럽 헤드가 지면에서 막 떨어져 손과 클럽이 몸 옆으로 낮게(허리 높이 이하) 빠져나가는 중이며, 상체 회전이 갓 시작된 프레임. ' +
    '아직 정지해 있는 P1(어드레스)이나, 클럽이 이미 허리~어깨 높이까지 올라간 P3(중간 백스윙)과 혼동하지 말고, 그 사이의 과도기 동작을 고를 것.',
}

const BACKSWING_TOP: PhaseDef = {
  key: 'backswingTop',
  label: '백스윙 탑',
  labelEn: 'Top of Backswing',
  pNumber: 4,
  description:
    '백스윙이 끝나고 다운스윙으로 전환되기 직전의 정점. 클럽이 동작 중 가장 높이 들어 올려져 있고(머리 위 또는 등 뒤 높은 위치), 상체가 완전히 꼬이며 손과 클럽이 한순간 멈춘 듯 보이는 프레임. ' +
    'P3(중간 백스윙, 클럽이 아직 수평~45도 정도로 올라가는 도중)이나 P5(다운스윙 시작, 손이 이미 아래로 내려오기 시작)와 혼동하지 말고, 클럽이 가장 높은 지점에서 방향이 바뀌는 정확한 전환점을 고를 것.',
}

const IMPACT: PhaseDef = {
  key: 'impact',
  label: '임팩트',
  labelEn: 'Impact',
  pNumber: 7,
  description:
    '클럽 헤드가 공에 닿는 순간. 손과 클럽 헤드가 어드레스 때의 공 위치 부근으로 돌아왔지만, 하체·골반이 이미 타깃 방향으로 회전해 몸통이 정면을 향해 열리기 시작한 모습. ' +
    '어드레스(P1)와 팔 위치는 비슷해 보여도 하체 회전·체중 이동 여부가 다른 점에 유의하고, 아직 손이 공에 닿기 전인 P6(딜리버리, 샤프트가 손보다 살짝 뒤처져 있음)이나 ' +
    '이미 공을 지나 클럽이 위로 올라가기 시작한 P8(팔로우스루)과 혼동하지 말 것. 클럽 헤드와 공이 가장 가까워 보이는 프레임을 고를 것.',
}

const FOLLOW_THROUGH: PhaseDef = {
  key: 'followThrough',
  label: '팔로우스루',
  labelEn: 'Follow-Through',
  pNumber: 8,
  description:
    '임팩트 직후 클럽이 공을 지나 계속 위로 올라가며, 몸이 타깃 방향으로 회전을 이어가고 체중이 앞발로 옮겨가는 중인 프레임(클럽이 대략 허리~가슴 높이). ' +
    '아직 클럽 헤드가 공 근처에 있는 P7(임팩트)이나, 이미 회전이 거의 끝나고 클럽이 어깨 위까지 올라간 P9(중간 팔로우스루)와 혼동하지 말고, 그 중간 과정을 고를 것.',
}

const FINISH: PhaseDef = {
  key: 'finish',
  label: '피니쉬',
  labelEn: 'Finish',
  pNumber: 10,
  description:
    '스윙이 완전히 끝난 정지 자세. 상체와 골반이 타깃 쪽 정면을 향하고, 체중이 앞발에 완전히 실리며 뒷발은 발끝으로 가볍게 서 있고, 클럽이 어깨 뒤쪽 높은 위치에서 멈춘 균형 잡힌 마무리 프레임. ' +
    'P9(중간 팔로우스루, 아직 클럽이 내려와 있고 몸이 완전히 정면을 향하지 않으며 동작이 진행 중)와 혼동하지 말고, 동작이 완전히 멈춰서 정지한 가장 마지막 프레임을 고를 것.',
}

/** Ordered phase sets the pipeline can target — 4 for a quick pass, 6 for a more granular breakdown. */
export const PHASE_SETS: Record<PhaseCount, PhaseDef[]> = {
  4: [ADDRESS, BACKSWING_TOP, IMPACT, FINISH],
  6: [ADDRESS, TAKEAWAY, BACKSWING_TOP, IMPACT, FOLLOW_THROUGH, FINISH],
}

/** Both providers now use the more granular 6-phase breakdown. */
export function phaseCountForProvider(provider: AIProvider): PhaseCount {
  return 6
}

export function isPhaseCount(value: unknown): value is PhaseCount {
  return value === 4 || value === 6
}

/** Maps a P1–P10 position to a fraction of the clip's duration, matching the original 4-phase heuristic exactly. */
export function phaseFraction(pNumber: number): number {
  return 0.05 + ((pNumber - 1) / 9) * 0.9
}

export function phaseLabels(phaseCount: PhaseCount, locale?: string): string[] {
  return PHASE_SETS[phaseCount].map((p) => locale === 'en' ? p.labelEn : p.label)
}

export function phaseFractions(phaseCount: PhaseCount): number[] {
  return PHASE_SETS[phaseCount].map((p) => phaseFraction(p.pNumber))
}

/** Maps every phase key (across all phase sets) to its Korean label, for displaying feedback stats. */
export function phaseLabelByKey(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const phases of Object.values(PHASE_SETS)) {
    for (const p of phases) map[p.key] = p.label
  }
  return map
}
