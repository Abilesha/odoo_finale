import { useState } from 'react'
import { Link } from 'react-router-dom'

import { api, date, inr, relativeDays } from '../api'
import { CAP, useAuth } from '../auth'
import {
  Card, ErrorBox, Modal, Spinner, Stat, StatusPill, useToast,
} from '../components/ui'
import { useApi } from '../hooks'
import { AgreementCopyModal } from '../components/AgreementCopy'
import { EditButton, EditModal } from '../components/kit'

const STAGES = ['New', 'Contacted', 'Meeting Booked', 'Agreement Sent', 'Signed', 'Won']
const SOURCES = ['Phone Call', 'Instagram', 'WhatsApp', 'Referral', 'Website']
const SOURCE_ICON = {
  'Phone Call': '☎', Instagram: '◉', WhatsApp: '✆', Referral: '♦', Website: '⌘',
}

/** Scene 1: an enquiry arrives on a call, Instagram or WhatsApp — it is
 *  captured in one place the moment it lands, and can never be forgotten. */
function NewEnquiry({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    partner_a: '', partner_b: '', phone: '', email: '',
    rough_date: '', guest_count: 400, theme: '', max_budget: '',
    preferred_city: 'Jaipur', source: 'Phone Call', notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const lead = await api.post('/api/leads', {
        ...form,
        guest_count: Number(form.guest_count) || 400,
        max_budget: Number(form.max_budget) || 0,
        rough_date: form.rough_date || null,
        email: form.email || null,
      })
      onCreated(lead)
      onClose()
      setForm({ ...form, partner_a: '', partner_b: '', phone: '', email: '', theme: '', notes: '' })
    } catch (e2) { setErr(e2) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="New enquiry"
           subtitle="Everything the couple said on the call, captured once">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Partner 1</label>
            <input required className="input" value={form.partner_a} onChange={set('partner_a')} placeholder="Arjun" /></div>
          <div><label className="label">Partner 2</label>
            <input required className="input" value={form.partner_b} onChange={set('partner_b')} placeholder="Meera" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Phone</label>
            <input required className="input" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" /></div>
          <div><label className="label">Email</label>
            <input type="email" className="input" value={form.email} onChange={set('email')} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Rough date</label>
            <input type="date" className="input" value={form.rough_date} onChange={set('rough_date')} /></div>
          <div><label className="label">Guest count</label>
            <input type="number" className="input" value={form.guest_count} onChange={set('guest_count')} /></div>
          <div><label className="label">City</label>
            <select className="input" value={form.preferred_city} onChange={set('preferred_city')}>
              <option>Jaipur</option><option>Udaipur</option>
            </select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Theme in mind</label>
            <input className="input" value={form.theme} onChange={set('theme')} placeholder="Royal heritage, beach chic…" /></div>
          <div><label className="label">Maximum budget (₹)</label>
            <input type="number" className="input" value={form.max_budget} onChange={set('max_budget')} placeholder="35000000" /></div>
        </div>
        <div><label className="label">Where did they come from?</label>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((s) => (
              <button key={s} type="button" onClick={() => setForm({ ...form, source: s })}
                className={`btn btn-sm ${form.source === s
                  ? 'bg-plum-700 text-white' : 'border border-sand-300 bg-white text-ink-soft'}`}>
                <span className="opacity-70">{SOURCE_ICON[s]}</span>{s}
              </button>
            ))}
          </div></div>
        <div><label className="label">Notes</label>
          <textarea rows={2} className="input" value={form.notes} onChange={set('notes')}
                    placeholder="Winter destination wedding, called at 9pm…" /></div>
        <ErrorBox error={err} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button disabled={busy} className="btn-primary">
            {busy ? 'Saving…' : 'Capture enquiry'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function SendAgreement({ lead, onClose, onSent }) {
  const [fee, setFee] = useState(Math.round((lead?.max_budget || 0) * 0.7))
  const [pkg, setPkg] = useState('Full-Service Wedding')
  const needsLogin = !lead?.client_account
  const [login, setLogin] = useState({ name: lead?.partner_b || '', email: lead?.email || '', password: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const setL = (k) => (e) => setLogin((x) => ({ ...x, [k]: e.target.value }))
  const missing = needsLogin && (!login.name.trim() ? 'who signs in' : !/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(login.email.trim()) ? 'their email' : login.password.length < 8 ? 'a temporary password of 8+ characters' : null)

  async function send() {
    setBusy(true); setErr(null)
    try {
      const res = await api.post(`/api/leads/${lead.id}/agreement`, {
        package_type: pkg, quoted_fee: Number(fee) || 0,
        ...(needsLogin ? { client_login: { ...login, email: login.email.trim(), name: login.name.trim() } } : {}),
      })
      onSent(res)
    } catch (e) { setErr(e) } finally { setBusy(false) }
  }

  return (
    <Modal open={!!lead} onClose={onClose} title="Send service agreement"
           subtitle={`It appears in ${lead?.couple_name}'s own portal — only they can sign it`}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Package</label>
            <select className="input" value={pkg} onChange={(e) => setPkg(e.target.value)}>
              <option>Full-Service Wedding</option>
              <option>Partial / Day-of</option>
            </select></div>
          <div><label className="label">Total contract value (₹)</label>
            <input type="number" min="0" className="input" value={fee} onChange={(e) => setFee(e.target.value)} /></div>
        </div>
        <p className="-mt-2 text-xs text-ink-faint">Billed in three stages: 25% on signature, 50% a month before, 25% after the event.</p>
        {needsLogin ? (
          <div className="rounded-xl border border-blush-200 bg-blush-50 p-4">
            <p className="text-sm font-semibold text-blush-800">♡ The couple needs a portal login to sign</p>
            <p className="mt-0.5 text-xs text-blush-700">Create it now — they sign in at the Couple door and sign there.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div><label className="label">Who signs in</label><input className="input" value={login.name} onChange={setL('name')} /></div>
              <div><label className="label">Their email</label><input className="input" type="email" value={login.email} onChange={setL('email')} /></div>
              <div className="sm:col-span-2"><label className="label">Temporary password</label><input className="input" value={login.password} onChange={setL('password')} placeholder="At least 8 characters — they change it from their profile" /></div>
            </div>
          </div>
        ) : (
          <p className="rounded-lg bg-sage-100 px-3 py-2 text-xs text-sage-700">✓ {lead?.couple_name} sign in as {lead?.client_account?.email} — the agreement will be waiting for them.</p>
        )}
        <ErrorBox error={err} />
        <div className="flex items-center justify-end gap-2">
          {missing && <span className="mr-auto text-xs text-ink-faint">Still needed: {missing}</span>}
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={send} disabled={busy || !!missing} className="btn-primary">
            {busy ? 'Sending…' : 'Send to the couple’s portal'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Convert({ lead, onClose, onDone }) {
  const [value, setValue] = useState(lead?.agreement?.quoted_fee || 0)
  const [venue, setVenue] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function go() {
    setBusy(true); setErr(null)
    try {
      onDone(await api.post(`/api/leads/${lead.id}/convert`, {
        package_value: Number(value) || 0, venue: venue || null,
      }))
    } catch (e) { setErr(e) } finally { setBusy(false) }
  }

  return (
    <Modal open={!!lead} onClose={onClose} title="Booking deposit received"
           subtitle="Opens the wedding file and builds the whole plan immediately">
      <div className="space-y-4">
        <div className="rounded-lg border border-plum-200 bg-plum-50 p-3 text-sm text-plum-700">
          The moment this is confirmed, the system generates the full task list with
          owners and due dates, plus the three staged payments. Nobody copies a
          checklist from the last wedding.
        </div>
        <div><label className="label">Total contract value (₹)</label>
          <input type="number" className="input" value={value} onChange={(e) => setValue(e.target.value)} /></div>
        <div><label className="label">Venue (if decided)</label>
          <input className="input" value={venue} onChange={(e) => setVenue(e.target.value)}
                 placeholder="Taj Lake Palace, Udaipur" /></div>
        <ErrorBox error={err} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={go} disabled={busy} className="btn-gold">
            {busy ? 'Building the plan…' : 'Open wedding file'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function LeadCard({ lead, onAgreement, onConvert, onAdvance, onEdit, onPortal, onViewAgreement }) {
  const sign = lead.agreement && !lead.agreement.signed
  return (
    <article className="card space-y-2.5 p-3.5 transition-shadow hover:shadow-lift">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-tight text-ink">{lead.couple_name}</p>
        <span className="flex shrink-0 items-center gap-1">
          <span className="text-xs text-ink-faint" title={lead.source}>{SOURCE_ICON[lead.source]}</span>
          <EditButton label="" onClick={() => onEdit(lead)} />
        </span>
      </div>

      <dl className="space-y-1 text-xs text-ink-faint">
        <div className="flex justify-between gap-2">
          <dt>Date</dt>
          <dd className="tnum text-ink-soft">
            {date(lead.rough_date)}
            {lead.rough_date && <span className="ml-1 opacity-60">({relativeDays(lead.rough_date)})</span>}
          </dd>
        </div>
        <div className="flex justify-between"><dt>Guests</dt>
          <dd className="tnum text-ink-soft">{lead.guest_count}</dd></div>
        <div className="flex justify-between"><dt>Budget</dt>
          <dd className="tnum text-ink-soft">{inr(lead.max_budget, { compact: true })}</dd></div>
        {lead.theme && <div className="flex justify-between gap-2"><dt>Theme</dt>
          <dd className="truncate text-right text-ink-soft">{lead.theme}</dd></div>}
      </dl>

      {lead.agreement && (
        <div className={`rounded-md px-2.5 py-2 text-xs ${
          lead.agreement.signed ? 'bg-sage-100 text-sage-700' : 'bg-gold-100 text-gold-700'}`}>
          {lead.agreement.signed ? (
            <>Signed by {lead.agreement.signer_name} · {date(lead.agreement.signed_at)}</>
          ) : (
            <>Waiting for the couple to sign in their portal · sent {date(lead.agreement.sent_at)}</>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {!lead.agreement && lead.stage !== 'Won' && (
          <button onClick={() => onAgreement(lead)} className="btn-ghost btn-sm">Send agreement</button>
        )}
        {lead.agreement && (
          <button onClick={() => onViewAgreement(lead)} className="btn-ghost btn-sm">
            {sign ? 'View agreement' : 'View signed copy'}
          </button>
        )}
        {lead.agreement?.signed && !lead.wedding_id && (
          <button onClick={() => onConvert(lead)} className="btn-gold btn-sm">Deposit received</button>
        )}
        {lead.wedding_id && (
          <Link to={`/weddings/${lead.wedding_id}`} className="btn-primary btn-sm">
            {lead.wedding_code}
          </Link>
        )}
        {!lead.agreement && lead.stage !== 'Won' && (
          <button onClick={() => onAdvance(lead)} className="btn-ghost btn-sm">Advance →</button>
        )}
      </div>

      {lead.client_account ? (
        <p className="rounded-md bg-blush-50 px-2.5 py-1.5 text-[11px] text-blush-700">
          ♡ Couple signs in as {lead.client_account.email}
          {lead.client_account.last_login_at && ` · last seen ${date(lead.client_account.last_login_at)}`}
        </p>
      ) : lead.stage !== 'Lost' && (
        <button onClick={() => onPortal(lead)} className="text-[11px] text-blush-700 underline underline-offset-2 hover:text-blush-800">
          ♡ Give the couple a portal login
        </button>
      )}
      {lead.events_wanted && <p className="text-[11px] text-ink-faint">Wants · {lead.events_wanted}</p>}
      {lead.owner && <p className="text-[11px] text-ink-faint">Owner · {lead.owner}</p>}
    </article>
  )
}

export default function Leads() {
  const { can } = useAuth()
  const canAssign = can(CAP.TEAM)
  const { data, error, loading, reload } = useApi('/api/leads')
  const [creating, setCreating] = useState(false)
  const [agreementFor, setAgreementFor] = useState(null)
  const [convertFor, setConvertFor] = useState(null)
  const [editing, setEditing] = useState(null)
  const [portalFor, setPortalFor] = useState(null)
  const [copyFor, setCopyFor] = useState(null)
  const staff = useApi(canAssign ? '/api/staff' : null)
  const [toastNode, setToast] = useToast()

  if (loading) return <Spinner label="Loading the pipeline" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  async function advance(lead) {
    const next = STAGES[Math.min(STAGES.indexOf(lead.stage) + 1, STAGES.length - 1)]
    await api.patch(`/api/leads/${lead.id}`, { stage: next })
    setToast({ message: `${lead.couple_name} moved to ${next}.` })
    reload()
  }

  const signedWaiting = data.leads.filter((l) => l.agreement?.signed && !l.wedding_id).length

  return (
    <div className="space-y-6">
      {toastNode}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl text-ink">Enquiries</h1>
          <p className="mt-1 text-sm text-ink-faint">
            Calls, Instagram and WhatsApp — all in one place, none forgotten.
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">+ New enquiry</button>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Open enquiries" value={data.leads.filter((l) => !['Won','Lost'].includes(l.stage)).length} icon="✎" />
        <Stat label="Pipeline value" value={inr(data.pipeline_value, { compact: true })} tone="plum" icon="₹" />
        <Stat label="Awaiting signature"
              value={data.leads.filter((l) => l.agreement && !l.agreement.signed).length}
              tone="gold" icon="✍" />
        <Stat label="Signed, ready to open" value={signedWaiting}
              sub={signedWaiting ? 'deposit confirms the file' : null}
              tone={signedWaiting ? 'good' : 'neutral'} icon="✓" />
      </div>

      {/* a kanban reads as one row of stages; scroll it rather than wrapping it */}
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {STAGES.map((stage) => {
          const items = data.by_stage[stage] || []
          return (
            <div key={stage} className="w-[17rem] shrink-0 space-y-3">
              <div className="flex items-center justify-between px-0.5">
                <StatusPill status={stage} />
                <span className="tnum text-xs text-ink-faint">{items.length}</span>
              </div>
              <div className="space-y-3">
                {items.map((lead) => (
                  <LeadCard key={lead.id} lead={lead}
                            onAgreement={setAgreementFor}
                            onConvert={setConvertFor}
                            onAdvance={advance}
                            onEdit={setEditing}
                            onPortal={setPortalFor}
                            onViewAgreement={(l) => setCopyFor(l.id)} />
                ))}
                {!items.length && (
                  <div className="rounded-lg border border-dashed border-sand-300 py-7 text-center text-xs text-ink-faint">
                    nothing here
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <NewEnquiry open={creating} onClose={() => setCreating(false)}
        onCreated={(l) => { setToast({ message: `${l.couple_name} captured. Nothing gets lost now.` }); reload() }} />

      {agreementFor && (
        <SendAgreement lead={agreementFor} onClose={() => setAgreementFor(null)}
          onSent={(res) => {
            setAgreementFor(null); reload()
            setToast({ message: res.detail })
          }} />
      )}
      <AgreementCopyModal leadId={copyFor} onClose={() => setCopyFor(null)} />

      {convertFor && (
        <Convert lead={convertFor} onClose={() => setConvertFor(null)}
          onDone={(res) => { setConvertFor(null); reload(); setToast({ message: res.detail }) }} />
      )}
      <EditModal open={!!portalFor} onClose={() => setPortalFor(null)}
                 title="Give the couple a portal login"
                 subtitle={portalFor ? `${portalFor.couple_name} — they follow their wedding, sign their agreement and message you from it` : ''}
                 initial={{ email: portalFor?.email || '', name: portalFor?.partner_b || '', password: '' }}
                 sendAll submitLabel="Create login"
                 fields={[
                   { name: 'name', label: 'Who signs in', required: true },
                   { name: 'email', label: 'Their email', type: 'email', required: true },
                   { name: 'password', label: 'Temporary password', full: true, required: true,
                     help: 'At least 8 characters. Pass it on however you normally would — they change it from their profile.' },
                 ]}
                 onSubmit={async (v) => {
                   const res = await api.post(`/api/leads/${portalFor.id}/client-account`, v)
                   setToast({ message: res.detail }); reload()
                 }} />
      <EditModal open={!!editing} onClose={() => setEditing(null)} wide
                 title={`Edit ${editing?.couple_name || 'enquiry'}`}
                 subtitle="Everything captured on the first call — fix anything that came out wrong"
                 initial={editing || {}}
                 fields={[
                   { name: 'partner_a', label: 'Partner', required: true },
                   { name: 'partner_b', label: 'Partner', required: true },
                   { name: 'phone', label: 'Phone', required: true },
                   { name: 'email', label: 'Email', type: 'email' },
                   { name: 'rough_date', label: 'Wedding date (rough)', type: 'date' },
                   { name: 'guest_count', label: 'Guests', type: 'number' },
                   { name: 'max_budget', label: 'Budget (₹)', type: 'number' },
                   { name: 'preferred_city', label: 'City' },
                   { name: 'theme', label: 'Theme', full: true },
                   { name: 'source', label: 'Came in via', type: 'select', placeholder: false,
                     options: ['Phone Call', 'Instagram', 'WhatsApp', 'Referral', 'Website'] },
                   { name: 'package_interest', label: 'Package', type: 'select', placeholder: false,
                     options: ['Full-Service Wedding', 'Partial / Day-of'] },
                   { name: 'stage', label: 'Stage', type: 'select', placeholder: false,
                     options: ['New', 'Contacted', 'Meeting Booked', 'Agreement Sent', 'Signed', 'Won', 'Lost'] },
                   ...(canAssign ? [{ name: 'owner_id', label: 'Assign manager', type: 'select', numeric: true,
                     help: 'Choose the manager with the lightest workload; only that manager can open this couple’s file.',
                     options: (staff.data || []).filter((x) => x.role === 'Manager')
                       .map((x) => ({ value: x.id, label: x.name })) }] : []),
                   { name: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
                 ]}
                 onSubmit={async (v) => {
                   await api.patch(`/api/leads/${editing.id}`, v)
                   setToast({ message: 'Enquiry updated.' }); reload()
                 }} />
    </div>
  )
}
