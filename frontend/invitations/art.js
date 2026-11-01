/** Wedding invitation artwork, drawn on a canvas.
 *
 *  Everything is drawn in a fixed 1500 × 2100 space — a 5 × 7 inch card at
 *  300 dpi — and scaled to whatever canvas it is given, so the small preview
 *  and the print file are the same picture. Nothing here is a downloaded
 *  image: the ornaments are drawn from shapes, so they stay sharp at any size.
 */

export const W = 1500
export const H = 2100

export const FONTS = {
  script: '"Great Vibes", "Snell Roundhand", "Apple Chancery", cursive',
  caps: 'Cinzel, "Trajan Pro", Georgia, serif',
  serif: '"Cormorant Garamond", Georgia, serif',
}

/** Make sure the web fonts are in before drawing — a canvas will not wait. */
export async function loadFonts() {
  if (!document.fonts?.load) return
  const want = [
    `400 80px ${FONTS.script}`, `600 60px ${FONTS.caps}`, `500 60px ${FONTS.serif}`,
    `italic 500 60px ${FONTS.serif}`, `700 60px ${FONTS.serif}`,
  ]
  try { await Promise.all(want.map((f) => document.fonts.load(f))) } catch { /* fall back to system fonts */ }
}

// ---- small helpers ---------------------------------------------------------
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function goldFill(ctx, y0, y1, tones = ['#9c6f25', '#f6e3a1', '#c99b45', '#f1d58a', '#8a6122']) {
  const g = ctx.createLinearGradient(0, y0, 0, y1)
  tones.forEach((c, i) => g.addColorStop(i / (tones.length - 1), c))
  return g
}

function spaced(ctx, text, x, y, spacing) {
  // centred text with letter-spacing, drawn one glyph at a time
  const chars = [...text]
  const widths = chars.map((ch) => ctx.measureText(ch).width)
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1)
  let cx = x - total / 2
  const align = ctx.textAlign
  ctx.textAlign = 'left'
  chars.forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += widths[i] + spacing })
  ctx.textAlign = align
  return total
}

/** Wrap into as few lines as fit, then even the lines out so the last one
 *  is not a single stranded word. */
function wrapBalanced(ctx, text, maxWidth) {
  const lines = wrap(ctx, text, maxWidth)
  if (lines.length < 2) return lines
  const full = ctx.measureText(String(text)).width
  let width = full / lines.length
  for (let i = 0; i < 40; i++) {
    const tryLines = wrap(ctx, text, width)
    if (tryLines.length <= lines.length) return tryLines
    width += 12
  }
  return lines
}

function wrap(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w } else line = test
  }
  if (line) lines.push(line)
  return lines
}

/** Shrink a font until the text fits the width. */
function fit(ctx, text, font, size, maxWidth) {
  let s = size
  ctx.font = font(s)
  while (ctx.measureText(text).width > maxWidth && s > 20) { s -= 4; ctx.font = font(s) }
  return s
}

function leaf(ctx, x, y, len, angle, fill) {
  ctx.save()
  ctx.translate(x, y); ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0)
  ctx.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.restore()
}

function flower(ctx, x, y, r, petals, petal, centre) {
  ctx.save()
  ctx.translate(x, y)
  for (let i = 0; i < petals; i++) {
    ctx.rotate((Math.PI * 2) / petals)
    ctx.beginPath()
    ctx.ellipse(0, -r * 0.55, r * 0.36, r * 0.6, 0, 0, Math.PI * 2)
    ctx.fillStyle = petal
    ctx.fill()
  }
  ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2); ctx.fillStyle = centre; ctx.fill()
  ctx.restore()
}

