import { NextResponse } from 'next/server'
import { AIConfigError, generateVisionText, isGeminiModel, isProvider } from '@/lib/ai'
import { isPhaseCount, PHASE_SETS, PhaseCount } from '@/lib/swingPhases'
import type { SwingAnalysisResult } from '@/lib/types'

function isLocale(v: unknown): v is 'ko' | 'en' {
  return v === 'ko' || v === 'en'
}

function buildInstructions(
  usedFrames: string[],
  stageNames: string[],
  clubDescription: string,
  locale: 'ko' | 'en',
): string {
  const stageSequence = stageNames.join(' → ')
  const stageScoresSchema = stageNames
    .map((label) =>
      locale === 'ko'
        ? `    { "stage": "${label}", "score": 0-100 사이의 정수, "comment": "한 문장 코멘트 (한국어)" }`
        : `    { "stage": "${label}", "score": integer 0-100, "comment": "one-sentence comment (English)" }`,
    )
    .join(',\n')

  if (locale === 'en') {
    return `You are a golf swing coach with PGA/LPGA tour experience.
The ${usedFrames.length} images below are frames extracted from a user's golf swing video at key swing phases,
in order: ${stageSequence}.
Club used: ${clubDescription}

Analyze the swing by examining each phase (${stageNames.join(', ')}), then respond ONLY with the JSON object below.
No other text, code blocks, or markdown — just the raw JSON object.
Keep each item concise, one sentence max.

{
  "score": integer 0-100 overall score,
  "scoreSummary": "one-sentence summary of the score (English)",
  "stageScores": [
${stageScoresSchema}
  ],
  "analysis": ["3 analysis points about the swing (English, exactly 3 strings, one sentence each)"],
  "practiceTips": ["3 specific practice drills to improve this swing (English, exactly 3 strings, one sentence each)"],
  "recommendedPlayers": [
    { "name": "player name to study", "reason": "reason for recommendation (English, one sentence)" }
  ]
}

stageScores must follow the ${stageNames.length} phases above (${stageNames.join(', ')}) in order, scoring each based on what you observe in the images.
recommendedPlayers: recommend exactly 2 players, using their real names searchable on YouTube. Factor in the club type (${clubDescription}).
Since exact swing speed or club path cannot be measured from images, focus on visually observable posture, alignment, balance, and tempo.
Scoring: Be strict and realistic. Use the full 0-100 range. Most amateur golfers should fall between 40-70. Reserve 80+ for genuinely advanced swings with near-flawless mechanics. 90+ is practically tour-level — almost never appropriate for amateurs. A beginner with obvious flaws should score 30-50; a mid-handicapper with decent basics but clear issues should score 50-65; a low-handicapper with solid fundamentals should score 65-75. Do not inflate scores to be encouraging — honest assessment helps improvement. Be specific about what costs points.
If the swing is exceptionally good and appears to be at a professional level, naturally include "Are you a pro golfer? 🏆" in the scoreSummary.

Emphasis: In scoreSummary, stageScores[].comment, analysis, and practiceTips, wrap key phrases with \`**bold**\` for emphasis, and use \`__underline__\` for the single most important action item.
Use emphasis selectively — not every sentence needs it.`
  }

  return `당신은 PGA/LPGA 투어 경험이 있는 골프 스윙 코치입니다.
아래 이미지 ${usedFrames.length}장은 한 사용자의 골프 스윙 영상에서 스윙 단계를 기준으로 골라낸 프레임으로,
순서대로 각각 ${stageSequence} 구간에 해당합니다.
사용 클럽: ${clubDescription}

이 프레임들을 각 단계(${stageNames.join(', ')})별로 살펴보며 스윙을 분석한 뒤,
반드시 아래 JSON 형식으로만 간결하게 응답하세요. 다른 설명, 코드블록, 마크다운 없이 순수 JSON 객체만 출력합니다.
각 항목은 한 문장 내외로 짧고 핵심만 담아 작성하세요.

{
  "score": 0-100 사이의 정수 종합 점수,
  "scoreSummary": "점수에 대한 한 문장 요약 (한국어)",
  "stageScores": [
${stageScoresSchema}
  ],
  "analysis": ["스윙 단계별 또는 항목별 분석 포인트 (한국어, 정확히 3개 문자열 배열, 각 한 문장)"],
  "practiceTips": ["이 스윙을 개선하기 위한 구체적인 연습 방법 (한국어, 정확히 3개 문자열 배열, 각 한 문장)"],
  "recommendedPlayers": [
    { "name": "참고하면 좋을 선수 이름", "reason": "추천 이유 (한국어, 한 문장)" }
  ]
}

stageScores는 반드시 위 ${stageNames.length}단계(${stageNames.join(', ')}) 순서로, 각 단계를 이미지에서 관찰한 내용에 근거해 개별 점수를 매기세요.
recommendedPlayers는 정확히 2명만 추천하고, 이름은 유튜브에서 검색 가능한 실제 활동명(영문 또는 한글 정식 명칭)으로 작성하세요. 클럽 종류(${clubDescription})의 특성도 분석에 반영하세요.
이미지만으로 정확한 스윙 속도나 club path 등을 측정할 수 없는 점을 감안해, 시각적으로 관찰 가능한 자세·정렬·균형·템포 위주로 분석하세요.
채점 기준: 엄격하고 현실적으로 채점하세요. 0-100 전 범위를 활용하세요. 대부분의 아마추어 골퍼는 40-70점 사이여야 합니다. 80점 이상은 메카닉이 거의 완벽한 상급자에게만, 90점 이상은 투어 프로 수준으로 아마추어에게는 거의 해당되지 않습니다. 뚜렷한 결함이 있는 초보자는 30-50점, 기본기는 있지만 문제가 보이는 중급자는 50-65점, 기본기가 탄탄한 로우 핸디캐퍼는 65-75점이 적절합니다. 격려 목적으로 점수를 부풀리지 마세요 — 솔직한 평가가 실력 향상에 도움이 됩니다. 감점 요인을 구체적으로 짚어주세요.
만약 스윙이 매우 뛰어나서 프로 선수 수준으로 판단된다면, scoreSummary에 "혹시 프로 골퍼이신가요? 🏆"라는 문구를 자연스럽게 포함해 주세요.

강조 표시: scoreSummary, stageScores[].comment, analysis, practiceTips 문장에서 사용자가 꼭 기억해야 할
핵심 표현은 마크다운처럼 \`**굵게**\`로 감싸 강조하고, 그중에서도 가장 중요한 행동 지침 한 가지에는
\`__밑줄__\`을 추가로 사용하세요 (예: "**어드레스 시 무릎을 살짝 굽혀** 안정적인 자세를 만드세요" / "__임팩트 순간 머리를 고정하세요__").
모든 문장에 강조가 필요한 것은 아니므로, 정말 핵심적인 부분에만 선택적으로 사용하세요.`
}

