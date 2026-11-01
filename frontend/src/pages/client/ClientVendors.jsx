import { ErrorBox, Spinner } from '../../components/ui'
import { useApi } from '../../hooks'
import { ClientHead, NotBookedYet } from './shared'

const ICON = {
  Caterer: '🍽', Decorator: '✿', Photographer: '◉', DJ: '♫', Drummers: '♪', 'Makeup Artist': '✦',
  'Mehendi Artist': '❦', Florist: '❀', Pandit: '☸', Transport: '⛟',
}

const STATUS = {
  Confirmed: 'bg-sage-100 text-sage-700',
  'On Track': 'bg-sage-100 text-sage-700',
  Completed: 'bg-plum-100 text-plum-700',
  'In hand': 'bg-gold-100 text-gold-700',
}

/** Who is doing what at their wedding, and the decisions waiting for them. */
export default function ClientVendors() {
  const { data, error, loading, reload } = useApi('/api/client/vendors')

  if (loading) return <Spinner label="Finding your vendors" />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (data.booked === false) return <NotBookedYet title="Your vendors appear once you are booked" planner={data.planner} />

  const waiting = data.decisions.filter((d) => d.state === 'Your choice')

  return (
    <div className="space-y-6">
      <ClientHead eyebrow="Vendors" title="The people making your wedding"
                  sub="Everyone confirmed so far. When your planner needs you to choose, it waits for you here." />

      {waiting.map((d) => (
        <a key={d.id} href={d.to}
           className="card flex flex-wrap items-center justify-between gap-4 border-gold-300 bg-gold-50 p-5 shadow-glow transition-shadow hover:shadow-lift">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-700">Your choice</p>
            <p className="mt-1 font-display text-2xl text-ink">Choose your {d.category.toLowerCase()}</p>
            <p className="text-sm text-ink-soft">{d.title} — your planner has shortlisted the best three for you.</p>
          </div>
          <span className="btn bg-blush-700 text-white hover:bg-blush-800">Compare and choose →</span>
        </a>
      ))}

      {data.decisions.filter((d) => d.state !== 'Your choice').length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.decisions.filter((d) => d.state !== 'Your choice').map((d) => (
            <span key={d.id} className="pill bg-white text-ink-soft ring-1 ring-sand-200">
              {d.category}: {d.state === 'Collecting quotes' ? `your planner is collecting quotes from ${d.invited}` : d.state.toLowerCase()}
            </span>
          ))}
        </div>
      )}

      {data.vendors.length === 0 ? (
        <p className="text-sm text-ink-faint">No vendors confirmed yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.vendors.map((v) => (
            <article key={v.category + v.name} className="card p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blush-100 text-lg text-blush-700">
                  {ICON[v.category] || '◎'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{v.category}</p>
                  <p className="font-display text-lg leading-tight text-ink">{v.name}</p>
                  <p className="text-xs text-ink-faint">{v.city}{v.contact_person && ` · ${v.contact_person}`}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-sand-200 pt-3 text-xs">
                <span className="text-ink-faint">★ {v.rating} · {v.on_time_pct}% on time</span>
                <span className={`pill ${STATUS[v.status] || 'bg-sand-200 text-ink-soft'}`}>
                  {v.status === 'In hand' ? 'Your planner is on it' : v.status}
                  {v.progress_pct != null && v.status !== 'Completed' && ` · ${v.progress_pct}%`}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
