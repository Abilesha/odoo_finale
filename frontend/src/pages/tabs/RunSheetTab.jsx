import { useState } from 'react'

import { api, date } from '../../api'
import { EditButton, EditModal } from '../../components/kit'
import { Card, Empty, ErrorBox, Spinner, useToast } from '../../components/ui'
import { useApi, usePolling } from '../../hooks'

const DAY_NAMES = { 1: 'Mehendi', 2: 'Sangeet', 3: 'Wedding & Reception' }

const ROW_TONE = {
  Arrived:      'border-l-sage-400 bg-sage-100/40',
  Done:         'border-l-sage-400 bg-sage-100/40',
  'In Progress':'border-l-gold-400 bg-gold-50',
  Late:         'border-l-rust-400 bg-rust-100/60',
  Missed:       'border-l-sand-300 bg-sand-50 opacity-60',
  Pending:      'border-l-sand-300 bg-white',
}

/** Scene 4 — the live board.
 *
 *  Lateness is derived from the clock, never typed: a slot turns red on its
 *  own once its start time plus a grace window has passed without the
 *  responsible vendor checking in.  The planner finds out before the guests
 *  do. */
export default function RunSheetTab({ wedding }) {
  const [sim, setSim] = useState('')
  const path = `/api/runsheet/${wedding.id}${sim ? `?simulate=${sim}` : ''}`
  // poll only against the real clock; a simulated board is frozen in time
  const { data, error, loading, reload } = usePolling(path, 20000, !sim)
  const [day, setDay] = useState(null)
  const [editing, setEditing] = useState(null)
  const [toastNode, setToast] = useToast()
  const staff = useApi('/api/staff')
  const vendors = useApi('/api/contracts?wedding_id=' + wedding.id)

  if (loading) return <Spinner label="Loading the run sheet" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const empty = data.total_slots === 0
  const activeDay = day ?? data.active_day ?? 3

  async function checkIn(slot) {
    try {
      const res = await api.post(`/api/runsheet-items/${slot.id}/checkin`)
      setToast({ message: res.detail })
      reload()
    } catch (e) { setToast({ message: e.message, tone: 'bad' }) }
  }

  async function generate() {
    const res = await api.post(`/api/runsheet/${wedding.id}/generate`)
    setToast({ message: res.detail })
    reload()
  }

  if (empty) {
    return (
      <>
        {toastNode}
        <Empty title="No run sheet yet"
               hint="Build the minute-by-minute schedule across all three days. Each slot carries the responsible vendor and planner, so a delay is spotted the moment it happens."
               action={<button onClick={generate} className="btn-gold mt-3">Generate run sheet</button>} />
      </>
    )
  }

  /** jump the demo clock to a given time on the wedding day */
  const jump = (time) => setSim(`${data.day_dates['3']}T${time}:00`)

  return (
    <div className="space-y-5">
      {toastNode}

      {/* ---- live header ---- */}
      <div className="card flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          {!sim && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sage-600" />
            </span>
          )}
          <div>
            <p className="tnum font-display text-xl font-semibold text-ink">
              {data.server_time}
              {sim && <span className="ml-2 text-xs font-normal text-gold-700">simulated</span>}
            </p>
            <p className="text-xs text-ink-faint">
              {date(data.server_date)}
              {data.active_day && <> · running day {data.active_day}</>}
              {!sim && ' · refreshing every 20s'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="tnum text-sm font-medium text-ink">
              {data.completed_slots}/{data.total_slots} slots
            </p>
            <p className="text-xs text-ink-faint">{data.progress_pct}% complete</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-ink-faint">Demo clock:</span>
            {['09:45', '10:35', '12:40', '19:20'].map((t) => (
              <button key={t} onClick={() => jump(t)}
                className={`rounded px-2 py-1 text-[11px] font-medium tnum transition-colors ${
                  sim?.endsWith(`${t}:00`)
                    ? 'bg-gold-500 text-white' : 'bg-sand-200 text-ink-soft hover:bg-sand-300'}`}>
                {t}
              </button>
            ))}
            {sim && (
              <button onClick={() => setSim('')}
                      className="rounded px-2 py-1 text-[11px] font-medium text-plum-600 hover:underline">
                live
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---- alerts ---- */}
      {data.alerts.length > 0 ? (
        <div className="card border-rust-400/50 bg-rust-100 p-4">
          <p className="mb-3 text-sm font-semibold text-rust-700">
            {data.alerts.length} running late — fix before the guests notice
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {data.alerts.map((a) => (
              <div key={a.slot_id}
                   className="flex items-center justify-between gap-3 rounded-lg bg-white p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{a.title}</p>
                  <p className="text-xs text-ink-faint">
                    {a.vendor} · scheduled {a.scheduled} ·{' '}
                    <span className="font-medium text-rust-700">{a.minutes_late} min late</span>
                  </p>
                  <p className="text-xs text-ink-faint">Owner: {a.owner}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  {a.vendor_phone && (
                    <a href={`tel:${a.vendor_phone.replace(/\s/g, '')}`} className="btn-ghost btn-sm">
                      Call
                    </a>
                  )}
                  <button onClick={() => checkIn({ id: a.slot_id })} className="btn-gold btn-sm">
                    Arrived
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card border-sage-400/40 bg-sage-100 px-4 py-3 text-sm text-sage-700">
          Everything on schedule — no vendor is running late right now.
        </div>
      )}

      {/* ---- day tabs ---- */}
      <div className="flex gap-1 rounded-lg border border-sand-300 bg-white p-1">
        {[1, 2, 3].map((d) => (
          <button key={d} onClick={() => setDay(d)}
            className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
              activeDay === d ? 'bg-plum-700 text-white' : 'text-ink-soft hover:bg-sand-100'}`}>
            Day {d} · {DAY_NAMES[d]}
            {data.day_dates?.[d] && (
              <span className="ml-1.5 opacity-70">{date(data.day_dates[d], { year: false })}</span>
            )}
          </button>
        ))}
      </div>

      {/* ---- the schedule ---- */}
      <Card pad={false}>
        <div className="divide-y divide-sand-200">
          {(data.days[activeDay] || []).map((s) => (
            <div key={s.id}
                 className={`flex items-start gap-4 border-l-4 px-4 py-3 ${ROW_TONE[s.status] || ROW_TONE.Pending}`}>
              <div className="w-20 shrink-0 text-right">
                <p className="tnum text-sm font-semibold text-ink">{s.start_time}</p>
                {s.end_time && <p className="tnum text-[11px] text-ink-faint">to {s.end_time}</p>}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{s.title}</p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {s.location}
                  {s.vendor && <> · {s.vendor}</>}
                  {s.owner && <> · owner {s.owner}</>}
                </p>
                {s.notes && (
                  <p className="mt-1.5 rounded bg-white/70 px-2 py-1 text-xs text-rust-700">
                    {s.notes}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <div className="text-right">
                  <p className={`text-xs font-medium ${
                    s.status === 'Late' ? 'text-rust-700'
                      : s.status === 'Arrived' || s.status === 'Done' ? 'text-sage-700'
                      : s.status === 'In Progress' ? 'text-gold-700' : 'text-ink-faint'}`}>
                    {s.status}
                  </p>
                  {s.checked_in_at && (
                    <p className="tnum text-[11px] text-ink-faint">in at {s.checked_in_at}</p>
                  )}
                  {s.status === 'Late' && (
                    <p className="tnum text-[11px] text-rust-700">{s.minutes_late} min</p>
                  )}
                </div>
                {!s.checked_in_at && s.status !== 'Done' && (
                  <button onClick={() => checkIn(s)} className="btn-ghost btn-sm">
                    Check in
                  </button>
                )}
                <EditButton label="" onClick={() => setEditing(s)} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <EditModal open={!!editing} onClose={() => setEditing(null)} title="Edit slot"
                 subtitle="Move it, rename it, or hand it to someone else"
                 initial={editing ? {
                   ...editing,
                   owner_id: (staff.data || []).find((x) => x.name === editing.owner)?.id ?? '',
                 } : {}}
                 fields={[
                   { name: 'title', label: 'What happens', full: true, required: true },
                   { name: 'start_time', label: 'Starts', type: 'time', required: true },
                   { name: 'end_time', label: 'Ends', type: 'time' },
                   { name: 'location', label: 'Where' },
                   { name: 'grace_minutes', label: 'Grace before “late” (min)', type: 'number' },
                   { name: 'vendor_id', label: 'Vendor responsible', type: 'select', numeric: true,
                     options: (vendors.data || []).map((c) => ({ value: c.vendor_id, label: `${c.vendor} — ${c.category}` })) },
                   { name: 'owner_id', label: 'Team member responsible', type: 'select', numeric: true,
                     options: (staff.data || []).map((x) => ({ value: x.id, label: x.name })) },
                   { name: 'notes', label: 'Note on the board', type: 'textarea', rows: 2 },
                 ]}
                 onSubmit={async (v) => {
                   const res = await api.patch(`/api/runsheet-items/${editing.id}`, v)
                   setToast({ message: res.detail }); reload()
                 }} />
    </div>
  )
}
