// Thin API client. The backend serves this bundle, so relative URLs work in
// production; in dev, Vite proxies /api to the FastAPI port.
const BASE = import.meta.env.VITE_API_BASE || ''
const TOKEN_KEY = 'rk.token'

export const token = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } },
  set: (v) => { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY) } catch { /* private mode */ } },
}

/** Called when the session expires mid-task, so the app can bounce to sign-in
 *  instead of filling the screen with 401s. */
let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

async function request(path, options = {}) {
  const auth = token.get()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(options.headers || {}),
    },
  })

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch { /* non-JSON error body */ }

    // don't bounce on the sign-in call itself — that's a wrong password,
    // not an expired session
    if (res.status === 401 && !path.startsWith('/api/auth/')) {
      token.set(null)
      onUnauthorized()
    }
    const err = new Error(detail)
    err.status = res.status
    throw err
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  get:   (p) => request(p),
  post:  (p, body) => request(p, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: (p, body) => request(p, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  put:   (p, body) => request(p, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  del:   (p) => request(p, { method: 'DELETE' }),
}

// ---- formatting ----------------------------------------------------------

/** Indian numbering: 1,23,45,678 */
export function inr(n, { compact = false } = {}) {
  if (n == null || Number.isNaN(n)) return '—'
  const abs = Math.abs(n)
  if (compact) {
    if (abs >= 1e7) return `${n < 0 ? '-' : ''}₹${(abs / 1e7).toFixed(2)} Cr`
    if (abs >= 1e5) return `${n < 0 ? '-' : ''}₹${(abs / 1e5).toFixed(1)} L`
    if (abs >= 1e3) return `${n < 0 ? '-' : ''}₹${(abs / 1e3).toFixed(1)} K`
  }
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`
}

export function num(n, d = 0) {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: d, maximumFractionDigits: d,
  }).format(n)
}

export function date(iso, opts = {}) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: opts.year === false ? undefined : 'numeric',
  })
}

export function relativeDays(iso) {
  if (!iso) return null
  const d = Math.round((new Date(iso) - new Date()) / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  if (d === -1) return 'yesterday'
  return d > 0 ? `in ${d} days` : `${Math.abs(d)} days ago`
}
