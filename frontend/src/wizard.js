import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

/** The step of a multi-step form, kept in the address bar as ?step=N.
 *
 *  Each "Next" pushes a history entry, so the browser's Back button (or a
 *  phone's back gesture) goes to the previous step instead of leaving the
 *  page. `furthest` is the first step that is not complete yet: a pasted or
 *  stale link can never jump past a step that still needs answers.
 */
export function useWizardStep(total, furthest = total - 1) {
  const [params, setParams] = useSearchParams()
  const raw = parseInt(params.get('step') || '1', 10)
  const asked = Number.isFinite(raw) ? raw - 1 : 0
  const step = Math.max(0, Math.min(asked, total - 1, furthest))

  // if the link asked for a step we cannot show yet, quietly correct it
  useEffect(() => {
    if (asked !== step) {
      setParams((p) => { const n = new URLSearchParams(p); n.set('step', String(step + 1)); return n }, { replace: true })
    }
  }, [asked, step, setParams])

  const goTo = useCallback((i) => {
    setParams((p) => { const n = new URLSearchParams(p); n.set('step', String(i + 1)); return n })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [setParams])

  return { step, goTo }
}

/** Form values that survive a refresh, a closed tab or a wrong turn.
 *
 *  Saved to this browser only, a moment after typing stops. Anything listed
 *  in `secret` (passwords) is never written down — it stays in memory only.
 */
export function useDraft(key, initial, secret = []) {
  const [value, setValue] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null')
      return saved && typeof saved === 'object' ? { ...initial, ...saved } : initial
    } catch { return initial }
  })
  const [savedAt, setSavedAt] = useState(null)
  const timer = useRef(null)

  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      try {
        const keep = { ...value }
        secret.forEach((k) => { delete keep[k] })
        localStorage.setItem(key, JSON.stringify(keep))
        setSavedAt(new Date())
      } catch { /* private mode or storage full — the form still works */ }
    }, 400)
    return () => clearTimeout(timer.current)
  }, [key, value]) // eslint-disable-line react-hooks/exhaustive-deps

  const clear = useCallback(() => {
    clearTimeout(timer.current)
    try { localStorage.removeItem(key) } catch { /* ignore */ }
  }, [key])

  const hasDraft = useCallback(() => {
    try { return !!localStorage.getItem(key) } catch { return false }
  }, [key])

  return [value, setValue, { clear, savedAt, hasDraft }]
}