function mandala(ctx, x, y, r, stroke, fillSoft) {
  ctx.save()
  ctx.translate(x, y)
  ctx.lineWidth = 3
  ctx.strokeStyle = stroke
  // outer scalloped ring
  const n = 24
  ctx.beginPath()
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const a2 = ((i + 0.5) / n) * Math.PI * 2
    const p = [Math.cos(a) * r, Math.sin(a) * r]
    const c = [Math.cos(a2) * r * 1.09, Math.sin(a2) * r * 1.09]
    if (i === 0) ctx.moveTo(...p)
    else ctx.quadraticCurveTo(c[0], c[1], p[0], p[1])
  }
  ctx.stroke()
  // petals
  for (const [count, len, wid, rr] of [[16, r * 0.42, r * 0.12, r * 0.55], [8, r * 0.3, r * 0.14, r * 0.3]]) {
    for (let i = 0; i < count; i++) {
      ctx.save()
      ctx.rotate((i / count) * Math.PI * 2)
      ctx.beginPath()
      ctx.ellipse(0, -rr, wid, len / 2, 0, 0, Math.PI * 2)
      ctx.fillStyle = fillSoft
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
  }
  ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.stroke()
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2
    ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92, 3.2, 0, Math.PI * 2)
    ctx.fillStyle = stroke; ctx.fill()
  }
  ctx.restore()
}

function initials(c) {
  return [c.partner_a, c.partner_b].map((n) => (n || '').trim()[0] || '').filter(Boolean)
}

// ---- the four designs --------------------------------------------------------
const royal = {
  id: 'royal',
  name: 'Royal maroon & gold',
  blurb: 'Rajputana arch, mandala and gold foil',
  swatch: ['#5a0f1e', '#d9ae4d', '#f6e7c8'],
  ink: '#f6e7c8',
  soft: 'rgba(246, 231, 200, .78)',
  accent: (ctx, y0, y1) => goldFill(ctx, y0, y1),
  background(ctx) {
    const g = ctx.createRadialGradient(W / 2, H * 0.42, 100, W / 2, H / 2, H * 0.75)
    g.addColorStop(0, '#7a1a2c'); g.addColorStop(0.6, '#5a0f1e'); g.addColorStop(1, '#320610')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    // faint damask of tiny gold quatrefoils
    ctx.save(); ctx.globalAlpha = 0.07; ctx.fillStyle = '#e7c87c'
    for (let y = 40; y < H; y += 90) {
      for (let x = (y / 90) % 2 ? 40 : 85; x < W; x += 90) {
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(x + Math.cos(k * Math.PI / 2) * 9, y + Math.sin(k * Math.PI / 2) * 9, 7, 0, Math.PI * 2); ctx.fill() }
      }
    }
    ctx.restore()
  },
  decor(ctx, c) {
    const gold = goldFill(ctx, 0, H)
    ctx.strokeStyle = gold
    ctx.lineWidth = 10; ctx.strokeRect(54, 54, W - 108, H - 108)
    ctx.lineWidth = 3; ctx.strokeRect(84, 84, W - 168, H - 168)
    // corner fans
    for (const [x, y, a] of [[84, 84, 0], [W - 84, 84, Math.PI / 2], [W - 84, H - 84, Math.PI], [84, H - 84, -Math.PI / 2]]) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a)
      for (let i = 0; i < 5; i++) {
        ctx.save(); ctx.rotate(-(i / 4) * (Math.PI / 2))
        ctx.beginPath(); ctx.ellipse(0, 70, 16, 46, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(217,174,77,.35)'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = gold; ctx.stroke()
        ctx.restore()
      }
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fillStyle = gold; ctx.fill()
      ctx.restore()
    }
    // the jharokha arch
    ctx.save()
    ctx.lineWidth = 4; ctx.strokeStyle = gold
    ctx.beginPath()
    ctx.moveTo(300, 760)
    ctx.lineTo(300, 430)
    ctx.bezierCurveTo(300, 250, 560, 210, W / 2, 140)
    ctx.bezierCurveTo(940, 210, 1200, 250, 1200, 430)
    ctx.lineTo(1200, 760)
    ctx.stroke()
    ctx.restore()
    mandala(ctx, W / 2, 400, 165, gold, 'rgba(217,174,77,.14)')
    // monogram
    const [a, b] = initials(c)
    ctx.fillStyle = gold; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `600 78px ${FONTS.caps}`
    ctx.fillText(a ? `${a}${b ? ' · ' + b : ''}` : '✦', W / 2, 404)
    // lotus row at the foot
    ctx.fillStyle = gold
    for (let i = -3; i <= 3; i++) {
      ctx.save(); ctx.translate(W / 2 + i * 70, H - 170); ctx.rotate(Math.PI / 4)
      ctx.fillRect(-7, -7, 14, 14); ctx.restore()
    }
  },
}

