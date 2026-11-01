import { useState } from 'react'

import { api, inr } from '../api'
import { EditButton, EditModal } from '../components/kit'
import { Card, ErrorBox, Pill, ProgressBar, Spinner, Stat, useToast } from '../components/ui'
import { useApi } from '../hooks'

const CATEGORIES = ['Caterer', 'Decorator', 'Photographer', 'DJ', 'Drummers', 'Makeup Artist',
  'Mehendi Artist', 'Florist', 'Pandit', 'Transport']

const vendorFields = (isNew) => [
  { name: 'name', label: 'Business name', required: true },
  { name: 'category', label: 'Job type', type: 'select', options: CATEGORIES, required: true, placeholder: false },
  { name: 'contact_person', label: 'Contact person' },
  { name: 'phone', label: 'Phone' },
  { name: 'email', label: 'Email', type: 'email', help: 'What they sign in to their portal with' },
  { name: 'city', label: 'Based in' },
  { name: 'service_cities', label: 'Cities they work in', help: 'Comma-separated' },
  { name: 'quality_rating', label: 'Quality rating (0–5)', type: 'number', step: '0.1', min: 0, max: 5 },
  { name: 'max_guests', label: 'Largest wedding (guests)', type: 'number' },
  { name: 'max_events_per_day', label: 'Events per day', type: 'number' },
  { name: 'team_size', label: 'Team size', type: 'number' },
  { name: 'lead_time_days', label: 'Notice needed (days)', type: 'number' },
  { name: 'password', label: isNew ? 'Portal password (optional)' : 'Set a new portal password', type: 'text', full: true,
    help: isNew ? 'Give them a sign-in now — at least 8 characters. Leave blank to add one later.'
                : 'Leave blank to keep their current sign-in. At least 8 characters.' },
  { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
]

/** Scene 6, vendor half — "which vendors keep delivering well".
 *
 *  Scored from evidence the system already holds: run-sheet check-ins give
 *  punctuality, settled bills give billing accuracy. Nobody is rating anyone
 *  from memory. */
export default function VendorScorecard() {
  const { data, error, loading, reload } = useApi('/api/analytics/vendors')
  const directory = useApi('/api/vendors')
  const [category, setCategory] = useState('All')
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useToast()

  if (loading) return <Spinner label="Scoring vendors" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const categories = ['All', ...new Set(data.map((v) => v.category))].sort()
  const shown = category === 'All' ? data : data.filter((v) => v.category === category)
  const worked = data.filter((v) => v.weddings_worked > 0)
  const overbillers = data.filter((v) => v.overbill_pct > 2)
  const card = Object.fromEntries((directory.data || []).map((v) => [v.id, v]))
  const withPortal = (directory.data || []).filter((v) => v.has_portal).length

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl text-ink">Vendors</h1>
          <p className="mt-1 text-sm text-ink-faint">
            The network by job type. Punctuality from run-sheet check-ins, billing accuracy from
            settled invoices, capacity from each vendor’s own portal.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setAdding(true)}>+ Add a vendor</button>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Vendors on the book" value={data.length} icon="◎" />
        <Stat label="Worked this season" value={worked.length} tone="plum" icon="❖" />
        <Stat label="Bill over the agreed" value={overbillers.length}
              sub={overbillers.length ? 'review before re-booking' : 'all within tolerance'}
              tone={overbillers.length ? 'bad' : 'good'} icon="⚠" />
        <Stat label="Portal sign-ins" value={`${withPortal} / ${data.length}`}
              sub="price and report from their own portal" tone="plum" icon="✉" />
        <Stat label="Committed this season"
              value={inr(data.reduce((s, v) => s + v.total_agreed, 0), { compact: true })}
              tone="gold" icon="₹" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button key={c} onClick={() => setCategory(c)}
            className={`btn btn-sm ${category === c
              ? 'bg-plum-700 text-white' : 'border border-sand-300 bg-white text-ink-soft'}`}>
            {c}
          </button>
        ))}
      </div>

      <Card pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-sand-50">
              <tr>
                <th className="th">Vendor</th>
                <th className="th text-center">Weddings</th>
                <th className="th text-right">Committed</th>
                <th className="th text-right">Billed</th>
                <th className="th text-right">Over/under</th>
                <th className="th text-right">Punctuality</th>
                <th className="th text-right">Rating</th>
                <th className="th w-44">Reliability</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {shown.map((v) => (
                <tr key={v.vendor_id} className="hover:bg-sand-50">
                  <td className="td">
                    <p className="flex items-center gap-2 font-medium text-ink">
                      {v.name}
                      {card[v.vendor_id]?.has_portal && <span className="pill bg-jade-100 text-jade-700">portal</span>}
                    </p>
                    <p className="text-xs text-ink-faint">
                      {v.category} · {v.city}
                      {card[v.vendor_id]?.max_guests && ` · up to ${card[v.vendor_id].max_guests} guests`}
                      {card[v.vendor_id]?.max_events_per_day > 1 && ` · ${card[v.vendor_id].max_events_per_day}/day`}
                    </p>
                  </td>
                  <td className="td tnum text-center text-ink-soft">{v.weddings_worked}</td>
                  <td className="td tnum text-right text-ink-soft">
                    {v.total_agreed ? inr(v.total_agreed, { compact: true }) : '—'}
                  </td>
                  <td className="td tnum text-right text-ink-soft">
                    {v.total_billed ? inr(v.total_billed, { compact: true }) : '—'}
                  </td>
                  <td className="td text-right">
                    {v.overbill_pct === 0 ? (
                      <span className="text-xs text-ink-faint">—</span>
                    ) : (
                      <Pill tone={v.overbill_pct > 2 ? 'bad' : v.overbill_pct < -2 ? 'warn' : 'good'}>
                        {v.overbill_pct > 0 ? '+' : ''}{v.overbill_pct}%
                      </Pill>
                    )}
                  </td>
                  <td className="td text-right">
                    <span className={`tnum text-sm ${
                      v.punctuality_pct >= 95 ? 'text-sage-700'
                        : v.punctuality_pct >= 80 ? 'text-gold-700' : 'text-rust-700'}`}>
                      {v.punctuality_pct}%
                    </span>
                    {v.late_slots > 0 && (
                      <span className="block text-[11px] text-rust-700">{v.late_slots} late</span>
                    )}
                  </td>
                  <td className="td tnum text-right text-ink-soft">★ {v.quality_rating}</td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <div className="flex-1"><ProgressBar value={v.reliability_score}
                        tone={v.reliability_score >= 85 ? 'good' : 'gold'} /></div>
                      <span className="tnum w-9 text-right text-xs font-semibold text-ink">
                        {v.reliability_score}
                      </span>
                    </div>
                  </td>
                  <td className="td text-right">
                    {card[v.vendor_id] && <EditButton onClick={() => setEditing(card[v.vendor_id])} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <EditModal open={!!editing} onClose={() => setEditing(null)} wide
                 title={`Edit ${editing?.name || ''}`}
                 subtitle={editing?.has_portal ? 'Has a portal sign-in' : 'No portal sign-in yet — set a password to give them one'}
                 initial={editing || {}} fields={vendorFields(false)}
                 onSubmit={async (v) => {
                   const res = await api.patch(`/api/vendors/${editing.id}`, v)
                   setToast({ message: res.detail }); reload(); directory.reload()
                 }} />
      <EditModal open={adding} onClose={() => setAdding(false)} wide
                 title="Add a vendor" subtitle="They appear in every manager’s invite list for their job type"
                 initial={{ category: category !== 'All' ? category : 'Caterer', city: 'Jaipur', quality_rating: 4 }}
                 sendAll submitLabel="Add vendor" fields={vendorFields(true)}
                 onSubmit={async (v) => {
                   const res = await api.post('/api/vendors', v)
                   setToast({ message: res.detail }); reload(); directory.reload()
                 }} />
      {toast}
    </div>
  )
}
