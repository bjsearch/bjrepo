'use client'

import { useState } from 'react'
import { AnalysisResult } from '@/lib/types'
import { shareTextToKakao, isKakaoReady } from '@/lib/kakao'

interface Props {
  analysis: AnalysisResult | null
  isLoading: boolean
  error: string | null
  date?: string
}

type Tab = 'grammar' | 'sentences' | 'expressions' | 'vocabulary' | 'feedback'

const levelColors: Record<string, string> = {
  basic: 'bg-green-100 text-green-700',
  intermediate: 'bg-blue-100 text-blue-700',
  advanced: 'bg-purple-100 text-purple-700',
}

export default function WritingAnalysis({ analysis, isLoading, error, date }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('grammar')
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set())
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle')

  const toggleExpanded = (index: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const getExpandableIndices = (): number[] => {
    if (!analysis) return []
    if (activeTab === 'grammar') {
      return analysis.grammar_corrections.map((_, i) => i)
    }
    if (activeTab === 'vocabulary') {
      const vocabIndices = (analysis.vocabulary || []).map((_, i) => i + 100)
      const idiomIndices = (analysis.idioms || []).map((_, i) => i + 200)
      return [...vocabIndices, ...idiomIndices]
    }
    return []
  }

  const allExpanded = (() => {
    const indices = getExpandableIndices()
    return indices.length > 0 && indices.every(i => expandedItems.has(i))
  })()

  const toggleAll = () => {
    const indices = getExpandableIndices()
    if (allExpanded) {
      setExpandedItems(prev => {
        const next = new Set(prev)
        indices.forEach(i => next.delete(i))
        return next
      })
    } else {
      setExpandedItems(prev => {
        const next = new Set(prev)
        indices.forEach(i => next.add(i))
        return next
      })
    }
  }

  const buildShareMessage = (a: AnalysisResult): string => {
    const lines: string[] = [`📝 ${date || ''} 영어 학습 노트`.trim()]

    if (a.vocabulary?.length) {
      lines.push('', '📚 단어')
      a.vocabulary.slice(0, 6).forEach((v) => lines.push(`• ${v.word} - ${v.meaning_ko}`))
    }
    if (a.idioms?.length) {
      lines.push('', '💡 숙어')
      a.idioms.slice(0, 4).forEach((i) => lines.push(`• ${i.idiom} - ${i.meaning_ko}`))
    }
    if (a.better_sentences?.length) {
      lines.push('', '💬 더 나은 표현')
      a.better_sentences.slice(0, 2).forEach((s) => lines.push(`• ${s.improved}`))
    }
    return lines.join('\n')
  }

  const handleShare = () => {
    if (!analysis) return
    const message = buildShareMessage(analysis)
    const url = typeof window !== 'undefined' ? window.location.href : ''

    if (isKakaoReady() && shareTextToKakao(message, url)) return

    navigator.clipboard?.writeText(message).then(() => {
      setShareStatus('copied')
      setTimeout(() => setShareStatus('idle'), 2000)
    })
  }

  const tabs: { id: Tab; label: string; icon: string; count?: number }[] = [
    { id: 'grammar', label: 'Grammar', icon: '✏️', count: analysis?.grammar_corrections.length },
    { id: 'sentences', label: 'Sentences', icon: '💬', count: analysis?.better_sentences.length },
    { id: 'expressions', label: 'Expressions', icon: '🌟', count: analysis?.modern_expressions.length },
    { id: 'vocabulary', label: 'Words & Idioms', icon: '📚', count: (analysis?.vocabulary?.length ?? 0) + (analysis?.idioms?.length ?? 0) },
    { id: 'feedback', label: 'Feedback', icon: '📊' },
  ]

  const typeColors: Record<string, string> = {
    grammar: 'bg-red-100 text-red-700 border-red-200',
    spelling: 'bg-orange-100 text-orange-700 border-orange-200',
    punctuation: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    style: 'bg-blue-100 text-blue-700 border-blue-200',
  }

  const usageColors: Record<string, string> = {
    casual: 'bg-green-100 text-green-700',
    formal: 'bg-purple-100 text-purple-700',
    both: 'bg-blue-100 text-blue-700',
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-indigo-100 rounded-full"></div>
            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <div className="text-center">
            <p className="text-slate-700 font-medium">Analyzing your writing...</p>
            <p className="text-slate-400 text-sm mt-1">Claude AI is reviewing your diary entry</p>
          </div>
          <div className="flex gap-2 mt-2">
            {['Checking grammar', 'Finding expressions', 'Picking vocabulary'].map((step, i) => (
              <div key={step} className="text-xs text-slate-500 flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }}></div>
                {step}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-6">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-red-700">Analysis Failed</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-slate-700 font-semibold text-sm">AI Writing Coach</h3>
            <p className="text-slate-400 text-xs mt-0.5">일기를 쓰고 <span className="text-indigo-500 font-medium">"Analyze My Writing"</span>을 클릭하세요</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-2">
          {[
            { icon: '✏️', label: 'Grammar' },
            { icon: '💬', label: 'Sentences' },
            { icon: '🌟', label: 'Expressions' },
            { icon: '📚', label: 'Words' },
            { icon: '📊', label: 'Score' },
          ].map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-1 bg-slate-50 rounded-xl py-2.5">
              <span className="text-lg">{item.icon}</span>
              <span className="text-xs text-slate-500">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-fadeIn">
      {/* Score Banner */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-indigo-100 text-xs font-medium uppercase tracking-wide">Writing Score</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-4xl font-bold">{analysis.score}</span>
              <span className="text-indigo-200 text-sm">/100</span>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
              analysis.level === 'advanced' ? 'bg-white/20' :
              analysis.level === 'intermediate' ? 'bg-white/15' : 'bg-white/10'
            }`}>
              {analysis.level.charAt(0).toUpperCase() + analysis.level.slice(1)}
            </span>
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 text-xs bg-[#FEE500] text-[#3C1E1E] px-2.5 py-1.5 rounded-lg font-medium hover:brightness-95 transition-all"
              title="주요 단어와 문장을 카카오톡으로 공유"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3C6.5 3 2 6.6 2 11c0 2.9 2 5.5 5 7l-1 3.6c-.1.4.3.7.7.5l4.2-2.5c.4 0 .7.1 1.1.1 5.5 0 10-3.6 10-8S17.5 3 12 3z"/>
              </svg>
              {shareStatus === 'copied' ? '복사됨!' : '카카오톡 공유'}
            </button>
          </div>
        </div>
        <div className="mt-3 bg-white/20 rounded-full h-2">
          <div
            className="bg-white rounded-full h-2 transition-all duration-1000"
            style={{ width: `${analysis.score}%` }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 overflow-x-auto scrollbar-thin">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="p-5 max-h-96 overflow-y-auto scrollbar-thin">
        {(activeTab === 'grammar' || activeTab === 'vocabulary') && getExpandableIndices().length > 0 && (
          <div className="flex justify-end mb-3">
            <button
              onClick={toggleAll}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className={`w-3.5 h-3.5 transition-transform ${allExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {allExpanded ? '모두 접기' : '모두 펼치기'}
            </button>
          </div>
        )}

        {/* Grammar Tab */}
        {activeTab === 'grammar' && (
          <div className="space-y-3">
            {analysis.grammar_corrections.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-3xl mb-2">🎉</div>
                <p className="text-slate-600 font-medium">Perfect Grammar!</p>
                <p className="text-slate-400 text-sm mt-1">No grammar errors found in your entry.</p>
              </div>
            ) : (
              analysis.grammar_corrections.map((item, i) => (
                <div key={i} className="border border-slate-100 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleExpanded(i)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${typeColors[item.type] || typeColors.grammar}`}>
                        {item.type}
                      </span>
                      <span className="text-sm text-red-500 line-through truncate">{item.original}</span>
                    </div>
                    <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 ml-2 transition-transform ${expandedItems.has(i) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {expandedItems.has(i) && (
                    <div className="px-4 pb-4 space-y-2">
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-slate-400 font-medium w-16 flex-shrink-0 mt-0.5">Correct:</span>
                        <span className="text-sm text-emerald-600 font-medium">{item.corrected}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-slate-400 font-medium w-16 flex-shrink-0 mt-0.5">Why:</span>
                        <span className="text-sm text-slate-600">{item.explanation}</span>
                      </div>
                      {item.explanation_ko && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-slate-400 font-medium w-16 flex-shrink-0 mt-0.5">설명:</span>
                          <span className="text-sm text-slate-500">{item.explanation_ko}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Better Sentences Tab */}
        {activeTab === 'sentences' && (
          <div className="space-y-4">
            {analysis.better_sentences.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-3xl mb-2">✨</div>
                <p className="text-slate-600 font-medium">Great Sentences!</p>
                <p className="text-slate-400 text-sm mt-1">Your sentences are already natural and fluent.</p>
              </div>
            ) : (
              analysis.better_sentences.map((item, i) => (
                <div key={i} className="rounded-xl border border-slate-100 overflow-hidden">
                  <div className="p-4 space-y-3">
                    <div>
                      <div className="text-xs text-slate-400 font-medium mb-1">Original</div>
                      <p className="text-sm text-slate-500 bg-slate-50 rounded-lg p-3 leading-relaxed">
                        "{item.original}"
                      </p>
                    </div>
                    <div className="flex items-center justify-center">
                      <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs text-indigo-500 font-medium mb-1">More Natural ✨</div>
                      <p className="text-sm text-indigo-700 bg-indigo-50 rounded-lg p-3 leading-relaxed font-medium">
                        "{item.improved}"
                      </p>
                    </div>
                    <p className="text-xs text-slate-500 italic">{item.explanation}</p>
                    {item.explanation_ko && (
                      <p className="text-xs text-slate-400 mt-1">{item.explanation_ko}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Modern Expressions Tab */}
        {activeTab === 'expressions' && (
          <div className="space-y-3">
            {analysis.modern_expressions.map((item, i) => (
              <div key={i} className="border border-slate-100 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 text-base">"{item.expression}"</span>
                  <div className="flex gap-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${usageColors[item.usage]}`}>
                      {item.usage}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {item.category.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-slate-600">{item.meaning}</p>
                <div className="bg-amber-50 rounded-lg px-3 py-2">
                  <span className="text-xs text-amber-600 font-medium">Example: </span>
                  <span className="text-xs text-amber-700 italic">{item.example}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Vocabulary & Idioms Tab */}
        {activeTab === 'vocabulary' && (
          <div className="space-y-5">
            {/* Vocabulary Section */}
            {analysis.vocabulary && analysis.vocabulary.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <span>📖</span> 단어 (Vocabulary)
                </h4>
                <div className="space-y-2">
                  {analysis.vocabulary.map((item, i) => (
                    <div key={i} className="border border-slate-100 rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleExpanded(i + 100)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-bold text-slate-800 text-sm">{item.word}</span>
                          <span className="text-xs text-slate-400 italic">{item.part_of_speech}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${levelColors[item.level]}`}>
                            {item.level}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className="text-sm text-slate-600 font-medium">{item.meaning_ko}</span>
                          <svg className={`w-4 h-4 text-slate-400 transition-transform ${expandedItems.has(i + 100) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>
                      {expandedItems.has(i + 100) && (
                        <div className="px-4 pb-3 space-y-2 border-t border-slate-50">
                          <p className="text-xs text-slate-500 mt-2">{item.meaning_en}</p>
                          <div className="bg-emerald-50 rounded-lg px-3 py-2">
                            <span className="text-xs text-emerald-600 font-medium">Example: </span>
                            <span className="text-xs text-emerald-700 italic">{item.example}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Idioms Section */}
            {analysis.idioms && analysis.idioms.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <span>💡</span> 숙어 (Idioms & Phrases)
                </h4>
                <div className="space-y-2">
                  {analysis.idioms.map((item, i) => (
                    <div key={i} className="border border-slate-100 rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleExpanded(i + 200)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-indigo-700 text-sm">"{item.idiom}"</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className="text-sm text-slate-600 font-medium">{item.meaning_ko}</span>
                          <svg className={`w-4 h-4 text-slate-400 transition-transform ${expandedItems.has(i + 200) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>
                      {expandedItems.has(i + 200) && (
                        <div className="px-4 pb-3 space-y-2 border-t border-slate-50">
                          <p className="text-xs text-slate-500 mt-2">{item.meaning_en}</p>
                          <div className="bg-indigo-50 rounded-lg px-3 py-2">
                            <span className="text-xs text-indigo-600 font-medium">Example: </span>
                            <span className="text-xs text-indigo-700 italic">{item.example}</span>
                          </div>
                          <div className="bg-amber-50 rounded-lg px-3 py-2">
                            <span className="text-xs text-amber-600 font-medium">사용법: </span>
                            <span className="text-xs text-amber-700">{item.context}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!analysis.vocabulary || analysis.vocabulary.length === 0) &&
             (!analysis.idioms || analysis.idioms.length === 0) && (
              <div className="text-center py-8">
                <div className="text-3xl mb-2">📚</div>
                <p className="text-slate-500 text-sm">단어 정보가 없습니다</p>
              </div>
            )}
          </div>
        )}

        {/* Feedback Tab */}
        {activeTab === 'feedback' && (
          <div className="space-y-4">
            <div className="bg-indigo-50 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-indigo-700 mb-2">📝 Overall Feedback</h4>
              <p className="text-sm text-indigo-800 leading-relaxed">{analysis.overall_feedback}</p>
            </div>

            {analysis.strengths.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                  <span className="text-emerald-500">✅</span> Strengths
                </h4>
                <ul className="space-y-1.5">
                  {analysis.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="text-emerald-400 mt-0.5">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.areas_to_improve.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                  <span className="text-amber-500">🎯</span> Areas to Improve
                </h4>
                <ul className="space-y-1.5">
                  {analysis.areas_to_improve.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="text-amber-400 mt-0.5">•</span>
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.topics.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">🏷️ Topics Detected</h4>
                <div className="flex flex-wrap gap-2">
                  {analysis.topics.map((topic, i) => (
                    <span key={i} className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full">
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
