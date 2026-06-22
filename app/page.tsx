'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import DiaryEditor from '@/components/DiaryEditor'
import WritingAnalysis from '@/components/WritingAnalysis'
import VideoRecommendations from '@/components/VideoRecommendations'
import DiaryCalendar from '@/components/DiaryCalendar'
import Dictionary from '@/components/Dictionary'
import LoginPage from '@/components/LoginPage'
import AdminView from '@/components/AdminView'
import ReminderSettings from '@/components/ReminderSettings'
import VoiceChat from '@/components/VoiceChat'
import ProfileQuestions from '@/components/ProfileQuestions'
import { DiaryEntry, AnalysisResult, YouTubeVideo } from '@/lib/types'
import { SessionUser } from '@/lib/auth'

function createEntryForDate(date: Date): DiaryEntry {
  const now = new Date().toISOString()
  return {
    id: Date.now().toString(),
    date: format(date, 'yyyy-MM-dd'),
    content: '',
    createdAt: now,
    updatedAt: now,
  }
}

async function fetchEntries(): Promise<DiaryEntry[]> {
  try {
    const res = await fetch('/api/entries')
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

async function saveEntry(entry: DiaryEntry) {
  await fetch('/api/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  })
}

async function removeEntry(id: string) {
  await fetch('/api/entries', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
}

type View = 'editor' | 'calendar'

export default function Home() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showReminder, setShowReminder] = useState(false)
  const [showVoiceChat, setShowVoiceChat] = useState(false)
  const [showProfileQuestions, setShowProfileQuestions] = useState(false)
  const [reminderMessage, setReminderMessage] = useState<string | null>(null)
  const [reminderEnabled, setReminderEnabled] = useState(false)

  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [currentEntry, setCurrentEntry] = useState<DiaryEntry>(createEntryForDate(new Date()))
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [videos, setVideos] = useState<YouTubeVideo[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isLoadingVideos, setIsLoadingVideos] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [view, setView] = useState<View>('editor')
  const [isLoadingEntries, setIsLoadingEntries] = useState(false)
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<string[]>([])
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Auth check on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setUser(data)
        setAuthLoading(false)
      })
      .catch(() => setAuthLoading(false))
  }, [])

  // Handle Kakao OAuth redirect result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const kakao = params.get('kakao')
    if (!kakao) return
    setReminderMessage(
      kakao === 'connected'
        ? '카카오톡 계정이 연동되었어요!'
        : '카카오톡 연동에 실패했어요. 다시 시도해주세요.'
    )
    setShowReminder(true)
    params.delete('kakao')
    const newSearch = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (newSearch ? `?${newSearch}` : ''))
  }, [])

  // Load reminder settings when user is set
  useEffect(() => {
    if (!user) return
    fetch('/api/reminder')
      .then(r => r.ok ? r.json() : null)
      .then(settings => setReminderEnabled(!!settings?.enabled))
      .catch(() => {})
  }, [user])

  // Load entries when user is set
  useEffect(() => {
    if (!user) return
    setIsLoadingEntries(true)
    fetchEntries().then((loaded) => {
      setEntries(loaded)
      const today = format(new Date(), 'yyyy-MM-dd')
      const todayEntry = loaded.find((e) => e.date === today)
      if (todayEntry) {
        setCurrentEntry(todayEntry)
        if (todayEntry.analysis) setAnalysis(todayEntry.analysis)
      }
      setIsLoadingEntries(false)
    })
  }, [user])

  const updateEntry = useCallback(
    (content: string) => {
      const updated: DiaryEntry = { ...currentEntry, content, updatedAt: new Date().toISOString() }
      setCurrentEntry(updated)
      setEntries((prev) => {
        const exists = prev.find((e) => e.id === updated.id)
        return exists ? prev.map((e) => (e.id === updated.id ? updated : e)) : [...prev, updated]
      })

      // Debounced DB save (1.5s after last keystroke)
      clearTimeout(saveDebounceRef.current)
      saveDebounceRef.current = setTimeout(() => saveEntry(updated), 1500)
    },
    [currentEntry]
  )

  const handleAnalyze = async () => {
    if (!currentEntry.content.trim() || isAnalyzing) return
    setIsAnalyzing(true)
    setAnalysisError(null)
    setAnalysis(null)
    setVideos([])

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: currentEntry.content, acceptedSuggestions }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')

      setAnalysis(data)
      const updatedEntry: DiaryEntry = { ...currentEntry, analysis: data, updatedAt: new Date().toISOString() }
      setCurrentEntry(updatedEntry)
      setEntries((prev) => {
        const next = prev.map((e) => (e.id === updatedEntry.id ? updatedEntry : e))
        const exists = next.find((e) => e.id === updatedEntry.id)
        return exists ? next : [...next, updatedEntry]
      })
      // Save analysis to DB immediately
      await saveEntry(updatedEntry)

      if (data.topics?.length > 0) {
        setIsLoadingVideos(true)
        try {
          const vRes = await fetch('/api/videos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topics: data.topics }),
          })
          const vData = await vRes.json()
          setVideos(vData.videos || [])
        } catch { /* videos optional */ } finally {
          setIsLoadingVideos(false)
        }
      }
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleSelectEntry = (entry: DiaryEntry) => {
    setCurrentEntry(entry)
    setAnalysis(entry.analysis || null)
    setVideos([])
    setAnalysisError(null)
    setView('editor')
  }

  const handleSelectDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const existing = entries.find((e) => e.date === dateStr)
    if (existing) {
      handleSelectEntry(existing)
    } else {
      const newEntry = createEntryForDate(date)
      setCurrentEntry(newEntry)
      setAnalysis(null)
      setVideos([])
      setAnalysisError(null)
      setView('editor')
    }
  }

  const handleDeleteEntry = async (entry: DiaryEntry) => {
    if (!window.confirm(`"${entry.date}" 일기를 삭제할까요? 복구할 수 없어요.`)) return
    clearTimeout(saveDebounceRef.current)
    setEntries((prev) => prev.filter((e) => e.id !== entry.id))
    await removeEntry(entry.id)
    if (currentEntry.id === entry.id) {
      const today = format(new Date(), 'yyyy-MM-dd')
      const remaining = entries.filter((e) => e.id !== entry.id)
      const todayEntry = remaining.find((e) => e.date === today)
      if (todayEntry) {
        setCurrentEntry(todayEntry)
        setAnalysis(todayEntry.analysis || null)
      } else {
        setCurrentEntry(createEntryForDate(new Date()))
        setAnalysis(null)
      }
      setVideos([])
      setAnalysisError(null)
    }
  }

  const handleTodayEntry = () => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const existing = entries.find((e) => e.date === today)
    if (existing) {
      handleSelectEntry(existing)
    } else {
      setCurrentEntry(createEntryForDate(new Date()))
      setAnalysis(null)
      setVideos([])
      setAnalysisError(null)
    }
    setView('editor')
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    setEntries([])
    setCurrentEntry(createEntryForDate(new Date()))
    setAnalysis(null)
    setVideos([])
  }

  const showVideos = analysis && (videos.length > 0 || isLoadingVideos)
  const streak = calcStreak(entries)
  const writtenCount = entries.filter(e => e.content.trim()).length
  const VOICE_CHAT_MIN_ENTRIES = 20

  // Auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    )
  }

  // Not logged in
  if (!user) return <LoginPage onLogin={setUser} />

  const voiceChatUnlocked = writtenCount >= VOICE_CHAT_MIN_ENTRIES || user.role === 'admin'

  // Admin view
  if (showAdmin) return <AdminView onClose={() => setShowAdmin(false)} />

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-white text-base sm:text-lg">✍️</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold text-slate-800">English Writing App</h1>
              <p className="text-xs text-slate-400">AI-powered diary & writing coach</p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {streak > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5">
                <span className="text-sm">🔥</span>
                <span className="text-xs font-semibold text-amber-700">{streak} day streak</span>
              </div>
            )}

            <div className="flex bg-slate-100 rounded-xl p-0.5 sm:p-1">
              <button
                onClick={() => setView('editor')}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  view === 'editor' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span className="hidden sm:inline">Write</span>
              </button>
              <button
                onClick={() => setView('calendar')}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  view === 'calendar' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="hidden sm:inline">Calendar</span>
                {entries.length > 0 && (
                  <span className="bg-indigo-100 text-indigo-600 rounded-full px-1.5 py-0.5 text-xs leading-none">
                    {entries.filter(e => e.content.trim()).length}
                  </span>
                )}
              </button>
            </div>

            {/* User info + logout */}
            <div className="flex items-center gap-1 sm:gap-1.5 pl-1.5 sm:pl-2 border-l border-slate-200">
              {voiceChatUnlocked ? (
                <>
                  <button
                    onClick={() => setShowVoiceChat(true)}
                    className="p-1.5 rounded-lg text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    title="AI와 대화하기"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m7 7v3m-4 0h8M12 1a3 3 0 00-3 3v6a3 3 0 006 0V4a3 3 0 00-3-3z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setShowProfileQuestions(true)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    title="AI에게 나를 소개하기"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </>
              ) : (
                <div
                  className="hidden sm:flex items-center gap-1 text-xs text-slate-400 px-2 py-1.5"
                  title={`일기를 ${VOICE_CHAT_MIN_ENTRIES - writtenCount}개 더 쓰면 AI와 대화할 수 있어요`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m7 7v3m-4 0h8M12 1a3 3 0 00-3 3v6a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  </svg>
                  <span>{writtenCount}/{VOICE_CHAT_MIN_ENTRIES}</span>
                </div>
              )}
              <button
                onClick={() => setShowReminder(true)}
                className={`p-1.5 rounded-lg transition-colors ${
                  reminderEnabled
                    ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                }`}
                title="알림 설정"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>
              {user.role === 'admin' && (
                <button
                  onClick={() => setShowAdmin(true)}
                  className="flex items-center gap-1 text-xs bg-rose-50 text-rose-600 border border-rose-200 px-1.5 sm:px-2.5 py-1.5 rounded-lg hover:bg-rose-100 transition-colors font-medium"
                >
                  🛡️ <span className="hidden sm:inline">Admin</span>
                </button>
              )}
              <div className="flex items-center text-xs text-slate-500 px-1 sm:px-2 py-1.5">
                <div className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <span className="hidden sm:inline font-medium ml-1.5">{user.username}</span>
              </div>
              <button
                onClick={handleLogout}
                className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                title="로그아웃"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Loading state */}
        {isLoadingEntries && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin" />
              <p className="text-sm text-slate-400">일기를 불러오는 중...</p>
            </div>
          </div>
        )}

        {!isLoadingEntries && (
          <>
            {/* Calendar View */}
            {view === 'calendar' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
                <div className="lg:col-span-1">
                  <DiaryCalendar entries={entries} currentEntry={currentEntry} onSelectDate={handleSelectDate} />
                </div>
                <div className="lg:col-span-2 space-y-4">
                  <CalendarStats entries={entries} />
                  <RecentEntries entries={entries} onSelect={handleSelectEntry} onToday={handleTodayEntry} onDelete={handleDeleteEntry} />
                </div>
              </div>
            )}

            {/* Editor View */}
            {view === 'editor' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <DiaryEditor
                    entry={currentEntry}
                    onUpdate={updateEntry}
                    onAnalyze={handleAnalyze}
                    onDelete={entries.some(e => e.id === currentEntry.id) ? () => handleDeleteEntry(currentEntry) : undefined}
                    isAnalyzing={isAnalyzing}
                    onAcceptedSuggestionsChange={setAcceptedSuggestions}
                  />
                  {showVideos && (
                    <VideoRecommendations videos={videos} isLoading={isLoadingVideos} topics={analysis?.topics || []} />
                  )}
                  {analysis && !showVideos && analysis.topics.length > 0 && (
                    <VideoRecommendations videos={[]} isLoading={false} topics={analysis.topics} />
                  )}
                </div>
                <div className="space-y-4">
                  <WritingAnalysis analysis={analysis} isLoading={isAnalyzing} error={analysisError} date={currentEntry.date} />
                  <Dictionary />
                </div>
              </div>
            )}

            {/* Tips Banner */}
            {view === 'editor' && !analysis && !isAnalyzing && (
              <div className="mt-4 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-indigo-700 mb-3">💡 Tips for Better English Writing</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { icon: '📝', tip: 'Write every day, even just 50 words' },
                    { icon: '🎯', tip: 'Use new vocabulary you learned recently' },
                    { icon: '💭', tip: 'Write about your feelings and emotions' },
                    { icon: '🔄', tip: 'Review your corrections and improve' },
                  ].map((item) => (
                    <div key={item.tip} className="flex items-start gap-2">
                      <span className="text-lg flex-shrink-0">{item.icon}</span>
                      <p className="text-xs text-indigo-600 leading-relaxed">{item.tip}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {showReminder && (
        <ReminderSettings
          onClose={() => { setShowReminder(false); setReminderMessage(null) }}
          initialMessage={reminderMessage}
          onEnabledChange={setReminderEnabled}
        />
      )}

      {showVoiceChat && <VoiceChat onClose={() => setShowVoiceChat(false)} />}

      {showProfileQuestions && <ProfileQuestions onClose={() => setShowProfileQuestions(false)} />}
    </div>
  )
}

function calcStreak(entries: DiaryEntry[]): number {
  const written = entries
    .filter(e => e.content.trim())
    .map(e => e.date)
    .sort()
    .reverse()

  if (written.length === 0) return 0

  let streak = 0
  let check = format(new Date(), 'yyyy-MM-dd')

  for (const date of written) {
    if (date === check) {
      streak++
      const d = parseISO(check)
      d.setDate(d.getDate() - 1)
      check = format(d, 'yyyy-MM-dd')
    } else if (date < check) {
      break
    }
  }
  return streak
}

function CalendarStats({ entries }: { entries: DiaryEntry[] }) {
  const written = entries.filter(e => e.content.trim()).length
  const analyzed = entries.filter(e => e.analysis).length
  const scores = entries.filter(e => e.analysis).map(e => e.analysis!.score)
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null

  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: 'Days Written', value: written, icon: '✍️', color: 'bg-indigo-50 border-indigo-100', textColor: 'text-indigo-700' },
        { label: 'Analyzed', value: analyzed, icon: '🧠', color: 'bg-violet-50 border-violet-100', textColor: 'text-violet-700' },
        { label: 'Avg Score', value: avgScore !== null ? `${avgScore}` : '—', icon: '📊', color: 'bg-emerald-50 border-emerald-100', textColor: 'text-emerald-700' },
      ].map(({ label, value, icon, color, textColor }) => (
        <div key={label} className={`${color} border rounded-2xl p-4 text-center`}>
          <div className="text-2xl mb-1">{icon}</div>
          <div className={`text-2xl font-bold ${textColor}`}>{value}</div>
          <div className="text-xs text-slate-500 mt-0.5">{label}</div>
        </div>
      ))}
    </div>
  )
}

