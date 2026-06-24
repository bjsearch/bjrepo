'use client'

import { useEffect, useState } from 'react'
import { AuthUser, fetchMe, login, logout, signup } from '@/lib/authClient'
import { useI18n } from '@/lib/i18n'

type Mode = 'login' | 'signup'

export default function AuthGate({
  children,
}: {
  children: (user: AuthUser, onLogout: () => void) => React.ReactNode
}) {
  const { t } = useI18n()
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() => setUser(null))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = mode === 'login' ? await login(email, password) : await signup(email, password)
      setUser(result)
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.requestFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    await logout()
    setUser(null)
    setEmail('')
    setPassword('')
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
  }

  if (user === undefined) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-10 text-center text-sm text-slate-400">
        {t('auth.loading')}
      </div>
    )
  }

  if (!user) {
    return (
      <div className="max-w-sm mx-auto">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.35)] p-6 space-y-5">
          <div className="flex justify-center">
            <div className="inline-flex p-1 rounded-full bg-white/[0.04] border border-white/10">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition ${
                  mode === 'login'
                    ? 'bg-gradient-to-r from-lime-400 to-emerald-500 text-emerald-950 shadow-[0_0_16px_rgba(132,204,22,0.35)]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('auth.login')}
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition ${
                  mode === 'signup'
                    ? 'bg-gradient-to-r from-lime-400 to-emerald-500 text-emerald-950 shadow-[0_0_16px_rgba(132,204,22,0.35)]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('auth.signup')}
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">{t('auth.email')}</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-lime-400/40 focus:ring-1 focus:ring-lime-400/30"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">{t('auth.password')}</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-lime-400/40 focus:ring-1 focus:ring-lime-400/30"
                placeholder={t('auth.passwordPlaceholder')}
              />
            </div>

            {error && (
              <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-gradient-to-r from-lime-400 via-emerald-400 to-teal-400 text-emerald-950 font-bold py-3 shadow-[0_0_24px_rgba(132,204,22,0.3)] transition hover:shadow-[0_0_36px_rgba(132,204,22,0.45)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-[0_0_24px_rgba(132,204,22,0.3)]"
            >
              {busy ? t('auth.processing') : mode === 'login' ? t('auth.login') : t('auth.signup')}
            </button>
          </form>

          <p className="text-center text-xs text-slate-500">
            {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}
            <button
              type="button"
              onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              className="text-lime-300 font-semibold hover:underline"
            >
              {mode === 'login' ? t('auth.signup') : t('auth.login')}
            </button>
          </p>
        </div>
      </div>
    )
  }

  return <>{children(user, handleLogout)}</>
}
