import { useState } from 'react'
import { Link } from 'react-router-dom'

import { api, date, inr } from '../../api'
import { EditButton, EditModal, HealthPill } from '../../components/kit'
import {
  Card, Empty, ErrorBox, Modal, ProgressBar, Spinner, StatusPill, useToast,
} from '../../components/ui'
import { useApi } from '../../hooks'

/** Scene 2 from the wedding's side: float an RFQ to three vendors in a
 *  category, then compare and award on one screen. */
function NewRFQ({ wedding, open, onClose, onCreated }) {
  // with the wedding id, every vendor carries whether they can actually do it
  const { data: vendors } = useApi(open ? `/api/vendors?wedding_id=${wedding.id}` : null)
  const [category, setCategory] = useState('Caterer')
  const [picked, setPicked] = useState([])
  const [title, setTitle] = useState('')
  const [scope, setScope] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const categories = [...new Set((vendors || []).map((v) => v.category))].sort()
  const inCategory = (vendors || []).filter((v) => v.category === category)

  const toggle = (id) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const res = await api.post('/api/rfqs', {
        wedding_id: wedding.id,
        category,
        title: title || `${category} for ${wedding.guest_count} guests — 3 days`,
        scope: scope || null,
        guest_count: wedding.guest_count,
        vendor_ids: picked,
      })
      onCreated(res); onClose(); setPicked([]); setTitle(''); setScope('')
    } catch (e2) { setErr(e2) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} wide title="Request quotes"
           subtitle="One request, several vendors, one decision — instead of three WhatsApp threads">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Category</label>
            <select className="input" value={category}
                    onChange={(e) => { setCategory(e.target.value); setPicked([]) }}>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)}
                   placeholder={`${category} for ${wedding.guest_count} guests — 3 days`} />
          </div>
        </div>

        <div>
          <label className="label">Scope sent to every vendor</label>
          <textarea rows={3} className="input" value={scope} onChange={(e) => setScope(e.target.value)}
                    placeholder="Welcome drinks, Mehendi lunch, Sangeet dinner, wedding lunch and reception dinner…" />
          <p className="mt-1.5 text-xs text-ink-faint">
            The same scope to everyone is what makes the quotes comparable later.
          </p>
        </div>

        <div>
          <label className="label">Invite vendors ({picked.length} selected)</label>
          <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
            {inCategory.map((v) => {
              const fit = v.fit
              const blocked = fit && !fit.ok
              return (
              <button key={v.id} type="button" onClick={() => toggle(v.id)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  picked.includes(v.id)
                    ? 'border-plum-500 bg-plum-50'
                    : blocked ? 'border-rust-400/40 bg-rust-100/40 hover:bg-rust-100/60'
                    : 'border-sand-300 bg-white hover:bg-sand-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{v.name}</p>
                  {fit && (
                    <span className={`pill ${fit.label === 'Fits' ? 'bg-sage-100 text-sage-700'
                      : fit.label === 'Check' ? 'bg-gold-100 text-gold-700' : 'bg-rust-100 text-rust-700'}`}>
                      {fit.label}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {v.city} · ★ {v.quality_rating} · {v.on_time_pct}% on time
                  {v.max_guests && ` · up to ${v.max_guests} guests`}
                  {v.has_portal && ' · prices in their portal'}
                </p>
                {fit && [...fit.problems, ...fit.warnings].slice(0, 2).map((x) => (
                  <p key={x} className={`mt-1 text-[11px] ${fit.problems.includes(x) ? 'text-rust-700' : 'text-gold-700'}`}>
                    {fit.problems.includes(x) ? '✕' : '!'} {x}
                  </p>
                ))}
              </button>
              )
            })}
          </div>
        </div>

        <ErrorBox error={err} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button disabled={busy || !picked.length} className="btn-primary">
            {busy ? 'Sending…' : `Send to ${picked.length} vendor${picked.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000)
  if (m < 60) return `${Math.max(m, 1)} min ago`
  if (m < 1440) return `${Math.round(m / 60)}h ago`
  return `${Math.round(m / 1440)}d ago`
}

export default function VendorsTab({ wedding, onChange }) {
  const rfqs = useApi(`/api/rfqs?wedding_id=${wedding.id}`)
  const updates = useApi(`/api/weddings/${wedding.id}/vendor-updates`)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [toastNode, setToast] = useToast()

  async function ack(u) {
    try {
      const res = await api.post(`/api/vendor-updates/${u.id}/ack`)
      setToast({ message: res.detail }); updates.reload()
    } catch (e) { setToast({ message: e.message, tone: 'bad' }) }
  }

  if (rfqs.loading) return <Spinner label="Loading vendors" />
  if (rfqs.error) return <ErrorBox error={rfqs.error} onRetry={rfqs.reload} />

  const committed = wedding.contracts.reduce((s, c) => s + c.agreed_amount, 0)
  const advanced = wedding.contracts.reduce((s, c) => s + c.advance_paid, 0)

  return (
    <div className="space-y-5">
      {toastNode}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          <strong className="tnum">{wedding.contracts.length}</strong> vendors contracted ·{' '}
          <strong className="tnum">{inr(committed, { compact: true })}</strong> committed ·{' '}
          <strong className="tnum">{inr(advanced, { compact: true })}</strong> advanced
        </p>
        <button onClick={() => setCreating(true)} className="btn-primary btn-sm">
          + Request quotes
        </button>
      </div>

      {/* ---- open RFQs ---- */}
      {rfqs.data.length > 0 && (
        <Card title="Quote requests" pad={false}
              subtitle="Compare side by side, line by line, normalised to cost per plate">
          <table className="w-full">
            <thead className="bg-sand-50">
              <tr>
                <th className="th">Request</th><th className="th">Category</th>
                <th className="th text-center">Replies</th><th className="th">Status</th>
                <th className="th text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rfqs.data.map((r) => (
                <tr key={r.id} className="hover:bg-sand-50">
                  <td className="td">{r.title}</td>
                  <td className="td text-ink-soft">{r.category}</td>
                  <td className="td tnum text-center text-ink-soft">
                    {r.received_count}/{r.quote_count}
                    {r.declined_count > 0 && <p className="text-[10px] text-rust-700">{r.declined_count} declined</p>}
                  </td>
                  <td className="td">
                    <StatusPill status={r.status} />
                    {r.awaiting_couple && <p className="mt-1 text-[11px] text-plum-700">Top 3 with the couple</p>}
                    {r.chosen_by_name && <p className="mt-1 text-[11px] text-sage-700">Chosen by {r.chosen_by_name}</p>}
                  </td>
                  <td className="td text-right">
                    <Link to={`/rfq/${r.id}`}
                          className={r.status === 'Awarded' ? 'btn-ghost btn-sm' : 'btn-gold btn-sm'}>
                      {r.status === 'Awarded' ? 'View decision' : 'Compare quotes →'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* ---- contracts ---- */}
      {wedding.contracts.length ? (
        <Card title="Contracted vendors" pad={false}
              subtitle="The agreed amount here is what every final bill is matched against">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-sand-50">
                <tr>
                  <th className="th">Vendor</th><th className="th">Category</th>
                  <th className="th text-right">Agreed</th>
                  <th className="th text-right">Advance paid</th>
                  <th className="th text-right">Balance</th>
                  <th className="th w-44">Vendor progress</th>
                  <th className="th">Settlement</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {wedding.contracts.map((c) => (
                  <tr key={c.id} className="hover:bg-sand-50">
                    <td className="td font-medium">{c.vendor}</td>
                    <td className="td text-ink-soft">{c.category}</td>
                    <td className="td tnum text-right">{inr(c.agreed_amount)}</td>
                    <td className="td tnum text-right text-ink-soft">{inr(c.advance_paid)}</td>
                    <td className="td tnum text-right">{inr(c.agreed_amount - c.advance_paid)}</td>
                    <td className="td">
                      {c.work_status ? (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <HealthPill value={c.work_status} />
                            <span className="tnum text-[11px] text-ink-faint">{c.progress_pct ?? 0}%</span>
                          </div>
                          <div className="mt-1.5"><ProgressBar value={c.progress_pct || 0}
                            tone={c.work_status === 'Delayed' || c.work_status === 'Blocked' ? 'gold' : 'good'} /></div>
                        </>
                      ) : <span className="text-xs text-ink-faint">no update yet</span>}
                    </td>
                    <td className="td">
                      {c.settled ? <StatusPill status="Paid" />
                        : c.bill_count ? <StatusPill status="Received" />
                        : <span className="text-xs text-ink-faint">no bill yet</span>}
                    </td>
                    <td className="td text-right"><EditButton onClick={() => setEditing(c)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Empty title="No vendors contracted yet"
               hint="Float a quote request to three vendors in a category, compare them side by side, and the winner is linked here automatically."
               action={<button onClick={() => setCreating(true)} className="btn-primary mt-3">Request quotes</button>} />
      )}

      {/* ---- what the vendors are saying ---- */}
      {updates.data?.length > 0 && (
        <Card title="Updates from vendors" subtitle="Posted from their own portal — delays come with a reason and a new date" pad={false}>
          <ul className="divide-y divide-sand-200">
            {updates.data.slice(0, 10).map((u) => (
              <li key={u.id} className={`px-5 py-3 ${(u.status === 'Delayed' || u.status === 'Blocked') && !u.acknowledged_at ? 'bg-rust-100/40' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{u.vendor} <span className="font-normal text-ink-faint">· {u.category}</span></p>
                  <span className="flex items-center gap-2"><HealthPill value={u.status} /><span className="tnum text-[11px] text-ink-faint">{u.progress_pct}%</span></span>
                </div>
                <p className="mt-1 text-sm text-ink-soft">{u.message}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-ink-faint">{ago(u.created_at)}{u.expected_by && ` · now expected ${date(u.expected_by)}`}</p>
                  {u.acknowledged_at ? <span className="text-[11px] text-sage-700">✓ seen</span>
                    : <button className="btn-ghost btn-sm" onClick={() => ack(u)}>Mark seen</button>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <EditModal open={!!editing} onClose={() => setEditing(null)}
                 title={`Edit ${editing?.vendor || ''}'s contract`}
                 subtitle="The agreed figure is what their final bill is matched against"
                 initial={editing || {}}
                 fields={[
                   { name: 'agreed_amount', label: 'Agreed amount (₹)', type: 'number', required: true },
                   { name: 'advance_paid', label: 'Advance paid (₹)', type: 'number' },
                 ]}
                 onSubmit={async (v) => {
                   const res = await api.patch(`/api/contracts/${editing.id}`, v)
                   setToast({ message: res.detail }); onChange?.()
                 }} />

      <NewRFQ wedding={wedding} open={creating} onClose={() => setCreating(false)}
              onCreated={(r) => { setToast({ message: r.detail }); rfqs.reload(); onChange?.() }} />
    </div>
  )
}
