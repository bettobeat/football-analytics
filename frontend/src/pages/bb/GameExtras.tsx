import { Link } from 'react-router-dom'
import { t } from '../../lib/i18n'
import type { BbGame as Game } from '../../lib/bb'
import { Card, TeamLogo } from './parts'

/** Extra sections of the basketball game page (Oct 2026): points markets, team comparison, players, model table. */

export interface Markets {
  bands: { lo: number; hi: number; home: number; away: number }[]
  overtime: number
  spreads: { line: number; home: number; away: number }[]
  totals: { line: number; over: number }[]
  teamTotals: { home: { line: number; over: number }[]; away: { line: number; over: number }[] }
  firstHalf: { home: number; away: number; margin: number; total: number }
  sigma: number
  sigmaTotal: number
}
export interface ModelInfo { version: string; avgPoints: number; homeEdge: number; b2b: number; gamesRated: number }
export interface GamePlayer {
  id: number; name: string; number: string | null; position: string | null; injury: string | null
  statsFrom: 'current' | { season: string; league: string | null } | null
  gp: number; min: number | null; pts: number | null; reb: number | null; ast: number | null; fgPct: number | null; tpPct: number | null
  pie: number | null; usg: number | null; net: number | null
}
interface StandRow { position: number; team: { id: number }; won: number; lost: number }
interface Side {
  splits: { won: number; lost: number; homeWon: number; homeLost: number; awayWon: number; awayLost: number; games: number; closeWon: number; closeLost: number }
  streak: { kind: 'W' | 'L'; n: number } | null
  last10: { won: number; lost: number }
  pointsFor: number | null; pointsAgainst: number | null
  ranks: { attack: number; defence: number; overall: number; of: number } | null
  previousSeason: boolean; season: string
}

const pctTxt = (x: number) => `${x < 10 ? x.toFixed(1) : Math.round(x)}%`

/** Bar split between the two sides (home colour left, away colour right). */
function Split({ h, a }: { h: number; a: number }) {
  const s = h + a || 1
  return (
    <div className="flex h-1.5 gap-[2px] mt-1">
      <div className="rounded-full bg-home" style={{ width: `${(h / s) * 100}%` }} />
      <div className="rounded-full bg-away" style={{ width: `${(a / s) * 100}%` }} />
    </div>
  )
}

