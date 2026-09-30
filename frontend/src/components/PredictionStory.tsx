import type { ReactNode } from 'react'
import type { Market, Prediction } from '../lib/predict'
import { explainPrediction } from '../lib/explain'

/*
 * "Why we think so" for a revealed prediction, in plain language:
 *   1. the verdict in one sentence
 *   2. every factor the model weighs, as a tug of war between the two teams (who it favours and how much)
 *   3. how that adds up to the percentages (out of 1000 points, and where the draw chance comes from)
 *   4. what could still change it (lineups, missing players, friendlies, thin data, bookmakers disagreeing)
 * Everything comes from the prediction itself (the grid rows every engine sends) and the bookmakers' prices.
 */

type Row = NonNullable<Prediction['grid']>['rows'][number]
type Side = 'H' | 'A'
const DRAW_ROWS = new Set(['#15', '#30', '#16'])

/** Plain names for the model's factors. */
const LABEL: Record<string, string> = {
  '#1': 'Squad value',
  '#1e': 'Overall strength',
  '#1p': 'Player quality',
  '#12': 'Confirmed lineups',
  '#13': 'Missing players',
  '#19': 'Attack',
  '#14': 'Defence',
  '#10': 'Rest and fixture load',
  '#23': 'Home and away record',
  '#7': 'Head-to-head',
  '#21': 'Recent form'
}
const HINT: Record<string, string> = {
  '#1': 'what the best players are worth on the market',
  '#1e': 'a rating built from every result, bigger wins count more',
  '#12': 'usual starters missing from the published lineup',
  '#13': 'injured and suspended regulars',
  '#19': 'goals scored, adjusted for the opponents faced',
  '#14': 'goals conceded, adjusted for the opponents faced',
  '#10': 'games played in the last 8 days',
  '#23': "the home side's home games vs the away side's away games",
  '#7': 'the last 10 meetings',
  '#21': 'points from the last 6 games'
}
const labelOf = (r: Row) => (r.name.startsWith('Home advantage') || r.name.startsWith('Rest days') || r.name.startsWith('Goals:') || r.name.startsWith('Squad value (') || r.name.startsWith('Strength (rating)') || r.name.startsWith('Form, last 6 (') ? r.name.replace(/\s*\(.*\)$/, '').replace('Goals: attack vs defence', 'Goals: attack and defence') : LABEL[r.id] || r.name)

function strength(share: number) {
  if (share >= 0.3) return 'big edge'
  if (share >= 0.12) return 'clear edge'
  return 'small edge'
}

function Block({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-accent">{title}</h3>
        {note && <span className="text-[11px] text-faint">{note}</span>}
      </div>
      {children}
    </div>
  )
}

/** One factor: both teams' scores at the ends, a bar from the middle toward the side it favours. */
function Tug({ r, max, total, hn, an }: { r: Row; max: number; total: number; hn: string; an: string }) {
  const side: Side | null = r.edge > 0 ? 'H' : r.edge < 0 ? 'A' : null
  const width = max ? (Math.abs(r.edge) / max) * 50 : 0
  const who = side === 'H' ? hn : side === 'A' ? an : null
  const note = r.note && /\d/.test(r.note) && !/^(stands in|market value of|Elo over|regulars listed|usual starters left|how strong the clubs)/i.test(r.note) ? r.note : HINT[r.id] || r.note || ''
  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-ink">{labelOf(r)}</span>
        <span className={`text-[11px] font-bold whitespace-nowrap ${side === 'H' ? 'text-home' : side === 'A' ? 'text-away' : 'text-faint'}`}>
          {who ? `${who} · ${strength(total ? Math.abs(r.edge) / total : 0)}` : 'Even'}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className={`w-9 text-right num text-xs ${side === 'H' ? 'font-bold text-ink' : 'text-muted'}`}>{fmt(r.home)}</span>
        <div className="relative flex-1 h-2.5 rounded-full bg-surface2">
          <span className="absolute left-1/2 top-[-3px] bottom-[-3px] w-px bg-line" aria-hidden />
          {side && (
            <span
              className={`absolute top-0 bottom-0 rounded-full ${side === 'H' ? 'bg-home right-1/2' : 'bg-away left-1/2'}`}
              style={{ width: `${Math.max(2, width)}%` }}
            />
          )}
        </div>
        <span className={`w-9 num text-xs ${side === 'A' ? 'font-bold text-ink' : 'text-muted'}`}>{fmt(r.away)}</span>
      </div>
      {note && <div className="mt-1 text-[11px] text-faint">{note}</div>}
    </li>
  )
}
const fmt = (x: number) => (Math.round(x * 10) / 10).toFixed(1)

