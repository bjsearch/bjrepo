'use client'

import { format, parseISO } from 'date-fns'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
    .map(e => ({
      date: e.date,
      label: format(parseISO(e.date), 'MM.dd'),
      score: e.analysis!.score,
    }))

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

  return (
    <div>
      <div className="flex items-center gap-4 mb-3 text-xs">
        <span className="text-slate-400">평균 <strong className="text-slate-700">{avg}점</strong></span>
        <span className={`font-medium ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-500' : 'text-slate-400'}`}>
          {diff > 0 ? `▲ +${diff}점 상승` : diff < 0 ? `▼ ${diff}점 하락` : '변화 없음'}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            formatter={(value) => [`${value}점`, '점수']}
          />
          <Line type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
