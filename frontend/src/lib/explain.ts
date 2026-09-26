import type { Market, Prediction } from './predict'

/**
 * "Why this pick" — turns a v3 prediction (the grid rows every engine sends: leagues, national teams, European cups)
 * into a few plain sentences. No extra data or API calls: everything comes from the prediction and the market.
 */
export interface Explanation {
  headline: string
  /** reasons for the pick, strongest first */
  forPick: string[]
  /** the strongest thing pulling the other way, if any */
  against: string | null
  /** why the draw is (or isn't) a real option */
  draw: string[]
  /** our view vs the bookmakers */
  market: string | null
  caution: string | null
}

type Row = NonNullable<Prediction['grid']>['rows'][number]
type Side = 'H' | 'A'

const pctR = (x: number) => `${Math.round(x)}%`

function rowSentence(r: Row, side: Side, names: { H: string; A: string }): string {
  const t = names[side], o = names[side === 'H' ? 'A' : 'H']
  // only notes that carry this match's numbers (not the row's general description)
  const note = r.note && /\d/.test(r.note) && !/^(n\/a|no |XI not|covered by|stands in|market value of|Elo over)/i.test(r.note) ? r.note : null
  switch (r.id) {
    case '#1':
    {
      // note is "home vs away"; put the favoured team's value first
      const m = note?.match(/(~?€[\d.]+m) vs (~?€[\d.]+m)/)
      return `${t} have the more valuable squad${m ? ` (${side === 'H' ? m[1] : m[2]} vs ${side === 'H' ? m[2] : m[1]})` : ''}.`
    }
    case '#1e':
      return `${t} are the stronger side on results over time${note ? ` (${note})` : ''}.`
    case '#19':
      return r.name.startsWith('Goals')
        ? `${t} score more and concede less${note ? ` (${note})` : ''}.`
        : `${t}'s attack does better against teams of this level.`
    case '#14':
      return `${t}'s defence holds up better against teams of this level.`
    case '#10':
      return r.name.startsWith('Rest') ? `${t} have had more rest.` : `${t} are fresher${note ? ` (${note})` : ''}.`
    case '#23':
      return r.name.startsWith('Home advantage') ? `Home advantage for ${names.H}.` : side === 'H' ? `${t} are strong at home compared with ${o}'s away record.` : `${t}'s away record is better than ${o}'s home record.`
    case '#7':
      return `${t} have had the better of recent meetings${note ? ` (${note.replace(/, home side share \d+%/, '')})` : ''}.`
    case '#21':
      return `${t} are in better form${note ? ` (${note})` : ''}.`
    case '#12': {
      const [h, a] = (note || '').replace(/^usual starters out: /, '').split(' | ')
      const who = side === 'H' ? a : h
      return `${o} are without usual starters${who && who !== 'none' && who !== 'n/a' ? ` (${who})` : ''}.`
    }
    case '#13': {
      const [h, a] = (note || '').replace(/^out: /, '').split(' | ')
      const who = side === 'H' ? a : h
      return `${o} have key players missing${who && who !== 'none' && who !== 'n/a' ? ` (${who})` : ''}.`
    }
    default:
      return `${r.name} favours ${t}.`
  }
}

