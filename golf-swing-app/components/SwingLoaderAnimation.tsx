/** Small looping SVG animation of a golfer swinging, used to liven up long-running AI steps. */
export default function SwingLoaderAnimation() {
  return (
    <div className="flex justify-center" aria-hidden>
      <svg viewBox="0 0 120 120" className="w-20 h-20">
        <line x1="18" y1="100" x2="102" y2="100" stroke="rgba(255,255,255,0.12)" strokeWidth="2" strokeLinecap="round" />
        <circle className="golf-swing-ball" cx="86" cy="97" r="2.4" fill="#e2e8f0" />
        <circle cx="50" cy="34" r="6" fill="#a3e635" opacity="0.85" />
        <line x1="50" y1="40" x2="50" y2="68" stroke="#a3e635" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
        <line x1="50" y1="68" x2="42" y2="98" stroke="#a3e635" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
        <line x1="50" y1="68" x2="58" y2="98" stroke="#a3e635" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
        <g className="golf-swing-club">
          <line x1="50" y1="46" x2="88" y2="90" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="88" cy="90" r="2" fill="#34d399" />
        </g>
      </svg>
    </div>
  )
}
