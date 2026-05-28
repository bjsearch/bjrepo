'use client'

import { useState } from 'react'
import { SessionUser } from '@/lib/auth'

interface Props {
  onLogin: (user: SessionUser) => void
}

export default function LoginPage({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '오류가 발생했어요')
      } else {
        onLogin(data.user)
      }
    } catch {
      setError('네트워크 오류가 발생했어요')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-3xl">✍️</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">English Writing App</h1>
          <p className="text-slate-400 text-sm mt-1">AI-powered diary & writing coach</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          {/* Mode toggle */}
          <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
            <button
              onClick={() => { setMode('login'); setError('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === 'login' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              로그인
            </button>
            <button
              onClick={() => { setMode('register'); setError('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === 'register' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              회원가입
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">아이디</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="아이디 입력"
                autoComplete="username"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="비밀번호 입력"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent transition-all"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
            </button>
          </form>

          {mode === 'login' && (
            <p className="text-xs text-slate-400 text-center mt-4">
              기본 관리자: <span className="font-mono font-medium text-slate-500">admin / admin123</span>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