export function explainPrediction(p: Prediction, homeName: string, awayName: string, market?: Market | null, upcoming = true): Explanation | null {
  const g = p.grid
  if (!g || p.locked) return null
  const names = { H: homeName, A: awayName }
  const opts = [
    { k: 'H' as const, label: homeName, v: p.home },
    { k: 'D' as const, label: 'a draw', v: p.draw },
    { k: 'A' as const, label: awayName, v: p.away }
  ].sort((x, y) => y.v - x.v)
  const top = opts[0], second = opts[1]

  // --- headline
  let headline: string
  if (top.k === 'D') headline = `We lean to a draw (${pctR(top.v)}) — neither side has a clear edge.`
  else if (top.v >= 60) headline = `${top.label} are clear favourites (${pctR(top.v)}).`
  else if (top.v >= 50) headline = `${top.label} are favourites (${pctR(top.v)}), but it is not one-sided.`
  else if (top.v - second.v <= 8)
    headline = `Close game: ${top.label} (${pctR(top.v)}) or ${second.label} (${pctR(second.v)}) — both are real options.`
  else headline = `${top.label} have the edge (${pctR(top.v)}), with ${second.label} next (${pctR(second.v)}).`

  // --- team rows: which side each row favours, by size
  const team = g.rows.filter(r => r.edge !== 0 && !['#15', '#30', '#16'].includes(r.id))
  const maxEdge = Math.max(0, ...team.map(r => Math.abs(r.edge)))
  const meaningful = team.filter(r => Math.abs(r.edge) >= Math.min(3, Math.max(1, maxEdge * 0.15))).sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge))
  const favoured: Side = top.k === 'D' ? (p.home >= p.away ? 'H' : 'A') : top.k
  const pro = meaningful.filter(r => (r.edge > 0 ? 'H' : 'A') === favoured)
  const con = meaningful.filter(r => (r.edge > 0 ? 'H' : 'A') !== favoured)
  const forPick = top.k === 'D' ? [] : pro.slice(0, 3).map(r => rowSentence(r, favoured, names))
  const against = top.k === 'D' || !con.length ? null : rowSentence(con[0], favoured === 'H' ? 'A' : 'H', names)

  // --- draw
  const draw: string[] = []
  const drawReal = top.k === 'D' || (second.k === 'D' && p.draw >= 27) || p.draw >= 30
  if (drawReal) {
    if (g.matchType === 'even') draw.push('On results so far the two sides are closely matched, which makes a draw more likely.')
    const derby = g.rows.find(r => r.id === '#16')
    if (derby && derby.home >= 7) draw.push('It is a derby — these are often tight.')
    const league = g.rows.find(r => r.id === '#30')
    if (league && league.home >= 6) draw.push(`This league has a lot of draws${league.note ? ` (${league.note.replace('league draw rate', 'draw rate')})` : ''}.`)
    const prone = g.rows.find(r => r.id === '#15')
    if (prone && prone.home >= 6.5) draw.push('Both teams draw often.')
    if (p.expectedGoals.home + p.expectedGoals.away < 2.3) draw.push(`We expect few goals (${p.expectedGoals.home} – ${p.expectedGoals.away}), and low-scoring games end level more often.`)
    if (p.drawStreak && Math.min(p.drawStreak.home, p.drawStreak.away) >= 0.32)
      draw.push('Both teams drew a lot recently — bookmakers usually price that in already, so we do not add extra weight for it.')
    if (!draw.length) draw.push(`A draw is a real option at ${pctR(p.draw)}.`)
  } else if (g.matchType === 'mismatch') draw.push(`A draw is unlikely (${pctR(p.draw)}): the gap between the teams is big.`)

  // --- market
  let mkt: string | null = null
  if (market?.probs) {
    const ours = { H: p.home, D: p.draw, A: p.away }
    const theirs = { H: market.probs.home, D: market.probs.draw, A: market.probs.away }
    // lead with where we are HIGHER than the bookmakers (the actionable side), else the biggest gap
    const diffs = (['H', 'D', 'A'] as const).map(k => ({ k, d: ours[k] - theirs[k] }))
    const up = [...diffs].sort((a, b) => b.d - a.d)[0]
    const big = up.d >= 5 ? up : [...diffs].sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0]
    const lbl = (k: 'H' | 'D' | 'A') => (k === 'H' ? homeName : k === 'A' ? awayName : 'the draw')
    if (Math.abs(big.d) >= 5)
      mkt = `We rate ${lbl(big.k)} ${big.d > 0 ? 'higher' : 'lower'} than the bookmakers (${pctR(ours[big.k])} vs ${pctR(theirs[big.k])}).`
    else mkt = 'We broadly agree with the bookmakers on this one.'
  }

  // --- caution
  let caution: string | null = null
  if (p.confidence === 'low') caution = 'Few games played yet for one of the teams, so treat this one with extra care.'
  else if (upcoming && g.rows.some(r => r.id === '#12' && r.note === 'XI not published yet'))
    caution = 'Lineups are not out yet — this can change about an hour before kick-off.'

  return { headline, forPick, against, draw, market: mkt, caution }
}
