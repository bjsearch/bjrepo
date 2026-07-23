import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getProfileAnswers, setProfileAnswers } from '@/lib/db'
import { PROFILE_QUESTIONS } from '@/lib/profileQuestions'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const answers = await getProfileAnswers(session.userId)
  return NextResponse.json({ questions: PROFILE_QUESTIONS, answers })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { answers } = await req.json()
  if (!Array.isArray(answers)) {
    return NextResponse.json({ error: 'Invalid answers' }, { status: 400 })
  }

  const trimmed = PROFILE_QUESTIONS.map((_, i) => (typeof answers[i] === 'string' ? answers[i].trim().slice(0, 500) : ''))
  await setProfileAnswers(session.userId, trimmed)
  return NextResponse.json({ ok: true })
}
