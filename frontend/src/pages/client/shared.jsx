import { Link } from 'react-router-dom'

import { Avatar } from '../../components/kit'

/** Where the couple is: enquiry → … → married. */
export function Journey({ steps }) {
  return (
    <ol className="flex items-start gap-1 overflow-x-auto pb-1">
      {steps.map((s, i) => (
        <li key={s.key} className="flex min-w-[5.5rem] flex-1 flex-col items-center text-center">
          <div className="flex w-full items-center">
            <span className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : s.state === 'upcoming' ? 'bg-blush-200' : 'bg-blush-500'}`} />
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              s.state === 'done' ? 'bg-blush-600 text-white'
                : s.state === 'current' ? 'bg-gold-400 text-blush-900 ring-4 ring-gold-200'
                : 'border-2 border-blush-200 bg-white text-blush-300'}`}>
              {s.state === 'done' ? '✓' : i + 1}
            </span>
            <span className={`h-0.5 flex-1 ${i === steps.length - 1 ? 'opacity-0' : steps[i + 1]?.state === 'upcoming' ? 'bg-blush-200' : 'bg-blush-500'}`} />
          </div>
          <span className={`mt-2 text-[11px] leading-tight ${
            s.state === 'current' ? 'font-semibold text-ink' : s.state === 'done' ? 'text-blush-700' : 'text-ink-faint'}`}>
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** "Your planner" — a name and a number, which is what a couple wants. */
export function PlannerCard({ planner, compact = false }) {
  if (!planner) return null
  return (
    <div className={`flex items-center gap-4 ${compact ? '' : 'card p-5'}`}>
      <Avatar name={planner.name} src={planner.avatar} size="lg" tone="gold" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blush-600">Your planner</p>
        <p className="font-display text-xl text-ink">{planner.name}</p>
        <p className="text-xs text-ink-faint">{planner.title}{planner.city && ` · ${planner.city}`}</p>
      </div>
      <div className="flex flex-col gap-1.5 text-right">
        {planner.phone && <a href={`tel:${planner.phone}`} className="btn-ghost btn-sm">Call</a>}
        <Link to="/help" className="btn btn-sm bg-blush-700 text-white hover:bg-blush-800">Message</Link>
      </div>
    </div>
  )
}

/** Shown on screens that only make sense once the wedding is booked. */
export function NotBookedYet({ title = 'This opens once you are booked', planner }) {
  return (
    <div className="space-y-4">
      <div className="card p-10 text-center">
        <p className="text-3xl">♡</p>
        <h2 className="mt-3 font-display text-2xl text-ink">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-faint">
          Once your agreement is signed and the booking amount lands, your full plan, payment
          schedule, vendors and the schedule for the three days appear here.
        </p>
        <Link to="/agreement" className="btn mt-5 bg-blush-700 text-white hover:bg-blush-800">See your agreement</Link>
      </div>
      <PlannerCard planner={planner} />
    </div>
  )
}

export const ClientHead = ({ eyebrow, title, sub, action }) => (
  <header className="flex flex-wrap items-end justify-between gap-4">
    <div>
      {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blush-600">{eyebrow}</p>}
      <h1 className="mt-1 text-3xl text-ink sm:text-4xl">{title}</h1>
      {sub && <p className="mt-1.5 max-w-2xl text-sm text-ink-faint">{sub}</p>}
    </div>
    {action}
  </header>
)
