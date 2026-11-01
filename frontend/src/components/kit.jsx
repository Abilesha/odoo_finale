import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ErrorBox, Modal } from './ui'

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** A clock that ticks.  One per component that needs it, so a countdown on a
 *  card never re-renders the whole page. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

function split(msLeft) {
  const s = Math.max(0, Math.floor(msLeft / 1000))
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  }
}

const pad = (n) => String(n).padStart(2, '0')

/** Live countdown to an ISO time.
 *  size: 'hero' (the manager's next event), 'md' or 'sm' (inline on cards). */
export function Countdown({ to, size = 'md', tone = 'light', doneLabel = 'Happening now' }) {
  const now = useNow(1000)
  const target = useMemo(() => new Date(to).getTime(), [to])
  const left = target - now
  if (!to) return null
  if (left <= 0) {
    return (
      <span className={`inline-flex items-center gap-2 font-semibold ${
        tone === 'dark' ? 'text-gold-300' : 'text-sage-700'}`}>
        <span className="h-2 w-2 animate-pulseDot rounded-full bg-current" />
        {doneLabel}
      </span>
    )
  }
  const { d, h, m, s } = split(left)

  if (size === 'sm') {
    return (
      <span className="tnum font-mono text-xs">
        {d > 0 && <>{d}d </>}{pad(h)}:{pad(m)}:{pad(s)}
      </span>
    )
  }

  const units = [
    ['days', d], ['hrs', h], ['min', m], ['sec', s],
  ]
  const hero = size === 'hero'
  return (
    <div className={`flex items-end ${hero ? 'gap-1.5 sm:gap-4' : 'gap-2'}`}>
      {units.map(([label, v], i) => (
        <div key={label} className={`flex items-end ${hero ? 'gap-1.5 sm:gap-4' : 'gap-2'}`}>
          <div className="text-center">
            <div className={`tnum font-display font-semibold leading-none ${
              hero ? 'text-4xl sm:text-6xl' : 'text-2xl'
            } ${tone === 'dark' ? 'text-sand-50' : 'text-ink'}`}>
              {label === 'days' ? v : pad(v)}
            </div>
            <div className={`mt-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${
              tone === 'dark' ? 'text-night-300' : 'text-ink-faint'}`}>
              {label}
            </div>
          </div>
          {i < units.length - 1 && (
            <span className={`pb-5 font-display ${hero ? 'text-2xl sm:text-4xl' : 'text-xl'} ${
              tone === 'dark' ? 'text-gold-400/60' : 'text-sand-300'}`}>:</span>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Visuals
// ---------------------------------------------------------------------------

/** Progress ring — the founder reads twenty of these at a glance. */
export function Ring({ value = 0, size = 64, stroke = 6, tone = 'plum', label, sub }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, value || 0))
  const colors = {
    plum: '#7a4169', good: '#4b7356', warn: '#c6922c', bad: '#b15030',
    jade: '#2f6e58', night: '#3c4772', gold: '#d9ae4d',
  }
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ebe5db" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors[tone] || colors.plum}
                strokeWidth={stroke} strokeLinecap="round"
                strokeDasharray={c} strokeDashoffset={c - (c * v) / 100}
                style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="tnum text-sm font-semibold text-ink">{label ?? `${Math.round(v)}%`}</span>
        {sub && <span className="mt-0.5 text-[9px] uppercase tracking-wider text-ink-faint">{sub}</span>}
      </div>
    </div>
  )
}

export const initials = (name = '') =>
  name.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

export function Avatar({ name, src, size = 'md', tone = 'plum', ring = false }) {
  const sizes = { sm: 'h-7 w-7 text-[10px]', md: 'h-10 w-10 text-xs', lg: 'h-14 w-14 text-base', xl: 'h-28 w-28 text-3xl' }
  const tones = {
    plum: 'bg-plum-100 text-plum-700',
    gold: 'bg-gold-400 text-plum-900',
    night: 'bg-night-100 text-night-700',
    jade: 'bg-jade-100 text-jade-700',
    blush: 'bg-blush-100 text-blush-700',
  }
  const edge = ring ? 'ring-4 ring-white shadow-lift' : ''
  if (src) {
    return <img src={src} alt={name ? `Photo of ${name}` : ''} className={`shrink-0 rounded-full object-cover ${sizes[size]} ${edge}`} />
  }
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${sizes[size]} ${tones[tone]} ${edge}`}>
      {initials(name)}
    </span>
  )
}

const HEALTH_TONE = {
  'On track': 'bg-sage-100 text-sage-700',
  'Needs attention': 'bg-gold-100 text-gold-700',
  'At risk': 'bg-rust-100 text-rust-700',
  'On Track': 'bg-sage-100 text-sage-700',
  'Delayed': 'bg-gold-100 text-gold-700',
  'Blocked': 'bg-rust-100 text-rust-700',
  'Completed': 'bg-plum-100 text-plum-700',
  'Not started': 'bg-sand-200 text-ink-soft',
}

export function HealthPill({ value }) {
  return (
    <span className={`pill ${HEALTH_TONE[value] || 'bg-sand-200 text-ink-soft'}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {value}
    </span>
  )
}

/** Page header used across all three portals. */
export function PageHead({ eyebrow, title, sub, action }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-600">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-3xl text-ink sm:text-4xl">{title}</h1>
        {sub && <p className="mt-1.5 max-w-2xl text-sm text-ink-faint">{sub}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </header>
  )
}

/** A predictable return path for screens opened from a direct/shared link.
 *
 * Browser history is preferred, but a fallback prevents a direct URL visit
 * from leaving people on an empty browser page when they press Back.
 */
export function BackButton({ fallback = '/', label = 'Back', tone = 'light', className = '' }) {
  const navigate = useNavigate()
  const goBack = () => {
    // react-router numbers its own history entries; 0 means this tab was
    // opened straight onto this page, so there is nothing of ours to go back to
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1)
    else navigate(fallback)
  }
  const look = tone === 'dark'
    ? 'border-white/30 bg-white/10 text-white hover:bg-white/20 hover:border-white/50'
    : 'border-sand-300 bg-white text-ink shadow-sm hover:border-blush-300 hover:bg-blush-50'
  return (
    <button type="button" onClick={goBack}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold backdrop-blur transition ${look} ${className}`}>
      <span aria-hidden className="text-base leading-none">←</span>{label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// The one edit form
// ---------------------------------------------------------------------------

/** Every "Edit" button in the system opens this.
 *
 *  fields: [{ name, label, type: text|number|date|time|select|textarea|email|password,
 *             options: [str | {value,label}], help, full, required, min, max, step }]
 *  Only fields whose value actually changed are sent, so editing the venue
 *  never accidentally rewrites the fee.
 */
export function EditModal({ open, onClose, title, subtitle, fields, initial = {}, onSubmit,
                            submitLabel = 'Save changes', wide = false, sendAll = false }) {
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!open) return
    const v = {}
    for (const f of fields) {
      const raw = initial[f.name]
      v[f.name] = raw == null ? '' : String(raw)
    }
    setValues(v)
    setErr(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // an emptied field is sent as null, so clearing a phone number clears it
  function coerce(f, raw) {
    if (f.type === 'checkbox') return raw === 'true'
    if (raw === '' || raw == null) return null
    if (f.type === 'number' || f.numeric) return Number(raw)
    return raw
  }

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const patch = {}
    for (const f of fields) {
      const before = initial[f.name] == null ? '' : String(initial[f.name])
      if (sendAll || values[f.name] !== before) patch[f.name] = coerce(f, values[f.name])
    }
    for (const f of fields) {
      if (f.required && (patch[f.name] === null || patch[f.name] === '')) {
        setErr(new Error(`${f.label} is required`)); setBusy(false); return
      }
    }
    if (!Object.keys(patch).length) { onClose(); setBusy(false); return }
    try {
      await onSubmit(patch)
      onClose()
    } catch (e2) { setErr(e2) } finally { setBusy(false) }
  }

  const set = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.type === 'checkbox' ? String(e.target.checked) : e.target.value }))

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} wide={wide}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.name} className={f.full || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
              {f.type !== 'checkbox' && <label className="label" htmlFor={`f-${f.name}`}>{f.label}</label>}
              {f.type === 'select' ? (
                <select id={`f-${f.name}`} className="input" value={values[f.name] ?? ''} onChange={set(f.name)}>
                  {f.placeholder !== false && <option value="">{f.placeholder || '—'}</option>}
                  {f.options.map((o) => {
                    const opt = typeof o === 'object' ? o : { value: o, label: o }
                    return <option key={opt.value} value={opt.value}>{opt.label}</option>
                  })}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea id={`f-${f.name}`} rows={f.rows || 3} className="input" value={values[f.name] ?? ''}
                          onChange={set(f.name)} placeholder={f.placeholder} />
              ) : f.type === 'checkbox' ? (
                <label className="flex items-center gap-2 pt-6 text-sm text-ink-soft">
                  <input type="checkbox" checked={values[f.name] === 'true'} onChange={set(f.name)}
                         className="h-4 w-4 rounded border-sand-300 text-plum-600" />
                  {f.label}
                </label>
              ) : (
                <input id={`f-${f.name}`} className="input" type={f.type || 'text'} value={values[f.name] ?? ''}
                       onChange={set(f.name)} placeholder={f.placeholder} min={f.min} max={f.max}
                       step={f.step || (f.type === 'number' ? 'any' : undefined)} />
              )}
              {f.help && <p className="mt-1 text-[11px] text-ink-faint">{f.help}</p>}
            </div>
          ))}
        </div>
        <ErrorBox error={err} />
        <div className="flex justify-end gap-2 border-t border-sand-200 pt-4">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        </div>
      </form>
    </Modal>
  )
}

/** A small pencil button — the same affordance everywhere something can be edited. */
export function EditButton({ onClick, label = 'Edit', className = '' }) {
  return (
    <button type="button" onClick={onClick}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-faint transition-colors hover:bg-sand-200 hover:text-ink ${className}`}>
      <span aria-hidden>✎</span>{label}
    </button>
  )
}