function RecentEntries({ entries, onSelect, onToday, onDelete }: {
  entries: DiaryEntry[]
  onSelect: (e: DiaryEntry) => void
  onToday: () => void
  onDelete: (e: DiaryEntry) => void
}) {
  const sorted = [...entries]
    .filter(e => e.content.trim())
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-slate-700">Recent Entries</h3>
        <button
          onClick={onToday}
          className="flex items-center gap-1.5 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Today's Entry
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <div className="text-4xl mb-3">📖</div>
          <p className="text-slate-500 font-medium">No entries yet</p>
          <p className="text-slate-400 text-sm mt-1">Click a date on the calendar or write today's entry</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {sorted.map(entry => {
            const wordCount = entry.content.trim().split(/\s+/).length
            return (
              <div key={entry.id} className="flex items-center group hover:bg-slate-50 transition-colors">
                <button
                  onClick={() => onSelect(entry)}
                  className="flex-1 text-left px-5 py-3.5 min-w-0"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-slate-700">
                      {format(parseISO(entry.date), 'EEE, MMM d, yyyy')}
                    </span>
                    <div className="flex items-center gap-2">
                      {entry.analysis && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          entry.analysis.score >= 80 ? 'bg-emerald-100 text-emerald-700' :
                          entry.analysis.score >= 60 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {entry.analysis.score}pts
                        </span>
                      )}
                      <span className="text-xs text-slate-400">{wordCount}w</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 truncate">{entry.content.slice(0, 100)}</p>
                </button>
                <button
                  onClick={() => onDelete(entry)}
                  title="Delete entry"
                  className="flex-shrink-0 mr-3 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
