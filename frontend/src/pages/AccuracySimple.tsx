import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../lib/socket'
import { errorText, useAuth } from '../lib/auth'
import AccuracyDetailed from './Accuracy'

/**
 * The public record: three numbers, every game our model predicted before kick-off.
 *  1. Match result: v3 vs the bookmakers' favourite (same games).
 *  2. Both teams to score (yes / no).
 *  3. Over / under 2.5 goals.
 * Data: /api/public/record (open to everyone). Admins can still open the detailed statistics.
 */

type Outcome = 'H' | 'D' | 'A'
interface Recent {
  matchId: number
  date: string
  competition: string | null
  home: string
  away: string
  homeCrest?: string | null
  awayCrest?: string | null
  score: string
  outcome: Outcome
  result: { pick: Outcome; hit: boolean; market: Outcome | null; marketHit: boolean | null }
  btts: { pick: boolean; hit: boolean } | null
  over25: { pick: boolean; hit: boolean } | null
  dc?: { pick: '1X' | 'X2' | '12'; hit: boolean; market: string | null; marketHit: boolean | null }
  over15?: { pick: boolean; hit: boolean } | null
  safest?: { market: string; label: string; p: number; hit: boolean }
}
interface Record_ {
  days: number
  result: { n: number; v3: number | null; market: number | null; v3Hits: number; marketHits: number }
  btts: { n: number; hitRate: number | null; hits: number; yesShare: number | null }
  over25: { n: number; hitRate: number | null; hits: number; overShare: number | null }
  doubleChance?: { n: number; v3: number | null; market: number | null; v3Hits: number; marketHits: number }
  over15?: { n: number; hitRate: number | null; hits: number; overShare: number | null }
  safest?: { n: number; hitRate: number | null; hits: number; byMarket: { market: string; n: number; hitRate: number | null }[] }
  byCompetition: { code: string; name: string; n: number; v3: number | null; market: number | null }[]
  byConfidence?: { id: string; label: string; n: number; hitRate: number | null; said: number | null; market: number | null; marketN: number }[]
  recent: Recent[]
}

const PERIODS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '3 months' },
  { days: 365, label: '1 year' }
]

