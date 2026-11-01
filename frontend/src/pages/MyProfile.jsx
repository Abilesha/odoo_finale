import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { api, date } from '../api'
import { useAuth } from '../auth'
import { Avatar } from '../components/kit'
import { ErrorBox, Modal, Spinner, useToast } from '../components/ui'
import { useApi } from '../hooks'

/** One profile page for all four people who sign in.
 *
 *  Same layout everywhere — a photo and who you are, the details you can
 *  change yourself, and your password — in the colour of your own portal.
 */
const LOOK = {
  founder: { band: 'from-plum-800 via-plum-700 to-gold-500', tone: 'gold', btn: 'bg-plum-700 hover:bg-plum-800', soft: 'bg-plum-50 text-plum-700', label: 'Founder' },
  manager: { band: 'from-night-900 via-night-700 to-night-400', tone: 'night', btn: 'bg-night-700 hover:bg-night-800', soft: 'bg-night-50 text-night-700', label: 'Manager' },
  vendor: { band: 'from-jade-900 via-jade-700 to-gold-400', tone: 'jade', btn: 'bg-jade-700 hover:bg-jade-800', soft: 'bg-jade-50 text-jade-700', label: 'Vendor partner' },
  client: { band: 'from-blush-900 via-blush-600 to-gold-300', tone: 'blush', btn: 'bg-blush-700 hover:bg-blush-800', soft: 'bg-blush-50 text-blush-700', label: 'Couple' },
}

const LABELS = { name: 'Your name', title: 'Job title', phone: 'Phone', city: 'Base city', contact_person: 'Contact person' }

