import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { api, date, inr } from '../api'
import { CAP, useAuth } from '../auth'
import { Avatar, EditModal } from '../components/kit'
import { ErrorBox, Spinner, StatusPill, Tabs, useToast } from '../components/ui'
import { useApi } from '../hooks'
import { AssignModal } from './Managers'
import MoneyTab from './tabs/MoneyTab'
import PlanTab from './tabs/PlanTab'
import RunSheetTab from './tabs/RunSheetTab'
import VendorsTab from './tabs/VendorsTab'

export default function WeddingDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState(params.get('tab') || 'plan')
  const { can } = useAuth()
  const { data: w, error, loading, reload } = useApi(`/api/weddings/${id}`)
  const founder = can(CAP.TEAM)
  const team = useApi(founder ? '/api/managers' : null)
  const [editing, setEditing] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [toast, setToast] = useToast()

  if (loading) return <Spinner label="Opening the wedding file" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  // the server withholds the figures from roles that should not see them
  const pnl = w.pnl
  const change = (t) => { setTab(t); setParams({ tab: t }) }

  const tabs = [
    { id: 'plan',     label: 'Plan',      count: w.task_total },
    can(CAP.VENDORS) && { id: 'vendors', label: 'Vendors', count: w.contract_count },
    can(CAP.RUNDAY) && { id: 'runsheet', label: 'Run sheet' },
    can(CAP.MONEY) && { id: 'money', label: 'Money' },
  ].filter(Boolean)

  // a role that cannot open the tab in the URL falls back to the first it can
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id

  return (
    <div className="space-y-6">
      {/* ---- header ---- */}
      <header>
        <Link to="/weddings" className="text-xs text-plum-600 hover:underline">← All weddings</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl text-ink">{w.couple_name}</h1>
              <StatusPill status={w.status} />
              <span className="pill bg-sand-200 text-ink-soft">{w.package_type}</span>
            </div>
            <p className="mt-1.5 text-sm text-ink-faint">
              {w.code} · {w.venue || 'venue not booked'} · {w.city}
              {w.theme && <> · {w.theme}</>}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-6">
          <div className="text-left">
            <p className="text-xs text-ink-faint">Manager</p>
            {w.manager ? (
              <p className="mt-1 flex items-center gap-2 text-sm font-medium text-ink">
                <Avatar name={w.manager} size="sm" tone="night" />{w.manager}
              </p>
            ) : <p className="mt-1 pill bg-gold-100 text-gold-700">Unassigned</p>}
            <div className="mt-2 flex gap-1">
              <button className="btn-ghost btn-sm" onClick={() => setEditing(true)}>✎ Edit</button>
              {founder && (
                <button className="btn-ghost btn-sm" onClick={() => setAssigning(true)}>
                  {w.manager ? 'Reassign' : 'Assign'}
                </button>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-faint">Three days from</p>
            <p className="tnum font-display text-xl font-semibold text-ink">
              {date(w.day1_date)}
            </p>
            <p className="tnum text-xs text-ink-faint">
              {w.days_to_go === 0 ? 'today'
                : w.days_to_go > 0 ? `in ${w.days_to_go} days`
                : `${Math.abs(w.days_to_go)} days ago`}
            </p>
          </div>
          </div>
        </div>
        {w.assignment_note && (
          <p className="mt-3 rounded-lg border border-gold-200 bg-gold-50 px-3 py-2 text-xs text-gold-800">
            <span className="font-semibold">From the founder:</span> {w.assignment_note}
          </p>
        )}
      </header>

      {/* ---- money strip, for roles that may see the figures ---- */}
      {pnl && (
      <div className="card grid grid-cols-2 gap-px overflow-hidden bg-sand-200 lg:grid-cols-5">
        {[
          { l: 'Contract value', v: inr(pnl.package_revenue, { compact: true }),
            s: `${w.guest_count} guests` },
          { l: 'Additions billed', v: inr(pnl.additions_revenue, { compact: true }),
            s: w.actual_guest_count ? `${w.actual_guest_count} actual guests` : 'no extras yet' },
          { l: 'Vendor cost', v: inr(pnl.vendor_cost, { compact: true }),
            s: `${w.contract_count} contracts` },
          { l: 'Team cost', v: inr(pnl.labour_cost, { compact: true }),
            s: `${pnl.labour_hours} hours logged` },
          { l: 'Profit', v: inr(pnl.profit, { compact: true }),
            s: `${pnl.margin_pct}% margin`, tone: pnl.profit >= 0 ? 'good' : 'bad' },
        ].map((x) => (
          <div key={x.l} className="bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{x.l}</p>
            <p className={`tnum mt-1.5 font-display text-xl font-semibold ${
              x.tone === 'good' ? 'text-sage-700' : x.tone === 'bad' ? 'text-rust-700' : 'text-ink'}`}>
              {x.v}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-faint">{x.s}</p>
          </div>
        ))}
      </div>
      )}

      <Tabs tabs={tabs} active={activeTab} onChange={change} />

      {activeTab === 'plan'     && <PlanTab wedding={w} onChange={reload} />}
      {activeTab === 'vendors'  && <VendorsTab wedding={w} onChange={reload} />}
      {activeTab === 'runsheet' && <RunSheetTab wedding={w} />}
      {activeTab === 'money'    && <MoneyTab wedding={w} onChange={reload} />}

      <EditModal open={editing} onClose={() => setEditing(false)} wide
                 title="Edit wedding" subtitle={`${w.code} · moving day one moves all three days`}
                 initial={w}
                 fields={[
                   ...(founder ? [{ name: 'couple_name', label: 'Couple', required: true }] : []),
                   { name: 'status', label: 'Status', type: 'select', placeholder: false,
                     options: ['Planning', 'Execution', 'Completed', 'Cancelled'] },
                   { name: 'day1_date', label: 'Day one (Mehendi)', type: 'date', required: true },
                   { name: 'guest_count', label: 'Guests', type: 'number', required: true },
                   { name: 'city', label: 'City' },
                   { name: 'venue', label: 'Venue' },
                   { name: 'theme', label: 'Theme', full: true },
                   ...(founder ? [
                     { name: 'package_type', label: 'Package', type: 'select', placeholder: false,
                       options: ['Full-Service Wedding', 'Partial / Day-of'] },
                     { name: 'package_value', label: 'Contract value (₹)', type: 'number', help: 'What the couple pays the agency' },
                     { name: 'budget_cap', label: 'Couple’s budget cap (₹)', type: 'number' },
                   ] : []),
                 ]}
                 onSubmit={async (v) => {
                   const res = await api.patch(`/api/weddings/${w.id}`, v)
                   setToast({ message: res.detail }); reload()
                 }} />
      {founder && (
        <AssignModal wedding={assigning ? { ...w, manager_id: w.planner_id } : null}
                     managers={team.data?.managers}
                     onClose={() => setAssigning(false)}
                     onDone={(res) => { setToast({ message: res.detail }); reload(); team.reload() }} />
      )}
      {toast}
    </div>
  )
}
