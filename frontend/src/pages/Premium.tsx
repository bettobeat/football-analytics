import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../lib/socket'
import { errorText, useAuth } from '../lib/auth'
import { refreshUnlocks, useUnlocks, resetDay } from '../lib/unlocks'

/**
 * Plans: Free · Premium $15 (60 match unlocks a month) · Pro $30 (unlimited + draw alerts) · Pro yearly.
 * Pro sits in the middle and is marked "Most popular". While the backend runs with BILLING_TEST_MODE=1 the buttons
 * switch the plan straight away (test checkout); otherwise they say payments open soon.
 */

const FREE = ['2 full picks a week with a free account', 'Live scores, lineups and events', 'League tables, team and player pages', 'Latest results and our public record']
const PREMIUM = [
  '60 match unlocks a month',
  'Win / draw / loss %, and why this pick',
  'Goals: over/under, both teams score, likely scores',
  'Every finished match in full',
  'Full team and player stats'
]
const PRO = [
  'Unlimited predictions, no counting',
  'Everything in Premium',
  'Draw picks: the 2 likeliest draws every week',
  'Basketball, tennis and UFC as they launch',
  'Early access to new models and features'
]

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-accent flex-shrink-0 mt-0.5" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

export default function Premium() {
  const { user, access, refresh } = useAuth()
  const [testMode, setTestMode] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const u = useUnlocks(access === 'premium')

  useEffect(() => {
    axios
      .get(`${API_URL}/billing/plans`)
      .then(r => setTestMode(!!r.data.data?.testMode))
      .catch(() => undefined)
  }, [])

  const choose = async (plan: string, label: string) => {
    setBusy(plan)
    setMsg(null)
    try {
      await axios.post(`${API_URL}/billing/test-checkout`, { plan })
      await refresh()
      await refreshUnlocks()
      setMsg({ ok: true, text: plan === 'free' ? 'You are back on Free (test).' : `You are on ${label} now (test checkout, no payment taken).` })
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) })
    } finally {
      setBusy(null)
    }
  }

  const button = (plan: string, label: string, primary: boolean) => {
    const target = plan === 'pro-year' ? 'pro' : plan
    if (access === 'admin') return <div className="rounded-xl bg-surface2/70 text-center py-2.5 text-sm text-muted">Admin: full access</div>
    if (access === target) return <div className="rounded-xl bg-accent/15 text-accent text-center py-2.5 text-sm font-semibold">Your plan</div>
    if (!user)
      return (
        <Link to="/signup?next=/premium" className={`block text-center rounded-xl py-2.5 text-sm font-semibold ${primary ? 'bg-accent text-bg' : 'border border-line text-ink hover:border-faint'}`}>
          Create an account
        </Link>
      )
    if (!testMode) return <div className="rounded-xl border border-line text-center py-2.5 text-sm text-muted">Payments open soon</div>
    const upgrade = access === 'premium' && target === 'pro'
    return (
      <button
        onClick={() => choose(plan, label)}
        disabled={!!busy}
        className={`w-full rounded-xl py-2.5 text-sm font-extrabold disabled:opacity-60 ${primary ? 'bg-accent text-bg' : 'border border-line text-ink hover:border-faint'}`}
      >
        {busy === plan ? 'Switching…' : upgrade ? `Upgrade to ${label}` : `Choose ${label}`}
      </button>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">See the numbers behind every pick</h1>
        <p className="text-muted mt-3">
          Every prediction is saved before kick-off and scored in public. Pick the plan that fits how much you use it.
        </p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-win/40 bg-win/10 px-3 py-1 text-xs font-semibold text-win">
          3-day money-back guarantee · cancel any time
        </p>
        {testMode && (
          <p className="mt-4 inline-block rounded-full border border-draw/40 bg-draw/10 px-3 py-1 text-xs font-semibold text-draw">
            Test mode: choosing a plan switches it straight away, no payment is taken
          </p>
        )}
      </div>

      {access === 'premium' && u && u.left !== null && (
        <div className="mt-8 card p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-ink">
            <b className="num">{u.left}</b> of {u.allowance} unlocks left this month · renews {resetDay(u.resetsAt)}
          </div>
          <div className="h-2 w-full sm:w-64 rounded-full bg-surface2 overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${(u.left / Math.max(1, u.allowance)) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-stretch">
        {/* Premium */}
        <div className="card p-6 flex flex-col">
          <div className="label">Premium</div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="font-display text-4xl font-extrabold text-ink">$15</span>
            <span className="text-sm text-muted">/ month</span>
          </div>
          <div className="text-xs text-faint mt-1">60 matches · about $0.25 per match</div>
          <ul className="mt-5 space-y-2.5 text-sm text-ink/90 flex-1">
            {PREMIUM.map(f => (
              <li key={f} className="flex gap-2">
                <Check /> {f}
              </li>
            ))}
          </ul>
          <div className="mt-6">{button('premium', 'Premium', false)}</div>
        </div>

        {/* Pro: the plan we steer people to */}
        <div className="card p-6 flex flex-col relative overflow-hidden border-accent/60 xl:-my-3 xl:py-9 shadow-lift order-first xl:order-none">
          <div className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full bg-accent/20 blur-3xl" />
          <span className="absolute top-4 right-4 text-[10px] font-extrabold uppercase tracking-wider text-bg bg-accent px-2.5 py-1 rounded-full">Most popular</span>
          <div className="relative flex flex-col flex-1">
            <div className="label text-accent">Pro</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="font-display text-4xl font-extrabold text-ink">$30</span>
              <span className="text-sm text-muted">/ month</span>
            </div>
            <div className="text-xs text-accent font-semibold mt-1">Unlimited matches</div>
            <ul className="mt-5 space-y-2.5 text-sm text-ink/90 flex-1">
              {PRO.map(f => (
                <li key={f} className="flex gap-2">
                  <Check /> {f}
                </li>
              ))}
            </ul>
            <div className="mt-6">{button('pro', 'Pro', true)}</div>
          </div>
        </div>

        {/* Pro 6 months: 20% off */}
        <div className="card p-6 flex flex-col">
          <div className="label">Pro 6 months</div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="font-display text-4xl font-extrabold text-ink">$144</span>
            <span className="text-sm text-muted">/ 6 months</span>
          </div>
          <div className="text-xs text-win font-semibold mt-1">$24 a month · save 20%</div>
          <ul className="mt-5 space-y-2.5 text-sm text-ink/90 flex-1">
            <li className="flex gap-2">
              <Check /> Everything in Pro
            </li>
            <li className="flex gap-2">
              <Check /> One payment every 6 months
            </li>
          </ul>
          <div className="mt-6">{button('pro-6m', 'Pro 6 months', false)}</div>
        </div>

        {/* Pro yearly: the best price per month */}
        <div className="card p-6 flex flex-col relative border-home/60">
          <span className="absolute top-4 right-4 text-[10px] font-extrabold uppercase tracking-wider text-white bg-home px-2.5 py-1 rounded-full">Best offer</span>
          <div className="label text-home">Pro yearly</div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="font-display text-4xl font-extrabold text-ink">$249</span>
            <span className="text-sm text-muted">/ year</span>
          </div>
          <div className="text-xs text-win font-semibold mt-1">About $21 a month · save 30%</div>
          <ul className="mt-5 space-y-2.5 text-sm text-ink/90 flex-1">
            <li className="flex gap-2">
              <Check /> Everything in Pro
            </li>
            <li className="flex gap-2">
              <Check /> One payment a year
            </li>
          </ul>
          <div className="mt-6">{button('pro-year', 'Pro yearly', false)}</div>
        </div>
      </div>

      {msg && <p className={`mt-6 text-center text-sm ${msg.ok ? 'text-win' : 'text-loss'}`}>{msg.text}</p>}

      <div className="mt-10 card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="label">Free</div>
            <div className="font-display text-xl font-bold text-ink mt-0.5">$0</div>
          </div>
          {testMode && user && (access === 'premium' || access === 'pro') && (
            <button onClick={() => choose('free', 'Free')} disabled={!!busy} className="text-xs text-muted hover:text-ink underline">
              Back to Free (test)
            </button>
          )}
        </div>
        <ul className="mt-3 grid sm:grid-cols-2 gap-2 text-sm text-ink/90">
          {FREE.map(f => (
            <li key={f} className="flex gap-2">
              <Check /> {f}
            </li>
          ))}
        </ul>
        {!user && (
          <Link to="/signup" className="mt-5 inline-block rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-faint">
            Create free account
          </Link>
        )}
      </div>

      <p className="mt-8 text-center text-xs text-faint max-w-xl mx-auto">
        3-day money-back guarantee on every plan: not for you? Ask within 3 days of paying and you get the full amount back.
        Unlocked matches stay open. Finished matches are always open on paid plans. Unlocks renew on the 1st of every month.
        Predictions are probabilities, not promises. Bet To Beat is an analytics service and does not take bets.
      </p>
    </div>
  )
}
