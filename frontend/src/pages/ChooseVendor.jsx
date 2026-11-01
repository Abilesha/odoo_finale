import { useState } from 'react'
import { useParams } from 'react-router-dom'

import { api, date, inr, num } from '../api'
import { BackButton } from '../components/kit'
import { ErrorBox, Spinner } from '../components/ui'
import { useApi } from '../hooks'

/** Scene 2, the couple's half.
 *
 *  The brief: "The planner should see all three quotes side by side ... When
 *  the couple picks a winner, the other two requests should close on their
 *  own, and the chosen vendor should be linked straight to that wedding."
 *
 *  So this is the couple's screen, opened from a link on their phone with no
 *  account. It deliberately shows less than the planner's version: the price
 *  they will pay, what is and is not included, and how reliable each vendor
 *  has been — but not the agency's own value score or recommendation. That is
 *  advice the planner gives in person, not a label that pre-empts the choice.
 */
export default function ChooseVendor() {
  const { token } = useParams()
  const { data, error, loading, reload } = useApi(`/api/choose/${token}`)

  const [picked, setPicked] = useState(null)   // quote_id being considered
  const [confirming, setConfirming] = useState(false)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [justDone, setJustDone] = useState(null)

  if (loading) return <Spinner label="Opening your quotes" />
  if (error) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorBox error={error} onRetry={reload} />
      </div>
    )
  }

  const cards = data.cards || []
  const cheapest = cards.length ? Math.min(...cards.map((c) => c.landed_total)) : 0
  const decided = data.decided || !!justDone

  async function confirm(e) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const res = await api.post(`/api/choose/${token}`, {
        quote_id: picked,
        chosen_by_name: name.trim(),
        note: note.trim() || null,
      })
      setJustDone(res)
      setConfirming(false)
      reload()
    } catch (e2) {
      setErr(e2)
    } finally {
      setBusy(false)
    }
  }

  const chosenCard = cards.find((c) => c.quote_id === data.chosen_quote_id)

  return (
    <div className="min-h-screen bg-sand-100 pb-28">
      <header className="relative bg-plum-900 px-5 py-6 text-center">
        <BackButton fallback="/" tone="dark" className="absolute left-5 top-5" />
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-gold-400 font-display text-xl font-bold text-plum-900">
          R
        </div>
        <p className="font-display text-xl text-sand-50">The Royal Knot</p>
        <p className="text-[10px] uppercase tracking-widest text-plum-300">
          Choose your {data.category?.toLowerCase()}
        </p>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 p-4">
        {/* what they are choosing */}
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wider text-ink-faint">Prepared for</p>
          <h1 className="mt-1 font-display text-2xl text-ink">{data.couple_name}</h1>
          <p className="mt-2 text-sm text-ink-soft">{data.title}</p>
          {data.scope && (
            <p className="mt-3 border-t border-sand-200 pt-3 text-[13px] leading-relaxed text-ink-soft">
              {data.scope}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-sand-200 pt-4">
            <div>
              <p className="text-xs text-ink-faint">Guests</p>
              <p className="tnum mt-0.5 text-sm font-medium text-ink">{num(data.guest_count)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">{data.shortlisted ? 'Your planner’s shortlist' : 'Quotes'}</p>
              <p className="tnum mt-0.5 text-sm font-medium text-ink">
                {data.shortlisted ? `Top ${cards.length}` : cards.length}
              </p>
            </div>
            {data.needed_by && (
              <div>
                <p className="text-xs text-ink-faint">Decision needed by</p>
                <p className="mt-0.5 text-sm font-medium text-ink">{date(data.needed_by)}</p>
              </div>
            )}
          </div>
        </div>

        {decided ? (
          <div className="card border-sage-400/40 bg-sage-100 p-6 text-center">
            <p className="text-2xl">✓</p>
            <p className="mt-2 font-display text-2xl text-sage-700">
              {justDone?.vendor || data.chosen_vendor} is confirmed
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-sage-700">
              {justDone?.detail
                || `Chosen by ${data.chosen_by_name}. The other quotes have been closed and your planner has been notified.`}
            </p>
            {chosenCard && (
              <p className="tnum mt-3 text-sm font-semibold text-sage-700">
                {inr(chosenCard.landed_total)} · {inr(chosenCard.cost_per_plate)} per plate
              </p>
            )}
            {data.chosen_at && (
              <p className="mt-2 text-xs text-sage-700/80">{date(data.chosen_at)}</p>
            )}
            {data.couple_note && (
              <p className="mx-auto mt-4 max-w-md rounded-lg bg-white/70 px-4 py-3 text-left text-[13px] italic leading-relaxed text-sage-700">
                “{data.couple_note}”
              </p>
            )}
          </div>
        ) : (
          <>
            {/* the three options */}
            <div className="grid gap-3 lg:grid-cols-3">
              {cards.map((c) => {
                const on = picked === c.quote_id
                const diff = c.landed_total - cheapest
                return (
                  <button
                    key={c.quote_id}
                    onClick={() => setPicked(c.quote_id)}
                    aria-pressed={on}
                    className={`card flex flex-col p-5 text-left transition-all ${
                      on
                        ? 'border-gold-400 ring-2 ring-gold-400'
                        : 'hover:-translate-y-0.5 hover:shadow-lift'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-display text-xl leading-tight text-ink">
                        {c.vendor_name}
                      </h2>
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] ${
                          on
                            ? 'border-gold-500 bg-gold-500 text-white'
                            : 'border-sand-300 text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                    </div>

                    <div className="mt-3">
                      <p className="tnum font-display text-2xl text-ink">
                        {inr(c.landed_total)}
                      </p>
                      <p className="tnum mt-0.5 text-xs text-ink-faint">
                        {inr(c.cost_per_plate)} per plate · all taxes and transport in
                      </p>
                      {diff > 0 && (
                        <p className="tnum mt-1 text-xs text-rust-600">
                          {inr(diff)} more than the lowest quote
                        </p>
                      )}
                      {diff === 0 && (
                        <p className="mt-1 text-xs font-medium text-sage-600">
                          Lowest quote
                        </p>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-sand-200 pt-3">
                      <span className="pill bg-sand-200 text-ink-soft">
                        ★ {c.vendor_rating?.toFixed?.(1) ?? c.vendor_rating} rating
                      </span>
                      <span
                        className={`pill ${
                          c.vendor_on_time_pct >= 85
                            ? 'bg-sage-100 text-sage-700'
                            : 'bg-rust-100 text-rust-700'
                        }`}
                      >
                        {Math.round(c.vendor_on_time_pct)}% on time
                      </span>
                    </div>

                    {c.inclusions?.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-sage-600">
                          Included
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {c.inclusions.map((t) => (
                            <li key={t} className="flex gap-1.5 text-[12px] leading-snug text-ink-soft">
                              <span className="text-sage-600">✓</span> {t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {c.exclusions?.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-rust-600">
                          Not included
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {c.exclusions.map((t) => (
                            <li key={t} className="flex gap-1.5 text-[12px] leading-snug text-ink-faint">
                              <span className="text-rust-400">✕</span> {t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {c.extra_hour_rate > 0 && (
                      <p className="tnum mt-3 border-t border-sand-200 pt-2 text-[11px] text-ink-faint">
                        Extra hour beyond schedule: {inr(c.extra_hour_rate)}
                      </p>
                    )}
                  </button>
                )
              })}
            </div>

            {/* line by line, so "cheaper" can be checked rather than trusted */}
            {data.matrix_rows?.length > 0 && (
              <div className="card overflow-hidden">
                <div className="border-b border-sand-200 px-5 py-3">
                  <h2 className="text-sm font-semibold text-ink">Line by line</h2>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    A blank cell means that caterer did not quote for that item at all.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-sand-200 bg-sand-50">
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-ink-soft">
                          Item
                        </th>
                        {cards.map((c) => (
                          <th key={c.quote_id}
                              className="px-4 py-2.5 text-right text-xs font-semibold text-ink-soft">
                            {c.vendor_name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.matrix_rows.map((row) => (
                        <tr key={row.key} className="border-b border-sand-200 last:border-0">
                          <td className="px-4 py-2.5 align-top">
                            <span className="text-[13px] text-ink">{row.label}</span>
                            {row.partial && (
                              <span className="pill ml-2 bg-gold-100 text-gold-700">
                                only {row.quoted_by} quoted
                              </span>
                            )}
                          </td>
                          {cards.map((c) => {
                            const line = c.lines.find((l) => l.key === row.key)
                            return (
                              <td key={c.quote_id} className="px-4 py-2.5 text-right align-top">
                                {line ? (
                                  <>
                                    <span className="tnum text-[13px] text-ink">
                                      {inr(line.line_total)}
                                    </span>
                                    {line.description !== row.label && (
                                      <span className="mt-0.5 block text-[11px] italic leading-snug text-ink-faint">
                                        {line.description}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-xs text-ink-faint">—</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                      <tr className="bg-sand-50 font-semibold">
                        <td className="px-4 py-3 text-[13px] text-ink">
                          Total with taxes and transport
                        </td>
                        {cards.map((c) => (
                          <td key={c.quote_id} className="tnum px-4 py-3 text-right text-[13px] text-ink">
                            {inr(c.landed_total)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p className="px-2 text-center text-xs leading-relaxed text-ink-faint">
              Your planner is happy to talk any of these through before you decide.
              Choosing one closes the other requests automatically.
            </p>
          </>
        )}
      </main>

      {/* sticky bar: the chosen option and the one button, always on screen */}
      {!decided && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-sand-300 bg-white/95 px-4 py-3 shadow-lift backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <div className="min-w-0 flex-1">
              {picked ? (
                <>
                  <p className="truncate text-sm font-semibold text-ink">
                    {cards.find((c) => c.quote_id === picked)?.vendor_name}
                  </p>
                  <p className="tnum truncate text-xs text-ink-faint">
                    {inr(cards.find((c) => c.quote_id === picked)?.landed_total)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-ink-faint">
                  Tap a quote above to select it
                </p>
              )}
            </div>
            <button
              disabled={!picked}
              onClick={() => setConfirming(true)}
              className="btn-primary shrink-0 px-6 py-3 text-base disabled:cursor-not-allowed disabled:opacity-40"
            >
              Confirm choice
            </button>
          </div>
        </div>
      )}

      {/* confirmation — a vendor award closes the other quotes, so it asks once */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
          <form onSubmit={confirm}
                className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-lift">
            <div>
              <h2 className="font-display text-xl text-ink">Confirm your choice</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                You are choosing{' '}
                <strong className="text-ink">
                  {cards.find((c) => c.quote_id === picked)?.vendor_name}
                </strong>{' '}
                at{' '}
                <strong className="tnum text-ink">
                  {inr(cards.find((c) => c.quote_id === picked)?.landed_total)}
                </strong>
                . The other quotes will be closed and your planner will be notified.
              </p>
            </div>

            <div>
              <label className="label">Your name</label>
              <input required minLength={2} className="input" value={name}
                     onChange={(e) => setName(e.target.value)}
                     placeholder="Who is confirming this" />
            </div>

            <div>
              <label className="label">Anything to pass on? <span className="font-normal text-ink-faint">(optional)</span></label>
              <textarea rows={2} className="input" value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="e.g. please keep the Jain menu as discussed" />
            </div>

            <ErrorBox error={err} />

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setConfirming(false)}
                      className="btn-ghost flex-1 py-3">
                Back
              </button>
              <button disabled={busy} className="btn-primary flex-1 py-3">
                {busy ? 'Confirming…' : 'Yes, choose this one'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
