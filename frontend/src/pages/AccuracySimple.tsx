import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../lib/socket'
import { errorText } from '../lib/auth'
import AccuracyDetailed from './Accuracy'

type Outcome = 'H' | 'D' | 'A'

interface Tier { min: number; n: number; share: number; hitRate: number | null; roi: number | null; market: { n: number; hitRate: number } | null }
interface Metrics {
  settled: number
  model: { hitRate: number; brier: number; logLoss: number } | null
  market: { n: number; hitRate: number; brier: number; logLoss: number } | null
  betting: { favourite: { bets: number; wins: number; profit: number; roi: number } } | null
  strongPicks?: Tier[]
  twoOptions?: { n: number; hitRate: number | null; closeGames: { n: number; hitRate: number | null }; roi: number | null }
  drawAlerts?: { n: number; wins: number; hitRate: number | null; roi: number | null }
  pending?: number
}
interface Settled {
  matchId: number
  date: string
  competition: string | null
  home: string
  away: string
  score: string
  outcome: Outcome
  pick: Outcome
  hit: boolean
  p: Record<Outcome, number>
}

const PERIODS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 3 months' },
  { days: 365, label: 'Last year' }
]

/** Whose eyes the page looks through. "main" = every game, each seen by our best model for it. */
const VIEWS = [
  { key: 'main', label: 'v3', who: 'Our model (v3)', note: 'Every tracked game: leagues, national teams and European cups. One model for all football, with an engine for each kind of match.' },
  { key: 'dc-history-v2', label: 'v2', who: 'Older model (v2)', note: 'Our first model. It only covers league matches.' },
  { key: 'market', label: 'Bookmakers', who: 'The bookmakers', note: 'Every tracked game seen through the betting odds. Their pick = the favourite.' }
] as const
type ViewKey = (typeof VIEWS)[number]['key']

const pct = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `${Math.round(x)}%`)

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card p-5 sm:p-6 ${className}`}>{children}</div>
}

function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
      {sub && <p className="text-sm text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

/** One big number with a label, e.g. "52% · Our model". */
function Score({ name, hit, n, best, note }: { name: string; hit: number | null; n: number; best: boolean; note: string }) {
  return (
    <div className={`rounded-2xl border p-5 ${best ? 'border-accent/60 bg-accent/10' : 'border-line bg-surface2/40'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{name}</span>
        {best && <span className="text-[11px] font-bold uppercase tracking-wider text-accent">Best</span>}
      </div>
      <div className={`num text-4xl font-extrabold mt-2 ${best ? 'text-accent' : 'text-ink'}`}>{pct(hit)}</div>
      <div className="text-xs text-muted mt-1">
        {hit !== null && n ? `${Math.round((hit / 100) * n)} of ${n} picks were right` : 'no finished matches yet'}
      </div>
      <div className="text-[11px] text-faint mt-2">{note}</div>
    </div>
  )
}

