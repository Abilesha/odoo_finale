/** An illustrated bride and groom, walking hand in hand.
 *
 *  Drawn in SVG (no emoji, no images) so it is crisp at any size and the
 *  pieces can move on their own: the groom's legs step, the lehenga sways,
 *  the dupatta drifts and the two of them bob along. When they arrive they
 *  stop walking and stand together under the mandap.
 *
 *  All movement is CSS (see .rk-couple in index.css) and switches off for
 *  people who ask their device for reduced motion.
 */

export function WalkingCouple({ height = 96, walking = true, className = '' }) {
  return (
    <svg viewBox="0 0 120 150" height={height} className={`rk-couple ${walking ? 'is-walking' : ''} overflow-visible ${className}`} aria-hidden>
      <ellipse cx="60" cy="146" rx="46" ry="3.5" fill="rgba(42,15,25,.16)" className="rk-shadow" />
      <g className="rk-bob">
        {/* ---------- groom ---------- */}
        <g transform="translate(36 0)">
          <g className="rk-leg rk-leg-a">
            <path d="M-6 92 L-7 136" stroke="#efe2c4" strokeWidth="8" strokeLinecap="round" />
            <path d="M-12 139 q6 -5 11 -1 l0 3 h-11z" fill="#c6922c" />
          </g>
          <g className="rk-leg rk-leg-b">
            <path d="M6 92 L7 136" stroke="#e4d3ae" strokeWidth="8" strokeLinecap="round" />
            <path d="M2 139 q6 -5 11 -1 l0 3 h-11z" fill="#a37421" />
          </g>
          {/* sherwani */}
          <path d="M-13 38 Q0 34 13 38 L16 96 Q0 100 -16 96 Z" fill="#f6ecd4" />
          <path d="M-13 38 Q0 34 13 38 L16 96 Q0 100 -16 96 Z" fill="url(#rk-sherwani)" />
          <path d="M0 38 L0 96" stroke="#d9ae4d" strokeWidth="1.2" />
          {[46, 54, 62, 70, 78].map((y) => <circle key={y} cx="0" cy={y} r="1.4" fill="#c6922c" />)}
          <path d="M-5 37 Q0 41 5 37 L5 34 L-5 34Z" fill="#d9ae4d" />
          {/* stole */}
          <path d="M-12 40 Q2 58 14 90 L10 92 Q-2 64 -14 46Z" fill="#8a1c2b" opacity=".92" />
          {/* far arm */}
          <path d="M-12 42 Q-18 62 -14 80" stroke="#f0e2c2" strokeWidth="6.5" strokeLinecap="round" fill="none" />
          <circle cx="-14" cy="81" r="3.2" fill="#c98b62" />
          {/* head */}
          <rect x="-3.5" y="27" width="7" height="8" rx="2" fill="#b97a52" />
          <circle cx="0" cy="22" r="9.5" fill="#c98b62" />
          <path d="M-9 22 q1 -9 9 -10 q8 1 9 10 q-4 -4 -9 -4 q-5 0 -9 4z" fill="#2b1a1a" />
          <circle cx="3.2" cy="22.5" r="0.9" fill="#2b1a1a" />
          <path d="M1.5 26.4 q2 1.2 4 0" stroke="#7a3b2a" strokeWidth="0.9" fill="none" strokeLinecap="round" />
          {/* safa */}
          <path d="M-10.5 17 Q-11 5 0 3.5 Q11 5 10.5 17 Q0 13 -10.5 17Z" fill="#a8233a" />
          <path d="M-10 15 Q0 10.5 10 15" stroke="#e7c87c" strokeWidth="1.6" fill="none" />
          <path d="M-9 10 Q0 6 9 10" stroke="#e7c87c" strokeWidth="1" fill="none" />
          <path d="M5 5 q4 -6 2 -11 q-2 4 -5 6z" fill="#d9ae4d" className="rk-kalgi" />
          <circle cx="4.5" cy="6" r="1.6" fill="#f6e3a1" />
          {/* near arm, reaching for her hand */}
          <path d="M11 42 Q20 56 27 66" stroke="#efe0bd" strokeWidth="6.5" strokeLinecap="round" fill="none" />
        </g>

        {/* ---------- bride ---------- */}
        <g transform="translate(84 0)">
          {/* dupatta flowing behind */}
          <path className="rk-dupatta" d="M2 12 Q22 18 26 46 Q30 80 22 118 Q14 96 12 70 Q8 40 -2 22Z" fill="#e0485f" opacity=".55" />
          {/* lehenga */}
          <g className="rk-skirt">
            <path d="M-11 66 Q0 62 11 66 L27 140 Q0 146 -27 140 Z" fill="#b3203a" />
            <path d="M-24 128 Q0 134 24 128 L27 140 Q0 146 -27 140 Z" fill="#d9ae4d" />
            <path d="M-20 112 Q0 117 20 112" stroke="#e7c87c" strokeWidth="1.6" fill="none" />
            <path d="M-15 92 Q0 96 15 92" stroke="#e7c87c" strokeWidth="1.2" fill="none" strokeDasharray="2 3" />
            {[-14, -5, 5, 14].map((x) => <circle key={x} cx={x} cy={104 + Math.abs(x) * 0.2} r="1.4" fill="#f6e3a1" />)}
          </g>
          {/* choli */}
          <path d="M-10 40 Q0 36 10 40 L11 66 Q0 69 -11 66 Z" fill="#c62a45" />
          <path d="M-10 62 Q0 66 10 62" stroke="#d9ae4d" strokeWidth="2" fill="none" />
          {/* far arm */}
          <path d="M9 43 Q15 58 12 74" stroke="#c98b62" strokeWidth="5" strokeLinecap="round" fill="none" />
          {[69, 72].map((y) => <path key={y} d={`M10 ${y} h5`} stroke="#d9ae4d" strokeWidth="1.6" strokeLinecap="round" />)}
          {/* near arm, holding his hand */}
          <path d="M-9 43 Q-16 56 -21 66" stroke="#c98b62" strokeWidth="5" strokeLinecap="round" fill="none" />
          <circle cx="-22.5" cy="67" r="3.6" fill="#c98b62" />
          {[60, 63].map((y) => <path key={y} d={`M${-19 + (y - 60) * 0.3} ${y} l-4 1.6`} stroke="#d9ae4d" strokeWidth="1.5" strokeLinecap="round" />)}
          {/* head */}
          <rect x="-3" y="28" width="6" height="8" rx="2" fill="#bf8059" />
          <circle cx="0" cy="23" r="9" fill="#d29670" />
          <path d="M-9.5 24 q-1 -12 9.5 -12 q10.5 0 9.5 12 q-3 -6 -9.5 -6 q-6.5 0 -9.5 6z" fill="#1f1414" />
          <circle cx="9.5" cy="21" r="5" fill="#1f1414" />
          <circle cx="-2.6" cy="23.6" r="0.9" fill="#1f1414" />
          <path d="M-5 27.6 q2 1.2 4 0" stroke="#9c3b3b" strokeWidth="1" fill="none" strokeLinecap="round" />
          <circle cx="0" cy="13.5" r="1.8" fill="#f6e3a1" />
          <path d="M0 12 L0 15.5" stroke="#d9ae4d" strokeWidth="0.8" />
          <circle cx="0" cy="22" r="0.9" fill="#a8233a" />
          {/* veil over the head */}
          <path className="rk-veil" d="M-12 22 Q-12 8 0 7 Q12 8 13 22 Q16 30 14 40 Q8 30 6 20 Q0 14 -6 20 Q-9 28 -13 34 Q-14 28 -12 22Z" fill="#e0485f" opacity=".7" />
          <path d="M-12 22 Q-12 8 0 7 Q12 8 13 22" stroke="#e7c87c" strokeWidth="1.3" fill="none" />
        </g>
        {/* their hands meet */}
        <circle cx="62.5" cy="66.5" r="3.8" fill="#c98b62" />
      </g>
      <g className="rk-hearts">
        <path d="M60 28 c-3 -4 -9 -1 -6 3 l6 6 l6 -6 c3 -4 -3 -7 -6 -3z" fill="#e0485f" />
        <path d="M70 18 c-2 -3 -6 -1 -4 2 l4 4 l4 -4 c2 -3 -2 -5 -4 -2z" fill="#d9ae4d" />
      </g>
      <defs>
        <linearGradient id="rk-sherwani" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".5" />
          <stop offset="1" stopColor="#d9ae4d" stopOpacity=".25" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/** A small mandap — where the journey ends. */
export function Mandap({ height = 84, lit = false }) {
  return (
    <svg viewBox="0 0 90 100" height={height} aria-hidden className={lit ? 'rk-mandap is-lit' : 'rk-mandap'}>
      <path d="M8 30 Q45 2 82 30 Z" fill="#a8233a" />
      <path d="M8 30 Q45 2 82 30" stroke="#d9ae4d" strokeWidth="2.5" fill="none" />
      <path d="M45 4 l0 -4" stroke="#d9ae4d" strokeWidth="2" />
      <circle cx="45" cy="1" r="2.5" fill="#d9ae4d" />
      <rect x="4" y="29" width="82" height="5" rx="1.5" fill="#d9ae4d" />
      {[14, 76].map((x) => <rect key={x} x={x - 3} y="34" width="6" height="56" fill="#d9ae4d" />)}
      {[14, 76].map((x) => <rect key={`c${x}`} x={x - 5} y="88" width="10" height="5" rx="1" fill="#a37421" />)}
      {[22, 33, 45, 57, 68].map((x, i) => (
        <g key={x} className="rk-garland" style={{ animationDelay: `${i * 160}ms` }}>
          <path d={`M${x} 34 v${12 + (i % 2) * 6}`} stroke="#5f8f5a" strokeWidth="1" />
          {Array.from({ length: 3 + (i % 2) }).map((_, k) => <circle key={k} cx={x} cy={38 + k * 5} r="2.6" fill={k % 2 ? '#f4b41a' : '#e8870e'} />)}
        </g>
      ))}
      <path d="M2 94 h86" stroke="#c6922c" strokeWidth="2" strokeLinecap="round" />
      {lit && <circle cx="45" cy="60" r="30" fill="url(#rk-glow)" />}
      <defs>
        <radialGradient id="rk-glow"><stop offset="0" stopColor="#f6e3a1" stopOpacity=".55" /><stop offset="1" stopColor="#f6e3a1" stopOpacity="0" /></radialGradient>
      </defs>
    </svg>
  )
}

/** The journey line: petals behind them, the mandap ahead.
 *  `progress` is 0–100; at 100 they have arrived. */
export function JourneyTrack({ progress = 0, start = 'Today', end, coupleHeight = 92, tone = 'white' }) {
  const p = Math.max(0, Math.min(100, progress))
  const arrived = p >= 100
  // keep the couple clear of the mandap until they arrive
  const at = arrived ? 100 : Math.min(p, 86)
  return (
    <div className="relative select-none" style={{ height: coupleHeight * (arrived ? 1.3 : 1) + 46 }} role="img"
         aria-label={arrived ? 'The couple have arrived at the mandap' : `The couple are ${Math.round(p)}% of the way to the celebration`}>
      <div className="absolute bottom-8 right-0"><Mandap height={coupleHeight * (arrived ? 1.3 : 0.9)} lit={arrived} /></div>
      {/* the path */}
      <div className={`absolute bottom-8 left-0 right-0 h-1.5 rounded-full ${tone === 'white' ? 'bg-white' : 'bg-sand-200'}`} />
      <div className="absolute bottom-8 left-0 h-1.5 rounded-full bg-gradient-to-r from-blush-300 via-blush-500 to-gold-400 transition-[width] duration-1000 ease-out" style={{ width: `${at}%` }} />
      {/* petals scattered on the road behind them */}
      {Array.from({ length: 9 }).map((_, i) => {
        const x = (i + 0.5) * (at / 9)
        return <span key={i} className="absolute bottom-[1.85rem] h-1.5 w-2.5 rounded-full bg-blush-400/70" style={{ left: `${x}%`, transform: `rotate(${(i * 47) % 90 - 45}deg) translateY(${i % 2 ? -3 : 3}px)` }} />
      })}
      {/* the two of them */}
      {arrived ? (
        // framed between the mandap's pillars (mandap is 0.9 × its height wide)
        <div className="absolute bottom-[1.6rem]" style={{ right: (coupleHeight * 1.3 * 0.9 - coupleHeight * 0.8) / 2 }}>
          <WalkingCouple height={coupleHeight} walking={false} />
        </div>
      ) : (
        <div className="absolute bottom-[1.6rem] transition-[left] duration-1000 ease-out" style={{ left: `${at}%`, transform: 'translateX(-50%)' }}>
          <WalkingCouple height={coupleHeight} walking />
        </div>
      )}
      <span className="absolute bottom-0 left-0 text-[11px] font-medium text-ink-faint">{start}</span>
      {end && <span className="absolute bottom-0 right-0 text-[11px] font-medium text-ink-faint">{end}</span>}
    </div>
  )
}

/** The enquiry page's welcome scene: a path, lanterns, and the couple
 *  walking towards the mandap in a slow loop. */
export function CoupleScene() {
  return (
    <div className="relative mx-auto h-64 w-full max-w-[21rem] overflow-hidden rounded-[2rem] border border-white/20 bg-gradient-to-b from-blush-900/40 via-blush-800/30 to-gold-500/20 shadow-2xl backdrop-blur-md"
         role="img" aria-label="An illustrated bride and groom walking together towards the mandap">
      <span className="absolute -left-6 top-6 h-24 w-24 rounded-full bg-gold-300/25 blur-2xl" />
      <span className="absolute -right-8 bottom-6 h-28 w-28 rounded-full bg-blush-300/30 blur-2xl" />
      <p className="absolute left-5 top-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-100">Your celebration starts here</p>
      {/* hanging lanterns */}
      {[18, 46, 74].map((x, i) => (
        <span key={x} className="rk-lantern absolute top-0 flex flex-col items-center" style={{ left: `${x}%`, animationDelay: `${i * 0.6}s` }}>
          <span className="h-8 w-px bg-gold-200/60" />
          <span className="h-4 w-3 rounded-sm bg-gradient-to-b from-gold-300 to-gold-500 shadow-[0_0_14px_4px_rgba(231,200,124,.45)]" />
        </span>
      ))}
      {/* falling petals */}
      {Array.from({ length: 8 }).map((_, i) => (
        <span key={i} className="rk-petal absolute top-0 h-2 w-3 rounded-full bg-blush-300/80" style={{ left: `${8 + i * 11}%`, animationDelay: `${(i * 0.9) % 5}s`, animationDuration: `${6 + (i % 3)}s` }} />
      ))}
      <div className="absolute bottom-7 right-4"><Mandap height={92} lit /></div>
      <div className="absolute bottom-6 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-gold-200/80 to-gold-200/30" />
      <div className="rk-stroll absolute bottom-6">
        <WalkingCouple height={118} />
      </div>
    </div>
  )
}
