'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  onClose: () => void
}

type Status = 'idle' | 'listening' | 'thinking' | 'speaking'

export default function VoiceChat({ onClose }: Props) {
  const [started, setStarted] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [micSupported, setMicSupported] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition
    setMicSupported(true)
  }, [])

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [])

  const speak = (text: string) =>
    new Promise<void>(resolve => {
      if (!('speechSynthesis' in window)) {
        resolve()
        return
      }
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'en-US'
      utterance.onend = () => resolve()
      utterance.onerror = () => resolve()
      setStatus('speaking')
      window.speechSynthesis.speak(utterance)
    })

  const sendToAI = async (history: Message[]) => {
    setStatus('thinking')
    setError(null)
    try {
      const res = await fetch('/api/voice-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '대화를 시작할 수 없어요')
        setStatus('idle')
        return
      }
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      await speak(data.reply)
      setStatus('idle')
    } catch {
      setError('대화 중 오류가 발생했어요')
      setStatus('idle')
    }
  }

  const handleStart = () => {
    setStarted(true)
    sendToAI([])
  }

  const submitUserMessage = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const next = [...messages, { role: 'user' as const, content: trimmed }]
    setMessages(next)
    setInput('')
    sendToAI(next)
  }

  const handleMicClick = () => {
    const recognition = recognitionRef.current
    if (!recognition) return

    if (status === 'listening') {
      recognition.stop()
      setStatus('idle')
      return
    }
    if (status !== 'idle') return

    window.speechSynthesis.cancel()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript
      submitUserMessage(transcript)
    }
    recognition.onerror = () => setStatus('idle')
    recognition.onend = () => setStatus(prev => (prev === 'listening' ? 'idle' : prev))
    setStatus('listening')
    recognition.start()
  }

  const handleClose = () => {
    recognitionRef.current?.stop()
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    onClose()
  }

  const statusText: Record<Status, string> = {
    idle: micSupported ? '마이크를 누르거나 메시지를 입력해보세요' : '메시지를 입력해보세요',
    listening: '듣고 있어요...',
    thinking: '생각하는 중...',
    speaking: '말하는 중...',
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={handleClose}>
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 flex flex-col"
        style={{ maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span>🎙️</span>
            <span>AI와 대화하기</span>
          </h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!started ? (
          <div className="flex flex-col items-center text-center py-6">
            <div className="text-4xl mb-3">🎙️</div>
            <p className="text-sm text-slate-600 mb-1 font-medium">내 일기를 읽은 AI와 영어로 대화해보세요</p>
            <p className="text-xs text-slate-400 mb-5">지금까지 쓴 일기를 바탕으로 나에 대해 이야기해줘요</p>
            <button
              onClick={handleStart}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
            >
              대화 시작하기
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1" style={{ minHeight: '200px' }}>
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                      m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {status === 'thinking' && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 text-slate-400 rounded-2xl px-3.5 py-2 text-sm">...</div>
                </div>
              )}
            </div>

            {error && (
              <div className="mb-3 text-xs bg-red-50 text-red-600 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <p className="text-xs text-slate-400 mb-2 text-center">{statusText[status]}</p>

            <div className="flex items-center gap-2">
              {micSupported && (
                <button
                  onClick={handleMicClick}
                  disabled={status === 'thinking' || status === 'speaking'}
                  className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 ${
                    status === 'listening'
                      ? 'bg-red-500 text-white animate-pulse'
                      : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                  }`}
                  title="마이크"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11a7 7 0 01-14 0m7 7v3m-4 0h8M12 1a3 3 0 00-3 3v6a3 3 0 006 0V4a3 3 0 00-3-3z"
                    />
                  </svg>
                </button>
              )}
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') submitUserMessage(input)
                }}
                disabled={status !== 'idle'}
                placeholder="메시지를 입력하세요..."
                className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-60"
              />
              <button
                onClick={() => submitUserMessage(input)}
                disabled={status !== 'idle' || !input.trim()}
                className="flex-shrink-0 px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                전송
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
