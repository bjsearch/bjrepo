import { NextResponse } from 'next/server'
import { AIConfigError, generateVisionText, isGeminiModel, isProvider } from '@/lib/ai'

export interface TrajectoryEstimate {
  headSpeed: number
  ballSpeed: number
  launchAngle: number
  carry: number
  apex: number
  smashFactor: number
}

export async function POST(req: Request) {
  try {
    const { frames, clubCategory, provider: rp, geminiModel: rgm } = await req.json()

    if (!Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json({ error: 'Frames required' }, { status: 400 })
    }
    if (frames.length > 6 || frames.some((f: unknown) => typeof f !== 'string' || (f as string).length > 5_000_000)) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }

    const provider = isProvider(rp) ? rp : undefined
    const geminiModel = isGeminiModel(rgm) ? rgm : undefined
    const club = typeof clubCategory === 'string' ? clubCategory : 'iron'

    const prompt = `아래 이미지들은 골프 스윙 영상의 연속 프레임입니다 (어드레스 → 백스윙 탑 → 임팩트 → 팔로스루 → 피니시 순서).
사용 클럽: ${club}

이 스윙 영상을 분석하여 다음 값들을 추정하세요:

1. 헤드스피드 (m/s): 다운스윙에서 임팩트까지의 클럽헤드 이동 속도를 스윙 크기, 몸통 회전 속도, 팔 속도로 추정
2. 스매시팩터: 클럽 종류에 따라 적절한 값 (드라이버 1.45-1.50, 우드 1.40-1.45, 유틸 1.35-1.40, 아이언 1.30-1.38, 웨지 1.20-1.30)
3. 볼스피드 (m/s): 헤드스피드 × 스매시팩터
4. 런치앵글 (도): 클럽 종류와 임팩트 자세로 추정 (드라이버 10-15°, 우드 13-17°, 유틸 15-19°, 아이언 18-25°, 웨지 28-45°)
5. 캐리거리 (m): 볼스피드와 런치앵글로 물리적 추정
6. 최고높이 (m): 궤적의 정점 높이

아마추어 골퍼 기준으로 현실적으로 추정하세요. 프로처럼 과대평가하지 마세요.

반드시 아래 JSON 형식으로만 응답하세요:
{"headSpeed": 35.0, "ballSpeed": 50.0, "launchAngle": 12.5, "carry": 200, "apex": 28, "smashFactor": 1.43}`

    const contentBlocks = [
      { type: 'text' as const, text: prompt },
      ...frames.map((f: string) => ({ type: 'image' as const, base64: f })),
    ]

    let responseText: string
    try {
      responseText = await generateVisionText(contentBlocks, 300, provider, geminiModel)
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
    const result: TrajectoryEstimate = {
      headSpeed: Number(data.headSpeed) || 0,
      ballSpeed: Number(data.ballSpeed) || 0,
      launchAngle: Number(data.launchAngle) || 0,
      carry: Number(data.carry) || 0,
      apex: Number(data.apex) || 0,
      smashFactor: Number(data.smashFactor) || 0,
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('estimate-trajectory error', err)
    return NextResponse.json({ error: 'Trajectory estimation failed' }, { status: 500 })
  }
}
