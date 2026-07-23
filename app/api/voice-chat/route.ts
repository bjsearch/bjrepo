import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSession } from '@/lib/auth'
import { getAllEntries, getProfileAnswers } from '@/lib/db'
import { PROFILE_QUESTIONS } from '@/lib/profileQuestions'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MIN_ENTRIES = 20

type ChatType = 'free' | 'tutor' | 'interview' | 'travel'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function buildSystemPrompt(chatType: ChatType, diary: string, profile: string): string {
  const diarySection = `The user's diary entries (oldest to newest)${diary ? '' : ' (none yet)'}:\n\n${diary || '(No diary entries yet.)'}`
  const profileSection = profile ? `\nThe user answered some questions about themselves:\n${profile}\n` : ''

  if (chatType === 'tutor') {
    return `You are a friendly English tutor having a spoken conversation. Your role is to naturally correct the user's English while keeping the conversation flowing.

Guidelines:
- Respond naturally to what they said, then gently note any grammatical or phrasing improvements (e.g. "By the way, a more natural way to say that would be '...'").
- Keep corrections brief and encouraging, never embarrassing.
- Always respond in English. Keep responses to 2-4 sentences.
- Draw on their diary context to make the conversation personal and engaging.
${profileSection}
${diarySection}`
  }

  if (chatType === 'interview') {
    return `You are a professional English interviewer conducting a practice job interview. Ask common interview questions one at a time and give brief feedback on the user's answers before moving to the next question.

Guidelines:
- Start by introducing yourself and asking the classic "Tell me about yourself."
- After each answer, give a short encouraging note (e.g. "Good answer! You could also mention..."), then ask the next question.
- Questions: background, strengths/weaknesses, past experiences, goals, situational questions.
- Keep your turns to 2-3 sentences. Speak in clear, professional English.
${profileSection}
${diarySection}`
  }

  if (chatType === 'travel') {
    return `You are a role-play partner helping the user practice travel English. You play various people the user might meet while traveling — airport staff, hotel receptionist, restaurant server, shop clerk, or a local asking for directions.

Guidelines:
- Start by setting the scene (e.g. "You've just arrived at the airport check-in counter. I'm the airline staff. Ready?").
- Stay in character. Use realistic, natural English phrases someone in that role would say.
- If the user makes a language mistake, briefly step out of character to offer the natural phrase, then jump back in.
- Keep your turns short (1-3 sentences).
${profileSection}
${diarySection}`
  }

  // default: free
  return `You are a warm, friendly English-speaking companion having a voice conversation with someone who keeps an English diary. You've read through their diary entries below, so you know about their life, interests, routines, relationships, and feelings — talk to them like a friend who remembers what they've shared.

Guidelines:
- Always respond in English, at a level the user can comfortably follow (match the vocabulary/grammar level shown in their diary).
- Keep responses short and natural (1-3 sentences) — this is a spoken conversation, not an essay.
- Bring up specific things from their diary naturally, and ask genuine follow-up questions.
- Be encouraging, curious, and personable.
${profileSection}
${diarySection}`
}

function getStarterPrompt(chatType: ChatType): string {
  if (chatType === 'tutor') return '(The user just started an English tutoring session. Greet them warmly, briefly explain you\'ll help correct their English naturally, and ask an easy open question to get them talking.)'
  if (chatType === 'interview') return '(The user just started an interview practice session. Introduce yourself as the interviewer and ask them to tell you about themselves.)'
  if (chatType === 'travel') return '(The user just started travel English practice. Set the first scene — arriving at an airport check-in counter — and start the role-play as the airline staff.)'
  return '(The user just opened our voice chat. Greet them warmly in English and bring up something specific from their diary to start the conversation.)'
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

    const body = await req.json().catch(() => ({}))
    const history: ChatMessage[] = Array.isArray(body?.history) ? body.history : []
    const chatType: ChatType = ['free', 'tutor', 'interview', 'travel'].includes(body?.chatType)
      ? body.chatType
      : 'free'

    const systemPrompt = buildSystemPrompt(chatType, diary, profile)
    const starterPrompt = getStarterPrompt(chatType)

    const messages: ChatMessage[] =
      history.length === 0
        ? [{ role: 'user', content: starterPrompt }]
        : history[0].role === 'assistant'
          ? [{ role: 'user', content: starterPrompt }, ...history]
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
