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
각 프레임을 살펴보고, 아래 4가지 스윙 구간에 가장 가까운 프레임의 인덱스를 하나씩 선택하세요.

- address: 어드레스 (스윙을 시작하기 전 준비 자세)
- backswingTop: 백스윙 탑 (클럽이 가장 높이 올라간 지점)
- impact: 임팩트 (클럽이 공에 닿는 순간)
- finish: 피니쉬 (스윙이 끝난 마무리 자세)

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
