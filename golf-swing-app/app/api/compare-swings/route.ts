import { NextResponse } from 'next/server'
import { AIConfigError, generateVisionText, isGeminiModel, isProvider } from '@/lib/ai'
import { isPhaseCount, PHASE_SETS, PhaseCount } from '@/lib/swingPhases'

export async function POST(req: Request) {
  try {
    const {
      framesA,
      framesB,
      provider: requestedProvider,
      geminiModel: requestedGeminiModel,
      phaseCount: requestedPhaseCount,
    } = await req.json()
    const provider = isProvider(requestedProvider) ? requestedProvider : undefined
    const geminiModel = isGeminiModel(requestedGeminiModel) ? requestedGeminiModel : undefined
    const phaseCount: PhaseCount = isPhaseCount(requestedPhaseCount) ? requestedPhaseCount : 6

    if (!Array.isArray(framesA) || framesA.length === 0 || !Array.isArray(framesB) || framesB.length === 0) {
      return NextResponse.json({ error: '비교할 두 영상의 프레임이 모두 필요합니다.' }, { status: 400 })
    }

    const phases = PHASE_SETS[phaseCount]
    const usedA: string[] = framesA.slice(0, phases.length)
    const usedB: string[] = framesB.slice(0, phases.length)
    const stageNames = phases.map((p) => p.label)
    const stageSequence = stageNames.join(' → ')

    const stageComparisonSchema = stageNames
      .map(
        (label) =>
          `    { "stage": "${label}", "scoreA": 0-100, "scoreB": 0-100, "comparison": "두 스윙의 이 단계를 비교하는 한 문장 (한국어)" }`,
      )
      .join(',\n')

    const instructions = `당신은 PGA/LPGA 투어 경험이 있는 골프 스윙 코치입니다.
아래 이미지들은 **두 사람(또는 같은 사람의 두 번의 스윙)**의 골프 스윙을 단계별로 캡쳐한 프레임입니다.

이미지 순서:
- 처음 ${usedA.length}장 → 영상 A의 스윙 (${stageSequence})
- 다음 ${usedB.length}장 → 영상 B의 스윙 (${stageSequence})

두 스윙을 각 단계(${stageNames.join(', ')})별로 면밀히 비교 분석한 뒤,
반드시 아래 JSON 형식으로만 응답하세요. 다른 설명, 코드블록, 마크다운 없이 순수 JSON 객체만 출력합니다.

{
  "overallScoreA": 0-100 사이의 정수 (영상 A 종합 점수),
  "overallScoreB": 0-100 사이의 정수 (영상 B 종합 점수),
  "summary": "두 스윙의 전체적인 차이를 요약하는 2-3문장 (한국어)",
  "stageComparisons": [
${stageComparisonSchema}
  ],
  "aStrengths": ["영상 A가 B보다 나은 점 (한국어, 정확히 3개, 각 한 문장)"],
  "bStrengths": ["영상 B가 A보다 나은 점 (한국어, 정확히 3개, 각 한 문장)"],
  "commonIssues": ["두 스윙 모두에서 보이는 공통 개선점 (한국어, 1-3개, 각 한 문장)"],
  "recommendation": "종합적으로 어떤 스윙이 더 나은지, 그리고 서로에게서 무엇을 배울 수 있는지 2-3문장 조언 (한국어)"
}

강조 표시: summary, comparison, aStrengths, bStrengths, commonIssues, recommendation 문장에서
핵심 표현은 \`**굵게**\`로 감싸 강조하고, 가장 중요한 행동 지침에는 \`__밑줄__\`을 사용하세요.
이미지만으로 정확한 스윙 속도나 club path를 측정할 수 없으므로, 시각적으로 관찰 가능한 자세·정렬·균형·템포 위주로 비교하세요.
채점 기준: 아마추어 골퍼 기준으로 채점하세요. 프로 수준의 완벽함을 요구하지 마세요. 기본 자세가 잡혀 있고 큰 결함이 없으면 70점 이상, 전체적으로 안정적이면 80점 이상을 주세요. 격려하는 방향으로 너그럽게 채점하되, 개선점은 구체적으로 짚어주세요.`

    const imageBlocks = [
      ...usedA.map((base64) => ({ type: 'image' as const, base64 })),
      ...usedB.map((base64) => ({ type: 'image' as const, base64 })),
    ]

    let responseText: string
    try {
      responseText = await generateVisionText(
        [{ type: 'text', text: instructions }, ...imageBlocks],
        2000,
        provider,
        geminiModel,
      )
    } catch (err) {
      if (err instanceof AIConfigError) {
        return NextResponse.json({ error: err.message }, { status: 500 })
      }
      throw err
    }

    const parsed = parseComparisonJson(responseText)
    if (!parsed) {
      console.error('swing comparison: unparseable AI response', responseText.slice(0, 500))
      return NextResponse.json({ error: 'AI 응답을 비교 결과로 변환하지 못했습니다.' }, { status: 502 })
    }

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('swing comparison error', err)
    const detail = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `스윙 비교 분석 중 오류가 발생했습니다. (${detail})` }, { status: 500 })
  }
}

export interface SwingComparisonResult {
  overallScoreA: number
  overallScoreB: number
  summary: string
  stageComparisons: { stage: string; scoreA: number; scoreB: number; comparison: string }[]
  aStrengths: string[]
  bStrengths: string[]
  commonIssues: string[]
  recommendation: string
}

function parseComparisonJson(text: string): SwingComparisonResult | null {
  const trimmed = text.trim()
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  const jsonText = jsonMatch ? jsonMatch[0] : trimmed

  try {
    const data = JSON.parse(jsonText)
    if (
      typeof data.overallScoreA !== 'number' ||
      typeof data.overallScoreB !== 'number' ||
      typeof data.summary !== 'string' ||
      !Array.isArray(data.stageComparisons) ||
      !Array.isArray(data.aStrengths) ||
      !Array.isArray(data.bStrengths) ||
      typeof data.recommendation !== 'string'
    ) {
      return null
    }
    const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)))
    return {
      overallScoreA: clamp(data.overallScoreA),
      overallScoreB: clamp(data.overallScoreB),
      summary: data.summary,
      stageComparisons: data.stageComparisons.map((s: any) => ({
        stage: String(s?.stage ?? ''),
        scoreA: clamp(s?.scoreA),
        scoreB: clamp(s?.scoreB),
        comparison: String(s?.comparison ?? ''),
      })),
      aStrengths: data.aStrengths.map(String),
      bStrengths: data.bStrengths.map(String),
      commonIssues: Array.isArray(data.commonIssues) ? data.commonIssues.map(String) : [],
      recommendation: data.recommendation,
    }
  } catch {
    return null
  }
}
