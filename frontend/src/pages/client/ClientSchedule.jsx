import { useState } from 'react'

import { date } from '../../api'
import { ErrorBox, Spinner } from '../../components/ui'
import { usePolling } from '../../hooks'
import { ClientHead, NotBookedYet, PlannerCard } from './shared'

/** The three days, as the couple and their families should see them:
 *  what happens, when and where.  On the day it follows the clock. */
export default function ClientSchedule() {
  const { data, error, loading, reload } = usePolling('/api/client/schedule', 60000)
  const [day, setDay] = useState(null)

  if (loading) return <Spinner label="Opening the schedule" />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (data.booked === false) return <NotBookedYet title="Your schedule opens once you are booked" planner={data.planner} />

  if (!data.published) {
    return (
      <div className="space-y-6">
        <ClientHead eyebrow="Day schedule" title="The three days" />
        <div className="card p-10 text-center">
          <p className="text-3xl">◷</p>
          <h2 className="mt-3 font-display text-2xl text-ink">Your minute-by-minute schedule is on its way</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-faint">
            Your planner publishes it three weeks before — by {date(data.publish_by)} — once every vendor’s
            timing is locked.
          </p>
        </div>
        <PlannerCard planner={data.planner} />
      </div>
    )
  }

  const active = String(day ?? data.active_day ?? 1)
  const d = data.days[active]
  const now = d.slots.find((s) => s.state === 'now')
  const next = d.slots.find((s) => s.state === 'upcoming')

  return (
    <div className="space-y-6">
      <ClientHead eyebrow="Day schedule" title="The three days"
                  sub={`At ${data.venue}. Share it with your families — it’s the plan your planner runs from.`}
                  action={<button className="btn-ghost" onClick={() => window.print()}>Print</button>} />

      <div className="grid grid-cols-3 gap-2">
        {Object.entries(data.days).map(([k, v]) => (
          <button key={k} onClick={() => setDay(Number(k))}
                  className={`rounded-xl border-2 p-3 text-left transition-all sm:p-4 ${
                    k === active ? 'border-blush-500 bg-blush-50' : 'border-sand-200 bg-white hover:border-blush-300'}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Day {k}{Number(k) === data.active_day && ' · today'}
            </p>
            <p className="font-display text-lg text-ink sm:text-xl">{v.name}</p>
            <p className="tnum text-xs text-ink-faint">{date(v.date, { year: false })}</p>
          </button>
        ))}
      </div>

      {Number(active) === data.active_day && (now || next) && (
        <div className="card flex flex-wrap items-center gap-6 border-gold-300 bg-gold-50 p-5">
          {now && (
            <div>
              <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-700">
                <span className="h-2 w-2 animate-pulseDot rounded-full bg-gold-600" /> Now
              </p>
              <p className="font-display text-xl text-ink">{now.title}</p>
              {now.location && <p className="text-xs text-ink-faint">{now.location}</p>}
            </div>
          )}
          {next && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">Next · {next.start_time}</p>
              <p className="font-display text-xl text-ink">{next.title}</p>
              {next.location && <p className="text-xs text-ink-faint">{next.location}</p>}
            </div>
          )}
        </div>
      )}

      <ol className="card divide-y divide-sand-200 overflow-hidden">
        {d.slots.map((s) => (
          <li key={s.id} className={`flex items-start gap-4 px-5 py-3.5 ${
            s.state === 'now' ? 'bg-gold-50' : s.state === 'done' ? 'opacity-60' : ''}`}>
            <div className="w-20 shrink-0 text-right">
              <p className="tnum font-semibold text-ink">{s.start_time}</p>
              {s.end_time && <p className="tnum text-[11px] text-ink-faint">to {s.end_time}</p>}
            </div>
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
              s.state === 'now' ? 'animate-pulseDot bg-gold-500' : s.state === 'done' ? 'bg-sage-600' : 'bg-blush-300'}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{s.title}</p>
              {s.location && <p className="text-xs text-ink-faint">{s.location}</p>}
            </div>
            <span className={`text-[11px] ${s.state === 'now' ? 'font-semibold text-gold-700' : s.state === 'done' ? 'text-sage-700' : 'text-ink-faint'}`}>
              {s.state === 'now' ? 'happening now' : s.state === 'done' ? '✓' : ''}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-ink-faint">
        Times are the plan. On the day your planner keeps everything to it — if anything moves, they handle it.
      </p>
    </div>
  )
}
