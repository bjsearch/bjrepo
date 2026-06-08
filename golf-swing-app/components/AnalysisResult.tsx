import { SwingAnalysisResult, swingGrade, youtubeSearchUrl } from '@/lib/types'

/** Renders feedback text, turning `**bold**` and `__underline__` markers into emphasis. */
function renderEmphasis(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-bold text-lime-200">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('__') && part.endsWith('__')) {
      return (
        <span key={i} className="font-semibold text-slate-100 underline decoration-2 decoration-rose-400 underline-offset-4">
          {part.slice(2, -2)}
        </span>
      )
    }
    return part
  })
}

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

function GradeBadge({ score }: { score: number }) {
  const grade = swingGrade(score)
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-xs font-bold text-emerald-300 bg-emerald-400/10 border border-emerald-400/25 rounded-full px-3.5 py-1">
        🏅 {grade.label}
      </span>
      <span className="text-[11px] text-slate-500 text-center max-w-[16rem] leading-relaxed">{grade.description}</span>
    </div>
  )
}

function ScoreComparison({ score, average }: { score: number; average: number }) {
  const diff = Math.round((score - average) * 10) / 10
  const avgLabel = average.toFixed(1)

  if (Math.abs(diff) < 0.5) {
    return (
      <p className="text-xs font-semibold text-slate-400 bg-white/5 border border-white/10 rounded-full px-3.5 py-1.5">
        ─ 나의 평균 점수({avgLabel}점)와 비슷해요
      </p>
    )
  }

  const isHigher = diff > 0
  return (
    <p
      className={`text-xs font-semibold rounded-full px-3.5 py-1.5 border ${
        isHigher
          ? 'text-lime-300 bg-lime-400/10 border-lime-400/25'
          : 'text-rose-300 bg-rose-500/10 border-rose-400/25'
      }`}
    >
      {isHigher ? '▲' : '▼'} 나의 평균({avgLabel}점)보다 {Math.abs(diff).toFixed(1)}점 {isHigher ? '높아요' : '낮아요'}
    </p>
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
      <p className="text-xs text-slate-400 leading-relaxed">{renderEmphasis(comment)}</p>
    </div>
  )
}

const card = 'rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.35)]'

export default function AnalysisResult({
  result,
  averageScore,
  frames,
}: {
  result: SwingAnalysisResult
  /** The user's average score across past analyses, for comparison. Omit/null if there's no history yet. */
  averageScore?: number | null
  /** Base64-encoded JPEG frames (no data: prefix) that were sent to the AI for this analysis. */
  frames?: string[]
}) {
  return (
    <div className="space-y-5 animate-[fadeIn_0.4s_ease-out]">
      <section className={`${card} p-8 flex flex-col items-center text-center gap-3`}>
        <ScoreGauge score={result.score} />
        <GradeBadge score={result.score} />
        <p className="text-xs text-lime-300/80 uppercase tracking-[0.2em] font-semibold">스윙 종합 점수</p>
        <p className="text-slate-300 max-w-md leading-relaxed">{renderEmphasis(result.scoreSummary)}</p>
        {averageScore != null && <ScoreComparison score={result.score} average={averageScore} />}
      </section>

      {frames && frames.length > 0 && (
        <section className={`${card} p-6`}>
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-100">
            <span className="text-xl" aria-hidden>🖼️</span> 분석에 사용된 프레임
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {frames.map((frame, i) => (
              <div key={i} className="space-y-1.5">
                <img
                  src={`data:image/jpeg;base64,${frame}`}
                  alt={`분석에 사용된 ${i + 1}번째 프레임`}
                  className="w-full aspect-square object-cover rounded-xl ring-1 ring-white/10 bg-black/40"
                />
                <p className="text-center text-[11px] text-slate-500">프레임 {i + 1}</p>
              </div>
            ))}
          </div>
        </section>
      )}

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
              <span>{renderEmphasis(point)}</span>
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
              <span>{renderEmphasis(tip)}</span>
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
