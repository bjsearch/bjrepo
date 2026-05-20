'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import DiaryEditor from '@/components/DiaryEditor'
import WritingAnalysis from '@/components/WritingAnalysis'
import VideoRecommendations from '@/components/VideoRecommendations'
import DiaryHistory from '@/components/DiaryHistory'
import { DiaryEntry, AnalysisResult, YouTubeVideo } from '@/lib/types'

const STORAGE_KEY = 'english-diary-entries'

function createNewEntry(): DiaryEntry {
  const now = new Date().toISOString()
  return {
    id: Date.now().toString(),
    date: format(new Date(), 'yyyy-MM-dd'),
    content: '',
    createdAt: now,
    updatedAt: now,
  }
}

function loadEntries(): DiaryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveEntries(entries: DiaryEntry[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

export default function Home() {
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [currentEntry, setCurrentEntry] = useState<DiaryEntry>(createNewEntry())
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [videos, setVideos] = useState<YouTubeVideo[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isLoadingVideos, setIsLoadingVideos] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    const loaded = loadEntries()
    setEntries(loaded)
    // Load today's entry if exists
    const today = format(new Date(), 'yyyy-MM-dd')
    const todayEntry = loaded.find((e) => e.date === today)
    if (todayEntry) {
      setCurrentEntry(todayEntry)
      if (todayEntry.analysis) {
        setAnalysis(todayEntry.analysis)
      }
    }
  }, [])

  const updateEntry = useCallback(
    (content: string) => {
      const updated: DiaryEntry = {
        ...currentEntry,
        content,
        updatedAt: new Date().toISOString(),
      }
      setCurrentEntry(updated)

      setEntries((prev) => {
        const exists = prev.find((e) => e.id === updated.id)
        const newEntries = exists
          ? prev.map((e) => (e.id === updated.id ? updated : e))
          : [...prev, updated]
        saveEntries(newEntries)
        return newEntries
      })
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
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: currentEntry.content }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Analysis failed')
      }

      setAnalysis(data)

      // Save analysis to entry
      const updatedEntry: DiaryEntry = {
        ...currentEntry,
        analysis: data,
        updatedAt: new Date().toISOString(),
      }
      setCurrentEntry(updatedEntry)
      setEntries((prev) => {
        const newEntries = prev.map((e) => (e.id === updatedEntry.id ? updatedEntry : e))
        const exists = newEntries.find((e) => e.id === updatedEntry.id)
        const finalEntries = exists ? newEntries : [...newEntries, updatedEntry]
        saveEntries(finalEntries)
        return finalEntries
      })

      // Fetch videos
      if (data.topics && data.topics.length > 0) {
        setIsLoadingVideos(true)
        try {
          const videoResponse = await fetch('/api/videos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topics: data.topics }),
          })
          const videoData = await videoResponse.json()
          setVideos(videoData.videos || [])
        } catch {
          // Videos are optional, don't show error
        } finally {
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
    setShowHistory(false)
  }

  const handleNewEntry = () => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const existingToday = entries.find((e) => e.date === today)
    if (existingToday) {
      handleSelectEntry(existingToday)
    } else {
      const newEntry = createNewEntry()
      setCurrentEntry(newEntry)
      setAnalysis(null)
      setVideos([])
      setAnalysisError(null)
    }
    setShowHistory(false)
  }

  const showVideos = analysis && (videos.length > 0 || isLoadingVideos)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-lg">✍️</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">English Writing App</h1>
              <p className="text-xs text-slate-400">AI-powered diary & writing coach</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                showHistory
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              History ({entries.length})
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* History Panel */}
        {showHistory && (
          <div className="mb-6 animate-fadeIn">
            <DiaryHistory
              entries={entries}
              currentId={currentEntry.id}
              onSelect={handleSelectEntry}
              onNew={handleNewEntry}
            />
          </div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Diary Editor */}
          <div className="space-y-6">
            <DiaryEditor
              entry={currentEntry}
              onUpdate={updateEntry}
              onAnalyze={handleAnalyze}
              isAnalyzing={isAnalyzing}
            />

            {/* History inline for mobile */}
            {!showHistory && entries.length > 0 && (
              <div className="lg:hidden">
                <DiaryHistory
                  entries={entries}
                  currentId={currentEntry.id}
                  onSelect={handleSelectEntry}
                  onNew={handleNewEntry}
                />
              </div>
            )}
          </div>

          {/* Right: Analysis + Videos */}
          <div className="space-y-6">
            <WritingAnalysis
              analysis={analysis}
              isLoading={isAnalyzing}
              error={analysisError}
            />

            {showVideos && (
              <VideoRecommendations
                videos={videos}
                isLoading={isLoadingVideos}
                topics={analysis?.topics || []}
              />
            )}

            {/* Topics quick search (always show after analysis) */}
            {analysis && !showVideos && analysis.topics.length > 0 && (
              <VideoRecommendations
                videos={[]}
                isLoading={false}
                topics={analysis.topics}
              />
            )}
          </div>
        </div>

        {/* Tips Banner */}
        {!analysis && !isAnalyzing && (
          <div className="mt-6 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-5">
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
      </main>
    </div>
  )
}
