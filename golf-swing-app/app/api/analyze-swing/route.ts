import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { SwingAnalysisResult } from '@/lib/types'

const MAX_FRAMES = 4

export async function POST(req: Request) {
  try {
    const { frames, clubDescription } = await req.json()

    if (!Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json({ error: '분석할 프레임이 없습니다.' }, { status: 400 })
    }
    if (typeof clubDescription !== 'string' || !clubDescription.trim()) {
      return NextResponse.json({ error: '클럽 정보가 필요합니다.' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: '서버에 ANTHROPIC_API_KEY가 설정되어 있지 않습니다.' }, { status: 500 })
    }

    const anthropic = new Anthropic({ apiKey })

    const usedFrames: string[] = frames.slice(0, MAX_FRAMES)

    const imageBlocks = usedFrames.map((base64: string) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: 'image/jpeg' as const,
        data: base64,
      },
    }))

    const instructions = `당신은 PGA/LPGA 투어 경험이 있는 골프 스윙 코치입니다.
아래 이미지는 한 사용자의 골프 스윙 영상에서 시간 순서대로 추출한 연속 프레임들입니다.
사용 클럽: ${clubDescription}

이 프레임들을 어드레스 → 백스윙 → 탑 → 다운스윙 → 임팩트 → 팔로우스루 흐름으로 보고 스윙을 분석한 뒤,
반드시 아래 JSON 형식으로만 간결하게 응답하세요. 다른 설명, 코드블록, 마크다운 없이 순수 JSON 객체만 출력합니다.
각 항목은 한 문장 내외로 짧고 핵심만 담아 작성하세요.

{
  "score": 0-100 사이의 정수 종합 점수,
  "scoreSummary": "점수에 대한 한 문장 요약 (한국어)",
  "analysis": ["스윙 단계별 또는 항목별 분석 포인트 (한국어, 정확히 3개 문자열 배열, 각 한 문장)"],
  "practiceTips": ["이 스윙을 개선하기 위한 구체적인 연습 방법 (한국어, 정확히 3개 문자열 배열, 각 한 문장)"],
  "recommendedPlayers": [
    { "name": "참고하면 좋을 선수 이름", "reason": "추천 이유 (한국어, 한 문장)" }
  ]
}

recommendedPlayers는 정확히 2명만 추천하세요. 클럽 종류(${clubDescription})의 특성도 분석에 반영하세요.
이미지만으로 정확한 스윙 속도나 club path 등을 측정할 수 없는 점을 감안해, 시각적으로 관찰 가능한 자세·정렬·균형·템포 위주로 분석하세요.`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: instructions },
            ...imageBlocks,
          ],
        },
      ],
    })

    const textBlock = message.content.find((block) => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'AI 응답을 읽을 수 없습니다.' }, { status: 502 })
    }

    const parsed = parseAnalysisJson(textBlock.text)
    if (!parsed) {
      return NextResponse.json({ error: 'AI 응답을 분석 결과로 변환하지 못했습니다.' }, { status: 502 })
    }

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('swing analysis error', err)
    const detail = err instanceof Anthropic.APIError
      ? `${err.status} ${err.message}`
      : err instanceof Error
        ? err.message
        : String(err)
    return NextResponse.json(
      { error: `스윙 분석 중 오류가 발생했습니다. (${detail})` },
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
      !Array.isArray(data.analysis) ||
      !Array.isArray(data.practiceTips) ||
      !Array.isArray(data.recommendedPlayers)
    ) {
      return null
    }
    return {
      score: Math.max(0, Math.min(100, Math.round(data.score))),
      scoreSummary: data.scoreSummary,
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
