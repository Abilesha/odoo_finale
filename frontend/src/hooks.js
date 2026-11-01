import { useCallback, useEffect, useState } from 'react'

import { api } from './api'

/** Fetch a path, with loading/error state and a reload() for after mutations. */
export function useApi(path, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!path) return
    setError(null)
    try {
      setData(await api.get(path))
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => { load() }, [load, ...deps])

  return { data, error, loading, reload: load, setData }
}

/** Poll a path on an interval — used by the live big-day board. */
export function usePolling(path, intervalMs = 20000, enabled = true) {
  const state = useApi(path)
  const { reload } = state
  useEffect(() => {
    if (!enabled || !intervalMs) return
    const t = setInterval(reload, intervalMs)
    return () => clearInterval(t)
  }, [reload, intervalMs, enabled])
  return state
}
