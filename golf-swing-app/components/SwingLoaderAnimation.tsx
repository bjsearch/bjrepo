'use client'

import { useState, useEffect } from 'react'
import { useI18n, type TranslationKey } from '@/lib/i18n'

type AnimationStyle = 'swing' | 'putt' | 'drive'

const ANIMATION_LABEL_KEYS: Record<AnimationStyle, TranslationKey> = {
  swing: 'loader.swing',
  putt: 'loader.putt',
  drive: 'loader.drive',
}

function SwingAnimation() {
  return (
    <svg viewBox="0 0 200 200" className="w-32 h-32">
      {/* Ground with grass texture */}
      <rect x="10" y="160" width="180" height="4" rx="2" fill="url(#grassGrad)" />
      <defs>
        <linearGradient id="grassGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
          <stop offset="50%" stopColor="#4ade80" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0.3" />
        </linearGradient>
        <radialGradient id="headGrad">
          <stop offset="0%" stopColor="#d9f99d" />
          <stop offset="100%" stopColor="#a3e635" />
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Ball with shadow */}
      <ellipse className="loader-ball-shadow" cx="130" cy="162" rx="4" ry="1.5" fill="rgba(0,0,0,0.2)" />
      <circle className="loader-ball" cx="130" cy="157" r="4" fill="white" stroke="#e2e8f0" strokeWidth="0.5" />

      {/* Golfer body */}
      <g className="loader-golfer-body">
        {/* Head */}
        <circle cx="85" cy="62" r="10" fill="url(#headGrad)" />
        {/* Cap visor */}
        <path d="M77 58 Q85 52 93 58" fill="none" stroke="#65a30d" strokeWidth="2.5" strokeLinecap="round" />
        {/* Torso */}
        <path d="M85 72 L85 115" stroke="#a3e635" strokeWidth="5" strokeLinecap="round" />
        {/* Left leg */}
        <path d="M85 115 L72 158" stroke="#a3e635" strokeWidth="4" strokeLinecap="round" />
        {/* Right leg */}
        <path d="M85 115 L98 158" stroke="#a3e635" strokeWidth="4" strokeLinecap="round" />
        {/* Shoes */}
        <ellipse cx="72" cy="159" rx="6" ry="3" fill="#65a30d" />
        <ellipse cx="98" cy="159" rx="6" ry="3" fill="#65a30d" />
      </g>

      {/* Arms + Club (animated group) */}
      <g className="loader-swing-arm" filter="url(#glow)">
        {/* Upper arm */}
        <path d="M85 80 L105 65" stroke="#a3e635" strokeWidth="4" strokeLinecap="round" />
        {/* Forearm */}
        <path d="M105 65 L120 52" stroke="#a3e635" strokeWidth="3.5" strokeLinecap="round" />
        {/* Club shaft */}
        <line x1="120" y1="52" x2="145" y2="30" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" />
        {/* Club head */}
        <rect x="142" y="24" width="10" height="6" rx="2" fill="#34d399" transform="rotate(-30 147 27)" />
      </g>

      {/* Ball trail (shows after hit) */}
      <g className="loader-ball-trail">
        <circle cx="140" cy="140" r="2" fill="#a3e635" opacity="0.6" />
        <circle cx="155" cy="120" r="1.5" fill="#a3e635" opacity="0.4" />
        <circle cx="168" cy="105" r="1" fill="#a3e635" opacity="0.2" />
      </g>

      {/* Impact spark */}
      <g className="loader-impact-spark">
        <line x1="130" y1="150" x2="138" y2="142" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
        <line x1="135" y1="155" x2="145" y2="150" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="128" y1="148" x2="126" y2="138" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </svg>
  )
}

function PuttAnimation() {
  return (
    <svg viewBox="0 0 200 160" className="w-36 h-28">
      <defs>
        <linearGradient id="greenGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#16a34a" stopOpacity="0.2" />
          <stop offset="50%" stopColor="#22c55e" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#16a34a" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      {/* Green surface */}
      <rect x="5" y="130" width="190" height="6" rx="3" fill="url(#greenGrad)" />

      {/* Flag & hole */}
      <rect x="155" y="90" width="2" height="42" rx="1" fill="#e2e8f0" opacity="0.7" />
      <path d="M157 90 L175 98 L157 106 Z" fill="#ef4444" opacity="0.8" className="loader-flag" />
      <ellipse cx="156" cy="132" rx="6" ry="2" fill="#1a1a2e" opacity="0.6" />

      {/* Ball */}
      <circle className="loader-putt-ball" cx="50" cy="128" r="4" fill="white" stroke="#e2e8f0" strokeWidth="0.5" />

      {/* Golfer (putting stance) */}
      <g className="loader-putter-body">
        <circle cx="60" cy="72" r="9" fill="#a3e635" />
        <path d="M54 68 Q60 63 66 68" fill="none" stroke="#65a30d" strokeWidth="2" strokeLinecap="round" />
        <path d="M60 81 L58 118" stroke="#a3e635" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M58 118 L50 132" stroke="#a3e635" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M58 118 L66 132" stroke="#a3e635" strokeWidth="3.5" strokeLinecap="round" />
      </g>

      {/* Putter arm + club */}
      <g className="loader-putter-arm">
        <path d="M60 88 L55 100" stroke="#a3e635" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M55 100 L48 115" stroke="#a3e635" strokeWidth="3" strokeLinecap="round" />
        <line x1="48" y1="115" x2="46" y2="130" stroke="#34d399" strokeWidth="2" strokeLinecap="round" />
        <rect x="42" y="128" width="8" height="3" rx="1.5" fill="#34d399" />
      </g>

      {/* Rolling ball dots */}
      <g className="loader-putt-trail">
        <circle cx="70" cy="128" r="1.5" fill="#a3e635" opacity="0.5" />
        <circle cx="90" cy="128" r="1.2" fill="#a3e635" opacity="0.3" />
        <circle cx="110" cy="128" r="1" fill="#a3e635" opacity="0.2" />
      </g>
    </svg>
  )
}

