import { useState } from 'react'

import { api, date, inr } from '../../api'
import { EditButton, EditModal } from '../../components/kit'
import { Card, ErrorBox, Pill, Spinner, StatusPill, useToast } from '../../components/ui'
import { useApi } from '../../hooks'

const PHASES = ['Venue', 'Design', 'Vendors', 'Big Day', 'Close-out']

const STAGES = ['To Plan', 'In Progress', 'Blocked', 'Done']
const PHASE_TONE = {
  Venue: 'plum', Design: 'gold', Vendors: 'info', 'Big Day': 'warn', 'Close-out': 'neutral',
}

/** Scene 3 — the plan that exists the moment the deposit lands.
 *  35 tasks, each with an owner and a stage, generated from a template
 *  rather than copied from the last wedding. */
export default function PlanTab({ wedding, onChange }) {
  const { data, error, loading, reload } = useApi(`/api/weddings/${wedding.id}/tasks`)
  const [staff] = [useApi('/api/staff').data]
  const [toastNode, setToast] = useToast()
  const [grouping, setGrouping] = useState('stage')
  const [busyId, setBusyId] = useState(null)
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [editingMs, setEditingMs] = useState(null)

  if (loading) return <Spinner label="Loading the plan" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  async function move(task, stage) {
    setBusyId(task.id)
    try {
      await api.patch(`/api/tasks/${task.id}`, { stage })
      reload(); onChange?.()
    } catch (e) {
      setToast({ message: e.message, tone: 'bad' })
    } finally { setBusyId(null) }
  }

  async function reassign(task, owner_id) {
    await api.patch(`/api/tasks/${task.id}`, { owner_id: Number(owner_id) || null })
    reload()
  }

  const nextStage = (s) => STAGES[Math.min(STAGES.indexOf(s) + 1, STAGES.length - 1)]

  function TaskRow({ t, compact = false }) {
    return (
      <article className={`card p-3 transition-shadow hover:shadow-lift ${
        t.overdue ? 'border-rust-400/40' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm leading-snug text-ink">
            {t.for_client && <span className="pill mr-1.5 bg-blush-100 text-blush-700">Couple</span>}{t.title}
          </p>
          <span className="flex shrink-0 items-center gap-1">
            {!compact && <Pill tone={PHASE_TONE[t.phase]}>{t.phase}</Pill>}
            <EditButton label="" onClick={() => setEditing(t)} />
          </span>
        </div>
        {t.notes && <p className="mt-1 text-[11px] italic text-ink-faint">{t.notes}</p>}

        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
          <select
            value={t.owner_id || ''}
            onChange={(e) => reassign(t, e.target.value)}
            className="rounded border border-sand-300 bg-white px-1.5 py-0.5 text-[11px] text-ink-soft"
          >
            <option value="">Unassigned</option>
            {(staff || []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <span className={`tnum ${t.overdue ? 'font-medium text-rust-700' : 'text-ink-faint'}`}>
            {date(t.due_date, { year: false })}
            {t.overdue && ' · overdue'}
          </span>
        </div>

        {t.stage !== 'Done' && (
          <button onClick={() => move(t, nextStage(t.stage))} disabled={busyId === t.id}
                  className="btn-ghost btn-sm mt-2.5 w-full">
            {busyId === t.id ? '…' : `Move to ${nextStage(t.stage)} →`}
          </button>
        )}
      </article>
    )
  }

  return (
    <div className="space-y-5">
      {toastNode}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-sm text-ink-soft">
            <strong className="tnum">{data.total}</strong> tasks ·{' '}
            <strong className="tnum">{data.done}</strong> done
            {data.overdue > 0 && (
              <span className="ml-2 text-rust-700">{data.overdue} overdue</span>
            )}
          </p>
          {wedding.task_total === 0 && (
            <button className="btn-gold btn-sm"
                    onClick={async () => {
                      const r = await api.post(`/api/weddings/${wedding.id}/generate-plan`)
                      setToast({ message: r.detail }); reload(); onChange?.()
                    }}>
              Generate plan
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
        <button className="btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add task</button>
        <div className="flex gap-1 rounded-lg border border-sand-300 bg-white p-1">
          {['stage', 'phase'].map((g) => (
            <button key={g} onClick={() => setGrouping(g)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                grouping === g ? 'bg-plum-700 text-white' : 'text-ink-soft hover:bg-sand-100'}`}>
              By {g}
            </button>
          ))}
        </div>
        </div>
      </div>

      {grouping === 'stage' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STAGES.map((stage) => {
            const items = data.by_stage[stage] || []
            return (
              <div key={stage} className="space-y-3">
                <div className="flex items-center justify-between px-0.5">
                  <StatusPill status={stage} />
                  <span className="tnum text-xs text-ink-faint">{items.length}</span>
                </div>
                <div className="max-h-[40rem] space-y-2.5 overflow-y-auto pr-1">
                  {items.map((t) => <TaskRow key={t.id} t={t} />)}
                  {!items.length && (
                    <div className="rounded-lg border border-dashed border-sand-300 py-8 text-center text-xs text-ink-faint">
                      empty
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(data.by_phase).map(([phase, items]) => (
            items.length > 0 && (
              <Card key={phase} title={phase}
                    subtitle={`${items.filter((t) => t.stage === 'Done').length} of ${items.length} complete`}>
                <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((t) => <TaskRow key={t.id} t={t} compact />)}
                </div>
              </Card>
            )
          ))}
        </div>
      )}

      {/* ---- staged payments ---- */}
      <Card title="Staged client payments" pad={false}
            subtitle="Booking on signature, advance a month before, final after the event — generated with the plan">
        <table className="w-full">
          <thead className="bg-sand-50">
            <tr>
              <th className="th">Stage</th><th className="th">Share</th>
              <th className="th text-right">Amount</th><th className="th">Due</th>
              <th className="th">Status</th><th className="th text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {wedding.milestones.map((m) => (
              <tr key={m.id} className="hover:bg-sand-50">
                <td className="td font-medium">{m.kind}</td>
                <td className="td tnum text-ink-soft">{m.percent}%</td>
                <td className="td tnum text-right font-medium">{inr(m.amount)}</td>
                <td className="td">
                  <span className={`tnum ${m.overdue ? 'font-medium text-rust-700' : 'text-ink-soft'}`}>
                    {date(m.due_date)}{m.overdue && ' · overdue'}
                  </span>
                </td>
                <td className="td"><StatusPill status={m.status} /></td>
                <td className="td whitespace-nowrap text-right">
                  <EditButton label="" onClick={() => setEditingMs(m)} />
                  {m.status !== 'Paid' ? (
                    <button className="btn-ghost btn-sm"
                            onClick={async () => {
                              await api.patch(`/api/milestones/${m.id}`, { status: 'Paid' })
                              setToast({ message: `${m.kind} of ${inr(m.amount)} recorded.` })
                              onChange?.()
                            }}>
                      Mark received
                    </button>
                  ) : (
                    <span className="tnum text-xs text-ink-faint">{m.reference}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <EditModal open={!!editing} onClose={() => setEditing(null)} title="Edit task"
                 initial={editing || {}}
                 fields={[
                   { name: 'title', label: 'Task', full: true, required: true },
                   { name: 'phase', label: 'Phase', type: 'select', options: PHASES, placeholder: false },
                   { name: 'stage', label: 'Stage', type: 'select', options: STAGES, placeholder: false },
                   { name: 'due_date', label: 'Due', type: 'date' },
                   { name: 'owner_id', label: 'Owner', type: 'select', numeric: true, options: (staff || []).map((x) => ({ value: x.id, label: x.name })) },
                   { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
                 ]}
                 onSubmit={async (v) => {
                   await api.patch(`/api/tasks/${editing.id}`, v)
                   setToast({ message: 'Task updated.' }); reload(); onChange?.()
                 }} />
      <EditModal open={adding} onClose={() => setAdding(false)} title="Add a task"
                 subtitle="Something the plan did not think of" sendAll submitLabel="Add"
                 initial={{ phase: 'Vendors' }}
                 fields={[
                   { name: 'title', label: 'Task', full: true, required: true },
                   { name: 'phase', label: 'Phase', type: 'select', options: PHASES, placeholder: false },
                   { name: 'due_date', label: 'Due', type: 'date' },
                   { name: 'owner_id', label: 'Owner', type: 'select', numeric: true, options: (staff || []).map((x) => ({ value: x.id, label: x.name })), placeholder: 'The wedding’s manager' },
                   { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
                 ]}
                 onSubmit={async (v) => {
                   await api.post(`/api/weddings/${wedding.id}/tasks`, v)
                   setToast({ message: 'Added to the plan.' }); reload(); onChange?.()
                 }} />
      <EditModal open={!!editingMs} onClose={() => setEditingMs(null)} title="Edit payment stage"
                 subtitle={editingMs ? editingMs.kind : ''} initial={editingMs || {}}
                 fields={[
                   { name: 'amount', label: 'Amount (₹)', type: 'number', required: true },
                   { name: 'due_date', label: 'Due date', type: 'date', required: true },
                   { name: 'status', label: 'Status', type: 'select', options: ['Due', 'Invoiced', 'Paid'], placeholder: false },
                   { name: 'reference', label: 'Receipt / UTR reference' },
                 ]}
                 onSubmit={async (v) => {
                   await api.patch(`/api/milestones/${editingMs.id}`, v)
                   setToast({ message: 'Payment stage updated.' }); onChange?.()
                 }} />
    </div>
  )
}
