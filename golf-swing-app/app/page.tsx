import SwingAnalyzer from '@/components/SwingAnalyzer'

export default function Home() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-emerald-700">⛳ 골프 스윙 분석기</h1>
        <p className="text-gray-500 mt-2">
          스윙 영상을 올리고 사용한 클럽을 선택하면, AI가 점수·분석·연습법·참고 선수를 알려드립니다.
        </p>
      </header>
      <SwingAnalyzer />
    </main>
  )
}