function DriveAnimation() {
  return (
    <svg viewBox="0 0 220 200" className="w-36 h-32">
      <defs>
        <linearGradient id="teeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a3e635" />
          <stop offset="100%" stopColor="#65a30d" />
        </linearGradient>
        <radialGradient id="ballGlow">
          <stop offset="0%" stopColor="white" />
          <stop offset="100%" stopColor="#f1f5f9" />
        </radialGradient>
      </defs>

      {/* Ground */}
      <rect x="10" y="165" width="200" height="4" rx="2" fill="#22c55e" opacity="0.3" />

      {/* Tee */}
      <rect x="78" y="152" width="3" height="14" rx="1" fill="#d97706" opacity="0.7" />

      {/* Ball on tee */}
      <circle className="loader-drive-ball" cx="80" cy="149" r="5" fill="url(#ballGlow)" stroke="#e2e8f0" strokeWidth="0.5" />

      {/* Golfer - wider stance for driver */}
      <g className="loader-driver-body">
        <circle cx="90" cy="55" r="11" fill="url(#teeGrad)" />
        <path d="M81 50 Q90 44 99 50" fill="none" stroke="#65a30d" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M90 66 L88 115" stroke="#a3e635" strokeWidth="5" strokeLinecap="round" />
        <path d="M88 115 L72 164" stroke="#a3e635" strokeWidth="4" strokeLinecap="round" />
        <path d="M88 115 L104 164" stroke="#a3e635" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="72" cy="165" rx="7" ry="3" fill="#65a30d" />
        <ellipse cx="104" cy="165" rx="7" ry="3" fill="#65a30d" />
      </g>

      {/* Driver arm + club */}
      <g className="loader-driver-swing">
        <path d="M90 75 L110 58" stroke="#a3e635" strokeWidth="4" strokeLinecap="round" />
        <path d="M110 58 L130 42" stroke="#a3e635" strokeWidth="3.5" strokeLinecap="round" />
        <line x1="130" y1="42" x2="158" y2="18" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" />
        {/* Big driver head */}
        <ellipse cx="161" cy="15" rx="8" ry="5" fill="#34d399" transform="rotate(-30 161 15)" />
      </g>

      {/* Flying ball arc */}
      <g className="loader-drive-flight">
        <circle cx="100" cy="120" r="3" fill="white" opacity="0.7" />
        <circle cx="130" cy="85" r="2.5" fill="white" opacity="0.5" />
        <circle cx="160" cy="60" r="2" fill="white" opacity="0.3" />
        <circle cx="185" cy="45" r="1.5" fill="white" opacity="0.2" />
        {/* Distance text */}
        <text x="190" y="42" fontSize="10" fill="#a3e635" opacity="0" className="loader-distance-text" fontWeight="bold">250y</text>
      </g>

      {/* Power burst */}
      <g className="loader-power-burst">
        <line x1="80" y1="142" x2="72" y2="130" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
        <line x1="85" y1="145" x2="95" y2="135" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
        <line x1="78" y1="148" x2="65" y2="145" stroke="#fb923c" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="80" cy="148" r="6" fill="none" stroke="#fbbf24" strokeWidth="1" opacity="0.4" />
      </g>
    </svg>
  )
}

const STORAGE_KEY = 'carry-coach-loader-style'

export default function SwingLoaderAnimation() {
  const { t } = useI18n()
  const [style, setStyle] = useState<AnimationStyle>('swing')
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as AnimationStyle | null
    if (saved && saved in ANIMATION_LABEL_KEYS) setStyle(saved)
  }, [])

  function handleChange(next: AnimationStyle) {
    setStyle(next)
    localStorage.setItem(STORAGE_KEY, next)
    setShowPicker(false)
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        {style === 'swing' && <SwingAnimation />}
        {style === 'putt' && <PuttAnimation />}
        {style === 'drive' && <DriveAnimation />}
      </div>

      <button
        type="button"
        onClick={() => setShowPicker((p) => !p)}
        className="text-[10px] text-slate-500 hover:text-slate-300 transition"
      >
        {showPicker ? t('loader.close') : t('loader.changeAnim')}
      </button>

      {showPicker && (
        <div className="flex gap-2">
          {(Object.keys(ANIMATION_LABEL_KEYS) as AnimationStyle[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handleChange(key)}
              className={`text-[11px] font-semibold rounded-full px-3 py-1 border transition ${
                style === key
                  ? 'border-lime-400/50 bg-lime-400/10 text-lime-300'
                  : 'border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20'
              }`}
            >
              {t(ANIMATION_LABEL_KEYS[key])}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
