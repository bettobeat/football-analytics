import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../lib/socket'
import { errorText } from '../lib/auth'

interface Alert {
  matchId: number; league: string; date: string; home: string; away: string
  marketDraw: number; ourDraw: number; price: number; edge: number
  v3?: { H: number; D: number; A: number }
  score?: string | null; won?: boolean; backfilled?: boolean
}
interface Rec { n: number; wins: number; hitRate: number | null; roi: number | null }
interface Season {
  season: string; label: string; matches: number; drawRate: number | null
  alerts: number; wins: number; hitRate: number; roi: number; lineMovedOurWay: number | null
  byLeague: { division: string; league: string; n: number; hitRate: number; roi: number }[]
}
interface Report {
  rule: { k: number; minEdge: number; maxEdge?: number; maxStreak?: number; minV3Draw: number; excluded: string[] }
  upcoming: Alert[]
  live: Rec; backfilled: Rec; total: Rec
  baseline: { matches: number; drawRate: number | null }
  alerts: Alert[]
  history: Season[]
}

const sign = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `${x > 0 ? '+' : ''}${x}%`)
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card p-5 sm:p-6 ${className}`}>{children}</div>
}

function Fact({ value, label, tone }: { value: string; label: string; tone?: 'win' | 'loss' }) {
  return (
    <div className="rounded-xl border border-line/70 bg-surface2/40 p-3.5">
      <div className={`num text-xl sm:text-2xl font-extrabold ${tone === 'win' ? 'text-win' : tone === 'loss' ? 'text-loss' : 'text-ink'}`}>{value}</div>
      <div className="text-xs text-muted mt-0.5 leading-snug">{label}</div>
    </div>
  )
}

function DrawBar({ market, ours }: { market: number; ours: number }) {
  const max = 50
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="w-24 text-muted shrink-0">Bookmakers</span>
        <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
          <div className="h-full bg-muted/60" style={{ width: `${Math.min(100, (market / max) * 100)}%` }} />
        </div>
        <span className="num w-12 text-right text-muted">{market}%</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="w-24 text-ink font-semibold shrink-0">Our estimate</span>
        <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
          <div className="h-full bg-accent" style={{ width: `${Math.min(100, (ours / max) * 100)}%` }} />
        </div>
        <span className="num w-12 text-right font-bold text-ink">{ours}%</span>
      </div>
    </div>
  )
}

export default function DrawAlerts() {
  const [data, setData] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    axios
      .get(`${API_URL}/draw-alerts`)
      .then(r => setData(r.data.data))
      .catch(e => setError(errorText(e)))
  }, [])

  if (error) return <div className="max-w-5xl mx-auto px-4 py-10 text-loss">{error}</div>
  if (!data) return <div className="max-w-5xl mx-auto px-4 py-10 text-muted">Loading draw alerts…</div>

  const t = data.total
  const past = showAll ? data.alerts : data.alerts.slice(0, 20)
  const h = data.history

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink">Draw alerts</h1>
        <p className="text-muted max-w-3xl leading-relaxed">
          Bookmakers tend to price draws a little too low. A draw alert means our model sees a clearly better chance of a draw than the
          bookmakers do, enough to beat their price. It is the one signal that held up in two separate seasons of testing.
        </p>
      </header>

      {/* ---------- upcoming ---------- */}
      <Card>
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold text-ink">Upcoming alerts</h2>
          <span className="text-xs text-muted">{data.upcoming.length} match{data.upcoming.length === 1 ? '' : 'es'}</span>
        </div>
        {data.upcoming.length === 0 ? (
          <p className="text-sm text-muted">
            No alerts right now. They appear when a match meets the rule, usually a few per week, and change as the odds move.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.upcoming.map(a => (
              <Link key={a.matchId} to={`/match/${a.matchId}`} className="block rounded-xl border border-line/70 bg-surface2/30 p-4 hover:bg-surface2 transition-colors">
                <div className="flex justify-between gap-2 text-xs text-muted">
                  <span className="truncate">{a.league}</span>
                  <span className="shrink-0">{when(a.date)}</span>
                </div>
                <div className="mt-1.5 font-bold text-ink leading-snug">
                  {a.home} <span className="text-muted font-normal">vs</span> {a.away}
                </div>
                <div className="mt-3">
                  <DrawBar market={a.marketDraw} ours={a.ourDraw} />
                </div>
                <div className="mt-3 flex justify-between text-xs">
                  <span className="text-muted">
                    Draw odds <span className="num text-ink font-semibold">{a.price.toFixed(2)}</span>
                  </span>
                  <span className="text-win font-semibold num">Value {sign(a.edge)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* ---------- live record ---------- */}
      <Card>
        <h2 className="text-lg font-bold text-ink mb-1">Record so far (live)</h2>
        <p className="text-sm text-muted mb-4">
          Every settled alert since tracking started, priced at the odds recorded before kick-off.
        </p>
        {t.n === 0 ? (
          <p className="text-sm text-muted">No settled alerts yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Fact value={`${t.wins} of ${t.n}`} label="alerts that ended in a draw" />
              <Fact value={`${t.hitRate ?? '–'}%`} label="draw rate on alerts" />
              <Fact value={`${data.baseline.drawRate ?? '–'}%`} label={`draw rate in all ${data.baseline.matches.toLocaleString('en-GB')} tracked matches`} />
              <Fact value={sign(t.roi)} label="profit per 100 staked at the recorded odds" tone={(t.roi ?? 0) >= 0 ? 'win' : 'loss'} />
            </div>
            {data.backfilled.n > 0 && (
              <p className="text-xs text-muted mt-3">
                {data.live.n} made live before kick-off, {data.backfilled.n} added later for matches tracked before v3 existed (those use data from
                after the match date, so read them with care).
              </p>
            )}
            <p className="text-xs text-muted mt-2">Still a small sample. A few results either way move these numbers a lot.</p>

            <div className="mt-5 overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-xs text-muted text-left border-b border-line/60">
                    <th className="py-2 px-1 font-medium">Date</th>
                    <th className="py-2 px-1 font-medium">Match</th>
                    <th className="py-2 px-1 font-medium text-right">Bookmakers</th>
                    <th className="py-2 px-1 font-medium text-right">Ours</th>
                    <th className="py-2 px-1 font-medium text-right">Odds</th>
                    <th className="py-2 px-1 font-medium text-right">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {past.map(a => (
                    <tr key={a.matchId} className="border-b border-line/30">
                      <td className="py-2 px-1 text-muted whitespace-nowrap">{day(a.date)}</td>
                      <td className="py-2 px-1">
                        <Link to={`/match/${a.matchId}`} className="text-ink hover:underline">
                          {a.home} – {a.away}
                        </Link>
                        <div className="text-xs text-muted">
                          {a.league}
                          {a.backfilled ? ' · added later' : ''}
                        </div>
                      </td>
                      <td className="py-2 px-1 text-right num text-muted">{a.marketDraw}%</td>
                      <td className="py-2 px-1 text-right num font-semibold text-ink">{a.ourDraw}%</td>
                      <td className="py-2 px-1 text-right num">{a.price.toFixed(2)}</td>
                      <td className={`py-2 px-1 text-right num font-bold ${a.won ? 'text-win' : 'text-loss'}`}>
                        {a.score ?? '–'} {a.won ? '✓' : '✗'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.alerts.length > 20 && (
              <button className="mt-3 text-sm text-accent font-semibold" onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Show fewer' : `Show all ${data.alerts.length}`}
              </button>
            )}
          </>
        )}
      </Card>

      {/* ---------- history ---------- */}
      {h.length > 0 && (
        <Card>
          <h2 className="text-lg font-bold text-ink mb-1">How the rule did on past seasons</h2>
          <p className="text-sm text-muted mb-4">
            The same rule replayed week by week, using only information from before each match, at the best draw price available early in
            the week.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {h.map(s => (
              <div key={s.season} className="rounded-xl border border-line/70 p-4">
                <div className="font-bold text-ink mb-3">{s.label}</div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Fact value={`${s.hitRate}%`} label={`draws on ${s.alerts} alerts (all matches: ${s.drawRate}%)`} />
                  <Fact value={sign(s.roi)} label="profit per 100 staked" tone={s.roi >= 0 ? 'win' : 'loss'} />
                  <Fact value={s.lineMovedOurWay === null ? '–' : `${s.lineMovedOurWay}%`} label="times the draw price then shortened toward us" />
                  <Fact value={s.matches.toLocaleString('en-GB')} label="matches checked" />
                </div>
                {s.byLeague.length > 0 && (
                  <details className="mt-3">
                    <summary className="text-xs text-muted cursor-pointer">By league</summary>
                    <table className="w-full text-xs mt-2">
                      <tbody>
                        {s.byLeague.map(l => (
                          <tr key={l.division} className="border-b border-line/30">
                            <td className="py-1 text-ink">{l.league}</td>
                            <td className="py-1 text-right num text-muted">{l.n} alerts</td>
                            <td className="py-1 text-right num">{l.hitRate}% draws</td>
                            <td className={`py-1 text-right num ${l.roi >= 0 ? 'text-win' : 'text-loss'}`}>{sign(l.roi)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ---------- how it works ---------- */}
      <Card>
        <h2 className="text-lg font-bold text-ink mb-3">How an alert is made</h2>
        <div className="space-y-2 text-sm text-muted leading-relaxed max-w-3xl">
          <p>
            <span className="text-ink font-semibold">1.</span> Our model (v3) gives the draw at least {data.rule.minV3Draw}%.
          </p>
          <p>
            <span className="text-ink font-semibold">2.</span> We don't trust the model alone. Our estimate starts from the bookmakers' draw chance and
            moves {Math.round(data.rule.k * 100)}% of the way toward the model.
          </p>
          <p>
            <span className="text-ink font-semibold">3.</span> The alert shows only if that estimate beats the draw odds by at least {data.rule.minEdge}%
            {data.rule.maxEdge ? ` and at most ${data.rule.maxEdge}%. A bigger gap usually means the model is wrong about a one-sided match, not that the bookmakers are` : ''}.
          </p>
          <p>
            <span className="text-ink font-semibold">4.</span> La Liga is left out: the signal did not hold there.
          </p>
          <p>
            <span className="text-ink font-semibold">5.</span> No alert when both teams drew {data.rule.maxStreak ?? 32}%+ of their last 20 games: the
            bookmakers already overrate the draw after a run of draws.
          </p>
          <p className="pt-2">
            The best sign that the signal is real: after an alert, the draw price usually shortens before kick-off, meaning the market moves toward
            our view. Profit is small and not guaranteed. This is information, not betting advice.
          </p>
        </div>
      </Card>
    </div>
  )
}
