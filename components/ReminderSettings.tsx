'use client'

import { useState, useEffect } from 'react'
import {
  subscribeToPush,
  unsubscribeFromPush,
  getPushPermissionState,
  isPushSupported,
  hasPushSubscription,
} from '@/lib/pushClient'

interface Props {
  onClose: () => void
  initialMessage?: string | null
}

const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => {
  const hours = Math.floor(i / 4)
  const minutes = (i % 4) * 15
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
})

export default function ReminderSettings({ onClose, initialMessage }: Props) {
  const [enabled, setEnabled] = useState(false)
  const [time, setTime] = useState('21:00')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(initialMessage ?? null)
  const [pushSupportedState, setPushSupportedState] = useState(true)
  const [pushConnected, setPushConnected] = useState(false)
  const [kakaoConnected, setKakaoConnected] = useState(false)

  useEffect(() => {
    setPushSupportedState(isPushSupported())
    Promise.all([
      fetch('/api/reminder').then(r => r.json()),
      hasPushSubscription(),
    ])
      .then(([settings, pushSub]) => {
        if (settings) {
          setEnabled(settings.enabled)
          setTime(settings.time)
          setKakaoConnected(!!settings.kakaoConnected)
        }
        setPushConnected(pushSub)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const saveSettings = async (nextEnabled: boolean, nextTime: string) => {
    setSaving(true)
    await fetch('/api/reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: nextEnabled, time: nextTime }),
    })
    setEnabled(nextEnabled)
    setSaving(false)
  }

  const handleMasterToggle = async () => {
    await saveSettings(!enabled, time)
  }

  const handleTimeChange = async (newTime: string) => {
    setTime(newTime)
    await saveSettings(enabled, newTime)
  }

  const handlePushToggle = async () => {
    setError(null)
    if (pushConnected) {
      await unsubscribeFromPush()
      setPushConnected(false)
      return
    }

    const perm = await getPushPermissionState()
    if (perm === 'unsupported') {
      setError('이 브라우저는 알림을 지원하지 않아요')
      return
    }
    const ok = await subscribeToPush()
    if (!ok) {
      setError('알림 권한을 허용해주셔야 알려드릴 수 있어요')
      return
    }
    setPushConnected(true)
    if (!enabled) await saveSettings(true, time)
  }

  const handleKakaoDisconnect = async () => {
    setSaving(true)
    await fetch('/api/kakao/disconnect', { method: 'POST' })
    setKakaoConnected(false)
    setSaving(false)
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
              매일 정해진 시간에 &quot;어제의 기억을 정리할 시간입니다!&quot; 알림을 보내드려요.
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

            <div className="border-t border-slate-100 pt-4 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">받는 방법</p>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-700">브라우저 푸시</div>
                  {!pushSupportedState && (
                    <div className="text-xs text-slate-400">이 브라우저는 지원하지 않아요</div>
                  )}
                </div>
                {pushSupportedState && (
                  <button
                    onClick={handlePushToggle}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                      pushConnected
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                        : 'bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100'
                    }`}
                  >
                    {pushConnected ? '연결됨 ✓' : '연결하기'}
                  </button>
                )}
              </div>

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
            </div>

            {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
          </>
        )}
      </div>
    </div>
  )
}
