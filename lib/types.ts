export interface DiaryEntry {
  id: string
  date: string
  content: string
  analysis?: AnalysisResult
  createdAt: string
  updatedAt: string
  userId?: string
}

export interface User {
  id: string
  username: string
  role: 'user' | 'admin'
  createdAt: string
  entryCount?: number
  analyzedCount?: number
  avgScore?: number
  lastLoginAt?: string
  lastLoginIp?: string
  lastLoginCountry?: string
  lastLoginRegion?: string
  lastLoginCity?: string
  reminderEnabled?: boolean
  reminderTime?: string
  kakaoConnected?: boolean
}

export interface PushSubscriptionJSON {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

export interface LoginLog {
  id: string
  userId: string
  username: string
  loginAt: string
  ip?: string
  country?: string
  region?: string
  city?: string
  latitude?: string
  longitude?: string
}

export interface UsageStats {
  totalUsers: number
  totalEntries: number
  analyzedEntries: number
  avgScore: number
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

export interface VocabularyItem {
  word: string
  part_of_speech: string
  meaning_ko: string
  meaning_en: string
  example: string
  level: 'basic' | 'intermediate' | 'advanced'
}

export interface IdiomItem {
  idiom: string
  meaning_ko: string
  meaning_en: string
  example: string
  context: string
}

export interface AnalysisResult {
  grammar_corrections: GrammarCorrection[]
  better_sentences: BetterSentence[]
  modern_expressions: ModernExpression[]
  vocabulary: VocabularyItem[]
  idioms: IdiomItem[]
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
