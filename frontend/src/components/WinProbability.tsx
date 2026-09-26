import { useMemo } from 'react'
import type { Prediction } from '../lib/predict'

/**
 * Live win probability: how our pre-match prediction moves with the game.
 *
 * At minute t with score h–a, each side still scores at its pre-match expected-goals rate for the time left
 * (Poisson). A red card cuts that side's rate by 30% and lifts the other side's by 20%. At kick-off the curve
 * starts exactly at our saved prediction (a correction that fades out by full time), so the chart and the
 * prediction above it always agree. Everything is worked out in the browser from data the page already has.
 */

interface Ev { minute: number; injuryTime?: number | null }
interface GoalEv extends Ev { team: { id: number }; type?: string; score?: { home: number; away: number } }
interface CardEv extends Ev { team: { id: number }; card: string }
export interface WPMatch {
  status: string
  minute?: number | null
  homeTeam: { id: number; name: string; shortName?: string }
  awayTeam: { id: number; name: string; shortName?: string }
  score: { fullTime: { home: number | null; away: number | null } }
  goals?: GoalEv[]
  bookings?: CardEv[]
}

const FULL = 95 // regular time + typical stoppage
const LIVE = new Set(['IN_PLAY', 'PAUSED', 'LIVE'])
const DONE = new Set(['FINISHED', 'AWARDED'])

function pois(l: number, k: number) {
  let f = 1
  for (let i = 2; i <= k; i++) f *= i
  return (Math.exp(-l) * Math.pow(l, k)) / f
}

/** P(home win, draw, away win) from the current score and the goals still to come. */
function outcome(h: number, a: number, lh: number, la: number) {
  let H = 0, D = 0, A = 0
  for (let i = 0; i <= 10; i++) {
    const pi = pois(lh, i)
    for (let j = 0; j <= 10; j++) {
      const q = pi * pois(la, j)
      const dh = h + i, da = a + j
      if (dh > da) H += q
      else if (dh === da) D += q
      else A += q
    }
  }
  const s = H + D + A || 1
  return { H: H / s, D: D / s, A: A / s }
}

export function winProbCurve(p: Prediction, m: WPMatch) {
  const lh0 = Math.max(0.05, p.expectedGoals.home), la0 = Math.max(0.05, p.expectedGoals.away)
  const at = (e: Ev) => e.minute + (e.injuryTime ? Math.min(e.injuryTime, 9) / 10 : 0)
  // goals in order, with the running score
  const goals = [...(m.goals || [])].sort((x, y) => at(x) - at(y))
  let hs = 0, as = 0
  const goalPts = goals.map(g => {
    if (g.score) { hs = g.score.home; as = g.score.away }
    else if (g.team.id === m.homeTeam.id) hs++
    else as++
    return { t: at(g), h: hs, a: as, side: (g.team.id === m.homeTeam.id ? 'H' : 'A') as 'H' | 'A' }
  })
  const reds = (m.bookings || []).filter(b => b.card === 'RED' || b.card === 'YELLOW_RED')
    .map(b => ({ t: at(b), side: (b.team.id === m.homeTeam.id ? 'H' : 'A') as 'H' | 'A' }))

  const done = DONE.has(m.status)
  const now = done ? 90 : Math.max(0, Math.min(90, Number(m.minute) || 0))
  const base = outcome(0, 0, lh0, la0)
  const corr = { H: p.home / 100 / base.H, D: p.draw / 100 / base.D, A: p.away / 100 / base.A }

  const pointAt = (t: number) => {
    const g = goalPts.filter(x => x.t <= t).pop()
    const h = g ? g.h : 0, a = g ? g.a : 0
    const rh = reds.filter(r => r.t <= t && r.side === 'H').length, ra = reds.filter(r => r.t <= t && r.side === 'A').length
    const left = Math.max(0, FULL - t) / FULL
    const lh = lh0 * left * Math.pow(0.7, rh) * Math.pow(1.2, ra)
    const la = la0 * left * Math.pow(0.7, ra) * Math.pow(1.2, rh)
    const o = outcome(h, a, lh, la)
    // start on our saved prediction; the correction fades out as the game is played
    const w = Math.max(0, 1 - t / 90)
    const k = { H: 1 + (corr.H - 1) * w, D: 1 + (corr.D - 1) * w, A: 1 + (corr.A - 1) * w }
    const H = o.H * k.H, D = o.D * k.D, A = o.A * k.A, s = H + D + A || 1
    return { t, H: (H / s) * 100, D: (D / s) * 100, A: (A / s) * 100 }
  }

  const pts = [] as { t: number; H: number; D: number; A: number }[]
  for (let t = 0; t <= now; t++) pts.push(pointAt(t))
  // extra points exactly at each event so the jumps are sharp
  for (const g of goalPts) if (g.t <= now) { pts.push(pointAt(g.t - 0.01)); pts.push(pointAt(g.t)) }
  pts.sort((x, y) => x.t - y.t)
  if (done) {
    const fh = m.score.fullTime.home ?? hs, fa = m.score.fullTime.away ?? as
    pts.push({ t: 90, H: fh > fa ? 100 : 0, D: fh === fa ? 100 : 0, A: fa > fh ? 100 : 0 })
  }
  return { pts, goals: goalPts.filter(g => g.t <= now + 0.5), reds: reds.filter(r => r.t <= now + 0.5), now, done }
}

