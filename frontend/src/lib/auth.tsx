import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import axios from 'axios'
import { API_URL, socket } from './socket'

// Same-origin cookies are sent by default; this also covers a separate API host
axios.defaults.withCredentials = true

export type Access = 'anon' | 'free' | 'premium' | 'admin'

export interface User {
  id: number
  email: string
  name: string | null
  plan: 'free' | 'premium'
  premiumUntil: string | null
  isAdmin: boolean
  emailVerified: boolean
  marketingOptIn: boolean
  createdAt: string
}

interface SessionPayload {
  user: User | null
  access: Access
  verificationRequired?: boolean
}

interface AuthState {
  user: User | null
  access: Access
  loading: boolean
  /** premium or admin: full predictions */
  full: boolean
  /** signed in but the email is not confirmed yet */
  needsVerification: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, name?: string, optIn?: boolean) => Promise<void>
  verify: (code: string) => Promise<void>
  resendCode: () => Promise<void>
  resetPassword: (email: string, code: string, password: string) => Promise<void>
  setOptIn: (on: boolean) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/** Readable message from an axios error. */
export function errorText(e: any, fallback = 'Something went wrong. Please try again.') {
  return e?.response?.data?.error || e?.response?.data?.message || fallback
}

// Socket rooms are chosen at connect time from the session cookie — reconnect after sign-in / sign-out
function reconnectSocket() {
  socket.disconnect()
  socket.connect()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [access, setAccess] = useState<Access>('anon')
  const [loading, setLoading] = useState(true)
  const [verificationRequired, setVerificationRequired] = useState(false)

  const apply = (d: SessionPayload) => {
    setUser(d.user)
    setAccess(d.access)
    if (typeof d.verificationRequired === 'boolean') setVerificationRequired(d.verificationRequired)
  }

  const refresh = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/auth/me`)
      apply(r.data as SessionPayload)
    } catch {
      apply({ user: null, access: 'anon' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    // pick up changes made elsewhere (Premium granted/expired, signed out in another tab)
    const onFocus = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [refresh])

  // Live-score rooms (full / teaser) are chosen at connect time: reconnect when the access level changes
  const firstAccess = useRef(true)
  useEffect(() => {
    if (firstAccess.current) {
      firstAccess.current = false
      return
    }
    reconnectSocket()
  }, [access])

  const login = async (email: string, password: string) => {
    const r = await axios.post(`${API_URL}/auth/login`, { email, password })
    apply(r.data)
  }

  const signup = async (email: string, password: string, name?: string, optIn?: boolean) => {
    const r = await axios.post(`${API_URL}/auth/signup`, { email, password, name, optIn: !!optIn })
    apply(r.data)
  }

  const verify = async (code: string) => {
    const r = await axios.post(`${API_URL}/auth/verify`, { code })
    apply(r.data)
  }

  const resendCode = async () => {
    await axios.post(`${API_URL}/auth/verify/resend`)
  }

  const resetPassword = async (email: string, code: string, password: string) => {
    const r = await axios.post(`${API_URL}/auth/reset`, { email, code, password })
    apply(r.data)
  }

  const setOptIn = async (on: boolean) => {
    const r = await axios.post(`${API_URL}/auth/preferences`, { optIn: on })
    apply(r.data)
  }

  const logout = async () => {
    try {
      await axios.post(`${API_URL}/auth/logout`)
    } catch {
      /* signed out locally anyway; the next /auth/me call shows the real state */
    }
    apply({ user: null, access: 'anon' })
  }

  const full = access === 'premium' || access === 'admin'
  const needsVerification = !!user && verificationRequired && !user.emailVerified

  return (
    <AuthContext.Provider
      value={{ user, access, loading, full, needsVerification, login, signup, verify, resendCode, resetPassword, setOptIn, logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
