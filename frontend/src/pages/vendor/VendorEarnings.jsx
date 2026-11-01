import { useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

import { api, date, inr } from '../../api'
import { EditButton, EditModal, PageHead } from '../../components/kit'
import { Card, ErrorBox, Spinner, useToast } from '../../components/ui'
import { useApi } from '../../hooks'

const monthLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
}

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="card px-3 py-2 text-xs shadow-lift">
      <p className="mb-1 font-semibold text-ink">{monthLabel(label)}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="tnum" style={{ color: p.color }}>{p.name}: {inr(p.value)}</p>
      ))}
    </div>
  )
}

/** What the season is worth to this vendor — and what they actually keep. */
export default function VendorEarnings() {
  const { data, error, loading, reload } = useApi('/api/vendor-portal/earnings')
  const [costing, setCosting] = useState(null)
  const [toast, setToast] = useToast()

  if (loading) return <Spinner label="Adding up your season" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const s = data.summary

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Earnings"
        title="What you earn, and what you keep"
        sub="Job value is what The Royal Knot contracted you for, plus approved extras. Profit uses your own cost figures, which only you can see."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Contracted', inr(s.total_value, { compact: true }), `${s.jobs} jobs`],
          ['Received', inr(s.received, { compact: true }), 'advances and settled bills'],
          ['Outstanding', inr(s.outstanding, { compact: true }), 'still to come in', s.outstanding ? 'gold' : null],
          ['Your cost', inr(s.cost, { compact: true }), s.uncosted ? `${s.uncosted} job(s) without a cost` : 'all jobs costed'],
          ['Your profit', inr(s.profit, { compact: true }), s.margin_pct != null ? `${s.margin_pct}% margin` : '—', 'jade'],
        ].map(([l, v, sub, tone]) => (
          <div key={l} className={`card p-4 ${tone === 'jade' ? 'border-jade-300 bg-jade-50' : ''}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{l}</p>
            <p className={`tnum mt-1.5 font-display text-2xl font-semibold ${
              tone === 'jade' ? 'text-jade-700' : tone === 'gold' ? 'text-gold-600' : 'text-ink'}`}>{v}</p>
            <p className="text-[11px] text-ink-faint">{sub}</p>
          </div>
        ))}
      </div>

      <Card title="Month by month" subtitle="By the month each wedding starts">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.monthly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#ebe5db" />
              <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: '#8b8495' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => inr(v, { compact: true })} tick={{ fontSize: 11, fill: '#8b8495' }} axisLine={false} tickLine={false} width={70} />
              <Tooltip content={<Tip />} cursor={{ fill: 'rgba(47,110,88,.06)' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="revenue" name="Job value" fill="#bcdfd0" radius={[4, 4, 0, 0]} />
              <Bar dataKey="profit" name="Your profit" fill="#2f6e58" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="By job" pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-sand-50">
              <tr>
                <th className="th">Wedding</th>
                <th className="th text-right">Job value</th>
                <th className="th text-right">Received</th>
                <th className="th text-right">Outstanding</th>
                <th className="th text-right">Your cost</th>
                <th className="th text-right">Profit</th>
                <th className="th text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {data.jobs.map((j) => (
                <tr key={j.contract_id}>
                  <td className="td">
                    <p className="font-medium">{j.couple_name}</p>
                    <p className="text-[11px] text-ink-faint">{j.code} · {date(j.day1_date)}</p>
                  </td>
                  <td className="td tnum text-right">{inr(j.total_value)}</td>
                  <td className="td tnum text-right text-ink-soft">{inr(j.received)}</td>
                  <td className={`td tnum text-right ${j.outstanding ? 'text-gold-700' : 'text-ink-faint'}`}>{inr(j.outstanding)}</td>
                  <td className="td tnum whitespace-nowrap text-right">
                    {j.vendor_cost != null ? inr(j.vendor_cost) : <span className="text-ink-faint">—</span>}
                    <EditButton label="" className="ml-1" onClick={() => setCosting(j)} />
                  </td>
                  <td className={`td tnum text-right font-semibold ${j.profit == null ? 'text-ink-faint' : j.profit >= 0 ? 'text-jade-700' : 'text-rust-700'}`}>
                    {j.profit != null ? inr(j.profit) : '—'}
                  </td>
                  <td className="td tnum text-right text-ink-soft">{j.margin_pct != null ? `${j.margin_pct}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <EditModal open={!!costing} onClose={() => setCosting(null)}
                 title="Your cost for this job" subtitle={costing ? `${costing.couple_name} — private to you` : ''}
                 initial={{ vendor_cost: costing?.vendor_cost ?? '' }} sendAll
                 fields={[{ name: 'vendor_cost', label: 'Cost to deliver (₹)', type: 'number', required: true, full: true }]}
                 onSubmit={async (v) => {
                   const res = await api.patch(`/api/vendor-portal/jobs/${costing.contract_id}/cost`, v)
                   setToast({ message: res.detail }); reload()
                 }} />
      {toast}
    </div>
  )
}
