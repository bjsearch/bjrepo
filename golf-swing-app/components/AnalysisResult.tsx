import { SwingAnalysisResult, youtubeSearchUrl } from '@/lib/types'

function scoreColor(score: number): { stroke: string; text: string; glow: string; bar: string } {
  if (score >= 80) return { stroke: '#a3e635', text: 'text-lime-300', glow: 'rgba(163,230,53,0.45)', bar: 'bg-lime-400' }
  if (score >= 60) return { stroke: '#fbbf24', text: 'text-amber-300', glow: 'rgba(251,191,36,0.4)', bar: 'bg-amber-400' }
  return { stroke: '#fb7185', text: 'text-rose-300', glow: 'rgba(251,113,133,0.4)', bar: 'bg-rose-400' }
}

function ScoreGauge({ score }: { score: number }) {
  const { stroke, text, glow } = scoreColor(score)
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - score / 100)

  return (
    <div className="relative w-36 h-36">
      <svg viewBox="0 0 120 120" className="-rotate-90 w-full h-full">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 8px ${glow})`, transition: 'stroke-dashoffset 0.8s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-extrabold ${text}`}>{score}</span>
        <span className="text-[11px] text-slate-500">/ 100</span>
      </div>
    </div>
  )
}

function StageScoreBar({ stage, score, comment }: { stage: string; score: number; comment: string }) {
  const { text, bar } = scoreColor(score)
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-slate-200">{stage}</span>
        <span className={`text-sm font-bold ${text}`}>{score}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
        <div
          className={`h-full rounded-full ${bar} transition-all duration-700 ease-out`}
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{comment}</p>
    </div>
  )
}

const card = 'rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.35)]'

export default function AnalysisResult({ result }: { result: SwingAnalysisResult }) {
  return (
    <div className="space-y-5 animate-[fadeIn_0.4s_ease-out]">
      <section className={`${card} p-8 flex flex-col items-center text-center gap-3`}>
        <ScoreGauge score={result.score} />
        <p className="text-xs text-lime-300/80 uppercase tracking-[0.2em] font-semibold">스윙 종합 점수</p>
        <p className="text-slate-300 max-w-md leading-relaxed">{result.scoreSummary}</p>
      </section>

      {result.stageScores.length > 0 && (
        <section className={`${card} p-6`}>
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-100">
            <span className="text-xl" aria-hidden>📊</span> 단계별 스윙 점수
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {result.stageScores.map((s, i) => (
              <StageScoreBar key={i} stage={s.stage} score={s.score} comment={s.comment} />
            ))}
          </div>
        </section>
      )}

      <section className={`${card} p-6`}>
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-slate-100">
          <span className="text-xl" aria-hidden>🏌️</span> 스윙 분석
        </h3>
        <ul className="space-y-2.5">
          {result.analysis.map((point, i) => (
            <li key={i} className="flex gap-2.5 text-slate-300 text-sm leading-relaxed">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-lime-400 shadow-[0_0_6px_rgba(163,230,53,0.7)] shrink-0" />
              {point}
            </li>
          ))}
        </ul>
      </section>

      <section className={`${card} p-6`}>
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-slate-100">
          <span className="text-xl" aria-hidden>📋</span> 추천 연습 방법
        </h3>
        <ul className="space-y-2.5">
          {result.practiceTips.map((tip, i) => (
            <li key={i} className="flex gap-2.5 text-slate-300 text-sm leading-relaxed">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-teal-400 shadow-[0_0_6px_rgba(45,212,191,0.7)] shrink-0" />
              {tip}
            </li>
          ))}
        </ul>
      </section>

      <section className={`${card} p-6`}>
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-slate-100">
          <span className="text-xl" aria-hidden>⭐</span> 참고하면 좋은 선수
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {result.recommendedPlayers.map((player, i) => (
            <div
              key={i}
              className="rounded-xl bg-gradient-to-br from-emerald-400/10 to-lime-400/5 border border-emerald-300/15 p-4 flex flex-col gap-2"
            >
              <div>
                <p className="font-semibold text-lime-300">{player.name}</p>
                <p className="text-sm text-slate-400 mt-1 leading-relaxed">{player.reason}</p>
              </div>
              <a
                href={youtubeSearchUrl(`${player.name} golf swing`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-rose-300 bg-rose-500/10 border border-rose-400/20 rounded-full px-3 py-1.5 hover:bg-rose-500/20 transition"
              >
                <span aria-hidden>▶</span> YouTube에서 스윙 영상 보기
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
