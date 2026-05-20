'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import { DiaryEntry } from '@/lib/types'

interface Props {
  entry: DiaryEntry
  onUpdate: (content: string) => void
  onAnalyze: () => void
  isAnalyzing: boolean
}

export default function DiaryEditor({ entry, onUpdate, onAnalyze, isAnalyzing }: Props) {
  const [content, setContent] = useState(entry.content)
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const [isSaved, setIsSaved] = useState(true)
  const [suggestion, setSuggestion] = useState('')
  const [isFetchingSuggestion, setIsFetchingSuggestion] = useState(false)
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(true)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const abortRef = useRef<AbortController>()
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    setContent(entry.content)
    setSuggestion('')
  }, [entry.id])

  useEffect(() => {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0
    setWordCount(words)
    setCharCount(content.length)
  }, [content])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.max(380, textareaRef.current.scrollHeight) + 'px'
    }
  }, [content])

  const fetchSuggestion = useCallback(async (text: string) => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    if (text.trim().split(/\s+/).length < 4) {
      setSuggestion('')
      return
    }

    setIsFetchingSuggestion(true)
    try {
      const res = await fetch('/api/autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
        signal: abortRef.current.signal,
      })
      const data = await res.json()
      setSuggestion(data.suggestion || '')
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setSuggestion('')
    } finally {
      setIsFetchingSuggestion(false)
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

    if (!autocompleteEnabled) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestion(newContent), 700)
  }

  const acceptSuggestion = () => {
    if (!suggestion) return
    // Add a space before suggestion if content doesn't end with space/newline
    const separator = content && !content.match(/[\s\n]$/) ? ' ' : ''
    const newContent = content + separator + suggestion
    setContent(newContent)
    setSuggestion('')
    onUpdate(newContent)
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && suggestion) {
      e.preventDefault()
      acceptSuggestion()
    } else if (e.key === 'Escape' && suggestion) {
      setSuggestion('')
    }
  }

  const entryDate = entry.date
    ? format(parseISO(entry.date), 'EEEE, MMMM d, yyyy')
    : format(new Date(), 'EEEE, MMMM d, yyyy')

  const canAnalyze = wordCount >= 10 && !isAnalyzing

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
          {/* Autocomplete toggle */}
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
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
          <p className="text-xs text-indigo-600 font-medium mb-1">✨ Writing prompts:</p>
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
          placeholder="Start writing your diary in English... What happened today? How do you feel? What did you experience?"
          className="w-full resize-none outline-none text-slate-700 text-base leading-relaxed placeholder-slate-300 font-light"
          style={{ minHeight: '380px', fontFamily: 'inherit' }}
        />
      </div>

      {/* Autocomplete suggestion bar */}
      {autocompleteEnabled && (suggestion || isFetchingSuggestion) && (
        <div className="mx-4 mb-3 rounded-xl border border-violet-200 bg-violet-50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5">
            {isFetchingSuggestion && !suggestion ? (
              <>
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
                <span className="text-xs text-violet-400">Thinking...</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-sm text-violet-700 italic flex-1 leading-snug">
                  {suggestion}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <button
                    onClick={acceptSuggestion}
                    className="flex items-center gap-1 text-xs bg-violet-600 text-white px-2.5 py-1 rounded-lg hover:bg-violet-700 transition-colors font-medium"
                  >
                    <kbd className="font-sans">Tab</kbd>
                    <span>Accept</span>
                  </button>
                  <button
                    onClick={() => setSuggestion('')}
                    className="text-xs text-violet-400 hover:text-violet-600 px-1 transition-colors"
                    title="Dismiss (Esc)"
                  >
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
        <div className="text-xs text-slate-400">
          {wordCount < 10 ? (
            <span className="text-amber-500">Write at least {10 - wordCount} more words to analyze</span>
          ) : (
            <span className="text-emerald-500">Ready to analyze! 🎉</span>
          )}
        </div>
        <button
          onClick={onAnalyze}
          disabled={!canAnalyze}
          className={`
            flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition-all
            ${canAnalyze
              ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-md'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }
          `}
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
