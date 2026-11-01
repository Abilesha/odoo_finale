import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { api } from '../api'
import { useAuth } from '../auth'
import { ErrorBox } from '../components/ui'
import { useDraft, useWizardStep } from '../wizard'

/** Vendor self-registration — its own page, four short steps.
 *
 *  Why a page and not a panel inside the sign-in screen: the step lives in the
 *  address bar (?step=2), so the browser's Back button goes back one step
 *  instead of throwing the whole form away, a refresh lands on the same step,
 *  and every answer except the password is kept as a draft on this device
 *  until the business is created.
 */

const CATEGORIES = [
  { id: 'Caterer', note: 'Menus, live counters, service staff' },
  { id: 'Decorator', note: 'Mandap, stage, florals, lighting' },
  { id: 'Photographer', note: 'Candid, traditional, films' },
  { id: 'Makeup Artist', note: 'Bridal and family looks' },
  { id: 'Mehendi Artist', note: 'Bridal and guest henna' },
  { id: 'DJ', note: 'Sound, lights, dance floor' },
  { id: 'Drummers', note: 'Dhol, nagada, baraat' },
  { id: 'Florist', note: 'Garlands, varmala, flowers' },
  { id: 'Pandit', note: 'Ceremonies and muhurat' },
  { id: 'Transport', note: 'Couple car, guest shuttles' },
]

const SUGGESTED = {
  Caterer: ['Live counters', 'Jain and vegan menus', 'Regional Rajasthani', 'Crockery and service staff'],
  Decorator: ['Mandap design', 'Floral installations', 'Stage and lighting', 'Haldi and Mehendi setups'],
  Photographer: ['Candid and traditional', 'Cinematic film', 'Drone coverage', 'Same-day edit'],
  'Makeup Artist': ['Bridal HD makeup', 'Airbrush makeup', 'Family makeup', 'Hair styling'],
  'Mehendi Artist': ['Bridal mehendi', 'Guest mehendi', 'Organic henna'],
  DJ: ['Sangeet sound and lighting', 'LED dance floor', 'Reception console'],
  Drummers: ['Baraat procession', 'Dhol and nagada', 'Shehnai'],
  Florist: ['Imported flowers', 'Fresh garlands and varmala', 'Car decoration'],
  Pandit: ['Vedic ceremony', 'Muhurat consultation', 'Havan'],
  Transport: ['Vintage car for the couple', 'Guest shuttles', 'Airport pickups'],
}

const CITIES = ['Jaipur', 'Udaipur', 'Jodhpur', 'Jaisalmer', 'Pushkar', 'Delhi NCR', 'Mumbai', 'Goa']

const STEPS = [
  { id: 'Business', blurb: 'What you do' },
  { id: 'Contact', blurb: 'Who we speak to' },
  { id: 'Capacity', blurb: 'How much you can take on' },
  { id: 'Account', blurb: 'Review and sign-in' },
]

