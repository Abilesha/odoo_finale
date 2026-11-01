import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { api, inr } from '../api'
import { useAuth } from '../auth'
import { CoupleScene } from '../components/CoupleJourney'
import { BackButton } from '../components/kit'
import { ErrorBox } from '../components/ui'
import { useDraft, useWizardStep } from '../wizard'

const EVENTS = [
  { id: 'Roka', blurb: 'The families meet' },
  { id: 'Haldi', blurb: 'Turmeric morning' },
  { id: 'Mehendi', blurb: 'Henna afternoon' },
  { id: 'Sangeet', blurb: 'Music and dance' },
  { id: 'Wedding', blurb: 'Pheras and vows' },
  { id: 'Reception', blurb: 'The grand dinner' },
]

const THEMES = [
  { id: 'Royal Rajputana heritage', swatch: ['#7a1f2b', '#d9ae4d', '#f4e3c1'] },
  { id: 'Pastel garden romance', swatch: ['#f3c6d3', '#c9dcc0', '#fbf5ec'] },
  { id: 'Mughal courtyard', swatch: ['#1f4e5f', '#c6922c', '#efe2cf'] },
  { id: 'Modern minimal ivory', swatch: ['#f6f1e7', '#cbbfa8', '#3b3631'] },
  { id: 'Marigold traditional', swatch: ['#e8870e', '#c2185b', '#fff1d6'] },
  { id: 'Desert sunset', swatch: ['#b5542d', '#e7a35b', '#f4dcc2'] },
]

const SERVICES = [
  'Venue', 'Catering', 'Décor', 'Photography & film', 'Music & DJ', 'Makeup & styling',
  'Mehendi artist', 'Guest hospitality', 'Transport', 'Invitations',
]

const STEPS = ['About you', 'The wedding', 'The feel', 'Budget & services', 'Your account']

