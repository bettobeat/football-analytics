import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

/** Shows children to premium users and admins; everyone else gets a short explanation and a way in. */
export default function PremiumGate({ title, children }: { title: string; children: ReactNode }) {
  const { full, user, loading } = useAuth()
  if (loading) return <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 text-sm text-faint">Loading…</div>
  if (full) return <>{children}</>
  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-16">
      <div className="card p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-accent/15 text-accent grid place-items-center mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </div>
        <h1 className="font-display text-2xl font-extrabold text-ink">{title} is a Premium page</h1>
        <p className="text-sm text-muted mt-2">
          Premium shows how every model has performed on real matches: hit rate, calibration, strong picks, draw alerts and results
          against the bookmakers.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/premium" className="px-4 py-2 rounded-xl bg-accent text-bg text-sm font-semibold">
            See Premium
          </Link>
          {!user && (
            <Link to="/login" className="px-4 py-2 rounded-xl border border-line text-sm font-medium text-ink hover:border-faint">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
