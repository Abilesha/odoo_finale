import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { api, date } from '../api'
import { CAP, useAuth } from '../auth'
import { PageHead } from '../components/kit'
import { Card, Empty, ErrorBox, Spinner, Tabs, useToast } from '../components/ui'
import { useApi } from '../hooks'
import { Thread, ago } from './client/ClientHelp'

const KIND_TONE = {
  Complaint: 'bg-rust-100 text-rust-700',
  'Change request': 'bg-gold-100 text-gold-700',
  Query: 'bg-plum-100 text-plum-700',
}

/** Couples' questions and complaints, from the agency's side.
 *  Sorted with what needs an answer first: unanswered complaints, then
 *  urgent, then whoever has waited longest. */
export default function Queries() {
  const { can } = useAuth()
  const founder = can(CAP.TEAM)
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState('open')
  const list = useApi(`/api/tickets${tab === 'all' ? '' : tab === 'Complaint' ? '?kind=Complaint' : `?status=${tab}`}`)
  const [openId, setOpenId] = useState(params.get('ticket') ? Number(params.get('ticket')) : null)
  const one = useApi(openId ? `/api/tickets/${openId}` : null)
  const staff = useApi(founder ? '/api/staff' : null)
  const [reply, setReply] = useState('')
  const [toast, setToast] = useToast()

  useEffect(() => {
    if (list.data?.tickets?.length && !list.data.tickets.some((x) => x.id === openId)) {
      setOpenId(list.data.tickets[0].id)
    }
  }, [list.data]) // eslint-disable-line react-hooks/exhaustive-deps

  if (list.loading && !list.data) return <Spinner label="Opening the inbox" />
  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />

  const c = list.data.counts
  const t = one.data
  const refresh = () => { one.reload(); list.reload() }
  const pick = (id) => { setOpenId(id); setParams({ ticket: id }) }

  async function send(e, resolve = false) {
    e?.preventDefault()
    try {
      if (reply.trim()) await api.post(`/api/tickets/${t.id}/messages`, { message: reply })
      if (resolve) await api.patch(`/api/tickets/${t.id}`, { status: 'Resolved' })
      setReply('')
      setToast({ message: resolve ? `Resolved — ${t.client_name} can rate it now.` : `Sent to ${t.client_name}.` })
      refresh()
    } catch (e2) { setToast({ message: e2.message, tone: 'bad' }) }
  }

  async function patch(body, msg) {
    try { await api.patch(`/api/tickets/${t.id}`, body); setToast({ message: msg }); refresh() }
    catch (e2) { setToast({ message: e2.message, tone: 'bad' }) }
  }

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow={founder ? 'Founder console' : 'Manager workspace'}
        title="Client queries"
        sub={founder
          ? 'Every question and complaint from every couple. A complaint nobody answers is the review that costs the next three bookings.'
          : 'Questions, change requests and complaints from the couples you look after.'}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Open', c.open],
          ['Waiting on us', c.awaiting_us, c.awaiting_us ? 'bad' : 'good'],
          ['Complaints open', c.complaints_open, c.complaints_open ? 'bad' : 'good'],
          ['Resolved', c.resolved],
          ['Couples’ rating', c.avg_rating ? `${c.avg_rating} ★` : '—', 'gold'],
        ].map(([l, v, tone]) => (
          <div key={l} className="card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{l}</p>
            <p className={`tnum mt-1 font-display text-2xl font-semibold ${
              tone === 'bad' ? 'text-rust-700' : tone === 'good' ? 'text-sage-700' : tone === 'gold' ? 'text-gold-600' : 'text-ink'}`}>{v}</p>
          </div>
        ))}
      </div>

      <Tabs active={tab} onChange={(x) => { setTab(x); setOpenId(null) }} tabs={[
        { id: 'open', label: 'Open', count: c.open },
        { id: 'Complaint', label: 'Complaints' },
        { id: 'Resolved', label: 'Resolved', count: c.resolved },
        { id: 'all', label: 'All' },
      ]} />

      {list.data.tickets.length === 0 ? (
        <Empty title="Nothing here" hint={tab === 'open' ? 'Every couple has their answer.' : 'Try another tab.'} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
          <ul className="card divide-y divide-sand-200 self-start overflow-hidden">
            {list.data.tickets.map((x) => (
              <li key={x.id}>
                <button onClick={() => pick(x.id)}
                        className={`block w-full px-4 py-3 text-left transition-colors ${
                          x.id === openId ? 'bg-plum-50' : x.awaiting === 'planner' ? 'bg-rust-100/30 hover:bg-rust-100/50' : 'hover:bg-sand-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span className={`pill ${KIND_TONE[x.kind]}`}>{x.kind}</span>
                      {x.priority === 'Urgent' && x.status !== 'Resolved' && <span className="pill bg-rust-600 text-white">Urgent</span>}
                    </span>
                    <span className={`text-[11px] ${x.awaiting === 'planner' ? 'font-semibold text-rust-700' : 'text-ink-faint'}`}>
                      {x.awaiting === 'planner' ? `waiting ${x.waiting_hours < 1 ? `${Math.round(x.waiting_hours * 60)} min` : `${Math.round(x.waiting_hours)}h`}` : ago(x.updated_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 truncate text-sm font-medium text-ink">{x.subject}</p>
                  <p className="truncate text-[11px] text-ink-faint">
                    {x.couple_name} · {x.topic}{founder && x.assigned_to && ` · ${x.assigned_to}`}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          {t ? (
            <Card title={t.subject}
                  subtitle={`${t.kind} · ${t.topic} · from ${t.client_name} (${t.couple_name}) · ${date(t.created_at)}`}
                  action={
                    <span className="flex flex-wrap items-center gap-2">
                      {t.wedding_id && <Link to={`/weddings/${t.wedding_id}`} className="btn-ghost btn-sm">Wedding file</Link>}
                      {t.client_phone && <a href={`tel:${t.client_phone}`} className="btn-ghost btn-sm">Call</a>}
                    </span>
                  }>
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
                <select className="rounded-md border border-sand-300 bg-white px-2 py-1" value={t.status}
                        onChange={(e) => patch({ status: e.target.value }, `Marked ${e.target.value.toLowerCase()}.`)}>
                  {['Open', 'In Progress', 'Resolved'].map((s) => <option key={s}>{s}</option>)}
                </select>
                <select className="rounded-md border border-sand-300 bg-white px-2 py-1" value={t.priority}
                        onChange={(e) => patch({ priority: e.target.value }, `Priority ${e.target.value.toLowerCase()}.`)}>
                  {['Normal', 'Urgent'].map((s) => <option key={s}>{s}</option>)}
                </select>
                {founder && (
                  <select className="rounded-md border border-sand-300 bg-white px-2 py-1" value={t.assigned_to_id || ''}
                          onChange={(e) => patch({ assigned_to_id: Number(e.target.value) }, 'Handed over.')}>
                    {(staff.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
                {t.rating && <span className="pill bg-gold-100 text-gold-700">Rated {'★'.repeat(t.rating)}{t.rating_note && ` — “${t.rating_note}”`}</span>}
              </div>
              <Thread messages={t.messages} mineKind="staff" />
              <form onSubmit={send} className="mt-5 space-y-2 border-t border-sand-200 pt-4">
                <textarea rows={3} className="input" value={reply} onChange={(e) => setReply(e.target.value)}
                          placeholder={`Reply to ${t.client_name}…`} />
                <div className="flex flex-wrap justify-end gap-2">
                  {t.status !== 'Resolved' && (
                    <button type="button" className="btn-ghost" onClick={(e) => send(e, true)}>
                      {reply.trim() ? 'Send and resolve' : 'Mark resolved'}
                    </button>
                  )}
                  <button className="btn-primary" disabled={!reply.trim()}>Send reply</button>
                </div>
              </form>
            </Card>
          ) : <Spinner label="Opening" />}
        </div>
      )}
      {toast}
    </div>
  )
}
