'use client'

import { useState, useRef } from 'react'

interface Meaning {
  korean: string
  english: string
  level: 'basic' | 'intermediate' | 'advanced'
}

interface Example {
  english: string
  korean: string
}

interface RelatedWord {
  word: string
  korean: string
}

interface DictionaryResult {
  word: string
  pronunciation: string
  partOfSpeech: string
  meanings: Meaning[]
  examples: Example[]
  synonyms: string[]
  related: RelatedWord[]
  usage: 'casual' | 'formal' | 'both'
  tip: string
}

const LEVEL_STYLE: Record<string, string> = {
  basic: 'bg-emerald-100 text-emerald-700',
  intermediate: 'bg-amber-100 text-amber-700',
  advanced: 'bg-rose-100 text-rose-700',
}

const USAGE_STYLE: Record<string, string> = {
  casual: 'bg-blue-100 text-blue-700',
  formal: 'bg-slate-100 text-slate-600',
  both: 'bg-violet-100 text-violet-700',
}

const USAGE_LABEL: Record<string, string> = {
  casual: '일상 회화',
  formal: '격식체',
  both: '모두 사용',
}

const POS_LABEL: Record<string, string> = {
  noun: '명사',
  verb: '동사',
  adjective: '형용사',
  adverb: '부사',
  phrase: '구/표현',
}

const QUICK_SEARCHES = ['설레다', '뿌듯하다', '어색하다', '솔직히', '그리워하다', '답답하다']

export default function Dictionary() {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<DictionaryResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedWord, setCopiedWord] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const search = async (q?: string) => {
    const term = (q ?? query).trim()
    if (!term) return

    setIsLoading(true)
    setError(null)
    setResult(null)
    if (q) setQuery(q)

    try {
      const res = await fetch('/api/dictionary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: term }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '검색 실패')
    } finally {
      setIsLoading(false)
    }
  }

  const copyWord = (word: string) => {
    navigator.clipboard.writeText(word)
    setCopiedWord(word)
    setTimeout(() => setCopiedWord(null), 1500)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-3 h-3 rounded-full bg-teal-500"></div>
          <span className="text-xs font-semibold text-teal-600 uppercase tracking-wide">Korean → English</span>
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-3">단어 검색</h2>

        {/* Search Bar */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="한국어 단어 또는 표현 입력..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setResult(null); setError(null); inputRef.current?.focus() }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={() => search()}
            disabled={isLoading || !query.trim()}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              !isLoading && query.trim()
                ? 'bg-teal-600 text-white hover:bg-teal-700 shadow-sm'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
            검색
          </button>
        </div>

        {/* Quick Search */}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {QUICK_SEARCHES.map((w) => (
            <button
              key={w}
              onClick={() => search(w)}
              className="text-xs bg-slate-50 text-slate-500 border border-slate-200 px-2.5 py-1 rounded-full hover:bg-teal-50 hover:text-teal-600 hover:border-teal-200 transition-colors"
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="px-6 py-10 flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-teal-100 border-t-teal-500 rounded-full animate-spin" />
          <p className="text-sm text-slate-400">검색 중...</p>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="px-6 py-6 flex items-center gap-3 text-red-500">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Empty State */}
      {!result && !isLoading && !error && (
        <div className="px-6 py-8 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-slate-500 text-sm">한국어 단어나 표현을 입력하면</p>
          <p className="text-slate-400 text-xs mt-1">영어 번역 · 발음 · 예문 · 관련 표현을 알려드려요</p>
        </div>
      )}

      {/* Result */}
      {result && !isLoading && (
        <div className="px-6 py-5 space-y-5">
          {/* Word + pronunciation */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-2xl font-bold text-slate-800">{result.word}</h3>
                <span className="text-sm text-slate-400">{result.pronunciation}</span>
                <div className="flex gap-1.5">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    {POS_LABEL[result.partOfSpeech] ?? result.partOfSpeech}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${USAGE_STYLE[result.usage]}`}>
                    {USAGE_LABEL[result.usage]}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => copyWord(result.word)}
              title="단어 복사"
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-teal-600 bg-slate-50 hover:bg-teal-50 border border-slate-200 hover:border-teal-200 px-2.5 py-1.5 rounded-lg transition-all flex-shrink-0"
            >
              {copiedWord === result.word ? (
                <>
                  <svg className="w-3.5 h-3.5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  복사됨
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  복사
                </>
              )}
            </button>
          </div>

          {/* Meanings */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">뜻</p>
            {result.meanings.map((m, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 mt-0.5 ${LEVEL_STYLE[m.level]}`}>
                  {m.level}
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-700">{m.korean}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{m.english}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Examples */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">예문</p>
            {result.examples.map((ex, i) => (
              <div key={i} className="bg-teal-50 rounded-xl p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-teal-800 font-medium leading-relaxed">{ex.english}</p>
                  <button
                    onClick={() => copyWord(ex.english)}
                    className="flex-shrink-0 text-teal-400 hover:text-teal-600 transition-colors mt-0.5"
                    title="예문 복사"
                  >
                    {copiedWord === ex.english ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="text-xs text-teal-600">{ex.korean}</p>
              </div>
            ))}
          </div>

          {/* Synonyms */}
          {result.synonyms.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">유의어</p>
              <div className="flex flex-wrap gap-1.5">
                {result.synonyms.map((s) => (
                  <button
                    key={s}
                    onClick={() => search(s)}
                    className="text-sm bg-slate-50 text-slate-600 border border-slate-200 px-3 py-1 rounded-full hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Related words */}
          {result.related.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">관련 단어</p>
              <div className="grid grid-cols-2 gap-1.5">
                {result.related.map((r) => (
                  <button
                    key={r.word}
                    onClick={() => search(r.word)}
                    className="flex items-center justify-between bg-slate-50 hover:bg-teal-50 border border-slate-100 hover:border-teal-200 rounded-xl px-3 py-2 transition-all text-left"
                  >
                    <span className="text-sm font-medium text-slate-700">{r.word}</span>
                    <span className="text-xs text-slate-400">{r.korean}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tip */}
          {result.tip && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-xl p-3">
              <span className="text-lg flex-shrink-0">💡</span>
              <p className="text-sm text-amber-800 leading-relaxed">{result.tip}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
