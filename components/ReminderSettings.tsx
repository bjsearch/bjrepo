'use client'

import { useState, useEffect } from 'react'
import { REMINDER_TONES, DEFAULT_REMINDER_TONE, ReminderTone } from '@/lib/reminderMessages'

interface Props {
  onClose: () => void
  initialMessage?: string | null
  onEnabledChange?: (enabled: boolean) => void
}

const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => {
  const hours = Math.floor(i / 4)
  const minutes = (i % 4) * 15
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
})

export default function ReminderSettings({ onClose, initialMessage, onEnabledChange }: Props) {
  const [enabled, setEnabled] = useState(false)
  const [time, setTime] = useState('21:00')
  const [tone, setTone] = useState<ReminderTone>(DEFAULT_REMINDER_TONE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(initialMessage ?? null)
  const [kakaoConnected, setKakaoConnected] = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/reminder').then(r => r.json())
      .then(settings => {
        if (settings) {
          setEnabled(settings.enabled)
          setTime(settings.time)
          if (settings.tone) setTone(settings.tone)
          setKakaoConnected(!!settings.kakaoConnected)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const saveSettings = async (nextEnabled: boolean, nextTime: string, nextTone: ReminderTone) => {
    setSaving(true)
    await fetch('/api/reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: nextEnabled, time: nextTime, tone: nextTone }),
    })
    setEnabled(nextEnabled)
    onEnabledChange?.(nextEnabled)
    setSaving(false)
  }

  const handleMasterToggle = async () => {
    await saveSettings(!enabled, time, tone)
  }

  const handleTimeChange = async (newTime: string) => {
    setTime(newTime)
    await saveSettings(enabled, newTime, tone)
  }

  const handleToneChange = async (newTone: ReminderTone) => {
    setTone(newTone)
    await saveSettings(enabled, time, newTone)
  }

  const handleKakaoDisconnect = async () => {
    setSaving(true)
    await fetch('/api/kakao/disconnect', { method: 'POST' })
    setKakaoConnected(false)
    setSaving(false)
  }

  const handleSendTest = async () => {
    setTestSending(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/reminder/test', { method: 'POST' })
      const data = await res.json()
      setTestResult({
        ok: res.ok,
        text: res.ok ? '카카오톡으로 알림을 보냈어요!' : (data.error || '전송에 실패했어요'),
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
        className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span>🔔</span>
            <span>일기 작성 알림</span>
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
            {message && (
              <div className="mb-4 text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg px-3 py-2">
                {message}
              </div>
            )}

            <p className="text-sm text-slate-500 mb-4">
              매일 정해진 시간에 선택한 스타일의 메시지로 일기 작성을 알려드려요.
            </p>

            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-slate-700">알림 받기</span>
              <button
                onClick={handleMasterToggle}
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

            <div className="flex items-center justify-between mb-5">
              <span className="text-sm font-medium text-slate-700">알림 시간</span>
              <select
                value={time}
                onChange={e => handleTimeChange(e.target.value)}
                disabled={saving}
                className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                {TIME_OPTIONS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="mb-5">
              <p className="text-sm font-medium text-slate-700 mb-2">독려 메시지 스타일</p>
              <div className="grid grid-cols-4 gap-2">
                {REMINDER_TONES.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleToneChange(opt.value)}
                    disabled={saving}
                    title={opt.description}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-2 transition-colors ${
                      tone === opt.value
                        ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-2xl leading-none" role="img" aria-label={opt.label}>
                      {opt.emoji}
                    </span>
                    <span className="text-[11px] text-slate-600 leading-tight text-center">
                      {opt.label.split(' ').map((word, i) => (
                        <span key={i} className="block whitespace-nowrap">{word}</span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">받는 방법</p>

              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-slate-700">카카오톡 (나에게 보내기)</div>
                {kakaoConnected ? (
                  <button
                    onClick={handleKakaoDisconnect}
                    disabled={saving}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200"
                  >
                    연결됨 · 해제
                  </button>
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
                    {testSending ? '보내는 중...' : '지금 알림 보내기'}
                  </button>
                  {testResult && (
                    <p className={`text-xs mt-1.5 ${testResult.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                      {testResult.text}
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
