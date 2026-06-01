'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import { DiaryEntry } from '@/lib/types'

interface Props {
  entry: DiaryEntry
  onUpdate: (content: string) => void
  onAnalyze: () => void
  onDelete?: () => void
  isAnalyzing: boolean
}

const hasKorean = (text: string) => /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(text)

export default function DiaryEditor({ entry, onUpdate, onAnalyze, onDelete, isAnalyzing }: Props) {
  const [content, setContent] = useState(entry.content)
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const [isSaved, setIsSaved] = useState(true)

  // Autocomplete
  const [suggestion, setSuggestion] = useState('')
  const [isFetchingSuggestion, setIsFetchingSuggestion] = useState(false)
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(true)

  // Translation
  const [translation, setTranslation] = useState('')
  const [isFetchingTranslation, setIsFetchingTranslation] = useState(false)
  const [showTranslation, setShowTranslation] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const autocompleteDebounceRef = useRef<ReturnType<typeof setTimeout>>()
  const translateDebounceRef = useRef<ReturnType<typeof setTimeout>>()
  const autocompleteAbortRef = useRef<AbortController>()
  const translateAbortRef = useRef<AbortController>()
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    setContent(entry.content)
    setSuggestion('')
    setTranslation('')
    setShowTranslation(false)
  }, [entry.id])

  useEffect(() => {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0
    setWordCount(words)
    setCharCount(content.length)
  }, [content])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.max(300, textareaRef.current.scrollHeight) + 'px'
    }
  }, [content])

  const fetchSuggestion = useCallback(async (text: string) => {
    autocompleteAbortRef.current?.abort()
    autocompleteAbortRef.current = new AbortController()

    if (text.trim().split(/\s+/).length < 4 || hasKorean(text)) {
      setSuggestion('')
      return
    }

    setIsFetchingSuggestion(true)
    try {
      const res = await fetch('/api/autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
        signal: autocompleteAbortRef.current.signal,
      })
      const data = await res.json()
      setSuggestion(data.suggestion || '')
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setSuggestion('')
    } finally {
      setIsFetchingSuggestion(false)
    }
  }, [])

  const fetchTranslation = useCallback(async (text: string) => {
    translateAbortRef.current?.abort()
    translateAbortRef.current = new AbortController()

    if (!hasKorean(text) || text.trim().length < 2) {
      setTranslation('')
      setShowTranslation(false)
      return
    }

    setIsFetchingTranslation(true)
    setShowTranslation(true)
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
        signal: translateAbortRef.current.signal,
      })
      const data = await res.json()
      setTranslation(data.translation || '')
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setTranslation('')
    } finally {
      setIsFetchingTranslation(false)
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    setContent(newContent)
    setSuggestion('')
    setIsSaved(false)
    onUpdate(newContent)

    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => setIsSaved(true), 500)

    // Translation debounce (when Korean detected)
    clearTimeout(translateDebounceRef.current)
    if (hasKorean(newContent)) {
      translateDebounceRef.current = setTimeout(() => fetchTranslation(newContent), 900)
    } else {
      setTranslation('')
      setShowTranslation(false)
    }

    // Autocomplete debounce (English only)
    if (!autocompleteEnabled || hasKorean(newContent)) return
    clearTimeout(autocompleteDebounceRef.current)
    autocompleteDebounceRef.current = setTimeout(() => fetchSuggestion(newContent), 700)
  }

  const acceptSuggestion = () => {
    if (!suggestion) return
    const separator = content && !content.match(/[\s\n]$/) ? ' ' : ''
    const newContent = content + separator + suggestion
    setContent(newContent)
    setSuggestion('')
    onUpdate(newContent)
    textareaRef.current?.focus()
  }

  const applyTranslation = () => {
    if (!translation) return
    setContent(translation)
    onUpdate(translation)
    setTranslation('')
    setShowTranslation(false)
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && suggestion) {
      e.preventDefault()
      acceptSuggestion()
    } else if (e.key === 'Escape') {
      if (suggestion) setSuggestion('')
      if (showTranslation) setShowTranslation(false)
    }
  }

  const entryDate = entry.date
    ? format(parseISO(entry.date), 'EEEE, MMMM d, yyyy')
    : format(new Date(), 'EEEE, MMMM d, yyyy')

  const canAnalyze = wordCount >= 10 && !isAnalyzing && !hasKorean(content)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
            <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Daily Journal</span>
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mt-0.5">{entryDate}</h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setAutocompleteEnabled(p => !p); setSuggestion('') }}
            title={autocompleteEnabled ? 'Disable autocomplete' : 'Enable autocomplete'}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
              autocompleteEnabled
                ? 'bg-violet-50 border-violet-200 text-violet-600'
                : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            AI Complete
          </button>

          {isSaved && content && (
            <span className="text-xs text-emerald-500 flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Saved
            </span>
          )}
          <div className="text-xs text-slate-400">
            {wordCount} words · {charCount} chars
          </div>
        </div>
      </div>

      {/* Writing Prompts */}
      {!content && (
        <div className="px-6 py-3 bg-indigo-50 border-b border-indigo-100">
          <p className="text-xs text-indigo-600 font-medium mb-1">✨ Writing prompts (한글로 써도 번역해드려요):</p>
          <div className="flex flex-wrap gap-2">
            {['What happened today?', 'How are you feeling?', 'What did you learn?', 'What are you grateful for?'].map((prompt) => (
              <button
                key={prompt}
                onClick={() => {
                  setContent(prompt + ' ')
                  onUpdate(prompt + ' ')
                  textareaRef.current?.focus()
                }}
                className="text-xs bg-white text-indigo-600 border border-indigo-200 rounded-full px-3 py-1 hover:bg-indigo-600 hover:text-white transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Textarea */}
      <div className="px-6 py-4">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Start writing your diary in English... or write in Korean (한글로 써도 돼요!) and we'll translate it for you."
          className="w-full resize-none outline-none text-slate-700 text-base leading-relaxed placeholder-slate-300 font-light"
          style={{ minHeight: '300px', fontFamily: 'inherit' }}
        />
      </div>

      {/* Translation panel (Korean detected) */}
      {showTranslation && (
        <div className="mx-4 mb-3 rounded-xl border border-sky-200 bg-sky-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-sky-100">
            <div className="flex items-center gap-2">
              <span className="text-sm">🇰🇷→🇺🇸</span>
              <span className="text-xs font-semibold text-sky-700">한글 번역</span>
              {isFetchingTranslation && (
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1 h-1 rounded-full bg-sky-400 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setShowTranslation(false)}
              className="text-sky-400 hover:text-sky-600 transition-colors text-xs">✕</button>
          </div>

          {isFetchingTranslation && !translation ? (
            <div className="px-4 py-3">
              <div className="h-3 bg-sky-200/60 rounded animate-pulse w-3/4 mb-2"></div>
              <div className="h-3 bg-sky-200/60 rounded animate-pulse w-1/2"></div>
            </div>
          ) : translation ? (
            <>
              <div className="px-4 py-3 max-h-36 overflow-y-auto">
                <p className="text-sm text-sky-800 leading-relaxed whitespace-pre-wrap">{translation}</p>
              </div>
              <div className="px-4 py-2.5 border-t border-sky-100 flex items-center justify-between">
                <p className="text-xs text-sky-500">번역 결과를 본문에 적용할까요?</p>
                <button
                  onClick={applyTranslation}
                  className="flex items-center gap-1.5 text-xs bg-sky-600 text-white px-3 py-1.5 rounded-lg hover:bg-sky-700 transition-colors font-medium"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  본문에 붙여넣기
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Autocomplete suggestion bar */}
      {autocompleteEnabled && !showTranslation && (suggestion || isFetchingSuggestion) && (
        <div className="mx-4 mb-3 rounded-xl border border-violet-200 bg-violet-50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5">
            {isFetchingSuggestion && !suggestion ? (
              <>
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <span className="text-xs text-violet-400">Thinking...</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-sm text-violet-700 italic flex-1 leading-snug">{suggestion}</span>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <button onClick={acceptSuggestion}
                    className="flex items-center gap-1 text-xs bg-violet-600 text-white px-2.5 py-1 rounded-lg hover:bg-violet-700 transition-colors font-medium">
                    <kbd className="font-sans">Tab</kbd>
                    <span>Accept</span>
                  </button>
                  <button onClick={() => setSuggestion('')}
                    className="text-xs text-violet-400 hover:text-violet-600 px-1 transition-colors" title="Dismiss (Esc)">
                    ✕
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-400">
            {hasKorean(content) ? (
              <span className="text-sky-500">한글이 감지됐어요. 번역 후 분석하세요.</span>
            ) : wordCount < 10 ? (
              <span className="text-amber-500">Write at least {10 - wordCount} more words to analyze</span>
            ) : (
              <span className="text-emerald-500">Ready to analyze! 🎉</span>
            )}
          </div>
          {onDelete && (
            <button onClick={onDelete} title="Delete this entry"
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          )}
        </div>
        <button
          onClick={onAnalyze}
          disabled={!canAnalyze}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition-all ${
            canAnalyze
              ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-md'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
        >
          {isAnalyzing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analyzing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Analyze My Writing
            </>
          )}
        </button>
      </div>
    </div>
  )
}