/** Horizontal bar: "When we give 60%+ → it happens 71% of the time". */
function ConfidenceRow({ t }: { t: Tier }) {
  const hit = t.hitRate ?? 0
  return (
    <div className="grid grid-cols-[88px_1fr_76px] sm:grid-cols-[120px_1fr_96px] items-center gap-3">
      <div className="text-sm text-muted">
        We said <span className="font-semibold text-ink">{t.min}%+</span>
      </div>
      <div className="h-3 rounded-full bg-surface2 overflow-hidden">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(100, hit)}%` }} />
      </div>
      <div className="text-right">
        <div className="num text-sm font-bold text-ink">{t.hitRate !== null ? `${Math.round(hit)}% right` : '–'}</div>
        <div className="text-[11px] text-faint num">{t.n} matches</div>
      </div>
    </div>
  )
}

function Verdict({ v3, market }: { v3: number | null; market: number | null }) {
  if (v3 === null || market === null) return null
  const d = Math.round((v3 - market) * 10) / 10
  const text =
    Math.abs(d) < 1
      ? 'Our model and the bookmakers picked the right result about equally often.'
      : d > 0
        ? `Our model picked the right result ${d} points more often than the bookmakers' favourite.`
        : `The bookmakers' favourite was right ${-d} points more often than our model.`
  return (
    <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${d >= 1 ? 'bg-win/10 text-win' : d <= -1 ? 'bg-loss/10 text-loss' : 'bg-surface2 text-ink'}`}>{text}</div>
  )
}

export default function AccuracySimple() {
  const [days, setDays] = useState(30)
  const [v3, setV3] = useState<Metrics | null>(null)
  const [v2, setV2] = useState<Metrics | null>(null)
  const [mkt, setMkt] = useState<Metrics | null>(null)
  const [view, setView] = useState<ViewKey>('main')
  const [recent, setRecent] = useState<Settled[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailed, setDetailed] = useState(false)

  useEffect(() => {
    if (detailed) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      axios.get(`${API_URL}/accuracy`, { params: { days, model: 'main' } }),
      axios.get(`${API_URL}/accuracy`, { params: { days, model: 'dc-history-v2' } }),
      axios.get(`${API_URL}/accuracy`, { params: { days, model: 'market' } }),
      axios.get(`${API_URL}/accuracy/recent`, { params: { days, model: view, limit: 15 } })
    ])
      .then(([a, b, c, r]) => {
        if (cancelled) return
        setV3(a.data.data)
        setV2(b.data.data)
        setMkt(c.data.data)
        setRecent(r.data.data || [])
        setError(null)
      })
      .catch(e => !cancelled && setError(errorText(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [days, detailed, view])

  if (detailed)
    return (
      <div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
          <button onClick={() => setDetailed(false)} className="text-sm text-muted hover:text-ink">
            ← Back to the simple view
          </button>
        </div>
        <AccuracyDetailed />
      </div>
    )

  const sel = view === 'main' ? v3 : view === 'market' ? mkt : v2
  const hitV3 = v3?.model?.hitRate ?? null
  const hitV2 = v2?.model?.hitRate ?? null
  const hitMkt = mkt?.model?.hitRate ?? null
  const best = Math.max(hitV3 ?? -1, hitV2 ?? -1, hitMkt ?? -1)
  const tiers = (sel?.strongPicks || []).filter(t => t.n > 0)
  const bet = sel?.betting?.favourite
  const empty = !loading && (!sel || !sel.settled)
  const vw = VIEWS.find(v => v.key === view)!
  const isMarket = view === 'market'
  const leagueOnly = v3 && v2 && v3.settled > v2.settled ? v3.settled - v2.settled : 0

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">How accurate are we?</h1>
        <p className="text-sm text-muted mt-1">
          Every prediction is saved before kick-off and checked after the final whistle. Nothing is edited afterwards.
        </p>
        <div className="mt-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-faint mb-2">Look through the eyes of</div>
          <div className="inline-flex flex-wrap rounded-xl border border-line p-1 gap-1 bg-surface2/40">
            {VIEWS.map(v => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  view === v.key ? 'bg-accent text-bg' : 'text-muted hover:text-ink'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-faint mt-2">{vw.note}</p>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {PERIODS.map(p => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                days === p.days ? 'bg-accent text-bg border-accent' : 'border-line text-muted hover:text-ink'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="rounded-xl border border-loss/40 bg-loss/10 px-4 py-3 text-sm text-loss">{error}</div>}
      {loading && <div className="text-sm text-faint">Loading…</div>}

      {empty && (
        <Card>
          <p className="text-ink font-semibold">No finished matches in this period yet.</p>
          <p className="text-sm text-muted mt-1">Pick a longer period above.</p>
        </Card>
      )}

      {!loading && sel && sel.settled > 0 && (
        <>
          {/* 0. The selected view */}
          <Card className="border-accent/40">
            <div className="text-sm text-muted">{vw.who}</div>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-1 mt-1">
              <div className="num text-5xl font-extrabold text-accent">{pct(sel.model?.hitRate)}</div>
              <div className="text-sm text-muted pb-1.5">
                {sel.model ? `${Math.round((sel.model.hitRate / 100) * sel.settled)} of ${sel.settled} picks were right` : ''}
                {typeof sel.pending === 'number' && sel.pending > 0 && <span className="text-faint"> · {sel.pending} predictions waiting for a result</span>}
              </div>
            </div>
          </Card>
        </>
      )}

      {!loading && v3 && v3.settled > 0 && (
        <>
          {/* 1. Who picks the winner most often */}
          <Card>
            <Heading title="Who picks the right result most often?" sub="Each one on every finished game it predicted · the pick = the most likely result (home, draw or away)" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Score name="Our model (v3)" hit={hitV3} n={v3.settled} best={hitV3 === best} note="All football: leagues, national teams, cups" />
              <Score name="Bookmakers" hit={hitMkt} n={mkt?.settled || 0} best={hitMkt === best} note="The favourite in the betting odds" />
              <Score name="Older model (v2)" hit={hitV2} n={v2?.settled || 0} best={hitV2 === best} note="Our first model, league matches only" />
            </div>
            <Verdict v3={hitV3} market={hitMkt} />
            {(leagueOnly > 0 || (mkt && v3.settled > mkt.settled)) && (
              <p className="text-xs text-faint mt-3">
                {leagueOnly > 0 ? `v2 has ${leagueOnly} fewer games because it does not predict national teams or cups. ` : ''}
                {mkt && v3.settled > mkt.settled ? `The bookmakers have ${v3.settled - mkt.settled} fewer because their odds were not recorded for those games (from now on they are).` : ''}
              </p>
            )}
          </Card>
        </>
      )}

      {!loading && sel && sel.settled > 0 && (
        <>

          {/* 2. Confidence */}
          {tiers.length > 0 && (
            <Card>
              <Heading
                title={isMarket ? 'When the bookmakers are confident, are they right?' : "When we're confident, are we right?"}
                sub={`${vw.who}. The higher the chance, the more often it should happen.`}
              />
              <div className="space-y-2.5">
                {tiers.map(t => (
                  <ConfidenceRow key={t.min} t={t} />
                ))}
              </div>
              <p className="text-xs text-faint mt-3">
                Example: "We said 60%+ → right 71%" means that in matches where our model gave one result 60% or more, that result
                happened 71% of the time.
              </p>
            </Card>
          )}

          {/* 3. Two options + draws */}
          {((sel.twoOptions && sel.twoOptions.n > 0) || (sel.drawAlerts && sel.drawAlerts.n > 0)) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sel.twoOptions && sel.twoOptions.n > 0 && (
                <Card>
                  <div className="text-sm font-semibold text-ink">Two options</div>
                  <div className="num text-4xl font-extrabold text-ink mt-2">{pct(sel.twoOptions.hitRate)}</div>
                  <p className="text-sm text-muted mt-1">
                    If you take {isMarket ? "the bookmakers'" : 'our'} two most likely results (for example "home or draw"), one of them happened this often, over{' '}
                    {sel.twoOptions.n} matches.
                  </p>
                </Card>
              )}
              {!isMarket && view !== 'dc-history-v2' && sel.drawAlerts && sel.drawAlerts.n > 0 && (
                <Card className="border-draw/40">
                  <div className="text-sm font-semibold text-ink">Draw alerts</div>
                  <div className="num text-4xl font-extrabold text-draw mt-2">
                    {sel.drawAlerts.wins} <span className="text-lg text-muted font-semibold">of {sel.drawAlerts.n}</span>
                  </div>
                  <p className="text-sm text-muted mt-1">
                    Matches where we flagged a likely draw that the bookmakers underrated. A draw alert only needs to hit about 1 time in 3–4
                    to pay off, because draws pay around 3.5×.
                  </p>
                </Card>
              )}
            </div>
          )}

          {/* 4. Money */}
          {bet && bet.bets > 0 && (
            <Card>
              <Heading title="Would it have made money?" sub={`If you had put the same small bet on every one of ${isMarket ? "the bookmakers' favourites" : 'our picks'}, at the bookmakers' odds:`} />
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                <div>
                  <div className={`num text-4xl font-extrabold ${bet.profit >= 0 ? 'text-win' : 'text-loss'}`}>
                    {bet.roi > 0 ? '+' : ''}
                    {bet.roi}%
                  </div>
                  <div className="text-xs text-muted mt-1">return on money staked</div>
                </div>
                <div className="text-sm text-muted">
                  {bet.bets} bets · {bet.wins} won · {bet.profit >= 0 ? 'profit' : 'loss'} of{' '}
                  <span className={`num font-semibold ${bet.profit >= 0 ? 'text-win' : 'text-loss'}`}>{Math.abs(Math.round(bet.profit * 10) / 10)}</span>{' '}
                  units
                  <div className="text-xs text-faint mt-0.5">1 unit = the amount of each bet (e.g. ₪10 per bet → ×10)</div>
                </div>
              </div>
              <p className="text-xs text-faint mt-3">
                Picking winners is not the same as making money: favourites win often but pay little. Short periods swing a lot — look
                at 3 months or more.
              </p>
            </Card>
          )}

          {/* 5. Latest */}
          {recent.length > 0 && (
            <Card>
              <Heading title="Latest results" sub={`${vw.who}: the pick before the match, and what happened`} />
              <ul className="divide-y divide-line/60">
                {recent.map(r => {
                  const pickName = r.pick === 'H' ? r.home : r.pick === 'A' ? r.away : 'Draw'
                  return (
                    <li key={r.matchId} className="py-2.5 flex items-center gap-3">
                      <span
                        className={`w-7 h-7 shrink-0 rounded-full grid place-items-center text-sm font-bold ${
                          r.hit ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'
                        }`}
                        aria-label={r.hit ? 'right' : 'wrong'}
                      >
                        {r.hit ? '✓' : '✗'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link to={`/match/${r.matchId}`} className="text-sm text-ink hover:text-accent truncate block">
                          {r.home} <span className="num font-semibold">{r.score}</span> {r.away}
                        </Link>
                        <div className="text-xs text-faint truncate">
                          {new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          {r.competition ? ` · ${r.competition}` : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted">{isMarket ? 'Favourite' : 'We picked'}</div>
                        <div className="text-sm font-semibold text-ink">
                          {pickName} <span className="num text-faint font-normal">{Math.round(r.p[r.pick])}%</span>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}
        </>
      )}

      <div className="text-center pt-2">
        <button onClick={() => setDetailed(true)} className="text-sm text-muted hover:text-ink underline underline-offset-4">
          Show all detailed statistics (calibration, backtests, leagues…)
        </button>
      </div>
    </div>
  )
}
