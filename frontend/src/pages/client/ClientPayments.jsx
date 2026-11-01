import { useState } from 'react'

import { api, date, inr } from '../../api'
import { EditModal, Ring } from '../../components/kit'
import { Card, ErrorBox, Spinner, useToast } from '../../components/ui'
import { useApi } from '../../hooks'
import { ClientHead, NotBookedYet } from './shared'

/** What the wedding costs them, what they have paid, what is next.
 *  "I've paid" sends the UTR to the planner — it does not mark anything as
 *  received; the planner confirms it against the bank first. */
export default function ClientPayments() {
  const { data, error, loading, reload } = useApi('/api/client/payments')
  const [reporting, setReporting] = useState(null)
  const [toast, setToast] = useToast()

  if (loading) return <Spinner label="Adding it up" />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (data.booked === false) return <NotBookedYet title="Your payment plan opens once you are booked" planner={data.planner} />

  const s = data.summary

  return (
    <div className="space-y-6">
      <ClientHead eyebrow="Payments" title="Your payment plan"
                  sub="Three stages — on booking, a month before, and after the wedding — plus anything extra you asked for on the day." />

      <section className="card grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:items-center">
        <Ring value={s.paid_pct} size={110} stroke={10} tone="gold" sub="paid" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            ['Your package', inr(s.package_value)],
            ['Extras added', s.extras_total ? inr(s.extras_total) : '—'],
            ['Paid so far', inr(s.paid), 'text-sage-700'],
            ['Still to pay', inr(s.outstanding), 'text-blush-700'],
          ].map(([k, v, c]) => (
            <div key={k}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{k}</p>
              <p className={`tnum mt-1 font-display text-2xl font-semibold ${c || 'text-ink'}`}>{v}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {data.milestones.map((m, i) => {
          const paid = m.status === 'Paid'
          return (
            <article key={m.id} className={`card relative overflow-hidden p-5 ${
              paid ? '' : m.overdue ? 'border-blush-400' : i === data.milestones.findIndex((x) => x.status !== 'Paid') ? 'border-gold-300 shadow-glow' : ''}`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">Stage {i + 1} · {m.percent}%</p>
              <h3 className="mt-1 font-display text-xl text-ink">{m.kind}</h3>
              <p className="tnum mt-2 font-display text-3xl font-semibold text-ink">{inr(m.amount)}</p>
              <p className={`mt-1 text-sm ${paid ? 'text-sage-700' : m.overdue ? 'font-medium text-blush-700' : 'text-ink-faint'}`}>
                {paid ? `✓ Received ${date(m.paid_at)}`
                  : m.overdue ? `Was due ${date(m.due_date)}`
                  : `Due ${date(m.due_date)} · in ${m.days_left} days`}
              </p>
              {paid && m.reference && <p className="mt-1 text-[11px] text-ink-faint">Receipt {m.reference}</p>}
              {!paid && m.client_reference && (
                <p className="mt-3 rounded-lg bg-gold-50 px-3 py-2 text-xs text-gold-800">
                  You told us it’s paid — UTR {m.client_reference}. Your planner is confirming it with the bank.
                </p>
              )}
              {!paid && !m.client_reference && (
                <button className="btn mt-4 w-full bg-blush-700 text-white hover:bg-blush-800" onClick={() => setReporting(m)}>
                  I’ve paid this
                </button>
              )}
            </article>
          )
        })}
      </div>

      {data.extras.length > 0 && (
        <Card title="Extras" subtitle="Things added on the day, at the rate agreed" pad={false}>
          <ul className="divide-y divide-sand-200">
            {data.extras.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-sm text-ink">{x.description}</p>
                  <p className="text-[11px] text-ink-faint">{x.quantity} × {inr(x.unit_price)} {x.unit}</p>
                </div>
                <p className="tnum font-medium text-ink">{inr(x.amount)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="rounded-xl bg-sand-200/60 px-4 py-3 text-xs text-ink-soft">
        Pay by bank transfer to <span className="font-medium">{data.bank.name}</span>. {data.bank.note}
      </p>

      <EditModal open={!!reporting} onClose={() => setReporting(null)}
                 title="Tell your planner you’ve paid"
                 subtitle={reporting ? `${reporting.kind} · ${inr(reporting.amount)}` : ''}
                 initial={{ reference: '' }} sendAll submitLabel="Send"
                 fields={[{ name: 'reference', label: 'UTR or transaction reference', full: true, required: true,
                            placeholder: 'e.g. HDFCN52026103112345',
                            help: 'You will find it in your bank’s confirmation message.' }]}
                 onSubmit={async (v) => {
                   const res = await api.post(`/api/client/payments/${reporting.id}/report`, v)
                   setToast({ message: res.detail }); reload()
                 }} />
      {toast}
    </div>
  )
}
