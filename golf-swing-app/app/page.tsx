import AppShell from '@/components/AppShell'

export default function Home() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <header className="mb-10 text-center space-y-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-widest text-lime-300 bg-lime-400/10 ring-1 ring-lime-400/30 rounded-full px-4 py-1.5 uppercase">
          <span aria-hidden>⛳</span> AI Swing Coach
        </span>
        <h1 className="text-4xl font-extrabold bg-gradient-to-r from-lime-300 via-emerald-300 to-teal-300 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(132,204,22,0.15)]">
          골프 스윙 분석기
        </h1>
        <p className="text-slate-400 max-w-md mx-auto leading-relaxed">
          스윙 영상을 올리고 사용한 클럽을 선택하면, AI 코치가 점수·분석·연습법·참고 선수를 알려드립니다.
        </p>
      </header>
      <AppShell />
    </main>
  )
}
