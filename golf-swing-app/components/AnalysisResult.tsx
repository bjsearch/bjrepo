import { SwingAnalysisResult } from '@/lib/types'

function scoreRing(score: number): string {
  if (score >= 80) return 'from-emerald-400 to-teal-500'
  if (score >= 60) return 'from-amber-300 to-orange-400'
  return 'from-rose-400 to-pink-500'
}

export default function AnalysisResult({ result }: { result: SwingAnalysisResult }) {
  return (
    <div className="space-y-5 animate-[fadeIn_0.4s_ease-out]">
      <section className="rounded-2xl border border-slate-200/70 bg-white/80 backdrop-blur shadow-sm p-8 flex flex-col items-center text-center gap-3">
        <div
          className={`w-28 h-28 rounded-full bg-gradient-to-br ${scoreRing(result.score)} p-[5px] shadow-md`}
        >
          <div className="w-full h-full rounded-full bg-white flex flex-col items-center justify-center">
            <span className="text-4xl font-bold text-slate-800">{result.score}</span>
            <span className="text-[11px] text-slate-400">/ 100</span>
          </div>
        </div>
        <p className="text-sm text-slate-500 uppercase tracking-wide font-medium">스윙 종합 점수</p>
        <p className="text-slate-600 max-w-md">{result.scoreSummary}</p>
      </section>

      <section className="rounded-2xl border border-slate-200/70 bg-white/80 backdrop-blur shadow-sm p-6">
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-slate-800">
          <span className="text-xl">🏌️</span> 스윙 분석
        </h3>
        <ul className="space-y-2.5">
          {result.analysis.map((point, i) => (
            <li key={i} className="flex gap-2.5 text-slate-600 text-sm leading-relaxed">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              {point}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200/70 bg-white/80 backdrop-blur shadow-sm p-6">
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-slate-800">
          <span className="text-xl">📋</span> 추천 연습 방법
        </h3>
        <ul className="space-y-2.5">
          {result.practiceTips.map((tip, i) => (
            <li key={i} className="flex gap-2.5 text-slate-600 text-sm leading-relaxed">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
              {tip}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200/70 bg-white/80 backdrop-blur shadow-sm p-6">
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-slate-800">
          <span className="text-xl">⭐</span> 참고하면 좋은 선수
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {result.recommendedPlayers.map((player, i) => (
            <div
              key={i}
              className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-4"
            >
              <p className="font-semibold text-emerald-800">{player.name}</p>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">{player.reason}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
