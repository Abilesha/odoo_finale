import { useEffect, useRef } from 'react'

import { date } from '../../api'
import { ErrorBox, Spinner } from '../../components/ui'
import { useApi } from '../../hooks'
import { JourneyTrack } from '../../components/CoupleJourney'
import { ClientHead } from './shared'

const KIND = {
  milestone: { label: 'Milestone', dot: 'bg-plum-600' },
  payment: { label: 'Payment', dot: 'bg-gold-500' },
  vendor: { label: 'Vendors', dot: 'bg-jade-600' },
  phase: { label: 'Planning', dot: 'bg-night-600' },
  you: { label: 'Your to-do', dot: 'bg-blush-500' },
  event: { label: 'Your wedding', dot: 'bg-blush-700' },
}

/** Everything on one line, from the first call to the last day — with a
 *  "you are here" marker. */
export default function ClientTimeline() {
  const { data, error, loading, reload } = useApi('/api/client/timeline')
  const here = useRef(null)

  useEffect(() => {
    if (data) here.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [data])

  if (loading) return <Spinner label="Laying out your timeline" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const items = data.items
  const firstUpcoming = items.findIndex((i) => i.state !== 'done')
  const nextEvent = items.find((i) => i.kind === 'event' && i.state !== 'done')
  const daysToEvent = nextEvent
    ? Math.max(0, Math.ceil((new Date(`${nextEvent.date}T00:00:00`) - new Date(`${data.today}T00:00:00`)) / 86400000))
    : null
  const eventProgress = daysToEvent === null ? 100 : Math.max(5, Math.min(100, 100 - (daysToEvent / 180) * 100))
  let lastMonth = null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <ClientHead eyebrow="Timeline" title="Your wedding, start to finish"
                  sub="What has happened, what is coming, and what is yours to do — in order." />

      <div className="flex flex-wrap gap-3 text-xs text-ink-faint">
        {Object.entries(KIND).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${v.dot}`} />{v.label}</span>
        ))}
      </div>

      {nextEvent && (
        <section className="rounded-2xl border border-blush-200 bg-gradient-to-r from-blush-50 to-gold-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blush-600">The celebration is getting closer</p>
              <p className="mt-1 font-display text-xl text-ink">{nextEvent.title} · {date(nextEvent.date, { year: false })}</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-blush-700 shadow-sm">
              {daysToEvent === 0 ? 'It is here' : `${daysToEvent} days to go`}
            </span>
          </div>
          <div className="mt-4">
            <JourneyTrack progress={eventProgress} coupleHeight={76} start="Today" end={nextEvent.title} />
          </div>
        </section>
      )}

      <ol className="relative">
        <span className="absolute bottom-0 left-[7.5rem] top-0 hidden w-px bg-blush-200 sm:block" />
        {items.map((it, i) => {
          const month = it.date.slice(0, 7)
          const showMonth = month !== lastMonth
          lastMonth = month
          const k = KIND[it.kind]
          const isHere = i === firstUpcoming
          return (
            <li key={i}>
              {isHere && (
                <div ref={here} className="relative my-4 flex items-center gap-3 sm:pl-[6.6rem]">
                  <span className="rounded-full bg-gold-400 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-blush-900">
                    You are here · {date(data.today, { year: false })}
                  </span>
                  <span className="h-px flex-1 bg-gold-300" />
                </div>
              )}
              {showMonth && (
                <p className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint sm:pl-[9rem]">
                  {new Date(it.date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                </p>
              )}
              <div className="relative flex gap-4 py-2">
                <span className="tnum hidden w-24 shrink-0 pt-2.5 text-right text-xs text-ink-faint sm:block">
                  {date(it.date, { year: false })}
                </span>
                <span className={`relative z-10 mt-3 hidden h-3 w-3 shrink-0 rounded-full ring-4 ring-sand-100 sm:block ${
                  it.state === 'done' ? k.dot : 'border-2 border-current bg-white text-blush-300'}`} />
                <div className={`flex-1 rounded-xl border px-4 py-3 ${
                  it.kind === 'event' ? 'border-blush-300 bg-blush-50'
                    : it.state === 'done' ? 'border-sand-200 bg-white/60' : 'border-sand-200 bg-white'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className={`text-sm ${it.kind === 'event' ? 'font-display text-lg text-blush-800'
                      : it.state === 'done' ? 'text-ink-soft' : 'font-medium text-ink'}`}>
                      <span className="mr-1.5 opacity-60">{it.icon}</span>{it.title}
                    </p>
                    <span className={`shrink-0 text-[11px] ${
                      it.state === 'done' ? 'text-sage-700' : it.state === 'today' ? 'font-semibold text-gold-700' : 'text-ink-faint'}`}>
                      {it.state === 'done' ? '✓ done' : it.state === 'today' ? 'today' : <span className="sm:hidden">{date(it.date, { year: false })}</span>}
                    </span>
                  </div>
                  {it.detail && <p className="mt-0.5 text-xs text-ink-faint">{it.detail}</p>}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      {!data.has_wedding && (
        <p className="rounded-xl bg-blush-50 p-4 text-sm text-blush-800">
          The rest of your timeline — payments, vendors, planning and the three days — fills in the
          moment your booking is confirmed.
        </p>
      )}
    </div>
  )
}
