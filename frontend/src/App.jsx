import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { CAP, useAuth } from './auth'
import { BackButton, initials } from './components/kit'
import { Spinner } from './components/ui'
import Assistant from './pages/Assistant'
import ChooseVendor from './pages/ChooseVendor'
import Checklist from './pages/Checklist'
import Dashboard from './pages/Dashboard'
import Enquire from './pages/Enquire'
import Queries from './pages/Queries'
import ClientAgreement from './pages/client/ClientAgreement'
import ClientChecklist from './pages/client/ClientChecklist'
import ClientHelp from './pages/client/ClientHelp'
import ClientInvitations from './pages/client/ClientInvitations'
import ClientHome from './pages/client/ClientHome'
import ClientPayments from './pages/client/ClientPayments'
import ClientSchedule from './pages/client/ClientSchedule'
import ClientTimeline from './pages/client/ClientTimeline'
import ClientVendors from './pages/client/ClientVendors'
import Leads from './pages/Leads'
import Login from './pages/Login'
import ManagerDetail from './pages/ManagerDetail'
import ManagerHome from './pages/ManagerHome'
import Managers from './pages/Managers'
import Payments from './pages/Payments'
import MyProfile from './pages/MyProfile'
import QuoteCompare from './pages/QuoteCompare'
import SharedReport from './pages/SharedReport'
import Sign from './pages/Sign'
import VendorJoin from './pages/VendorJoin'
import Team from './pages/Team'
import VendorScorecard from './pages/VendorScorecard'
import WeddingDetail from './pages/WeddingDetail'
import Weddings from './pages/Weddings'
import VendorCalendar from './pages/vendor/VendorCalendar'
import VendorEarnings from './pages/vendor/VendorEarnings'
import VendorHome from './pages/vendor/VendorHome'
import VendorJobs from './pages/vendor/VendorJobs'
import VendorProfile from './pages/vendor/VendorProfile'
import VendorRequest from './pages/vendor/VendorRequest'
import VendorRequests from './pages/vendor/VendorRequests'

/** Each of the four people who sign in gets their own control panel —
 *  their own navigation, their own home screen and their own colour, so it
 *  is obvious at a glance whose screen you are looking at. */
const PORTALS = {
  founder: {
    label: 'Founder console',
    rail: 'bg-plum-900 border-plum-800',
    divider: 'border-plum-800',
    active: 'bg-plum-700 text-sand-50',
    idle: 'text-plum-200 hover:bg-plum-800 hover:text-sand-50',
    sub: 'text-plum-300',
    menu: 'hover:bg-plum-700',
    menuOpen: 'bg-plum-700',
    mark: 'bg-gold-400 text-plum-900',
    nav: [
      { to: '/',         label: 'Season',    icon: '◈', end: true },
      { to: '/managers', label: 'Managers',  icon: '◉' },
      { to: '/leads',    label: 'Enquiries', icon: '✎' },
      { to: '/weddings', label: 'Weddings',  icon: '❖' },
      { to: '/queries',  label: 'Client queries', icon: '✉' },
      { to: '/vendors',  label: 'Vendors',   icon: '◎' },
      { to: '/team',     label: 'Team',      icon: '⚇' },
      { to: '/assistant', label: 'Assistant', icon: '✦' },
    ],
  },
  manager: {
    label: 'Manager workspace',
    rail: 'bg-night-900 border-night-800',
    divider: 'border-night-800',
    active: 'bg-night-700 text-sand-50',
    idle: 'text-night-200 hover:bg-night-800 hover:text-sand-50',
    sub: 'text-night-300',
    menu: 'hover:bg-night-700',
    menuOpen: 'bg-night-700',
    mark: 'bg-gold-400 text-night-900',
    nav: [
      { to: '/',          label: 'My day',    icon: '◷', end: true },
      { to: '/checklist', label: 'Checklist', icon: '☑' },
      { to: '/weddings',  label: 'Weddings',  icon: '❖' },
      { to: '/payments',  label: 'Payments',  icon: '₹' },
      { to: '/queries',   label: 'Client queries', icon: '✉' },
      { to: '/leads',     label: 'Enquiries', icon: '✎' },
      { to: '/assistant', label: 'Assistant', icon: '✦' },
    ],
  },
  vendor: {
    label: 'Vendor portal',
    rail: 'bg-jade-900 border-jade-800',
    divider: 'border-jade-800',
    active: 'bg-jade-700 text-sand-50',
    idle: 'text-jade-200 hover:bg-jade-800 hover:text-sand-50',
    sub: 'text-jade-300',
    menu: 'hover:bg-jade-700',
    menuOpen: 'bg-jade-700',
    mark: 'bg-gold-400 text-jade-900',
    nav: [
      { to: '/',         label: 'Overview',  icon: '◈', end: true },
      { to: '/requests', label: 'Requests',  icon: '✉' },
      { to: '/jobs',     label: 'My jobs',   icon: '❖' },
      { to: '/calendar', label: 'Calendar',  icon: '▦' },
      { to: '/earnings', label: 'Earnings',  icon: '₹' },
      { to: '/capacity', label: 'Capacity',  icon: '⚙' },
    ],
  },
  client: {
    label: 'Our wedding',
    rail: 'bg-blush-900 border-blush-800',
    divider: 'border-blush-800',
    active: 'bg-blush-700 text-sand-50',
    idle: 'text-blush-200 hover:bg-blush-800 hover:text-sand-50',
    sub: 'text-blush-300',
    menu: 'hover:bg-blush-700',
    menuOpen: 'bg-blush-700',
    mark: 'bg-gold-400 text-blush-900',
    nav: [
      { to: '/',          label: 'Overview',     icon: '♡', end: true },
      { to: '/timeline',  label: 'Timeline',     icon: '◷' },
      { to: '/checklist', label: 'Checklist',    icon: '☑' },
      { to: '/payments',  label: 'Payments',     icon: '₹' },
      { to: '/vendors',   label: 'Vendors',      icon: '◎' },
      { to: '/schedule',  label: 'Day schedule', icon: '▤' },
      { to: '/invitations', label: 'Invitations', icon: '❦' },
      { to: '/agreement', label: 'Agreement',    icon: '✎' },
      { to: '/help',      label: 'Questions & complaints', icon: '✉' },
    ],
  },
}