const fmtBudget = (n) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(n % 1e7 ? 1 : 0)} crore` : `₹${(n / 1e5).toFixed(0)} lakh`)

/** The online enquiry.
 *
 *  Five short steps rather than one long form: a couple planning a wedding
 *  will answer five easy questions where they abandon one intimidating page.
 *  The last step is their login, so the moment they submit they are inside
 *  their own portal watching the enquiry move — and the enquiry is in the
 *  agency's pipeline with an owner, which is the brief's first scene.
 */
export default function Enquire() {
  const navigate = useNavigate()
  const { adopt } = useAuth()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  // answers are kept on this device (never the password) so Back, a refresh
  // or a closed tab never throws the enquiry away
  const [f, setF, draft] = useDraft('rk.enquiry.v1', {
    partner_a: '', partner_b: '', your_name: '', email: '', phone: '',
    rough_date: '', preferred_city: 'Jaipur', guest_count: 350, package_interest: 'Full-Service Wedding',
    theme: '', events: ['Mehendi', 'Sangeet', 'Wedding', 'Reception'],
    max_budget: 4000000, services: ['Venue', 'Catering', 'Décor', 'Photography & film'],
    source: 'Website', notes: '', password: '', confirm: '',
  }, ['password', 'confirm'])
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const toggle = (k, v) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }))

  const minDate = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10)
  }, [])

  // what blocks "Next" on each step, in plain words
  const missingAt = (i) => [
    () => (!f.partner_a.trim() || !f.partner_b.trim() ? 'Both your names'
      : !f.your_name.trim() ? 'Who we should ask for'
      : !/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(f.email.trim()) ? 'A valid email'
      : f.phone.replace(/\D/g, '').length < 10 ? 'A phone number we can call' : null),
    () => (!f.rough_date ? 'Roughly when' : !f.preferred_city.trim() ? 'Which city' : null),
    () => (!f.events.length ? 'At least one ceremony' : null),
    () => null,
    () => (f.password.length < 8 ? 'A password of 8 or more characters'
      : f.password !== f.confirm ? 'The two passwords to match' : null),
  ][i]()
  const firstOpen = [0, 1, 2, 3].find((i) => missingAt(i))
  // the step lives in the address bar, so the browser's Back goes back a step
  const { step, goTo } = useWizardStep(STEPS.length, firstOpen ?? STEPS.length - 1)
  const missing = missingAt(step)

  async function submit() {
    setBusy(true); setErr(null)
    try {
      const { confirm, ...body } = f
      const res = await api.post('/api/enquire', {
        ...body,
        email: f.email.trim(),
        guest_count: Number(f.guest_count),
        max_budget: Number(f.max_budget),
        theme: f.theme || null,
        notes: f.notes || null,
      })
      draft.clear()
      adopt(res.token, res.user)
      navigate('/?welcome=1', { replace: true })
    } catch (e) { setErr(e); setBusy(false) }
  }

  const next = () => (step < STEPS.length - 1 ? goTo(step + 1) : submit())

  return (
    <div className="min-h-screen bg-blush-950 bg-cover bg-fixed bg-center text-sand-50" style={{ backgroundImage: "linear-gradient(rgba(48, 17, 33, .83), rgba(48, 17, 33, .91)), url('/auth/couple-blush.png')" }}>
      <header className="border-b border-white/10 bg-blush-950/40 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-400 font-display text-lg font-bold text-blush-900 shadow-lg shadow-gold-500/20">R</span>
            <span><span className="block font-display text-lg leading-none text-white">The Royal Knot</span><span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.22em] text-blush-200">Wedding planning</span></span>
          </Link>
          <div className="flex items-center gap-4">
            {step > 0
              ? <button type="button" onClick={() => goTo(step - 1)} className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"><span aria-hidden>←</span>Previous step</button>
              : <BackButton fallback="/" tone="dark" label="Back to sign in" />}
            <Link to="/" className="hidden text-xs text-blush-100 hover:text-white hover:underline sm:block">Already enquired? Sign in →</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:py-12">
        <section className="grid items-center gap-8 pb-8 lg:grid-cols-[1fr_21rem] lg:pb-10">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-300">Plan your wedding with us</p>
            <h1 className="mt-3 max-w-2xl font-display text-4xl leading-[1.04] text-white sm:text-6xl">Let’s begin your most beautiful chapter.</h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-blush-100 sm:text-lg">
              A thoughtful five-step start to your Royal Knot celebration. Tell us the essentials and a dedicated planner will call within a day.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-xs text-blush-100">
              {['A personal planning portal', 'Three-day celebration expertise', 'A manager assigned to you'].map((item) => <span key={item} className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 backdrop-blur">✦ {item}</span>)}
            </div>
          </div>
          <CoupleScene />
        </section>

        {/* ---- progress ---- */}
        <div className="rounded-2xl border border-white/15 bg-white/[0.09] p-4 shadow-2xl backdrop-blur-md sm:p-5">
        <div className="mb-3 flex items-center justify-between text-xs"><span className="font-semibold text-white">Your planning story</span><span className="text-blush-100">Step {step + 1} of 5</span></div>
        <ol className="grid grid-cols-5 gap-2" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" disabled={i > (firstOpen ?? STEPS.length - 1) || i === step} onClick={() => goTo(i)}
                      className="group w-full text-left disabled:cursor-default">
                <span className={`block h-1.5 rounded-full transition-colors ${
                  i < step ? 'bg-gold-300' : i === step ? 'bg-gold-400' : 'bg-white/20'}`} />
                <span className={`mt-2 hidden text-xs sm:block ${
                  i === step ? 'font-semibold text-white' : i < step ? 'text-gold-200' : 'text-blush-200'}`}>
                  {i + 1}. {s}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-blush-100 sm:hidden">Step {step + 1} of 5 · {STEPS[step]}</p>
        </div>

        <section key={step} className="mt-6 animate-rise rounded-2xl border border-white/70 bg-white/95 p-6 text-ink shadow-2xl shadow-blush-950/30 backdrop-blur sm:p-8">
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="text-2xl text-ink">Who is getting married?</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="label">One of you</label><input className="input" value={f.partner_a} onChange={set('partner_a')} placeholder="Arjun" /></div>
                <div><label className="label">And the other</label><input className="input" value={f.partner_b} onChange={set('partner_b')} placeholder="Meera" /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div><label className="label">Who should we ask for?</label><input className="input" value={f.your_name} onChange={set('your_name')} placeholder="Meera Sharma" /></div>
                <div><label className="label">Email</label><input className="input" type="email" value={f.email} onChange={set('email')} placeholder="meera@gmail.com" /></div>
                <div><label className="label">Phone</label><input className="input" value={f.phone} onChange={set('phone')} placeholder="+91 98…" /></div>
              </div>
              <p className="text-xs text-ink-faint">Your email is also how you will sign in to follow your wedding.</p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-2xl text-ink">When and where?</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="label">First day, roughly</label>
                  <input className="input" type="date" min={minDate} value={f.rough_date} onChange={set('rough_date')} />
                  <p className="mt-1 text-[11px] text-ink-faint">Our weddings run over three days</p>
                </div>
                <div>
                  <label className="label">City</label>
                  <select className="input" value={f.preferred_city} onChange={set('preferred_city')}>
                    {['Jaipur', 'Udaipur', 'Jodhpur', 'Goa', 'Mumbai', 'Delhi NCR', 'Somewhere else'].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Package</label>
                  <select className="input" value={f.package_interest} onChange={set('package_interest')}>
                    <option value="Full-Service Wedding">Full service — we plan it all</option>
                    <option value="Partial / Day-of">Day-of — you plan, we run it</option>
                  </select>
                </div>
              </div>
              <div>
                <div className="flex items-end justify-between">
                  <label className="label">How many guests?</label>
                  <span className="tnum font-display text-3xl font-semibold text-blush-700">{f.guest_count}</span>
                </div>
                <input type="range" min={50} max={1200} step={10} value={f.guest_count} onChange={set('guest_count')}
                       className="w-full accent-blush-600" />
                <div className="flex justify-between text-[11px] text-ink-faint"><span>50 · intimate</span><span>1,200 · grand</span></div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-2xl text-ink">How should it feel?</h2>
              <div>
                <label className="label">Pick a mood — or skip it, we will find it together</label>
                <div className="grid gap-3 sm:grid-cols-3">
                  {THEMES.map((t) => {
                    const on = f.theme === t.id
                    return (
                      <button type="button" key={t.id} onClick={() => setF((x) => ({ ...x, theme: on ? '' : t.id }))}
                              className={`overflow-hidden rounded-xl border-2 text-left transition-all ${
                                on ? 'border-blush-500 shadow-lift' : 'border-sand-200 hover:border-blush-300'}`}>
                        <span className="flex h-14">
                          {t.swatch.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}
                        </span>
                        <span className="flex items-center justify-between px-3 py-2.5 text-sm text-ink">
                          {t.id}{on && <span className="text-blush-600">✓</span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="label">Which ceremonies?</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {EVENTS.map((e) => {
                    const on = f.events.includes(e.id)
                    return (
                      <button type="button" key={e.id} onClick={() => toggle('events', e.id)}
                              className={`rounded-xl border-2 px-4 py-3 text-left transition-all ${
                                on ? 'border-blush-500 bg-blush-50' : 'border-sand-200 bg-white hover:border-blush-300'}`}>
                        <span className="flex items-center justify-between text-sm font-semibold text-ink">
                          {e.id}<span className={`flex h-5 w-5 items-center justify-center rounded-md border-2 text-[11px] ${
                            on ? 'border-blush-600 bg-blush-600 text-white' : 'border-sand-300'}`}>{on && '✓'}</span>
                        </span>
                        <span className="text-xs text-ink-faint">{e.blurb}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-2xl text-ink">Budget, and what you need from us</h2>
              <div>
                <div className="flex items-end justify-between">
                  <label className="label">All-in budget, roughly</label>
                  <span className="tnum font-display text-3xl font-semibold text-blush-700">{fmtBudget(Number(f.max_budget))}</span>
                </div>
                <input type="range" min={1000000} max={60000000} step={500000} value={f.max_budget}
                       onChange={set('max_budget')} className="w-full accent-blush-600" />
                <div className="flex justify-between text-[11px] text-ink-faint"><span>₹10 lakh</span><span>₹6 crore</span></div>
                <p className="mt-2 text-xs text-ink-faint">
                  About {inr(Number(f.max_budget) / Math.max(Number(f.guest_count), 1))} per guest across the three days.
                </p>
              </div>
              <div>
                <label className="label">What would you like us to arrange?</label>
                <div className="flex flex-wrap gap-2">
                  {SERVICES.map((s) => {
                    const on = f.services.includes(s)
                    return (
                      <button type="button" key={s} onClick={() => toggle('services', s)}
                              className={`rounded-full border px-3.5 py-1.5 text-sm transition-all ${
                                on ? 'border-blush-600 bg-blush-600 text-white' : 'border-sand-300 bg-white text-ink-soft hover:border-blush-300'}`}>
                        {on && '✓ '}{s}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
                <div>
                  <label className="label">How did you hear of us?</label>
                  <select className="input" value={f.source} onChange={set('source')}>
                    {['Website', 'Instagram', 'Referral', 'WhatsApp', 'Phone Call'].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Anything we should know?</label>
                  <input className="input" value={f.notes} onChange={set('notes')} placeholder="Grandparents travelling from abroad, a Jain menu, a surprise for the Sangeet…" />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-4">
                <h2 className="text-2xl text-ink">Create your account</h2>
                <p className="text-sm text-ink-faint">
                  You sign in with <span className="font-medium text-ink">{f.email}</span> to follow
                  your wedding, sign your agreement and talk to your planner.
                </p>
                <div><label className="label">Password</label><input className="input" type="password" value={f.password} onChange={set('password')} placeholder="At least 8 characters" /></div>
                <div><label className="label">Once more</label><input className="input" type="password" value={f.confirm} onChange={set('confirm')} /></div>
              </div>
              <div className="rounded-2xl bg-blush-50 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-blush-700">Your enquiry</p>
                <p className="mt-2 font-display text-2xl text-ink">{f.partner_a} & {f.partner_b}</p>
                <dl className="mt-3 space-y-1.5 text-sm">
                  {[
                    ['When', f.rough_date ? new Date(f.rough_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'],
                    ['Where', f.preferred_city],
                    ['Guests', f.guest_count],
                    ['Package', f.package_interest],
                    ['Mood', f.theme || 'To find together'],
                    ['Ceremonies', f.events.join(', ')],
                    ['Budget', fmtBudget(Number(f.max_budget))],
                    ['Services', f.services.join(', ') || '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-3">
                      <dt className="w-24 shrink-0 text-ink-faint">{k}</dt><dd className="text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}

          {err && <div className="mt-5"><ErrorBox error={err} /></div>}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-sand-200 pt-5">
            {step > 0
              ? <button type="button" className="btn-ghost" onClick={() => goTo(step - 1)}>← Previous step</button>
              : <Link to="/" className="text-sm font-medium text-blush-700 hover:underline">Already enquired? Sign in</Link>}
            <div className="flex items-center gap-3">
              {missing && <span className="text-xs text-ink-faint">Still needed: {missing}</span>}
              <button type="button" onClick={next} disabled={!!missing || busy}
                      className="btn bg-blush-700 px-6 py-2.5 text-white hover:bg-blush-800">
                {busy ? 'Sending…' : step === STEPS.length - 1 ? 'Send my enquiry' : 'Next →'}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
