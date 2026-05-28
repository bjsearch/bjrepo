'use client'

import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { User, DiaryEntry } from '@/lib/types'

interface Props {
  onClose: () => void
}

export default function AdminView({ onClose }: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<DiaryEntry | null>(null)

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(data => { setUsers(data); setLoadingUsers(false) })
      .catch(() => setLoadingUsers(false))
  }, [])

  const loadUserEntries = async (user: User) => {
    setSelectedUser(user)
    setSelectedEntry(null)
    setLoadingEntries(true)
    const res = await fetch(`/api/admin/users?userId=${user.id}`)
    const data = await res.json()
    setEntries(data)
    setLoadingEntries(false)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-rose-500 to-orange-500 rounded-xl flex items-center justify-center">
              <span className="text-white text-lg">🛡️</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Admin Dashboard</h1>
              <p className="text-xs text-slate-400">등록된 사용자 및 데이터 관리</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            앱으로 돌아가기
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* User List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-700 flex items-center gap-2">
                  <span>👥</span>
                  <span>사용자 목록</span>
                  <span className="ml-auto text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    {users.length}명
                  </span>
                </h2>
              </div>
              {loadingUsers ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : users.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">사용자가 없어요</div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {users.map(user => (
                    <button
                      key={user.id}
                      onClick={() => loadUserEntries(user)}
                      className={`w-full text-left px-5 py-3.5 transition-colors hover:bg-slate-50 ${
                        selectedUser?.id === user.id ? 'bg-indigo-50 border-l-2 border-indigo-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                            user.role === 'admin'
                              ? 'bg-rose-100 text-rose-600'
                              : 'bg-indigo-100 text-indigo-600'
                          }`}>
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-slate-700">{user.username}</span>
                              {user.role === 'admin' && (
                                <span className="text-xs bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full font-medium">admin</span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">
                              {format(parseISO(user.createdAt), 'yyyy.MM.dd 가입')}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-indigo-600">{user.entryCount ?? 0}</div>
                          <div className="text-xs text-slate-400">entries</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Summary stats */}
            {users.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                  <div className="text-2xl font-bold text-indigo-600">{users.length}</div>
                  <div className="text-xs text-slate-400 mt-0.5">총 사용자</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                  <div className="text-2xl font-bold text-emerald-600">
                    {users.reduce((acc, u) => acc + (u.entryCount ?? 0), 0)}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">총 일기 수</div>
                </div>
              </div>
            )}
          </div>

          {/* User's Entries */}
          <div className="lg:col-span-2">
            {!selectedUser ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="text-4xl mb-3">👆</div>
                  <p className="text-slate-500">사용자를 선택하면 일기 목록이 표시돼요</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Entry list */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="font-semibold text-slate-700 flex items-center gap-2">
                      <span>📖</span>
                      <span>{selectedUser.username}의 일기</span>
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                        {entries.filter(e => e.content.trim()).length}개
                      </span>
                    </h2>
                  </div>
                  {loadingEntries ? (
                    <div className="flex items-center justify-center py-10">
                      <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : entries.filter(e => e.content.trim()).length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-400">작성된 일기가 없어요</div>
                  ) : (
                    <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
                      {entries.filter(e => e.content.trim()).map(entry => (
                        <button
                          key={entry.id}
                          onClick={() => setSelectedEntry(selectedEntry?.id === entry.id ? null : entry)}
                          className={`w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors ${
                            selectedEntry?.id === entry.id ? 'bg-indigo-50' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-semibold text-slate-700">
                              {format(parseISO(entry.date), 'yyyy년 MM월 dd일 (EEE)')}
                            </span>
                            <div className="flex items-center gap-2">
                              {entry.analysis && (
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                  entry.analysis.score >= 80 ? 'bg-emerald-100 text-emerald-700' :
                                  entry.analysis.score >= 60 ? 'bg-amber-100 text-amber-700' :
                                  'bg-red-100 text-red-700'
                                }`}>
                                  {entry.analysis.score}점
                                </span>
                              )}
                              <span className="text-xs text-slate-400">
                                {entry.content.trim().split(/\s+/).length}단어
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-slate-400 truncate">{entry.content.slice(0, 120)}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected entry detail */}
                {selectedEntry && (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                      <h3 className="font-semibold text-slate-700">
                        {format(parseISO(selectedEntry.date), 'yyyy년 MM월 dd일')}
                      </h3>
                      <button onClick={() => setSelectedEntry(null)} className="text-slate-400 hover:text-slate-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="p-5">
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {selectedEntry.content}
                      </p>
                      {selectedEntry.analysis && (
                        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
                          <span className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full font-medium">
                            점수: {selectedEntry.analysis.score}점
                          </span>
                          <span className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-medium">
                            {selectedEntry.analysis.level}
                          </span>
                          {selectedEntry.analysis.topics.map((t, i) => (
                            <span key={i} className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
