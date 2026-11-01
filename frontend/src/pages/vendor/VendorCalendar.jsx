import { useMemo, useState } from 'react'

import { api } from '../../api'
import { PageHead } from '../../components/kit'
import { Card, ErrorBox, Spinner, useToast } from '../../components/ui'
import { useApi } from '../../hooks'

const BRUSHES = [
  { id: 'Available', label: 'Open', cell: 'bg-white', chip: 'border-sand-300 bg-white text-ink' },
  { id: 'Limited', label: 'Limited', cell: 'bg-gold-100', chip: 'border-gold-400 bg-gold-100 text-gold-700' },
  { id: 'Unavailable', label: 'Unavailable', cell: 'bg-rust-100', chip: 'border-rust-400 bg-rust-100 text-rust-700' },
]
const CELL = {
  Available: 'bg-white hover:bg-sand-100',
  Limited: 'bg-gold-100 hover:bg-gold-200',
  Unavailable: 'bg-rust-100 hover:bg-rust-100/70',
  Booked: 'bg-jade-100',
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** The vendor's calendar.  Pick a brush, paint the days, save.  Days booked
 *  through The Royal Knot fill themselves in from contracts. */
export default function VendorCalendar() {
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const start = iso(month)
  const { data, error, loading, reload } = useApi(`/api/vendor-portal/availability?start=${start}&days=42`)
  const [brush, setBrush] = useState('Unavailable')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState({})
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useToast()

  const byDay = useMemo(() => Object.fromEntries((data?.days || []).map((d) => [d.day, d])), [data])

  if (loading && !data) return <Spinner label="Opening your calendar" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const first = new Date(month)
  const lead = (first.getDay() + 6) % 7 // weeks start on Monday
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const body = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))]
  // finish the last week so the grid is a clean rectangle
  const cells = [...body, ...Array((7 - (body.length % 7)) % 7).fill(null)]
  const todayIso = iso(new Date())

  function paint(d) {
    const key = iso(d)
    const cur = byDay[key]
    if (cur?.status === 'Booked' && !cur.marked) return // contracted days are not yours to clear
    setPending((p) => ({ ...p, [key]: { day: key, status: brush, note: brush === 'Available' ? null : note || null } }))
  }

  async function save() {
    setBusy(true)
    try {
      const res = await api.put('/api/vendor-portal/availability', { days: Object.values(pending) })
      setPending({}); setToast({ message: res.detail }); reload()
    } catch (e) { setToast({ message: e.message, tone: 'bad' }) } finally { setBusy(false) }
  }

  const shift = (n) => { const d = new Date(month); d.setMonth(d.getMonth() + n); setMonth(d); setPending({}) }
  const monthDays = (data?.days || []).filter((d) => d.day.slice(0, 7) === start.slice(0, 7))
  const count = (s) => monthDays.filter((d) => d.status === s).length

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Calendar"
        title="When you can work"
        sub="Managers see this before they invite you. Days you are booked through The Royal Knot fill in on their own."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <Card pad={false}>
          <div className="flex items-center justify-between border-b border-sand-200 px-5 py-4">
            <button className="btn-ghost btn-sm" onClick={() => shift(-1)}>←</button>
            <h2 className="font-display text-2xl text-ink">
              {month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </h2>
            <button className="btn-ghost btn-sm" onClick={() => shift(1)}>→</button>
          </div>
          <div className="grid grid-cols-7 border-b border-sand-200 bg-sand-50 text-center text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              if (!d) return <div key={`b${i}`} className="aspect-square border-b border-r border-sand-200 bg-sand-50/50" />
              const key = iso(d)
              const info = byDay[key]
              const p = pending[key]
              const status = p ? p.status : info?.status || 'Available'
              const booked = info?.status === 'Booked'
              return (
                <button key={key} onClick={() => paint(d)} title={info?.note || (booked ? `Booked: ${info.booked_for.join(', ')}` : '')}
                        className={`relative flex aspect-square flex-col items-start justify-between border-b border-r border-sand-200 p-1.5 text-left transition-colors sm:p-2 ${
                          booked && !p ? CELL.Booked + ' cursor-default' : CELL[status]} ${p ? 'ring-2 ring-inset ring-jade-500' : ''}`}>
                  <span className={`tnum text-xs font-semibold sm:text-sm ${key === todayIso ? 'flex h-6 w-6 items-center justify-center rounded-full bg-jade-700 text-white' : 'text-ink'}`}>
                    {d.getDate()}
                  </span>
                  <span className="w-full truncate text-[9px] leading-tight sm:text-[10px]">
                    {booked && !p ? <span className="font-semibold text-jade-700">{info.booked_for[0]}</span>
                      : status === 'Unavailable' ? <span className="text-rust-700">Away</span>
                      : status === 'Limited' ? <span className="text-gold-700">Limited</span> : null}
                    {(p?.note || info?.note) && !booked && <span className="block truncate text-ink-faint">{p?.note || info?.note}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Paint the days" subtitle="Pick a brush, then click days">
            <div className="space-y-2">
              {BRUSHES.map((b) => (
                <button key={b.id} onClick={() => setBrush(b.id)}
                        className={`flex w-full items-center gap-3 rounded-lg border-2 px-3 py-2 text-left text-sm font-medium transition-all ${
                          brush === b.id ? b.chip : 'border-sand-200 text-ink-soft'}`}>
                  <span className={`h-4 w-4 rounded border border-sand-300 ${b.cell}`} />{b.label}
                </button>
              ))}
            </div>
            {brush !== 'Available' && (
              <div className="mt-3">
                <label className="label">Note (optional)</label>
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Family wedding" />
              </div>
            )}
            <button className="btn mt-4 w-full bg-jade-700 text-white hover:bg-jade-800" disabled={!Object.keys(pending).length || busy} onClick={save}>
              {busy ? 'Saving…' : `Save ${Object.keys(pending).length || ''} change${Object.keys(pending).length === 1 ? '' : 's'}`}
            </button>
            {Object.keys(pending).length > 0 && (
              <button className="mt-2 w-full text-xs text-ink-faint hover:underline" onClick={() => setPending({})}>Discard</button>
            )}
          </Card>

          <Card title="This month">
            <dl className="space-y-2 text-sm">
              {[
                ['Booked through The Royal Knot', count('Booked'), 'bg-jade-100'],
                ['Limited', count('Limited'), 'bg-gold-100'],
                ['Unavailable', count('Unavailable'), 'bg-rust-100'],
              ].map(([k, v, c]) => (
                <div key={k} className="flex items-center justify-between">
                  <dt className="flex items-center gap-2 text-ink-soft"><span className={`h-3 w-3 rounded ${c}`} />{k}</dt>
                  <dd className="tnum font-semibold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[11px] text-ink-faint">
              You can take {data?.max_events_per_day || 1} event{(data?.max_events_per_day || 1) > 1 ? 's' : ''} a day — change it under Capacity.
            </p>
          </Card>
        </div>
      </div>
      {toast}
    </div>
  )
}
