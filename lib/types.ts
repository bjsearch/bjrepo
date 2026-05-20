export interface DiaryEntry {
  id: string
  date: string
  content: string
  analysis?: AnalysisResult
  createdAt: string
  updatedAt: string
}

export interface GrammarCorrection {
  original: string
  corrected: string
  explanation: string
  type: 'grammar' | 'spelling' | 'punctuation' | 'style'
}

export interface BetterSentence {
  original: string
  improved: string
  explanation: string
}

export interface ModernExpression {
  expression: string
  meaning: string
  example: string
  usage: 'casual' | 'formal' | 'both'
  category: 'idiom' | 'slang' | 'phrasal_verb' | 'collocation'
}

export interface AnalysisResult {
  grammar_corrections: GrammarCorrection[]
  better_sentences: BetterSentence[]
  modern_expressions: ModernExpression[]
  overall_feedback: string
  topics: string[]
  level: 'beginner' | 'intermediate' | 'advanced'
  score: number
  strengths: string[]
  areas_to_improve: string[]
}

export interface YouTubeVideo {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
  url: string
  description: string
  topic: string
}