const EMPTY = {
  name: '', category: '', other_category: '', city: '', other_city: '',
  contact_person: '', email: '', phone: '',
  service_cities: [], max_guests: '', team_size: '', max_events_per_day: '', lead_time_days: '',
  capabilities: [], capability_note: '',
  password: '', confirm: '', agree: false,
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/
const digits = (s) => (s || '').replace(/\D/g, '').length

export default function VendorJoin() {
  const navigate = useNavigate()
  const { user, adopt } = useAuth()
  const [f, setF, draft] = useDraft('rk.vendor-join.v1', EMPTY, ['password', 'confirm'])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [show, setShow] = useState(false)
  const [newCap, setNewCap] = useState('')

  const category = f.category === 'Other' ? f.other_category.trim() : f.category
  const city = f.city === 'Other' ? f.other_city.trim() : f.city

  // what still blocks each step, in plain words — null means the step is done
  const missingAt = (i) => [
    () => (f.name.trim().length < 2 ? 'Your business name'
      : category.length < 2 ? 'What kind of work you do'
      : city.length < 2 ? 'Your base city' : null),
    () => (f.contact_person.trim().length < 2 ? 'Your name'
      : !EMAIL_RE.test(f.email.trim()) ? 'A valid business email'
      : digits(f.phone) < 10 ? 'A phone number with 10 digits' : null),
    () => (f.max_guests !== '' && Number(f.max_guests) < 1 ? 'Guests should be 1 or more'
      : f.team_size !== '' && Number(f.team_size) < 1 ? 'Team size should be 1 or more' : null),
    () => (f.password.length < 8 ? 'A password of 8 or more characters'
      : f.password !== f.confirm ? 'Both passwords to match'
      : !f.agree ? 'Your agreement to the partner terms' : null),
  ][i]()

  const firstOpen = [0, 1, 2, 3].find((i) => i < 3 && missingAt(i))
  const { step, goTo } = useWizardStep(STEPS.length, firstOpen ?? 3)
  const missing = missingAt(step)

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const toggle = (k, v) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }))
  const pickCategory = (id) => setF((x) => ({ ...x, category: id, capabilities: x.category === id ? x.capabilities : [] }))
  const pickCity = (c) => setF((x) => ({ ...x, city: c, service_cities: c !== 'Other' && !x.service_cities.includes(c) ? [c, ...x.service_cities] : x.service_cities }))

  const suggestions = useMemo(() => SUGGESTED[f.category] || [], [f.category])
  const servingIn = useMemo(() => {
    const all = [...(city && !f.service_cities.includes(city) ? [city] : []), ...f.service_cities]
    return all.filter((c) => c && c !== 'Other')
  }, [city, f.service_cities])

  if (user && !busy) return <Navigate to="/" replace />

  async function submit() {
    setBusy(true); setErr(null)
    const caps = [...f.capabilities, ...f.capability_note.split('\n').map((s) => s.trim()).filter(Boolean)]
    const num = (v) => (v === '' || v === null ? null : Number(v))
    try {
      const res = await api.post('/api/vendor-signup', {
        name: f.name.trim(),
        category,
        city,
        contact_person: f.contact_person.trim(),
        email: f.email.trim(),
        phone: f.phone.trim(),
        password: f.password,
        service_cities: servingIn.join(', ') || null,
        capabilities: caps.join('\n') || null,
        max_guests: num(f.max_guests),
        team_size: num(f.team_size),
        max_events_per_day: num(f.max_events_per_day),
        lead_time_days: num(f.lead_time_days),
      })
      draft.clear()
      adopt(res.token, res.user)
      navigate('/?welcome=vendor', { replace: true })
    } catch (e) {
      setErr(e); setBusy(false)
    }
  }

  const next = () => (step < STEPS.length - 1 ? goTo(step + 1) : submit())
  const emailTaken = err && /already uses this business email/i.test(err.message || '')

  return (
    <div className="min-h-screen bg-jade-950 bg-cover bg-fixed bg-center text-sand-50"
         style={{ backgroundImage: "linear-gradient(rgba(10, 27, 22, .86), rgba(10, 27, 22, .93)), url('/auth/vendor-jade.png')" }}>
      <header className="border-b border-white/10 bg-jade-950/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
          <Link to="/?as=vendor" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-400 font-display text-lg font-bold text-jade-900">R</span>
            <span><span className="block font-display text-lg leading-none text-white">The Royal Knot</span><span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.22em] text-jade-200">Vendor partners</span></span>
          </Link>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => (step > 0 ? goTo(step - 1) : navigate('/?as=vendor'))}
                    className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/20">
              <span aria-hidden>←</span>{step > 0 ? `Back to ${STEPS[step - 1].id.toLowerCase()}` : 'Back to sign in'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[18rem_1fr] lg:py-12">
        {/* ---- the left rail: steps and a live preview ---- */}
        <aside className="space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gold-300">Become a partner</p>
            <h1 className="mt-2 font-display text-4xl leading-tight text-white">List your business</h1>
            <p className="mt-2 text-sm text-jade-100/80">Four short steps. Your answers are kept on this device, so you can step back or come back later.</p>
          </div>
          <ol className="space-y-2" aria-label="Steps">
            {STEPS.map((s, i) => {
              const done = i < step && !missingAt(i)
              const reachable = i <= (firstOpen ?? 3)
              return (
                <li key={s.id}>
                  <button type="button" disabled={!reachable || i === step} onClick={() => goTo(i)}
                          className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                            i === step ? 'border-gold-400/70 bg-white/15' : reachable ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-white/5 bg-transparent opacity-60'}`}>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      done ? 'bg-jade-400 text-jade-950' : i === step ? 'bg-gold-400 text-jade-950' : 'bg-white/10 text-jade-100'}`}>{done ? '✓' : i + 1}</span>
                    <span><span className="block text-sm font-semibold text-white">{s.id}</span><span className="block text-xs text-jade-100/70">{s.blurb}</span></span>
                  </button>
                </li>
              )
            })}
          </ol>
          <Preview f={f} category={category} city={city} servingIn={servingIn} />
          <p className="text-xs text-jade-100/60" aria-live="polite">{draft.savedAt ? '✓ Draft saved on this device' : ' '}</p>
        </aside>

        {/* ---- the current step ---- */}
        <section key={step} className="animate-rise rounded-2xl border border-white/70 bg-white p-6 text-ink shadow-2xl sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-jade-600">Step {step + 1} of {STEPS.length}</p>

          {step === 0 && <div className="mt-1 space-y-6">
            <h2 className="text-3xl text-ink">Tell us about your business</h2>
            <div>
              <label className="label" htmlFor="vj-name">Business name</label>
              <input id="vj-name" className="input text-base" value={f.name} onChange={set('name')} placeholder="e.g. Gulmohar Decor Studio" autoFocus />
            </div>
            <div>
              <span className="label">What kind of work do you do?</span>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {[...CATEGORIES, { id: 'Other', note: 'Something else' }].map((c) => {
                  const on = f.category === c.id
                  return (
                    <button type="button" key={c.id} onClick={() => pickCategory(c.id)} aria-pressed={on}
                            className={`flex items-start gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition ${on ? 'border-jade-600 bg-jade-50' : 'border-sand-200 hover:border-jade-300'}`}>
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${on ? 'bg-jade-600 text-white' : 'bg-sand-100 text-jade-700'}`}>{c.id[0]}</span>
                      <span><span className="block text-sm font-semibold text-ink">{c.id}</span><span className="block text-xs text-ink-faint">{c.note}</span></span>
                    </button>
                  )
                })}
              </div>
              {f.category === 'Other' && <input className="input mt-3" value={f.other_category} onChange={set('other_category')} placeholder="e.g. Choreographer, Tent house, Invitations" autoFocus />}
            </div>
            <div>
              <span className="label">Where is your business based?</span>
              <div className="flex flex-wrap gap-2">
                {[...CITIES, 'Other'].map((c) => (
                  <button type="button" key={c} onClick={() => pickCity(c)} aria-pressed={f.city === c}
                          className={`rounded-full border px-3.5 py-1.5 text-sm transition ${f.city === c ? 'border-jade-600 bg-jade-600 text-white' : 'border-sand-300 bg-white text-ink-soft hover:border-jade-300'}`}>{c}</button>
                ))}
              </div>
              {f.city === 'Other' && <input className="input mt-3 max-w-sm" value={f.other_city} onChange={set('other_city')} placeholder="Your city" autoFocus />}
            </div>
          </div>}

          {step === 1 && <div className="mt-1 space-y-6">
            <h2 className="text-3xl text-ink">Who should our managers speak to?</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="label" htmlFor="vj-person">Your name</label><input id="vj-person" className="input" value={f.contact_person} onChange={set('contact_person')} placeholder="Full name" autoFocus /></div>
              <div><label className="label" htmlFor="vj-email">Business email</label><input id="vj-email" className="input" type="email" value={f.email} onChange={set('email')} placeholder="hello@yourbusiness.in" autoComplete="email" /><p className="mt-1 text-[11px] text-ink-faint">You will sign in with this email.</p></div>
              <div><label className="label" htmlFor="vj-phone">Phone</label><input id="vj-phone" className="input" type="tel" value={f.phone} onChange={set('phone')} placeholder="+91 98xxx xxxxx" autoComplete="tel" /><p className="mt-1 text-[11px] text-ink-faint">For quick calls about a request.</p></div>
            </div>
          </div>}

          {step === 2 && <div className="mt-1 space-y-6">
            <div><h2 className="text-3xl text-ink">How much can you take on?</h2><p className="mt-1 text-sm text-ink-faint">This is how we send you only the requests you can say yes to. Leave anything blank if you are not sure — you can change it later.</p></div>
            <div>
              <span className="label">Cities you work in</span>
              <div className="flex flex-wrap gap-2">
                {[...new Set([...(city && city !== 'Other' ? [city] : []), ...CITIES])].map((c) => {
                  const on = servingIn.includes(c)
                  const base = c === city
                  return <button type="button" key={c} disabled={base} onClick={() => toggle('service_cities', c)} aria-pressed={on}
                                 className={`rounded-full border px-3.5 py-1.5 text-sm transition disabled:cursor-default ${on ? 'border-jade-600 bg-jade-600 text-white' : 'border-sand-300 bg-white text-ink-soft hover:border-jade-300'}`}>{on && '✓ '}{c}{base && ' · base'}</button>
                })}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <NumberField label="Largest guest count" hint="per event" value={f.max_guests} onChange={set('max_guests')} placeholder="e.g. 600" />
              <NumberField label="Team size" hint="people on the day" value={f.team_size} onChange={set('team_size')} placeholder="e.g. 25" />
              <NumberField label="Events in one day" hint="at the same time" value={f.max_events_per_day} onChange={set('max_events_per_day')} placeholder="e.g. 2" />
              <NumberField label="Notice needed" hint="days before the event" value={f.lead_time_days} onChange={set('lead_time_days')} placeholder="e.g. 21" min={0} />
            </div>
            <div>
              <span className="label">What you are known for</span>
              <div className="flex flex-wrap gap-2">
                {[...new Set([...suggestions, ...f.capabilities])].map((c) => {
                  const on = f.capabilities.includes(c)
                  return <button type="button" key={c} onClick={() => toggle('capabilities', c)} aria-pressed={on}
                                 className={`rounded-full border px-3.5 py-1.5 text-sm transition ${on ? 'border-gold-500 bg-gold-50 text-gold-800' : 'border-sand-300 bg-white text-ink-soft hover:border-gold-300'}`}>{on ? '✓ ' : '+ '}{c}</button>
                })}
              </div>
              <form className="mt-3 flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); const v = newCap.trim(); if (v && !f.capabilities.includes(v)) setF((x) => ({ ...x, capabilities: [...x.capabilities, v] })); setNewCap('') }}>
                <input className="input" value={newCap} onChange={(e) => setNewCap(e.target.value)} placeholder="Add your own, e.g. Destination weddings" />
                <button className="btn-ghost shrink-0" disabled={!newCap.trim()}>Add</button>
              </form>
            </div>
          </div>}

          {step === 3 && <div className="mt-1 grid gap-8 lg:grid-cols-2">
            <div className="space-y-4">
              <h2 className="text-3xl text-ink">Create your sign-in</h2>
              <p className="text-sm text-ink-faint">You will sign in as <span className="font-medium text-ink">{f.email.trim()}</span>.</p>
              <div className="relative">
                <label className="label" htmlFor="vj-pass">Password</label>
                <input id="vj-pass" className="input pr-16" type={show ? 'text' : 'password'} value={f.password} onChange={set('password')} placeholder="At least 8 characters" autoComplete="new-password" autoFocus />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute bottom-2 right-3 text-xs font-semibold text-jade-700 hover:text-jade-900">{show ? 'Hide' : 'Show'}</button>
              </div>
              <Strength value={f.password} />
              <div><label className="label" htmlFor="vj-confirm">Type it once more</label><input id="vj-confirm" className="input" type={show ? 'text' : 'password'} value={f.confirm} onChange={set('confirm')} autoComplete="new-password" />
                {f.confirm && f.confirm !== f.password && <p className="mt-1 text-xs text-rust-600">The two passwords are different.</p>}</div>
              <label className="flex items-start gap-3 rounded-xl bg-sand-100 p-3 text-sm text-ink-soft">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-jade-600" checked={f.agree} onChange={set('agree')} />
                <span>I confirm these details are correct and agree to quote honestly, keep my calendar up to date and arrive on time for every booked event.</span>
              </label>
              <p className="text-[11px] text-ink-faint">Passwords are never saved in the draft — you will type them again if you leave this page.</p>
            </div>
            <div className="rounded-2xl border border-sand-200 bg-sand-50 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-jade-700">Check your details</p>
              <Review label="Business" step={0} goTo={goTo} rows={[['Name', f.name], ['Category', category], ['Based in', city]]} />
              <Review label="Contact" step={1} goTo={goTo} rows={[['Name', f.contact_person], ['Email', f.email], ['Phone', f.phone]]} />
              <Review label="Capacity" step={2} goTo={goTo} rows={[
                ['Cities', servingIn.join(', ') || '—'],
                ['Guests', f.max_guests || '—'], ['Team', f.team_size || '—'],
                ['Per day', f.max_events_per_day || '—'], ['Notice', f.lead_time_days ? `${f.lead_time_days} days` : '—'],
                ['Known for', f.capabilities.join(', ') || '—'],
              ]} />
            </div>
          </div>}

          {err && <div className="mt-5"><ErrorBox error={err} />{emailTaken && <div className="mt-2 flex gap-3 text-sm"><button type="button" className="font-semibold text-jade-700 hover:underline" onClick={() => { setErr(null); goTo(1) }}>Use a different email</button><Link to="/?as=vendor" className="font-semibold text-jade-700 hover:underline">Sign in instead</Link></div>}</div>}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-sand-200 pt-5">
            {step > 0
              ? <button type="button" className="btn-ghost" onClick={() => goTo(step - 1)}>← Previous step</button>
              : <Link to="/?as=vendor" className="text-sm font-medium text-jade-700 hover:underline">Already registered? Sign in</Link>}
            <div className="flex items-center gap-3">
              {missing && <span className="text-xs text-ink-faint">Still needed: {missing}</span>}
              <button type="button" onClick={next} disabled={!!missing || busy}
                      className="btn bg-jade-700 px-6 py-2.5 text-white hover:bg-jade-800">
                {busy ? 'Creating your profile…' : step === STEPS.length - 1 ? 'Create my vendor profile' : `Next: ${STEPS[step + 1].id} →`}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function NumberField({ label, hint, min = 1, ...props }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type="number" inputMode="numeric" min={min} {...props} />
      <p className="mt-1 text-[11px] text-ink-faint">{hint}</p>
    </div>
  )
}

function Strength({ value }) {
  const score = [value.length >= 8, /[A-Z]/.test(value) && /[a-z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value) || value.length >= 12].filter(Boolean).length
  const words = ['Too short', 'Weak', 'Fair', 'Good', 'Strong']
  const colours = ['bg-sand-300', 'bg-rust-400', 'bg-gold-500', 'bg-jade-500', 'bg-jade-700']
  const s = value.length < 8 ? 0 : score
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-1">{[1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= s ? colours[s] : 'bg-sand-200'}`} />)}</div>
      <span className="w-16 text-right text-[11px] text-ink-faint">{value ? words[s] : ''}</span>
    </div>
  )
}

function Review({ label, step, goTo, rows }) {
  return (
    <div className="mt-4 border-t border-sand-200 pt-3 first:border-0">
      <div className="flex items-center justify-between"><p className="text-sm font-semibold text-ink">{label}</p><button type="button" onClick={() => goTo(step)} className="text-xs font-semibold text-jade-700 hover:underline">Edit</button></div>
      <dl className="mt-1.5 space-y-1 text-sm">
        {rows.map(([k, v]) => <div key={k} className="flex gap-3"><dt className="w-20 shrink-0 text-ink-faint">{k}</dt><dd className="min-w-0 break-words text-ink">{v || '—'}</dd></div>)}
      </dl>
    </div>
  )
}

function Preview({ f, category, city, servingIn }) {
  const initials = (f.name || 'Your business').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.08] p-4 backdrop-blur">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-jade-200">How managers will see you</p>
      <div className="mt-3 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-gold-300 to-jade-500 font-display text-lg font-bold text-jade-950">{initials}</span>
        <div className="min-w-0"><p className="truncate font-semibold text-white">{f.name || 'Your business'}</p><p className="truncate text-xs text-jade-100/75">{category || 'Category'} · {city || 'City'}</p></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {f.max_guests && <span className="rounded-full bg-white/10 px-2 py-0.5 text-jade-50">up to {f.max_guests} guests</span>}
        {f.team_size && <span className="rounded-full bg-white/10 px-2 py-0.5 text-jade-50">team of {f.team_size}</span>}
        {servingIn.length > 1 && <span className="rounded-full bg-white/10 px-2 py-0.5 text-jade-50">{servingIn.length} cities</span>}
        {f.capabilities.slice(0, 2).map((c) => <span key={c} className="rounded-full bg-gold-400/20 px-2 py-0.5 text-gold-100">{c}</span>)}
      </div>
    </div>
  )
}
