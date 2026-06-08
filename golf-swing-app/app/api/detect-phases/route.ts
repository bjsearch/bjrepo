import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const MAX_FRAMES = 12

const PHASE_KEYS = ['address', 'backswingTop', 'impact', 'finish'] as const
type PhaseKey = (typeof PHASE_KEYS)[number]

export async function POST(req: Request) {
  try {
    const { frames } = await req.json()

    if (!Array.isArray(frames) || frames.length < 2) {
      return NextResponse.json({ error: '구간을 찾기에 프레임이 부족합니다.' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: '서버에 ANTHROPIC_API_KEY가 설정되어 있지 않습니다.' }, { status: 500 })
    }

    const anthropic = new Anthropic({ apiKey })
    const usedFrames: string[] = frames.slice(0, MAX_FRAMES)
    const lastIndex = usedFrames.length - 1

    const imageBlocks = usedFrames.flatMap((base64: string, i: number) => [
      { type: 'text' as const, text: `프레임 인덱스 ${i}:` },
      {
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: base64 },
      },
    ])

    const instructions = `다음은 골프 스윙 영상에서 시간 순서대로(인덱스 0부터 ${lastIndex}까지) 추출한 연속 프레임 ${usedFrames.length}장입니다.
스윙은 보통 P1 어드레스 → P2 테이크어웨이 → P3 중간 백스윙 → P4 백스윙 탑 → P5 다운스윙 시작 → P6 딜리버리 → P7 임팩트 → P8 팔로우스루 → P9 중간 팔로우스루 → P10 피니쉬 순서로 진행됩니다.
이 중 아래 4개 구간(P1, P4, P7, P10)에 가장 가까운 프레임의 인덱스를 하나씩 선택하세요. 동작의 디테일을 놓치지 않도록 인접 프레임들을 신중하게 비교해서 고르세요.

- address (P1, 어드레스): 스윙 시작 전 준비 자세. 클럽헤드가 공 옆 지면에 멈춰 있고, 두 팔과 클럽이 몸 앞으로 곧게 늘어진 채 정지해 있으며 아직 움직임이 시작되지 않은 프레임.
- backswingTop (P4, 백스윙 탑): 백스윙이 끝나고 다운스윙으로 전환되기 직전의 정점. 클럽(샤프트)이 동작 중 가장 높이 들어 올려져 있고(머리 위 또는 등 뒤 높은 위치), 상체가 완전히 꼬이며 손과 클럽이 한순간 멈춘 듯 보이는 프레임. P3(중간 백스윙, 클럽이 아직 수평~45도 정도)이나 P5(다운스윙 시작, 이미 아래로 내려오기 시작)와 혼동하지 말 것.
- impact (P7, 임팩트): 클럽 헤드가 공에 닿는 순간. 손과 클럽 헤드가 어드레스 때의 공 위치 부근으로 돌아왔지만, 하체·골반이 이미 타깃 방향으로 회전해 몸통이 정면을 향해 열리기 시작한 모습 (어드레스(P1)와 팔 위치는 비슷해 보여도 하체 회전과 체중이 앞발로 이동한 점이 다름에 유의. P6(딜리버리, 아직 손이 공에 도달 전)이나 P8(팔로우스루, 이미 공을 지나 클럽이 위로 올라가는 중)과 혼동하지 말 것).
- finish (P10, 피니쉬): 스윙이 완전히 끝난 정지 자세. 상체와 골반이 타깃 쪽 정면을 향하고, 체중이 앞발에 완전히 실리며 뒷발은 발끝으로 가볍게 서 있고, 클럽이 어깨 뒤쪽 높은 위치에서 멈춘 균형 잡힌 마무리 프레임. P9(중간 팔로우스루, 아직 클럽이 내려와 있고 몸이 완전히 정면을 향하지 않음)와 혼동하지 말 것.

각 후보 프레임을 시간 순서대로 비교하면서 동작이 전환되는 지점을 찾아내고, 위 설명과 가장 잘 들어맞는 인덱스를 고르세요.
반드시 시간 순서를 따라야 하므로 address < backswingTop < impact < finish 가 되도록 선택하세요.
다른 설명 없이 아래 JSON 형식으로만 응답하세요:
{ "address": 정수, "backswingTop": 정수, "impact": 정수, "finish": 정수 }`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: instructions }, ...imageBlocks],
        },
      ],
    })

    const textBlock = message.content.find((block) => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'AI 응답을 읽을 수 없습니다.' }, { status: 502 })
    }

    const indices = parsePhaseIndices(textBlock.text, lastIndex)
    if (!indices) {
      return NextResponse.json({ error: '스윙 구간을 인식하지 못했습니다.' }, { status: 502 })
    }

    return NextResponse.json({ indices })
  } catch (err) {
    console.error('phase detection error', err)
    const detail = err instanceof Anthropic.APIError
      ? `${err.status} ${err.message}`
      : err instanceof Error
        ? err.message
        : String(err)
    return NextResponse.json(
      { error: `스윙 구간 탐지 중 오류가 발생했습니다. (${detail})` },
      { status: 500 },
    )
  }
}

/** Parses `{ address, backswingTop, impact, finish }`, validating they're in-range and time-ordered. */
function parsePhaseIndices(text: string, maxIndex: number): Record<PhaseKey, number> | null {
  const trimmed = text.trim()
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  const jsonText = jsonMatch ? jsonMatch[0] : trimmed

  try {
    const data = JSON.parse(jsonText)
    const values = PHASE_KEYS.map((key) => {
      const n = Math.round(Number(data?.[key]))
      return Number.isFinite(n) ? Math.max(0, Math.min(maxIndex, n)) : null
    })
    if (values.some((v) => v === null)) return null

    const nums = values as number[]
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] <= nums[i - 1]) return null
    }

    return {
      address: nums[0],
      backswingTop: nums[1],
      impact: nums[2],
      finish: nums[3],
    }
  } catch {
    return null
  }
}
