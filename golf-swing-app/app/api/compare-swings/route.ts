import { NextResponse } from 'next/server'
import { AIConfigError, generateVisionText, isGeminiModel, isProvider } from '@/lib/ai'
import { isPhaseCount, PHASE_SETS, PhaseCount } from '@/lib/swingPhases'

function isLocale(v: unknown): v is 'ko' | 'en' {
  return v === 'ko' || v === 'en'
}

function buildCompareInstructions(
  usedA: string[],
  usedB: string[],
  stageNames: string[],
  locale: 'ko' | 'en',
): string {
  const stageSequence = stageNames.join(' → ')

  if (locale === 'en') {
    const stageComparisonSchema = stageNames
      .map((label) => `    { "stage": "${label}", "scoreA": 0-100, "scoreB": 0-100, "comparison": "one sentence comparing the two swings at this stage (English)" }`)
      .join(',\n')

    return `You are a golf swing coach with PGA/LPGA tour experience.
The images below are frames from **two golf swings** (two people or the same person's two swings), captured at key swing phases.

Image order:
- First ${usedA.length} images → Video A's swing (${stageSequence})
- Next ${usedB.length} images → Video B's swing (${stageSequence})

Compare the two swings at each phase (${stageNames.join(', ')}), then respond ONLY with the JSON object below.
No other text, code blocks, or markdown — just the raw JSON object.

{
  "overallScoreA": integer 0-100 (Video A overall score),
  "overallScoreB": integer 0-100 (Video B overall score),
  "summary": "2-3 sentences summarizing the overall differences between the two swings (English)",
  "stageComparisons": [
${stageComparisonSchema}
  ],
  "aStrengths": ["3 things Video A does better than B (English, exactly 3, one sentence each)"],
  "bStrengths": ["3 things Video B does better than A (English, exactly 3, one sentence each)"],
  "commonIssues": ["common issues found in both swings (English, 1-3, one sentence each)"],
  "recommendation": "2-3 sentences of overall advice on which swing is better and what each can learn from the other (English)"
}

Emphasis: In summary, comparison, aStrengths, bStrengths, commonIssues, and recommendation, wrap key phrases with \`**bold**\` and use \`__underline__\` for the single most important action item.
Since exact swing speed or club path cannot be measured from images, focus on visually observable posture, alignment, balance, and tempo.
Scoring: Be strict and realistic. Use the full 0-100 range. Most amateur golfers should fall between 40-70. Reserve 80+ for genuinely advanced swings with near-flawless mechanics. 90+ is practically tour-level. A beginner should score 30-50; a mid-handicapper 50-65; a low-handicapper 65-75. Do not inflate scores — honest assessment helps improvement. Be specific about what costs points.
If either swing is exceptionally good at a professional level, naturally include "Are you a pro golfer? 🏆" in the summary.`
  }

  const stageComparisonSchema = stageNames
    .map((label) => `    { "stage": "${label}", "scoreA": 0-100, "scoreB": 0-100, "comparison": "두 스윙의 이 단계를 비교하는 한 문장 (한국어)" }`)
    .join(',\n')

  return `당신은 PGA/LPGA 투어 경험이 있는 골프 스윙 코치입니다.
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
채점 기준: 엄격하고 현실적으로 채점하세요. 0-100 전 범위를 활용하세요. 대부분의 아마추어는 40-70점 사이여야 합니다. 80점 이상은 메카닉이 거의 완벽한 상급자에게만, 90점 이상은 투어 프로 수준입니다. 초보자 30-50점, 중급자 50-65점, 로우 핸디캐퍼 65-75점이 적절합니다. 점수를 부풀리지 말고 감점 요인을 구체적으로 짚어주세요.
만약 어느 한쪽 스윙이 매우 뛰어나서 프로 선수 수준으로 판단된다면, summary에 "혹시 프로 골퍼이신가요? 🏆"라는 문구를 자연스럽게 포함해 주세요.`
}

export async function POST(req: Request) {
  try {
    const {
      framesA,
      framesB,
      provider: requestedProvider,
      geminiModel: requestedGeminiModel,
      phaseCount: requestedPhaseCount,
      locale: requestedLocale,
    } = await req.json()
    const provider = isProvider(requestedProvider) ? requestedProvider : undefined
    const geminiModel = isGeminiModel(requestedGeminiModel) ? requestedGeminiModel : undefined
    const phaseCount: PhaseCount = isPhaseCount(requestedPhaseCount) ? requestedPhaseCount : 6
    const locale = isLocale(requestedLocale) ? requestedLocale : 'ko'

    const allFrames = [...(Array.isArray(framesA) ? framesA : []), ...(Array.isArray(framesB) ? framesB : [])]
    if (allFrames.length > 20 || allFrames.some((f: unknown) => typeof f !== 'string' || (f as string).length > 5_000_000)) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }
    if (!Array.isArray(framesA) || framesA.length === 0 || !Array.isArray(framesB) || framesB.length === 0) {
      return NextResponse.json({
        error: locale === 'en'
          ? 'Frames from both videos are required for comparison.'
          : '비교할 두 영상의 프레임이 모두 필요합니다.',
      }, { status: 400 })
    }

    const phases = PHASE_SETS[phaseCount]
    const usedA: string[] = framesA.slice(0, phases.length)
    const usedB: string[] = framesB.slice(0, phases.length)
    const stageNames = phases.map((p) => locale === 'en' ? p.labelEn : p.label)

    const instructions = buildCompareInstructions(usedA, usedB, stageNames, locale)

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
      return NextResponse.json({
        error: locale === 'en'
          ? 'Failed to parse AI response into comparison results.'
          : 'AI 응답을 비교 결과로 변환하지 못했습니다.',
      }, { status: 502 })
    }

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('swing comparison error', err)
    return NextResponse.json({ error: 'Swing comparison failed' }, { status: 500 })
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
