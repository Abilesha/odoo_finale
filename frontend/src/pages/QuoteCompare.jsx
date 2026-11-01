import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { api, inr, num } from '../api'
import { Card, ErrorBox, Modal, Pill, Spinner, StatusPill, useToast } from '../components/ui'
import { useApi } from '../hooks'

/** Scene 2 — three caterers, one decision.
 *
 *  Today each vendor sends a differently-shaped PDF on WhatsApp and the
 *  planner compares them by hand at midnight.  Here every quote is reduced to
 *  the same three honest numbers — landed total, cost per plate, and how much
 *  of the requested scope it actually covers — and laid out line by line. */
export default function QuoteCompare() {
  const { id } = useParams()
  const { data, error, loading, reload } = useApi(`/api/rfqs/${id}/comparison`)
  const [awarding, setAwarding] = useState(null)
  const [advance, setAdvance] = useState(30)
  const [busy, setBusy] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [picked, setPicked] = useState([])
  const [toastNode, setToast] = useToast()

  // the couple's shortlist: what was sent, or the best three by value
  useEffect(() => {
    if (!data) return
    setPicked(data.shortlist?.length ? data.shortlist : data.suggested_shortlist || [])
  }, [data])

  if (loading) return <Spinner label="Normalising the quotes" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const { quotes, matrix_rows: rows, guest_count: guests } = data
  const awarded = data.status === 'Awarded'
  const cheapest = quotes.find((q) => q.quote_id === data.cheapest_quote_id)
  const best = quotes.find((q) => q.quote_id === data.best_value_quote_id)
  const gap = cheapest && best && best.quote_id !== cheapest.quote_id
    ? best.landed_total - cheapest.landed_total : 0

  async function award() {
    setBusy(true)
    try {
      const res = await api.post(`/api/rfqs/${id}/award`, {
        quote_id: awarding.quote_id, advance_percent: Number(advance) || 0,
      })
      setAwarding(null)
      setToast({ message: res.detail })
      reload()
    } catch (e) {
      setToast({ message: e.message, tone: 'bad' })
    } finally { setBusy(false) }
  }

  /** Hand the decision to the couple.
   *
   *  The brief has the couple picking the winner, not the planner, so this is
   *  the normal path — the planner shortlists and advises, the couple chooses
   *  on their phone, and their pick runs the same award.  The Award buttons
   *  below stay for the case where the couple decides in the room. */
  async function shareWithCouple() {
    setSharing(true)
    try {
      const res = await api.post(`/api/rfqs/${id}/share`, { quote_ids: picked })
      const url = `${window.location.origin}${res.choose_url}`
      try { await navigator.clipboard.writeText(url) } catch { /* no clipboard */ }
      setToast({ message: `${res.detail} Link copied.` })
      reload()
    } catch (e) {
      setToast({ message: e.message, tone: 'bad' })
    } finally { setSharing(false) }
  }

  /** Find a vendor's line for a row.
   *  Matched on the canonical key, not the raw text — vendors word the same
   *  course differently and comparing strings would wrongly show "not quoted". */
  const lineFor = (quote, key) => quote.lines.find((l) => l.key === key) || null
  const rank = (qid) => (data.ranking || []).indexOf(qid) + 1
  const togglePick = (qid) => setPicked((p) =>
    p.includes(qid) ? p.filter((x) => x !== qid) : p.length >= 3 ? p : [...p, qid])
  const sent = data.shortlist || []

  return (
    <div className="space-y-6">
      {toastNode}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Link to={`/weddings/${data.wedding_id}`}
                  className="text-xs text-plum-600 hover:underline">
              ← {data.wedding_code}
            </Link>
            <StatusPill status={data.status} />
          </div>
          <h1 className="text-3xl text-ink">{data.title}</h1>
          <p className="mt-1 text-sm text-ink-faint">
            {quotes.length} quotes received · {num(guests)} guests · every figure normalised
            to the same basis
          </p>
        </div>
      </header>

      {/* ---- who was asked, and who has answered ---- */}
      {data.invited?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.invited.map((x) => (
            <span key={x.quote_id} title={x.note || ''}
                  className={`pill ${x.status === 'Declined' ? 'bg-rust-100 text-rust-700'
                    : x.status === 'Awaiting Reply' ? 'bg-sand-200 text-ink-soft'
                    : x.status === 'Awarded' ? 'bg-sage-100 text-sage-700' : 'bg-plum-50 text-plum-700'}`}>
              {x.vendor_name} · {x.status === 'Awaiting Reply' ? 'waiting for their price' : x.status.toLowerCase()}
              {x.note && ` — ${x.note.replace('Declined by vendor: ', '')}`}
            </span>
          ))}
        </div>
      )}

      {/* ---- the couple's decision ----
           "When the couple picks a winner, the other two requests should
           close on their own." So this strip is the normal route: send the
           shortlist, and show their answer when it comes back. */}
      {(() => {
        const ch = data.choice || {}
        if (ch.chosen_at) {
          const who = quotes.find((q) => q.quote_id === ch.chosen_quote_id)
          return (
            <div className="card border-sage-400/40 bg-sage-100 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <Pill tone="good">Chosen by the couple</Pill>
                  <p className="mt-2 font-display text-xl text-sage-700">
                    {who?.vendor_name || 'Vendor'} — confirmed by {ch.chosen_by_name}
                  </p>
                  <p className="mt-1 text-sm text-sage-700">
                    The other quotes closed automatically and the vendor is linked
                    to {data.wedding_code}.
                  </p>
                  {ch.couple_note && (
                    <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-[13px] italic text-sage-700">
                      “{ch.couple_note}”
                    </p>
                  )}
                </div>
                {who && (
                  <div className="text-right">
                    <p className="text-xs text-sage-700/80">Agreed</p>
                    <p className="tnum font-display text-2xl font-semibold text-sage-700">
                      {inr(who.landed_total)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )
        }
        if (awarded) return null
        const changed = ch.awaiting_couple && [...picked].sort().join() !== [...sent].sort().join()
        return (
          <div className="card border-plum-200 bg-plum-50 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-xl">
                <p className="font-display text-lg text-ink">
                  {ch.awaiting_couple ? 'Top 3 is with the couple' : 'Send the couple your top 3'}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {ch.awaiting_couple
                    ? 'They are choosing on their phone. Their pick closes every other quote and contracts the winner automatically.'
                    : 'Ticked below are the three best by value — scope covered, reliability and price. Swap one if you know better. The couple sees prices, inclusions and punctuality, not your recommendation.'}
                </p>
                {ch.awaiting_couple && ch.choose_url && (
                  <a href={ch.choose_url} target="_blank" rel="noreferrer"
                     className="mt-2 inline-block text-xs text-plum-600 underline underline-offset-2 hover:text-plum-700">
                    Open the couple’s view ↗
                  </a>
                )}
              </div>
              <button onClick={shareWithCouple} disabled={sharing || picked.length < 2}
                      className="btn-primary shrink-0 disabled:opacity-50">
                {sharing ? 'Preparing…'
                  : changed ? `Update the shortlist (${picked.length})`
                  : ch.awaiting_couple ? 'Copy the link again'
                  : `Send top ${picked.length} to the couple`}
              </button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {[...quotes].sort((a, b) => rank(a.quote_id) - rank(b.quote_id)).map((q) => {
                const on = picked.includes(q.quote_id)
                const full = !on && picked.length >= 3
                return (
                  <button key={q.quote_id} type="button" onClick={() => togglePick(q.quote_id)} disabled={full}
                          className={`flex items-center gap-3 rounded-xl border-2 bg-white p-3 text-left transition-all ${
                            on ? 'border-plum-500 shadow-card' : 'border-sand-200 opacity-70 hover:opacity-100'} disabled:cursor-not-allowed`}>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-xs ${
                      on ? 'border-plum-600 bg-plum-600 text-white' : 'border-sand-300'}`}>{on && '✓'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{q.vendor_name}</span>
                      <span className="block text-[11px] text-ink-faint">
                        #{rank(q.quote_id)} by value · {inr(q.landed_total, { compact: true })} · {q.inclusion_score}% scope
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[11px] text-ink-faint">{picked.length} of 3 picked{picked.length < 2 && ' — pick at least two'}</p>
          </div>
        )
      })()}

      {/* ---- the recommendation (the planner's own read, never shown to the
           couple — it is advice to give, not a label that pre-empts them) ---- */}
      {!awarded && best && (
        <div className="card border-gold-300 bg-gold-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <Pill tone="gold">Recommended</Pill>
              <p className="mt-2 font-display text-xl text-ink">{best.vendor_name}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                {gap > 0 ? (
                  <>
                    {inr(gap, { compact: true })} more than {cheapest.vendor_name}, but covers{' '}
                    <strong>{best.inclusion_score}%</strong> of the requested scope against{' '}
                    <strong>{cheapest.inclusion_score}%</strong>. The cheaper quote excludes{' '}
                    {cheapest.exclusions.length} items that would be billed later at actuals.
                  </>
                ) : (
                  <>Lowest landed cost <em>and</em> the widest scope coverage at {best.inclusion_score}%.</>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-ink-faint">Landed total</p>
              <p className="tnum font-display text-2xl font-semibold text-ink">
                {inr(best.landed_total)}
              </p>
              <p className="tnum text-xs text-ink-faint">{inr(best.cost_per_plate)} per plate</p>
            </div>
          </div>
        </div>
      )}

      {/* ---- headline comparison ---- */}
      <div className={`grid gap-4 lg:grid-cols-2 ${quotes.length > 3 ? '2xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
        {quotes.map((q) => {
          const isBest = q.quote_id === data.best_value_quote_id
          const isCheap = q.quote_id === data.cheapest_quote_id
          const onShortlist = sent.includes(q.quote_id)
          const won = q.status === 'Awarded'
          const lost = q.status === 'Rejected'
          return (
            <article key={q.quote_id}
              className={`card relative p-5 transition-all ${
                won ? 'border-sage-400 ring-2 ring-sage-400/30'
                  : lost ? 'opacity-55'
                  : isBest ? 'border-gold-300 ring-2 ring-gold-200' : ''}`}>

              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg leading-tight text-ink">{q.vendor_name}</h3>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    ★ {q.vendor_rating} · {q.vendor_on_time_pct}% on time · #{rank(q.quote_id)} by value
                  </p>
                  {onShortlist && !won && !lost && (
                    <p className="mt-1 text-[11px] font-medium text-plum-700">★ On the couple’s shortlist</p>
                  )}
                </div>
                <StatusPill status={q.status} />
              </div>

              <div className="space-y-2 border-y border-sand-200 py-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-ink-faint">Landed total</span>
                  <span className="tnum font-display text-xl font-semibold text-ink">
                    {inr(q.landed_total)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-ink-faint">Cost per plate</span>
                  <span className="tnum text-sm font-medium text-plum-700">
                    {inr(q.cost_per_plate)}
                  </span>
                </div>
              </div>

              <dl className="space-y-1.5 py-3 text-xs">
                {[
                  ['Line items', inr(q.subtotal)],
                  ['Logistics / setup', q.logistics_fee ? inr(q.logistics_fee) : 'included'],
                  [`GST @ ${q.gst_percent}%`, inr(q.gst_amount)],
                  ['Extra hour rate', q.extra_hour_rate ? inr(q.extra_hour_rate) : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-ink-faint">{k}</dt>
                    <dd className="tnum text-ink-soft">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="border-t border-sand-200 pt-3">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-ink-faint">Scope covered</span>
                  <span className={`tnum font-medium ${
                    q.inclusion_score >= 80 ? 'text-sage-700'
                      : q.inclusion_score >= 55 ? 'text-gold-700' : 'text-rust-700'}`}>
                    {q.inclusion_score}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-sand-200">
                  <div className={`h-full rounded-full ${
                    q.inclusion_score >= 80 ? 'bg-sage-400'
                      : q.inclusion_score >= 55 ? 'bg-gold-400' : 'bg-rust-400'}`}
                    style={{ width: `${q.inclusion_score}%` }} />
                </div>
                {q.exclusions.length > 0 && (
                  <div className="mt-2.5">
                    <p className="text-[11px] font-medium text-rust-700">
                      Excludes {q.exclusions.length}:
                    </p>
                    <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-ink-faint">
                      {q.exclusions.slice(0, 4).map((x) => <li key={x}>· {x}</li>)}
                      {q.exclusions.length > 4 && <li>· +{q.exclusions.length - 4} more</li>}
                    </ul>
                  </div>
                )}
              </div>

              {q.notes && (
                <p className="mt-3 rounded-md bg-sand-50 p-2.5 text-[11px] leading-relaxed text-ink-soft">
                  {q.notes}
                </p>
              )}

              <div className="mt-4 flex items-center gap-1.5">
                {isCheap && <Pill tone="info">Cheapest</Pill>}
                {isBest && !won && <Pill tone="gold">Best value</Pill>}
              </div>

              {!awarded && (
                <button onClick={() => setAwarding(q)}
                        className={`mt-3 w-full ${isBest ? 'btn-gold' : 'btn-ghost'}`}>
                  Award to {q.vendor_name.split(' ')[0]}
                </button>
              )}
            </article>
          )
        })}
      </div>

      {/* ---- line by line ---- */}
      <Card title="Line by line" pad={false}
            subtitle="Blank means that vendor did not quote the item at all — which is exactly what gets missed on a phone screen">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-sand-50">
              <tr>
                <th className="th w-[34%]">Item</th>
                {quotes.map((q) => (
                  <th key={q.quote_id} className="th text-right">{q.vendor_name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const vals = quotes.map((q) => lineFor(q, row.key))
                const present = vals.filter(Boolean).map((l) => l.line_total)
                const low = present.length > 1 ? Math.min(...present) : null
                return (
                  <tr key={row.key} className={`hover:bg-sand-50 ${row.partial ? 'bg-rust-100/25' : ''}`}>
                    <td className="td text-ink-soft">
                      {row.label}
                      {row.partial && (
                        <span className="mt-0.5 block text-[11px] font-medium text-rust-700">
                          only {row.quoted_by} of {quotes.length} quoted this
                        </span>
                      )}
                    </td>
                    {vals.map((line, i) => (
                      <td key={i} className="td text-right">
                        {line ? (
                          <>
                            <span className={`tnum font-medium ${
                              line.line_total === low ? 'text-sage-700' : 'text-ink'}`}>
                              {inr(line.line_total)}
                            </span>
                            {line.unit !== 'flat' && (
                              <span className="tnum block text-[11px] text-ink-faint">
                                {inr(line.unit_price)} {line.unit}
                              </span>
                            )}
                            {/* the vendor's own wording, when it differs from the row label */}
                            {line.description !== row.label && (
                              <span className="mt-0.5 block text-[10px] italic leading-tight text-ink-faint">
                                “{line.description}”
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-rust-400">not quoted</span>
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
              <tr className="bg-sand-50 font-semibold">
                <td className="td">Landed total (incl. logistics &amp; GST)</td>
                {quotes.map((q) => (
                  <td key={q.quote_id} className="td tnum text-right">{inr(q.landed_total)}</td>
                ))}
              </tr>
              <tr className="bg-plum-50">
                <td className="td font-semibold text-plum-700">Cost per plate</td>
                {quotes.map((q) => (
                  <td key={q.quote_id} className="td tnum text-right font-semibold text-plum-700">
                    {inr(q.cost_per_plate)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* ---- award confirmation ---- */}
      <Modal open={!!awarding} onClose={() => setAwarding(null)}
             title={`Award to ${awarding?.vendor_name}`}
             subtitle="Three things happen at once">
        <div className="space-y-4">
          <ul className="space-y-2 rounded-lg border border-plum-200 bg-plum-50 p-4 text-sm text-plum-700">
            <li>1. This quote is marked awarded at {inr(awarding?.landed_total)}.</li>
            <li>2. The other {quotes.length - 1} requests close on their own — nobody has to remember to decline them.</li>
            <li>3. A vendor contract is created and linked to {data.wedding_code}, carrying the agreed amount that the final bill will be matched against.</li>
          </ul>
          <div>
            <label className="label">Advance to release now (%)</label>
            <input type="number" min="0" max="100" className="input"
                   value={advance} onChange={(e) => setAdvance(e.target.value)} />
            <p className="tnum mt-1.5 text-xs text-ink-faint">
              {inr((awarding?.landed_total || 0) * (Number(advance) || 0) / 100)} released
              on signing · recorded so it is netted off the final bill automatically.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setAwarding(null)} className="btn-ghost">Cancel</button>
            <button onClick={award} disabled={busy} className="btn-gold">
              {busy ? 'Awarding…' : 'Confirm award'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
