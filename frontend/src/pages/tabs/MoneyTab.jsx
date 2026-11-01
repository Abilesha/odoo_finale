import { useState } from 'react'

import { api, date, inr } from '../../api'
import {
  Card, Empty, ErrorBox, Modal, Pill, Spinner, StatusPill, useToast,
} from '../../components/ui'
import { useApi } from '../../hooks'

/** Scene 5 — the wedding is over but the work is not.
 *
 *  Every vendor bill is matched three ways: against the agreed contract,
 *  against approved extras, and against the advance already released. An
 *  over-billed invoice cannot be paid, and nothing can be paid twice. */
function Reconcile({ wedding, open, onClose, onDone }) {
  const [actual, setActual] = useState(wedding.actual_guest_count || wedding.guest_count)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const extra = Number(actual) - wedding.guest_count

  async function go() {
    setBusy(true); setErr(null)
    try {
      onDone(await api.post(`/api/reconcile/${wedding.id}/guests`, {
        actual_guest_count: Number(actual),
      }))
    } catch (e) { setErr(e) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Reconcile the headcount"
           subtitle="Unexpected guests turn into both a vendor cost and a client charge">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Contracted</label>
            <input disabled className="input bg-sand-50" value={wedding.guest_count} />
          </div>
          <div>
            <label className="label">Actually turned up</label>
            <input type="number" className="input" value={actual}
                   onChange={(e) => setActual(e.target.value)} />
          </div>
        </div>

        {extra > 0 && (
          <div className="rounded-lg border border-gold-300 bg-gold-50 p-3 text-sm text-gold-700">
            <strong>{extra} extra covers.</strong> A change order will be raised against the
            caterer at their contracted per-plate rate, and the couple billed for the
            same plates with the agency's coordination margin — so the extra shows up on
            both sides of the P&amp;L instead of quietly eating the margin.
          </div>
        )}

        <ErrorBox error={err} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={go} disabled={busy || extra < 0} className="btn-gold">
            {busy ? 'Recording…' : 'Record headcount'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function AddBill({ wedding, open, onClose, onDone }) {
  const [contractId, setContractId] = useState('')
  const [amount, setAmount] = useState('')
  const [number, setNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const contract = wedding.contracts.find((c) => String(c.id) === contractId)

  async function go(e) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      onDone(await api.post('/api/bills', {
        contract_id: Number(contractId),
        bill_number: number || `INV/${contractId}/${wedding.id}`,
        billed_amount: Number(amount) || 0,
      }))
    } catch (e2) { setErr(e2) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Record a vendor bill"
           subtitle="It is matched against the contract the moment it is entered">
      <form onSubmit={go} className="space-y-4">
        <div>
          <label className="label">Vendor contract</label>
          <select required className="input" value={contractId}
                  onChange={(e) => setContractId(e.target.value)}>
            <option value="">Select…</option>
            {wedding.contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.vendor} — {c.category} (agreed {inr(c.agreed_amount)})
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Bill number</label>
            <input className="input" value={number} onChange={(e) => setNumber(e.target.value)}
                   placeholder="INV/2026/118" />
          </div>
          <div>
            <label className="label">Amount billed (₹)</label>
            <input required type="number" className="input" value={amount}
                   onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        {contract && amount && (
          <div className={`rounded-lg p-3 text-sm ${
            Number(amount) > contract.agreed_amount * 1.02
              ? 'border border-rust-400/40 bg-rust-100 text-rust-700'
              : 'border border-sage-400/40 bg-sage-100 text-sage-700'}`}>
            Agreed {inr(contract.agreed_amount)} · billed {inr(Number(amount))} ·{' '}
            {Number(amount) > contract.agreed_amount * 1.02
              ? 'over the agreed amount — this will be blocked until a change order approves it.'
              : 'within tolerance — payable once recorded.'}
          </div>
        )}
        <ErrorBox error={err} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button disabled={busy} className="btn-primary">{busy ? 'Matching…' : 'Record bill'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function MoneyTab({ wedding, onChange }) {
  const bills = useApi(`/api/bills?wedding_id=${wedding.id}`)
  const cos = useApi(`/api/change-orders?wedding_id=${wedding.id}`)
  const [reconciling, setReconciling] = useState(false)
  const [adding, setAdding] = useState(false)
  const [toastNode, setToast] = useToast()

  if (bills.loading || cos.loading) return <Spinner label="Matching bills" />
  if (bills.error) return <ErrorBox error={bills.error} onRetry={bills.reload} />

  const refresh = () => { bills.reload(); cos.reload(); onChange?.() }

  async function pay(b) {
    try {
      const res = await api.post(`/api/bills/${b.bill_id}/pay`)
      setToast({ message: res.detail })
      refresh()
    } catch (e) { setToast({ message: e.message, tone: 'bad' }) }
  }

  async function billClient(co) {
    try {
      await api.post(`/api/change-orders/${co.id}/bill-client`)
      setToast({ message: `${inr(co.client_amount)} added to the client's final invoice.` })
      refresh()
    } catch (e) { setToast({ message: e.message, tone: 'bad' }) }
  }

  const blocked = bills.data.bills.filter((b) => b.match_status === 'Blocked')
  const unbilled = cos.data.change_orders.filter((c) => c.approved && !c.billed_to_client)

  return (
    <div className="space-y-5">
      {toastNode}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          <strong className="tnum">{bills.data.count}</strong> bills ·{' '}
          <strong className="tnum">{inr(bills.data.payable_total, { compact: true })}</strong> payable now
          {blocked.length > 0 && (
            <span className="ml-2 text-rust-700">{blocked.length} blocked</span>
          )}
        </p>
        <div className="flex gap-2">
          <button onClick={() => setReconciling(true)} className="btn-ghost btn-sm">
            Reconcile headcount
          </button>
          <button onClick={() => setAdding(true)} className="btn-primary btn-sm">
            + Record bill
          </button>
        </div>
      </div>

      {unbilled.length > 0 && (
        <div className="card border-gold-300 bg-gold-50 p-4">
          <p className="mb-2.5 text-sm font-semibold text-gold-700">
            {unbilled.length} approved extra{unbilled.length === 1 ? '' : 's'} not yet billed to the client
          </p>
          <div className="space-y-2">
            {unbilled.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{c.description}</p>
                  <p className="tnum text-xs text-ink-faint">
                    costs us {inr(c.vendor_cost)} · bill the couple {inr(c.client_amount)} ·
                    margin {inr(c.margin)}
                  </p>
                </div>
                <button onClick={() => billClient(c)} className="btn-gold btn-sm shrink-0">
                  Add to invoice
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- three-way match ---- */}
      {bills.data.count ? (
        <Card title="Vendor bills — three-way match" pad={false}
              subtitle="Agreed contract vs approved extras vs what was billed, net of advances already released">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead className="bg-sand-50">
                <tr>
                  <th className="th">Bill</th><th className="th">Vendor</th>
                  <th className="th text-right">Agreed</th>
                  <th className="th text-right">Extras</th>
                  <th className="th text-right">Billed</th>
                  <th className="th text-right">Variance</th>
                  <th className="th text-right">Advance</th>
                  <th className="th text-right">Net payable</th>
                  <th className="th">Match</th>
                  <th className="th text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {bills.data.bills.map((b) => (
                  <tr key={b.bill_id} className={`hover:bg-sand-50 ${
                    b.match_status === 'Blocked' ? 'bg-rust-100/40' : ''}`}>
                    <td className="td tnum text-xs text-ink-soft">{b.bill_number}</td>
                    <td className="td">
                      <p className="font-medium text-ink">{b.vendor_name}</p>
                      <p className="text-xs text-ink-faint">{b.category}</p>
                    </td>
                    <td className="td tnum text-right text-ink-soft">{inr(b.agreed_amount)}</td>
                    <td className="td tnum text-right text-ink-soft">
                      {b.approved_extras ? inr(b.approved_extras) : '—'}
                    </td>
                    <td className="td tnum text-right font-medium">{inr(b.billed_amount)}</td>
                    <td className={`td tnum text-right ${
                      b.variance > 0 ? 'text-rust-700'
                        : b.variance < 0 ? 'text-gold-700' : 'text-ink-faint'}`}>
                      {b.variance === 0 ? '—'
                        : `${b.variance > 0 ? '+' : ''}${inr(b.variance)}`}
                      {b.variance !== 0 && (
                        <span className="block text-[11px] opacity-75">{b.variance_pct}%</span>
                      )}
                    </td>
                    <td className="td tnum text-right text-ink-soft">{inr(b.advance_paid)}</td>
                    <td className="td tnum text-right font-semibold">{inr(b.net_payable)}</td>
                    <td className="td"><StatusPill status={b.match_status} /></td>
                    <td className="td text-right">
                      {b.match_status === 'Paid' ? (
                        <span className="tnum text-xs text-ink-faint">
                          {date(b.paid_at, { year: false })}
                        </span>
                      ) : b.match_status === 'Blocked' ? (
                        <span className="text-xs text-rust-700">needs change order</span>
                      ) : (
                        <button onClick={() => pay(b)} className="btn-ghost btn-sm">Settle</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Empty title="No vendor bills recorded yet"
               hint="After the event, record each vendor's bill. It is matched against the agreed contract and any approved extras, and the advance already released is netted off automatically." />
      )}

      {/* ---- change orders ---- */}
      {cos.data.count > 0 && (
        <Card title="Extras and change orders" pad={false}
              subtitle="Both sides of every extra: what it costs us, and what the client is fairly billed">
          <table className="w-full">
            <thead className="bg-sand-50">
              <tr>
                <th className="th">Extra</th><th className="th">Vendor</th>
                <th className="th text-right">Qty</th>
                <th className="th text-right">Our cost</th>
                <th className="th text-right">Client billed</th>
                <th className="th text-right">Margin</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {cos.data.change_orders.map((c) => (
                <tr key={c.id} className="hover:bg-sand-50">
                  <td className="td">{c.description}</td>
                  <td className="td text-ink-soft">{c.vendor || '—'}</td>
                  <td className="td tnum text-right">{c.quantity} <span className="text-xs text-ink-faint">{c.unit}</span></td>
                  <td className="td tnum text-right text-ink-soft">{inr(c.vendor_cost)}</td>
                  <td className="td tnum text-right">{inr(c.client_amount)}</td>
                  <td className="td tnum text-right font-medium text-sage-700">{inr(c.margin)}</td>
                  <td className="td">
                    {c.billed_to_client ? <Pill tone="good">Billed</Pill>
                      : c.approved ? <Pill tone="warn">Approved, not billed</Pill>
                      : <Pill tone="neutral">Draft</Pill>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Reconcile wedding={wedding} open={reconciling} onClose={() => setReconciling(false)}
                 onDone={(r) => { setReconciling(false); setToast({ message: r.detail }); refresh() }} />
      <AddBill wedding={wedding} open={adding} onClose={() => setAdding(false)}
               onDone={(b) => {
                 setAdding(false)
                 setToast({
                   message: `Bill ${b.bill_number} recorded — ${b.match_status.toLowerCase()}.`,
                   tone: b.match_status === 'Blocked' ? 'bad' : 'good',
                 })
                 refresh()
               }} />
    </div>
  )
}
