'use client'

import { useState, useEffect } from 'react'
import { subscribeToPush, unsubscribeFromPush, getPushPermissionState, isPushSupported } from '@/lib/pushClient'

interface Props {
  onClose: () => void
}

const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => {
  const hours = Math.floor(i / 4)
  const minutes = (i % 4) * 15
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
})

export default function ReminderSettings({ onClose }: Props) {
  const [enabled, setEnabled] = useState(false)
  const [time, setTime] = useState('21:00')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    setSupported(isPushSupported())
    fetch('/api/reminder')
      .then(r => r.json())
      .then(settings => {
        if (settings) {
          setEnabled(settings.enabled)
          setTime(settings.time)
        }
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
    setSaving(false)
  }

  const handleToggle = async () => {
    setError(null)
    const next = !enabled

    if (next) {
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
    } else {
      await unsubscribeFromPush()
    }

    setEnabled(next)
    await saveSettings(next, time)
  }

  const handleTimeChange = async (newTime: string) => {
    setTime(newTime)
    if (enabled) await saveSettings(true, newTime)
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
        ) : !supported ? (
          <p className="text-sm text-slate-500">이 브라우저는 푸시 알림을 지원하지 않아요.</p>
        ) : (
          <>
            <p className="text-sm text-slate-500 mb-4">
              매일 정해진 시간에 &quot;어제의 기억을 정리할 시간입니다!&quot; 알림을 보내드려요.
            </p>

            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-slate-700">알림 받기</span>
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

            <div className="flex items-center justify-between">
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

            {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
          </>
        )}
      </div>
    </div>
  )
}
