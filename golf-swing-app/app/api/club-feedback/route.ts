import { NextResponse } from 'next/server'
import { getStore } from '@netlify/blobs'

interface ClubFeedbackTally {
  correct: number
  incorrect: number
}

type ClubFeedbackStats = Record<string, ClubFeedbackTally>

const VALID_CATEGORIES = ['driver', 'wood', 'utility', 'iron', 'wedge'] as const
const BLOB_KEY = 'club-detection-feedback'

async function loadStats(): Promise<ClubFeedbackStats> {
  try {
    const store = getStore('feedback')
    const raw = await store.get(BLOB_KEY, { type: 'json' }) as ClubFeedbackStats | null
    return raw ?? {}
  } catch {
    return {}
  }
}

export async function GET() {
  const stats = await loadStats()
  return NextResponse.json({ stats })
}

export async function POST(req: Request) {
  try {
    const { detectedCategory, actualCategory, accurate } = await req.json()

    if (typeof detectedCategory !== 'string' || typeof accurate !== 'boolean') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    if (!VALID_CATEGORIES.includes(detectedCategory as typeof VALID_CATEGORIES[number])) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }
    if (typeof actualCategory === 'string' && !VALID_CATEGORIES.includes(actualCategory as typeof VALID_CATEGORIES[number])) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }

    const store = getStore('feedback')
    const stats = await loadStats()

    const key = detectedCategory
    if (!stats[key]) stats[key] = { correct: 0, incorrect: 0 }

    if (accurate) {
      stats[key].correct++
    } else {
      stats[key].incorrect++
      if (typeof actualCategory === 'string' && actualCategory !== detectedCategory) {
        const correctionKey = `${detectedCategory}→${actualCategory}`
        if (!stats[correctionKey]) stats[correctionKey] = { correct: 0, incorrect: 0 }
        stats[correctionKey].incorrect++
      }
    }

    await store.setJSON(BLOB_KEY, stats)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('club-feedback error', err)
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 })
  }
}
