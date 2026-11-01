import { Link, useSearchParams } from 'react-router-dom'

import { date, inr } from '../../api'
import { Countdown, Ring } from '../../components/kit'
import { ErrorBox, ProgressBar, Spinner } from '../../components/ui'
import { usePolling } from '../../hooks'
import { JourneyTrack } from '../../components/CoupleJourney'
import { Journey, PlannerCard } from './shared'

const ACTION_ICON = { sign: '✍', choose: '♡', reply: '✉', task: '☑', pay: '₹' }

const STAGE_LINE = {
  enquiry: 'Your enquiry is in. Your planner will call you within a day to set up a first meeting.',
  meeting: 'Your planner is getting to know what you want — the agreement comes next.',
  agreement: 'Your service agreement is ready. Once it is signed and the booking amount lands, your plan opens.',
  booked: 'You are booked. Your planner is starting on the venue and the design.',
  planning: 'Your wedding is coming together.',
  wedding: 'It is your wedding.',
  complete: 'Congratulations — and thank you for letting us be part of it.',
}

/** The couple's front page: where they are, what is next, and what they
 *  need to do — nothing they have to dig for. */
export default function ClientHome() {
  const [params] = useSearchParams()
  const { data, error, loading, reload } = usePolling('/api/client/overview', 60000)

  if (loading) return <Spinner label="Opening your wedding" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const w = data.wedding
  const first = data.me.name.split(' ')[0]
  const welcome = params.get('welcome')

  return (
    <div className="space-y-6">
      {welcome && (
        <div className="card animate-rise border-gold-300 bg-gold-50 p-5">
          <p className="font-display text-xl text-ink">Thank you, {first}. Your enquiry is with us.</p>
          <p className="mt-1 text-sm text-ink-soft">
            {data.planner ? `${data.planner.name} is your planner and will call you within a day. ` : ''}
            This page is yours — come back any time to see where things are.
          </p>
        </div>
      )}

      {/* ---- hero ---- */}
      <section className="relative overflow-hidden rounded-2xl bg-blush-900 text-sand-50 shadow-lift">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-gold-400/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/4 h-72 w-72 rounded-full bg-blush-500/30 blur-3xl" />
        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold-300">
              {w ? `${w.venue || w.city} · ${w.guest_count} guests` : `Enquiry · ${data.enquiry.city}`}
            </p>
            <h1 className="mt-2 font-display text-4xl sm:text-5xl">{data.couple_name}</h1>
            <p className="mt-3 max-w-xl text-blush-200">{STAGE_LINE[data.stage]}</p>
            {w && (
              <p className="mt-1 text-sm text-blush-300">
                {date(w.day1_date, { year: false })} – {date(w.day3_date)}{w.theme && ` · ${w.theme}`}
              </p>
            )}
          </div>
          {w?.live ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
              <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-300">
                <span className="h-2 w-2 animate-pulseDot rounded-full bg-gold-300" /> Today · Day {w.active_day} of 3
              </p>
              <p className="mt-1 font-display text-2xl">{w.events[w.active_day - 1]?.name}</p>
              <Link to="/schedule" className="btn mt-4 bg-gold-500 text-white hover:bg-gold-600">Today’s schedule →</Link>
            </div>
          ) : w?.next_moment ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-300">Until your {w.next_moment.name}</p>
              <div className="mt-3"><Countdown to={w.next_moment.starts_at} size="hero" tone="dark" /></div>
            </div>
          ) : null}
        </div>
      </section>

      {/* ---- the journey ---- */}
      <section className="card p-5">
        <Journey steps={data.journey} />
      </section>

      {w && <CeremonyProgress wedding={w} />}

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        {/* ---- what needs them ---- */}
        <section className="card overflow-hidden">
          <header className="border-b border-sand-200 px-5 py-4">
            <h2 className="text-xl text-ink">Waiting for you</h2>
            <p className="text-xs text-ink-faint">The few things only the two of you can do</p>
          </header>
          {data.actions.length === 0 ? (
            <p className="p-5 text-sm text-ink-faint">Nothing right now — your planner has it. ✓</p>
          ) : (
            <ul className="divide-y divide-sand-200">
              {data.actions.map((a, i) => {
                const body = (
                  <>
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base ${
                      a.urgent ? 'bg-blush-600 text-white' : 'bg-blush-100 text-blush-700'}`}>{ACTION_ICON[a.kind]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">{a.title}</span>
                      {a.detail && <span className="block truncate text-xs text-ink-faint">{a.detail}</span>}
                    </span>
                    <span className="text-blush-600">→</span>
                  </>
                )
                const cls = 'flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-blush-50'
                return (
                  <li key={i}>
                    {a.external
                      ? <a href={a.to} className={cls}>{body}</a>
                      : <Link to={a.to} className={cls}>{body}</Link>}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <PlannerCard planner={data.planner} />
          {data.open_tickets > 0 && (
            <Link to="/help" className="card flex items-center justify-between p-4 hover:shadow-lift">
              <span className="text-sm text-ink">{data.open_tickets} open question{data.open_tickets > 1 ? 's' : ''} with your planner</span>
              <span className="text-blush-600">→</span>
            </Link>
          )}
        </div>
      </div>

      {/* ---- the wedding at a glance ---- */}
      {w ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Link to="/checklist" className="card flex items-center gap-4 p-5 hover:shadow-lift">
            <Ring value={w.planning_pct} tone="plum" size={64} />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Planning</p>
              <p className="text-sm text-ink">Your planner’s work</p>
              <p className="text-xs text-ink-faint">{w.your_tasks_open} to-do{w.your_tasks_open === 1 ? '' : 's'} left for you</p>
            </div>
          </Link>
          <Link to="/payments" className="card p-5 hover:shadow-lift">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Paid so far</p>
            <p className="tnum mt-1 font-display text-2xl font-semibold text-ink">{inr(w.money.paid, { compact: true })}</p>
            <div className="mt-2"><ProgressBar value={w.money.paid_pct} tone="gold" /></div>
            <p className="mt-1 text-xs text-ink-faint">of {inr(w.money.total, { compact: true })}
              {w.next_payment && ` · next ${date(w.next_payment.due_date, { year: false })}`}</p>
          </Link>
          <Link to="/vendors" className="card p-5 hover:shadow-lift">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Vendors</p>
            <p className="tnum mt-1 font-display text-2xl font-semibold text-ink">{w.vendors_confirmed}</p>
            <p className="text-xs text-ink-faint">confirmed for your wedding</p>
          </Link>
          <Link to="/timeline" className="card p-5 hover:shadow-lift">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">The three days</p>
            <ul className="mt-2 space-y-1 text-sm">
              {w.events.map((e) => (
                <li key={e.day} className="flex justify-between gap-2">
                  <span className="text-ink">{e.name}</span>
                  <span className="tnum text-ink-faint">{date(e.date, { year: false })}</span>
                </li>
              ))}
            </ul>
          </Link>
        </div>
      ) : (
        <section className="card p-5">
          <h2 className="text-xl text-ink">What you told us</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Dates', data.enquiry.rough_date ? date(data.enquiry.rough_date) : 'Flexible'],
              ['Guests', data.enquiry.guest_count],
              ['City', data.enquiry.city],
              ['Package', data.enquiry.package],
              ['Mood', data.enquiry.theme || 'To find together'],
              ['Ceremonies', data.enquiry.events || '—'],
              ['Services', data.enquiry.services || '—'],
            ].map(([k, v]) => (
              <div key={k}><dt className="text-[11px] uppercase tracking-wider text-ink-faint">{k}</dt><dd className="text-ink">{v}</dd></div>
            ))}
          </dl>
        </section>
      )}
    </div>
  )
}

/** A live, date-driven view of the couple moving toward their celebration.
 *  The position is calculated from the wedding date, so no manual status
 *  update is needed as the event gets closer. */
function CeremonyProgress({ wedding }) {
  const days = Math.max(0, wedding.days_to_go ?? 0)
  const progress = wedding.live || days === 0 ? 100 : Math.max(5, Math.min(92, 100 - (days / 180) * 100))
  const label = wedding.live ? 'Your celebration is under way' : days === 1 ? 'Tomorrow is the first celebration' : `${days} days to your first celebration`

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sand-200 px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blush-600">Celebration journey</p>
          <h2 className="mt-1 text-xl text-ink">Together, all the way to the mandap</h2>
        </div>
        <span className="rounded-full bg-gold-100 px-3 py-1 text-xs font-medium text-gold-800">{label}</span>
      </div>
      <div className="px-6 pb-6 pt-6">
        <JourneyTrack progress={progress} tone="sand" coupleHeight={112} start="Today" end={`Mehendi · ${date(wedding.day1_date, { year: false })}`} />
        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          {wedding.events.map((event) => (
            <div key={event.day} className="rounded-lg bg-sand-50 px-3 py-2 text-sm">
              <span className="font-medium text-ink">Day {event.day} · {event.name}</span>
              <span className="ml-2 text-xs text-ink-faint">{date(event.date, { year: false })}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-faint">Your planner can update the first event date in the wedding file; the three-day celebration moves together.</p>
      </div>
    </section>
  )
}
