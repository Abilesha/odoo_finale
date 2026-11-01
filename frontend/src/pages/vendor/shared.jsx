import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { api, date, inr } from '../../api'
import { HealthPill, Ring } from '../../components/kit'
import { ErrorBox, Modal } from '../../components/ui'

export const STATUSES = [
  { id: 'On Track', hint: 'Going to plan', tone: 'border-sage-400 bg-sage-100 text-sage-700' },
  { id: 'Delayed', hint: 'Will be late — say when', tone: 'border-gold-400 bg-gold-100 text-gold-700' },
  { id: 'Blocked', hint: 'Cannot move without help', tone: 'border-rust-400 bg-rust-100 text-rust-700' },
  { id: 'Completed', hint: 'Our part is done', tone: 'border-plum-300 bg-plum-100 text-plum-700' },
]

/** "How is it going?" — the update a manager used to have to phone for. */
export function UpdateModal({ job, onClose, onDone }) {
  const [status, setStatus] = useState('On Track')
  const [pct, setPct] = useState(0)
  const [msg, setMsg] = useState('')
  const [by, setBy] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!job) return
    setStatus(job.work_status && job.work_status !== 'Not started' ? job.work_status : 'On Track')
    setPct(job.progress_pct || 0)
    setMsg(''); setBy(''); setErr(null)
  }, [job])

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const res = await api.post(`/api/vendor-portal/jobs/${job.contract_id}/updates`, {
        status, progress_pct: Number(pct), message: msg, expected_by: by || null,
      })
      onDone(res); onClose()
    } catch (e2) { setErr(e2) } finally { setBusy(false) }
  }

  return (
    <Modal open={!!job} onClose={onClose} title="Update your manager"
           subtitle={job ? `${job.event.couple_name} · ${job.category} · goes to ${job.event.manager || 'the manager'}` : ''}>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-2 gap-2">
          {STATUSES.map((s) => (
            <button type="button" key={s.id} onClick={() => { setStatus(s.id); if (s.id === 'Completed') setPct(100) }}
                    className={`rounded-xl border-2 p-3 text-left transition-all ${
                      status === s.id ? s.tone : 'border-sand-200 bg-white text-ink-soft hover:border-sand-300'}`}>
              <p className="text-sm font-semibold">{s.id}</p>
              <p className="text-[11px] opacity-80">{s.hint}</p>
            </button>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="label">How far along</label>
            <span className="tnum font-display text-xl font-semibold text-jade-700">{pct}%</span>
          </div>
          <input type="range" min={0} max={100} step={5} value={pct}
                 onChange={(e) => setPct(e.target.value)} className="w-full accent-jade-600" />
        </div>

        <div>
          <label className="label">What should they know?</label>
          <textarea required rows={3} className="input" value={msg} onChange={(e) => setMsg(e.target.value)}
                    placeholder={status === 'Delayed'
                      ? 'Velvet drapes from Surat arrive two days late — mandap frame goes up on time.'
                      : 'Mandap frame up, florals arriving tomorrow 6am.'} />
        </div>

        {(status === 'Delayed' || status === 'Blocked') && (
          <div>
            <label className="label">{status === 'Delayed' ? 'Now ready by' : 'Expected to clear by (if you know)'}</label>
            <input type="date" className="input" value={by} onChange={(e) => setBy(e.target.value)}
                   required={status === 'Delayed'} />
            <p className="mt-1 text-[11px] text-ink-faint">The manager plans around this date — it shows on their screen in red.</p>
          </div>
        )}

        <ErrorBox error={err} />
        <div className="flex justify-end gap-2 border-t border-sand-200 pt-4">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn bg-jade-700 text-white hover:bg-jade-800" disabled={busy}>
            {busy ? 'Sending…' : 'Send update'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

const PHASE_TONE = {
  Live: 'bg-sage-100 text-sage-700',
  Upcoming: 'bg-jade-100 text-jade-700',
  Completed: 'bg-sand-200 text-ink-soft',
}

/** One job — the wedding, the money, the progress, and the day's slots. */
export function JobCard({ j, onUpdate, onCost, compact = false }) {
  const m = j.money
  const tone = j.work_status === 'Delayed' ? 'warn' : j.work_status === 'Blocked' ? 'bad' : 'jade'
  return (
    <article className="card overflow-hidden">
      <div className="flex flex-wrap items-start gap-4 p-5">
        <Ring value={j.progress_pct} tone={tone} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl text-ink">{j.event.couple_name}</h3>
            <span className={`pill ${PHASE_TONE[j.phase]}`}>{j.phase === 'Live' ? '● Live' : j.phase}</span>
            <HealthPill value={j.work_status} />
          </div>
          <p className="mt-0.5 text-xs text-ink-faint">
            {j.category} · {date(j.event.day1_date, { year: false })} – {date(j.event.day3_date)} · {j.event.venue} · {j.event.guest_count} guests
          </p>
          {j.event.manager && (
            <p className="mt-0.5 text-xs text-ink-faint">
              Manager: <span className="text-ink-soft">{j.event.manager}</span>
              {j.event.manager_phone && <> · <a className="hover:underline" href={`tel:${j.event.manager_phone}`}>{j.event.manager_phone}</a></>}
            </p>
          )}
        </div>
        {j.phase !== 'Completed' && onUpdate && (
          <button className="btn bg-jade-700 text-white hover:bg-jade-800" onClick={() => onUpdate(j)}>Update manager</button>
        )}
      </div>

      {j.latest_update && (
        <div className="mx-5 mb-4 rounded-lg border border-sand-200 bg-sand-50 px-3 py-2">
          <p className="text-sm text-ink-soft">“{j.latest_update.message}”</p>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            You, {date(j.latest_update.created_at, { year: false })} ·{' '}
            {j.latest_update.seen_by_manager ? <span className="text-sage-700">✓ seen by the manager</span> : 'not seen yet'}
          </p>
        </div>
      )}

      {!compact && (
        <div className="grid grid-cols-2 gap-px border-t border-sand-200 bg-sand-200 sm:grid-cols-5">
          {[
            ['Job value', inr(m.total_value, { compact: true }), m.extras ? `incl. ${inr(m.extras, { compact: true })} extras` : 'as contracted'],
            ['Received', inr(m.received, { compact: true }), `advance ${inr(j.advance_paid, { compact: true })}`],
            ['Outstanding', inr(m.outstanding, { compact: true }), m.outstanding ? 'to be paid' : 'settled'],
            ['Your cost', m.vendor_cost != null ? inr(m.vendor_cost, { compact: true }) : '—', 'private to you'],
            ['Your profit', m.profit != null ? inr(m.profit, { compact: true }) : '—',
             m.margin_pct != null ? `${m.margin_pct}% margin` : 'add your cost', m.profit != null && m.profit < 0],
          ].map(([l, v, s, bad]) => (
            <div key={l} className="bg-white px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{l}</p>
              <p className={`tnum mt-0.5 font-display text-lg font-semibold ${
                bad ? 'text-rust-700' : l === 'Your profit' ? 'text-jade-700' : 'text-ink'}`}>{v}</p>
              <p className="text-[10px] text-ink-faint">
                {s}
                {l === 'Your cost' && onCost && <button onClick={() => onCost(j)} className="ml-1 text-jade-700 underline">edit</button>}
              </p>
            </div>
          ))}
        </div>
      )}

      {!compact && j.slots.length > 0 && (
        <div className="border-t border-sand-200 px-5 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Your slots on the run sheet</p>
          <div className="flex flex-wrap gap-2">
            {j.slots.map((s, i) => (
              <span key={i} className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                s.status === 'Late' ? 'border-rust-400/50 bg-rust-100 text-rust-700'
                  : s.checked_in_at ? 'border-sage-400/50 bg-sage-100 text-sage-700' : 'border-sand-200 text-ink-soft'}`}>
                Day {s.day} · {s.start_time} · {s.title}
                {s.checked_in_at && ` · in at ${s.checked_in_at}`}
              </span>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}

export function RequestStatePill({ state }) {
  const tones = {
    New: 'bg-gold-100 text-gold-700',
    Submitted: 'bg-jade-100 text-jade-700',
    Won: 'bg-sage-100 text-sage-700',
    'Not selected': 'bg-sand-200 text-ink-soft',
    Declined: 'bg-rust-100 text-rust-700',
  }
  return <span className={`pill ${tones[state] || ''}`}>{state === 'New' ? 'Needs your price' : state}</span>
}

export function FitNote({ fit }) {
  if (!fit) return null
  if (fit.ok && !fit.warnings.length) {
    return <p className="text-xs text-sage-700">✓ Fits your calendar and capacity</p>
  }
  return (
    <ul className="space-y-0.5 text-xs">
      {fit.problems.map((p) => <li key={p} className="text-rust-700">✕ {p}</li>)}
      {fit.warnings.map((w) => <li key={w} className="text-gold-700">! {w}</li>)}
    </ul>
  )
}

export function RequestCard({ r }) {
  return (
    <Link to={`/requests/${r.quote_id}`}
          className="card block p-5 transition-shadow hover:shadow-lift">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <RequestStatePill state={r.state} />
          <h3 className="mt-2 font-display text-lg text-ink">{r.title}</h3>
          <p className="text-xs text-ink-faint">
            {r.event.couple_name} · {date(r.event.day1_date, { year: false })} – {date(r.event.day3_date)} · {r.event.venue} · {r.guest_count} guests
          </p>
        </div>
        <div className="text-right">
          {r.your_total != null ? (
            <>
              <p className="text-[10px] uppercase tracking-wider text-ink-faint">Your quote</p>
              <p className="tnum font-display text-xl font-semibold text-ink">{inr(r.your_total, { compact: true })}</p>
            </>
          ) : r.respond_by && (
            <>
              <p className="text-[10px] uppercase tracking-wider text-ink-faint">Reply by</p>
              <p className={`tnum text-sm font-semibold ${r.respond_in_days <= 2 ? 'text-rust-700' : 'text-ink'}`}>
                {date(r.respond_by, { year: false })}
              </p>
              <p className="text-[11px] text-ink-faint">{r.respond_in_days >= 0 ? `${r.respond_in_days} days left` : 'past due'}</p>
            </>
          )}
        </div>
      </div>
      {r.state === 'New' && <div className="mt-3"><FitNote fit={r.fit} /></div>}
      {r.shortlisted && r.state === 'Submitted' && (
        <p className="mt-3 text-xs font-medium text-plum-700">★ On the couple’s shortlist</p>
      )}
    </Link>
  )
}