/** Points markets: margin bands, spreads, totals, team points, overtime and the first half. */
export function MarketsCard({ g, m }: { g: Game; m: Markets }) {
  const H = g.home.name, A = g.away.name
  return (
    <Card title={t('Points markets')} action={<span className="text-xs text-faint">{t('from our prediction')}</span>}>
      <div className="grid gap-6 md:grid-cols-2">
        {/* winning margin */}
        <div>
          <div className="label mb-3">{t('Winning margin')}</div>
          <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 text-[11px] font-bold mb-1.5"><span className="truncate text-home">{H}</span><span /><span className="truncate text-right text-away">{A}</span></div>
          <ul className="space-y-2">
            {m.bands.map(b => (
              <li key={b.lo} className="grid grid-cols-[1fr_auto_1fr] gap-x-3 items-center text-sm">
                <span className="num text-ink font-semibold">{pctTxt(b.home)}</span>
                <span className="text-[11px] text-faint text-center w-24">{b.hi >= 99 ? t('by {0}+', { 0: b.lo }) : t('by {0}–{1}', { 0: b.lo, 1: b.hi })}</span>
                <span className="num text-right text-ink font-semibold">{pctTxt(b.away)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between text-sm rounded-xl bg-surface2/50 px-3 py-2">
            <span className="text-muted">{t('Overtime')}</span><b className="num text-ink">{pctTxt(m.overtime)}</b>
          </div>
        </div>

        {/* spreads */}
        <div>
          <div className="label mb-3">{t('Wins by more than…')}</div>
          <ul className="space-y-2.5">
            {m.spreads.map(s => (
              <li key={s.line} className="text-sm">
                <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 items-center">
                  <span className="num text-ink font-semibold">{pctTxt(s.home)}</span>
                  <span className="text-[11px] text-faint text-center w-24">{s.line} {t('pts')}</span>
                  <span className="num text-right text-ink font-semibold">{pctTxt(s.away)}</span>
                </div>
                <Split h={s.home} a={s.away} />
              </li>
            ))}
          </ul>
        </div>

        {/* total points */}
        <div>
          <div className="label mb-3">{t('Total points')}</div>
          <ul className="space-y-2">
            {m.totals.map(x => (
              <li key={x.line} className="text-sm">
                <div className="flex items-center justify-between"><span className="text-muted">{t('Over')} <span className="num">{x.line}</span></span><b className="num text-ink">{pctTxt(x.over)}</b></div>
                <div className="h-1.5 mt-1 rounded-full bg-surface2 overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${x.over}%` }} /></div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-faint">{t('Under = 100% minus over.')}</p>
        </div>

        {/* team points + first half */}
        <div className="space-y-5">
          <div>
            <div className="label mb-3">{t('Points per team')}</div>
            {(['home', 'away'] as const).map(s => (
              <div key={s} className="mb-3 last:mb-0">
                <div className={`text-xs font-bold mb-1 ${s === 'home' ? 'text-home' : 'text-away'}`}>{s === 'home' ? H : A}</div>
                <div className="grid grid-cols-3 gap-2">
                  {m.teamTotals[s].map(x => (
                    <div key={x.line} className="rounded-lg bg-surface2/60 border border-line/50 px-2 py-1.5 text-center">
                      <div className="text-[10px] text-faint">{t('Over')} {x.line}</div>
                      <div className="num text-sm font-bold text-ink">{pctTxt(x.over)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div>
            <div className="label mb-2">{t('First half')}</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-surface2/60 border border-line/50 px-2 py-1.5"><div className="text-[10px] text-faint truncate">{H}</div><div className="num text-sm font-bold text-home">{pctTxt(m.firstHalf.home)}</div></div>
              <div className="rounded-lg bg-surface2/60 border border-line/50 px-2 py-1.5"><div className="text-[10px] text-faint">{t('Total')}</div><div className="num text-sm font-bold text-ink">{m.firstHalf.total}</div></div>
              <div className="rounded-lg bg-surface2/60 border border-line/50 px-2 py-1.5"><div className="text-[10px] text-faint truncate">{A}</div><div className="num text-sm font-bold text-away">{pctTxt(m.firstHalf.away)}</div></div>
            </div>
            <p className="mt-2 text-[11px] text-faint">{t('Leading at half-time; a tie at the break is the rest.')}</p>
          </div>
        </div>
      </div>
      <p className="mt-5 text-[11px] text-faint">{t('All from the same model as the win chance: margin and total follow a bell curve around our prediction (typical miss: {0} points on the margin, {1} on the total).', { 0: m.sigma, 1: m.sigmaTotal })}</p>
    </Card>
  )
}

/** Head-to-head in numbers: table, record, form, venue record, points and ranks. */
export function CompareCard({ g, home, away, table, form }: {
  g: Game; home: Side; away: Side; table: StandRow[] | null; form: { home: ('W' | 'L')[]; away: ('W' | 'L')[] } | null
}) {
  const rowOf = (id: number) => table?.find(r => r.team.id === id) || null
  const th = rowOf(g.home.id), ta = rowOf(g.away.id)
  type R = { label: string; h: string; a: string; hv?: number; av?: number; lower?: boolean }
  const rows: R[] = []
  if (th && ta) rows.push({ label: t('League position'), h: `${th.position}.`, a: `${ta.position}.`, hv: th.position, av: ta.position, lower: true })
  const s = (x: Side) => x.splits
  if (s(home).games || s(away).games) {
    rows.push({ label: home.previousSeason || away.previousSeason ? t('Record (last season)') : t('Record'), h: `${s(home).won}–${s(home).lost}`, a: `${s(away).won}–${s(away).lost}`, hv: s(home).won / Math.max(1, s(home).games), av: s(away).won / Math.max(1, s(away).games) })
    rows.push({ label: t('At home / on the road'), h: `${s(home).homeWon}–${s(home).homeLost}`, a: `${s(away).awayWon}–${s(away).awayLost}`, hv: s(home).homeWon / Math.max(1, s(home).homeWon + s(home).homeLost), av: s(away).awayWon / Math.max(1, s(away).awayWon + s(away).awayLost) })
    rows.push({ label: t('Last 10'), h: `${home.last10.won}–${home.last10.lost}`, a: `${away.last10.won}–${away.last10.lost}`, hv: home.last10.won, av: away.last10.won })
    rows.push({ label: t('Close games (5 points or less)'), h: `${s(home).closeWon}–${s(home).closeLost}`, a: `${s(away).closeWon}–${s(away).closeLost}` })
  }
  if (home.pointsFor !== null && away.pointsFor !== null) rows.push({ label: t('Points scored per game'), h: String(home.pointsFor), a: String(away.pointsFor), hv: home.pointsFor, av: away.pointsFor })
  if (home.pointsAgainst !== null && away.pointsAgainst !== null) rows.push({ label: t('Points allowed per game'), h: String(home.pointsAgainst), a: String(away.pointsAgainst), hv: home.pointsAgainst, av: away.pointsAgainst, lower: true })
  if (home.ranks && away.ranks) {
    rows.push({ label: t('Attack rank'), h: `${home.ranks.attack}`, a: `${away.ranks.attack}`, hv: home.ranks.attack, av: away.ranks.attack, lower: true })
    rows.push({ label: t('Defence rank'), h: `${home.ranks.defence}`, a: `${away.ranks.defence}`, hv: home.ranks.defence, av: away.ranks.defence, lower: true })
    rows.push({ label: t('Overall rank'), h: `${home.ranks.overall}`, a: `${away.ranks.overall}`, hv: home.ranks.overall, av: away.ranks.overall, lower: true })
  }
  const streak = (x: Side) => (x.streak && x.streak.n >= 2 ? `${x.streak.kind === 'W' ? t('W') : t('L')}${x.streak.n}` : '–')
  rows.push({ label: t('Streak'), h: streak(home), a: streak(away) })
  if (rows.length < 3) return null
  return (
    <Card title={t('Team comparison')} action={<span className="text-xs text-faint">{home.season}</span>}>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 items-center mb-3">
        <span className="flex items-center gap-2 min-w-0"><TeamLogo team={g.home} size={20} /><span className="truncate text-sm font-bold text-ink">{g.home.name}</span></span>
        <span />
        <span className="flex items-center justify-end gap-2 min-w-0"><span className="truncate text-sm font-bold text-ink text-right">{g.away.name}</span><TeamLogo team={g.away} size={20} /></span>
      </div>
      {form && (form.home.length > 0 || form.away.length > 0) && (
        <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 items-center mb-3">
          <FormDots f={form.home} />
          <span className="text-[11px] text-faint text-center w-40">{t('Form')}</span>
          <div className="flex justify-end"><FormDots f={form.away} /></div>
        </div>
      )}
      <ul className="divide-y divide-line/40">
        {rows.map(r => {
          const better = r.hv === undefined || r.av === undefined || r.hv === r.av ? 0 : (r.hv > r.av) !== !!r.lower ? -1 : 1
          return (
            <li key={r.label} className="grid grid-cols-[1fr_auto_1fr] gap-x-3 items-center py-2 text-sm">
              <span className={`num ${better === -1 ? 'text-ink font-bold' : 'text-muted'}`}>{r.h}</span>
              <span className="text-[11px] text-faint text-center w-40">{r.label}</span>
              <span className={`num text-right ${better === 1 ? 'text-ink font-bold' : 'text-muted'}`}>{r.a}</span>
            </li>
          )
        })}
      </ul>
      {home.ranks && <p className="mt-3 text-[11px] text-faint">{t('Ranks from our ratings, out of {0} teams (1 = best).', { 0: home.ranks.of })}</p>}
    </Card>
  )
}

function FormDots({ f }: { f: ('W' | 'L')[] }) {
  return <div className="flex gap-1">{f.map((r, i) => <span key={i} className={`w-5 h-5 rounded text-[10px] font-bold grid place-items-center ${r === 'W' ? 'bg-win text-bg' : 'bg-loss text-bg'}`}>{r === 'W' ? t('W') : t('L')}</span>)}</div>
}

/** Each team's key players (season averages), injury flags; links to the player pages. */
export function PlayersCard({ g, home, away, limit, title }: { g: Game; home: GamePlayer[]; away: GamePlayer[]; limit: number; title: string }) {
  if (!home.length && !away.length) return null
  const adv = [...home, ...away].some(p => p.pie !== null)
  const side = (team: Game['home'], list: GamePlayer[]) => (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-2"><TeamLogo team={team} size={20} /><Link to={`/basketball/team/${team.id}`} className="font-display font-bold text-ink hover:text-accent truncate">{team.name}</Link></div>
      {list.length === 0 ? <p className="text-sm text-faint">{t('No player stats yet.')}</p> : (
        <table className="w-full text-xs num">
          <thead>
            <tr className="text-faint">
              <th className="text-left font-semibold py-1">{t('Player')}</th>
              <th className="text-right font-semibold px-1">{t('PTS')}</th>
              <th className="text-right font-semibold px-1">{t('REB')}</th>
              <th className="text-right font-semibold px-1">{t('AST')}</th>
              <th className="text-right font-semibold px-1 hidden sm:table-cell">{t('MIN')}</th>
              {adv && <th className="text-right font-semibold pl-1 hidden sm:table-cell">PIE</th>}
            </tr>
          </thead>
          <tbody>
            {list.slice(0, limit).map(p => (
              <tr key={p.id} className="border-t border-line/40">
                <td className="py-1.5 font-sans whitespace-nowrap max-w-[150px] truncate">
                  <Link to={`/basketball/player/${p.id}`} className="text-ink font-semibold hover:text-accent">{p.name}</Link>
                  {p.injury && <span className="ml-1 rounded px-1 text-[9px] font-bold bg-loss/15 text-loss">{p.injury}</span>}
                  {p.statsFrom && p.statsFrom !== 'current' && <span className="ml-1 rounded px-1 text-[9px] text-faint bg-surface2">{p.statsFrom.season}</span>}
                </td>
                <td className="text-right px-1 text-ink font-bold">{p.pts ?? '–'}</td>
                <td className="text-right px-1 text-muted">{p.reb ?? '–'}</td>
                <td className="text-right px-1 text-muted">{p.ast ?? '–'}</td>
                <td className="text-right px-1 text-muted hidden sm:table-cell">{p.min ?? '–'}</td>
                {adv && <td className="text-right pl-1 text-muted hidden sm:table-cell">{p.pie ?? '–'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
  return (
    <Card title={title} action={<span className="text-xs text-faint">{t('per game, this season')}</span>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {side(g.home, home)}
        {side(g.away, away)}
      </div>
    </Card>
  )
}

/** "How this was calculated": the parts of each side's predicted points. */
export function ModelTable({ g, model, ratings }: {
  g: Game
  model: ModelInfo
  ratings: { home: { attack: number; defence: number } | null; away: { attack: number; defence: number } | null } | null
}) {
  const p = g.prediction!
  const r = ratings
  const f = (x: number) => `${x > 0 ? '+' : ''}${x.toFixed(1)}`
  const half = model.homeEdge / 2
  const rows: { label: string; h: string; a: string }[] = [
    { label: t('League average (points per team)'), h: model.avgPoints.toFixed(1), a: model.avgPoints.toFixed(1) }
  ]
  if (r?.home && r?.away) {
    rows.push({ label: t('Attack (own rating)'), h: f(r.home.attack), a: f(r.away.attack) })
    rows.push({ label: t('Opponent defence'), h: f(-r.away.defence), a: f(-r.home.defence) })
  }
  rows.push({ label: t('Home court'), h: f(half), a: f(-half) })
  if (p.b2bHome || p.b2bAway) rows.push({ label: t('Back-to-back'), h: p.b2bHome ? f(-model.b2b / 2) : '0.0', a: p.b2bAway ? f(-model.b2b / 2) : '0.0' })
  if (p.injHome || p.injAway) rows.push({ label: t('Injuries'), h: f(-(p.injHome || 0)), a: f(-(p.injAway || 0)) })
  return (
    <div className="mt-3">
      <table className="w-full text-xs num">
        <thead>
          <tr className="text-faint"><th className="text-left font-semibold py-1">{t('Part')}</th><th className="text-right font-semibold w-20 truncate">{g.home.name}</th><th className="text-right font-semibold w-20 truncate">{g.away.name}</th></tr>
        </thead>
        <tbody>
          {rows.map(x => <tr key={x.label} className="border-t border-line/40"><td className="py-1 text-muted font-sans">{x.label}</td><td className="text-right text-ink">{x.h}</td><td className="text-right text-ink">{x.a}</td></tr>)}
          {p.score && <tr className="border-t border-line"><td className="py-1.5 font-sans font-bold text-ink">{t('Predicted points')}</td><td className="text-right font-bold text-home">{p.score.home}</td><td className="text-right font-bold text-away">{p.score.away}</td></tr>}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-faint">{t('Ratings are points per game compared with an average team. Model {0}, {1} games rated; possession ratings and pace adjust the final numbers slightly.', { 0: model.version, 1: model.gamesRated })}</p>
    </div>
  )
}
