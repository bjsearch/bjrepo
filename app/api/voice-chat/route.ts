import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSession } from '@/lib/auth'
import { getAllEntries, getProfileAnswers } from '@/lib/db'
import { PROFILE_QUESTIONS } from '@/lib/profileQuestions'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MIN_ENTRIES = 20

const STARTER_PROMPT =
  '(The user just opened our voice chat. Greet them warmly in English and bring up something specific from their diary to start the conversation.)'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const entries = await getAllEntries(session.userId)
    const written = entries.filter(e => e.content.trim())
    if (written.length < MIN_ENTRIES && session.role !== 'admin') {
      return NextResponse.json(
        { error: `일기를 ${MIN_ENTRIES}개 이상 작성하면 이용할 수 있어요 (현재 ${written.length}/${MIN_ENTRIES})` },
        { status: 403 }
      )
    }

    const diary = written
      .slice(0, 60)
      .reverse()
      .map(e => `[${e.date}]\n${e.content.trim().slice(0, 1000)}`)
      .join('\n\n')

    const profileAnswers = await getProfileAnswers(session.userId)
    const profile = PROFILE_QUESTIONS
      .map((q, i) => ({ q, a: profileAnswers[i]?.trim() }))
      .filter(({ a }) => a)
      .map(({ q, a }) => `- ${q} ${a}`)
      .join('\n')

    const systemPrompt = `You are a warm, friendly English-speaking companion having a voice conversation with someone who keeps an English diary. You've read through their diary entries below, so you know about their life, interests, routines, relationships, and feelings — talk to them like a friend who remembers what they've shared.

Guidelines:
- Always respond in English, at a level the user can comfortably follow (match the vocabulary/grammar level shown in their diary).
- Keep responses short and natural (1-3 sentences) — this is a spoken conversation, not an essay.
- Bring up specific things from their diary naturally, and ask genuine follow-up questions.
- Be encouraging, curious, and personable.
${profile ? `\nThe user also answered some questions about themselves ahead of time:\n${profile}\n` : ''}
The user's diary entries (oldest to newest)${diary ? '' : ' (none yet)'}:

${diary || '(The user has not written any diary entries yet. Rely on the profile answers above and get to know them through conversation.)'}`

    const body = await req.json().catch(() => ({}))
    const history: ChatMessage[] = Array.isArray(body?.history) ? body.history : []

    const messages: ChatMessage[] =
      history.length === 0
        ? [{ role: 'user', content: STARTER_PROMPT }]
        : history[0].role === 'assistant'
          ? [{ role: 'user', content: STARTER_PROMPT }, ...history]
          : history

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createParams: any = {
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: systemPrompt,
      messages,
    }

    const message = await client.messages.create(createParams)
    const text = message.content.find((b: { type: string }) => b.type === 'text') as
      | { type: 'text'; text: string }
      | undefined

    return NextResponse.json({ reply: text?.text?.trim() || '' })
  } catch (error) {
    console.error('Voice chat error:', error)
    return NextResponse.json({ error: '대화 중 오류가 발생했어요' }, { status: 500 })
  }
}
