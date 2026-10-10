import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import axios from 'axios'
import { API_URL, socket } from './socket'
import { t } from './i18n'

// Same-origin cookies are sent by default; this also covers a separate API host
axios.defaults.withCredentials = true

export type Access = 'anon' | 'free' | 'premium' | 'pro' | 'admin'

export interface User {
  id: number
  email: string
  name: string | null
  plan: 'free' | 'premium' | 'pro'
  premiumUntil: string | null
  isAdmin: boolean
  emailVerified: boolean
  marketingOptIn: boolean
  createdAt: string
  cancelAt?: string | null
  /** two-step login is on */
  twoFactor?: boolean
  /** this session passed two-step login */
  mfa?: boolean
  /** staff role set by an admin (support inbox) */
  role?: 'support' | null
}

/** CRM permission: admin, or support staff (role + two-step login used for this session) */
export type Staff = 'admin' | 'support' | null

/** Sign-in step result: a ticket means a two-step code is still needed. */
export interface SignInStep { ticket?: string }

interface SessionPayload {
  user: User | null
  access: Access
  staff?: Staff
  verificationRequired?: boolean
}

interface AuthState {
  user: User | null
  access: Access
  staff: Staff
  loading: boolean
  /** Pro or admin: every prediction in full, no counting */
  full: boolean
  /** any paid plan (Premium $15 with unlocks, Pro, admin) */
  paid: boolean
  /** signed in but the email is not confirmed yet */
  needsVerification: boolean
  login: (email: string, password: string) => Promise<SignInStep>
  /** two-step login: the ticket from login / reset + a 6-digit code or a recovery code */
  loginCode: (ticket: string, code: string) => Promise<void>
  signup: (email: string, password: string, name?: string, optIn?: boolean, adult?: boolean) => Promise<void>
  verify: (code: string) => Promise<void>
  resendCode: () => Promise<void>
  resetPassword: (email: string, code: string, password: string) => Promise<SignInStep>
  setOptIn: (on: boolean) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/** Readable message from an axios error. */
export function errorText(e: any, fallback = t("Something went wrong. Please try again.")) {
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
  const [staff, setStaff] = useState<Staff>(null)
  const [loading, setLoading] = useState(true)
  const [verificationRequired, setVerificationRequired] = useState(false)

  const apply = (d: SessionPayload) => {
    setUser(d.user)
    setAccess(d.access)
    setStaff(d.staff ?? null)
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

  const login = async (email: string, password: string): Promise<SignInStep> => {
    const r = await axios.post(`${API_URL}/auth/login`, { email, password })
    if (r.data?.twoFactor) return { ticket: r.data.ticket }
    apply(r.data)
    return {}
  }

  const loginCode = async (ticket: string, code: string) => {
    const r = await axios.post(`${API_URL}/auth/2fa/login`, { ticket, code })
    apply(r.data)
  }

  const signup = async (email: string, password: string, name?: string, optIn?: boolean, adult?: boolean) => {
    const r = await axios.post(`${API_URL}/auth/signup`, { email, password, name, optIn: !!optIn, adult: !!adult })
    apply(r.data)
  }

  const verify = async (code: string) => {
    const r = await axios.post(`${API_URL}/auth/verify`, { code })
    apply(r.data)
  }

  const resendCode = async () => {
    await axios.post(`${API_URL}/auth/verify/resend`)
  }

  const resetPassword = async (email: string, code: string, password: string): Promise<SignInStep> => {
    const r = await axios.post(`${API_URL}/auth/reset`, { email, code, password })
    if (r.data?.twoFactor) return { ticket: r.data.ticket }
    apply(r.data)
    return {}
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

  const full = access === 'pro' || access === 'admin'
  const paid = full || access === 'premium'
  const needsVerification = !!user && verificationRequired && !user.emailVerified

  return (
    <AuthContext.Provider
      value={{ user, access, staff, loading, full, paid, needsVerification, login, loginCode, signup, verify, resendCode, resetPassword, setOptIn, logout, refresh }}
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