const ivory = {
  id: 'ivory',
  name: 'Ivory & gold leaf',
  blurb: 'Quiet, classic, laurel monogram',
  swatch: ['#fbf6ec', '#c6922c', '#3b3127'],
  ink: '#3b3127',
  soft: 'rgba(59, 49, 39, .72)',
  accent: (ctx, y0, y1) => goldFill(ctx, y0, y1, ['#8a6122', '#c99b45', '#9c6f25', '#d4ab55', '#7d581d']),
  background(ctx) {
    ctx.fillStyle = '#fbf6ec'; ctx.fillRect(0, 0, W, H)
    const r = rng(7)
    ctx.fillStyle = 'rgba(120, 90, 40, .045)'
    for (let i = 0; i < 2600; i++) ctx.fillRect(r() * W, r() * H, 2, 2)
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8)
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(160,120,60,.12)')
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H)
  },
  decor(ctx, c) {
    const gold = this.accent(ctx, 0, H)
    ctx.strokeStyle = gold; ctx.lineWidth = 3
    const m = 90, rr = 46
    ctx.beginPath()
    ctx.moveTo(m + rr, m); ctx.lineTo(W - m - rr, m); ctx.arcTo(W - m, m, W - m, m + rr, rr)
    ctx.lineTo(W - m, H - m - rr); ctx.arcTo(W - m, H - m, W - m - rr, H - m, rr)
    ctx.lineTo(m + rr, H - m); ctx.arcTo(m, H - m, m, H - m - rr, rr)
    ctx.lineTo(m, m + rr); ctx.arcTo(m, m, m + rr, m, rr)
    ctx.stroke()
    ctx.lineWidth = 1.2; ctx.strokeRect(m + 22, m + 22, W - 2 * (m + 22), H - 2 * (m + 22))
    // corner sprigs
    for (const [x, y, a] of [[m + 30, m + 30, 0], [W - m - 30, m + 30, Math.PI / 2], [W - m - 30, H - m - 30, Math.PI], [m + 30, H - m - 30, -Math.PI / 2]]) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a)
      ctx.strokeStyle = gold; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(90, 20, 210, 10); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(20, 90, 10, 210); ctx.stroke()
      for (let i = 1; i <= 6; i++) {
        const t = i * 32
        const side = i % 2 ? -1 : 1
        leaf(ctx, t, 4 + t * 0.03, 44 - i * 3, side * 0.9 - 0.15, gold)
        leaf(ctx, 4 + t * 0.03, t, 44 - i * 3, Math.PI / 2 - side * 0.9 + 0.15, gold)
      }
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fillStyle = gold; ctx.fill()
      ctx.restore()
    }
    // laurel monogram
    const cx = W / 2, cy = 420
    ctx.beginPath(); ctx.arc(cx, cy, 120, 0, Math.PI * 2); ctx.lineWidth = 2.5; ctx.strokeStyle = gold; ctx.stroke()
    for (const side of [-1, 1]) {
      for (let i = 0; i < 11; i++) {
        const a = Math.PI / 2 + side * (0.35 + i * 0.21)
        const x = cx + Math.cos(a) * 168, y = cy + Math.sin(a) * 168
        leaf(ctx, x, y, 52, a + side * 1.9, gold)
      }
    }
    const [a, b] = initials(c)
    ctx.fillStyle = gold; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `400 120px ${FONTS.script}`
    ctx.fillText(a && b ? `${a}${b}` : a || '♡', cx, cy + 6)
  },
}

