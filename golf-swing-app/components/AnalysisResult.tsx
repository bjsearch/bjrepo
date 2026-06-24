import { useState, useEffect, useCallback } from 'react'
import { SwingAnalysisResult, youtubeSearchUrl } from '@/lib/types'
import { useI18n } from '@/lib/i18n'

declare global {
  interface Window {
    Kakao?: {
      isInitialized: () => boolean
      init: (key: string) => void
      Share: {
        sendDefault: (options: Record<string, unknown>) => void
      }
    }
  }
}

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
  const { t } = useI18n()

  function gradeInfo(s: number): { label: string; description: string } {
    if (s >= 90) return { label: t('grade.tourPro'), description: t('grade.tourProDesc') }
    if (s >= 80) return { label: t('grade.advanced'), description: t('grade.advancedDesc') }
    if (s >= 70) return { label: t('grade.upperIntermediate'), description: t('grade.upperIntermediateDesc') }
    if (s >= 60) return { label: t('grade.intermediate'), description: t('grade.intermediateDesc') }
    if (s >= 50) return { label: t('grade.lowerIntermediate'), description: t('grade.lowerIntermediateDesc') }
    return { label: t('grade.beginner'), description: t('grade.beginnerDesc') }
  }

  const grade = gradeInfo(score)
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-xs font-bold text-emerald-300 bg-emerald-400/10 border border-emerald-400/25 rounded-full px-3.5 py-1">
        🏅 {grade.label}
      </span>
      <span className="text-[11px] text-slate-500 text-center max-w-[16rem] leading-relaxed">{grade.description}</span>
    </div>
  )
}

type ComparisonTheme = 'self' | 'global' | 'region'

const COMPARISON_COLORS: Record<ComparisonTheme, { higher: string; lower: string; similar: string }> = {
  self: {
    higher: 'text-lime-300 bg-lime-400/10 border-lime-400/25',
    lower: 'text-rose-300 bg-rose-500/10 border-rose-400/25',
    similar: 'text-slate-400 bg-white/5 border-white/10',
  },
  global: {
    higher: 'text-sky-300 bg-sky-400/10 border-sky-400/25',
    lower: 'text-amber-300 bg-amber-400/10 border-amber-400/25',
    similar: 'text-slate-400 bg-white/5 border-white/10',
  },
  region: {
    higher: 'text-violet-300 bg-violet-400/10 border-violet-400/25',
    lower: 'text-orange-300 bg-orange-400/10 border-orange-400/25',
    similar: 'text-slate-400 bg-white/5 border-white/10',
  },
}

