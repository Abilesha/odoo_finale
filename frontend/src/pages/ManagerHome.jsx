import { useState } from 'react'
import { Link } from 'react-router-dom'

import { api, date, inr } from '../api'
import { AgreementCopyModal } from '../components/AgreementCopy'
import { Countdown, HealthPill, Ring } from '../components/kit'
import { Card, ErrorBox, ProgressBar, Spinner, StatusPill, Tabs, useToast } from '../components/ui'
import { usePolling } from '../hooks'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 1440) return `${Math.round(m / 60)}h ago`
  return `${Math.round(m / 1440)}d ago`
}

const STAGE_TONE = {
  'Waiting on vendors': 'bg-sand-200 text-ink-soft',
  'Ready to compare': 'bg-gold-100 text-gold-700',
  'With the couple': 'bg-plum-100 text-plum-700',
  'Decided': 'bg-sage-100 text-sage-700',
}

function Hero({ me, next, live }) {
  const first = me.name.split(' ')[0]
  return (
    <section className="relative overflow-hidden rounded-2xl bg-night-900 text-sand-50 shadow-lift">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold-400/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-night-500/30 blur-3xl" />
      <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold-300">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl">{greeting()}, {first}.</h1>
          {live.length > 0 ? (
            <p className="mt-3 max-w-xl text-night-200">
              <span className="font-semibold text-sand-50">{live[0].couple_name}</span> is live today at {live[0].venue}.
              {live[0].alerts.length > 0
                ? ` ${live[0].alerts.length} slot${live[0].alerts.length > 1 ? 's are' : ' is'} running late.`
                : ' Everything is on time.'}
            </p>
          ) : next ? (
            <p className="mt-3 max-w-xl text-night-200">
              Next up: <span className="font-semibold text-sand-50">{next.couple_name}</span>'s {next.next_moment.name.toLowerCase()} at {next.venue}.
            </p>
          ) : (
            <p className="mt-3 text-night-200">No weddings on your calendar yet — the founder assigns them.</p>
          )}
        </div>

        {next && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-300">Countdown</p>
                <p className="mt-0.5 font-display text-lg">{next.couple_name} · {next.next_moment.name}</p>
              </div>
              <Link to={`/weddings/${next.wedding_id}`} className="text-xs text-night-200 underline-offset-2 hover:text-sand-50 hover:underline">Open →</Link>
            </div>
            <div className="mt-4">
              <Countdown to={next.next_moment.starts_at} size="hero" tone="dark" />
            </div>
            <p className="mt-3 text-[11px] text-night-300">
              {new Date(next.next_moment.starts_at).toLocaleString('en-IN', {
                weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })} · {next.city}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

function LiveCard({ l }) {
  return (
    <section className="card overflow-hidden border-sage-400/50">
      <div className="flex flex-wrap items-center gap-5 bg-sage-100/60 p-5">
        <Ring value={l.progress_pct} size={76} tone="good" sub="run sheet" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-sage-700">
            <span className="h-2 w-2 animate-pulseDot rounded-full bg-sage-600" /> Live now · day {l.active_day} of 3
          </p>
          <h2 className="mt-1 font-display text-2xl text-ink">{l.couple_name}</h2>
          <p className="text-sm text-ink-faint">{l.venue} · {l.completed_slots} of {l.total_slots} slots done · server time {l.server_time}</p>
        </div>
        <Link to={`/weddings/${l.wedding_id}?tab=runsheet`} className="btn-primary">Open the live board →</Link>
      </div>
      {l.alerts.length > 0 && (
        <ul className="divide-y divide-sand-200">
          {l.alerts.map((a) => (
            <li key={a.slot_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="text-sm font-medium text-ink">{a.title}</p>
                <p className="text-xs text-ink-faint">{a.vendor} · owner {a.owner} · scheduled {a.scheduled}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="pill bg-rust-100 text-rust-700">{a.minutes_late} min late</span>
                {a.vendor_phone && <a href={`tel:${a.vendor_phone}`} className="btn-ghost btn-sm">Call {a.vendor_phone}</a>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function EventCard({ e }) {
  const now = Date.now()
  return (
    <article className="card flex flex-col p-5 transition-shadow hover:shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/weddings/${e.wedding_id}`} className="font-display text-xl text-ink hover:text-plum-700">{e.couple_name}</Link>
          <p className="text-xs text-ink-faint">{e.code} · {e.venue}</p>
        </div>
        {e.live ? <span className="pill bg-sage-100 text-sage-700">● Live</span> : <StatusPill status={e.status} />}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {e.events.map((ev) => {
          const past = new Date(ev.starts_at).getTime() < now
          const isNext = e.next_moment && ev.day === e.next_moment.day
          return (
            <div key={ev.day} className={`rounded-lg border px-2.5 py-2 ${
              isNext ? 'border-gold-300 bg-gold-50' : past ? 'border-sand-200 bg-sand-50 opacity-60' : 'border-sand-200'}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Day {ev.day}</p>
              <p className="truncate text-xs font-medium text-ink">{ev.name}</p>
              <p className="tnum text-[11px] text-ink-faint">{date(ev.date, { year: false })}</p>
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="flex-1">
          <ProgressBar value={e.progress_pct} tone={e.task_overdue ? 'gold' : 'good'} />
          <p className="mt-1 text-[11px] text-ink-faint">
            {e.progress_pct}% planned{e.task_overdue > 0 && <span className="text-rust-700"> · {e.task_overdue} overdue</span>} · {e.guest_count} guests
          </p>
        </div>
        {e.next_moment && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-ink-faint">{e.next_moment.name} in</p>
            <p className="text-ink"><Countdown to={e.next_moment.starts_at} size="sm" /></p>
          </div>
        )}
      </div>
    </article>
  )
}

export default function ManagerHome() {
  // refresh every minute — a vendor's delay should appear without a reload
  const { data, error, loading, reload } = usePolling('/api/my/overview', 60000)
  const [taskTab, setTaskTab] = useState('pending')
  const [copyFor, setCopyFor] = useState(null)
  const [toast, setToast] = useToast()

  if (loading) return <Spinner label="Getting your day ready" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const s = data.stats
  const next = data.events.find((e) => e.next_moment && !e.live) || data.events.find((e) => e.next_moment)

  async function tick(t) {
    try {
      await api.patch(`/api/tasks/${t.id}`, { stage: 'Done' })
      setToast({ message: `Done: ${t.title}` }); reload()
    } catch (e) { setToast({ message: e.message, tone: 'bad' }) }
  }

  async function ack(u) {
    try {
      const res = await api.post(`/api/vendor-updates/${u.id}/ack`)
      setToast({ message: res.detail }); reload()
    } catch (e) { setToast({ message: e.message, tone: 'bad' }) }
  }

  const tasks = data.tasks[taskTab]

  return (
    <div className="space-y-6">
      <Hero me={data.me} next={next} live={data.live} />

      {/* ---- the numbers that need a manager today ---- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          ['Your weddings', s.weddings_active, `${s.live_now} live now`, null, '/weddings'],
          ['Pending', s.tasks_pending, 'late or stuck', s.tasks_pending ? 'bad' : 'good', '/checklist?tab=pending'],
          ['Next 14 days', s.tasks_due_14d, 'tasks due', null, '/checklist?tab=upcoming'],
          ['Client payments', inr(s.payments_due, { compact: true }), s.payments_overdue ? `${s.payments_overdue} overdue` : 'none overdue', s.payments_overdue ? 'bad' : null, '/payments'],
          ['Client queries', s.client_queries, s.complaints_open ? `${s.complaints_open} complaint${s.complaints_open > 1 ? 's' : ''} open` : 'waiting on you', s.client_queries ? 'bad' : 'good', '/queries'],
          ['Vendor alerts', s.vendor_alerts, 'delays unread', s.vendor_alerts ? 'bad' : 'good', null],
        ].map(([l, v, sub, tone, to]) => {
          const body = (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{l}</p>
              <p className={`tnum mt-1.5 font-display text-2xl font-semibold ${
                tone === 'bad' ? 'text-rust-700' : tone === 'good' ? 'text-sage-700' : 'text-ink'}`}>{v}</p>
              <p className="text-[11px] text-ink-faint">{sub}</p>
            </>
          )
          return to
            ? <Link key={l} to={to} className="card p-4 transition-shadow hover:shadow-lift">{body}</Link>
            : <div key={l} className="card p-4">{body}</div>
        })}
      </div>

      {data.live.map((l) => <LiveCard key={l.wedding_id} l={l} />)}

      {/* ---- upcoming weddings with their three days ---- */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-2xl text-ink">Upcoming events</h2>
          <Link to="/weddings" className="text-xs text-plum-600 hover:underline">All your weddings →</Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.events.filter((e) => !e.live).map((e) => <EventCard key={e.wedding_id} e={e} />)}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        {/* ---- checklist ---- */}
        <Card title="Checklist" subtitle="Across every wedding you run"
              action={<Link to="/checklist" className="btn-ghost btn-sm">Full checklist →</Link>} pad={false}>
          <div className="px-5">
            <Tabs active={taskTab} onChange={setTaskTab} tabs={[
              { id: 'pending', label: 'Pending', count: s.tasks_pending },
              { id: 'upcoming', label: 'Upcoming', count: data.tasks.upcoming.length },
              { id: 'finished', label: 'Finished', count: data.tasks.finished.length },
            ]} />
          </div>
          {tasks.length === 0 ? (
            <p className="p-5 text-sm text-ink-faint">
              {taskTab === 'pending' ? 'Nothing late or stuck. ✓' : 'Nothing here.'}
            </p>
          ) : (
            <ul className="divide-y divide-sand-200">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-3 px-5 py-3">
                  {t.bucket === 'finished' ? (
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-sage-600 text-[11px] text-white">✓</span>
                  ) : (
                    <button onClick={() => tick(t)} title="Mark done"
                            className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-2 border-sand-300 transition-colors hover:border-sage-600 hover:bg-sage-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${t.bucket === 'finished' ? 'text-ink-faint line-through' : 'text-ink'}`}>{t.title}</p>
                    <p className="text-[11px] text-ink-faint">
                      <Link to={`/weddings/${t.wedding_id}`} className="hover:text-plum-700">{t.couple_name}</Link> · {t.phase}
                      {t.stage === 'Blocked' && <span className="text-rust-700"> · blocked</span>}
                      {t.notes && t.stage === 'Blocked' && ` — ${t.notes}`}
                    </p>
                  </div>
                  <span className={`tnum shrink-0 text-[11px] font-medium ${
                    t.overdue ? 'text-rust-700' : 'text-ink-faint'}`}>
                    {t.bucket === 'finished' ? date(t.completed_at, { year: false })
                      : t.days_left == null ? '' : t.days_left < 0 ? `${-t.days_left}d late`
                      : t.days_left === 0 ? 'today' : `in ${t.days_left}d`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---- vendor updates ---- */}
        <Card title="From your vendors" subtitle="Progress and delays, straight from their portal" pad={false}>
          {data.vendor_updates.length === 0 ? (
            <p className="p-5 text-sm text-ink-faint">No updates yet.</p>
          ) : (
            <ul className="divide-y divide-sand-200">
              {data.vendor_updates.map((u) => {
                const bad = u.status === 'Delayed' || u.status === 'Blocked'
                return (
                  <li key={u.id} className={`px-5 py-3.5 ${bad && !u.acknowledged ? 'bg-rust-100/40' : ''}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">
                        {u.vendor} <span className="font-normal text-ink-faint">· {u.category} · {u.couple_name}</span>
                      </p>
                      <span className="flex items-center gap-2">
                        <HealthPill value={u.status} />
                        <span className="tnum text-[11px] text-ink-faint">{u.progress_pct}%</span>
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink-soft">{u.message}</p>
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] text-ink-faint">
                        {ago(u.created_at)}{u.expected_by && ` · now expected ${date(u.expected_by, { year: false })}`}
                      </p>
                      {u.acknowledged
                        ? <span className="text-[11px] text-sage-700">✓ seen</span>
                        : <button onClick={() => ack(u)} className="btn-ghost btn-sm">Mark seen</button>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      {data.client_queries.length > 0 && (
        <Card title="Your couples are asking" subtitle="From their own portal — complaints first"
              action={<Link to="/queries" className="btn-ghost btn-sm">All queries →</Link>} pad={false}>
          <ul className="divide-y divide-sand-200">
            {data.client_queries.map((q) => (
              <li key={q.id}>
                <Link to={`/queries?ticket=${q.id}`}
                      className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-sand-50 ${
                        q.awaiting === 'planner' && q.kind === 'Complaint' ? 'bg-rust-100/40' : ''}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      <span className={`pill mr-2 ${q.kind === 'Complaint' ? 'bg-rust-100 text-rust-700' : q.kind === 'Change request' ? 'bg-gold-100 text-gold-700' : 'bg-plum-100 text-plum-700'}`}>{q.kind}</span>
                      {q.subject}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-faint">{q.couple_name} · “{q.last_message}”</p>
                  </div>
                  <span className={`text-[11px] ${q.awaiting === 'planner' ? 'font-semibold text-rust-700' : 'text-ink-faint'}`}>
                    {q.awaiting === 'planner' ? 'needs your reply' : 'with the couple'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-3 [&>*]:min-w-0">
        {/* ---- money in ---- */}
        <Card title="Client payments due" action={<Link to="/payments" className="btn-ghost btn-sm">Payments →</Link>} pad={false}>
          <ul className="divide-y divide-sand-200">
            {data.payments.slice(0, 7).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{p.couple_name}</p>
                  <p className="text-[11px] text-ink-faint">{p.kind} · {date(p.due_date, { year: false })}</p>
                </div>
                <div className="text-right">
                  <p className="tnum text-sm font-medium text-ink">{inr(p.amount, { compact: true })}</p>
                  <p className={`text-[11px] ${p.client_reference ? 'font-medium text-blush-700' : p.overdue ? 'font-medium text-rust-700' : 'text-ink-faint'}`}>
                    {p.client_reference ? 'couple says paid' : p.overdue ? `${-p.days_left}d overdue` : p.status}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {/* ---- quotes pipeline ---- */}
        <Card title="Vendor quotes" subtitle="Requests out to vendors, and where each one stands" pad={false}>
          {data.rfqs.length === 0 ? (
            <p className="p-5 text-sm text-ink-faint">No requests out. Start one from a wedding's Vendors tab.</p>
          ) : (
            <ul className="divide-y divide-sand-200">
              {data.rfqs.map((r) => (
                <li key={r.id}>
                  <Link to={`/rfq/${r.id}`} className="block px-5 py-3 transition-colors hover:bg-sand-50">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{r.category} · {r.couple_name}</p>
                      <span className={`pill ${STAGE_TONE[r.stage]}`}>{r.stage}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink-faint">
                      {r.received} of {r.invited} priced{r.waiting > 0 && ` · ${r.waiting} still to reply`}
                      {r.chosen_by_name && ` · chosen by ${r.chosen_by_name}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---- agreements ---- */}
        <Card title="Client agreements" subtitle="Your enquiries and where the paperwork stands" pad={false}>
          {data.agreements.length === 0 ? (
            <p className="p-5 text-sm text-ink-faint">No open enquiries.</p>
          ) : (
            <ul className="divide-y divide-sand-200">
              {data.agreements.map((a) => (
                <li key={a.lead_id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{a.couple_name}</p>
                    <p className="text-[11px] text-ink-faint">{a.stage}</p>
                  </div>
                  {a.agreement ? (
                    a.agreement.signed
                      ? <button onClick={() => setCopyFor(a.lead_id)} className="pill bg-sage-100 text-sage-700 hover:underline">✓ Signed · view copy</button>
                      : <button onClick={() => setCopyFor(a.lead_id)} className="pill bg-gold-100 text-gold-700 hover:underline">With the couple to sign</button>
                  ) : <Link to="/leads" className="pill bg-sand-200 text-ink-soft hover:underline">Not sent</Link>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {toast}
      <AgreementCopyModal leadId={copyFor} onClose={() => setCopyFor(null)} />
    </div>
  )
}
