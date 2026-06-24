import { NextResponse } from 'next/server'
import { AIConfigError, generateVisionText, isGeminiModel, isProvider } from '@/lib/ai'

const VALID_CATEGORIES = ['driver', 'wood', 'utility', 'iron', 'wedge'] as const

export async function POST(req: Request) {
  try {
    const { frame, provider: rp, geminiModel: rgm, feedbackHint } = await req.json()

    if (typeof frame !== 'string' || !frame) {
      return NextResponse.json({ error: 'Frame is required' }, { status: 400 })
    }

    const provider = isProvider(rp) ? rp : undefined
    const geminiModel = isGeminiModel(rgm) ? rgm : undefined

    const hintBlock = feedbackHint ? `\n\n참고: 이전 피드백 데이터에 따르면\n${feedbackHint}` : ''

    const prompt = `아래 이미지는 골프 스윙 영상의 한 프레임입니다.
이 이미지에서 골퍼가 사용하고 있는 클럽의 종류를 식별하세요.

다음 5가지 카테고리 중 하나로 분류하세요:
- driver: 드라이버 (가장 큰 헤드, 긴 샤프트, 티 위의 공)
- wood: 우드/페어웨이 우드 (드라이버보다 작은 둥근 헤드, 긴 샤프트)
- utility: 유틸리티/하이브리드 (우드와 아이언 중간 크기의 헤드)
- iron: 아이언 (납작한 블레이드형 헤드, 중간~짧은 샤프트)
- wedge: 웻지 (아이언보다 넓고 로프트가 큰 헤드, 짧은 샤프트)

판별 포인트:
- 클럽 헤드의 크기와 형태
- 샤프트의 길이 (어드레스 자세에서 골퍼와의 거리)
- 공의 위치 (티 위 vs 지면)
- 스윙의 크기와 궤도${hintBlock}

반드시 아래 JSON 형식으로만 응답하세요:
{"category": "driver|wood|utility|iron|wedge", "confidence": "high|medium|low", "reason": "판단 근거 한 문장"}`

    let responseText: string
    try {
      responseText = await generateVisionText(
        [{ type: 'text', text: prompt }, { type: 'image', base64: frame }],
        200,
        provider,
        geminiModel,
      )
    } catch (err) {
      if (err instanceof AIConfigError) {
        return NextResponse.json({ error: err.message }, { status: 500 })
      }
      throw err
    }

    const jsonMatch = responseText.trim().match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 502 })
    }

    const data = JSON.parse(jsonMatch[0])
    const category = VALID_CATEGORIES.includes(data.category) ? data.category : null

    if (!category) {
      return NextResponse.json({ error: 'Invalid category detected' }, { status: 502 })
    }

    return NextResponse.json({
      category,
      confidence: data.confidence ?? 'medium',
      reason: data.reason ?? '',
    })
  } catch (err) {
    console.error('detect-club error', err)
    return NextResponse.json({ error: 'Club detection failed' }, { status: 500 })
  }
}
