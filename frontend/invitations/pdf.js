/** A tiny PDF writer: one JPEG per page, nothing else.
 *
 *  Enough for printing invitations without pulling in a PDF library — the
 *  JPEG goes in as-is (DCTDecode), so there is no quality lost. Pages are
 *  5 × 7 inches (360 × 504 points).
 */
function bytesFromDataUrl(url) {
  const b64 = url.slice(url.indexOf(',') + 1)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function jpegSize(bytes) {
  // walk the JPEG markers to the frame header for the pixel size
  let i = 2
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue }
    const marker = bytes[i + 1]
    const len = (bytes[i + 2] << 8) | bytes[i + 3]
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { h: (bytes[i + 5] << 8) | bytes[i + 6], w: (bytes[i + 7] << 8) | bytes[i + 8] }
    }
    i += 2 + len
  }
  return { w: 1500, h: 2100 }
}

export function jpegsToPdf(dataUrls, { widthPt = 360, heightPt = 504, title = 'Invitation' } = {}) {
  const enc = new TextEncoder()
  const chunks = []
  let length = 0
  const offsets = []
  const push = (part) => {
    const b = typeof part === 'string' ? enc.encode(part) : part
    chunks.push(b); length += b.length
  }
  const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n`); body(); push('\nendobj\n') }

  const pages = dataUrls.map(bytesFromDataUrl)
  const n = pages.length
  // object numbers: 1 catalog, 2 pages, 3 info, then per page: page, content, image
  const pageNo = (i) => 4 + i * 3
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')

  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'))
  obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${pageNo(i)} 0 R`).join(' ')}] >>`))
  obj(3, () => push(`<< /Title (${title.replace(/[()\\]/g, '')}) /Producer (The Royal Knot) >>`))

  pages.forEach((jpg, i) => {
    const p = pageNo(i)
    const { w, h } = jpegSize(jpg)
    obj(p, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] /Resources << /XObject << /Im${i} ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`))
    const content = `q ${widthPt} 0 0 ${heightPt} 0 0 cm /Im${i} Do Q`
    obj(p + 1, () => { push(`<< /Length ${content.length} >>\nstream\n`); push(content); push('\nendstream') })
    obj(p + 2, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`)
      push(jpg)
      push('\nendstream')
    })
  })

  const total = 4 + n * 3
  const xref = length
  push(`xref\n0 ${total}\n0000000000 65535 f \n`)
  for (let i = 1; i < total; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF`)

  return new Blob(chunks, { type: 'application/pdf' })
}

export function download(blobOrUrl, filename) {
  const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(url), 4000)
}
