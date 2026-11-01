import { useState } from 'react'
import { Link } from 'react-router-dom'

import { date, relativeDays } from '../../api'
import { Ring } from '../../components/kit'
import { ErrorBox, ProgressBar, Spinner } from '../../components/ui'
import { useApi } from '../../hooks'
import { ClientHead, NotBookedYet } from './shared'

/** The couple's checklist — to watch, not to edit.
 *
 *  Their planner keeps every item up to date (including the few things that
 *  need the couple, ticked once the planner hears back), so what the couple
 *  sees is always the agency's own record of where things stand. Nothing on
 *  this page can be changed from the couple's side.
 */
const STAGE = {
  Done: { label: 'Done', dot: 'bg-sage-600 text-white', text: 'text-sage-700', mark: '✓' },
  'In Progress': { label: 'In progress', dot: 'bg-gold-400 text-white', text: 'text-gold-700', mark: '…' },
  Blocked: { label: 'Waiting', dot: 'bg-rust-400 text-white', text: 'text-rust-700', mark: '!' },
  'To Plan': { label: 'Coming up', dot: 'border-2 border-sand-300 bg-white', text: 'text-ink-faint', mark: '' },
}

export default function ClientChecklist() {
  const { data, error, loading, reload } = useApi('/api/client/checklist')
  const [open, setOpen] = useState(null)

  if (loading) return <Spinner label="Loading your checklist" />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (data.booked === false) return <NotBookedYet title="Your checklist opens once you are booked" planner={data.planner} />

  const planner = data.planner?.name || 'Your planner'
  const when = (t) => (t.done ? `done ${date(t.completed_at, { year: false })}`
    : t.days_left < 0 ? `${-t.days_left} days overdue` : t.days_left === 0 ? 'due today'
    : `by ${date(t.due_date, { year: false })}`)

  return (
    <div className="space-y-6">
      <ClientHead eyebrow="Checklist" title="Where everything stands"
                  sub={`${planner} keeps this up to date as the work moves. You can follow every step here — nothing needs ticking from your side.`} />

      {/* ---- at a glance ---- */}
      <section className="card flex flex-wrap items-center gap-6 p-5">
        <Ring value={Math.round((100 * data.total_done) / Math.max(data.total, 1))} size={76} tone="plum" />
        <div className="min-w-[12rem] flex-1">
          <p className="font-display text-2xl text-ink">{data.total_done} of {data.total} steps complete</p>
          <p className="text-sm text-ink-faint">{data.in_progress} in progress right now</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-blush-50 px-4 py-2 text-xs text-blush-800">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blush-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-blush-600" /></span>
          {data.last_update ? <>Last updated by {planner} · {relativeDays(data.last_update)}</> : <>Updates from {planner} will appear here</>}
        </div>
        <span className="pill bg-sand-100 text-ink-soft" title="Only your planner can change this list">◉ View only</span>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        {/* ---- what needs the couple ---- */}
        <section className="card overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-200 bg-blush-50 px-5 py-4">
            <div>
              <h2 className="text-xl text-ink">Things that need you</h2>
              <p className="text-xs text-ink-faint">{data.yours_done} of {data.yours.length} marked done by {planner}</p>
            </div>
            <div className="w-40"><ProgressBar value={(100 * data.yours_done) / Math.max(data.yours.length, 1)} tone="gold" /></div>
          </header>
          {data.yours.length === 0
            ? <p className="px-5 py-8 text-center text-sm text-ink-faint">Nothing is waiting on you right now.</p>
            : <ul className="divide-y divide-sand-200">
              {data.yours.map((t) => <TaskRow key={t.id} t={t} when={when(t)} />)}
            </ul>}
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-sand-200 bg-sand-50 px-5 py-3 text-xs text-ink-faint">
            <span>Finished one of these? Tell {planner.split(' ')[0]} and it will be ticked off here.</span>
            <Link to="/help" className="font-semibold text-blush-700 hover:underline">Message your planner →</Link>
          </footer>
        </section>

        {/* ---- the latest updates ---- */}
        <section className="card overflow-hidden">
          <header className="border-b border-sand-200 px-5 py-4">
            <h2 className="text-xl text-ink">Latest updates</h2>
            <p className="text-xs text-ink-faint">The most recent steps {planner} has completed</p>
          </header>
          {data.recent.length === 0
            ? <p className="px-5 py-8 text-center text-sm text-ink-faint">The first updates will show here soon.</p>
            : <ol className="relative space-y-0 px-5 py-4">
              {data.recent.map((t, i) => (
                <li key={t.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < data.recent.length - 1 && <span className="absolute left-[9px] top-5 h-full w-px bg-sand-200" />}
                  <span className="relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage-600 text-[10px] text-white">✓</span>
                  <div className="min-w-0">
                    <p className="text-sm text-ink">{t.title}</p>
                    <p className="text-[11px] text-ink-faint">{t.phase}{t.for_you ? ' · one of yours' : ''} · {relativeDays(t.completed_at)}</p>
                  </div>
                </li>
              ))}
            </ol>}
        </section>
      </div>

      {/* ---- the planner's stages ---- */}
      <section>
        <div className="mb-3">
          <h2 className="text-2xl text-ink">What your planner is working on</h2>
          <p className="text-xs text-ink-faint">{planner} and the team · tap a stage to see each step</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {data.phases.map((p) => (
            <button key={p.phase} onClick={() => setOpen(open === p.phase ? null : p.phase)} aria-expanded={open === p.phase}
                    className={`card p-4 text-left transition-all ${open === p.phase ? 'ring-2 ring-blush-300' : 'hover:shadow-lift'}`}>
              <div className="flex items-center justify-between">
                <p className="font-medium text-ink">{p.phase}</p>
                {p.pct === 100 ? <span className="text-sage-700">✓</span> : <span className="text-xs text-ink-faint">{open === p.phase ? '▴' : '▾'}</span>}
              </div>
              <div className="mt-2"><ProgressBar value={p.pct} tone={p.pct === 100 ? 'good' : 'plum'} /></div>
              <p className="mt-1 text-[11px] text-ink-faint">{p.done} of {p.total} steps</p>
            </button>
          ))}
        </div>
        {open && (
          <div className="card mt-3 animate-rise overflow-hidden">
            <ul className="divide-y divide-sand-200">
              {data.phases.find((p) => p.phase === open).tasks.map((t) => <TaskRow key={t.id} t={t} when={when(t)} compact />)}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}

function TaskRow({ t, when, compact = false }) {
  const s = STAGE[t.stage] || STAGE['To Plan']
  return (
    <li className={`flex items-center gap-4 px-5 ${compact ? 'py-2.5' : 'py-3.5'} ${t.overdue && !t.done ? 'bg-blush-50/60' : ''}`}>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${s.dot}`} aria-hidden>{s.mark}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${t.done ? 'text-ink-faint' : 'text-ink'}`}>{t.title}</p>
        {!compact && <p className="text-[11px] text-ink-faint">{t.phase}</p>}
      </div>
      <span className={`hidden text-[11px] font-semibold sm:block ${s.text}`}>{s.label}</span>
      <span className={`tnum w-28 shrink-0 text-right text-xs ${t.overdue && !t.done ? 'font-semibold text-blush-700' : 'text-ink-faint'}`}>{when}</span>
    </li>
  )
}