const garden = {
  id: 'garden',
  name: 'Pastel garden',
  blurb: 'Watercolour blooms and a floral wreath',
  swatch: ['#f3c6d3', '#c9dcc0', '#fdf7f4'],
  ink: '#5b3a46',
  soft: 'rgba(91, 58, 70, .75)',
  accent: (ctx, y0, y1) => goldFill(ctx, y0, y1, ['#a6435c', '#c97f93', '#a6435c']),
  background(ctx) {
    ctx.fillStyle = '#fdf8f5'; ctx.fillRect(0, 0, W, H)
    const r = rng(21)
    const blob = (x, y, rad, col) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill()
    }
    for (let i = 0; i < 9; i++) blob(r() * 520, r() * 520, 180 + r() * 200, i % 2 ? 'rgba(243,198,211,.55)' : 'rgba(201,220,192,.5)')
    for (let i = 0; i < 9; i++) blob(W - r() * 520, H - r() * 520, 180 + r() * 200, i % 2 ? 'rgba(201,220,192,.5)' : 'rgba(246,212,190,.55)')
  },
  decor(ctx, c) {
    const r = rng(5)
    const cluster = (cx, cy, spread, n) => {
      for (let i = 0; i < n * 2; i++) {
        const a = r() * Math.PI * 2, d = r() * spread
        leaf(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 60 + r() * 50, r() * Math.PI * 2, r() > 0.5 ? 'rgba(122,156,112,.75)' : 'rgba(160,190,150,.7)')
      }
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, d = r() * spread * 0.8
        const pink = ['#f0b3c3', '#e991a8', '#f7c9b0', '#fbe0e6'][Math.floor(r() * 4)]
        flower(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 34 + r() * 30, 5 + Math.floor(r() * 3), pink, '#e7c87c')
      }
    }
    cluster(150, 150, 190, 9)
    cluster(W - 150, H - 150, 190, 9)
    cluster(W - 110, 260, 90, 3)
    cluster(110, H - 260, 90, 3)
    // wreath
    const cx = W / 2, cy = 430, R = 175
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2
      leaf(ctx, cx + Math.cos(a) * R, cy + Math.sin(a) * R, 54, a + Math.PI / 2 + (i % 2 ? 0.5 : -0.5), i % 3 ? 'rgba(122,156,112,.85)' : 'rgba(160,190,150,.85)')
    }
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.2
      flower(ctx, cx + Math.cos(a + Math.PI) * R, cy - Math.sin(a + Math.PI) * R, 26, 5, '#f0b3c3', '#e7c87c')
    }
    const [a, b] = initials(c)
    ctx.fillStyle = '#a6435c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `400 104px ${FONTS.script}`
    ctx.fillText(a && b ? `${a}&${b}` : a || '♡', cx, cy + 8)
  },
}

