import { useState } from 'react'

import { api, date, inr } from '../../api'
import { ErrorBox, Spinner, useToast } from '../../components/ui'
import { useApi } from '../../hooks'
import { AgreementDocument, printAgreement } from '../../components/AgreementCopy'
import { SignaturePad } from '../../components/SignaturePad'
import { ClientHead, PlannerCard } from './shared'

/** The service agreement — read, signed and kept, inside the portal.
 *
 *  This is the only place the agreement can be signed: the couple, signed in
 *  to their own account. The agency can read the signed copy but has no way
 *  to sign it for them. */
export default function ClientAgreement() {
  const { data, error, loading, reload } = useApi('/api/client/agreement')
  const [accepted, setAccepted] = useState(false)
  const [name, setName] = useState('')
  const [sig, setSig] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [toast, setToast] = useToast()

  if (loading) return <Spinner label="Opening your agreement" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  if (!data.sent) {
    return (
      <div className="space-y-6">
        <ClientHead eyebrow="Service agreement" title="Your agreement" />
        <div className="card p-10 text-center">
          <p className="text-3xl">✉</p>
          <h2 className="mt-3 font-display text-2xl text-ink">It comes after your first meeting</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-faint">
            Once you and your planner have agreed the package, the agreement appears here for you
            to read and sign — no printing, no scanning.
          </p>
        </div>
        <PlannerCard planner={data.planner} />
      </div>
    )
  }

  const missing = !accepted ? 'Tick that you have read it' : name.trim().length < 2 ? 'Type your full name' : !sig ? 'Draw your signature' : null

  async function sign() {
    setBusy(true); setErr(null)
    try {
      const res = await api.post('/api/client/agreement/sign', { signer_name: name.trim(), signature_png: sig })
      setToast({ message: res.detail }); reload()
    } catch (e) { setErr(e) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <ClientHead eyebrow="Service agreement" title={data.signed ? 'Signed and kept' : 'Read and sign'}
                  sub={`${data.package_type} · ${inr(data.quoted_fee)} · sent ${date(data.sent_at)}`}
                  action={<button className={data.signed ? 'btn bg-blush-700 text-white hover:bg-blush-800' : 'btn-ghost'} onClick={() => printAgreement(data)}>
                    {data.signed ? '⤓ Download signed copy (PDF)' : 'Print the terms'}</button>} />

      {data.signed ? (
        <>
          <div className="card flex flex-wrap items-center gap-4 border-sage-400/50 bg-sage-100 p-5 text-sage-700">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sage-600 text-lg text-white">✓</span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-xl">You signed on {date(data.signed_at)}</p>
              <p className="text-xs opacity-80">Your planner has the same copy on your file. Download it any time from here.</p>
            </div>
          </div>
          <AgreementDocument a={data} />
        </>
      ) : (
        <article className="card max-h-[32rem] overflow-y-auto whitespace-pre-line p-6 font-serif text-[15px] leading-relaxed text-ink-soft sm:p-8">
          {data.body}
        </article>
      )}

      {!data.signed && (
        <section className="card space-y-5 p-6">
          <label className="flex items-start gap-3 text-sm text-ink">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)}
                   className="mt-0.5 h-5 w-5 rounded border-sand-300 accent-blush-600" />
            I have read the agreement above and accept its terms on behalf of {data.couple_name}.
          </label>
          <div>
            <label className="label">Your full name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="As it should appear on the agreement" />
          </div>
          <div>
            <label className="label">Your signature</label>
            <SignaturePad onChange={setSig} />
          </div>
          <ErrorBox error={err} />
          <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap items-center justify-end gap-3 rounded-b-xl border-t border-sand-200 bg-white/95 px-6 py-4 backdrop-blur">
            <span className={`text-xs ${missing ? 'text-ink-faint' : 'text-sage-700'}`}>{missing ? `Still needed: ${missing}` : '✓ Ready to sign'}</span>
            <button className="btn bg-blush-700 px-6 text-white hover:bg-blush-800" disabled={!!missing || busy} onClick={sign}>
              {busy ? 'Signing…' : 'Sign the agreement'}
            </button>
          </div>
        </section>
      )}
      {toast}
    </div>
  )
}
