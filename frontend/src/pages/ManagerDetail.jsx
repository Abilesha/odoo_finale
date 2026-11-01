import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { api, date, inr } from '../api'
import { Avatar, EditModal, HealthPill, Ring } from '../components/kit'
import { Card, Empty, ErrorBox, ProgressBar, Spinner, StatusPill, useToast } from '../components/ui'
import { useApi } from '../hooks'
import { AssignModal, STAFF_FIELDS } from './Managers'

function ago(iso) {
  if (!iso) return '—'
  const h = Math.round((Date.now() - new Date(iso)) / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

/** One manager, in full — everything the founder would otherwise ask them. */
export default function ManagerDetail() {
  const { id } = useParams()
  const { data: m, error, loading, reload } = useApi(`/api/managers/${id}`)
  const team = useApi('/api/managers')
  const [editing, setEditing] = useState(false)
  const [assigning, setAssigning] = useState(null)
  const [toast, setToast] = useToast()

  if (loading) return <Spinner label="Opening their file" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const tone = m.health === 'At risk' ? 'bad' : m.health === 'Needs attention' ? 'warn' : 'good'
  const active = m.weddings.filter((w) => w.status !== 'Completed' && w.status !== 'Cancelled')
  const past = m.weddings.filter((w) => w.status === 'Completed')

  return (
    <div className="space-y-6">
      <Link to="/managers" className="text-xs text-plum-600 hover:underline">← All managers</Link>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-5 bg-night-900 p-6 text-sand-50">
          <Avatar name={m.name} src={m.avatar} size="lg" tone="gold" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl">{m.name}</h1>
              <HealthPill value={m.health} />
            </div>
            <p className="mt-1 text-sm text-night-200">
              {m.title || 'Manager'}{m.city && ` · ${m.city}`}
              {m.joined_on && ` · with The Royal Knot since ${date(m.joined_on)}`}
            </p>
            <p className="mt-1 text-sm text-night-300">{m.email}{m.phone && ` · ${m.phone}`}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-white p-1"><Ring value={m.health_score} size={72} tone={tone} label={m.health_score} sub="health" /></div>
            <div className="rounded-full bg-white p-1"><Ring value={m.completion_pct} size={72} tone="night" sub="done" /></div>
            <button className="rounded-lg bg-white/10 px-3 py-2 text-sm text-sand-50 hover:bg-white/20" onClick={() => setEditing(true)}>✎ Edit</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-sand-200 sm:grid-cols-4 lg:grid-cols-8">
          {[
            ['Active', m.weddings_active, m.workload.toLowerCase() + ' load'],
            ['Live now', m.weddings_live, 'weddings'],
            ['Completed', m.weddings_completed, 'weddings'],
            ['Open tasks', m.tasks_open, `${m.tasks_due_week} due this week`],
            ['Overdue', m.tasks_overdue, 'tasks', m.tasks_overdue],
            ['Blocked', m.tasks_blocked, 'tasks', m.tasks_blocked],
            ['Vendor delays', m.vendor_delays, 'reported', m.vendor_delays],
            ['Client payments', m.payments_overdue, m.payments_overdue ? inr(m.payments_overdue_amount, { compact: true }) + ' overdue' : 'none overdue', m.payments_overdue],
          ].map(([l, v, s, bad]) => (
            <div key={l} className="bg-white p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{l}</p>
              <p className={`tnum mt-1 font-display text-2xl font-semibold ${bad ? 'text-rust-700' : 'text-ink'}`}>{v}</p>
              <p className="text-[11px] text-ink-faint">{s}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Their weddings" subtitle={`${active.length} active · ${past.length} completed`} pad={false}>
          {m.weddings.length === 0 ? (
            <div className="p-5"><Empty title="Nothing assigned yet" hint="Assign a wedding from the Managers board." /></div>
          ) : (
            <div className="divide-y divide-sand-200">
              {[...active, ...past].map((w) => (
                <div key={w.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link to={`/weddings/${w.id}`} className="font-medium text-ink hover:text-plum-700">{w.couple_name}</Link>
                      <StatusPill status={w.status} />
                      {w.live && <span className="pill bg-sage-100 text-sage-700">● live</span>}
                    </div>
                    <p className="text-[11px] text-ink-faint">{w.code} · {date(w.day1_date)} · {w.venue}</p>
                  </div>
                  <div className="w-40">
                    <ProgressBar value={w.progress_pct} tone={w.task_overdue ? 'gold' : 'good'} />
                    <p className="mt-1 text-[11px] text-ink-faint">
                      {w.progress_pct}%{w.task_overdue > 0 && <span className="text-rust-700"> · {w.task_overdue} overdue</span>}
                    </p>
                  </div>
                  {w.status !== 'Completed' && (
                    <button className="btn-ghost btn-sm" onClick={() => setAssigning({ ...w })}>Reassign</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="What vendors have flagged" subtitle="Latest word from each vendor, where it is bad news">
            {m.delays.length === 0 ? (
              <p className="text-sm text-ink-faint">No vendor is reporting a delay.</p>
            ) : (
              <ul className="space-y-3">
                {m.delays.map((d, i) => (
                  <li key={i} className="rounded-lg border border-rust-400/30 bg-rust-100/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{d.vendor} <span className="text-ink-faint">· {d.category}</span></p>
                      <HealthPill value={d.status} />
                    </div>
                    <p className="mt-1 text-sm text-ink-soft">{d.message}</p>
                    <p className="mt-1 text-[11px] text-ink-faint">
                      {d.couple_name} · {ago(d.created_at)}{d.expected_by && ` · now expected ${date(d.expected_by)}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Late" subtitle="Open tasks past their due date" pad={false}>
            {m.overdue_tasks.length === 0 ? (
              <p className="p-5 text-sm text-ink-faint">Nothing is late.</p>
            ) : (
              <ul className="divide-y divide-sand-200">
                {m.overdue_tasks.map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-ink">{t.title}</p>
                      <p className="text-[11px] text-ink-faint">{t.couple_name} · {t.phase} · <StatusPill status={t.stage} /></p>
                    </div>
                    <span className="tnum shrink-0 text-xs font-semibold text-rust-700">{t.days_late}d late</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recently finished" pad={false}>
            <ul className="divide-y divide-sand-200">
              {m.recently_done.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 px-5 py-2.5">
                  <p className="text-sm text-ink-soft"><span className="text-sage-600">✓</span> {t.title}
                    <span className="block text-[11px] text-ink-faint">{t.couple_name}</span></p>
                  <span className="shrink-0 text-[11px] text-ink-faint">{ago(t.completed_at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <EditModal open={editing} onClose={() => setEditing(false)} title={`Edit ${m.name}`}
                 fields={STAFF_FIELDS} initial={m}
                 onSubmit={async (v) => {
                   const res = await api.patch(`/api/staff/${m.id}`, v)
                   setToast({ message: res.detail }); reload()
                 }} />
      <AssignModal wedding={assigning && { ...assigning, manager_id: m.id, manager: m.name }}
                   managers={team.data?.managers} onClose={() => setAssigning(null)}
                   onDone={(res) => { setToast({ message: res.detail }); reload(); team.reload() }} />
      {toast}
    </div>
  )
}
