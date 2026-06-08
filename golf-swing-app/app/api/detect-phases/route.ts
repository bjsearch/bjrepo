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
스윙은 보통 어드레스(P1)에서 시작해 백스윙 탑(P4)을 거쳐 임팩트(P7)를 지나 피니쉬(P10)로 끝납니다.
각 프레임을 살펴보고, 아래 4가지 스윙 구간에 가장 가까운 프레임의 인덱스를 하나씩 선택하세요. 동작의 디테일을 놓치지 않도록 신중하게 비교해서 고르세요.

- address (P1, 어드레스): 스윙을 시작하기 전 준비 자세. 클럽헤드가 공 옆 지면(또는 그 근처)에 멈춰 있고, 몸과 클럽 모두 정지해 있으며 아직 움직임이 시작되지 않은 프레임.
- backswingTop (P4, 백스윙 탑): 백스윙이 끝나고 다운스윙으로 전환되기 직전, 클럽(샤프트)이 가장 높이/뒤로 올라간 정점. 상체가 충분히 꼬이고 손과 클럽이 동작의 최고점에서 멈춘 듯 보이는 프레임 (예: 리드 팔이 곧게 펴지고 클럽이 머리 위 또는 등 뒤쪽 높은 위치에 있음).
- impact (P7, 임팩트): 클럽 헤드가 공에 닿는 순간. 손과 클럽이 어드레스 때의 공 위치 부근으로 되돌아왔고, 하체와 골반이 타깃 방향으로 회전을 시작해 몸이 살짝 열려 있으며 체중이 앞발(타깃 방향 발)로 이동한 모습 (어드레스와 비슷한 손 위치이지만 하체 회전과 체중이 다름에 유의).
- finish (P10, 피니쉬): 스윙이 완전히 끝난 마무리 자세. 몸이 타깃 방향을 정면으로 향하고, 체중이 앞발에 실리며, 클럽이 어깨 뒤쪽 높은 위치에서 정지한 프레임.

각 후보 프레임 쌍을 시간 순서대로 비교하면서 동작이 전환되는 지점을 찾아내고, 위 설명과 가장 잘 들어맞는 인덱스를 고르세요.
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
