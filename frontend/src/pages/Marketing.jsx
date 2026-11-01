import { Link, useLocation } from 'react-router-dom'

const SECTIONS = {
  '/about': {
    eyebrow: 'About The Royal Knot', title: 'Weddings with grace, clarity and heart.',
    body: 'The Royal Knot brings together design, logistics and warm human care so every family can be fully present for the moments that matter.',
  },
  '/services': {
    eyebrow: 'Our services', title: 'Every celebration, expertly orchestrated.',
    body: 'From the first guest-list conversation to the final farewell, our planners keep the details moving beautifully behind the scenes.',
  },
  '/vendors': {
    eyebrow: 'Vendor partners', title: 'A better way to work together.',
    body: 'Wedding professionals can build a trusted profile, receive relevant requests and manage their event commitments in one place.',
  },
  '/contact': {
    eyebrow: 'Contact us', title: 'Let’s begin your celebration.',
    body: 'Tell us about the wedding you are imagining. A Royal Knot planner will guide the next thoughtful step.',
  },
}

export default function Marketing() {
  const { pathname } = useLocation()
  const s = SECTIONS[pathname] || SECTIONS['/about']
  return <div className="min-h-screen bg-plum-950 bg-cover bg-center text-sand-50" style={{ backgroundImage: "linear-gradient(90deg, rgba(39, 10, 33, .91), rgba(39, 10, 33, .66)), url('/auth/couple-blush.png')" }}>
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8"><Link to="/" className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-400 font-display text-xl font-bold text-plum-900">R</span><span className="font-display text-2xl">The Royal Knot</span></Link><nav className="flex gap-4 text-sm text-sand-50/80"><Link to="/about">About</Link><Link to="/services">Services</Link><Link to="/contact">Contact</Link></nav></header>
    <main className="mx-auto max-w-6xl px-5 pb-16 pt-16 sm:px-8"><p className="text-xs font-semibold uppercase tracking-[.25em] text-gold-300">{s.eyebrow}</p><h1 className="mt-4 max-w-3xl font-display text-5xl leading-tight sm:text-6xl">{s.title}</h1><p className="mt-6 max-w-2xl text-lg leading-relaxed text-sand-50/75">{s.body}</p>
      {pathname === '/services' && <div className="mt-14 grid gap-4 md:grid-cols-3">{[['Full wedding planning','A dedicated planner, design direction, vendor sourcing and three-day execution.'],['Celebration design','A distinct visual story, guest experience and production plan for every ritual.'],['Day-of coordination','A calm, precise team that makes the final days flow effortlessly.']].map(([title, desc]) => <article key={title} className="rounded-2xl border border-white/15 bg-white/10 p-6"><h2 className="font-display text-2xl">{title}</h2><p className="mt-3 text-sm leading-relaxed text-sand-50/70">{desc}</p></article>)}</div>}
      {pathname === '/contact' && <div className="mt-12 grid max-w-3xl gap-4 sm:grid-cols-3"><Contact label="Email" value="hello@royalknot.in" href="mailto:hello@royalknot.in" /><Contact label="Phone" value="+91 90000 00000" href="tel:+919000000000" /><Contact label="Studio" value="Jaipur · Udaipur" /></div>}
      {pathname === '/vendors' && <Link to="/" className="btn-gold mt-10">List your business →</Link>}
      {pathname !== '/vendors' && <Link to="/enquire" className="btn-gold mt-10">Start planning with us →</Link>}
    </main>
  </div>
}

function Contact({ label, value, href }) { return <div className="rounded-xl border border-white/15 bg-white/10 p-5"><p className="text-xs uppercase tracking-wider text-gold-300">{label}</p>{href ? <a href={href} className="mt-2 block text-lg hover:text-gold-300">{value}</a> : <p className="mt-2 text-lg">{value}</p>}</div> }
