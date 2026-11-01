import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { api } from '../api'
import { useAuth } from '../auth'
import { useApi } from '../hooks'

/** The assistant — ask about your weddings in plain words.
 *
 *  The founder and each manager get their own: the same page, but the server
 *  searches only the records that person may open, so a manager's assistant
 *  simply does not know about another manager's couples.
 */
const LOOK = {
  founder: { hero: 'from-plum-900 via-plum-800 to-plum-700', me: 'bg-plum-700 text-white', chip: 'hover:border-plum-400 hover:bg-plum-50', send: 'bg-plum-700 hover:bg-plum-800', name: 'Founder assistant' },
  manager: { hero: 'from-night-900 via-night-800 to-night-700', me: 'bg-night-700 text-white', chip: 'hover:border-night-400 hover:bg-night-50', send: 'bg-night-700 hover:bg-night-800', name: 'Manager assistant' },
}

export default function Assistant() {
  const { user, portal } = useAuth()
  const look = LOOK[portal] || LOOK.manager
  const meta = useApi('/api/assistant')
  const key = `rk.assistant.${user?.id}`
  const [chat, setChat] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(key) || '[]') } catch { return [] }
  })
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef(null)
  const input = useRef(null)

  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(chat.slice(-30))) } catch { /* ignore */ } }, [chat, key])
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [chat, busy])

  async function ask(text) {
    const question = (text ?? q).trim()
    if (!question || busy) return
    setQ('')
    const history = chat.map((m) => ({ role: m.role, text: m.text }))
    setChat((c) => [...c, { role: 'user', text: question }])
    setBusy(true)
    try {
      const res = await api.post('/api/assistant/ask', { question, history })
      setChat((c) => [...c, { role: 'assistant', text: res.answer, sources: res.sources, mode: res.mode, searched: res.searched }])
    } catch (e) {
      setChat((c) => [...c, { role: 'assistant', text: `Sorry — ${e.message}`, error: true }])
    } finally {
      setBusy(false)
      input.current?.focus()
    }
  }

  const ai = meta.data?.ai
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 lg:h-[calc(100vh-4rem)]">
      <header className={`relative overflow-hidden rounded-2xl bg-gradient-to-br p-6 text-sand-50 ${look.hero}`}>
        <span className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-gold-400/20 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Sparkle />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-300">{look.name}</p>
              <h1 className="font-display text-3xl text-white">Ask about your weddings</h1>
              <p className="mt-1 max-w-xl text-sm text-sand-50/75">Searches {meta.data?.scope || 'your records'} — live, every time you ask.</p>
            </div>
          </div>
          {meta.data && (
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${ai ? 'bg-sage-100 text-sage-700' : 'bg-white/15 text-sand-50'}`}
                  title={ai ? 'Answers are written by Claude from your records' : 'No AI key is set — answers are worked out directly from your records'}>
              <span className={`h-2 w-2 rounded-full ${ai ? 'bg-sage-600' : 'bg-gold-300'}`} />{ai ? 'AI connected' : 'Answering from your records'}
            </span>
          )}
        </div>
      </header>

      <section className="card flex min-h-[24rem] flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-5 overflow-y-auto p-5" aria-live="polite">
          {chat.length === 0 && (
            <div className="py-6 text-center">
              <p className="font-display text-2xl text-ink">What would you like to know?</p>
              <p className="mt-1 text-sm text-ink-faint">Try one of these, or name a couple, a wedding code or a vendor.</p>
              <div className="mx-auto mt-5 grid max-w-2xl gap-2 sm:grid-cols-2">
                {(meta.data?.suggestions || []).map((s) => (
                  <button key={s} onClick={() => ask(s)} className={`rounded-xl border border-sand-200 bg-white px-4 py-3 text-left text-sm text-ink-soft transition ${look.chip}`}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {chat.map((m, i) => (m.role === 'user' ? (
            <div key={i} className="flex justify-end"><p className={`max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm ${look.me}`}>{m.text}</p></div>
          ) : (
            <div key={i} className="flex gap-3">
              <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700">✦</span>
              <div className="min-w-0 max-w-[85%] space-y-2">
                <div className={`rounded-2xl rounded-tl-md px-4 py-3 text-sm leading-relaxed ${m.error ? 'bg-rust-100 text-rust-700' : 'bg-sand-100 text-ink'}`}><Rich text={m.text} /></div>
                {m.sources?.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-ink-faint">From</span>
                    {m.sources.map((s, j) => (s.link
                      ? <Link key={j} to={s.link} className="pill border border-sand-200 bg-white text-ink-soft hover:border-gold-400">{s.title}</Link>
                      : <span key={j} className="pill border border-sand-200 bg-white text-ink-faint">{s.title}</span>))}
                  </div>
                )}
                {m.searched != null && <p className="text-[10px] text-ink-faint">Searched {m.searched} records{m.mode === 'ai' ? ' · written by Claude' : ''}</p>}
              </div>
            </div>
          )))}
          {busy && (
            <div className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700">✦</span>
              <span className="flex items-center gap-1 rounded-2xl bg-sand-100 px-4 py-3">
                {[0, 1, 2].map((k) => <span key={k} className="h-2 w-2 animate-bounce rounded-full bg-ink-faint" style={{ animationDelay: `${k * 120}ms` }} />)}
              </span>
            </div>
          )}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); ask() }} className="flex items-end gap-2 border-t border-sand-200 bg-sand-50 p-3">
          <textarea ref={input} rows={1} value={q} onChange={(e) => setQ(e.target.value)} maxLength={600}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }}
                    placeholder="e.g. What's overdue for Krish & Nitara?" aria-label="Your question"
                    className="input max-h-32 min-h-[2.75rem] flex-1 resize-none py-2.5" />
          {chat.length > 0 && <button type="button" onClick={() => setChat([])} className="btn-ghost h-11" title="Start a new conversation">New</button>}
          <button className={`btn h-11 px-5 text-white ${look.send}`} disabled={!q.trim() || busy}>Ask</button>
        </form>
      </section>
    </div>
  )
}

/** **bold**, bullet lines and line breaks — nothing else, and no raw HTML. */
function Rich({ text }) {
  const inline = (s, key) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**')
    ? <strong key={`${key}-${i}`} className="font-semibold">{part.slice(2, -2)}</strong> : part))
  const blocks = []
  let list = null
  String(text || '').split('\n').forEach((line, i) => {
    const m = line.match(/^\s*[-•]\s+(.*)$/)
    if (m) {
      if (!list) { list = []; blocks.push(list) }
      list.push(<li key={i}>{inline(m[1], i)}</li>)
    } else {
      list = null
      if (line.trim()) blocks.push(<p key={i}>{inline(line, i)}</p>)
    }
  })
  return <div className="space-y-1.5">{blocks.map((b, i) => (Array.isArray(b) ? <ul key={`u${i}`} className="list-disc space-y-1 pl-5">{b}</ul> : b))}</div>
}

function Sparkle() {
  return (
    <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
      <svg viewBox="0 0 24 24" className="h-7 w-7 animate-[spin_12s_linear_infinite] text-gold-300" fill="currentColor" aria-hidden>
        <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" />
      </svg>
    </span>
  )
}
