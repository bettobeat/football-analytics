import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

/*
 * Team analysis on the team page: strengths & weaknesses, how our model rates the team (with a 6-month trend),
 * form & trends (last 5 / 10, home / away, xG) and our record on the team's games. Paid plans get everything;
 * free and signed-out visitors see our record on the team (it is public anyway) and a locked preview.
 */

interface Summary {
  n: number; won: number; drawn: number; lost: number; points: number; ppg: number; gf: number; ga: number
  cleanSheets: number; failedToScore: number; btts: number; over25: number
  xg: { n: number; for: number; against: number; goalsFor: number; goalsAgainst: number } | null
}
interface Game { date: string; home: boolean; opp: string; oppLogo: string; gf: number; ga: number; xgf: number | null; xga: number | null; res: 'W' | 'D' | 'L' }
interface TrendPoint { date: string; elo: number; rank: number; attack: number; defence: number }
interface Model {
  teams: number; played: number; rank: number; elo: number; attack: number; defence: number; leagueGoals: number
  ppg: number; homePpg: number; awayPpg: number; formPts: number; drawRate: number; squadEur: number | null
  scores: Record<string, number>; trend: TrendPoint[]
}
interface RecordGame { matchId: number; date: string; comp: string | null; home: boolean; opp: string; score: string; pick: string; hit: boolean }
interface TeamRecord {
  n: number; hits?: number; hitRate?: number | null
  market?: { n: number; hitRate: number | null } | null
  btts?: { n: number; hitRate: number | null } | null
  over25?: { n: number; hitRate: number | null } | null
  games?: RecordGame[]
}
export interface Analysis {
  locked?: boolean
  notesCount?: number
  model?: Model | null
  national?: { elo: number; rank: number; teams: number; matches: number } | null
  form?: { source: 'league' | 'all'; last5: Summary | null; last10: Summary | null; home: Summary | null; away: Summary | null; games: Game[] }
  record: TeamRecord
  notes?: { kind: 'plus' | 'minus' | 'note'; text: string }[]
}

const RES_BG = { W: 'bg-win', D: 'bg-draw', L: 'bg-loss' }
const ord = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 || [11, 12, 13].includes(n % 100) ? 0 : n % 10]}`
const shortDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

function Block({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-sm font-bold text-ink">{title}</h3>
        {sub && <span className="text-[11px] text-faint">{sub}</span>}
      </div>
      {children}
    </div>
  )
}

function NoteIcon({ kind }: { kind: 'plus' | 'minus' | 'note' }) {
  if (kind === 'plus')
    return (
      <span className="w-5 h-5 rounded-full bg-win/15 text-win grid place-items-center flex-shrink-0" aria-label="Strength">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
      </span>
    )
  if (kind === 'minus')
    return (
      <span className="w-5 h-5 rounded-full bg-loss/15 text-loss grid place-items-center flex-shrink-0" aria-label="Weakness">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M5 12h14" /></svg>
      </span>
    )
  return (
    <span className="w-5 h-5 rounded-full bg-home/15 text-home grid place-items-center flex-shrink-0" aria-label="Note">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M12 8h.01M12 12v5" /></svg>
    </span>
  )
}

/** 1–10 score as a thin bar with the value. */
function ScoreBar({ label, v }: { label: string; v: number | undefined }) {
  if (v === undefined || v === null) return null
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs text-muted">{label}</span>
      <span className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(4, Math.min(100, v * 10))}%` }} />
      </span>
      <span className="w-8 text-right text-xs font-bold text-ink num">{v.toFixed(1)}</span>
    </div>
  )
}

