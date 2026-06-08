import Anthropic from '@anthropic-ai/sdk'

export type VisionContentBlock = { type: 'text'; text: string } | { type: 'image'; base64: string }

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'

/** Thrown when the configured provider's API key is missing, so routes can surface a clear setup error. */
export class AIConfigError extends Error {}

export type Provider = 'anthropic' | 'gemini'

export const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'anthropic', label: 'Claude' },
  { id: 'gemini', label: 'Gemini' },
]

export function isProvider(value: unknown): value is Provider {
  return value === 'anthropic' || value === 'gemini'
}

function resolveProvider(requested?: Provider): Provider {
  if (requested) return requested
  return (process.env.AI_PROVIDER || '').trim().toLowerCase() === 'gemini' ? 'gemini' : 'anthropic'
}

/** Sends a vision prompt (text + base64 JPEG image blocks) to the given (or default) AI provider and returns its raw text reply. */
export async function generateVisionText(
  blocks: VisionContentBlock[],
  maxTokens: number,
  provider?: Provider,
): Promise<string> {
  return resolveProvider(provider) === 'gemini' ? generateWithGemini(blocks, maxTokens) : generateWithAnthropic(blocks, maxTokens)
}

async function generateWithAnthropic(blocks: VisionContentBlock[], maxTokens: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new AIConfigError('서버에 ANTHROPIC_API_KEY가 설정되어 있지 않습니다.')

  const anthropic = new Anthropic({ apiKey })
  const content = blocks.map((block) =>
    block.type === 'text'
      ? { type: 'text' as const, text: block.text }
      : {
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: block.base64 },
        },
  )

  const message = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content }],
  })

  const textBlock = message.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('AI 응답을 읽을 수 없습니다.')
  return textBlock.text
}

async function generateWithGemini(blocks: VisionContentBlock[], maxTokens: number): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new AIConfigError('서버에 GEMINI_API_KEY가 설정되어 있지 않습니다.')

  const parts = blocks.map((block) =>
    block.type === 'text' ? { text: block.text } : { inlineData: { mimeType: 'image/jpeg', data: block.base64 } },
  )

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
          // gemini-2.5 모델은 기본적으로 내부 추론(thinking)에 출력 토큰 예산을 먼저 소비해
          // 정작 응답 본문이 잘리는 경우가 있어, 구조화된 추출 작업에서는 비활성화한다.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  )

  const raw = await res.text()
  let data: any = null
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    // non-JSON error body, fall through to generic error below
  }

  if (!res.ok || !data) {
    const detail = data?.error?.message ?? raw.slice(0, 200) ?? `HTTP ${res.status}`
    throw new Error(`Gemini API 오류: ${detail}`)
  }

  const candidate = data?.candidates?.[0]
  const text: string = candidate?.content?.parts
    ?.map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
    .join('')
    .trim()

  if (!text) {
    const reason = candidate?.finishReason ? ` (finishReason: ${candidate.finishReason})` : ''
    throw new Error(`AI 응답을 읽을 수 없습니다.${reason}`)
  }
  return text
}
