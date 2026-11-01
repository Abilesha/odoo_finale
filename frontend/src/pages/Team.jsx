import { useState } from 'react'

import { Link } from 'react-router-dom'

import { api, inr } from '../api'
import { useAuth } from '../auth'
import { EditButton, EditModal } from '../components/kit'
import { Card, Empty, ErrorBox, Modal, Pill, Spinner, useToast } from '../components/ui'
import { useApi } from '../hooks'
import { STAFF_FIELDS } from './Managers'

const ROLES = [
  {
    value: 'Manager',
    label: 'Manager',
    blurb: 'Runs the weddings you assign them — plan, client agreement and payments, vendors, the big day. Never sees the agency’s profit.',
  },
  {
    value: 'Founder',
    label: 'Founder',
    blurb: 'Everything: every wedding, every manager, assignments, edits and the profit.',
  },
]

/** Add a real person so they can sign in with their own email. */
function AddStaff({ onClose, onAdded }) {
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'Manager', title: '', hourly_cost: 850,
    phone: '', city: '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const pwOk = form.password.length >= 8

  async function submit(e) {
    e.preventDefault()
    if (!pwOk) { setErr(new Error('The password needs at least 8 characters.')); return }
    setBusy(true); setErr(null)
    try {
      onAdded(await api.post('/api/staff', {
        ...form,
        title: form.title.trim() || null,
        phone: form.phone.trim() || null,
        city: form.city.trim() || null,
        hourly_cost: Number(form.hourly_cost) || 850,
      }))
    } catch (e2) {
      setErr(e2)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Add someone to the team"
           subtitle="They sign in at the same screen with the email and password you set here.">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Full name</label>
          <input required minLength={2} className="input" value={form.name}
                 onChange={set('name')} placeholder="Priya Sharma" />
        </div>

        <div>
          <label className="label">Work email</label>
          <input required type="email" className="input" value={form.email}
                 onChange={set('email')} placeholder="priya@royalknot.in" />
          <p className="mt-1 text-xs text-ink-faint">This is what they sign in with.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={set('phone')} placeholder="+91 98…" />
          </div>
          <div>
            <label className="label">Base city</label>
            <input className="input" value={form.city} onChange={set('city')} placeholder="Jaipur" />
          </div>
        </div>

        <div>
          <label className="label">Temporary password</label>
          <input required type="text" className="input" value={form.password}
                 onChange={set('password')} placeholder="At least 8 characters" />
          {form.password.length > 0 && !pwOk && (
            <p className="mt-1 text-xs text-rust-600">
              {8 - form.password.length} more character(s) needed.
            </p>
          )}
          <p className="mt-1 text-xs text-ink-faint">
            Pass this on however you normally would — they can change it once
            they are in.
          </p>
        </div>

        <div>
          <label className="label">Access level</label>
          <div className="mt-1 space-y-2">
            {ROLES.map((r) => (
              <label key={r.value}
                     className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                       form.role === r.value
                         ? 'border-gold-400 bg-gold-50'
                         : 'border-sand-200 hover:border-sand-300'
                     }`}>
                <input type="radio" name="role" value={r.value}
                       checked={form.role === r.value}
                       onChange={set('role')}
                       className="mt-0.5 h-4 w-4 shrink-0 accent-gold-500" />
                <span>
                  <span className="block text-sm font-semibold text-ink">{r.label}</span>
                  <span className="block text-xs leading-snug text-ink-faint">{r.blurb}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">
              Job title <span className="font-normal text-ink-faint">(optional)</span>
            </label>
            <input className="input" value={form.title} onChange={set('title')}
                   placeholder="Coordinator" />
            <p className="mt-1 text-xs text-ink-faint">
              What they do. Does not change what they can open.
            </p>
          </div>
          <div>
            <label className="label">Hourly cost</label>
            <input type="number" min={0} step={50} className="input"
                   value={form.hourly_cost} onChange={set('hourly_cost')} />
            <p className="mt-1 text-xs text-ink-faint">
              Used for the labour line in each wedding's profit.
            </p>
          </div>
        </div>

        <ErrorBox error={err} />

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button disabled={busy} className="btn-primary flex-1">
            {busy ? 'Adding…' : 'Add to team'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Change your own password — including off the shared demo one. */
export function ChangePassword({ onClose, onDone }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const res = await api.post('/api/auth/change-password', {
        current_password: current, new_password: next,
      })
      onDone(res)
    } catch (e2) {
      setErr(e2)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Change your password">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Current password</label>
          <input required type="password" className="input" value={current}
                 onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div>
          <label className="label">New password</label>
          <input required type="password" minLength={8} className="input" value={next}
                 onChange={(e) => setNext(e.target.value)}
                 placeholder="At least 8 characters" />
        </div>
        <ErrorBox error={err} />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button disabled={busy} className="btn-primary flex-1">
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function Team() {
  const { user } = useAuth()
  const { data, error, loading, reload } = useApi('/api/staff?include_inactive=true')
  const [toast, setToast] = useToast()
  const [adding, setAdding] = useState(false)
  const [changing, setChanging] = useState(false)
  const [editing, setEditing] = useState(null)
  const [resetting, setResetting] = useState(null)

  if (loading) return <Spinner label="Loading the team" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const staff = data || []
  const active = staff.filter((s) => s.active)

  async function reactivate(s) {
    try {
      await api.patch(`/api/staff/${s.id}`, { active: true })
      setToast({ message: `${s.name} can sign in again.` })
      reload()
    } catch (e) {
      setToast({ message: e.message, tone: 'bad' })
    }
  }

  async function deactivate(s) {
    try {
      const res = await api.post(`/api/staff/${s.id}/deactivate`)
      setToast({ message: res.detail })
      reload()
    } catch (e) {
      setToast({ message: e.message, tone: 'bad' })
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink">The team</h1>
          <p className="mt-1 text-sm text-ink-faint">
            {active.length} {active.length === 1 ? "person can" : "people can"} sign in. Access level decides what they can
            open; job title is only what they do.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setChanging(true)} className="btn-ghost">
            Change my password
          </button>
          <button onClick={() => setAdding(true)} className="btn-primary">
            Add someone
          </button>
        </div>
      </header>

      <Card pad={false}>
        {staff.length === 0 ? (
          <Empty title="Nobody on the team yet"
                 hint="Add someone and they can sign in with their own email." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-200 bg-sand-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-ink-soft">Name</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-ink-soft">Signs in with</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-ink-soft">Phone · city</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-ink-soft">Access</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-ink-soft">Job title</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-ink-soft">Hourly cost</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id}
                      className={`border-b border-sand-200 last:border-0 ${
                        s.active ? '' : 'opacity-50'
                      }`}>
                    <td className="px-5 py-3">
                      {s.role === 'Manager'
                        ? <Link to={`/managers/${s.id}`} className="font-medium text-ink hover:text-plum-700">{s.name}</Link>
                        : <span className="font-medium text-ink">{s.name}</span>}
                      {s.id === user?.id && (
                        <Pill tone="plum">you</Pill>
                      )}
                      {!s.active && <Pill tone="neutral">switched off</Pill>}
                    </td>
                    <td className="px-5 py-3 text-ink-soft">{s.email || '—'}</td>
                    <td className="px-5 py-3 text-xs text-ink-faint">{[s.phone, s.city].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-5 py-3">
                      <Pill tone={s.role === 'Founder' ? 'gold' : 'plum'}>{s.role}</Pill>
                    </td>
                    <td className="px-5 py-3 text-ink-soft">{s.title || '—'}</td>
                    <td className="tnum px-5 py-3 text-right text-ink-soft">
                      {inr(s.hourly_cost)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <EditButton onClick={() => setEditing(s)} />
                      <button onClick={() => setResetting(s)}
                              className="ml-1 rounded-md px-2 py-1 text-xs text-ink-faint hover:bg-sand-200 hover:text-ink">
                        Reset password
                      </button>
                      {s.active && s.id !== user?.id && (
                        <button onClick={() => deactivate(s)}
                                className="ml-2 text-xs text-rust-600 underline underline-offset-2 hover:text-rust-700">
                          Switch off
                        </button>
                      )}
                      {!s.active && (
                        <button onClick={() => reactivate(s)}
                                className="ml-2 text-xs text-sage-700 underline underline-offset-2">
                          Switch on
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs leading-relaxed text-ink-faint">
        The demo accounts share one password so the system can be tried quickly.
        Delete them and the one-click sign-in route before any real deployment —
        the README says where.
      </p>

      {adding && (
        <AddStaff onClose={() => setAdding(false)}
                  onAdded={(res) => {
                    setAdding(false); reload(); setToast({ message: res.detail })
                  }} />
      )}
      {changing && (
        <ChangePassword onClose={() => setChanging(false)}
                        onDone={(res) => {
                          setChanging(false); setToast({ message: res.detail })
                        }} />
      )}
      <EditModal open={!!editing} onClose={() => setEditing(null)}
                 title={`Edit ${editing?.name || ''}`} fields={STAFF_FIELDS} initial={editing || {}}
                 onSubmit={async (v) => {
                   const res = await api.patch(`/api/staff/${editing.id}`, v)
                   setToast({ message: res.detail }); reload()
                 }} />
      <EditModal open={!!resetting} onClose={() => setResetting(null)}
                 title="Set a new password" subtitle={resetting ? `For ${resetting.name} — pass it on however you normally would` : ''}
                 initial={{ new_password: '' }} sendAll submitLabel="Set password"
                 fields={[{ name: 'new_password', label: 'New password', full: true, required: true,
                            help: 'At least 8 characters. They can change it from their profile.' }]}
                 onSubmit={async (v) => {
                   const res = await api.post(`/api/staff/${resetting.id}/reset-password`, v)
                   setToast({ message: res.detail })
                 }} />
      {toast}
    </div>
  )
}
