import { useState } from 'react'
import { Link } from 'react-router-dom'

import { api, date, inr } from '../api'
import { EditButton, EditModal, PageHead } from '../components/kit'
import { Card, ErrorBox, Spinner, StatusPill, Tabs, useToast } from '../components/ui'
import { useApi } from '../hooks'

/** Money in from couples, money out to vendors — for the weddings this
 *  manager runs.  The three-way match on vendor bills is already done; the
 *  manager only has to act on the verdict. */
export default function Payments() {
  const { data, error, loading, reload } = useApi('/api/my/payments')
  const [tab, setTab] = useState('in')
  const [filter, setFilter] = useState('open')
  const [editing, setEditing] = useState(null)
  const [paying, setPaying] = useState(null)
  const [toast, setToast] = useToast()

  if (loading) return <Spinner label="Adding up the money" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const s = data.summary
  const ms = data.milestones.filter((m) => filter === 'all' || m.status !== 'Paid')
  const bills = data.bills.filter((b) => filter === 'all' || !b.paid_at)

  async function markInvoiced(m) {
    try {
      await api.patch(`/api/milestones/${m.id}`, { status: 'Invoiced' })
      setToast({ message: `${m.kind} invoiced to ${m.couple_name}.` }); reload()
    } catch (e) { setToast({ message: e.message, tone: 'bad' }) }
  }

  /** The couple reported a transfer; confirming it against the bank is
   *  what makes it received, with their UTR as the receipt reference. */
  async function confirmUtr(m) {
    try {
      await api.patch(`/api/milestones/${m.id}`, { status: 'Paid' })
      setToast({ message: `${inr(m.amount)} from ${m.couple_name} confirmed — receipt ${m.client_reference}.` }); reload()
    } catch (e) { setToast({ message: e.message, tone: 'bad' }) }
  }

  async function payBill(b) {
    try {
      const res = await api.post(`/api/bills/${b.bill_id}/pay`, {})
      setToast({ message: res.detail || `Paid ${b.vendor_name}.` }); reload()
    } catch (e) { setToast({ message: e.message, tone: 'bad' }) }
  }

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Payments"
        title="Money in, money out"
        sub="Staged payments from your couples, and vendor bills already checked against what was agreed."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Received from couples', inr(s.received, { compact: true }), 'to date', 'good'],
          ['Still due', inr(s.due, { compact: true }), 'from couples'],
          ['Overdue', inr(s.overdue, { compact: true }), s.overdue ? 'chase today' : 'nothing overdue', s.overdue ? 'bad' : 'good'],
          ['Vendor bills open', s.bills_open, `${s.bills_blocked} blocked by the match`, s.bills_blocked ? 'bad' : null],
          ['Payable now', inr(s.bills_payable, { compact: true }), 'matched, net of advances'],
        ].map(([l, v, sub, tone]) => (
          <div key={l} className="card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{l}</p>
            <p className={`tnum mt-1.5 font-display text-2xl font-semibold ${
              tone === 'bad' ? 'text-rust-700' : tone === 'good' ? 'text-sage-700' : 'text-ink'}`}>{v}</p>
            <p className="text-[11px] text-ink-faint">{sub}</p>
          </div>
        ))}
      </div>

      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-3">
          <Tabs active={tab} onChange={setTab} tabs={[
            { id: 'in', label: 'From couples', count: data.milestones.filter((m) => m.status !== 'Paid').length },
            { id: 'out', label: 'To vendors', count: s.bills_open },
          ]} />
          <div className="flex gap-1 pb-2">
            {[['open', 'Open'], ['all', 'Everything']].map(([id, l]) => (
              <button key={id} onClick={() => setFilter(id)}
                      className={`btn btn-sm ${filter === id ? 'bg-night-700 text-white' : 'border border-sand-300 bg-white text-ink-soft'}`}>{l}</button>
            ))}
          </div>
        </div>

        {tab === 'in' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-sand-50">
                <tr>
                  <th className="th">Couple</th><th className="th">Stage</th>
                  <th className="th text-right">Amount</th><th className="th">Due</th>
                  <th className="th">Status</th><th className="th" />
                </tr>
              </thead>
              <tbody>
                {ms.map((m) => (
                  <tr key={m.id} className={m.overdue ? 'bg-rust-100/30' : ''}>
                    <td className="td">
                      <Link to={`/weddings/${m.wedding_id}?tab=money`} className="font-medium hover:text-plum-700">{m.couple_name}</Link>
                      <p className="text-[11px] text-ink-faint">{m.code}</p>
                    </td>
                    <td className="td">{m.kind} <span className="text-ink-faint">· {m.percent}%</span></td>
                    <td className="td tnum text-right font-medium">{inr(m.amount)}</td>
                    <td className="td tnum">
                      {date(m.due_date)}
                      <p className={`text-[11px] ${m.overdue ? 'font-semibold text-rust-700' : 'text-ink-faint'}`}>
                        {m.status === 'Paid' ? `paid ${date(m.paid_at, { year: false })}`
                          : m.overdue ? `${-m.days_left} days overdue` : `in ${m.days_left} days`}
                      </p>
                    </td>
                    <td className="td">
                      <StatusPill status={m.status} />
                      {m.reference && <p className="mt-1 text-[11px] text-ink-faint">{m.reference}</p>}
                      {m.status !== 'Paid' && m.client_reference && (
                        <p className="mt-1 text-[11px] font-medium text-blush-700">Couple says paid · UTR {m.client_reference}</p>
                      )}
                    </td>
                    <td className="td whitespace-nowrap text-right">
                      {m.status === 'Due' && !m.client_reference && <button className="btn-ghost btn-sm" onClick={() => markInvoiced(m)}>Invoice</button>}
                      {m.status !== 'Paid' && m.client_reference && (
                        <button className="btn btn-sm ml-1 bg-blush-700 text-white hover:bg-blush-800" onClick={() => confirmUtr(m)}>
                          Confirm UTR
                        </button>
                      )}
                      {m.status !== 'Paid' && !m.client_reference && <button className="btn-primary btn-sm ml-1" onClick={() => setPaying(m)}>Record payment</button>}
                      <EditButton className="ml-1" onClick={() => setEditing(m)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-sand-50">
                <tr>
                  <th className="th">Vendor</th><th className="th text-right">Agreed + extras</th>
                  <th className="th text-right">Billed</th><th className="th text-right">Variance</th>
                  <th className="th text-right">Net payable</th><th className="th">Match</th><th className="th" />
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.bill_id}>
                    <td className="td">
                      <p className="font-medium">{b.vendor_name}</p>
                      <p className="text-[11px] text-ink-faint">{b.category} · {b.bill_number}</p>
                    </td>
                    <td className="td tnum text-right">{inr(b.expected_total)}</td>
                    <td className="td tnum text-right">{inr(b.billed_amount)}</td>
                    <td className={`td tnum text-right ${b.variance > 0 ? 'text-rust-700' : 'text-ink-faint'}`}>
                      {b.variance > 0 ? '+' : ''}{inr(b.variance)} <span className="text-[11px]">({b.variance_pct}%)</span>
                    </td>
                    <td className="td tnum text-right font-medium">{inr(b.net_payable)}</td>
                    <td className="td"><StatusPill status={b.paid_at ? 'Paid' : b.match_status} /></td>
                    <td className="td text-right">
                      {!b.paid_at && b.payable && <button className="btn-primary btn-sm" onClick={() => payBill(b)}>Pay {inr(b.net_payable, { compact: true })}</button>}
                      {!b.paid_at && !b.payable && <Link to={`/weddings/${b.wedding_id}?tab=money`} className="btn-ghost btn-sm">Review</Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <EditModal open={!!editing} onClose={() => setEditing(null)}
                 title="Edit payment stage" subtitle={editing ? `${editing.couple_name} · ${editing.kind}` : ''}
                 initial={editing || {}}
                 fields={[
                   { name: 'amount', label: 'Amount (₹)', type: 'number', required: true },
                   { name: 'due_date', label: 'Due date', type: 'date', required: true },
                   { name: 'status', label: 'Status', type: 'select', options: ['Due', 'Invoiced', 'Paid'], placeholder: false },
                   { name: 'reference', label: 'Receipt / UTR reference' },
                 ]}
                 onSubmit={async (v) => {
                   await api.patch(`/api/milestones/${editing.id}`, v)
                   setToast({ message: 'Payment stage updated.' }); reload()
                 }} />

      <EditModal open={!!paying} onClose={() => setPaying(null)}
                 title="Record a payment" subtitle={paying ? `${paying.couple_name} · ${paying.kind} · ${inr(paying.amount)}` : ''}
                 initial={{ reference: '' }} sendAll submitLabel="Mark as paid"
                 fields={[{ name: 'reference', label: 'UTR / cheque / receipt number', full: true,
                            placeholder: 'Leave blank to generate a receipt number' }]}
                 onSubmit={async (v) => {
                   await api.patch(`/api/milestones/${paying.id}`, { status: 'Paid', ...(v.reference ? { reference: v.reference } : {}) })
                   setToast({ message: `${inr(paying.amount)} from ${paying.couple_name} recorded.` }); reload()
                 }} />
      {toast}
    </div>
  )
}
