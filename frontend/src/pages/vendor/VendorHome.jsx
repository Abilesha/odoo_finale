import { useState } from 'react'
import { Link } from 'react-router-dom'

import { inr } from '../../api'
import { Countdown } from '../../components/kit'
import { ErrorBox, Spinner, useToast } from '../../components/ui'
import { useApi } from '../../hooks'
import { JobCard, RequestCard, UpdateModal } from './shared'

/** The vendor's front page: what needs a price, what is coming up, and what
 *  the season is worth to them. */
export default function VendorHome() {
  const { data, error, loading, reload } = useApi('/api/vendor-portal/overview')
  const [updating, setUpdating] = useState(null)
  const [toast, setToast] = useToast()

  if (loading) return <Spinner label="Opening your portal" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const s = data.stats
  const v = data.vendor
  const next = data.upcoming_jobs.find((j) => j.phase === 'Upcoming')
  const live = data.upcoming_jobs.filter((j) => j.phase === 'Live')
  const firstSlot = next?.slots?.[0]
  const nextAt = next && `${firstSlot ? firstSlot.date : next.event.day1_date}T${firstSlot ? firstSlot.start_time : '09:00'}:00`

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-jade-900 text-sand-50 shadow-lift">
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-gold-400/10 blur-2xl" />
        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold-300">{v.category} · {v.city}</p>
            <h1 className="mt-2 font-display text-4xl sm:text-5xl">{v.name}</h1>
            <p className="mt-3 max-w-xl text-jade-200">
              {s.new_requests > 0
                ? <>You have <span className="font-semibold text-sand-50">{s.new_requests} request{s.new_requests > 1 ? 's' : ''}</span> waiting for a price.</>
                : 'No requests waiting — you are all caught up.'}
              {live.length > 0 && <> <span className="font-semibold text-sand-50">{live[0].event.couple_name}</span> is live today.</>}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {s.new_requests > 0 && <Link to="/requests" className="btn bg-gold-500 text-white hover:bg-gold-600">Price requests →</Link>}
              <Link to="/calendar" className="btn bg-white/10 text-sand-50 hover:bg-white/20">Update my calendar</Link>
            </div>
          </div>
          {next && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-300">Next job</p>
              <p className="mt-0.5 font-display text-lg">{next.event.couple_name} · {next.event.venue}</p>
              <div className="mt-4"><Countdown to={nextAt} size="hero" tone="dark" /></div>
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          ['New requests', s.new_requests, 'need a price', s.new_requests ? 'gold' : null, '/requests'],
          ['Active jobs', s.active_jobs, `${s.live_jobs} live today`, null, '/jobs'],
          ['Win rate', s.win_rate != null ? `${s.win_rate}%` : '—', `${s.won} won`, null, '/requests'],
          ['Received', inr(s.received, { compact: true }), `of ${inr(s.contracted, { compact: true })}`, null, '/earnings'],
          ['Your profit', s.profit != null ? inr(s.profit, { compact: true }) : '—', s.margin_pct != null ? `${s.margin_pct}% margin` : 'add your costs', 'jade', '/earnings'],
          ['Punctuality', `${s.on_time_pct}%`, `rated ${s.rating} / 5`, null, null],
        ].map(([l, val, sub, tone, to]) => {
          const body = (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{l}</p>
              <p className={`tnum mt-1.5 font-display text-2xl font-semibold ${
                tone === 'gold' ? 'text-gold-600' : tone === 'jade' ? 'text-jade-700' : 'text-ink'}`}>{val}</p>
              <p className="text-[11px] text-ink-faint">{sub}</p>
            </>
          )
          return to
            ? <Link key={l} to={to} className="card p-4 transition-shadow hover:shadow-lift">{body}</Link>
            : <div key={l} className="card p-4">{body}</div>
        })}
      </div>

      {data.new_requests.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-2xl text-ink">Waiting for your price</h2>
            <Link to="/requests" className="text-xs text-jade-700 hover:underline">All requests →</Link>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.new_requests.map((r) => <RequestCard key={r.quote_id} r={r} />)}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-2xl text-ink">Coming up</h2>
          <Link to="/jobs" className="text-xs text-jade-700 hover:underline">All jobs →</Link>
        </div>
        <div className="space-y-4">
          {data.upcoming_jobs.length === 0
            ? <p className="text-sm text-ink-faint">No jobs booked yet.</p>
            : data.upcoming_jobs.map((j) => <JobCard key={j.contract_id} j={j} onUpdate={setUpdating} compact />)}
        </div>
      </section>

      <UpdateModal job={updating} onClose={() => setUpdating(null)}
                   onDone={(res) => { setToast({ message: res.detail }); reload() }} />
      {toast}
    </div>
  )
}
