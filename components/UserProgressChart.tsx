'use client'

import { format, parseISO } from 'date-fns'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { DiaryEntry } from '@/lib/types'

interface Props {
  entries: DiaryEntry[]
}

export default function UserProgressChart({ entries }: Props) {
  const data = entries
    .filter(e => e.analysis)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => {
      const corrections = e.analysis!.grammar_corrections?.length ?? 0
      const autocomplete = e.aiHelpCount ?? 0
      return {
        date: e.date,
        label: format(parseISO(e.date), 'MM.dd'),
        score: e.analysis!.score,
        aiHelp: corrections + autocomplete,
        corrections,
        autocomplete,
      }
    })

  if (data.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-slate-400">분석 데이터가 없어 그래프를 표시할 수 없어요</div>
    )
  }

  if (data.length === 1) {
    return (
      <div className="py-10 text-center text-sm text-slate-400">
        그래프를 표시하려면 분석된 일기가 2개 이상 필요해요 (현재 1개, 점수 {data[0].score}점)
      </div>
    )
  }

  const avg = Math.round((data.reduce((acc, d) => acc + d.score, 0) / data.length) * 10) / 10
  const first = data[0].score
  const last = data[data.length - 1].score
  const diff = last - first
  const avgAiHelp = Math.round((data.reduce((acc, d) => acc + d.aiHelp, 0) / data.length) * 10) / 10

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    return (
      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-lg text-xs">
        <div className="font-semibold text-slate-700 mb-1">{label}</div>
        <div className="text-indigo-600">점수: {d.score}점</div>
        {d.corrections > 0 && <div className="text-amber-600">교정: {d.corrections}건</div>}
        {d.autocomplete > 0 && <div className="text-violet-600">자동완성: {d.autocomplete}회</div>}
        <div className="text-slate-400 mt-0.5">AI 도움 합계: {d.aiHelp}건</div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-3 text-xs flex-wrap">
        <span className="text-slate-400">평균 <strong className="text-slate-700">{avg}점</strong></span>
        <span className={`font-medium ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-500' : 'text-slate-400'}`}>
          {diff > 0 ? `▲ +${diff}점 상승` : diff < 0 ? `▼ ${diff}점 하락` : '변화 없음'}
        </span>
        <span className="text-amber-500">AI 도움 평균 <strong>{avgAiHelp}건</strong></span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 5, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis yAxisId="score" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis yAxisId="aiHelp" orientation="right" tick={{ fontSize: 10, fill: '#d97706' }} allowDecimals={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value: string) => value === 'score' ? '점수' : 'AI 도움'}
          />
          <Bar yAxisId="aiHelp" dataKey="aiHelp" fill="#fbbf24" opacity={0.35} barSize={20} radius={[4, 4, 0, 0]} name="aiHelp" />
          <Line yAxisId="score" type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} name="score" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
