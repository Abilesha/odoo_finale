import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { ErrorBox } from '../components/ui'

const COPY = {
  client: { label: 'Couple sign-in', eyebrow: 'Your wedding, beautifully organised', email: 'Your email', hint: 'Use the email you gave us when you enquired.', placeholder: 'you@example.com' },
  vendor: { label: 'Vendor sign-in', eyebrow: 'For our trusted wedding partners', email: 'Business email', hint: 'Sign in to requests, jobs, calendar and earnings.', placeholder: 'hello@yourbusiness.in' },
  manager: { label: 'Manager sign-in', eyebrow: 'Royal Knot team access', email: 'Work email', hint: 'Open the weddings assigned to you.', placeholder: 'you@royalknot.in' },
  founder: { label: 'Founder sign-in', eyebrow: 'Royal Knot leadership access', email: 'Work email', hint: 'Open the season and agency workspace.', placeholder: 'you@royalknot.in' },
}
const BACKDROP = { client: '/auth/couple-blush.png', vendor: '/auth/vendor-jade.png', manager: '/auth/manager-night.png', founder: '/auth/founder-plum.png' }
const THEME = {
  client: { base: '#431a28', overlay: 'rgba(67, 26, 40, .78)', soft: '#fbeaed', accent: '#d97d91', dark: '#63283a' },
  vendor: { base: '#122c25', overlay: 'rgba(18, 44, 37, .80)', soft: '#ddefe7', accent: '#5ea68b', dark: '#1b4136' },
  manager: { base: '#141a30', overlay: 'rgba(20, 26, 48, .82)', soft: '#e6eaf5', accent: '#7884b3', dark: '#1e2543' },
  founder: { base: '#2d1828', overlay: 'rgba(45, 24, 40, .82)', soft: '#f3e9f0', accent: '#b47aa2', dark: '#44243c' },
}

