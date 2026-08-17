import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface VocabContent {
  word: string
  pronunciation: string
  part_of_speech: string
  meaning_ko: string
  example: string
  context_ko: string
  diary_sentences: string[]
}

const LEVEL_GUIDANCE: Record<string, string> = {
  beginner: 'Pick a common, practical word used in everyday Silicon Valley workplaces: emails, Slack, stand-up meetings. Something a Korean new-hire joining a US tech company would hear on their first week. Examples: ship, iterate, sync, deploy, sprint, MVP, pivot.',
  intermediate: 'Pick a moderately sophisticated word used in product discussions, planning, or cross-team communication. Something that would impress but not confuse. Examples: leverage, bottleneck, bandwidth, stakeholder, roadmap, traction, scale.',
  advanced: 'Pick a nuanced business/tech concept used by senior engineers, PMs, or founders. Something that demonstrates real mastery of Silicon Valley culture. Examples: defensibility, arbitrage, compounding, first-mover advantage, asymmetric upside, moat.',
}

export async function generateDailyVocab(level: string): Promise<VocabContent> {
  const levelHint = LEVEL_GUIDANCE[level] || LEVEL_GUIDANCE.intermediate

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = {
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    thinking: { type: 'adaptive' },
    messages: [
      {
        role: 'user',
        content: `You are a Silicon Valley English teacher for Korean professionals. Generate ONE vocabulary lesson.

Level: ${level}
Guidance: ${levelHint}

Pick a DIFFERENT word each time — vary across tech, startup culture, product, engineering, and business domains. Avoid repeating common ones.

Return ONLY valid JSON (no markdown, no extra text):
{
  "word": "the word or short phrase",
  "pronunciation": "/IPA pronunciation/",
  "part_of_speech": "verb|noun|adjective|phrase",
  "meaning_ko": "한국어 의미 (짧고 명확하게)",
  "example": "One natural sentence from a real Silicon Valley context (40 words max)",
  "context_ko": "실리콘밸리에서 언제, 어떻게 쓰는지 한국어로 설명 (2문장 이내)",
  "diary_sentences": [
    "English sentence the learner can copy into their diary (20 words max)",
    "Another diary sentence using the word differently (20 words max)",
    "A third diary sentence (20 words max)"
  ]
}`,
      },
    ],
  }

  const message = await client.messages.create(params)
  const textBlock = message.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text response from Claude')

  let text = textBlock.text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
  return JSON.parse(text) as VocabContent
}

export function formatVocabMessage(vocab: VocabContent): { title: string; description: string } {
  const posMap: Record<string, string> = {
    verb: '동사', noun: '명사', adjective: '형용사', adverb: '부사', phrase: '표현',
  }
  const pos = posMap[vocab.part_of_speech] ?? vocab.part_of_speech

  const title = `📚 오늘의 실리콘밸리 영어: ${vocab.word} (${pos})`

  const sentences = vocab.diary_sentences
    .slice(0, 3)
    .map((s, i) => `${i + 1}. ${s}`)
    .join('\n')

  const description =
    `${vocab.pronunciation}\n` +
    `의미: ${vocab.meaning_ko}\n\n` +
    `💡 예문:\n"${vocab.example}"\n\n` +
    `📝 ${vocab.context_ko}\n\n` +
    `✍️ 내 일기에 써보기:\n${sentences}`

  return { title, description }
}