export default function WinProbability({ p, m }: { p: Prediction; m: WPMatch }) {
  const c = useMemo(() => winProbCurve(p, m), [p, m])
  const last = c.pts[c.pts.length - 1]
  const live = LIVE.has(m.status)
  const W = 720, Hh = 180, pad = 4
  const x = (t: number) => pad + (t / 90) * (W - 2 * pad)
  const y = (v: number) => pad + (1 - v / 100) * (Hh - 2 * pad)
  // stacked bands: home at the bottom, draw in the middle, away on top
  const band = (lo: (q: typeof last) => number, hi: (q: typeof last) => number) => {
    const top = c.pts.map(q => `${x(q.t).toFixed(1)},${y(hi(q)).toFixed(1)}`)
    const bot = [...c.pts].reverse().map(q => `${x(q.t).toFixed(1)},${y(lo(q)).toFixed(1)}`)
    return `M${top.join('L')}L${bot.join('L')}Z`
  }
  const hn = m.homeTeam.shortName || m.homeTeam.name, an = m.awayTeam.shortName || m.awayTeam.name
  const tile = (label: string, v: number, cls: string) => (
    <div className="rounded-xl border border-line/70 bg-surface2/40 p-3 text-center">
      <div className="text-[11px] text-faint truncate">{label}</div>
      <div className={`num text-2xl font-extrabold ${cls}`}>{Math.round(v)}%</div>
    </div>
  )
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {tile(hn, last.H, 'text-home')}
        {tile('Draw', last.D, 'text-draw')}
        {tile(an, last.A, 'text-away')}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full h-auto rounded-xl bg-surface2/40 border border-line/60" role="img"
          aria-label={`Win probability over the match: now ${hn} ${Math.round(last.H)}%, draw ${Math.round(last.D)}%, ${an} ${Math.round(last.A)}%`}>
          {[45, 90].map(t => <line key={t} x1={x(t)} x2={x(t)} y1={pad} y2={Hh - pad} stroke="rgb(var(--line))" strokeDasharray="3 4" />)}
          <line x1={pad} x2={W - pad} y1={y(50)} y2={y(50)} stroke="rgb(var(--line))" strokeDasharray="3 4" />
          <path d={band(() => 0, q => q.H)} fill="rgb(var(--home) / 0.55)" />
          <path d={band(q => q.H, q => q.H + q.D)} fill="rgb(var(--draw) / 0.45)" />
          <path d={band(q => q.H + q.D, () => 100)} fill="rgb(var(--away) / 0.5)" />
          {c.goals.map((g, i) => (
            <g key={`g${i}`}>
              <line x1={x(g.t)} x2={x(g.t)} y1={pad} y2={Hh - pad} stroke="rgb(var(--ink) / 0.6)" strokeWidth="1.5" />
              <circle cx={x(g.t)} cy={g.side === 'H' ? Hh - 14 : 14} r="7" fill="rgb(var(--ink))" />
              <circle cx={x(g.t)} cy={g.side === 'H' ? Hh - 14 : 14} r="4" fill={g.side === 'H' ? 'rgb(var(--home))' : 'rgb(var(--away))'} />
            </g>
          ))}
          {c.reds.map((r, i) => <rect key={`r${i}`} x={x(r.t) - 4} y={r.side === 'H' ? Hh - 30 : 22} width="8" height="11" rx="1.5" fill="rgb(var(--loss))" />)}
          {live && <line x1={x(c.now)} x2={x(c.now)} y1={pad} y2={Hh - pad} stroke="rgb(var(--live))" strokeWidth="2" />}
        </svg>
        <div className="flex justify-between text-[11px] text-faint mt-1.5 px-0.5">
          <span>Kick-off</span><span>Half-time</span><span>{c.done ? 'Full time' : live ? `${c.now}'` : '90\''}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-home/60" />{hn}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-draw/50" />Draw</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-away/55" />{an}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-ink" />Goal</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2.5 rounded-[2px] bg-loss" />Red card</span>
      </div>
      <p className="text-[11px] text-faint leading-relaxed">
        Starts from our prediction saved before kick-off, then updates with the score, the time left and red cards. It shows how the chances moved during the game — it is not a new prediction.
      </p>
    </div>
  )
}
