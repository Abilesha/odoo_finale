import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, ComposedChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

import { api, date, inr, num } from '../api'
import { CAP, useAuth } from '../auth'
import {
  Card, ErrorBox, Modal, Pill, ProgressBar, Spinner, Stat, StatusPill, useToast,
} from '../components/ui'
import { useApi } from '../hooks'

const PLUM = '#7a4169'
const GOLD = '#d9ae4d'
const SAGE = '#6f9c7a'
const RUST = '#d4714f'

function monthLabel(ym) {
  const [y, m] = ym.split('-')
  return new Date(y, m - 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="card px-3 py-2 text-xs shadow-lift">
      <p className="mb-1 font-semibold text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="tnum flex gap-3 text-ink-soft">
          <span style={{ color: p.color }}>■</span>
          <span className="flex-1 capitalize">{p.dataKey}</span>
          <span className="font-medium">{inr(p.value, { compact: true })}</span>
        </p>
      ))}
    </div>
  )
}

/** "...and to share these numbers when needed." — the brief's closing line.
 *
 *  A revocable read-only link, so the accountant or investor needs no account
 *  and the founder can take access back afterwards. */
function ShareDialog({ open, onClose }) {
  const links = useApi(open ? '/api/share-links' : null)
  const [label, setLabel] = useState('Season numbers')
  const [detail, setDetail] = useState(true)
  const [days, setDays] = useState(30)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(null)
  const [err, setErr] = useState(null)

  const fullUrl = (u) => `${window.location.origin}${u}`

  async function create() {
    setBusy(true); setErr(null)
    try {
      await api.post('/api/share-links', {
        label, include_detail: detail,
        expires_in_days: Number(days) || null,
      })
      links.reload()
    } catch (e) { setErr(e) } finally { setBusy(false) }
  }

  async function copy(url) {
    try {
      await navigator.clipboard.writeText(fullUrl(url))
      setCopied(url)
      setTimeout(() => setCopied(null), 2500)
    } catch { /* clipboard refused — the link is on screen to copy by hand */ }
  }

  return (
    <Modal open={open} onClose={onClose} wide title="Share the season numbers"
           subtitle="A read-only link. The recipient needs no account, and you can withdraw it at any time.">
      <div className="space-y-5">
        <div className="space-y-3 rounded-lg border border-sand-300 bg-sand-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">What is this for?</label>
              <input className="input" value={label} onChange={(e) => setLabel(e.target.value)}
                     placeholder="Season numbers for the accountant" />
            </div>
            <div>
              <label className="label">Access ends after</label>
              <select className="input" value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="">never</option>
              </select>
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-soft">
            <input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)}
                   className="mt-0.5" />
            <span>
              Include each wedding and the vendor scorecard
              <span className="block text-xs text-ink-faint">
                Leave this off to share season totals only — an investor may not
                need to see individual couples.
              </span>
            </span>
          </label>
          <ErrorBox error={err} />
          <button onClick={create} disabled={busy} className="btn-primary w-full">
            {busy ? 'Creating…' : 'Create link'}
          </button>
        </div>

        {links.data?.length > 0 && (
          <div>
            <p className="label">Links you have shared</p>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {links.data.map((l) => (
                <div key={l.id} className={`rounded-lg border p-3 ${
                  l.live ? 'border-sand-300 bg-white' : 'border-sand-200 bg-sand-50 opacity-60'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{l.label}</p>
                      <p className="text-[11px] text-ink-faint">
                        {l.view_count} view{l.view_count === 1 ? '' : 's'}
                        {l.expires_at && <> · ends {date(l.expires_at)}</>}
                        {!l.include_detail && <> · totals only</>}
                      </p>
                    </div>
                    {l.live
                      ? <Pill tone="good">Live</Pill>
                      : <Pill tone="neutral">Withdrawn</Pill>}
                  </div>
                  {l.live && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <code className="flex-1 truncate rounded bg-sand-100 px-2 py-1.5 text-[11px] text-ink-soft">
                        {fullUrl(l.url)}
                      </code>
                      <button onClick={() => copy(l.url)} className="btn-ghost btn-sm shrink-0">
                        {copied === l.url ? 'Copied' : 'Copy'}
                      </button>
                      <button onClick={async () => {
                                await api.post(`/api/share-links/${l.id}/revoke`); links.reload()
                              }}
                              className="btn-sm shrink-0 text-xs text-rust-700 hover:underline">
                        Withdraw
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default function Dashboard() {
  const { data, error, loading, reload } = useApi('/api/analytics/dashboard')
  const { can } = useAuth()
  const [sharing, setSharing] = useState(false)

  if (loading) return <Spinner label="Pulling the season together" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const k = data.kpis
  const monthly = data.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }))
  const ranked = [...data.weddings].sort((a, b) => b.profit - a.profit)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl text-ink">Season review</h1>
          <p className="mt-1 text-sm text-ink-faint">
            Which weddings made money, which did not, and what moves in the coming weeks.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(CAP.SHARE) && (
            <button onClick={() => setSharing(true)} className="btn-ghost">
              Share these numbers
            </button>
          )}
          {can(CAP.LEADS) && <Link to="/leads" className="btn-ghost">Enquiries</Link>}
          <Link to="/weddings" className="btn-primary">All weddings</Link>
        </div>
      </header>

      <ShareDialog open={sharing} onClose={() => setSharing(false)} />

      {/* ---- headline numbers ---- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Season revenue" value={inr(k.revenue, { compact: true })}
              sub={`${k.weddings} weddings`} tone="plum" icon="◈" />
        <Stat label="Season profit" value={inr(k.profit, { compact: true })}
              sub={`${k.margin_pct}% blended margin`}
              tone={k.profit >= 0 ? 'good' : 'bad'} icon="▲" />
        <Stat label="Loss-making" value={num(k.loss_making)}
              sub={k.loss_making ? 'need a closer look' : 'none this season'}
              tone={k.loss_making ? 'bad' : 'good'} icon="⚠" />
        <Stat label="Net cash, 30 days" value={inr(k.net_cash_30d, { compact: true })}
              sub={`${inr(k.cash_in_30d, { compact: true })} in · ${inr(k.cash_out_30d, { compact: true })} out`}
              tone={k.net_cash_30d >= 0 ? 'good' : 'bad'} icon="₹" />
      </div>

      {/* ---- operational attention strip ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Open enquiries', value: k.open_leads, to: '/leads', cap: CAP.LEADS },
          { label: 'Awaiting signature', value: k.awaiting_signature, to: '/leads', cap: CAP.LEADS },
          { label: 'Overdue tasks', value: k.overdue_tasks, to: '/weddings', cap: CAP.WEDDINGS },
          { label: 'Quotes in comparison', value: k.open_rfqs, to: '/weddings', cap: CAP.VENDORS },
        ].map((x) => {
          const body = (
            <>
              <span className="text-xs text-ink-faint">{x.label}</span>
              <span className="tnum font-display text-xl font-semibold text-ink">{x.value}</span>
            </>
          )
          const cls = 'card flex items-center justify-between px-4 py-3'
          // a role that cannot open the destination gets the number, not a dead link
          return can(x.cap)
            ? <Link key={x.label} to={x.to} className={`${cls} transition-shadow hover:shadow-lift`}>{body}</Link>
            : <div key={x.label} className={cls}>{body}</div>
        })}
      </div>

      {/* ---- season shape ---- */}
      <div className="grid gap-6 xl:grid-cols-5">
        <Card title="Revenue, cost and profit by month" className="xl:col-span-3"
              subtitle="Every wedding's money, from the records rather than a notebook">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#ebe5db" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8b8495' }}
                     axisLine={{ stroke: '#ebe5db' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#8b8495' }} axisLine={false} tickLine={false}
                     tickFormatter={(v) => `${(v / 1e7).toFixed(1)}Cr`} />
              <Tooltip content={<ChartTip />} cursor={{ fill: '#f6f3ee' }} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={7} />
              <Bar dataKey="revenue" fill={PLUM} radius={[3, 3, 0, 0]} maxBarSize={26} />
              <Bar dataKey="cost" fill="#dbd2c4" radius={[3, 3, 0, 0]} maxBarSize={26} />
              <Line type="monotone" dataKey="profit" stroke={GOLD} strokeWidth={2.5}
                    dot={{ r: 3, fill: GOLD }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Profit per wedding" className="xl:col-span-2"
              subtitle="Sorted best to worst — the founder's actual question">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ranked} layout="vertical" margin={{ left: 4, right: 12 }}>
              <CartesianGrid stroke="#ebe5db" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#8b8495' }} axisLine={false}
                     tickLine={false} tickFormatter={(v) => `${(v / 1e5).toFixed(0)}L`} />
              <YAxis type="category" dataKey="code" width={88}
                     tick={{ fontSize: 9, fill: '#8b8495' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} cursor={{ fill: '#f6f3ee' }} />
              <Bar dataKey="profit" radius={[0, 3, 3, 0]} maxBarSize={12}>
                {ranked.map((r) => (
                  <Cell key={r.code} fill={r.profit >= 0 ? SAGE : RUST} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* ---- the table the founder reads ---- */}
      <Card title="Every wedding this season" pad={false}
            subtitle="Revenue includes additions billed to the client; cost includes vendor settlements and planning hours">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead className="bg-sand-50">
              <tr>
                <th className="th">Wedding</th>
                <th className="th">Date</th>
                <th className="th">Status</th>
                <th className="th text-right">Revenue</th>
                <th className="th text-right">Vendor cost</th>
                <th className="th text-right">Team cost</th>
                <th className="th text-right">Profit</th>
                <th className="th text-right">Margin</th>
                <th className="th text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((w) => (
                <tr key={w.wedding_id} className="group hover:bg-sand-50">
                  <td className="td">
                    <Link to={`/weddings/${w.wedding_id}`} className="block">
                      <span className="font-medium text-ink group-hover:text-plum-700">
                        {w.couple_name}
                      </span>
                      <span className="tnum ml-2 text-xs text-ink-faint">{w.code}</span>
                    </Link>
                  </td>
                  <td className="td tnum text-ink-soft">{date(w.day1_date)}</td>
                  <td className="td"><StatusPill status={w.status} /></td>
                  <td className="td tnum text-right">{inr(w.revenue, { compact: true })}</td>
                  <td className="td tnum text-right text-ink-soft">{inr(w.vendor_cost, { compact: true })}</td>
                  <td className="td tnum text-right text-ink-soft">{inr(w.labour_cost, { compact: true })}</td>
                  <td className={`td tnum text-right font-semibold ${
                    w.profit >= 0 ? 'text-sage-700' : 'text-rust-700'}`}>
                    {inr(w.profit, { compact: true })}
                  </td>
                  <td className="td text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className={`tnum text-xs font-medium ${
                        w.margin_pct >= 15 ? 'text-sage-700'
                          : w.margin_pct >= 0 ? 'text-gold-700' : 'text-rust-700'}`}>
                        {w.margin_pct}%
                      </span>
                      <div className="w-12">
                        <ProgressBar value={Math.max(0, w.margin_pct) * 2.5}
                                     tone={w.margin_pct >= 15 ? 'good' : 'gold'} />
                      </div>
                    </div>
                  </td>
                  <td className="td tnum text-right text-ink-soft">
                    {w.outstanding > 0 ? inr(w.outstanding, { compact: true }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ---- cash + vendors ---- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Money due in the coming weeks" pad={false}
              subtitle={`${data.cash.incoming.length} client payments in · ${data.cash.outgoing.length} vendor payments out`}>
          <div className="grid grid-cols-2 gap-px bg-sand-200">
            <div className="bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Coming in</p>
              <p className="tnum mt-1 font-display text-xl font-semibold text-sage-700">
                {inr(data.cash.total_incoming, { compact: true })}
              </p>
              {data.cash.overdue_incoming > 0 && (
                <p className="mt-1 text-xs text-rust-700">
                  {inr(data.cash.overdue_incoming, { compact: true })} overdue
                </p>
              )}
            </div>
            <div className="bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Going out</p>
              <p className="tnum mt-1 font-display text-xl font-semibold text-rust-700">
                {inr(data.cash.total_outgoing, { compact: true })}
              </p>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {data.cash.incoming.slice(0, 12).map((c, i) => (
              <div key={i} className="flex items-center justify-between border-t border-sand-200 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{c.couple_name}</p>
                  <p className="text-xs text-ink-faint">{c.kind} · due {date(c.due_date)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {c.overdue && <span className="pill bg-rust-100 text-rust-700">overdue</span>}
                  <span className="tnum text-sm font-medium text-sage-700">
                    {inr(c.amount, { compact: true })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Vendors who keep delivering" pad={false}
              subtitle="Punctuality from run-sheet check-ins, billing accuracy from settled invoices"
              action={<Link to="/vendors" className="btn-ghost btn-sm">Full scorecard</Link>}>
          <table className="w-full">
            <thead className="bg-sand-50">
              <tr>
                <th className="th">Vendor</th>
                <th className="th text-right">On time</th>
                <th className="th text-right">Bill accuracy</th>
                <th className="th text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {data.vendors.slice(0, 8).map((v) => (
                <tr key={v.vendor_id} className="hover:bg-sand-50">
                  <td className="td">
                    <p className="font-medium text-ink">{v.name}</p>
                    <p className="text-xs text-ink-faint">{v.category} · {v.weddings_worked} weddings</p>
                  </td>
                  <td className="td tnum text-right text-ink-soft">{v.punctuality_pct}%</td>
                  <td className={`td tnum text-right ${
                    Math.abs(v.overbill_pct) <= 2 ? 'text-sage-700' : 'text-gold-700'}`}>
                    {v.overbill_pct > 0 ? '+' : ''}{v.overbill_pct}%
                  </td>
                  <td className="td tnum text-right font-semibold text-ink">{v.reliability_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
