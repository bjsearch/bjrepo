import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSession } from '@/lib/auth'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { content } = await req.json()
    if (!content?.trim()) return NextResponse.json({ translation: '' })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createParams: any = {
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `Translate the following Korean text to natural, fluent English suitable for a diary entry. Preserve the tone and emotion. Output only the English translation with no explanation:\n\n${content}`,
      }],
    }

    const message = await client.messages.create(createParams)
    const text = message.content.find((b: { type: string }) => b.type === 'text') as { type: 'text'; text: string } | undefined
    return NextResponse.json({ translation: text?.text?.trim() || '' })
  } catch (error) {
    console.error('Translate error:', error)
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 })
  }
}
