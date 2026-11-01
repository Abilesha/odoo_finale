import { createContext, useCallback, useContext, useEffect, useState } from 'react'

import { api, setUnauthorizedHandler, token } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const signOut = useCallback(() => {
    token.set(null)
    setUser(null)
  }, [])

  // a session that expires mid-task drops the user back to sign-in rather
  // than leaving them staring at failed panels
  useEffect(() => { setUnauthorizedHandler(() => setUser(null)) }, [])

  // restore the session on reload
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!token.get()) { setLoading(false); return }
      try {
        const me = await api.get('/api/auth/me')
        if (!cancelled) setUser(me)
      } catch {
        token.set(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  /** portal is 'founder' | 'manager' | 'vendor' — the door they came through */
  const signIn = useCallback(async (email, password, portal) => {
    const res = await api.post('/api/auth/login', { email, password, portal })
    token.set(res.token)
    setUser(res.user)
    return res.user
  }, [])

  /** demo only: { staff_id } or { vendor_id } */
  const signInAs = useCallback(async (who) => {
    const body = typeof who === 'number' ? { staff_id: who } : who
    const res = await api.post('/api/auth/demo-login', body)
    token.set(res.token)
    setUser(res.user)
    return res.user
  }, [])

  /** signed in by something other than the login form — the online enquiry */
  const adopt = useCallback((tok, u) => {
    token.set(tok)
    setUser(u)
  }, [])

  // after a profile change (a new photo, a new phone) without signing in again
  const updateUser = useCallback((patch) => setUser((u) => (u ? { ...u, ...patch } : u)), [])

  const can = useCallback(
    (capability) => !!user?.capabilities?.includes(capability),
    [user],
  )

  const portal = !user ? null
    : user.kind === 'vendor' ? 'vendor'
    : user.kind === 'client' ? 'client'
    : user.role === 'Founder' ? 'founder' : 'manager'

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signInAs, signOut, can, portal, adopt, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export const CAP = {
  SEASON: 'view_season',
  LEADS: 'manage_leads',
  WEDDINGS: 'manage_weddings',
  VENDORS: 'manage_vendors',
  RUNDAY: 'run_day',
  MONEY: 'manage_money',
  SHARE: 'share_numbers',
  TEAM: 'manage_team',
  ALL: 'all_weddings',
}