function Field({ label, dark, ...props }) {
  const style = dark
    ? 'border-white/15 bg-black/20 text-sand-50 placeholder:text-sand-50/35'
    : 'border-jade-700 bg-jade-950 text-sand-50 placeholder:text-jade-500'
  return <div><label className={`mb-1.5 block text-xs font-medium ${dark ? 'text-sand-50/70' : 'text-jade-200'}`}>{label}</label><input {...props} className={`w-full rounded-lg border px-3 py-2.5 text-sm focus:border-gold-400 focus:outline-none ${style}`} /></div>
}

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  // the chosen portal lives in the address (?as=vendor) so a refresh, a shared
  // link or coming Back from vendor registration lands on the same tab
  const [params, setParams] = useSearchParams()
  const asked = params.get('as')
  const mode = COPY[asked] ? asked : 'client'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [teamAccess, setTeamAccess] = useState(mode === 'manager' || mode === 'founder')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const portal = mode
  const c = COPY[portal]
  const theme = THEME[portal]
  const changeMode = (next) => {
    setParams((p) => { const n = new URLSearchParams(p); if (next === 'client') n.delete('as'); else n.set('as', next); return n }, { replace: true })
    setErr(null); setShowPassword(false)
    if (next === 'manager' || next === 'founder') setTeamAccess(true)
  }
  const joinAsVendor = () => navigate('/vendors/join')

  async function submitLogin(e) {
    e.preventDefault(); setBusy(true); setErr(null)
    try { await signIn(email.trim(), password, portal) } catch (e2) { setErr(e2); setBusy(false) }
  }

  return <div id="top" className="bg-sand-100 text-sand-50">
    <div className="min-h-screen bg-cover bg-center transition-[background-image] duration-500" style={{ backgroundColor: theme.base, backgroundImage: `linear-gradient(90deg, ${theme.overlay}, ${theme.overlay}), url(${BACKDROP[portal]})` }}>
    <main className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:gap-20">
      <section>
        <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold-400 font-display text-2xl font-bold text-plum-900">R</span><div><h1 className="font-display text-3xl">The Royal Knot</h1><p className="text-xs uppercase tracking-[.24em] text-blush-300">Wedding planning system</p></div></div><nav className="hidden gap-4 text-xs text-sand-50/75 sm:flex"><a href="#about" className="hover:text-gold-300">About</a><a href="#services" className="hover:text-gold-300">Services</a><a href="#contact" className="hover:text-gold-300">Contact</a></nav></div>
        <h2 className="mt-10 max-w-xl font-display text-4xl leading-tight sm:text-5xl">Every detail of your celebration, thoughtfully held together.</h2>
        <p className="mt-5 max-w-lg text-base leading-relaxed text-sand-50/80">Plan with confidence, share updates effortlessly, and make the three days feel as beautiful as they should.</p>
        <div className="mt-10 flex flex-wrap gap-3">{portal === 'client' ? <Link to="/enquire" className="rounded-lg bg-gold-400 px-4 py-2.5 text-sm font-semibold text-plum-900 transition hover:bg-gold-300">Plan a wedding with us →</Link> : portal === 'vendor' ? <button type="button" onClick={joinAsVendor} className="rounded-lg bg-gold-400 px-4 py-2.5 text-sm font-semibold text-plum-900 transition hover:bg-gold-300">List your vendor business →</button> : <span className="rounded-lg border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-medium text-sand-50">Secure {c.label.toLowerCase()}</span>}</div>
      </section>
      <section className="w-full">
        <div className="mb-4" role="tablist" aria-label="Choose your portal">
          <div className="grid grid-cols-2 gap-3">
            <PortalChoice icon="♡" title="Couple" note="Follow your wedding" active={mode === 'client'} theme={THEME.client} onClick={() => changeMode('client')} />
            <PortalChoice icon="✦" title="Vendor" note="Grow your business" active={mode === 'vendor'} theme={THEME.vendor} onClick={() => changeMode('vendor')} />
          </div>
          <div className="mt-3 text-center">
            <button type="button" onClick={() => setTeamAccess((open) => !open)} className="text-xs font-medium text-sand-50/65 transition hover:text-gold-300">
              {teamAccess ? 'Hide agency team access' : 'Are you part of The Royal Knot team?'} <span className="ml-1">{teamAccess ? '↑' : '→'}</span>
            </button>
          </div>
          {teamAccess && <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/15 p-2 animate-rise">
            <TeamChoice icon="◷" label="Manager access" active={mode === 'manager'} theme={THEME.manager} onClick={() => changeMode('manager')} />
            <TeamChoice icon="◈" label="Founder access" active={mode === 'founder'} theme={THEME.founder} onClick={() => changeMode('founder')} />
          </div>}
        </div>
        <form onSubmit={submitLogin} className="rounded-2xl border border-white/15 bg-white/[.07] p-6 shadow-lift backdrop-blur-sm sm:p-8">
          <p className={`text-[11px] font-semibold uppercase tracking-[.2em] ${portal === 'vendor' ? 'text-jade-300' : portal === 'client' ? 'text-blush-300' : 'text-gold-300'}`}>{c.eyebrow}</p><h2 className="mt-1 font-display text-3xl">Welcome back</h2><p className="mt-2 text-sm text-sand-50/65">{c.hint}</p>
          <div className="mt-6 space-y-4"><Field label={c.email} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={c.placeholder} required dark /><div className="relative"><Field label="Password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required dark /><button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute bottom-2.5 right-3 text-xs font-medium text-sand-50/60 hover:text-white">{showPassword ? 'Hide' : 'Show'}</button></div></div>
          <ErrorBox error={err} /><button disabled={busy} className={`mt-5 w-full rounded-lg py-3 text-sm font-semibold transition disabled:opacity-50 ${portal === 'vendor' ? 'bg-jade-500 text-white hover:bg-jade-400' : 'bg-gold-400 text-plum-900 hover:bg-gold-300'}`}>{busy ? 'Signing in…' : c.label}</button>{portal === 'vendor' && <p className="mt-4 text-center text-xs text-jade-100/70">New here? <button type="button" onClick={joinAsVendor} className="font-semibold text-gold-300 hover:text-gold-200">Register your business</button></p>}
        </form>
      </section>
    </main></div>
    <section id="about" className="scroll-mt-4 bg-sand-50 py-20 text-ink sm:py-28"><div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[.85fr_1.15fr] lg:items-center"><div><p className="text-xs font-semibold uppercase tracking-[.24em] text-gold-600">About The Royal Knot</p><h2 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">A calm, considered way to celebrate.</h2></div><div className="space-y-5 text-base leading-relaxed text-ink-soft"><p>We bring planning, design and trusted people together so every family can be fully present for the moments that matter.</p><p>From the first conversation to the final farewell, your dedicated team holds the details with care, clarity and an eye for beauty.</p><div className="grid grid-cols-3 gap-3 border-t border-sand-200 pt-6 text-center"><Stat value="3 days" label="of celebration"/><Stat value="1 team" label="by your side"/><Stat value="∞ care" label="in every detail"/></div></div></div></section>
    <section id="services" className="scroll-mt-4 py-20 text-sand-50 sm:py-28" style={{ backgroundColor: theme.base }}><div className="mx-auto max-w-6xl px-5 sm:px-8"><div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[.24em] text-gold-300">Our services</p><h2 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">Every celebration, expertly orchestrated.</h2><p className="mt-5 text-base leading-relaxed text-sand-50/75">The planning muscle behind a seamless, personal and beautifully produced wedding.</p></div><div className="mt-12 grid gap-4 md:grid-cols-3"><Service number="01" title="Full wedding planning" text="A dedicated planner, timeline, vendor sourcing, budget oversight and three-day execution."/><Service number="02" title="Celebration design" text="A distinctive visual story, meaningful guest moments and a production plan for every ritual."/><Service number="03" title="Day-of coordination" text="A calm, precise team making the final days flow effortlessly for you and your family."/></div></div></section>
    <section id="partners" className="scroll-mt-4 py-20 text-sand-50 sm:py-28" style={{ backgroundColor: theme.dark }}><div className="mx-auto grid max-w-6xl gap-10 px-5 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:items-center"><div><p className="text-xs font-semibold uppercase tracking-[.24em] text-gold-300">Vendor partners</p><h2 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">Great celebrations are a team effort.</h2><p className="mt-5 max-w-xl text-base leading-relaxed text-sand-50/80">Caterers, decorators, artists and production partners can create a business profile, receive relevant requests and manage every commitment from one clear workspace.</p><button type="button" onClick={joinAsVendor} className="mt-7 rounded-lg bg-gold-400 px-5 py-3 text-sm font-semibold text-plum-900 hover:bg-gold-300">List your vendor business →</button></div><div className="rounded-2xl border border-white/20 bg-white/10 p-7"><p className="text-sm font-semibold text-gold-300">Built for professional partners</p><ul className="mt-5 space-y-4 text-sm text-sand-50/90"><li>✓ A polished business profile</li><li>✓ Requests that fit your capacity and city</li><li>✓ One place for quotes, jobs and earnings</li><li>✓ A clear view of each event commitment</li></ul></div></div></section>
    <section id="contact" className="scroll-mt-4 bg-sand-50 py-20 text-ink sm:py-28"><div className="mx-auto max-w-6xl px-5 sm:px-8"><div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[.24em] text-gold-600">Contact us</p><h2 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">Let’s begin your celebration.</h2><p className="mt-5 text-base leading-relaxed text-ink-soft">Share the wedding you are imagining. We will help you find the most thoughtful next step.</p></div><div className="mt-10 grid gap-4 sm:grid-cols-3"><Contact label="Email" value="hello@royalknot.in" href="mailto:hello@royalknot.in"/><Contact label="Phone" value="+91 90000 00000" href="tel:+919000000000"/><Contact label="Studio" value="Jaipur · Udaipur"/></div><div className="mt-10 flex flex-wrap gap-3"><Link to="/enquire" className="btn-gold">Start planning with us →</Link><a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="btn-ghost">Back to sign in</a></div></div></section>
  </div>
}