const marigold = {
  id: 'marigold',
  name: 'Midnight marigold',
  blurb: 'Marigold toran, fairy lights, night sky',
  swatch: ['#141a30', '#e8870e', '#d9ae4d'],
  ink: '#f2e6cf',
  soft: 'rgba(242, 230, 207, .78)',
  accent: (ctx, y0, y1) => goldFill(ctx, y0, y1, ['#e8a33a', '#fbe3a2', '#d9ae4d', '#f6c35a', '#c6922c']),
  background(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#1e2543'); g.addColorStop(1, '#0a0e1c')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    const r = rng(11)
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(255, 240, 210, ${0.15 + r() * 0.5})`
      ctx.beginPath(); ctx.arc(r() * W, 380 + r() * (H - 380), r() * 2.4, 0, Math.PI * 2); ctx.fill()
    }
  },
  decor(ctx, c) {
    const r = rng(3)
    // fairy lights
    ctx.strokeStyle = 'rgba(242,230,207,.35)'; ctx.lineWidth = 2
    for (const sag of [140, 210]) {
      ctx.beginPath(); ctx.moveTo(0, 40); ctx.quadraticCurveTo(W / 2, 40 + sag * 2, W, 40); ctx.stroke()
      for (let i = 1; i < 22; i++) {
        const t = i / 22, x = W * t, y = (1 - t) * (1 - t) * 40 + 2 * (1 - t) * t * (40 + sag * 2) + t * t * 40
        const glow = ctx.createRadialGradient(x, y + 10, 0, x, y + 10, 26)
        glow.addColorStop(0, 'rgba(255,214,120,.95)'); glow.addColorStop(1, 'rgba(255,214,120,0)')
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y + 10, 26, 0, Math.PI * 2); ctx.fill()
      }
    }
    // marigold toran strands
    const strands = 13
    for (let s = 0; s < strands; s++) {
      const x = 80 + (s * (W - 160)) / (strands - 1)
      const len = 6 + Math.round(Math.abs(Math.sin((s / (strands - 1)) * Math.PI)) * 5) + Math.floor(r() * 2)
      ctx.strokeStyle = 'rgba(122,156,112,.8)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, len * 34); ctx.stroke()
      for (let k = 0; k < len; k++) {
        const y = 24 + k * 34
        const col = (k + s) % 3 === 0 ? '#f4b41a' : '#e8870e'
        flower(ctx, x, y, 22, 9, col, (k + s) % 3 === 0 ? '#e8870e' : '#c25d07')
      }
      leaf(ctx, x, len * 34 + 4, 40, Math.PI / 2 - 0.4, '#5f8f5a')
      leaf(ctx, x, len * 34 + 4, 40, Math.PI / 2 + 0.4, '#4f7a4b')
    }
    // gold frame below the garland
    const gold = this.accent(ctx, 0, H)
    ctx.strokeStyle = gold; ctx.lineWidth = 3
    ctx.strokeRect(70, 520, W - 140, H - 590)
    // diamond monogram
    const cx = W / 2, cy = 640
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4)
    ctx.fillStyle = '#141a30'; ctx.fillRect(-92, -92, 184, 184)
    ctx.lineWidth = 4; ctx.strokeRect(-92, -92, 184, 184); ctx.lineWidth = 1.5; ctx.strokeRect(-76, -76, 152, 152)
    ctx.restore()
    const [a, b] = initials(c)
    ctx.fillStyle = gold; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `600 70px ${FONTS.caps}`
    ctx.fillText(a && b ? `${a}${b}` : a || '✦', cx, cy + 4)
  },
}

export const DESIGNS = [royal, ivory, garden, marigold]
export const designById = (id) => DESIGNS.find((d) => d.id === id) || royal

// ---- wording ------------------------------------------------------------------
export function longDate(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function niceTime(hhmm) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h)) return ''
  const hr = ((h + 11) % 12) + 1
  const clock = m ? `${hr}:${String(m).padStart(2, '0')}` : `${hr} o’clock`
  const part = h < 12 ? 'in the morning' : h < 17 ? 'in the afternoon' : 'in the evening'
  return `${clock} ${part}`
}

function dateNumbers(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d} · ${m} · ${y}`
}

// ---- the card itself ------------------------------------------------------------
/**
 * card: { kind: 'main' | 'save' | 'event', event?: {...} }
 * c: the invitation content; guest: optional guest name for this copy
 */
export function drawInvitation(canvas, designId, c, card, guest = '') {
  const d = designById(designId)
  const ctx = canvas.getContext('2d')
  const k = canvas.width / W
  ctx.setTransform(k, 0, 0, k, 0, 0)
  ctx.clearRect(0, 0, W, H)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  d.background(ctx)
  d.decor(ctx, c)

  const top = d.id === 'marigold' ? 800 : 700
  const maxW = 1040
  const ink = d.ink
  const gold = d.accent(ctx, 0, H)
  const caps = (s) => `600 ${s}px ${FONTS.caps}`
  const script = (s) => `400 ${s}px ${FONTS.script}`
  const serif = (s, style = '') => `${style} 500 ${s}px ${FONTS.serif}`.trim()
  let y = top

  const line = (text, font, colour, size, gap) => {
    if (!text) return
    ctx.font = font(size); ctx.fillStyle = colour
    ctx.fillText(text, W / 2, y); y += gap
  }
  const capsLine = (text, size, gap, spacing = 8, colour = ink) => {
    if (!text) return
    ctx.font = caps(size); ctx.fillStyle = colour
    spaced(ctx, text.toUpperCase(), W / 2, y, spacing); y += gap
  }
  const para = (text, size, gap, colour = d.soft) => {
    if (!text) return
    ctx.font = serif(size, 'italic'); ctx.fillStyle = colour
    for (const l of wrapBalanced(ctx, text, maxW)) { ctx.fillText(l, W / 2, y); y += size * 1.3 }
    y += gap - size * 1.3
  }
  const divider = () => {
    ctx.strokeStyle = gold; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(W / 2 - 220, y); ctx.lineTo(W / 2 - 30, y); ctx.moveTo(W / 2 + 30, y); ctx.lineTo(W / 2 + 220, y); ctx.stroke()
    ctx.save(); ctx.translate(W / 2, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = gold; ctx.fillRect(-10, -10, 20, 20); ctx.restore()
    y += 90
  }
  const names = (size) => {
    const a = c.partner_a || 'Partner', b = c.partner_b || 'Partner'
    const s = Math.min(fit(ctx, a, script, size, maxW), fit(ctx, b, script, size, maxW))
    line(a, script, gold, s, s * 0.78)
    line('&', script, gold, s * 0.55, s * 0.78)
    line(b, script, gold, s, s * 0.62)
  }

  if (guest) { line(`Dear ${guest},`, script, d.soft, 64, 96) }

  if (card.kind === 'main') {
    capsLine(c.blessing, 30, 170, 7, d.soft)
    names(176)
    para(c.invite_line, 46, 110)
    divider()
    capsLine(longDate(c.date), 40, 64, 6)
    line(niceTime(c.time), serif, d.soft, 40, 100)
    line(c.venue, (s) => `600 ${s}px ${FONTS.serif}`, ink, fit(ctx, c.venue || '', (s) => `600 ${s}px ${FONTS.serif}`, 54, maxW), 66)
    capsLine(c.city, 30, 0, 10, d.soft)
  } else if (card.kind === 'save') {
    y += 40
    line('Save the Date', script, gold, 190, 190)
    capsLine(`${c.partner_a || ''} & ${c.partner_b || ''}`, 52, 120, 10)
    divider()
    ctx.font = caps(112); ctx.fillStyle = gold
    ctx.fillText(dateNumbers(c.date), W / 2, y + 40); y += 190
    capsLine(c.city, 38, 90, 12, d.soft)
    para('Formal invitation to follow', 44, 0)
  } else {
    const e = card.event || {}
    capsLine('You are invited to the', 30, 210, 7, d.soft)
    const s = fit(ctx, e.name || 'Celebration', script, 200, maxW)
    line(e.name || 'Celebration', script, gold, s, 150)
    capsLine(`of ${c.partner_a || ''} & ${c.partner_b || ''}`, 40, 110, 8)
    para(e.note, 46, 110)
    divider()
    capsLine(longDate(e.date), 40, 64, 6)
    line(niceTime(e.time), serif, d.soft, 40, 100)
    if (e.venue) line(e.venue, (sz) => `600 ${sz}px ${FONTS.serif}`, ink, fit(ctx, e.venue, (sz) => `600 ${sz}px ${FONTS.serif}`, 52, maxW), 80)
    if (e.dress) para(`Dress code · ${e.dress}`, 38, 0)
  }

  // RSVP sits at the foot of every card
  if (c.rsvp && card.kind !== 'save') {
    ctx.font = caps(26); ctx.fillStyle = d.soft
    spaced(ctx, c.rsvp.toUpperCase(), W / 2, H - (d.id === 'royal' ? 230 : d.id === 'marigold' ? 130 : 190), 5)
  }
}

/** The card as a JPEG data URL at full print size. */
export function renderJpeg(designId, c, card, guest = '', scale = 1) {
  const cv = document.createElement('canvas')
  cv.width = Math.round(W * scale); cv.height = Math.round(H * scale)
  drawInvitation(cv, designId, c, card, guest)
  return cv.toDataURL('image/jpeg', 0.92)
}
