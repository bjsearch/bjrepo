import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json()

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: '검색어를 입력해주세요.' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = {
      model: 'claude-haiku-4-5',
      max_tokens: 800,
      system: `You are a Korean-English dictionary assistant. When given a Korean word or phrase, provide a detailed dictionary entry in JSON format.

Return ONLY valid JSON with this exact structure:
{
  "word": "main English word or phrase",
  "pronunciation": "/pronunciation/",
  "partOfSpeech": "noun|verb|adjective|adverb|phrase",
  "meanings": [
    {
      "korean": "한국어 뜻",
      "english": "English definition",
      "level": "basic|intermediate|advanced"
    }
  ],
  "examples": [
    {
      "english": "Example sentence in English",
      "korean": "한국어 해석"
    }
  ],
  "synonyms": ["synonym1", "synonym2"],
  "related": [
    {
      "word": "related word",
      "korean": "한국어 뜻"
    }
  ],
  "usage": "casual|formal|both",
  "tip": "짧은 학습 팁 (한국어로)"
}

Rules:
- If multiple English translations exist, use the most common one as "word" and list all in "meanings"
- Provide 2-3 natural example sentences
- Include 2-4 synonyms
- Include 2-3 related words
- Keep tips practical and specific
- Return ONLY valid JSON, no markdown`,
      messages: [{ role: 'user', content: query.trim() }],
    }

    const message = await client.messages.create(params)
    const textBlock = message.content.find((b: { type: string }) => b.type === 'text')
    const text = (textBlock as { type: 'text'; text: string } | undefined)?.text.trim() ?? ''

    const cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
    const result = JSON.parse(cleaned)

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: '결과를 불러오지 못했어요. 다시 시도해주세요.' }, { status: 500 })
    }
    return NextResponse.json({ error: '검색에 실패했어요. API 키를 확인해주세요.' }, { status: 500 })
  }
}
