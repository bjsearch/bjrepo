import Anthropic from '@anthropic-ai/sdk'

export type VisionContentBlock = { type: 'text'; text: string } | { type: 'image'; base64: string }

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-pro'
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'

const GEMINI_MODEL_IDS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'] as const

export function isGeminiModel(value: unknown): value is (typeof GEMINI_MODEL_IDS)[number] {
  return typeof value === 'string' && (GEMINI_MODEL_IDS as readonly string[]).includes(value)
}

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
  geminiModel?: string,
): Promise<string> {
  return resolveProvider(provider) === 'gemini'
    ? generateWithGemini(blocks, maxTokens, geminiModel)
    : generateWithAnthropic(blocks, maxTokens)
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

async function generateWithGemini(blocks: VisionContentBlock[], maxTokens: number, geminiModel?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new AIConfigError('서버에 GEMINI_API_KEY가 설정되어 있지 않습니다.')

  const model = geminiModel && isGeminiModel(geminiModel) ? geminiModel : DEFAULT_GEMINI_MODEL

  const parts = blocks.map((block) =>
    block.type === 'text' ? { text: block.text } : { inlineData: { mimeType: 'image/jpeg', data: block.base64 } },
  )

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
  const body = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json',
      // gemini-2.5 모델은 기본적으로 내부 추론(thinking)에 출력 토큰 예산을 먼저 소비해
      // 정작 응답 본문이 잘리는 경우가 있어, 구조화된 추출 작업에서는 비활성화한다.
      thinkingConfig: { thinkingBudget: 0 },
    },
  })

  // "high demand"로 인한 일시적인 503/과부하 응답은 잠시 후 재시도하면 해결되는 경우가 많다.
  const RETRY_DELAYS_MS = [1000, 3000]
  let data: any = null
  let lastDetail = ''

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    const raw = await res.text()
    let parsed: any = null
    try {
      parsed = raw ? JSON.parse(raw) : null
    } catch {
      // non-JSON error body, fall through to generic error below
    }

    if (res.ok && parsed) {
      data = parsed
      break
    }

    lastDetail = parsed?.error?.message ?? raw.slice(0, 200) ?? `HTTP ${res.status}`
    const isTransient = res.status === 503 || res.status === 429 || /overloaded|high demand|unavailable/i.test(lastDetail)
    if (!isTransient || attempt === RETRY_DELAYS_MS.length) {
      throw new Error(`Gemini API 오류: ${lastDetail}`)
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
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
