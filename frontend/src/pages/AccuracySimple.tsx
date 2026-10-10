import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../lib/socket'
import { errorText, useAuth } from '../lib/auth'
import AccuracyDetailed from './Accuracy'
import { t, LOCALE } from '../lib/i18n'
import { Flag } from '../components/LeagueSidebar'
import { footballCountry, leagueShortName } from '../lib/leagueCountry'

/**
 * The public record: three numbers, every game our model predicted before kick-off.
 *  1. Match result: how often our most likely result happened (every finished game).
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
  result: { pick: Outcome; hit: boolean }
  btts: { pick: boolean; hit: boolean } | null
  over25: { pick: boolean; hit: boolean } | null
  dc?: { pick: '1X' | 'X2' | '12'; hit: boolean }
  over15?: { pick: boolean; hit: boolean } | null
  safest?: { market: string; label: string; p: number; hit: boolean }
}
interface Record_ {
  days: number
  result: { n: number; v3: number | null; v3Hits: number }
  btts: { n: number; hitRate: number | null; hits: number; yesShare: number | null }
  over25: { n: number; hitRate: number | null; hits: number; overShare: number | null }
  doubleChance?: { n: number; v3: number | null; v3Hits: number }
  over15?: { n: number; hitRate: number | null; hits: number; overShare: number | null }
  safest?: { n: number; hitRate: number | null; hits: number; byMarket: { market: string; n: number; hitRate: number | null }[] }
  byCompetition: { code: string; name: string; n: number; v3: number | null; btts?: number | null; over25?: number | null }[]
  calibration?: { lo: number; hi: number; n: number; said: number; happened: number | null }[]
  byConfidence?: { id: string; label: string; n: number; hitRate: number | null; said: number | null }[]
  recent: Recent[]
}

const PERIODS = [
  { days: 7, label: t("7 days") },
  { days: 30, label: t("30 days") },
  { days: 90, label: t("3 months") },
  { days: 365, label: t("1 year") }
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
  return hit ? <span className="text-win font-bold" aria-label={t("right")}>✓</span> : <span className="text-loss font-bold" aria-label={t("wrong")}>✗</span>
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
            {t("← Back to the public record")}</button>
        </div>
        <AccuracyDetailed />
      </div>
    )

  const r = rec?.result
  const name = (x: Recent, o: Outcome) => (o === 'H' ? x.home : o === 'A' ? x.away : 'Draw')

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{t("Our record")}</h1>
          <p className="text-sm text-muted mt-1 max-w-xl">
            {t("Every prediction is saved before kick-off and checked after the final whistle. Wins and losses stay here, nothing is edited.")}</p>
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
            <h2 className="font-display text-xl font-bold text-ink">{t("The hard calls")}</h2>
            <p className="text-sm text-muted">{t("Close to a coin flip in most games. This is where a model shows what it is worth.")}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {/* 1. Match result */}
            <Card className="border-accent/40">
              <div className="label text-accent">{t("Match result")}</div>
              <div className="num text-5xl font-extrabold text-accent mt-4">{pct(r?.v3)}</div>
              <div className="mt-3"><Bar v={r?.v3 ?? null} cls="bg-accent" /></div>
              <p className="text-xs text-muted mt-4">
                {r?.n ? t("{0} of {1} right. Our most likely result: home win, draw or away win.", { 0: r.v3Hits, 1: r.n }) : t("No finished games yet.")}
              </p>
            </Card>

            {/* 2. Both teams to score */}
            <Card>
              <div className="label">{t("Both teams to score")}</div>
              <div className="num text-5xl font-extrabold text-ink mt-4">{pct(rec.btts.hitRate)}</div>
              <div className="mt-3"><Bar v={rec.btts.hitRate} cls="bg-home" /></div>
              <p className="text-xs text-muted mt-4">
                {rec.btts.n ? t("{0} of {1} right. Yes when we give it 50%+, else No.", { 0: rec.btts.hits, 1: rec.btts.n }) : t("No finished games yet.")}
              </p>
            </Card>

            {/* 3. Over / under 2.5 */}
            <Card>
              <div className="label">{t("Over / under 2.5 goals")}</div>
              <div className="num text-5xl font-extrabold text-ink mt-4">{pct(rec.over25.hitRate)}</div>
              <div className="mt-3"><Bar v={rec.over25.hitRate} cls="bg-draw" /></div>
              <p className="text-xs text-muted mt-4">
                {rec.over25.n ? t("{0} of {1} right. Over when we give it 50%+, else Under.", { 0: rec.over25.hits, 1: rec.over25.n }) : t("No finished games yet.")}
              </p>
            </Card>
          </div>

          <div className="pt-2">
            <h2 className="font-display text-xl font-bold text-ink">{t("The safer calls")}</h2>
            <p className="text-sm text-muted">{t("Calls that come in more often. Each one is counted and shown on its own.")}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <div className="label">{t("Double chance")}</div>
              <div className="num text-5xl font-extrabold text-ink mt-4">{pct(rec.doubleChance?.v3)}</div>
              <div className="mt-3"><Bar v={rec.doubleChance?.v3 ?? null} cls="bg-accent" /></div>
              <p className="text-xs text-muted mt-4">
                {rec.doubleChance?.n ? t("{0} of {1} right. The two results we rate highest (1X, X2 or 12).", { 0: rec.doubleChance.v3Hits, 1: rec.doubleChance.n }) : t("No finished games yet.")}
              </p>
            </Card>
            <Card>
              <div className="label">{t("Over / under 1.5 goals")}</div>
              <div className="num text-5xl font-extrabold text-ink mt-4">{pct(rec.over15?.hitRate)}</div>
              <div className="mt-3"><Bar v={rec.over15?.hitRate ?? null} cls="bg-home" /></div>
              <p className="text-xs text-muted mt-4">
                {rec.over15?.n ? t("{0} of {1} right. Over when we give it 50%+, else Under.", { 0: rec.over15.hits, 1: rec.over15.n }) : t("No finished games yet.")}
              </p>
            </Card>
            <Card>
              <div className="label">{t("Our safest pick of each match")}</div>
              <div className="num text-5xl font-extrabold text-ink mt-4">{pct(rec.safest?.hitRate)}</div>
              <div className="mt-3"><Bar v={rec.safest?.hitRate ?? null} cls="bg-draw" /></div>
              <p className="text-xs text-muted mt-4">
                {rec.safest?.n ? t("{0} of {1} right. For every match, the one bet we were most sure about.", { 0: rec.safest.hits, 1: rec.safest.n }) : t("No finished games yet.")}
              </p>
              {rec.safest && rec.safest.byMarket.length > 0 && (
                <p className="text-[11px] text-faint mt-2">
                  {rec.safest.byMarket.map(b => `${b.market} ${b.n}× (${pct(b.hitRate)})`).join(' · ')}
                </p>
              )}
            </Card>
          </div>

          {((rec.calibration && rec.calibration.some(b => b.n >= 10)) || (rec.byConfidence && rec.byConfidence.some(b => b.n > 0))) && (
            <Card>
              <h2 className="font-display text-xl font-bold text-ink">{t("When we say 70%, does it happen 70% of the time?")}</h2>
              <p className="text-sm text-muted mt-1 mb-5 max-w-3xl">
                {t("Every chance we gave, for every result of every match (home win, draw and away win), grouped by the number we said. If our numbers are honest, the dots sit on the dashed line.")}</p>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr] items-start">
                {rec.calibration && <CalibrationChart bins={rec.calibration.filter(b => b.n >= 10)} />}
                {rec.byConfidence && rec.byConfidence.some(b => b.n > 0) && (
                  <div>
                    <div className="label pb-2">{t("Our picks, by how sure we were")}</div>
                    <div className="space-y-3">
                      {rec.byConfidence.filter(b => b.n > 0).map(b => (
                        <div key={b.id} className="grid grid-cols-[110px_1fr_auto] sm:grid-cols-[140px_1fr_auto] items-center gap-3">
                          <div>
                            <div className="text-sm font-semibold text-ink">{t("We said")}{' '}{b.label}</div>
                            <div className="text-[11px] text-faint num">{b.n} {t("games · average")}{' '}{b.said}%</div>
                          </div>
                          <div className="relative h-3 rounded-full bg-surface2 overflow-hidden">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, b.hitRate ?? 0)}%` }} />
                            {b.said !== null && <div className="absolute top-[-2px] bottom-[-2px] w-0.5 bg-ink/70" style={{ left: `${b.said}%` }} title={t("We said {0}%", { 0: b.said })} />}
                          </div>
                          <div className="text-right min-w-[92px]">
                            <div className="num text-sm font-extrabold text-ink">{pct(b.hitRate)} {t("right")}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-faint mt-3">{t("The thin line on each bar is the chance we gave; the bar is how often it happened.")}</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {rec.byCompetition.length > 0 && (
            <Card>
              <h2 className="font-display text-xl font-bold text-ink">{t("Our record by competition")}</h2>
              <p className="text-sm text-muted mt-1 mb-4">{t("How often each call was right, league by league, in the period you picked.")}</p>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-faint">
                      <th className="text-left font-semibold py-2 px-1">{t("Competition")}</th>
                      <th className="text-right font-semibold py-2 px-1 w-14">{t("Games")}</th>
                      <th className="text-left font-semibold py-2 px-2 w-44">{t("Match result")}</th>
                      <th className="text-right font-semibold py-2 px-1 w-16">{t("BTTS")}</th>
                      <th className="text-right font-semibold py-2 px-1 w-20">{t("Goals 2.5")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rec.byCompetition.map(c => {
                      const few = c.n < 20
                      return (
                        <tr key={c.code || c.name} className="border-t border-line/50">
                          <td className="py-2 px-1">
                            <span className="flex items-center gap-2 min-w-0">
                              <Flag code={footballCountry({ code: c.code, name: c.name })} size={16} />
                              {c.code ? <Link to={`/league/${c.code}`} className="text-ink hover:text-accent truncate">{leagueShortName(c.name)}</Link> : <span className="text-ink truncate">{leagueShortName(c.name)}</span>}
                              {few && <span className="shrink-0 rounded px-1 text-[9px] font-semibold text-faint bg-surface2" title={t("Under 20 games: too few to judge yet")}>{t("few games")}</span>}
                            </span>
                          </td>
                          <td className="py-2 px-1 text-right num text-muted">{c.n}</td>
                          <td className="py-2 px-2">
                            <span className="flex items-center gap-2">
                              <span className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden"><span className={`block h-full rounded-full ${few ? 'bg-accent/50' : 'bg-accent'}`} style={{ width: `${Math.min(100, c.v3 ?? 0)}%` }} /></span>
                              <span className={`num font-bold w-11 text-right ${few ? 'text-muted' : 'text-accent'}`}>{pct(c.v3)}</span>
                            </span>
                          </td>
                          <td className="py-2 px-1 text-right num text-muted">{pct(c.btts)}</td>
                          <td className="py-2 px-1 text-right num text-muted">{pct(c.over25)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-faint mt-2">{t("Competitions with at least 5 finished games in this period. Under 20 games is too few to judge a competition: pick a longer period for a fairer picture.")}</p>
            </Card>
          )}

          <Card>
            <h2 className="font-display text-xl font-bold text-ink mb-3">{t("Latest games")}</h2>
            {rec.recent.length === 0 ? (
              <p className="text-sm text-muted">{t("No finished games in this period yet.")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead>
                    <tr className="text-xs text-faint">
                      <th className="text-left font-medium py-2">{t("Match")}</th>
                      <th className="text-center font-medium py-2">{t("Score")}</th>
                      <th className="text-left font-medium py-2">{t("Result: our pick")}</th>
                      <th className="text-left font-medium py-2">{t("BTTS")}</th>
                      <th className="text-left font-medium py-2">{t("Goals 2.5")}</th>
                      <th className="text-left font-medium py-2">{t("Double chance")}</th>
                      <th className="text-left font-medium py-2">{t("Goals 1.5")}</th>
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
                            {new Date(x.date).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })} · {x.competition}
                          </div>
                        </td>
                        <td className="py-2 text-center num font-bold text-ink">{x.score}</td>
                        <td className="py-2">
                          <span className="inline-flex items-center gap-1.5"><Tick hit={x.result.hit} /> <span className="text-muted truncate">{name(x, x.result.pick)}</span></span>
                        </td>
                        <td className="py-2">
                          {x.btts ? <span className="inline-flex items-center gap-1.5"><Tick hit={x.btts.hit} /> <span className="text-muted">{x.btts.pick ? t("Yes") : t("No")}</span></span> : <span className="text-faint">–</span>}
                        </td>
                        <td className="py-2">
                          {x.over25 ? <span className="inline-flex items-center gap-1.5"><Tick hit={x.over25.hit} /> <span className="text-muted">{x.over25.pick ? t("Over") : t("Under")}</span></span> : <span className="text-faint">–</span>}
                        </td>
                        <td className="py-2">
                          {x.dc ? <span className="inline-flex items-center gap-1.5"><Tick hit={x.dc.hit} /> <span className="text-muted">{x.dc.pick}</span></span> : <span className="text-faint">–</span>}
                        </td>
                        <td className="py-2">
                          {x.over15 ? <span className="inline-flex items-center gap-1.5"><Tick hit={x.over15.hit} /> <span className="text-muted">{x.over15.pick ? t("Over") : t("Under")}</span></span> : <span className="text-faint">–</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <p className="text-xs text-faint">
            {t("Match result: our most likely result, counted on every finished game. Every tracked competition: leagues, national teams and European cups. Predictions are probabilities, not promises.")}</p>
        </>
      )}

      {access === 'admin' && (
        <div className="text-center">
          <button onClick={() => setDetailed(true)} className="text-sm text-muted hover:text-ink underline underline-offset-4">
            {t("Founder: detailed statistics (calibration, backtests, all models)")}</button>
        </div>
      )}
    </div>
  )
}

/** Reliability chart: what we said (x) against how often it happened (y); the dashed diagonal is perfect. */
function CalibrationChart({ bins }: { bins: { lo: number; hi: number; n: number; said: number; happened: number | null }[] }) {
  if (!bins.length) return null
  const W = 320, H = 320, P = 44
  const x = (v: number) => P + (v / 100) * (W - P - 10)
  const y = (v: number) => H - P - (v / 100) * (H - P - 10)
  const maxN = Math.max(...bins.map(b => b.n))
  const pts = bins.filter(b => b.happened !== null)
  return (
    <div className="rounded-2xl border border-line/60 bg-surface2/30 p-3 w-full max-w-[420px] mx-auto lg:mx-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t('Calibration chart')}>
        {[0, 20, 40, 60, 80, 100].map(v => (
          <g key={v}>
            <line x1={x(0)} x2={x(100)} y1={y(v)} y2={y(v)} stroke="rgb(var(--line))" strokeOpacity="0.5" />
            <text x={P - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="rgb(var(--faint))">{v}%</text>
            <text x={x(v)} y={H - P + 14} textAnchor="middle" fontSize="9" fill="rgb(var(--faint))">{v}%</text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(100)} y2={y(100)} stroke="rgb(var(--ink))" strokeOpacity="0.35" strokeDasharray="4 4" />
        <polyline fill="none" stroke="rgb(var(--accent))" strokeWidth="2" points={pts.map(b => `${x(b.said)},${y(b.happened!)}`).join(' ')} />
        {pts.map(b => (
          <g key={b.lo}>
            <circle cx={x(b.said)} cy={y(b.happened!)} r={3 + 6 * Math.sqrt(b.n / maxN)} fill="rgb(var(--accent))" fillOpacity="0.85" stroke="rgb(var(--bg))" strokeWidth="1.5">
              <title>{t('We said {0}%, it happened {1}% of the time ({2} results)', { 0: b.said, 1: b.happened, 2: b.n })}</title>
            </circle>
          </g>
        ))}
        <text x={(x(0) + x(100)) / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="rgb(var(--muted))">{t('The chance we gave')}</text>
        <text x={9} y={(y(0) + y(100)) / 2} textAnchor="middle" fontSize="10" fill="rgb(var(--muted))" transform={`rotate(-90 9 ${(y(0) + y(100)) / 2})`}>{t('How often it happened')}</text>
      </svg>
      <p className="text-[11px] text-faint px-1">{t('Bigger dots = more results. Hover a dot for the numbers.')}</p>
    </div>
  )
}
