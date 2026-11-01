import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { api, date } from '../../api'
import { Card, Empty, ErrorBox, Modal, Spinner, useToast } from '../../components/ui'
import { useApi } from '../../hooks'
import { ClientHead, PlannerCard } from './shared'

const KINDS = [
  { id: 'Query', blurb: 'A question about anything', tone: 'border-plum-300 bg-plum-50' },
  { id: 'Change request', blurb: 'Something you would like done differently', tone: 'border-gold-300 bg-gold-50' },
  { id: 'Complaint', blurb: 'Something has gone wrong', tone: 'border-blush-400 bg-blush-50' },
]
const TOPICS = ['Planning', 'Vendors', 'Payments', 'Schedule', 'Agreement', 'Other']

const STATUS_TONE = {
  Open: 'bg-gold-100 text-gold-700',
  'In Progress': 'bg-plum-100 text-plum-700',
  Resolved: 'bg-sage-100 text-sage-700',
}

export const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 1440) return `${Math.round(m / 60)}h ago`
  return date(iso, { year: false })
}

/** The conversation itself — shared by the couple's view and the staff's. */
export function Thread({ messages, mineKind }) {
  return (
    <ol className="space-y-3">
      {messages.map((m) => {
        const mine = m.author_kind === mineKind
        return (
          <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
              mine ? 'rounded-br-md bg-blush-700 text-white' : 'rounded-bl-md bg-sand-100 text-ink'}`}>
              <p className="whitespace-pre-line text-sm">{m.body}</p>
              <p className={`mt-1 text-[10px] ${mine ? 'text-blush-200' : 'text-ink-faint'}`}>{m.author_name} · {ago(m.created_at)}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Stars({ value, onPick }) {
  return (
    <span className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onPick} onClick={() => onPick?.(n)}
                className={`text-2xl leading-none transition-transform ${onPick ? 'hover:scale-110' : ''} ${
                  n <= (value || 0) ? 'text-gold-500' : 'text-sand-300'}`}>★</button>
      ))}
    </span>
  )
}

/** Queries, change requests and complaints — each goes to the couple's
 *  planner, and complaints reach the founder too. */
export default function ClientHelp() {
  const [params, setParams] = useSearchParams()
  const list = useApi('/api/client/tickets')
  const [openId, setOpenId] = useState(params.get('ticket') ? Number(params.get('ticket')) : null)
  const one = useApi(openId ? `/api/client/tickets/${openId}` : null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ kind: 'Query', topic: 'Planning', subject: '', message: '', urgent: false })
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [toast, setToast] = useToast()

  useEffect(() => {
    if (!openId && list.data?.tickets?.length) setOpenId(list.data.tickets[0].id)
  }, [list.data, openId])

  if (list.loading) return <Spinner label="Loading your conversations" />
  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />

  const t = one.data
  const pick = (id) => { setOpenId(id); setParams({ ticket: id }) }

  async function create(e) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const res = await api.post('/api/client/tickets', form)
      setCreating(false)
      setForm({ kind: 'Query', topic: 'Planning', subject: '', message: '', urgent: false })
      setToast({ message: res.detail }); list.reload(); pick(res.id)
    } catch (e2) { setErr(e2) } finally { setBusy(false) }
  }

  async function send(e) {
    e.preventDefault()
    if (!reply.trim()) return
    try {
      await api.post(`/api/client/tickets/${t.id}/messages`, { message: reply })
      setReply(''); one.reload(); list.reload()
    } catch (e2) { setToast({ message: e2.message, tone: 'bad' }) }
  }

  async function rate(n) {
    try {
      const res = await api.post(`/api/client/tickets/${t.id}/rate`, { rating: n })
      setToast({ message: res.detail }); one.reload(); list.reload()
    } catch (e2) { setToast({ message: e2.message, tone: 'bad' }) }
  }

  const tickets = list.data.tickets

  return (
    <div className="space-y-6">
      <ClientHead eyebrow="Help" title="Questions & complaints"
                  sub="Ask anything, ask for a change, or tell us when something has gone wrong. Your planner answers here — complaints go to the founder too."
                  action={<button className="btn bg-blush-700 text-white hover:bg-blush-800" onClick={() => setCreating(true)}>+ New message</button>} />

      {tickets.length === 0 ? (
        <>
          <Empty title="Nothing asked yet" hint="When you have a question, it starts here — and the answer stays here."
                 action={<button className="btn mt-3 bg-blush-700 text-white" onClick={() => setCreating(true)}>Ask your planner</button>} />
          <PlannerCard planner={list.data.planner} />
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
          <ul className="card divide-y divide-sand-200 self-start overflow-hidden">
            {tickets.map((x) => (
              <li key={x.id}>
                <button onClick={() => pick(x.id)}
                        className={`block w-full px-4 py-3 text-left transition-colors ${x.id === openId ? 'bg-blush-50' : 'hover:bg-sand-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`pill ${STATUS_TONE[x.status]}`}>{x.status}</span>
                    <span className="text-[11px] text-ink-faint">{ago(x.updated_at)}</span>
                  </div>
                  <p className="mt-1.5 truncate text-sm font-medium text-ink">{x.subject}</p>
                  <p className="text-[11px] text-ink-faint">
                    {x.kind} · {x.topic}
                    {x.awaiting === 'couple' && <span className="font-semibold text-blush-700"> · your planner replied</span>}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          {t ? (
            <Card title={t.subject}
                  subtitle={`${t.kind} · ${t.topic} · with ${t.assigned_to || 'your planner'} · opened ${date(t.created_at)}`}
                  action={<span className={`pill ${STATUS_TONE[t.status]}`}>{t.status}</span>}>
              <Thread messages={t.messages} mineKind="client" />
              {t.status === 'Resolved' && (
                <div className="mt-5 rounded-xl bg-sage-100 p-4 text-sm text-sage-700">
                  <p className="font-medium">Resolved {date(t.resolved_at)}.</p>
                  {t.rating ? (
                    <p className="mt-1 flex items-center gap-2">You rated it <Stars value={t.rating} /></p>
                  ) : (
                    <p className="mt-1 flex flex-wrap items-center gap-2">How did we do? <Stars value={0} onPick={rate} /></p>
                  )}
                  <p className="mt-1 text-xs opacity-80">Not sorted after all? Reply below and it reopens.</p>
                </div>
              )}
              <form onSubmit={send} className="mt-5 flex gap-2 border-t border-sand-200 pt-4">
                <input className="input flex-1" value={reply} onChange={(e) => setReply(e.target.value)}
                       placeholder={t.status === 'Resolved' ? 'Reply to reopen…' : 'Write a reply…'} />
                <button className="btn bg-blush-700 text-white hover:bg-blush-800" disabled={!reply.trim()}>Send</button>
              </form>
            </Card>
          ) : <Spinner label="Opening" />}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} wide title="Message your planner"
             subtitle="It goes straight to them. A complaint also goes to the founder.">
        <form onSubmit={create} className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {KINDS.map((k) => (
              <button type="button" key={k.id} onClick={() => setForm((f) => ({ ...f, kind: k.id }))}
                      className={`rounded-xl border-2 p-3 text-left transition-all ${form.kind === k.id ? k.tone : 'border-sand-200 hover:border-sand-300'}`}>
                <p className="text-sm font-semibold text-ink">{k.id}</p>
                <p className="text-[11px] text-ink-faint">{k.blurb}</p>
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <div>
              <label className="label">About</label>
              <select className="input" value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}>
                {TOPICS.map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
            <div>
              <label className="label">In a line</label>
              <input className="input" required minLength={3} value={form.subject}
                     onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                     placeholder={form.kind === 'Complaint' ? 'The photographer hasn’t replied in a week' : 'Can we add a Jain counter at the Sangeet?'} />
            </div>
          </div>
          <div>
            <label className="label">Tell us more</label>
            <textarea required minLength={3} rows={4} className="input" value={form.message}
                      onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
          </div>
          {form.kind !== 'Complaint' && (
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" checked={form.urgent} onChange={(e) => setForm((f) => ({ ...f, urgent: e.target.checked }))}
                     className="h-4 w-4 accent-blush-600" />
              This is urgent
            </label>
          )}
          <ErrorBox error={err} />
          <div className="flex justify-end gap-2 border-t border-sand-200 pt-4">
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button className="btn bg-blush-700 text-white hover:bg-blush-800" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
          </div>
        </form>
      </Modal>
      {toast}
    </div>
  )
}