/** League rank by our rating over the last months (1 at the top). Single series: the title names it. */
function RankTrend({ points, teams }: { points: TrendPoint[]; teams: number }) {
  const [hover, setHover] = useState<number | null>(null)
  if (points.length < 2) return null
  const W = 320, H = 110, padL = 26, padR = 10, padT = 10, padB = 22
  const maxRank = Math.max(teams, ...points.map(p => p.rank))
  const x = (i: number) => padL + (i / (points.length - 1)) * (W - padL - padR)
  const y = (r: number) => padT + ((r - 1) / Math.max(1, maxRank - 1)) * (H - padT - padB)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rank).toFixed(1)}`).join(' ')
  const h = hover !== null ? points[hover] : null
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`League rank by our rating: ${points.map(p => `${shortDate(p.date)} #${p.rank}`).join(', ')}`}>
        {[1, Math.round((maxRank + 1) / 2), maxRank].map(r => (
          <g key={r}>
            <line x1={padL} x2={W - padR} y1={y(r)} y2={y(r)} stroke="rgb(var(--line))" strokeWidth="1" strokeDasharray={r === 1 ? undefined : '2 4'} />
            <text x={padL - 6} y={y(r) + 3} textAnchor="end" fontSize="9" fill="rgb(var(--faint))">#{r}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="rgb(var(--accent))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={p.date}>
            <circle cx={x(i)} cy={y(p.rank)} r={hover === i ? 5 : 4} fill="rgb(var(--accent))" stroke="rgb(var(--surface))" strokeWidth="2" />
            <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="rgb(var(--faint))">
              {i === points.length - 1 ? 'Now' : new Date(p.date).toLocaleDateString('en-GB', { month: 'short' })}
            </text>
            {/* hit target, bigger than the mark */}
            <rect x={x(i) - 18} y={0} width={36} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} />
          </g>
        ))}
      </svg>
      {h && (
        <div
          className="absolute -top-2 pointer-events-none rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] shadow-lift whitespace-nowrap"
          style={{ left: `${(x(hover!) / W) * 100}%`, transform: 'translate(-50%, -100%)' }}
        >
          <div className="font-bold text-ink">{hover === points.length - 1 ? 'Now' : shortDate(h.date)} · #{h.rank} of {teams}</div>
          <div className="text-muted">Rating {h.elo} · attack {h.attack.toFixed(2)} · defence {h.defence.toFixed(2)}</div>
        </div>
      )}
    </div>
  )
}

function Tile({ k, v, sub }: { k: string; v: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface2/60 p-3">
      <div className="text-[11px] text-faint">{k}</div>
      <div className="font-display font-extrabold text-lg mt-0.5 text-ink">{v}</div>
      {sub && <div className="text-[11px] text-muted mt-0.5">{sub}</div>}
    </div>
  )
}

function FormTable({ form }: { form: NonNullable<Analysis['form']> }) {
  const cols: [string, Summary | null][] = [['Last 5', form.last5], ['Last 10', form.last10], ['Home', form.home], ['Away', form.away]]
  const shown = cols.filter(([, s]) => s && s.n > 0) as [string, Summary][]
  if (!shown.length) return <p className="text-sm text-faint">No finished games yet.</p>
  const rate = (a: number, n: number) => `${a}/${n}`
  const rows: [string, (s: Summary) => ReactNode][] = [
    ['Won · drawn · lost', s => `${s.won} · ${s.drawn} · ${s.lost}`],
    ['Points a game', s => s.ppg.toFixed(2)],
    ['Goals for · against', s => `${s.gf.toFixed(1)} · ${s.ga.toFixed(1)}`],
    ['xG for · against', s => (s.xg ? `${s.xg.for.toFixed(1)} · ${s.xg.against.toFixed(1)}` : '–')],
    ['Clean sheets', s => rate(s.cleanSheets, s.n)],
    ['Both teams scored', s => rate(s.btts, s.n)],
    ['Over 2.5 goals', s => rate(s.over25, s.n)]
  ]
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[420px]">
        <thead>
          <tr className="text-[11px] text-faint">
            <th className="text-left font-medium px-1 py-1" />
            {shown.map(([k, s]) => <th key={k} className="text-right font-medium px-1 py-1">{k}<span className="block text-[10px] text-faint/80">{s.n} games</span></th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, f]) => (
            <tr key={label} className="border-t border-line/40">
              <td className="px-1 py-2 text-muted text-xs">{label}</td>
              {shown.map(([k, s]) => <td key={k} className="px-1 py-2 text-right num font-semibold text-ink">{f(s)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TeamAnalysisCard({ a, full }: { a: Analysis | null | undefined; full: boolean }) {
  if (!a) return null
  if (!full || a.locked) {
    return (
      <section className="rounded-3xl p-6 border border-accent/30 bg-[linear-gradient(160deg,rgb(var(--accent)/0.09),rgb(var(--surface)/0.6))] space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Team analysis</h2>
          <span className="text-[11px] font-extrabold text-bg bg-accent px-2.5 py-1 rounded-full">Premium</span>
        </div>
        <p className="text-sm text-muted leading-relaxed">
          How our model rates this team and how that changed this season, form over the last 5 and 10 games (home, away, xG,
          clean sheets, both teams scoring, over 2.5){a.notesCount ? `, and ${a.notesCount} strengths and weaknesses we found in the numbers` : ''}.
        </p>
        <Link to="/premium" className="inline-block text-sm font-bold text-accent">See Premium →</Link>
      </section>
    )
  }
  const m = a.model
  const f = a.form
  return (
    <section className="rounded-3xl p-5 sm:p-6 border border-accent/30 bg-[linear-gradient(160deg,rgb(var(--accent)/0.07),rgb(var(--surface)/0.6))] space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Team analysis</h2>
        <span className="text-[11px] text-faint">From our model and the latest results</span>
      </div>

      {a.notes && a.notes.length > 0 && (
        <Block title="Strengths and weaknesses">
          <ul className="space-y-2">
            {a.notes.map((n, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-ink/90 leading-snug">
                <NoteIcon kind={n.kind} />
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {m && (
        <Block title="How our model rates them" sub={`${m.played} league games this season`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Tile k="Strength" v={`${ord(m.rank)} of ${m.teams}`} sub={`Rating ${m.elo}`} />
            <Tile k="Attack" v={m.attack.toFixed(2)} sub={`goals a game · avg ${m.leagueGoals.toFixed(2)}`} />
            <Tile k="Defence" v={m.defence.toFixed(2)} sub={`conceded a game · avg ${m.leagueGoals.toFixed(2)}`} />
            <Tile k="Home · away" v={`${m.homePpg.toFixed(1)} · ${m.awayPpg.toFixed(1)}`} sub="points a game" />
          </div>
          <p className="text-[11px] text-faint">Attack and defence are adjusted for the strength of the opponents faced.</p>
          <div className="grid gap-5 sm:grid-cols-2 items-start">
            <div className="space-y-2">
              <div className="text-[11px] text-faint">Score in the league, 1–10</div>
              <ScoreBar label="Strength" v={m.scores.strength} />
              <ScoreBar label="Attack" v={m.scores.attack} />
              <ScoreBar label="Defence" v={m.scores.defence} />
              <ScoreBar label="Form" v={m.scores.form} />
              <ScoreBar label="Home" v={m.scores.home} />
              <ScoreBar label="Away" v={m.scores.away} />
              <ScoreBar label="Squad value" v={m.scores.squad} />
            </div>
            {m.trend.length >= 2 && (
              <div className="space-y-1">
                <div className="text-[11px] text-faint">League rank by our rating, last 6 months</div>
                <RankTrend points={m.trend} teams={m.teams} />
              </div>
            )}
          </div>
        </Block>
      )}

      {!m && a.national && (
        <Block title="How our model rates them">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <Tile k="World rank (our rating)" v={`${ord(a.national.rank)} of ${a.national.teams}`} />
            <Tile k="Rating" v={a.national.elo} sub={`from ${a.national.matches} matches`} />
          </div>
        </Block>
      )}

      {f && (
        <Block title="Form and trends" sub={f.source === 'league' ? 'league games' : 'all competitions'}>
          {f.games.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {[...f.games].reverse().map((g, i) => (
                <span
                  key={i}
                  title={`${shortDate(g.date)} · ${g.home ? 'vs' : 'at'} ${g.opp} · ${g.gf}–${g.ga}${g.xgf !== null && g.xga !== null ? ` · xG ${g.xgf.toFixed(1)}–${g.xga.toFixed(1)}` : ''}`}
                  className="flex items-center gap-1 rounded-lg bg-surface2/70 pl-1 pr-1.5 py-1"
                >
                  <span className={`w-5 h-5 rounded-md grid place-items-center text-[10px] font-extrabold text-bg ${RES_BG[g.res]}`}>{g.res}</span>
                  <img src={g.oppLogo} alt={g.opp} className="w-4 h-4 object-contain" loading="lazy" />
                  <span className="text-[11px] num text-ink">{g.gf}–{g.ga}</span>
                </span>
              ))}
            </div>
          )}
          <FormTable form={f} />
        </Block>
      )}
    </section>
  )
}

/** Our record on this team's games: public for everyone. */
export function TeamRecordCard({ rec, teamName }: { rec: TeamRecord | undefined; teamName: string }) {
  if (!rec) return null
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-base sm:text-lg font-bold text-ink">Our record on {teamName}</h2>
        <Link to="/accuracy" className="text-xs font-bold text-accent">Full record →</Link>
      </div>
      {!rec.n ? (
        <p className="text-sm text-faint">No finished games with a saved prediction yet.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5">
            <Tile k={`Result, ${rec.n} games`} v={`${rec.hitRate}%`} sub={rec.market && rec.market.hitRate !== null ? `bookmakers ${rec.market.hitRate}% (${rec.market.n} games)` : `${rec.hits} right`} />
            {rec.btts && <Tile k="Both teams score" v={`${rec.btts.hitRate}%`} sub={`${rec.btts.n} games`} />}
            {rec.over25 && <Tile k="Over / under 2.5" v={`${rec.over25.hitRate}%`} sub={`${rec.over25.n} games`} />}
          </div>
          {rec.games && rec.games.length > 0 && (
            <div>
              {rec.games.map(g => (
                <Link key={g.matchId} to={`/match/${g.matchId}`} className="flex items-center gap-3 py-2 border-b border-line/50 last:border-0 hover:bg-surface2/40 rounded-lg">
                  <span className="w-12 text-[11px] text-faint">{shortDate(g.date)}</span>
                  <span className="flex-1 min-w-0 truncate text-sm text-muted">{g.home ? 'vs' : 'at'} <span className="text-ink font-semibold">{g.opp}</span></span>
                  <span className="text-sm num font-bold text-ink">{g.score}</span>
                  <span className="w-12 text-right text-[11px] text-muted">{g.pick}</span>
                  <span className={`w-5 h-5 rounded-full grid place-items-center text-[10px] font-extrabold ${g.hit ? 'bg-win/20 text-win' : 'bg-loss/20 text-loss'}`} aria-label={g.hit ? 'Right' : 'Wrong'}>
                    {g.hit ? '✓' : '✗'}
                  </span>
                </Link>
              ))}
              <p className="text-[11px] text-faint mt-2">Our pick for {teamName} (win, draw or loss), saved before kick-off.</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
