'use client'

import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setContent(entry.content)
  }, [entry.id])

  useEffect(() => {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0
    setWordCount(words)
    setCharCount(content.length)
  }, [content])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.max(400, textareaRef.current.scrollHeight) + 'px'
    }
  }, [content])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    setContent(newContent)
    setIsSaved(false)
    onUpdate(newContent)
    setTimeout(() => setIsSaved(true), 500)
  }

  const today = format(new Date(), 'EEEE, MMMM d, yyyy')
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
          <h2 className="text-lg font-semibold text-slate-800 mt-0.5">{today}</h2>
        </div>
        <div className="flex items-center gap-3">
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
            {[
              'What happened today?',
              'How are you feeling?',
              'What did you learn?',
              'What are you grateful for?',
            ].map((prompt) => (
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
          placeholder="Start writing your diary in English... What happened today? How do you feel? What did you experience?"
          className="w-full resize-none outline-none text-slate-700 text-base leading-relaxed placeholder-slate-300 font-light"
          style={{ minHeight: '400px', fontFamily: 'inherit' }}
        />
      </div>

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
