import { inr } from '../api'
import { useApi } from '../hooks'
import { ErrorBox, Modal, Spinner } from './ui'

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' }) : '—')
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** The agreement as one document — terms, then the signature block with its
 *  audit trail. The couple sees it after signing; managers and the founder
 *  see the very same copy, read-only. */
export function AgreementDocument({ a }) {
  return (
    <article className="overflow-hidden rounded-xl border border-sand-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-200 bg-sand-50 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-400 font-display text-lg font-bold text-plum-900">R</span>
          <div><p className="font-display text-lg leading-none text-ink">The Royal Knot</p><p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Service agreement · {a.reference}</p></div>
        </div>
        <span className={`pill ${a.signed ? 'bg-sage-100 text-sage-700' : 'bg-gold-100 text-gold-700'}`}>{a.signed ? '✓ Signed' : 'Awaiting the couple’s signature'}</span>
      </header>
      <dl className="grid gap-x-6 gap-y-2 border-b border-sand-200 px-6 py-4 text-sm sm:grid-cols-3">
        <div><dt className="text-[11px] uppercase tracking-wider text-ink-faint">Couple</dt><dd className="text-ink">{a.couple_name}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wider text-ink-faint">Package</dt><dd className="text-ink">{a.package_type}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wider text-ink-faint">Contract value</dt><dd className="tnum text-ink">{inr(a.quoted_fee)}</dd></div>
      </dl>
      <div className="max-h-[22rem] overflow-y-auto whitespace-pre-line px-6 py-5 font-serif text-[15px] leading-relaxed text-ink-soft">{a.body}</div>
      <footer className="border-t border-sand-200 bg-sand-50 px-6 py-5">
        {a.signed ? (
          <div className="flex flex-wrap items-center gap-6">
            <div className="rounded-lg border border-sand-200 bg-white p-2"><img src={a.signature_png} alt={`Signature of ${a.signer_name}`} className="h-16 w-52 object-contain" /></div>
            <dl className="space-y-0.5 text-sm">
              <div className="font-display text-xl text-ink">{a.signer_name}</div>
              <div className="text-ink-soft">Signed {when(a.signed_at)}</div>
              <div className="text-xs text-ink-faint">In the couple’s own portal{a.client_email ? ` (${a.client_email})` : ''}{a.signer_ip ? ` · from ${a.signer_ip}` : ''}</div>
            </dl>
          </div>
        ) : (
          <p className="text-sm text-ink-faint">Sent {when(a.sent_at)}. Only the couple can sign — they do it from their own portal{a.client_email ? `, signed in as ${a.client_email}` : ''}.</p>
        )}
      </footer>
    </article>
  )
}

/** Opens a clean, print-ready copy in a new tab — "Save as PDF" from the
 *  print dialog gives the couple (or the agency) their signed copy. */
export function printAgreement(a) {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(a.reference)} — ${esc(a.couple_name)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1d1a24; max-width: 720px; margin: 24px auto; line-height: 1.6; }
  .top { display:flex; justify-content:space-between; align-items:center; border-bottom: 2px solid #c6922c; padding-bottom: 12px; }
  .mark { display:inline-flex; width:38px; height:38px; align-items:center; justify-content:center; background:#d9ae4d; color:#2d1828; font-weight:700; font-size:20px; border-radius:8px; margin-right:10px; }
  .brand { display:flex; align-items:center; font-size:22px; }
  .ref { font: 12px/1.4 Arial, sans-serif; color:#8b8495; text-align:right; }
  table { width:100%; border-collapse: collapse; margin: 18px 0; font: 13px Arial, sans-serif; }
  td { padding: 6px 0; border-bottom: 1px solid #ebe5db; } td:first-child { color:#8b8495; width: 34%; }
  .body { white-space: pre-line; font-size: 14.5px; }
  .sig { margin-top: 28px; padding: 16px; border: 1px solid #dbd2c4; border-radius: 8px; page-break-inside: avoid; }
  .sig img { height: 70px; max-width: 260px; object-fit: contain; display:block; margin-bottom: 6px; }
  .audit { font: 11.5px/1.5 Arial, sans-serif; color: #4a4455; }
  .stamp { display:inline-block; margin-top:8px; padding: 2px 10px; border: 1.5px solid #4b7356; color:#3a5a43; border-radius: 99px; font: 600 11px Arial, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
  .pending { color:#7d581d; border-color:#c6922c; }
</style></head><body>
<div class="top"><div class="brand"><span class="mark">R</span>The Royal Knot</div><div class="ref">Service agreement<br>${esc(a.reference)}</div></div>
<table>
<tr><td>Couple</td><td>${esc(a.couple_name)}</td></tr>
<tr><td>Package</td><td>${esc(a.package_type)}</td></tr>
<tr><td>Contract value</td><td>${esc(inr(a.quoted_fee))}</td></tr>
<tr><td>Sent</td><td>${esc(when(a.sent_at))}</td></tr>
</table>
<div class="body">${esc(a.body)}</div>
<div class="sig">${a.signed
    ? `<img src="${esc(a.signature_png)}" alt="Signature"><strong>${esc(a.signer_name)}</strong>
       <div class="audit">Signed ${esc(when(a.signed_at))} in the couple's own Royal Knot portal${a.client_email ? ` (${esc(a.client_email)})` : ''}${a.signer_ip ? ` · device address ${esc(a.signer_ip)}` : ''}</div>
       <span class="stamp">Digitally signed</span>`
    : `<div class="audit">Not signed yet. The couple signs from their own portal.</div><span class="stamp pending">Awaiting signature</span>`}
</div>
<script>window.onload = function () { setTimeout(function () { window.print() }, 250) }</script>
</body></html>`)
  w.document.close()
  return true
}

/** Read-only signed copy for managers and the founder. */
export function AgreementCopyModal({ leadId, onClose }) {
  const { data, error, loading, reload } = useApi(leadId ? `/api/leads/${leadId}/agreement` : null)
  return (
    <Modal open={!!leadId} onClose={onClose} wide
           title={data?.signed ? 'Signed agreement' : 'Agreement sent'}
           subtitle={data ? `${data.couple_name} · ${data.signed ? 'the copy the couple signed in their portal' : 'waiting for the couple to sign in their portal'}` : ''}>
      {loading ? <Spinner label="Opening the agreement" />
        : error ? <ErrorBox error={error} onRetry={reload} />
        : data && (
          <div className="space-y-4">
            <AgreementDocument a={data} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-ink-faint">Read-only. Only the couple can sign, from their own login.</p>
              <div className="flex gap-2">
                <button className="btn-ghost" onClick={onClose}>Close</button>
                <button className="btn-primary" onClick={() => printAgreement(data)}>{data.signed ? 'Download signed copy (PDF)' : 'Print'}</button>
              </div>
            </div>
          </div>
        )}
    </Modal>
  )
}
