import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const FREE = ['Every match in 25+ competitions', 'Live scores and events', 'Market odds', 'The model’s pick for each match', 'League tables and top scorers']
const PREMIUM = [
  'Win / draw / loss % from every model (v2, v3, Elo)',
  'Fair odds and model vs market on each outcome',
  'Strong picks and two-option picks',
  'Draw alerts (backtested on two seasons)',
  'Full v3 breakdown: every parameter, points and reasons',
  'Expected goals, over 2.5, both teams score, likely scores',
  'Accuracy page: live track record and backtests'
]

function Check({ on = true }: { on?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={on ? 'text-accent flex-shrink-0 mt-0.5' : 'text-faint flex-shrink-0 mt-0.5'} aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

export default function Premium() {
  const { user, access } = useAuth()
  const isPremium = access === 'premium' || access === 'admin'
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
          See the numbers behind every pick
        </h1>
        <p className="text-muted mt-3">
          Our models are measured on every match against the bookmakers, in public. Premium opens the full probabilities and the tools
          built on them.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="card p-6">
          <div className="label">Free</div>
          <div className="font-display text-3xl font-extrabold text-ink mt-1">₪0</div>
          <ul className="mt-5 space-y-2.5 text-sm text-ink/90">
            {FREE.map(f => (
              <li key={f} className="flex gap-2">
                <Check /> {f}
              </li>
            ))}
          </ul>
          {!user && (
            <Link to="/signup" className="mt-6 block text-center rounded-xl border border-line py-2.5 text-sm font-semibold text-ink hover:border-faint">
              Create free account
            </Link>
          )}
        </div>

        <div className="card p-6 border-accent/50 relative overflow-hidden">
          <div className="pointer-events-none absolute -top-20 -right-20 w-56 h-56 rounded-full bg-accent/15 blur-3xl" />
          <div className="relative">
            <div className="label text-accent">Premium</div>
            <div className="font-display text-3xl font-extrabold text-ink mt-1">Coming soon</div>
            <ul className="mt-5 space-y-2.5 text-sm text-ink/90">
              <li className="flex gap-2">
                <Check /> Everything in Free
              </li>
              {PREMIUM.map(f => (
                <li key={f} className="flex gap-2">
                  <Check /> {f}
                </li>
              ))}
            </ul>
            <div className="mt-6">
              {isPremium ? (
                <div className="rounded-xl bg-accent/15 text-accent text-center py-2.5 text-sm font-semibold">You have Premium</div>
              ) : user ? (
                <div className="rounded-xl border border-line text-center py-2.5 text-sm text-muted">
                  Payments open soon. We’ll let you know at {user.email}.
                </div>
              ) : (
                <Link to="/signup?next=/premium" className="block text-center rounded-xl bg-accent text-bg py-2.5 text-sm font-semibold">
                  Create an account to get notified
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-faint max-w-xl mx-auto">
        Predictions are probabilities, not promises. Bet To Beat is an analytics service and does not take bets.
      </p>
    </div>
  )
}
