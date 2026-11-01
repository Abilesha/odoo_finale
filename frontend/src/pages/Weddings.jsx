import { useState } from 'react'
import { Link } from 'react-router-dom'

import { date, inr, relativeDays } from '../api'
import { CAP, useAuth } from '../auth'
import { Avatar } from '../components/kit'
import { ErrorBox, ProgressBar, Spinner, Stat, StatusPill } from '../components/ui'
import { useApi } from '../hooks'

const FILTERS = ['All', 'Planning', 'Execution', 'Completed']

export default function Weddings() {
  const { data, error, loading, reload } = useApi('/api/weddings')
  const [filter, setFilter] = useState('All')
  const [q, setQ] = useState('')
  const [mgr, setMgr] = useState('')
  const { can } = useAuth()
  const founder = can(CAP.TEAM)

  if (loading) return <Spinner label="Loading weddings" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const all = data.weddings
  const managers = [...new Map(all.filter((w) => w.manager).map((w) => [w.manager_id, w.manager])).entries()]
  const shown = all.filter((w) =>
    (filter === 'All' || w.status === filter) &&
    (!mgr || (mgr === 'none' ? !w.manager_id : String(w.manager_id) === mgr)) &&
    (!q || `${w.couple_name} ${w.code} ${w.venue || ''}`.toLowerCase().includes(q.toLowerCase()))
  )
  const live = all.filter((w) => w.status === 'Execution')

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl text-ink">Weddings</h1>
        <p className="mt-1 text-sm text-ink-faint">
          {founder
            ? 'Every wedding in the agency, and who runs each one.'
            : 'The weddings the founder has assigned to you — plan, vendors, run sheet and payments in one place.'}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="This season" value={all.length} icon="❖" />
        <Stat label="In planning" value={all.filter((w) => w.status === 'Planning').length} tone="plum" icon="✎" />
        <Stat label="Running now" value={live.length}
              sub={live.length ? live[0].couple_name : null}
              tone={live.length ? 'gold' : 'neutral'} icon="●" />
        <Stat label="Completed" value={all.filter((w) => w.status === 'Completed').length} tone="good" icon="✓" />
      </div>

      {live.length > 0 && (
        <div className="card border-gold-300 bg-gold-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gold-500" />
              </span>
              <div>
                <p className="text-sm font-medium text-ink">
                  {live[0].couple_name} is happening now
                </p>
                <p className="text-xs text-ink-faint">{live[0].venue}</p>
              </div>
            </div>
            <Link to={`/weddings/${live[0].id}?tab=runsheet`} className="btn-gold btn-sm">
              Open live run sheet →
            </Link>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-sand-300 bg-white p-1">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f ? 'bg-plum-700 text-white' : 'text-ink-soft hover:bg-sand-100'}`}>
              {f}
            </button>
          ))}
        </div>
        {founder && (
          <select className="input w-auto" value={mgr} onChange={(e) => setMgr(e.target.value)}>
            <option value="">Every manager</option>
            <option value="none">Unassigned</option>
            {managers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
        <input className="input max-w-xs" placeholder="Search couple, code or venue…"
               value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-xs text-ink-faint">{shown.length} shown</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((w) => (
          <Link key={w.id} to={`/weddings/${w.id}`}
                className="card group p-5 transition-shadow hover:shadow-lift">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-display text-xl text-ink group-hover:text-plum-700">
                  {w.couple_name}
                </h3>
                <p className="tnum mt-0.5 text-xs text-ink-faint">{w.code} · {w.city}</p>
              </div>
              <StatusPill status={w.status} />
            </div>

            <p className="mt-3 truncate text-sm text-ink-soft">{w.venue || 'Venue not yet booked'}</p>
            <p className="mt-0.5 text-xs text-ink-faint">{w.theme}</p>
            {founder && (
              <p className="mt-2 flex items-center gap-2 text-xs">
                {w.manager
                  ? <><Avatar name={w.manager} size="sm" tone="night" /><span className="text-ink-soft">{w.manager}</span></>
                  : <span className="pill bg-gold-100 text-gold-700">Needs a manager</span>}
              </p>
            )}

            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-sand-200 pt-3 text-xs">
              <div>
                <p className="text-ink-faint">Dates</p>
                <p className="tnum mt-0.5 font-medium text-ink">{date(w.day1_date, { year: false })}</p>
                <p className="text-[11px] text-ink-faint">{relativeDays(w.day1_date)}</p>
              </div>
              <div>
                <p className="text-ink-faint">Guests</p>
                <p className="tnum mt-0.5 font-medium text-ink">{w.guest_count}</p>
                {w.actual_guest_count && w.actual_guest_count !== w.guest_count && (
                  <p className="text-[11px] text-gold-700">+{w.actual_guest_count - w.guest_count} actual</p>
                )}
              </div>
              <div>
                <p className="text-ink-faint">Value</p>
                <p className="tnum mt-0.5 font-medium text-ink">
                  {inr(w.package_value, { compact: true })}
                </p>
                <p className="text-[11px] text-ink-faint">{w.contract_count} vendors</p>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-ink-faint">
                  {w.task_done}/{w.task_total} tasks
                  {w.task_overdue > 0 && (
                    <span className="ml-2 text-rust-700">{w.task_overdue} overdue</span>
                  )}
                </span>
                <span className="tnum font-medium text-ink-soft">{w.progress_pct}%</span>
              </div>
              <ProgressBar value={w.progress_pct}
                           tone={w.task_overdue > 0 ? 'gold' : 'plum'} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
