import { useState } from 'react'
import { Link } from 'react-router-dom'

import { api, date } from '../api'
import {
  Avatar, Countdown, EditButton, EditModal, HealthPill, PageHead, Ring,
} from '../components/kit'
import { Card, ErrorBox, ProgressBar, Spinner, StatusPill, useToast } from '../components/ui'
import { useApi } from '../hooks'

export const STAFF_FIELDS = [
  { name: 'name', label: 'Full name', required: true },
  { name: 'title', label: 'Job title', placeholder: 'Wedding Manager' },
  { name: 'email', label: 'Work email', type: 'email', required: true },
  { name: 'phone', label: 'Phone' },
  { name: 'city', label: 'Base city' },
  { name: 'hourly_cost', label: 'Hourly cost (₹)', type: 'number', help: 'Feeds the profit on each wedding' },
  { name: 'role', label: 'Access', type: 'select', placeholder: false,
    options: [{ value: 'Manager', label: 'Manager — their own weddings' },
              { value: 'Founder', label: 'Founder — everything' }] },
]

const healthTone = (h) => (h === 'At risk' ? 'bad' : h === 'Needs attention' ? 'warn' : 'good')

function ManagerCard({ m, onEdit }) {
  return (
    <article className="card flex flex-col overflow-hidden transition-shadow hover:shadow-lift">
      <div className="flex items-start gap-4 p-5">
        <Avatar name={m.name} src={m.avatar} size="lg" tone="night" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/managers/${m.id}`} className="truncate font-display text-xl text-ink hover:text-plum-700">
              {m.name}
            </Link>
            <HealthPill value={m.health} />
          </div>
          <p className="mt-0.5 text-xs text-ink-faint">
            {m.title || 'Manager'}{m.city && ` · ${m.city}`}
          </p>
          <p className="mt-1 truncate text-xs text-ink-soft">{m.email}{m.phone && ` · ${m.phone}`}</p>
        </div>
        <Ring value={m.completion_pct} tone={healthTone(m.health)} sub="done" />
      </div>

      <div className="grid grid-cols-4 border-y border-sand-200 bg-sand-50 text-center">
        {[
          ['Weddings', m.weddings_active, m.workload],
          ['Overdue', m.tasks_overdue, 'tasks', m.tasks_overdue > 0],
          ['This week', m.tasks_due_week, 'due'],
          ['Vendor', m.vendor_delays, 'delays', m.vendor_delays > 0],
        ].map(([l, v, s, bad]) => (
          <div key={l} className="border-r border-sand-200 px-2 py-3 last:border-r-0">
            <p className={`tnum font-display text-xl font-semibold ${bad ? 'text-rust-700' : 'text-ink'}`}>{v}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{l}</p>
            <p className="text-[10px] text-ink-faint">{s}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-1 flex-col justify-between gap-3 p-5">
        {m.weddings_live > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-sage-100 px-3 py-2 text-xs text-sage-700">
            <span className="h-2 w-2 animate-pulseDot rounded-full bg-sage-600" />
            Live today: {m.live.map((w) => w.couple_name).join(', ')}
          </div>
        )}
        {m.next_event ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Next wedding</p>
              <Link to={`/weddings/${m.next_event.wedding_id}`} className="truncate text-sm font-medium text-ink hover:text-plum-700">
                {m.next_event.couple_name}
              </Link>
              <p className="text-[11px] text-ink-faint">{date(m.next_event.day1_date)} · {m.next_event.venue}</p>
            </div>
            <div className="text-right text-ink-soft">
              <Countdown to={`${m.next_event.day1_date}T00:00:00`} size="sm" doneLabel="Under way" />
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-faint">No upcoming weddings — free to take one.</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sand-200 pt-3 text-[11px] text-ink-faint">
          <span>
            {m.complaints_open > 0 && <span className="mr-2 font-medium text-rust-700">{m.complaints_open} complaint{m.complaints_open > 1 ? 's' : ''} open</span>}
            {m.queries_unanswered > 0 && <span className="mr-2 font-medium text-gold-700">{m.queries_unanswered} quer{m.queries_unanswered > 1 ? 'ies' : 'y'} unanswered</span>}
            {m.client_rating && <span className="mr-2 text-gold-700">★ {m.client_rating} from couples</span>}
            {m.payments_overdue > 0 && <span className="mr-2 font-medium text-rust-700">{m.payments_overdue} client payment overdue</span>}
            {m.open_leads} open enquir{m.open_leads === 1 ? 'y' : 'ies'} · {m.hours_30d}h logged in 30 days
          </span>
          <span className="flex gap-1">
            <EditButton onClick={() => onEdit(m)} />
            <Link to={`/managers/${m.id}`} className="btn-ghost btn-sm">Open →</Link>
          </span>
        </div>
      </div>
    </article>
  )
}

export function AssignModal({ wedding, managers, onClose, onDone }) {
  return (
    <EditModal
      open={!!wedding}
      onClose={onClose}
      title={wedding?.manager ? 'Reassign wedding' : 'Assign a manager'}
      subtitle={wedding ? `${wedding.couple_name} · ${date(wedding.day1_date)} · open tasks move with it` : ''}
      initial={{ manager_id: wedding?.manager_id ?? '', note: '' }}
      sendAll
      submitLabel="Assign"
      fields={[
        { name: 'manager_id', label: 'Manager', type: 'select', numeric: true, full: true,
          placeholder: '— Unassigned —',
          options: (managers || []).map((m) => ({
            value: m.id,
            label: `${m.name} — ${m.weddings_active} active · ${m.health.toLowerCase()}`,
          })) },
        { name: 'note', label: 'Note for the manager', type: 'textarea', rows: 2,
          placeholder: 'Udaipur couple — your city. Bride’s mother is the decision-maker.' },
      ]}
      onSubmit={async (v) => onDone(await api.post(`/api/weddings/${wedding.id}/assign`, v))}
    />
  )
}

export default function Managers() {
  const { data, error, loading, reload } = useApi('/api/managers')
  const [editing, setEditing] = useState(null)
  const [assigning, setAssigning] = useState(null)
  const [toast, setToast] = useToast()

  if (loading) return <Spinner label="Checking on the team" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const t = data.totals
  const byLoad = [...data.managers].sort((a, b) => a.health_score - b.health_score)

  return (
    <div className="space-y-8">
      <PageHead
        eyebrow="Founder console"
        title="Managers"
        sub="Who runs which wedding, and how each of them is doing — late work, vendor trouble and client payments, without having to ask."
        action={<Link to="/team" className="btn-primary">+ Add a manager</Link>}
      />

      {/* ---- totals ---- */}
      <div className="card grid grid-cols-2 gap-px overflow-hidden bg-sand-200 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Managers', t.managers, 'on the team'],
          ['Active weddings', t.active_weddings, 'planning or live'],
          ['Unassigned', t.unassigned, t.unassigned ? 'need a manager' : 'all handed out', t.unassigned ? 'gold' : null],
          ['Overdue tasks', t.overdue_tasks, 'across the team', t.overdue_tasks ? 'bad' : null],
          ['Vendor delays', t.vendor_delays, 'reported by vendors', t.vendor_delays ? 'bad' : null],
          ['At risk', t.at_risk, `${t.complaints_open} complaint${t.complaints_open === 1 ? '' : 's'} open · ${t.live_now} live`, t.at_risk ? 'bad' : null],
        ].map(([l, v, s, tone]) => (
          <div key={l} className="bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{l}</p>
            <p className={`tnum mt-1.5 font-display text-3xl font-semibold ${
              tone === 'bad' ? 'text-rust-700' : tone === 'gold' ? 'text-gold-600' : 'text-ink'}`}>{v}</p>
            <p className="mt-0.5 text-[11px] text-ink-faint">{s}</p>
          </div>
        ))}
      </div>

      {/* ---- unassigned first: the founder's to-do ---- */}
      {data.unassigned.length > 0 && (
        <section className="card border-gold-300 bg-gold-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl text-ink">Waiting for a manager</h2>
              <p className="text-xs text-ink-faint">Nobody owns these yet — which means nobody is chasing them.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {data.unassigned.map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-3 rounded-xl border border-gold-200 bg-white p-4">
                <div className="min-w-0">
                  <Link to={`/weddings/${w.id}`} className="font-medium text-ink hover:text-plum-700">{w.couple_name}</Link>
                  <p className="text-xs text-ink-faint">{w.code} · {date(w.day1_date)} · {w.venue} · {w.guest_count} guests</p>
                  <p className="text-[11px] text-gold-700">in {w.days_to_go} days</p>
                </div>
                <button className="btn-gold btn-sm" onClick={() => setAssigning(w)}>Assign</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- the team ---- */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-2xl text-ink">The team <span className="text-ink-faint">· {data.count}</span></h2>
          <p className="text-xs text-ink-faint">Sorted with whoever needs help first</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {byLoad.map((m) => <ManagerCard key={m.id} m={m} onEdit={setEditing} />)}
        </div>
      </section>

      {/* ---- assignment board ---- */}
      <Card title="Assignment board" subtitle="Every open wedding and who runs it. Reassigning moves the open tasks too." pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="bg-sand-50">
              <tr>
                <th className="th">Wedding</th>
                <th className="th">Starts</th>
                <th className="th">Status</th>
                <th className="th w-48">Plan</th>
                <th className="th">Manager</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {data.assignments.map((w) => (
                <tr key={w.id} className={!w.manager_id ? 'bg-gold-50/60' : ''}>
                  <td className="td">
                    <Link to={`/weddings/${w.id}`} className="font-medium hover:text-plum-700">{w.couple_name}</Link>
                    <p className="text-[11px] text-ink-faint">{w.code} · {w.venue}</p>
                  </td>
                  <td className="td tnum">
                    {date(w.day1_date)}
                    <p className="text-[11px] text-ink-faint">
                      {w.live ? 'live now' : w.days_to_go >= 0 ? `in ${w.days_to_go} days` : `${-w.days_to_go} days ago`}
                    </p>
                  </td>
                  <td className="td"><StatusPill status={w.status} /></td>
                  <td className="td">
                    <ProgressBar value={w.progress_pct} tone={w.task_overdue ? 'gold' : 'good'} />
                    <p className="mt-1 text-[11px] text-ink-faint">
                      {w.progress_pct}% · {w.task_overdue ? <span className="text-rust-700">{w.task_overdue} overdue</span> : 'nothing late'}
                    </p>
                  </td>
                  <td className="td">
                    {w.manager ? (
                      <span className="flex items-center gap-2"><Avatar name={w.manager} size="sm" tone="night" />{w.manager}</span>
                    ) : <span className="pill bg-gold-100 text-gold-700">Unassigned</span>}
                  </td>
                  <td className="td text-right">
                    <button className="btn-ghost btn-sm" onClick={() => setAssigning(w)}>
                      {w.manager ? 'Reassign' : 'Assign'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AssignModal wedding={assigning} managers={data.managers} onClose={() => setAssigning(null)}
                   onDone={(res) => { setToast({ message: res.detail }); reload() }} />

      <EditModal open={!!editing} onClose={() => setEditing(null)}
                 title={`Edit ${editing?.name || ''}`} subtitle="Contact details, title, cost and access"
                 fields={STAFF_FIELDS} initial={editing || {}}
                 onSubmit={async (v) => {
                   const res = await api.patch(`/api/staff/${editing.id}`, v)
                   setToast({ message: res.detail }); reload()
                 }} />
      {toast}
    </div>
  )
}
