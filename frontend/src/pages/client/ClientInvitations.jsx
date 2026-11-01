import { useEffect, useMemo, useRef, useState } from 'react'

import { api } from '../../api'
import { ErrorBox, Spinner, useToast } from '../../components/ui'
import { useApi } from '../../hooks'
import { DESIGNS, H, W, drawInvitation, loadFonts, longDate, renderJpeg } from '../../invitations/art'
import { download, jpegsToPdf } from '../../invitations/pdf'
import { ClientHead } from './shared'

/** Invitations — design, word, personalise and download.
 *
 *  Four designs drawn at print size (5 × 7 in, 300 dpi). The couple picks a
 *  look, edits the words, and downloads a PNG to send on WhatsApp or a PDF
 *  for the printer — one card, the whole set, or a copy addressed to every
 *  guest by name. What they choose is saved to their account.
 */
export default function ClientInvitations() {
  const { data, error, loading, reload } = useApi('/api/client/invitation')
  const [c, setC] = useState(null)
  const [card, setCard] = useState('main')
  const [guest, setGuest] = useState('')
  const [fontsReady, setFontsReady] = useState(false)
  const [busy, setBusy] = useState('')
  const [saved, setSaved] = useState('idle')
  const [toast, setToast] = useToast()
  const canvasRef = useRef(null)
  const first = useRef(true)

  useEffect(() => { loadFonts().then(() => setFontsReady(true)) }, [])
  useEffect(() => {
    if (data && !c) setC({ ...data.defaults, ...(data.saved || {}) })
  }, [data, c])

  const cards = useMemo(() => (c ? [
    { id: 'main', label: 'Wedding invitation', kind: 'main' },
    { id: 'save', label: 'Save the date', kind: 'save' },
    ...c.events.map((e, i) => ({ id: `ev${i}`, label: e.name || `Event ${i + 1}`, kind: 'event', event: e })),
  ] : []), [c])
  const current = cards.find((x) => x.id === card) || cards[0]

  // redraw the preview whenever anything changes
  useEffect(() => {
    if (!c || !canvasRef.current || !current) return
    drawInvitation(canvasRef.current, c.design, c, current, guest.trim())
  }, [c, current, guest, fontsReady])

  // save a moment after the couple stops typing
  useEffect(() => {
    if (!c) return undefined
    if (first.current) { first.current = false; return undefined }
    setSaved('saving')
    const t = setTimeout(async () => {
      try { await api.put('/api/client/invitation', c); setSaved('saved') } catch { setSaved('error') }
    }, 900)
    return () => clearTimeout(t)
  }, [c])

  if (loading || (!c && !error)) return <Spinner label="Opening your invitations" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const set = (k) => (e) => setC((x) => ({ ...x, [k]: e.target.value }))
  const setEvent = (i, k) => (e) => setC((x) => ({ ...x, events: x.events.map((ev, j) => (j === i ? { ...ev, [k]: e.target.value } : ev)) }))
  const guests = c.guests.split('\n').map((g) => g.trim()).filter(Boolean).slice(0, 80)
  const slug = `${c.partner_a}-${c.partner_b}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'invitation'
  const fileName = (x, ext, who = '') => `${slug}-${x.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${who ? `-${who.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : ''}.${ext}`

  async function task(label, fn) {
    setBusy(label)
    await new Promise((r) => setTimeout(r, 30)) // let the button show it is working
    try { await fn() } catch (e) { setToast({ message: e.message || 'That did not work', tone: 'bad' }) } finally { setBusy('') }
  }

  const pngOf = (x, who) => {
    const cv = document.createElement('canvas')
    cv.width = W; cv.height = H
    drawInvitation(cv, c.design, c, x, who)
    return cv
  }

  const downloadPng = () => task('png', async () => {
    download(pngOf(current, guest.trim()).toDataURL('image/png'), fileName(current, 'png', guest.trim()))
  })
  const downloadPdf = () => task('pdf', async () => {
    download(jpegsToPdf([renderJpeg(c.design, c, current, guest.trim())], { title: current.label }), fileName(current, 'pdf', guest.trim()))
  })
  const downloadSet = () => task('set', async () => {
    download(jpegsToPdf(cards.map((x) => renderJpeg(c.design, c, x)), { title: `${c.partner_a} & ${c.partner_b}` }), `${slug}-invitation-set.pdf`)
    setToast({ message: `All ${cards.length} cards in one PDF.` })
  })
  const downloadGuests = () => task('guests', async () => {
    const pages = []
    for (const who of guests) {
      pages.push(renderJpeg(c.design, c, current, who))
      await new Promise((r) => setTimeout(r, 0))
    }
    download(jpegsToPdf(pages, { title: `${current.label} — guests` }), `${slug}-${current.id}-for-${guests.length}-guests.pdf`)
    setToast({ message: `${guests.length} personalised copies, one per page.` })
  })
  const canShare = typeof navigator !== 'undefined' && !!navigator.share && !!navigator.canShare
  const share = () => task('share', async () => {
    const blob = await new Promise((r) => pngOf(current, guest.trim()).toBlob(r, 'image/png'))
    const file = new File([blob], fileName(current, 'png', guest.trim()), { type: 'image/png' })
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `${c.partner_a} & ${c.partner_b}`, text: `${current.label} — ${longDate(current.event?.date || c.date)}` }) } catch (e) { if (e.name !== 'AbortError') throw e }
    } else {
      download(file, file.name)
    }
  })

  return (
    <div className="space-y-6">
      <ClientHead eyebrow="Invitations" title="Your invitations"
                  sub="Choose a design, make the words your own, and download it to send or print. Changes are saved to your account as you go." />

      {/* ---- designs ---- */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {DESIGNS.map((d) => (
          <DesignChoice key={d.id} d={d} c={c} active={c.design === d.id} fontsReady={fontsReady}
                        onClick={() => setC((x) => ({ ...x, design: d.id }))} />
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
        {/* ---- the card ---- */}
        <section className="space-y-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Which card">
            {cards.map((x) => (
              <button key={x.id} role="tab" aria-selected={x.id === current.id} onClick={() => setCard(x.id)}
                      className={`rounded-full border px-4 py-1.5 text-sm transition ${x.id === current.id ? 'border-blush-700 bg-blush-700 text-white' : 'border-sand-300 bg-white text-ink-soft hover:border-blush-300'}`}>{x.label}</button>
            ))}
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sand-200 via-sand-100 to-blush-100 p-6 sm:p-10">
            <canvas ref={canvasRef} width={750} height={1050} aria-label={`${current.label} preview`}
                    className="mx-auto block w-full max-w-[26rem] rounded-sm shadow-[0_30px_60px_-20px_rgba(42,15,25,.45)] transition-transform duration-500 hover:-rotate-1 hover:scale-[1.01]" />
          </div>
          <div className="card space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn bg-blush-700 text-white hover:bg-blush-800" onClick={downloadPng} disabled={!!busy}>{busy === 'png' ? 'Preparing…' : '⤓ Download image (PNG)'}</button>
              <button className="btn-ghost" onClick={downloadPdf} disabled={!!busy}>{busy === 'pdf' ? 'Preparing…' : '⤓ Print-ready PDF'}</button>
              <button className="btn-ghost" onClick={downloadSet} disabled={!!busy}>{busy === 'set' ? 'Preparing…' : `⤓ Whole set (${cards.length} cards)`}</button>
              {canShare && <button className="btn-ghost" onClick={share} disabled={!!busy}>Share…</button>}
            </div>
            <p className="text-xs text-ink-faint">PNG is perfect for WhatsApp and email. The PDF is 5 × 7 inches at print quality — hand it straight to your printer.</p>
          </div>
        </section>

        {/* ---- the words ---- */}
        <section className="space-y-4">
          <div className="card space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl text-ink">The words</h2>
              <span className="text-xs text-ink-faint" aria-live="polite">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? '✓ Saved' : saved === 'error' ? 'Not saved — check your connection' : ''}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="One of you" value={c.partner_a} onChange={set('partner_a')} />
              <Field label="And the other" value={c.partner_b} onChange={set('partner_b')} />
            </div>
            {current.kind === 'event' ? (
              <EventFields e={current.event} i={Number(current.id.slice(2))} setEvent={setEvent} />
            ) : (
              <>
                {current.kind === 'main' && <Field label="Opening line" value={c.blessing} onChange={set('blessing')} placeholder="With the blessings of our families" />}
                {current.kind === 'main' && <Area label="Invitation" value={c.invite_line} onChange={set('invite_line')} />}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Date" type="date" value={c.date} onChange={set('date')} />
                  {current.kind === 'main' && <Field label="Time" type="time" value={c.time} onChange={set('time')} />}
                </div>
                {current.kind === 'main' && <Field label="Venue" value={c.venue} onChange={set('venue')} placeholder="e.g. Jagmandir Island Palace" />}
                <Field label="City" value={c.city} onChange={set('city')} />
              </>
            )}
            {current.kind !== 'save' && <Field label="RSVP line" value={c.rsvp} onChange={set('rsvp')} placeholder="RSVP · Meera · +91 98…" />}
          </div>

          <div className="card space-y-3 p-5">
            <h2 className="text-xl text-ink">Address it to a guest</h2>
            <Field label="Guest name on this copy" value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="e.g. Sharma family" />
            <Area label="Or a whole guest list — one name per line" value={c.guests} onChange={set('guests')} rows={4} placeholder={'Sharma family\nAunt Leela & Uncle Vikram\nThe Kapoors'} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-ink-faint">{guests.length ? `${guests.length} guest${guests.length > 1 ? 's' : ''}` : 'No names yet'}{guests.length === 80 ? ' (first 80)' : ''}</span>
              <button className="btn-ghost" disabled={!guests.length || !!busy} onClick={downloadGuests}>
                {busy === 'guests' ? 'Making copies…' : `⤓ ${current.label} for each guest (PDF)`}
              </button>
            </div>
          </div>
        </section>
      </div>
      {toast}
    </div>
  )
}

function EventFields({ e, i, setEvent }) {
  return (
    <>
      <Field label="Ceremony" value={e.name} onChange={setEvent(i, 'name')} />
      <Area label="A line about it" value={e.note} onChange={setEvent(i, 'note')} rows={2} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date" type="date" value={e.date} onChange={setEvent(i, 'date')} />
        <Field label="Time" type="time" value={e.time} onChange={setEvent(i, 'time')} />
      </div>
      <Field label="Venue" value={e.venue} onChange={setEvent(i, 'venue')} />
      <Field label="Dress code (optional)" value={e.dress} onChange={setEvent(i, 'dress')} placeholder="e.g. Shades of yellow" />
    </>
  )
}

function Field({ label, ...props }) {
  return <label className="block"><span className="label">{label}</span><input className="input" {...props} /></label>
}
function Area({ label, rows = 2, ...props }) {
  return <label className="block"><span className="label">{label}</span><textarea className="input" rows={rows} {...props} /></label>
}

function DesignChoice({ d, c, active, onClick, fontsReady }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) drawInvitation(ref.current, d.id, c, { kind: 'main' }) }, [d.id, c.partner_a, c.partner_b, fontsReady]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
            className={`group flex items-center gap-3 rounded-2xl border-2 bg-white p-3 text-left transition ${active ? 'border-blush-600 shadow-lift' : 'border-sand-200 hover:border-blush-300'}`}>
      <canvas ref={ref} width={150} height={210} className="h-24 w-[4.3rem] shrink-0 rounded shadow-card transition group-hover:scale-105" />
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">{d.name}{active && <span className="text-blush-600">✓</span>}</span>
        <span className="mt-0.5 block text-xs text-ink-faint">{d.blurb}</span>
        <span className="mt-2 flex gap-1">{d.swatch.map((s) => <span key={s} className="h-3 w-3 rounded-full border border-black/10" style={{ background: s }} />)}</span>
      </span>
    </button>
  )
}