function Stat({ value, label }) { return <div><p className="font-display text-2xl text-plum-700">{value}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-ink-faint">{label}</p></div> }
function Service({ number, title, text }) { return <article className="rounded-2xl border border-white/10 bg-white/[.06] p-6"><p className="text-xs font-semibold tracking-widest text-gold-300">{number}</p><h3 className="mt-6 font-display text-2xl">{title}</h3><p className="mt-3 text-sm leading-relaxed text-sand-50/70">{text}</p></article> }
function Contact({ label, value, href }) { return <div className="rounded-xl border border-sand-200 bg-white p-5 shadow-card"><p className="text-xs font-semibold uppercase tracking-wider text-gold-600">{label}</p>{href ? <a href={href} className="mt-2 block text-lg font-medium text-ink hover:text-plum-700">{value}</a> : <p className="mt-2 text-lg font-medium text-ink">{value}</p>}</div> }
function PortalChoice({ icon, title, note, active, theme, onClick }) { return <button type="button" role="tab" aria-selected={active} onClick={onClick} className="group rounded-2xl border p-4 text-left transition-all" style={active ? { borderColor: '#d9ae4d', background: `linear-gradient(135deg, ${theme.accent}, ${theme.dark})`, boxShadow: '0 10px 26px rgba(0,0,0,.24)' } : { borderColor: 'rgba(255,255,255,.17)', background: 'rgba(255,255,255,.07)' }}><span className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-xl text-gold-300">{icon}</span><span><span className="block text-base font-semibold text-white">{title}</span><span className="mt-0.5 block text-xs text-white/70">{note}</span></span></span></button> }
function TeamChoice({ icon, label, active, theme, onClick }) { return <button type="button" onClick={onClick} className="rounded-lg px-3 py-2.5 text-xs font-semibold transition" style={active ? { backgroundColor: theme.accent, color: '#1d1a24' } : { background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.76)' }}><span className="mr-1.5">{icon}</span>{label}</button> }
