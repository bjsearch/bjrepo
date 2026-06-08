import SwingAnalyzer from '@/components/SwingAnalyzer'

export default function Home() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <header className="mb-10 text-center space-y-3">
        <span className="inline-block text-xs font-semibold tracking-widest text-emerald-600 bg-emerald-50 rounded-full px-4 py-1.5 uppercase">
          AI Swing Coach
        </span>
        <h1 className="text-4xl font-extrabold bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
          ⛳ 골프 스윙 분석기
        </h1>
        <p className="text-slate-500 max-w-md mx-auto leading-relaxed">
          스윙 영상을 올리고 사용한 클럽을 선택하면, AI가 점수·분석·연습법·참고 선수를 알려드립니다.
        </p>
      </header>
      <SwingAnalyzer />
    </main>
  )
}
