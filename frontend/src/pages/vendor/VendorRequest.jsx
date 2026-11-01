import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { api, date, inr } from '../../api'
import { Countdown } from '../../components/kit'
import { Card, ErrorBox, Modal, Spinner, useToast } from '../../components/ui'
import { useApi } from '../../hooks'
import { FitNote, RequestStatePill } from './shared'

const UNITS = [
  { value: 'flat', label: 'Flat' },
  { value: 'per plate', label: 'Per plate' },
  { value: 'per person', label: 'Per person' },
  { value: 'per day', label: 'Per day' },
  { value: 'per hour', label: 'Per hour' },
]

/** Starting lines by job type, so a vendor is editing a quote rather than
 *  staring at an empty table. */
const STARTERS = {
  Caterer: [
    ['Welcome drinks (Day 1)', 'per plate', 1, 0],
    ['Mehendi lunch (Day 1)', 'per plate', 1, 0],
    ['Sangeet dinner (Day 2)', 'per plate', 1, 0],
    ['Wedding lunch (Day 3)', 'per plate', 1, 0],
    ['Reception dinner (Day 3)', 'per plate', 1, 0],
    ['Service staff (3 days)', 'flat', 1, 0],
  ],
  Decorator: [
    ['Mehendi décor (Day 1)', 'flat', 1, 0],
    ['Sangeet stage and seating (Day 2)', 'flat', 1, 0],
    ['Wedding mandap (Day 3)', 'flat', 1, 0],
    ['Reception stage (Day 3)', 'flat', 1, 0],
  ],
}
const starter = (cat) => (STARTERS[cat] || [
  ['Day 1', 'flat', 1, 0], ['Day 2', 'flat', 1, 0], ['Day 3', 'flat', 1, 0],
]).map(([description, unit, quantity, unit_price]) => ({ description, unit, quantity, unit_price }))

/** Same rule the agency's comparison uses: a per-plate line with quantity 1
 *  means "per plate, for every guest". */
function lineTotal(l, guests) {
  const q = Number(l.quantity) || 0
  const p = Number(l.unit_price) || 0
  if (l.unit === 'per plate' || l.unit === 'per person') return (q > 1 ? q : guests) * p
  return q * p
}

