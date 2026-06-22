import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SYSTEM_PROMPT = `You are an expert English writing coach specializing in helping non-native English speakers improve their writing. You analyze diary entries and provide detailed, encouraging feedback.

Your analysis must be returned as valid JSON with this exact structure:
{
  "grammar_corrections": [
    {
      "original": "exact text from the entry with error",
      "corrected": "corrected version",
      "explanation": "brief, clear explanation of the error and why the correction is better",
      "explanation_ko": "왜 이렇게 고쳤는지 한국어로 쉽게 설명",
      "type": "grammar|spelling|punctuation|style"
    }
  ],
  "better_sentences": [
    {
      "original": "original sentence from the entry",
      "improved": "more natural, fluent version",
      "explanation": "why this version sounds more native",
      "explanation_ko": "왜 이 표현이 더 자연스러운지 한국어로 쉽게 설명"
    }
  ],
  "modern_expressions": [
    {
      "expression": "modern expression or phrase",
      "meaning": "what it means",
      "example": "example sentence using it",
      "usage": "casual|formal|both",
      "category": "idiom|slang|phrasal_verb|collocation"
    }
  ],
  "vocabulary": [
    {
      "word": "useful word or phrase from the diary or related to its topics",
      "part_of_speech": "noun|verb|adjective|adverb|phrase",
      "meaning_ko": "한국어 뜻",
      "meaning_en": "clear English definition",
      "example": "natural example sentence using this word",
      "level": "basic|intermediate|advanced"
    }
  ],
  "idioms": [
    {
      "idiom": "English idiom or fixed phrase",
      "meaning_ko": "한국어 뜻",
      "meaning_en": "what this idiom means in plain English",
      "example": "natural sentence using the idiom",
      "context": "when and how to use it (casual conversation / formal writing / etc.)"
    }
  ],
  "overall_feedback": "2-3 sentences of encouraging, constructive overall feedback",
  "topics": ["topic1", "topic2", "topic3"],
  "level": "beginner|intermediate|advanced",
  "score": 75,
  "strengths": ["strength1", "strength2"],
  "areas_to_improve": ["area1", "area2"]
}

Rules:
- Provide 2-5 grammar corrections (only if there are actual errors; don't invent errors)
- Provide 2-3 better sentence alternatives
- Suggest 3-5 modern English expressions RELATED to the topics in the diary
- Provide 5-8 vocabulary items: pick words/phrases that appear in the diary AND add related useful words matching the diary's context. Prioritize words worth memorizing.
- Provide 4-6 idioms: choose common English idioms that are relevant to the diary's topics or emotions. These should be practical and frequently used by native speakers.
- Score should be 0-100 based on grammar, vocabulary, and fluency
- Topics should be 2-4 specific topics from the diary entry (for YouTube video search)
- Be encouraging and constructive, not discouraging
- Modern expressions should be current, natural English used by native speakers
- Return ONLY valid JSON, no markdown code blocks, no extra text`

export async function POST(request: NextRequest) {
  try {
    const { content, acceptedSuggestions } = await request.json()

    if (!content || content.trim().length < 10) {
      return NextResponse.json(
        { error: 'Please write at least a few sentences before analyzing.' },
        { status: 400 }
      )
    }

    let userMessage = `Please analyze this English diary entry and provide feedback:\n\n${content}`
    if (Array.isArray(acceptedSuggestions) && acceptedSuggestions.length > 0) {
      userMessage += `\n\n[NOTE: The following phrases were suggested by our AI autocomplete and accepted by the user. Do NOT mark these as grammar errors, do NOT include them in grammar_corrections, and do NOT suggest corrections for them in better_sentences. These are phrases our own system recommended, so criticizing them would be inconsistent:\n${acceptedSuggestions.map(s => `- "${s}"`).join('\n')}\n]`
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createParams: any = {
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    }
    const message = await client.messages.create(createParams)

    const textBlock = message.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude')
    }

    let analysisText = textBlock.text.trim()
    // Remove markdown code blocks if present
    analysisText = analysisText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()

    const analysis = JSON.parse(analysisText)
    return NextResponse.json(analysis)
  } catch (error) {
    console.error('Analysis error:', error)
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Failed to parse AI response. Please try again.' },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { error: 'Analysis failed. Please check your API key and try again.' },
      { status: 500 }
    )
  }
}
