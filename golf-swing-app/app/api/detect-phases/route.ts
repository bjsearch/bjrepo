import { NextResponse } from 'next/server'
import { AIConfigError, generateVisionText, isGeminiModel, isProvider, VisionContentBlock } from '@/lib/ai'
import { isPhaseCount, PHASE_SETS, PhaseCount } from '@/lib/swingPhases'

const MAX_FRAMES = 16

export async function POST(req: Request) {
  try {
    const {
      frames,
      provider: requestedProvider,
      geminiModel: requestedGeminiModel,
      phaseCount: requestedPhaseCount,
    } = await req.json()
    const provider = isProvider(requestedProvider) ? requestedProvider : undefined
    const geminiModel = isGeminiModel(requestedGeminiModel) ? requestedGeminiModel : undefined
    const phaseCount: PhaseCount = isPhaseCount(requestedPhaseCount) ? requestedPhaseCount : 4

    if (!Array.isArray(frames) || frames.length < 2) {
      return NextResponse.json({ error: '구간을 찾기에 프레임이 부족합니다.' }, { status: 400 })
    }

    const usedFrames: string[] = frames.slice(0, MAX_FRAMES)
    const lastIndex = usedFrames.length - 1

    const imageBlocks: VisionContentBlock[] = usedFrames.flatMap((base64: string, i: number) => [
      { type: 'text', text: `프레임 인덱스 ${i}:` },
      { type: 'image', base64 },
    ])

    const phases = PHASE_SETS[phaseCount]
    const phaseKeys = phases.map((p) => p.key)
    const phaseDescriptions = phases
      .map((p) => `- ${p.key} (P${p.pNumber}, ${p.label}): ${p.description}`)
      .join('\n')
    const orderExpression = phaseKeys.join(' < ')
    const jsonSchema = `{ ${phaseKeys.map((k) => `"${k}": 정수`).join(', ')} }`

    const instructions = `다음은 골프 스윙 영상에서 시간 순서대로(인덱스 0부터 ${lastIndex}까지) 추출한 연속 프레임 ${usedFrames.length}장입니다.
스윙은 보통 P1 어드레스 → P2 테이크어웨이 → P3 중간 백스윙 → P4 백스윙 탑 → P5 다운스윙 시작 → P6 딜리버리 → P7 임팩트 → P8 팔로우스루 → P9 중간 팔로우스루 → P10 피니쉬 순서로 진행됩니다.
이 중 아래 ${phases.length}개 구간에 가장 가까운 프레임의 인덱스를 하나씩 선택하세요. 동작의 디테일을 놓치지 않도록 인접 프레임들을 신중하게 비교해서 고르세요.

${phaseDescriptions}

각 후보 프레임을 시간 순서대로 비교하면서 동작이 전환되는 지점을 찾아내고, 위 설명과 가장 잘 들어맞는 인덱스를 고르세요.
반드시 시간 순서를 따라야 하므로 ${orderExpression} 가 되도록 선택하세요.
다른 설명 없이 아래 JSON 형식으로만 응답하세요:
${jsonSchema}`

    let responseText: string
    try {
      responseText = await generateVisionText([{ type: 'text', text: instructions }, ...imageBlocks], 200, provider, geminiModel)
    } catch (err) {
      if (err instanceof AIConfigError) {
        return NextResponse.json({ error: err.message }, { status: 500 })
      }
      throw err
    }

    const indices = parsePhaseIndices(responseText, lastIndex, phaseKeys)
    if (!indices) {
      return NextResponse.json({ error: '스윙 구간을 인식하지 못했습니다.' }, { status: 502 })
    }

    return NextResponse.json({ indices })
  } catch (err) {
    console.error('phase detection error', err)
    const detail = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: `스윙 구간 탐지 중 오류가 발생했습니다. (${detail})` },
      { status: 500 },
    )
  }
}

/** Parses `{ <phaseKey>: index, ... }`, validating they're in-range and time-ordered. */
function parsePhaseIndices(text: string, maxIndex: number, phaseKeys: string[]): Record<string, number> | null {
  const trimmed = text.trim()
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  const jsonText = jsonMatch ? jsonMatch[0] : trimmed

  try {
    const data = JSON.parse(jsonText)
    const values = phaseKeys.map((key) => {
      const n = Math.round(Number(data?.[key]))
      return Number.isFinite(n) ? Math.max(0, Math.min(maxIndex, n)) : null
    })
    if (values.some((v) => v === null)) return null

    const nums = values as number[]
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] <= nums[i - 1]) return null
    }

    const result: Record<string, number> = {}
    phaseKeys.forEach((key, i) => {
      result[key] = nums[i]
    })
    return result
  } catch {
    return null
  }
}
