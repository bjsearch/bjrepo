'use client'

import { useState, useEffect } from 'react'

interface Props {
  onClose: () => void
  onEnabledChange?: (enabled: boolean) => void
}

const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => {
  const hours = Math.floor(i / 4)
  const minutes = (i % 4) * 15
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
})

const LEVELS = [
  { value: 'beginner', label: '입문', desc: 'MVP, ship, sync 같은 기본 단어', emoji: '🌱' },
  { value: 'intermediate', label: '중급', desc: 'leverage, bottleneck 같은 업무 단어', emoji: '🚀' },
  { value: 'advanced', label: '고급', desc: 'moat, arbitrage 같은 심화 표현', emoji: '🏆' },
]

const DEFAULT_TIMES = ['09:00']

export default function VocabSettings({ onClose, onEnabledChange }: Props) {
  const [enabled, setEnabled] = useState(false)
  const [times, setTimes] = useState<string[]>(DEFAULT_TIMES)
  const [level, setLevel] = useState('intermediate')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [kakaoConnected, setKakaoConnected] = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/vocab-settings')
      .then(r => r.json())
      .then(data => {
        if (data) {
          setEnabled(data.enabled)
          setTimes(Array.isArray(data.times) && data.times.length > 0 ? data.times : DEFAULT_TIMES)
          if (data.level) setLevel(data.level)
          setKakaoConnected(!!data.kakaoConnected)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const save = async (nextEnabled: boolean, nextTimes: string[], nextLevel: string) => {
    setSaving(true)
    await fetch('/api/vocab-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: nextEnabled, times: nextTimes, level: nextLevel }),
    })
    setEnabled(nextEnabled)
    onEnabledChange?.(nextEnabled)
    setSaving(false)
  }

  const handleToggle = () => save(!enabled, times, level)

  const handleTimeChange = (index: number, value: string) => {
    const next = times.map((t, i) => (i === index ? value : t))
    setTimes(next)
    save(enabled, next, level)
  }

  const handleAddTime = () => {
    if (times.length >= 5) return
    const next = [...times, '18:00']
    setTimes(next)
    save(enabled, next, level)
  }

  const handleRemoveTime = (index: number) => {
    if (times.length <= 1) return
    const next = times.filter((_, i) => i !== index)
    setTimes(next)
    save(enabled, next, level)
  }

  const handleLevelChange = (nextLevel: string) => {
    setLevel(nextLevel)
    save(enabled, times, nextLevel)
  }

  const handleSendTest = async () => {
    setTestSending(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/vocab-settings/test', { method: 'POST' })
      const data = await res.json()
      setTestResult({
        ok: res.ok,
        text: res.ok ? '카카오톡으로 오늘의 단어를 보냈어요!' : (data.error || '전송에 실패했어요'),
      })
    } catch {
      setTestResult({ ok: false, text: '전송에 실패했어요' })
    } finally {
      setTestSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span>📖</span>
            <span>실리콘밸리 영어 단어</span>
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500 mb-4">
              매일 정해진 시간에 실리콘밸리에서 자주 쓰는 영어 단어와 예문을 카카오톡으로 보내드려요.
            </p>

            {/* Master toggle */}
            <div className="flex items-center justify-between mb-5">
              <span className="text-sm font-medium text-slate-700">단어 받기</span>
              <button
                onClick={handleToggle}
                disabled={saving}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  enabled ? 'bg-indigo-500' : 'bg-slate-200'
                } ${saving ? 'opacity-60' : ''}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    enabled ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>

            {/* Difficulty */}
            <div className="mb-5">
              <p className="text-sm font-medium text-slate-700 mb-2">난이도</p>
              <div className="grid grid-cols-3 gap-2">
                {LEVELS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleLevelChange(opt.value)}
                    disabled={saving}
                    title={opt.desc}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-2.5 transition-colors ${
                      level === opt.value
                        ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xl leading-none">{opt.emoji}</span>
                    <span className="text-xs font-medium text-slate-700">{opt.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                {LEVELS.find(l => l.value === level)?.desc}
              </p>
            </div>

            {/* Send times */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-slate-700">
                  발송 시간 <span className="text-slate-400 font-normal">({times.length}회/일)</span>
                </p>
                {times.length < 5 && (
                  <button
                    onClick={handleAddTime}
                    disabled={saving}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-0.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    추가
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {times.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={t}
                      onChange={e => handleTimeChange(i, e.target.value)}
                      disabled={saving}
                      className="flex-1 text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    >
                      {TIME_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    {times.length > 1 && (
                      <button
                        onClick={() => handleRemoveTime(i)}
                        disabled={saving}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1.5">KST 기준 · 최대 5회/일</p>
            </div>

            {/* Kakao section */}
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">받는 방법</p>

              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-slate-700">카카오톡 (나에게 보내기)</div>
                {kakaoConnected ? (
                  <span className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
                    연결됨 ✓
                  </span>
                ) : (
                  <a
                    href="/api/auth/kakao/login"
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors"
                    style={{ backgroundColor: '#FEE500', borderColor: '#FEE500', color: '#3C1E1E' }}
                  >
                    카카오 연동
                  </a>
                )}
              </div>

              {kakaoConnected && (
                <div>
                  <button
                    onClick={handleSendTest}
                    disabled={testSending}
                    className="w-full text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60"
                  >
                    {testSending ? '보내는 중...' : '지금 단어 보내기 (테스트)'}
                  </button>
                  {testResult && (
                    <p className={`text-xs mt-1.5 ${testResult.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                      {testResult.text}
                    </p>
                  )}
                </div>
              )}

              {!kakaoConnected && (
                <p className="text-xs text-slate-400">
                  카카오 계정을 연동하면 설정한 시간에 카카오톡 나에게 보내기로 단어를 받을 수 있어요.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
