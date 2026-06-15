'use client'

import { useState, useEffect } from 'react'

interface Props {
  onClose: () => void
}

export default function ProfileQuestions({ onClose }: Props) {
  const [questions, setQuestions] = useState<string[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/profile-questions')
      .then(r => r.json())
      .then(data => {
        setQuestions(data.questions || [])
        const loaded: string[] = data.answers || []
        setAnswers((data.questions || []).map((_: string, i: number) => loaded[i] || ''))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleChange = (i: number, value: string) => {
    setAnswers(prev => prev.map((a, idx) => (idx === i ? value : a)))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await fetch('/api/profile-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 flex flex-col"
        style={{ maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span>📝</span>
            <span>AI에게 나를 소개하기</span>
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-slate-500 mb-4">
          미리 답변해두면 AI 음성 대화에서 나에 대해 더 잘 이해하고 자연스럽게 대화할 수 있어요. (선택 사항)
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
              {questions.map((q, i) => (
                <div key={i}>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {i + 1}. {q}
                  </label>
                  <textarea
                    value={answers[i] || ''}
                    onChange={e => handleChange(i, e.target.value)}
                    rows={2}
                    maxLength={500}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                    placeholder="답변을 입력해주세요 (선택)"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-60"
              >
                {saving ? '저장 중...' : '저장하기'}
              </button>
              {saved && <span className="text-sm text-emerald-600 font-medium">저장됐어요!</span>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
