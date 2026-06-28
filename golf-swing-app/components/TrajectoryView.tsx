'use client'

import { useEffect, useRef } from 'react'
import { useI18n } from '@/lib/i18n'

interface TrajectoryData {
  headSpeed: number
  ballSpeed: number
  launchAngle: number
  carry: number
  apex: number
  smashFactor: number
}

interface TrajectoryViewProps {
  frame: string
  trajectory: TrajectoryData
}

function computeTrajectoryPoints(carry: number, apex: number, launchAngle: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = []
  const steps = 60
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = t * carry
    const y = 4 * apex * t * (1 - t)
    points.push({ x, y })
  }
  return points
}

export default function TrajectoryView({ frame, trajectory }: TrajectoryViewProps) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.crossOrigin = 'anonymous'
    const prefix = frame.startsWith('iVBOR') ? 'data:image/png;base64,' : 'data:image/jpeg;base64,'
    img.src = `${prefix}${frame}`

    img.onload = () => {
      const W = 1080
      const H = Math.round(W * (img.height / img.width))
      canvas.width = W
      canvas.height = H
      const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

      ctx.drawImage(img, 0, 0, W, H)

      // Semi-transparent overlay at bottom for stats
      const statsH = 140
      const statsGrad = ctx.createLinearGradient(0, H - statsH - 40, 0, H)
      statsGrad.addColorStop(0, 'rgba(0,0,0,0)')
      statsGrad.addColorStop(0.3, 'rgba(0,0,0,0.7)')
      statsGrad.addColorStop(1, 'rgba(0,0,0,0.9)')
      ctx.fillStyle = statsGrad
      ctx.fillRect(0, H - statsH - 40, W, statsH + 40)

      // Draw trajectory line from golfer position
      const points = computeTrajectoryPoints(trajectory.carry, trajectory.apex, trajectory.launchAngle)
      if (points.length > 0) {
        // Origin: roughly where the ball would be at impact (bottom-center area)
        const originX = W * 0.35
        const originY = H * 0.65

        // Scale trajectory to fit the upper portion of the image
        const maxX = trajectory.carry
        const maxY = trajectory.apex
        const scaleX = (W * 0.6) / maxX
        const scaleY = (H * 0.55) / maxY

        // Main trajectory line (orange/gold gradient)
        ctx.beginPath()
        ctx.moveTo(originX, originY)
        for (const p of points) {
          const px = originX + p.x * scaleX
          const py = originY - p.y * scaleY
          ctx.lineTo(px, py)
        }

        ctx.strokeStyle = '#f59e0b'
        ctx.lineWidth = 4
        ctx.shadowColor = '#f59e0b'
        ctx.shadowBlur = 15
        ctx.stroke()
        ctx.shadowBlur = 0

        // Ball at apex
        const apexPoint = points[Math.floor(points.length / 2)]
        const apexPx = originX + apexPoint.x * scaleX
        const apexPy = originY - apexPoint.y * scaleY
        ctx.beginPath()
        ctx.arc(apexPx, apexPy, 8, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'
        ctx.shadowColor = '#ffffff'
        ctx.shadowBlur = 12
        ctx.fill()
        ctx.shadowBlur = 0

        // Landing point marker
        const landX = originX + trajectory.carry * scaleX
        const landY = originY
        ctx.beginPath()
        ctx.arc(landX, landY, 6, 0, Math.PI * 2)
        ctx.fillStyle = '#ef4444'
        ctx.shadowColor = '#ef4444'
        ctx.shadowBlur = 10
        ctx.fill()
        ctx.shadowBlur = 0

        // Launch angle arc
        const arcRadius = 60
        const angleRad = (trajectory.launchAngle * Math.PI) / 180
        ctx.beginPath()
        ctx.arc(originX, originY, arcRadius, -angleRad, 0)
        ctx.strokeStyle = 'rgba(56,189,248,0.8)'
        ctx.lineWidth = 2
        ctx.stroke()

        // Angle label
        ctx.fillStyle = '#38bdf8'
        ctx.font = `bold 16px ${font}`
        ctx.textAlign = 'left'
        ctx.fillText(`${trajectory.launchAngle.toFixed(1)}°`, originX + arcRadius + 8, originY - 10)

        // Thin reference line (ground line)
        ctx.beginPath()
        ctx.moveTo(originX, originY)
        ctx.lineTo(landX + 20, originY)
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'
        ctx.lineWidth = 1
        ctx.setLineDash([6, 4])
        ctx.stroke()
        ctx.setLineDash([])

        // Carry distance label at landing
        ctx.fillStyle = '#f59e0b'
        ctx.font = `bold 20px ${font}`
        ctx.textAlign = 'center'
        ctx.fillText(`${trajectory.carry}m`, landX, landY - 18)
      }

      // Stats bar at bottom
      const statsY = H - statsH + 10
      const stats = [
        { label: 'Head Speed', value: `${trajectory.headSpeed.toFixed(1)} m/s`, color: '#a3e635' },
        { label: 'Ball Speed', value: `${trajectory.ballSpeed.toFixed(1)} m/s`, color: '#38bdf8' },
        { label: 'Launch', value: `${trajectory.launchAngle.toFixed(1)}°`, color: '#fbbf24' },
        { label: 'Carry', value: `${trajectory.carry} m`, color: '#f97316' },
        { label: 'Apex', value: `${trajectory.apex} m`, color: '#a78bfa' },
      ]

      const colW = W / stats.length
      stats.forEach((s, i) => {
        const cx = colW * i + colW / 2

        // Triangle marker
        ctx.fillStyle = s.color
        ctx.beginPath()
        ctx.moveTo(cx, statsY)
        ctx.lineTo(cx - 5, statsY + 8)
        ctx.lineTo(cx + 5, statsY + 8)
        ctx.closePath()
        ctx.fill()

        // Value
        ctx.fillStyle = '#ffffff'
        ctx.font = `bold 26px ${font}`
        ctx.textAlign = 'center'
        ctx.fillText(s.value, cx, statsY + 42)

        // Label
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.font = `500 14px ${font}`
        ctx.fillText(s.label, cx, statsY + 62)
      })

      // Disclaimer
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.font = `400 13px ${font}`
      ctx.textAlign = 'center'
      ctx.fillText(t('trajectory.disclaimer'), W / 2, H - 12)
    }
  }, [frame, trajectory, t])

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
        <span aria-hidden>🏌️</span> {t('trajectory.title')}
      </h3>
      <canvas
        ref={canvasRef}
        className="w-full rounded-xl ring-1 ring-white/10 shadow-inner"
      />
      <div className="grid grid-cols-5 gap-2 text-center">
        {[
          { label: t('trajectory.headSpeed'), value: `${trajectory.headSpeed.toFixed(1)}`, unit: 'm/s', color: 'text-lime-300' },
          { label: t('trajectory.ballSpeed'), value: `${trajectory.ballSpeed.toFixed(1)}`, unit: 'm/s', color: 'text-sky-300' },
          { label: t('trajectory.launch'), value: `${trajectory.launchAngle.toFixed(1)}`, unit: '°', color: 'text-amber-300' },
          { label: t('trajectory.carry'), value: `${trajectory.carry}`, unit: 'm', color: 'text-orange-300' },
          { label: t('trajectory.apex'), value: `${trajectory.apex}`, unit: 'm', color: 'text-purple-300' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg bg-white/[0.03] border border-white/5 py-2 px-1">
            <p className={`text-lg font-bold ${s.color}`}>{s.value}<span className="text-[10px] font-normal opacity-60 ml-0.5">{s.unit}</span></p>
            <p className="text-[10px] text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