/** The most likely of: the result, double chance, over/under 1.5 and 2.5, both teams to score (same as the record page). */
function safestBet(p: Prediction, home: string, away: string): { label: string; p: number } | null {
  if (p.locked || typeof p.home !== 'number') return null
  const c: { label: string; p: number }[] = []
  const top = [{ l: `${home} to win`, v: p.home }, { l: 'Draw', v: p.draw }, { l: `${away} to win`, v: p.away }].sort((a, b) => b.v - a.v)[0]
  c.push({ label: top.l, p: top.v })
  const dc = [{ l: `${home} or draw`, v: p.home + p.draw }, { l: `${away} or draw`, v: p.away + p.draw }, { l: `${home} or ${away} (no draw)`, v: p.home + p.away }].sort((a, b) => b.v - a.v)[0]
  c.push({ label: dc.l, p: dc.v })
  const lam = p.expectedGoals.home + p.expectedGoals.away
  const o15 = Math.max((1 - Math.exp(-lam) * (1 + lam)) * 100, p.over25)
  c.push(o15 >= 50 ? { label: 'Over 1.5 goals', p: o15 } : { label: 'Under 1.5 goals', p: 100 - o15 })
  c.push(p.over25 >= 50 ? { label: 'Over 2.5 goals', p: p.over25 } : { label: 'Under 2.5 goals', p: 100 - p.over25 })
  c.push(p.btts >= 50 ? { label: 'Both teams score', p: p.btts } : { label: 'Not both teams score', p: 100 - p.btts })
  const best = c.sort((a, b) => b.p - a.p)[0]
  return { label: best.label, p: Math.round(best.p) }
}

