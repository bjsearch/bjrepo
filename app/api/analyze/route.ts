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
      "type": "grammar|spelling|punctuation|style"
    }
  ],
  "better_sentences": [
    {
      "original": "original sentence from the entry",
      "improved": "more natural, fluent version",
      "explanation": "why this version sounds more native"
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
- Score should be 0-100 based on grammar, vocabulary, and fluency
- Topics should be 2-4 specific topics from the diary entry (for YouTube video search)
- Be encouraging and constructive, not discouraging
- Modern expressions should be current, natural English used by native speakers
- Return ONLY valid JSON, no markdown code blocks, no extra text`

export async function POST(request: NextRequest) {
  try {
    const { content } = await request.json()

    if (!content || content.trim().length < 10) {
      return NextResponse.json(
        { error: 'Please write at least a few sentences before analyzing.' },
        { status: 400 }
      )
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
          content: `Please analyze this English diary entry and provide feedback:\n\n${content}`,
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
