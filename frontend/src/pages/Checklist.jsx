import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { api, date } from '../api'
import { EditButton, EditModal, PageHead } from '../components/kit'
import { Card, Empty, ErrorBox, Spinner, StatusPill, Tabs, useToast } from '../components/ui'
import { useApi } from '../hooks'

const PHASES = ['Venue', 'Design', 'Vendors', 'Big Day', 'Close-out']
const STAGES = ['To Plan', 'In Progress', 'Blocked', 'Done']

function when(t) {
  if (t.bucket === 'finished') return t.completed_at ? `done ${date(t.completed_at, { year: false })}` : 'done'
  if (t.days_left == null) return 'no date'
  if (t.days_left < 0) return `${-t.days_left} days late`
  if (t.days_left === 0) return 'due today'
  if (t.days_left === 1) return 'tomorrow'
  return `in ${t.days_left} days`
}

/** Upcoming work, grouped by how soon — the way a planner thinks about it. */
function horizon(t) {
  if (t.days_left == null) return 'No date'
  if (t.days_left <= 0) return 'Today'
  if (t.days_left <= 7) return 'This week'
  if (t.days_left <= 30) return 'This month'
  return 'Later'
}

/** The checklist across every wedding a manager runs. */
export default function Checklist() {
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState(params.get('tab') || 'pending')
  const [wedding, setWedding] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useToast()

  const { data, error, loading, reload } = useApi('/api/my/tasks')
  const staff = useApi('/api/staff')

  const rows = useMemo(() => {
    if (!data) return []
    return data.tasks.filter((t) =>
      (tab === 'all' || t.bucket === tab)
      && (!wedding || String(t.wedding_id) === wedding)
      && (!q || t.title.toLowerCase().includes(q.toLowerCase())))
  }, [data, tab, wedding, q])

  if (loading) return <Spinner label="Gathering your checklist" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const change = (t) => { setTab(t); setParams({ tab: t }) }

  async function setStage(t, stage) {
    try {
      await api.patch(`/api/tasks/${t.id}`, { stage })
      setToast({ message: stage === 'Done' ? `Done: ${t.title}` : `${t.title} → ${stage}` })
      reload()
    } catch (e) { setToast({ message: e.message, tone: 'bad' }) }
  }

  async function remove(t) {
    if (!window.confirm(`Remove "${t.title}" from the checklist?`)) return
    try {
      await api.del(`/api/tasks/${t.id}`)
      setToast({ message: 'Removed from the checklist.' }); reload()
    } catch (e) { setToast({ message: e.message, tone: 'bad' }) }
  }

  // sort and group
  const sorted = [...rows].sort((a, b) =>
    tab === 'finished'
      ? (b.completed_at || '').localeCompare(a.completed_at || '')
      : (a.due_date || '9999').localeCompare(b.due_date || '9999'))
  const groups = tab === 'upcoming'
    ? ['Today', 'This week', 'This month', 'Later', 'No date']
        .map((g) => [g, sorted.filter((t) => horizon(t) === g)])
        .filter(([, list]) => list.length)
    : [[null, sorted]]

  const staffOptions = (staff.data || []).map((s) => ({ value: s.id, label: `${s.name} — ${s.title || s.role}` }))

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Checklist"
        title="Everything to do"
        sub="Pending is late or stuck. Upcoming is grouped by how soon. Finished is what you have closed — tick a box and it moves."
        action={<button className="btn-primary" onClick={() => setAdding(true)}>+ Add a task</button>}
      />

      <div className="grid grid-cols-3 gap-3">
        {[
          ['pending', 'Pending', 'late or blocked', 'text-rust-700'],
          ['upcoming', 'Upcoming', 'still to do', 'text-ink'],
          ['finished', 'Finished', 'done', 'text-sage-700'],
        ].map(([id, l, s, c]) => (
          <button key={id} onClick={() => change(id)}
                  className={`card p-4 text-left transition-all ${tab === id ? 'ring-2 ring-plum-300' : 'hover:shadow-lift'}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{l}</p>
            <p className={`tnum mt-1 font-display text-3xl font-semibold ${c}`}>{data.counts[id]}</p>
            <p className="text-[11px] text-ink-faint">{s}</p>
          </button>
        ))}
      </div>

      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-3">
          <Tabs active={tab} onChange={change} tabs={[
            { id: 'pending', label: 'Pending', count: data.counts.pending },
            { id: 'upcoming', label: 'Upcoming', count: data.counts.upcoming },
            { id: 'finished', label: 'Finished', count: data.counts.finished },
            { id: 'all', label: 'All', count: data.counts.all },
          ]} />
          <div className="flex flex-wrap gap-2 pb-2">
            <select className="input w-auto" value={wedding} onChange={(e) => setWedding(e.target.value)}>
              <option value="">All weddings</option>
              {data.weddings.map((w) => <option key={w.id} value={w.id}>{w.couple_name}</option>)}
            </select>
            <input className="input w-48" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-5">
            <Empty title={tab === 'pending' ? 'Nothing late or stuck' : 'Nothing here'}
                   hint={tab === 'pending' ? 'Every open task is on schedule.' : 'Try another tab or wedding.'} />
          </div>
        ) : groups.map(([label, list]) => (
          <div key={label || 'all'}>
            {label && (
              <p className="border-t border-sand-200 bg-sand-50 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                {label} <span className="text-ink-faint/70">· {list.length}</span>
              </p>
            )}
            <ul className="divide-y divide-sand-200 border-t border-sand-200">
              {list.map((t) => {
                const done = t.stage === 'Done'
                return (
                  <li key={t.id} className={`group flex flex-wrap items-center gap-3 px-5 py-3 ${
                    t.bucket === 'pending' ? 'bg-rust-100/30' : ''}`}>
                    <button onClick={() => setStage(t, done ? 'To Plan' : 'Done')}
                            title={done ? 'Reopen' : 'Mark done'}
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-[11px] transition-colors ${
                              done ? 'border-sage-600 bg-sage-600 text-white'
                                : 'border-sand-300 hover:border-sage-600 hover:bg-sage-100'}`}>
                      {done && '✓'}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${done ? 'text-ink-faint line-through' : 'text-ink'}`}>
                        {t.for_client && <span className="pill mr-2 bg-blush-100 text-blush-700">Couple</span>}{t.title}
                      </p>
                      <p className="text-[11px] text-ink-faint">
                        <Link to={`/weddings/${t.wedding_id}`} className="hover:text-plum-700">{t.couple_name}</Link>
                        {' · '}{t.phase}{t.owner && ` · ${t.owner}`}
                        {t.notes && <span className="italic"> — {t.notes}</span>}
                      </p>
                    </div>
                    <select value={t.stage} onChange={(e) => setStage(t, e.target.value)}
                            className="rounded-md border border-sand-300 bg-white px-2 py-1 text-xs text-ink-soft">
                      {STAGES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <span className={`tnum w-28 text-right text-xs ${
                      t.overdue ? 'font-semibold text-rust-700' : 'text-ink-faint'}`}>
                      {when(t)}
                    </span>
                    <span className="flex gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                      <EditButton onClick={() => setEditing(t)} />
                      <button onClick={() => remove(t)} className="rounded-md px-2 py-1 text-xs text-ink-faint hover:bg-rust-100 hover:text-rust-700">✕</button>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </Card>

      <EditModal
        open={!!editing} onClose={() => setEditing(null)}
        title="Edit task" subtitle={editing ? `${editing.couple_name}` : ''}
        initial={editing || {}}
        fields={[
          { name: 'title', label: 'Task', full: true, required: true },
          { name: 'phase', label: 'Phase', type: 'select', options: PHASES, placeholder: false },
          { name: 'stage', label: 'Stage', type: 'select', options: STAGES, placeholder: false },
          { name: 'due_date', label: 'Due', type: 'date' },
          { name: 'owner_id', label: 'Owner', type: 'select', numeric: true, options: staffOptions },
          { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
        ]}
        onSubmit={async (v) => {
          await api.patch(`/api/tasks/${editing.id}`, v)
          setToast({ message: 'Task updated.' }); reload()
        }}
      />

      <EditModal
        open={adding} onClose={() => setAdding(false)}
        title="Add a task" subtitle="Something the plan did not think of"
        initial={{ wedding_id: wedding || data.weddings[0]?.id || '', phase: 'Vendors' }}
        sendAll
        submitLabel="Add to checklist"
        fields={[
          { name: 'wedding_id', label: 'Wedding', type: 'select', numeric: true, required: true, placeholder: false,
            options: data.weddings.map((w) => ({ value: w.id, label: `${w.couple_name} · ${w.code}` })) },
          { name: 'phase', label: 'Phase', type: 'select', options: PHASES, placeholder: false },
          { name: 'title', label: 'Task', full: true, required: true, placeholder: 'Confirm generator for the reception lawn' },
          { name: 'due_date', label: 'Due', type: 'date' },
          { name: 'owner_id', label: 'Owner', type: 'select', numeric: true, options: staffOptions, placeholder: 'The wedding’s manager' },
          { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
        ]}
        onSubmit={async ({ wedding_id: wid, ...v }) => {
          await api.post(`/api/weddings/${wid}/tasks`, v)
          setToast({ message: 'Added to the checklist.' }); reload()
        }}
      />
      {toast}
    </div>
  )
}
