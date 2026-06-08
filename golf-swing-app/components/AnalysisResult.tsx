import { SwingAnalysisResult } from '@/lib/types'

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600'
  if (score >= 60) return 'text-amber-500'
  return 'text-rose-500'
}

export default function AnalysisResult({ result }: { result: SwingAnalysisResult }) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6 text-center">
        <p className="text-sm text-gray-500 mb-1">스윙 종합 점수</p>
        <p className={`text-5xl font-bold ${scoreColor(result.score)}`}>{result.score}</p>
        <p className="text-gray-600 mt-2">{result.scoreSummary}</p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="font-semibold text-lg mb-3">스윙 분석</h3>
        <ul className="space-y-2 list-disc list-inside text-gray-700">
          {result.analysis.map((point, i) => (
            <li key={i}>{point}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="font-semibold text-lg mb-3">추천 연습 방법</h3>
        <ul className="space-y-2 list-disc list-inside text-gray-700">
          {result.practiceTips.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="font-semibold text-lg mb-3">참고하면 좋은 선수</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {result.recommendedPlayers.map((player, i) => (
            <div key={i} className="rounded-lg bg-emerald-50 p-4">
              <p className="font-medium text-emerald-800">{player.name}</p>
              <p className="text-sm text-gray-600 mt-1">{player.reason}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