const pct = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `${Math.round(x * 10) / 10}%`)

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card p-5 sm:p-6 ${className}`}>{children}</div>
}

function Bar({ v, cls }: { v: number | null; cls: string }) {
  return (
    <div className="h-3 rounded-full bg-surface2 overflow-hidden">
      <div className={`h-full rounded-full ${cls}`} style={{ width: `${Math.min(100, v ?? 0)}%` }} />
    </div>
  )
}

function Tick({ hit }: { hit: boolean | null | undefined }) {
  if (hit === null || hit === undefined) return <span className="text-faint">–</span>
  return hit ? <span className="text-win font-bold" aria-label="right">✓</span> : <span className="text-loss font-bold" aria-label="wrong">✗</span>
}

export default function AccuracySimple() {
  const { access } = useAuth()
  const [days, setDays] = useState(30)
  const [rec, setRec] = useState<Record_ | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailed, setDetailed] = useState(false)

  useEffect(() => {
    if (detailed) return
    let cancelled = false
    setLoading(true)
    axios
      .get(`${API_URL}/public/record`, { params: { days } })
      .then(r => !cancelled && (setRec(r.data.data), setError(null)))
      .catch(e => !cancelled && setError(errorText(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [days, detailed])

  if (detailed)
    return (
      <div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
          <button onClick={() => setDetailed(false)} className="text-sm text-muted hover:text-ink">
            ← Back to the public record
          </button>
        </div>
        <AccuracyDetailed />
      </div>
    )

  const r = rec?.result
  const diff = r && r.v3 !== null && r.market !== null ? Math.round((r.v3 - r.market) * 10) / 10 : null
  const name = (x: Recent, o: Outcome) => (o === 'H' ? x.home : o === 'A' ? x.away : 'Draw')

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Our record</h1>
          <p className="text-sm text-muted mt-1 max-w-xl">
            Every prediction is saved before kick-off and checked after the final whistle. Wins and losses stay here, nothing is edited.
          </p>
        </div>
        <div className="seg">
          {PERIODS.map(p => (
            <button key={p.days} onClick={() => setDays(p.days)} className={`seg-btn ${days === p.days ? 'seg-btn-active' : ''}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <Card className="text-loss text-sm">{error}</Card>}
      {loading && !rec && <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="card h-56 animate-pulse bg-surface2/60" />)}</div>}

      {rec && (
        <>
          <div>
            <h2 className="font-display text-xl font-bold text-ink">The hard bets</h2>
            <p className="text-sm text-muted">Close to a coin flip in most games. Getting these right more often than the bookmakers is the real test.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {/* 1. Match result vs the bookmakers */}
            <Card className="md:col-span-1 border-accent/40">
              <div className="label text-accent">Match result · vs the bookmakers</div>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-ink">Bet To Beat (v3)</span>
                    <span className="num text-3xl font-extrabold text-accent">{pct(r?.v3)}</span>
                  </div>
                  <Bar v={r?.v3 ?? null} cls="bg-accent" />
                </div>
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-muted">Bookmakers' favourite</span>
                    <span className="num text-3xl font-extrabold text-ink">{pct(r?.market)}</span>
                  </div>
                  <Bar v={r?.market ?? null} cls="bg-faint" />
                </div>
              </div>
              <p className="text-xs text-muted mt-4">
                {r?.n ? `${r.v3Hits} vs ${r.marketHits} right on the same ${r.n} games.` : 'No finished games with odds yet.'}
              </p>
              {diff !== null && (
                <p className={`mt-2 text-sm font-semibold ${diff >= 1 ? 'text-win' : diff <= -1 ? 'text-loss' : 'text-ink'}`}>
                  {Math.abs(diff) < 1 ? 'About level with the bookmakers.' : diff > 0 ? `${diff} points ahead of the bookmakers.` : `${-diff} points behind the bookmakers.`}
                </p>
              )}
            </Card>

            {/* 2. Both teams to score */}
            <Card>
              <div className="label">Both teams to score</div>
              <div className="num text-5xl font-extrabold text-ink mt-4">{pct(rec.btts.hitRate)}</div>
              <div className="mt-3"><Bar v={rec.btts.hitRate} cls="bg-home" /></div>
              <p className="text-xs text-muted mt-4">
                {rec.btts.n ? `${rec.btts.hits} of ${rec.btts.n} right. Yes when we give it 50%+, else No.` : 'No finished games yet.'}
              </p>
            </Card>

            {/* 3. Over / under 2.5 */}
            <Card>
              <div className="label">Over / under 2.5 goals</div>
              <div className="num text-5xl font-extrabold text-ink mt-4">{pct(rec.over25.hitRate)}</div>
              <div className="mt-3"><Bar v={rec.over25.hitRate} cls="bg-draw" /></div>
              <p className="text-xs text-muted mt-4">
                {rec.over25.n ? `${rec.over25.hits} of ${rec.over25.n} right. Over when we give it 50%+, else Under.` : 'No finished games yet.'}
              </p>
            </Card>
          </div>

          <div className="pt-2">
            <h2 className="font-display text-xl font-bold text-ink">The safer bets</h2>
            <p className="text-sm text-muted">Bets that happen more often. Higher hit rates, lower odds: each one is counted and shown on its own.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <div className="label">Double chance</div>
              <div className="num text-5xl font-extrabold text-ink mt-4">{pct(rec.doubleChance?.v3)}</div>
              <div className="mt-3"><Bar v={rec.doubleChance?.v3 ?? null} cls="bg-accent" /></div>
              <p className="text-xs text-muted mt-4">
                {rec.doubleChance?.n ? `${rec.doubleChance.v3Hits} of ${rec.doubleChance.n} right. The two results we rate highest (1X, X2 or 12).` : 'No finished games yet.'}
              </p>
            </Card>
            <Card>
              <div className="label">Over / under 1.5 goals</div>
              <div className="num text-5xl font-extrabold text-ink mt-4">{pct(rec.over15?.hitRate)}</div>
              <div className="mt-3"><Bar v={rec.over15?.hitRate ?? null} cls="bg-home" /></div>
              <p className="text-xs text-muted mt-4">
                {rec.over15?.n ? `${rec.over15.hits} of ${rec.over15.n} right. Over when we give it 50%+, else Under.` : 'No finished games yet.'}
              </p>
            </Card>
            <Card>
              <div className="label">Our safest pick of each match</div>
              <div className="num text-5xl font-extrabold text-ink mt-4">{pct(rec.safest?.hitRate)}</div>
              <div className="mt-3"><Bar v={rec.safest?.hitRate ?? null} cls="bg-draw" /></div>
              <p className="text-xs text-muted mt-4">
                {rec.safest?.n ? `${rec.safest.hits} of ${rec.safest.n} right. For every match, the one bet we were most sure about.` : 'No finished games yet.'}
              </p>
              {rec.safest && rec.safest.byMarket.length > 0 && (
                <p className="text-[11px] text-faint mt-2">
                  {rec.safest.byMarket.map(b => `${b.market} ${b.n}× (${pct(b.hitRate)})`).join(' · ')}
                </p>
              )}
            </Card>
          </div>

          {rec.byConfidence && rec.byConfidence.some(b => b.n > 0) && (
            <Card>
              <h2 className="font-display text-xl font-bold text-ink">How sure we were, and how often we were right</h2>
              <p className="text-sm text-muted mt-1 mb-4">
                Every match result pick, grouped by the chance we gave it. When our numbers are honest, the games we call at 70% should come in about 7 times in 10.
              </p>
              <div className="space-y-3">
                {rec.byConfidence.filter(b => b.n > 0).map(b => (
                  <div key={b.id} className="grid grid-cols-[110px_1fr_auto] sm:grid-cols-[140px_1fr_auto] items-center gap-3">
                    <div>
                      <div className="text-sm font-semibold text-ink">We said {b.label}</div>
                      <div className="text-[11px] text-faint num">{b.n} games · average {b.said}%</div>
                    </div>
                    <div className="relative h-3 rounded-full bg-surface2 overflow-hidden">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, b.hitRate ?? 0)}%` }} />
                      {b.said !== null && <div className="absolute top-[-2px] bottom-[-2px] w-0.5 bg-ink/70" style={{ left: `${b.said}%` }} title={`We said ${b.said}%`} />}
                    </div>
                    <div className="text-right min-w-[92px]">
                      <div className="num text-sm font-extrabold text-ink">{pct(b.hitRate)} right</div>
                      {b.market !== null && <div className="num text-[11px] text-faint">bookmakers {pct(b.market)}</div>}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-faint mt-3">The thin line on each bar is the chance we gave; the bar is how often it happened. Bookmakers: their favourite on the same games.</p>
            </Card>
          )}

          {rec.byCompetition.length > 0 && (
            <Card>
              <h2 className="font-display text-xl font-bold text-ink mb-3">Match result by competition</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="text-xs text-faint">
                      <th className="text-left font-medium py-2">Competition</th>
                      <th className="text-right font-medium py-2">Games</th>
                      <th className="text-right font-medium py-2">v3</th>
                      <th className="text-right font-medium py-2">Bookmakers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rec.byCompetition.map(c => (
                      <tr key={c.code || c.name} className="border-t border-line/50">
                        <td className="py-2">
                          {c.code ? <Link to={`/league/${c.code}`} className="text-ink hover:text-accent">{c.name}</Link> : <span className="text-ink">{c.name}</span>}
                        </td>
                        <td className="py-2 text-right num text-muted">{c.n}</td>
                        <td className={`py-2 text-right num font-bold ${(c.v3 ?? 0) >= (c.market ?? 0) ? 'text-accent' : 'text-ink'}`}>{pct(c.v3)}</td>
                        <td className="py-2 text-right num text-muted">{pct(c.market)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-faint mt-2">Competitions with at least 5 finished games in this period.</p>
            </Card>
          )}

          <Card>
            <h2 className="font-display text-xl font-bold text-ink mb-3">Latest games</h2>
            {rec.recent.length === 0 ? (
              <p className="text-sm text-muted">No finished games in this period yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[880px]">
                  <thead>
                    <tr className="text-xs text-faint">
                      <th className="text-left font-medium py-2">Match</th>
                      <th className="text-center font-medium py-2">Score</th>
                      <th className="text-left font-medium py-2">Result: our pick</th>
                      <th className="text-center font-medium py-2">Bookies</th>
                      <th className="text-left font-medium py-2">BTTS</th>
                      <th className="text-left font-medium py-2">Goals 2.5</th>
                      <th className="text-left font-medium py-2">Double chance</th>
                      <th className="text-left font-medium py-2">Goals 1.5</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rec.recent.map(x => (
                      <tr key={x.matchId} className="border-t border-line/50">
                        <td className="py-2 pr-2">
                          <Link to={`/match/${x.matchId}`} className="text-ink hover:text-accent">
                            {x.home} – {x.away}
                          </Link>
                          <div className="text-[11px] text-faint">
                            {new Date(x.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {x.competition}
                          </div>
                        </td>
                        <td className="py-2 text-center num font-bold text-ink">{x.score}</td>
                        <td className="py-2">
                          <span className="inline-flex items-center gap-1.5"><Tick hit={x.result.hit} /> <span className="text-muted truncate">{name(x, x.result.pick)}</span></span>
                        </td>
                        <td className="py-2 text-center"><Tick hit={x.result.marketHit} /></td>
                        <td className="py-2">
                          {x.btts ? <span className="inline-flex items-center gap-1.5"><Tick hit={x.btts.hit} /> <span className="text-muted">{x.btts.pick ? 'Yes' : 'No'}</span></span> : <span className="text-faint">–</span>}
                        </td>
                        <td className="py-2">
                          {x.over25 ? <span className="inline-flex items-center gap-1.5"><Tick hit={x.over25.hit} /> <span className="text-muted">{x.over25.pick ? 'Over' : 'Under'}</span></span> : <span className="text-faint">–</span>}
                        </td>
                        <td className="py-2">
                          {x.dc ? <span className="inline-flex items-center gap-1.5"><Tick hit={x.dc.hit} /> <span className="text-muted">{x.dc.pick}</span></span> : <span className="text-faint">–</span>}
                        </td>
                        <td className="py-2">
                          {x.over15 ? <span className="inline-flex items-center gap-1.5"><Tick hit={x.over15.hit} /> <span className="text-muted">{x.over15.pick ? 'Over' : 'Under'}</span></span> : <span className="text-faint">–</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <p className="text-xs text-faint">
            Match result: our most likely result vs the bookmakers' favourite (the lowest odds), counted only on games where we have both.
            Every tracked competition: leagues, national teams and European cups. Predictions are probabilities, not promises.
          </p>
        </>
      )}

      {access === 'admin' && (
        <div className="text-center">
          <button onClick={() => setDetailed(true)} className="text-sm text-muted hover:text-ink underline underline-offset-4">
            Admin: detailed statistics (calibration, backtests, all models)
          </button>
        </div>
      )}
    </div>
  )
}