export async function POST(req: Request) {
  try {
    const {
      frames,
      clubDescription,
      provider: requestedProvider,
      geminiModel: requestedGeminiModel,
      phaseCount: requestedPhaseCount,
      locale: requestedLocale,
    } = await req.json()
    const provider = isProvider(requestedProvider) ? requestedProvider : undefined
    const geminiModel = isGeminiModel(requestedGeminiModel) ? requestedGeminiModel : undefined
    const phaseCount: PhaseCount = isPhaseCount(requestedPhaseCount) ? requestedPhaseCount : 4
    const locale = isLocale(requestedLocale) ? requestedLocale : 'ko'

    if (!Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json({ error: locale === 'en' ? 'No frames to analyze.' : '분석할 프레임이 없습니다.' }, { status: 400 })
    }
    if (frames.length > 10 || frames.some((f: unknown) => typeof f !== 'string' || (f as string).length > 2_000_000)) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }
    if (typeof clubDescription !== 'string' || !clubDescription.trim()) {
      return NextResponse.json({ error: locale === 'en' ? 'Club information is required.' : '클럽 정보가 필요합니다.' }, { status: 400 })
    }

    const phases = PHASE_SETS[phaseCount]
    const usedFrames: string[] = frames.slice(0, phases.length)
    const stageNames = phases.map((p) => locale === 'en' ? p.labelEn : p.label)

    const instructions = buildInstructions(usedFrames, stageNames, clubDescription, locale)

    let responseText: string
    try {
      responseText = await generateVisionText(
        [{ type: 'text', text: instructions }, ...usedFrames.map((base64) => ({ type: 'image' as const, base64 }))],
        1600,
        provider,
        geminiModel,
      )
    } catch (err) {
      if (err instanceof AIConfigError) {
        return NextResponse.json({ error: err.message }, { status: 500 })
      }
      throw err
    }

    const parsed = parseAnalysisJson(responseText)
    if (!parsed) {
      console.error('swing analysis: unparseable AI response', responseText.slice(0, 500))
      return NextResponse.json({
        error: locale === 'en'
          ? 'Failed to parse AI response into analysis results.'
          : 'AI 응답을 분석 결과로 변환하지 못했습니다.',
      }, { status: 502 })
    }

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('swing analysis error', err)
    return NextResponse.json(
      { error: 'Swing analysis failed' },
      { status: 500 },
    )
  }
}

function parseAnalysisJson(text: string): SwingAnalysisResult | null {
  const trimmed = text.trim()
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  const jsonText = jsonMatch ? jsonMatch[0] : trimmed

  try {
    const data = JSON.parse(jsonText)
    if (
      typeof data.score !== 'number' ||
      typeof data.scoreSummary !== 'string' ||
      !Array.isArray(data.stageScores) ||
      !Array.isArray(data.analysis) ||
      !Array.isArray(data.practiceTips) ||
      !Array.isArray(data.recommendedPlayers)
    ) {
      return null
    }
    const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)))
    return {
      score: clamp(data.score),
      scoreSummary: data.scoreSummary,
      stageScores: data.stageScores.map((s: any) => ({
        stage: String(s?.stage ?? ''),
        score: clamp(s?.score),
        comment: String(s?.comment ?? ''),
      })),
      analysis: data.analysis.map(String),
      practiceTips: data.practiceTips.map(String),
      recommendedPlayers: data.recommendedPlayers.map((p: any) => ({
        name: String(p?.name ?? ''),
        reason: String(p?.reason ?? ''),
      })),
    }
  } catch {
    return null
  }
}