/** Avatar + name + sign out.
 *
 *  Rendered twice — inline in the mobile top bar and pinned to the foot of
 *  the desktop sidebar — because a sign-out that is only present in one
 *  layout is a sign-out people cannot find.
 */
function UserMenu({ variant = 'bar', theme }) {
  const { user, signOut, portal } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  if (!user) return null
  const up = variant === 'rail'

  const role = portal === 'client' ? 'Couple' : portal === 'vendor' ? (user.contact_person ? `${user.name}` : user.category) : (user.title || user.role)
  const shown = portal === 'vendor' ? (user.contact_person || user.name) : user.name

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu" aria-expanded={open}
        className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${theme.menu} ${
          open ? theme.menuOpen : ''
        }`}
      >
        {user.avatar
          ? <img src={user.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-white/30" />
          : <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${theme.mark}`}>{initials(shown)}</span>}
        <span className="hidden min-w-0 flex-1 leading-tight sm:block">
          <span className="block truncate text-sm font-semibold text-sand-50">{shown}</span>
          <span className={`block truncate text-[11px] ${theme.sub}`}>{role}</span>
        </span>
        <span className={`hidden text-[10px] sm:block ${theme.sub}`}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div role="menu"
          className={`absolute right-0 z-50 w-60 overflow-hidden rounded-xl border border-sand-200 bg-white shadow-lift ${
            up ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          <div className="flex items-center gap-3 border-b border-sand-200 px-4 py-3">
            {user.avatar
              ? <img src={user.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
              : <span className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold ${theme.mark}`}>{initials(shown)}</span>}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{shown}</p>
              <p className="truncate text-xs text-ink-faint">{user.email}</p>
            </div>
          </div>
          <Link to="/profile" role="menuitem" onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink transition-colors hover:bg-sand-100">
            <span className="w-4 text-center text-xs text-ink-faint">◉</span> My profile
          </Link>
          <button role="menuitem"
            onClick={() => { setOpen(false); signOut() }}
            className="flex w-full items-center gap-2.5 border-t border-sand-200 px-4 py-2.5 text-left text-sm font-medium text-rust-700 transition-colors hover:bg-rust-100"
          >
            <span className="w-4 text-center text-xs">⤶</span> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function Shell({ portal, children }) {
  const { pathname } = useLocation()
  const theme = PORTALS[portal]

  return (
    <div className="min-h-screen lg:flex">
      <aside className={`sticky top-0 z-40 shrink-0 border-b lg:static lg:flex lg:h-screen lg:w-64 lg:flex-col lg:border-b-0 lg:border-r ${theme.rail}`}>
        {/* brand row — carries the user menu on narrow screens */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:py-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-display text-lg font-bold ${theme.mark}`}>
              R
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate font-display text-base font-semibold text-sand-50">
                The Royal Knot
              </p>
              <p className={`text-[10px] uppercase tracking-widest ${theme.sub}`}>
                {theme.label}
              </p>
            </div>
          </div>
          <div className="w-auto lg:hidden">
            <UserMenu variant="bar" theme={theme} />
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-y-auto">
          {theme.nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isActive ? theme.active : theme.idle
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 hidden h-5 w-[3px] -translate-y-1/2 rounded-r bg-gold-400 lg:block" />
                  )}
                  <span className="w-4 text-center text-xs opacity-70">{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* pinned to the foot of the rail on desktop */}
        <div className={`hidden border-t p-2 lg:block ${theme.divider}`}>
          <UserMenu variant="rail" theme={theme} />
        </div>
      </aside>

      <main key={pathname} className="min-w-0 flex-1 lg:h-screen lg:overflow-y-auto">
        <div className="mx-auto max-w-[1500px] animate-rise p-4 sm:p-6 lg:p-8">
          {portal === 'client' && pathname !== '/' && (
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <BackButton fallback="/" label="Back" />
              <nav aria-label="You are here" className="flex items-center gap-2 text-xs text-ink-faint">
                <Link to="/" className="font-medium text-blush-700 hover:underline">Overview</Link>
                <span aria-hidden>›</span>
                <span className="font-medium text-ink">{theme.nav.find((n) => n.to !== '/' && pathname.startsWith(n.to))?.label || (pathname.startsWith('/profile') ? 'My profile' : 'This page')}</span>
              </nav>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  )
}

/** Keeps a role out of a page its account cannot load, with an explanation
 *  rather than a wall of failed requests. */
function Guarded({ cap, children }) {
  const { can, user } = useAuth()
  if (can(cap)) return children
  return (
    <div className="card mx-auto max-w-lg p-10 text-center">
      <p className="text-2xl">⊘</p>
      <h1 className="mt-3 font-display text-2xl text-ink">Not available to your role</h1>
      <p className="mt-2 text-sm text-ink-faint">
        A {user?.role} does not have access to this part of the system.
        Ask the founder if you need it.
      </p>
    </div>
  )
}

function FounderRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/managers" element={<Guarded cap={CAP.TEAM}><Managers /></Guarded>} />
      <Route path="/managers/:id" element={<Guarded cap={CAP.TEAM}><ManagerDetail /></Guarded>} />
      <Route path="/leads" element={<Leads />} />
      <Route path="/weddings" element={<Weddings />} />
      <Route path="/weddings/:id" element={<WeddingDetail />} />
      <Route path="/rfq/:id" element={<QuoteCompare />} />
      <Route path="/vendors" element={<VendorScorecard />} />
      <Route path="/queries" element={<Queries />} />
      <Route path="/team" element={<Team />} />
      <Route path="/checklist" element={<Checklist />} />
      <Route path="/payments" element={<Payments />} />
      <Route path="/assistant" element={<Assistant />} />
      <Route path="/profile" element={<MyProfile />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function ManagerRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ManagerHome />} />
      <Route path="/checklist" element={<Checklist />} />
      <Route path="/payments" element={<Payments />} />
      <Route path="/queries" element={<Queries />} />
      <Route path="/leads" element={<Guarded cap={CAP.LEADS}><Leads /></Guarded>} />
      <Route path="/weddings" element={<Weddings />} />
      <Route path="/weddings/:id" element={<WeddingDetail />} />
      <Route path="/rfq/:id" element={<QuoteCompare />} />
      <Route path="/assistant" element={<Assistant />} />
      <Route path="/profile" element={<MyProfile />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function VendorRoutes() {
  return (
    <Routes>
      <Route path="/" element={<VendorHome />} />
      <Route path="/requests" element={<VendorRequests />} />
      <Route path="/requests/:id" element={<VendorRequest />} />
      <Route path="/jobs" element={<VendorJobs />} />
      <Route path="/calendar" element={<VendorCalendar />} />
      <Route path="/earnings" element={<VendorEarnings />} />
      <Route path="/capacity" element={<VendorProfile />} />
      <Route path="/profile" element={<MyProfile />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function ClientRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ClientHome />} />
      <Route path="/timeline" element={<ClientTimeline />} />
      <Route path="/checklist" element={<ClientChecklist />} />
      <Route path="/payments" element={<ClientPayments />} />
      <Route path="/vendors" element={<ClientVendors />} />
      <Route path="/schedule" element={<ClientSchedule />} />
      <Route path="/invitations" element={<ClientInvitations />} />
      <Route path="/agreement" element={<ClientAgreement />} />
      <Route path="/help" element={<ClientHelp />} />
      <Route path="/profile" element={<MyProfile />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  const { user, loading, portal } = useAuth()

  return (
    <Routes>
      {/* public — the couple, and whoever the founder shared numbers with.
          No account: the link is the credential. */}
      <Route path="/sign/:token" element={<Sign />} />
      <Route path="/choose/:token" element={<ChooseVendor />} />
      <Route path="/shared/:token" element={<SharedReport />} />
      <Route path="/enquire" element={<Enquire />} />
      <Route path="/vendors/join" element={<VendorJoin />} />
      <Route path="/about" element={<Navigate to="/#about" replace />} />
      <Route path="/services" element={<Navigate to="/#services" replace />} />
      <Route path="/contact" element={<Navigate to="/#contact" replace />} />

      <Route path="/*" element={
        loading ? (
          <div className="flex min-h-screen items-center justify-center bg-sand-100">
            <Spinner label="Checking your session" />
          </div>
        ) : !user ? (
          <Login />
        ) : (
          <Shell portal={portal}>
            {portal === 'vendor' ? <VendorRoutes />
              : portal === 'client' ? <ClientRoutes />
              : portal === 'founder' ? <FounderRoutes />
              : <ManagerRoutes />}
          </Shell>
        )
      } />
    </Routes>
  )
}