export default function MyProfile() {
  const { portal, updateUser } = useAuth()
  const look = LOOK[portal] || LOOK.manager
  const { data, error, loading, reload } = useApi('/api/profile')
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [photoOpen, setPhotoOpen] = useState(false)
  const [toast, setToast] = useToast()

  useEffect(() => {
    if (data) setForm(Object.fromEntries(data.editable.map((k) => [k, data[k] ?? ''])))
  }, [data])

  if (loading || (!form && !error)) return <Spinner label="Opening your profile" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const changed = data.editable.filter((k) => (form[k] ?? '') !== (data[k] ?? ''))
  const shown = data.kind === 'vendor' ? data.display_name : data.name

  async function save(e) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const res = await api.patch('/api/profile', Object.fromEntries(changed.map((k) => [k, form[k]])))
      updateUser({ name: data.kind === 'vendor' ? data.name : res.name, phone: res.phone, title: res.title ?? undefined, contact_person: res.contact_person })
      setToast({ message: res.detail }); reload()
    } catch (e2) { setErr(e2) } finally { setBusy(false) }
  }

  async function savePhoto(image) {
    const res = image ? await api.put('/api/profile/avatar', { image }) : await api.del('/api/profile/avatar')
    updateUser({ avatar: res.avatar })
    setToast({ message: res.detail }); setPhotoOpen(false); reload()
  }

  const facts = data.kind === 'staff' ? [
    ['Signs in with', data.email], ['Access', data.role], ['With The Royal Knot since', data.joined_on && date(data.joined_on)],
  ] : data.kind === 'vendor' ? [
    ['Business', data.business], ['Category', data.category], ['Signs in with', data.email], ['Works in', data.service_cities || data.city],
  ] : [
    ['Wedding', data.couple_name], ['Signs in with', data.email], ['Date', data.wedding_date && date(data.wedding_date)],
    ['City', data.city], ['Your planner', data.planner && `${data.planner}${data.planner_phone ? ` · ${data.planner_phone}` : ''}`],
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* ---- who you are ---- */}
      <section className="card overflow-hidden">
        <div className={`h-28 bg-gradient-to-r sm:h-32 ${look.band}`} />
        <div className="flex flex-wrap items-end gap-5 px-6 pb-6">
          <div className="relative -mt-14">
            <Avatar name={shown} src={data.avatar} size="xl" tone={look.tone} ring />
            <button type="button" onClick={() => setPhotoOpen(true)} aria-label="Change your photo"
                    className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-ink text-sm text-white shadow-lift transition hover:scale-105">
              <CameraIcon />
            </button>
          </div>
          <div className="min-w-0 flex-1 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint">{look.label}</p>
            <h1 className="mt-0.5 truncate font-display text-3xl text-ink sm:text-4xl">{shown}</h1>
            <p className="text-sm text-ink-faint">{data.headline}</p>
          </div>
          <button type="button" className="btn-ghost" onClick={() => setPhotoOpen(true)}>{data.avatar ? 'Change photo' : 'Add a photo'}</button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* ---- details ---- */}
        <section className="card p-6">
          <h2 className="text-2xl text-ink">Your details</h2>
          <p className="mt-1 text-sm text-ink-faint">What you can change yourself.</p>
          <form onSubmit={save} className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {data.editable.map((k) => (
                <div key={k} className={k === 'name' || k === 'contact_person' ? 'sm:col-span-2' : ''}>
                  <label className="label" htmlFor={`pf-${k}`}>{LABELS[k]}</label>
                  <input id={`pf-${k}`} className="input" type={k === 'phone' ? 'tel' : 'text'} value={form[k]}
                         onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
                </div>
              ))}
            </div>
            <ErrorBox error={err} />
            <div className="flex items-center justify-end gap-3">
              {changed.length > 0 && <button type="button" className="text-sm text-ink-faint hover:text-ink" onClick={() => setForm(Object.fromEntries(data.editable.map((k) => [k, data[k] ?? ''])))}>Undo</button>}
              <button className={`btn text-white ${look.btn}`} disabled={busy || changed.length === 0}>{busy ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>

          <dl className="mt-6 grid gap-4 border-t border-sand-200 pt-5 sm:grid-cols-2">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{k}</dt>
                <dd className="mt-0.5 break-words text-sm text-ink">{v || '—'}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 flex items-start gap-2 rounded-lg bg-sand-100 px-3 py-2 text-xs text-ink-faint">
            <span aria-hidden>🔒</span>
            {data.kind === 'staff'
              ? (data.role === 'Founder' ? 'Your sign-in email is changed from the Team screen.' : 'Your name, job title and sign-in email are kept by the founder — ask them to change those.')
              : data.kind === 'vendor' ? 'To change your business name, category or sign-in email, ask your Royal Knot manager.'
              : 'To change your sign-in email or wedding details, message your planner.'}
          </p>
        </section>

        <div className="space-y-6">
          <PasswordCard look={look} onDone={(m) => setToast({ message: m })} />
          {data.kind === 'vendor' && (
            <Link to="/capacity" className="card group flex items-center gap-4 p-5 transition hover:shadow-lift">
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-lg ${look.soft}`}>⚙</span>
              <span className="flex-1"><span className="block font-semibold text-ink">Capacity & services</span><span className="block text-xs text-ink-faint">Guests, team, cities and what you are known for</span></span>
              <span className="text-ink-faint transition group-hover:translate-x-1">→</span>
            </Link>
          )}
          {data.kind === 'staff' && data.access && (
            <section className="card p-5">
              <h3 className="font-semibold text-ink">What your account can open</h3>
              <p className="mt-1 text-sm text-ink-soft">{data.access}</p>
            </section>
          )}
        </div>
      </div>

      <PhotoModal open={photoOpen} onClose={() => setPhotoOpen(false)} current={data.avatar} name={shown} tone={look.tone} btn={look.btn} onSave={savePhoto} />
      {toast}
    </div>
  )
}

function PasswordCard({ look, onDone }) {
  const [f, setF] = useState({ current: '', next: '', confirm: '' })
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const missing = !f.current ? null : f.next.length < 8 ? 'At least 8 characters' : f.next !== f.confirm ? 'The new passwords do not match' : null

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const res = await api.post('/api/profile/password', { current_password: f.current, new_password: f.next })
      setF({ current: '', next: '', confirm: '' }); onDone(res.detail)
    } catch (e2) { setErr(e2) } finally { setBusy(false) }
  }

  return (
    <section className="card p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl text-ink">Password</h2>
        <button type="button" className="text-xs font-semibold text-ink-faint hover:text-ink" onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</button>
      </div>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <div><label className="label" htmlFor="pw-cur">Current password</label><input id="pw-cur" className="input" type={show ? 'text' : 'password'} autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></div>
        <div><label className="label" htmlFor="pw-new">New password</label><input id="pw-new" className="input" type={show ? 'text' : 'password'} autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} placeholder="At least 8 characters" /></div>
        <div><label className="label" htmlFor="pw-confirm">New password, again</label><input id="pw-confirm" className="input" type={show ? 'text' : 'password'} autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></div>
        <ErrorBox error={err} />
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-ink-faint">{f.current && missing}</span>
          <button className={`btn text-white ${look.btn}`} disabled={busy || !f.current || !!missing}>{busy ? 'Changing…' : 'Change password'}</button>
        </div>
      </form>
    </section>
  )
}

/** Choose a photo, see it in the circle, zoom to taste. It is cropped and
 *  shrunk to a 320-pixel square in the browser before it is sent. */
function PhotoModal({ open, onClose, current, name, tone, btn, onSave }) {
  const fileRef = useRef(null)
  const [img, setImg] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => { if (!open) { setImg(null); setPreview(null); setZoom(1); setErr(null) } }, [open])

  useEffect(() => {
    if (!img) return
    const size = 320
    const c = document.createElement('canvas')
    c.width = size; c.height = size
    const ctx = c.getContext('2d')
    const side = Math.min(img.width, img.height) / zoom
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size)
    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
    setPreview(c.toDataURL('image/jpeg', 0.86))
  }, [img, zoom])

  function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setErr(new Error('Choose a JPG, PNG or WebP photo')); return }
    if (file.size > 12 * 1024 * 1024) { setErr(new Error('That photo is over 12 MB — choose a smaller one')); return }
    setErr(null)
    const url = URL.createObjectURL(file)
    const i = new Image()
    i.onload = () => { setImg(i); setZoom(1); URL.revokeObjectURL(url) }
    i.onerror = () => setErr(new Error('That photo could not be opened'))
    i.src = url
  }

  async function run(fn) {
    setBusy(true); setErr(null)
    try { await fn() } catch (e) { setErr(e) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Your photo" subtitle="Shown beside your name across The Royal Knot">
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-4">
          <Avatar name={name} src={preview || current} size="xl" tone={tone} ring />
          {img && (
            <label className="flex w-full max-w-xs items-center gap-3 text-xs text-ink-faint">
              Zoom
              <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-gold-500" />
            </label>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pick} />
          <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>{img ? 'Choose a different photo' : 'Choose a photo'}</button>
        </div>
        <ErrorBox error={err} />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sand-200 pt-4">
          {current && !img
            ? <button type="button" className="text-sm font-medium text-rust-700 hover:underline" disabled={busy} onClick={() => run(() => onSave(null))}>Remove photo</button>
            : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className={`btn text-white ${btn}`} disabled={!preview || busy} onClick={() => run(() => onSave(preview))}>{busy ? 'Saving…' : 'Use this photo'}</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}
