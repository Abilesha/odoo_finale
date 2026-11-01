import { useEffect, useState } from 'react'

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-ink-faint">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-sand-300 border-t-plum-600" />
      <span className="text-sm">{label}…</span>
    </div>
  )
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="card border-rust-400/40 bg-rust-100 p-4">
      <p className="text-sm font-medium text-rust-700">{String(error.message || error)}</p>
      {onRetry && (
        <button className="btn-ghost btn-sm mt-3" onClick={onRetry}>Try again</button>
      )}
    </div>
  )
}

export function Empty({ title, hint, action }) {
  return (
    <div className="card flex flex-col items-center gap-2 p-12 text-center">
      <p className="font-display text-xl text-ink">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-faint">{hint}</p>}
      {action}
    </div>
  )
}

/** Status pill with a palette shared across every screen. */
export function Pill({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-sand-200 text-ink-soft',
    plum:    'bg-plum-100 text-plum-700',
    gold:    'bg-gold-100 text-gold-700',
    good:    'bg-sage-100 text-sage-700',
    warn:    'bg-gold-100 text-gold-700',
    bad:     'bg-rust-100 text-rust-700',
    info:    'bg-plum-50 text-plum-600 border border-plum-200',
  }
  return <span className={`pill ${tones[tone] || tones.neutral}`}>{children}</span>
}

const STATUS_TONE = {
  // leads
  'New': 'info', 'Contacted': 'info', 'Meeting Booked': 'plum',
  'Agreement Sent': 'warn', 'Signed': 'good', 'Won': 'good', 'Lost': 'bad',
  // weddings
  'Planning': 'info', 'Execution': 'warn', 'Completed': 'good', 'Cancelled': 'bad',
  // tasks
  'To Plan': 'neutral', 'In Progress': 'warn', 'Blocked': 'bad', 'Done': 'good',
  // quotes / rfq
  'Awaiting Reply': 'neutral', 'Received': 'info', 'Awarded': 'good', 'Rejected': 'bad',
  'Draft': 'neutral', 'Sent': 'info', 'Comparing': 'warn',
  // bills
  'Matched': 'good', 'Variance': 'warn', 'Paid': 'plum',
  // run sheet
  'Pending': 'neutral', 'Arrived': 'good', 'Late': 'bad', 'Missed': 'bad',
  // milestones
  'Due': 'warn', 'Invoiced': 'info',
}

export function StatusPill({ status }) {
  return <Pill tone={STATUS_TONE[status] || 'neutral'}>{status}</Pill>
}

export function Card({ title, subtitle, action, children, className = '', pad = true }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-sand-200 px-5 py-4">
          <div>
            {title && <h2 className="text-lg text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, sub, tone = 'neutral', icon }) {
  const accents = {
    neutral: 'text-ink', good: 'text-sage-700',
    bad: 'text-rust-700', plum: 'text-plum-700', gold: 'text-gold-700',
  }
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        {icon && <span className="text-base leading-none">{icon}</span>}
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{label}</p>
      </div>
      <p className={`tnum mt-2 font-display text-2xl font-semibold ${accents[tone]}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-faint">{sub}</p>}
    </div>
  )
}

export function Modal({ open, onClose, title, subtitle, children, wide = false }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm sm:p-8">
      <div
        className={`card my-auto w-full shadow-lift ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-sand-200 px-5 py-4">
          <div>
            <h2 className="text-lg text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-xl leading-none text-ink-faint hover:text-ink">×</button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

/** Small toast for action feedback — judges need to see that something happened. */
export function useToast() {
  const [toast, setToast] = useState(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const node = toast && (
    <div className="fixed bottom-6 left-1/2 z-[60] w-[min(34rem,92vw)] -translate-x-1/2">
      <div className={`card flex items-start gap-3 px-4 py-3 shadow-lift ${
        toast.tone === 'bad' ? 'border-rust-400/50 bg-rust-100' : 'border-sage-400/40 bg-sage-100'
      }`}>
        <span className="mt-0.5 text-sm">{toast.tone === 'bad' ? '⚠' : '✓'}</span>
        <p className={`flex-1 text-sm ${toast.tone === 'bad' ? 'text-rust-700' : 'text-sage-700'}`}>
          {toast.message}
        </p>
        <button onClick={() => setToast(null)} className="text-ink-faint hover:text-ink">×</button>
      </div>
    </div>
  )
  return [node, setToast]
}

export function ProgressBar({ value, tone = 'plum' }) {
  const tones = { plum: 'bg-plum-500', good: 'bg-sage-400', gold: 'bg-gold-400' }
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sand-200">
      <div className={`h-full rounded-full transition-all ${tones[tone]}`}
           style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-sand-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            active === t.id
              ? 'border-plum-600 text-plum-700'
              : 'border-transparent text-ink-faint hover:text-ink-soft'
          }`}
        >
          {t.label}
          {t.count != null && (
            <span className="ml-2 rounded-full bg-sand-200 px-1.5 py-0.5 text-[10px] tnum">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}