export default function VendorRequest() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: r, error, loading, reload } = useApi(`/api/vendor-portal/requests/${id}`)
  const [lines, setLines] = useState([])
  const [gst, setGst] = useState(18)
  const [logistics, setLogistics] = useState(0)
  const [extraHour, setExtraHour] = useState(0)
  const [validity, setValidity] = useState(15)
  const [inc, setInc] = useState('')
  const [exc, setExc] = useState('')
  const [notes, setNotes] = useState('')
  const [cost, setCost] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [toast, setToast] = useToast()

  useEffect(() => {
    if (!r) return
    const q = r.quote
    setLines(q.lines.length ? q.lines.map((l) => ({ ...l })) : starter(r.category))
    setGst(q.lines.length ? q.gst_percent : 18)
    setLogistics(q.logistics_fee || 0)
    setExtraHour(q.extra_hour_rate || 0)
    setValidity(q.validity_days || 15)
    setInc(q.inclusions || '')
    setExc(q.exclusions || '')
    setNotes(q.notes || '')
    setCost(q.vendor_cost_estimate ?? '')
  }, [r])

  const guests = r?.guest_count || 0
  const calc = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + lineTotal(l, guests), 0)
    const preTax = subtotal + (Number(logistics) || 0)
    const tax = preTax * (Number(gst) || 0) / 100
    const total = preTax + tax
    const c = cost === '' ? null : Number(cost)
    // GST is collected for the government, so profit is on the pre-tax figure
    const profit = c == null ? null : preTax - c
    return {
      subtotal, preTax, tax, total,
      perGuest: guests ? total / guests : 0,
      profit, margin: c == null || !preTax ? null : (100 * profit) / preTax,
    }
  }, [lines, logistics, gst, cost, guests])

  if (loading) return <Spinner label="Opening the request" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const editable = r.state === 'New' || r.state === 'Submitted' || r.state === 'Declined'
  const canEdit = editable && r.open !== false
  const e = r.event

  const setLine = (i, k) => (ev) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: ev.target.value } : l)))
  const addLine = () => setLines((ls) => [...ls, { description: '', unit: 'flat', quantity: 1, unit_price: 0 }])
  const removeLine = (i) => setLines((ls) => ls.filter((_, j) => j !== i))

  async function submit(ev) {
    ev.preventDefault()
    const clean = lines.filter((l) => l.description.trim() && Number(l.unit_price) > 0)
    if (!clean.length) { setErr(new Error('Add at least one priced line.')); return }
    setBusy(true); setErr(null)
    try {
      const res = await api.post(`/api/vendor-portal/requests/${r.quote_id}/submit`, {
        lines: clean.map((l) => ({
          description: l.description.trim(), unit: l.unit,
          quantity: Number(l.quantity) || 1, unit_price: Number(l.unit_price),
        })),
        gst_percent: Number(gst) || 0,
        logistics_fee: Number(logistics) || 0,
        extra_hour_rate: Number(extraHour) || 0,
        validity_days: Number(validity) || 15,
        inclusions: inc || null,
        exclusions: exc || null,
        notes: notes || null,
        vendor_cost_estimate: cost === '' ? null : Number(cost),
      })
      setToast({ message: res.detail }); reload()
    } catch (e2) { setErr(e2) } finally { setBusy(false) }
  }

  async function decline() {
    try {
      const res = await api.post(`/api/vendor-portal/requests/${r.quote_id}/decline`, { reason })
      setDeclining(false); setToast({ message: res.detail })
      setTimeout(() => navigate('/requests'), 900)
    } catch (e2) { setToast({ message: e2.message, tone: 'bad' }) }
  }

  return (
    <div className="space-y-6">
      <Link to="/requests" className="text-xs text-jade-700 hover:underline">← All requests</Link>

      {/* ---- the brief ---- */}
      <section className="card overflow-hidden">
        <div className="grid gap-6 bg-jade-900 p-6 text-sand-50 lg:grid-cols-[1fr_auto]">
          <div>
            <RequestStatePill state={r.state} />
            <h1 className="mt-3 font-display text-3xl">{r.title}</h1>
            <p className="mt-1 text-jade-200">
              {e.couple_name} · {e.venue} · {e.city}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                ['Dates', `${date(e.day1_date, { year: false })} – ${date(e.day3_date)}`],
                ['Guests', r.guest_count],
                ['Theme', e.theme || '—'],
                ['Manager', e.manager ? `${e.manager}${e.manager_phone ? ` · ${e.manager_phone}` : ''}` : '—'],
                ['Competing', `${r.competing} vendors invited`],
              ].map(([k, v]) => (
                <span key={k} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs">
                  <span className="text-jade-300">{k}</span> <span className="font-medium">{v}</span>
                </span>
              ))}
            </div>
          </div>
          {r.state === 'New' && r.respond_by && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-300">Reply by {date(r.respond_by, { year: false })}</p>
              <div className="mt-3"><Countdown to={`${r.respond_by}T18:00:00`} tone="dark" doneLabel="Past the reply date" /></div>
            </div>
          )}
        </div>
        <div className="grid gap-6 p-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">What they need</p>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{r.scope || 'No scope given — ask the manager.'}</p>
          </div>
          <div className="rounded-xl border border-sand-200 bg-sand-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Can you do it?</p>
            <div className="mt-2"><FitNote fit={r.fit} /></div>
            <p className="mt-3 text-[11px] text-ink-faint">
              Checked against your <Link to="/calendar" className="text-jade-700 underline">calendar</Link> and{' '}
              <Link to="/capacity" className="text-jade-700 underline">capacity</Link>.
            </p>
          </div>
        </div>
      </section>

      {r.state === 'Won' && (
        <div className="card border-sage-400/50 bg-sage-100 p-5 text-sage-700">
          <p className="font-display text-xl">You won this one.</p>
          <p className="text-sm">It is in <Link to="/jobs" className="underline">My jobs</Link> — post progress there as the work moves.</p>
        </div>
      )}
      {r.state === 'Not selected' && (
        <div className="card p-5 text-sm text-ink-soft">The couple chose another vendor for this one. Your price stays on record below.</div>
      )}

      {/* ---- the calculator ---- */}
      <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card title="Your price, line by line"
              subtitle={`Per-plate lines with quantity 1 are multiplied by all ${guests} guests — exactly how the manager’s comparison reads them.`}
              pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-sand-50">
                <tr>
                  <th className="th">Item</th><th className="th w-32">Unit</th>
                  <th className="th w-20 text-right">Qty</th><th className="th w-32 text-right">Rate (₹)</th>
                  <th className="th w-32 text-right">Line total</th><th className="th w-8" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="td"><input disabled={!canEdit} className="input" value={l.description} onChange={setLine(i, 'description')} placeholder="What is it?" /></td>
                    <td className="td">
                      <select disabled={!canEdit} className="input" value={l.unit} onChange={setLine(i, 'unit')}>
                        {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                    </td>
                    <td className="td"><input disabled={!canEdit} type="number" min={0} className="input text-right" value={l.quantity} onChange={setLine(i, 'quantity')} /></td>
                    <td className="td"><input disabled={!canEdit} type="number" min={0} className="input text-right" value={l.unit_price} onChange={setLine(i, 'unit_price')} /></td>
                    <td className="td tnum text-right font-medium">
                      {inr(lineTotal(l, guests))}
                      {(l.unit === 'per plate' || l.unit === 'per person') && Number(l.quantity) <= 1 && (
                        <p className="text-[10px] font-normal text-ink-faint">× {guests} guests</p>
                      )}
                    </td>
                    <td className="td">{canEdit && <button type="button" onClick={() => removeLine(i)} className="text-ink-faint hover:text-rust-700">✕</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="border-t border-sand-200 px-5 py-3">
              <button type="button" onClick={addLine} className="btn-ghost btn-sm">+ Add a line</button>
            </div>
          )}
          <div className="grid gap-4 border-t border-sand-200 p-5 sm:grid-cols-2">
            <div>
              <label className="label">What is included (one per line)</label>
              <textarea disabled={!canEdit} rows={4} className="input" value={inc} onChange={(ev) => setInc(ev.target.value)}
                        placeholder={'Fresh florals\nLighting\nSetup and teardown'} />
            </div>
            <div>
              <label className="label">What is not included (one per line)</label>
              <textarea disabled={!canEdit} rows={4} className="input" value={exc} onChange={(ev) => setExc(ev.target.value)}
                        placeholder={'Generator hire\nImported flowers'} />
              <p className="mt-1 text-[11px] text-ink-faint">Be honest here — the manager’s comparison scores how much of the scope you cover.</p>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Note to the manager</label>
              <textarea disabled={!canEdit} rows={2} className="input" value={notes} onChange={(ev) => setNotes(ev.target.value)}
                        placeholder="Rate held for 15 days. Site visit available any weekday." />
            </div>
          </div>
        </Card>

        <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Card title="Totals">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">GST %</label><input disabled={!canEdit} type="number" min={0} max={28} className="input" value={gst} onChange={(ev) => setGst(ev.target.value)} /></div>
              <div><label className="label">Travel & setup (₹)</label><input disabled={!canEdit} type="number" min={0} className="input" value={logistics} onChange={(ev) => setLogistics(ev.target.value)} /></div>
              <div><label className="label">Extra hour (₹)</label><input disabled={!canEdit} type="number" min={0} className="input" value={extraHour} onChange={(ev) => setExtraHour(ev.target.value)} /></div>
              <div><label className="label">Valid for (days)</label><input disabled={!canEdit} type="number" min={1} className="input" value={validity} onChange={(ev) => setValidity(ev.target.value)} /></div>
            </div>
            <dl className="mt-4 space-y-1.5 border-t border-sand-200 pt-4 text-sm">
              {[
                ['Subtotal', calc.subtotal],
                ['Travel & setup', Number(logistics) || 0],
                [`GST ${gst}%`, calc.tax],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between"><dt className="text-ink-faint">{k}</dt><dd className="tnum">{inr(v)}</dd></div>
              ))}
              <div className="flex items-end justify-between border-t border-sand-200 pt-3">
                <dt className="font-medium text-ink">All-in total</dt>
                <dd className="tnum font-display text-3xl font-semibold text-jade-700">{inr(calc.total)}</dd>
              </div>
              <p className="text-right text-[11px] text-ink-faint">{inr(calc.perGuest)} per guest · what the manager sees</p>
            </dl>
          </Card>

          <Card title="Your margin" subtitle="Private — never shown to The Royal Knot">
            <label className="label">What it costs you to deliver (₹)</label>
            <input disabled={!canEdit} type="number" min={0} className="input" value={cost} onChange={(ev) => setCost(ev.target.value)}
                   placeholder="Materials, labour, transport" />
            {calc.profit != null && (
              <div className={`mt-3 rounded-lg px-3 py-2 ${calc.profit >= 0 ? 'bg-jade-50' : 'bg-rust-100'}`}>
                <p className="text-[11px] text-ink-faint">You keep (before tax)</p>
                <p className={`tnum font-display text-2xl font-semibold ${calc.profit >= 0 ? 'text-jade-700' : 'text-rust-700'}`}>
                  {inr(calc.profit)} <span className="text-sm">· {calc.margin?.toFixed(1)}%</span>
                </p>
              </div>
            )}
          </Card>

          <ErrorBox error={err} />
          {canEdit && (
            <div className="space-y-2">
              <button className="btn w-full bg-jade-700 py-3 text-white hover:bg-jade-800" disabled={busy}>
                {busy ? 'Sending…' : r.state === 'Submitted' ? 'Send revised quote' : `Send quote · ${inr(calc.total, { compact: true })}`}
              </button>
              {r.state !== 'Declined' && (
                <button type="button" onClick={() => setDeclining(true)} className="btn-ghost w-full">Can’t do it — decline</button>
              )}
            </div>
          )}
        </div>
      </form>

      <Modal open={declining} onClose={() => setDeclining(false)} title="Decline this request"
             subtitle="Saying no early lets the manager invite someone else today">
        <label className="label">Why?</label>
        <input className="input" value={reason} onChange={(ev) => setReason(ev.target.value)}
               placeholder="Already booked on day two" />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setDeclining(false)}>Cancel</button>
          <button className="btn bg-rust-600 text-white hover:bg-rust-700" disabled={reason.trim().length < 2} onClick={decline}>Decline</button>
        </div>
      </Modal>
      {toast}
    </div>
  )
}