function ScoreComparison({
  score,
  average,
  label,
  theme,
}: {
  score: number
  average: number
  label: string
  theme: ComparisonTheme
}) {
  const { t } = useI18n()
  const diff = Math.round((score - average) * 10) / 10
  const avgLabel = average.toFixed(1)
  const diffLabel = Math.abs(diff).toFixed(1)
  const colors = COMPARISON_COLORS[theme]

  if (Math.abs(diff) < 0.5) {
    const text = t('score.similarTo').replace('{avg}', avgLabel)
    return (
      <p className={`text-xs font-semibold rounded-full px-3.5 py-1.5 border ${colors.similar}`}>
        ─ {label}{text}
      </p>
    )
  }

  const isHigher = diff > 0
  const text = t(isHigher ? 'score.higherThan' : 'score.lowerThan')
    .replace('{avg}', avgLabel)
    .replace('{diff}', diffLabel)
  return (
    <p className={`text-xs font-semibold rounded-full px-3.5 py-1.5 border ${isHigher ? colors.higher : colors.lower}`}>
      {isHigher ? '▲' : '▼'} {label}{text}
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

type FrameRating = 'accurate' | 'inaccurate'

function FrameFeedback({ onRate }: { onRate: (accurate: boolean) => void }) {
  const { t } = useI18n()
  const [rating, setRating] = useState<FrameRating | null>(null)

  function handleRate(accurate: boolean) {
    if (rating) return
    setRating(accurate ? 'accurate' : 'inaccurate')
    onRate(accurate)
  }

  if (rating) {
    return (
      <p
        className={`text-center text-[11px] font-semibold rounded-full px-2 py-1 border ${
          rating === 'accurate'
            ? 'text-lime-300 bg-lime-400/10 border-lime-400/25'
            : 'text-rose-300 bg-rose-500/10 border-rose-400/25'
        }`}
      >
        {rating === 'accurate' ? t('result.ratedAccurate') : t('result.ratedInaccurate')}
      </p>
    )
  }

  return (
    <div className="flex items-center justify-center gap-1.5">
      <button
        type="button"
        onClick={() => handleRate(true)}
        className="flex-1 text-[11px] font-semibold rounded-full px-2 py-1 border border-lime-400/25 text-lime-300 bg-lime-400/5 hover:bg-lime-400/15 transition"
      >
        {t('result.feedbackAccurate')}
      </button>
      <button
        type="button"
        onClick={() => handleRate(false)}
        className="flex-1 text-[11px] font-semibold rounded-full px-2 py-1 border border-rose-400/25 text-rose-300 bg-rose-500/5 hover:bg-rose-500/15 transition"
      >
        {t('result.feedbackInaccurate')}
      </button>
    </div>
  )
}

const card = 'rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.35)]'

export default function AnalysisResult({
  result,
  myAverageScore,
  globalAverageScore,
  regionAverageScore,
  regionLabel,
  frames,
  frameLabels,
  onFrameFeedback,
}: {
  result: SwingAnalysisResult
  myAverageScore?: number | null
  globalAverageScore?: number | null
  regionAverageScore?: number | null
  regionLabel?: string | null
  frames?: string[]
  frameLabels?: string[]
  onFrameFeedback?: (frameIndex: number, accurate: boolean) => void
}) {
  const { t, locale } = useI18n()
  const [shareToast, setShareToast] = useState<string | null>(null)

  useEffect(() => {
    const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY
    if (kakaoKey && window.Kakao && !window.Kakao.isInitialized()) {
      window.Kakao.init(kakaoKey)
    }
  }, [])

  const handleKakaoShare = useCallback(() => {
    const title = t('share.kakaoTitle')
    const scoreLabel = t('share.kakaoScoreLabel')
    const gradeLabel = result.score >= 90 ? t('grade.tourPro')
      : result.score >= 80 ? t('grade.advanced')
      : result.score >= 70 ? t('grade.upperIntermediate')
      : result.score >= 60 ? t('grade.intermediate')
      : result.score >= 50 ? t('grade.lowerIntermediate')
      : t('grade.beginner')
    const description = `${scoreLabel}: ${result.score}/100 (${gradeLabel})\n${result.scoreSummary.replace(/\*\*/g, '').replace(/__/g, '')}`
    const pageUrl = typeof window !== 'undefined' ? window.location.href : ''

    if (window.Kakao?.isInitialized()) {
      window.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title,
          description: description.slice(0, 200),
          imageUrl: 'https://carry-coach.netlify.app/og-image.png',
          link: { mobileWebUrl: pageUrl, webUrl: pageUrl },
        },
        buttons: [
          { title: t('share.kakaoViewResult'), link: { mobileWebUrl: pageUrl, webUrl: pageUrl } },
        ],
      })
      return
    }

    const text = `${title}\n${description}\n${pageUrl}`
    navigator.clipboard.writeText(text).then(() => {
      setShareToast(t('share.copied'))
      setTimeout(() => setShareToast(null), 2500)
    }).catch(() => {
      setShareToast(t('share.copyFailed'))
      setTimeout(() => setShareToast(null), 2500)
    })
  }, [result, t])

  return (
    <div className="space-y-5 animate-[fadeIn_0.4s_ease-out]">
      <section className={`${card} p-8 flex flex-col items-center text-center gap-3`}>
        <ScoreGauge score={result.score} />
        <GradeBadge score={result.score} />
        <p className="text-xs text-lime-300/80 uppercase tracking-[0.2em] font-semibold">{t('result.overallScore')}</p>
        <p className="text-slate-300 max-w-md leading-relaxed">{renderEmphasis(result.scoreSummary)}</p>
        {(myAverageScore != null || globalAverageScore != null || regionAverageScore != null) && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {myAverageScore != null && (
              <ScoreComparison score={result.score} average={myAverageScore} label={t('result.myAvg')} theme="self" />
            )}
            {globalAverageScore != null && (
              <ScoreComparison score={result.score} average={globalAverageScore} label={t('result.globalAvg')} theme="global" />
            )}
            {regionAverageScore != null && (
              <ScoreComparison
                score={result.score}
                average={regionAverageScore}
                label={`${regionLabel ?? t('result.regionDefault')} ${t('result.regionAvg')}`}
                theme="region"
              />
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleKakaoShare}
          className="mt-2 inline-flex items-center gap-2 text-sm font-semibold rounded-full px-5 py-2 border border-yellow-400/30 text-yellow-300 bg-yellow-400/10 hover:bg-yellow-400/20 transition"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 3C6.48 3 2 6.58 2 10.94c0 2.8 1.86 5.27 4.66 6.68l-1.19 4.38 5.08-3.35c.47.05.95.07 1.45.07 5.52 0 10-3.58 10-7.78S17.52 3 12 3z" />
          </svg>
          {t('share.kakao')}
        </button>
        {shareToast && (
          <p className="text-xs text-yellow-300 bg-yellow-400/10 border border-yellow-400/20 rounded-full px-3 py-1 animate-[fadeIn_0.2s_ease-out]">
            {shareToast}
          </p>
        )}
      </section>

      {frames && frames.length > 0 && (
        <section className={`${card} p-6`}>
          <h3 className="font-bold text-lg mb-1 flex items-center gap-2 text-slate-100">
            <span className="text-xl" aria-hidden>🖼️</span> {t('result.framesTitle')}
          </h3>
          {onFrameFeedback && (
            <p className="text-xs text-slate-500 mb-4">
              {t('result.framesDescription')}
            </p>
          )}
          <div className={`grid grid-cols-2 ${frames.length > 4 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'} gap-3`}>
            {frames.map((frame, i) => (
              <div key={i} className="space-y-1.5">
                <img
                  src={`data:image/jpeg;base64,${frame}`}
                  alt={`${frameLabels?.[i] ?? `Frame ${i + 1}`}`}
                  className="w-full aspect-square object-cover rounded-xl ring-1 ring-white/10 bg-black/40"
                />
                <p className="text-center text-[11px] text-slate-500">{frameLabels?.[i] ?? `Frame ${i + 1}`}</p>
                {onFrameFeedback && <FrameFeedback onRate={(accurate) => onFrameFeedback(i, accurate)} />}
              </div>
            ))}
          </div>
        </section>
      )}

      {result.stageScores.length > 0 && (
        <section className={`${card} p-6`}>
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-100">
            <span className="text-xl" aria-hidden>📊</span> {t('result.stageScores')}
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
          <span className="text-xl" aria-hidden>🏌️</span> {t('result.swingAnalysis')}
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
          <span className="text-xl" aria-hidden>📋</span> {t('result.practiceTips')}
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
          <span className="text-xl" aria-hidden>⭐</span> {t('result.recommendedPlayers')}
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
                <span aria-hidden>▶</span> {t('result.watchYoutube')}
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
