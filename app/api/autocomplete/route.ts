import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSession } from '@/lib/auth'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ suggestion: '' }, { status: 401 })
    const { content } = await request.json()

    const wordCount = content?.trim().split(/\s+/).length ?? 0
    if (!content || wordCount < 4) {
      return NextResponse.json({ suggestion: '' })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = {
      model: 'claude-haiku-4-5',
      max_tokens: 60,
      system: `You are an English diary writing assistant providing inline autocomplete.
Complete what the user is currently writing — output ONLY the continuation text.
Rules:
- If the text ends mid-sentence, complete that sentence (1 sentence max)
- If it ends with a complete sentence, add one short natural follow-up sentence
- Match the user's vocabulary level, tone, and tense exactly
- No quotes, no labels, no explanation — raw continuation text only
- Keep it under 25 words`,
      messages: [{ role: 'user', content }],
    }

    const message = await client.messages.create(params)
    const textBlock = message.content.find((b: { type: string }) => b.type === 'text')
    const suggestion = (textBlock as { type: 'text'; text: string } | undefined)?.text.trim() ?? ''

    return NextResponse.json({ suggestion })
  } catch {
    return NextResponse.json({ suggestion: '' })
  }
}
