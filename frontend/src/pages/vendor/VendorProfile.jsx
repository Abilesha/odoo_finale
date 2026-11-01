import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { api, inr } from '../../api'
import { PageHead } from '../../components/kit'
import { Card, ErrorBox, Spinner, useToast } from '../../components/ui'
import { useApi } from '../../hooks'

const FIELDS = [
  ['contact_person', 'Contact person', 'text'],
  ['phone', 'Phone', 'text'],
  ['city', 'Based in', 'text'],
  ['service_cities', 'Cities you work in', 'text', 'Comma-separated — e.g. Jaipur, Udaipur, Jodhpur'],
  ['max_guests', 'Largest wedding you can handle (guests)', 'number', 'Leave blank if headcount does not limit you'],
  ['team_size', 'Team size', 'number'],
  ['max_events_per_day', 'Events you can do in one day', 'number', 'Two crews? Say 2 — you will not be shown as booked after one.'],
  ['lead_time_days', 'Notice you need (days)', 'number'],
  ['min_order_value', 'Minimum order (₹)', 'number'],
]

/** What the vendor can take on.  Every number here is read when a manager
 *  decides who to invite — so keeping it honest is how a vendor stops getting
 *  requests they will only have to turn down. */
export default function VendorProfile() {
  const { data, error, loading, reload } = useApi('/api/vendor-portal/me')
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [toast, setToast] = useToast()

  useEffect(() => {
    if (!data) return
    const p = data.profile
    const f = {}
    for (const [k] of FIELDS) f[k] = p[k] ?? ''
    f.capabilities = (p.capabilities || []).join('\n')
    f.notes = p.notes || ''
    setForm(f)
  }, [data])

  if (loading || !form) return <Spinner label="Loading your profile" />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  const p = data.profile

  async function save(e) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const body = {}
    for (const [k, , type] of FIELDS) body[k] = form[k] === '' ? null : type === 'number' ? Number(form[k]) : form[k]
    body.capabilities = form.capabilities || null
    body.notes = form.notes || null
    try {
      const res = await api.patch('/api/vendor-portal/me', body)
      setToast({ message: res.detail }); reload()
    } catch (e2) { setErr(e2) } finally { setBusy(false) }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Capacity"
        title={p.name}
        sub={`${p.category} · keep this honest and you only get requests you can say yes to`}
        action={<Link to="/profile" className="btn-ghost">My profile & password</Link>}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <form onSubmit={save}>
          <Card title="What you can take on" subtitle="Managers see this every time they choose who to invite">
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map(([k, label, type, help]) => (
                <div key={k}>
                  <label className="label" htmlFor={k}>{label}</label>
                  <input id={k} type={type} min={0} className="input" value={form[k]} onChange={set(k)} />
                  {help && <p className="mt-1 text-[11px] text-ink-faint">{help}</p>}
                </div>
              ))}
              <div className="sm:col-span-2">
                <label className="label">What you can handle (one per line)</label>
                <textarea rows={4} className="input" value={form.capabilities} onChange={set('capabilities')}
                          placeholder={'Mandap design\nFloral installations\nStage and lighting'} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Anything else managers should know</label>
                <textarea rows={2} className="input" value={form.notes} onChange={set('notes')} />
              </div>
            </div>
            <ErrorBox error={err} />
            <div className="mt-4 flex justify-end border-t border-sand-200 pt-4">
              <button className="btn bg-jade-700 text-white hover:bg-jade-800" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </Card>
        </form>

        <div className="space-y-4">
          <Card title="How managers see you">
            <div className="rounded-xl border border-sand-200 p-4">
              <p className="font-display text-xl text-ink">{p.name}</p>
              <p className="text-xs text-ink-faint">{p.category} · {p.city}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-sand-50 p-2"><p className="tnum font-semibold">{p.quality_rating}</p><p className="text-[10px] text-ink-faint">rating</p></div>
                <div className="rounded-lg bg-sand-50 p-2"><p className="tnum font-semibold">{p.on_time_pct}%</p><p className="text-[10px] text-ink-faint">on time</p></div>
                <div className="rounded-lg bg-sand-50 p-2"><p className="tnum font-semibold">{p.jobs_completed}</p><p className="text-[10px] text-ink-faint">slots</p></div>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-ink-soft">
                {p.max_guests && <li>Up to {p.max_guests} guests</li>}
                <li>{p.max_events_per_day || 1} event(s) a day · team of {p.team_size || '—'}</li>
                {p.service_cities && <li>Works in {p.service_cities}</li>}
                {p.lead_time_days && <li>Needs {p.lead_time_days} days’ notice</li>}
                {p.min_order_value && <li>Minimum order {inr(p.min_order_value)}</li>}
              </ul>
              {p.capabilities.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {p.capabilities.map((c) => <span key={c} className="pill bg-jade-50 text-jade-700">{c}</span>)}
                </div>
              )}
            </div>
            <p className="mt-3 text-[11px] text-ink-faint">
              Rating and punctuality come from The Royal Knot’s own records — check-in times on the
              day and how your bills matched what was agreed.
            </p>
          </Card>
        </div>
      </div>

      {toast}
    </div>
  )
}
