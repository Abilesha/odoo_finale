import { useParams } from 'react-router-dom'

import { date, inr } from '../api'
import { BackButton } from '../components/kit'
import { Spinner } from '../components/ui'
import { useApi } from '../hooks'

/** What the founder's accountant or investor sees.
 *  No account, no navigation, no way in to anything else. */
export default function SharedReport() {
  const { token } = useParams()
  const { data, error, loading } = useApi(`/api/shared/${token}`)

  if (loading) return <Spinner label="Opening the report" />

  if (error) {
    const gone = error.status === 410
    return (
      <div className="flex min-h-screen items-center justify-center bg-sand-100 p-6">
        <div className="card max-w-md p-8 text-center">
          <p className="text-3xl">{gone ? '⊘' : '?'}</p>
          <h1 className="mt-3 font-display text-2xl text-ink">
            {gone ? 'This link has been withdrawn' : 'This link is not valid'}
          </h1>
          <p className="mt-2 text-sm text-ink-faint">
            {gone
              ? 'The Royal Knot has revoked access to this report. Ask them for a new link.'
              : 'Check that you copied the whole link, or ask The Royal Knot to send it again.'}
          </p>
        </div>
      </div>
    )
  }

  const t = data.totals

  return (
    <div className="min-h-screen bg-sand-100">
      <header className="relative bg-plum-900 px-6 py-8 text-center">
        <BackButton fallback="/" tone="dark" className="absolute left-5 top-5" />
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gold-400 font-display text-xl font-bold text-plum-900">
          R
        </div>
        <h1 className="font-display text-2xl text-sand-50">{data.label}</h1>
        <p className="mt-1 text-xs text-plum-300">
          Shared by {data.shared_by} · {date(data.generated_at)}
          {data.expires_at && <> · access ends {date(data.expires_at)}</>}
        </p>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-4 pb-16 sm:p-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { l: 'Weddings', v: t.weddings, s: 'this season' },
            { l: 'Revenue', v: inr(t.revenue, { compact: true }), s: 'contracts and additions' },
            { l: 'Profit', v: inr(t.profit, { compact: true }), s: `${t.margin_pct}% margin`,
              tone: t.profit >= 0 ? 'good' : 'bad' },
            { l: 'Net cash, 30 days', v: inr(t.net_cash_30d, { compact: true }),
              s: `${inr(t.cash_in_30d, { compact: true })} in · ${inr(t.cash_out_30d, { compact: true })} out`,
              tone: t.net_cash_30d >= 0 ? 'good' : 'bad' },
          ].map((x) => (
            <div key={x.l} className="card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{x.l}</p>
              <p className={`tnum mt-2 font-display text-2xl font-semibold ${
                x.tone === 'good' ? 'text-sage-700' : x.tone === 'bad' ? 'text-rust-700' : 'text-ink'}`}>
                {x.v}
              </p>
              <p className="mt-1 text-xs text-ink-faint">{x.s}</p>
            </div>
          ))}
        </div>

        {t.loss_making > 0 && (
          <div className="card border-gold-300 bg-gold-50 px-4 py-3 text-sm text-gold-700">
            {t.loss_making} of {t.weddings} weddings did not make money this season.
          </div>
        )}

        {data.weddings ? (
          <section className="card overflow-hidden">
            <header className="border-b border-sand-200 px-5 py-4">
              <h2 className="text-lg text-ink">Every wedding</h2>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-sand-50">
                  <tr>
                    <th className="th">Wedding</th><th className="th">Date</th>
                    <th className="th">Status</th>
                    <th className="th text-right">Revenue</th>
                    <th className="th text-right">Cost</th>
                    <th className="th text-right">Profit</th>
                    <th className="th text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.weddings].sort((a, b) => b.profit - a.profit).map((w) => (
                    <tr key={w.code} className="hover:bg-sand-50">
                      <td className="td">
                        <span className="font-medium">{w.couple_name}</span>
                        <span className="tnum ml-2 text-xs text-ink-faint">{w.code}</span>
                      </td>
                      <td className="td tnum text-ink-soft">{date(w.day1_date)}</td>
                      <td className="td text-ink-soft">{w.status}</td>
                      <td className="td tnum text-right">{inr(w.revenue, { compact: true })}</td>
                      <td className="td tnum text-right text-ink-soft">{inr(w.cost, { compact: true })}</td>
                      <td className={`td tnum text-right font-semibold ${
                        w.profit >= 0 ? 'text-sage-700' : 'text-rust-700'}`}>
                        {inr(w.profit, { compact: true })}
                      </td>
                      <td className={`td tnum text-right ${
                        w.margin_pct >= 15 ? 'text-sage-700'
                          : w.margin_pct >= 0 ? 'text-gold-700' : 'text-rust-700'}`}>
                        {w.margin_pct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <div className="card px-5 py-4 text-sm text-ink-faint">
            This report shows season totals only.
          </div>
        )}

        {data.vendors && (
          <section className="card overflow-hidden">
            <header className="border-b border-sand-200 px-5 py-4">
              <h2 className="text-lg text-ink">Most reliable vendors</h2>
              <p className="mt-0.5 text-xs text-ink-faint">
                Punctuality measured from arrival check-ins on the day
              </p>
            </header>
            <table className="w-full">
              <thead className="bg-sand-50">
                <tr>
                  <th className="th">Vendor</th>
                  <th className="th text-center">Weddings</th>
                  <th className="th text-right">On time</th>
                  <th className="th text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {data.vendors.map((v) => (
                  <tr key={v.name} className="hover:bg-sand-50">
                    <td className="td">
                      <span className="font-medium">{v.name}</span>
                      <span className="ml-2 text-xs text-ink-faint">{v.category}</span>
                    </td>
                    <td className="td tnum text-center text-ink-soft">{v.weddings_worked}</td>
                    <td className="td tnum text-right text-ink-soft">{v.punctuality_pct}%</td>
                    <td className="td tnum text-right font-semibold">{v.reliability_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <p className="pt-2 text-center text-[11px] text-ink-faint">
          Read-only report from The Royal Knot. Figures are generated live and may
          change as the season progresses.
        </p>
      </main>
    </div>
  )
}