export default function PredictionStory({ p, home, away, market, upcoming, friendly }: {
  p: Prediction; home: string; away: string; market: Market | null; upcoming: boolean; friendly?: boolean
}) {
  const g = p.grid
  const ex = explainPrediction(p, home, away, market, upcoming)
  if (!g || !ex) return null
  const names = { H: home, A: away }

  const team = g.rows.filter(r => !DRAW_ROWS.has(r.id))
  const moving = team.filter(r => r.edge !== 0).sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge))
  const still = team.filter(r => r.edge === 0)
  const max = Math.max(0, ...moving.map(r => Math.abs(r.edge)))
  const total = moving.reduce((s, r) => s + Math.abs(r.edge), 0)
  const forH = moving.filter(r => r.edge > 0).reduce((s, r) => s + r.edge, 0)
  const forA = moving.filter(r => r.edge < 0).reduce((s, r) => s - r.edge, 0)

  // what adds up: 1000 points
  const pts = g.points
  const drawBase = g.drawPot?.base ?? null

  // what could still change it
  const risks: string[] = []
  // (lineups not out yet: the blue "check again 1 hour before kick-off" note above already says it)
  const xi = g.rows.find(r => r.id === '#12')
  if (upcoming && xi && xi.note && /^usual starters out/.test(xi.note)) risks.push(`The lineups are in and already counted: ${xi.note.replace(/^usual starters out: /, 'usual starters out ').replace(' | ', ` (${home}) · `)} (${away}).`)
  const inj = g.rows.find(r => r.id === '#13' && r.note && /^out: /.test(r.note))
  if (inj) {
    const [h, a] = inj.note!.replace(/^out: /, '').split(' | ')
    const list = [h && h !== 'none' && h !== 'n/a' ? `${home}: ${h}` : null, a && a !== 'none' && a !== 'n/a' ? `${away}: ${a}` : null].filter(Boolean)
    if (list.length) risks.push(`Missing: ${list.join(' · ')}.`)
  }
  if (friendly || g.rows.some(r => /friendly/i.test(r.name))) risks.push('It is a friendly: coaches rotate their squads, so results are harder to predict.')
  if (p.confidence === 'low') risks.push('One of the teams has played few games, so there is less to go on.')
  if (market?.probs) {
    const top = p.home >= p.away ? 'H' : 'A'
    const ours = top === 'H' ? p.home : p.away
    const theirs = top === 'H' ? market.probs.home : market.probs.away
    if (theirs - ours >= 8) risks.push(`The bookmakers rate ${names[top]} even higher (${Math.round(theirs)}%): they may know about news we don't have yet.`)
    else if (ours - theirs >= 10) risks.push(`We are well above the bookmakers on ${names[top]} (${Math.round(ours)}% vs ${Math.round(theirs)}%). That is where the value is, and also where we can be wrong.`)
  }
  if (!risks.length) risks.push('Nothing unusual: the teams, the data and the bookmakers all point the same way.')

  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface2/40 p-4 sm:p-5 space-y-6">
      {/* 1. verdict */}
      <div>
        <div className="text-[11px] font-extrabold uppercase tracking-wide text-accent">Why we think so</div>
        <p className="mt-1.5 text-lg font-display font-bold text-ink leading-snug">{ex.headline}</p>
        {(() => {
          const b = safestBet(p, home, away)
          return b ? (
            <div className="mt-2.5 inline-flex flex-wrap items-center gap-2 rounded-xl border border-win/30 bg-win/10 px-3 py-2 text-sm">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-win">Safest bet</span>
              <span className="font-semibold text-ink">{b.label}</span>
              <span className="num font-bold text-win">{b.p}%</span>
              <span className="text-[11px] text-faint">the bet we are most sure about in this match</span>
            </div>
          ) : null
        })()}
        {ex.forPick.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {ex.forPick.map((t, i) => (
              <li key={i} className="flex gap-2"><span className="text-win mt-[1px]">+</span><span>{t}</span></li>
            ))}
            {ex.against && <li className="flex gap-2"><span className="text-loss mt-[1px]">−</span><span>On the other side: {ex.against}</span></li>}
          </ul>
        )}
      </div>

      {/* 2. factor by factor */}
      {moving.length > 0 && (
        <Block title="Factor by factor" note={`${home} ← → ${away} · scores out of 10`}>
          <ul className="divide-y divide-line/50">
            {moving.map(r => <Tug key={r.id} r={r} max={max} total={total} hn={home} an={away} />)}
          </ul>
          {still.length > 0 && (
            <p className="text-[11px] text-faint">
              Level or no data yet: {still.map(r => labelOf(r).toLowerCase()).join(', ')}.
            </p>
          )}
        </Block>
      )}

      {/* 3. how it adds up */}
      <Block title="How it adds up">
        <div className="flex h-3 gap-[3px] rounded-full overflow-hidden" aria-hidden>
          <div className="bg-home" style={{ width: `${pts.home / 10}%` }} />
          <div className="bg-draw" style={{ width: `${pts.draw / 10}%` }} />
          <div className="bg-away" style={{ width: `${pts.away / 10}%` }} />
        </div>
        <div className="text-sm text-muted space-y-1.5">
          {total > 0 && (
            <p>
              Adding every factor up, <span className="font-semibold text-ink">{forH >= forA ? home : away}</span> come out ahead:{' '}
              <span className="num text-home font-semibold">{Math.round(forH)}</span> points of edge for {home} against{' '}
              <span className="num text-away font-semibold">{Math.round(forA)}</span> for {away}.
            </p>
          )}
          <p>
            The draw: {drawBase !== null ? <>with the goals we expect ({p.expectedGoals.home} – {p.expectedGoals.away}), a game like this ends level about{' '}
            <span className="num text-ink">{Math.round(drawBase / 10)}%</span> of the time</> : 'from the gap between the teams'}
            {Math.abs(Math.round(p.draw) - Math.round((drawBase ?? p.draw * 10) / 10)) >= 2
              ? <>, and {p.draw > (drawBase ?? 0) / 10 ? 'draw-prone teams, the league and a close match push it up' : 'the gap between the teams pushes it down'} to <span className="num text-draw font-semibold">{Math.round(p.draw)}%</span>.</>
              : <>: <span className="num text-draw font-semibold">{Math.round(p.draw)}%</span>.</>}
            {ex.draw.length > 0 && <> {ex.draw.join(' ')}</>}
          </p>
          <p>
            The rest is split by the edge: <span className="num text-home font-semibold">{Math.round(p.home)}%</span> {home},{' '}
            <span className="num text-away font-semibold">{Math.round(p.away)}%</span> {away}.
          </p>
          {ex.market && <p>{ex.market}</p>}
        </div>
      </Block>

      {/* 4. what could change it */}
      <Block title="What could change it">
        <ul className="space-y-1.5 text-sm text-muted">
          {risks.map((t, i) => (
            <li key={i} className="flex gap-2"><span className="text-draw mt-[1px]">!</span><span>{t}</span></li>
          ))}
        </ul>
      </Block>
    </div>
  )
}

