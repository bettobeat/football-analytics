/**
 * Bet To Beat – model v3 "grid" (Yarin's scoring system)
 *
 * Every parameter gets two numbers: a VALUE (1–10, the team's standing on it within its
 * league, read against the opponent's tier where it matters) and a RELEVANCE (1–5, how
 * much it matters in this kind of match). Points = value × relevance, summed per team.
 * The two totals, the draw pot (league draw base + draw factors + volatility) and a
 * calibrated gap curve become a 1000-point split: home / draw / away = percentages.
 *
 * Match types (decided from league tiers + context flags):
 *   mismatch  – two or more tiers apart
 *   standard  – adjacent tiers, ordinary round
 *   even      – same tier
 *   big       – derby, or two top-tier teams
 *
 * v3.0 fills the rows that our own data supports (results history, fixtures, tables).
 * Rows that need a richer feed (injuries, xG, PPDA, cards…) sit at neutral (5) until
 * that feed exists — they neither help nor hurt. Relevance and conversion constants are
 * the starting values from the Scoring Grid; the backtest calibrates them.
 */
import { db } from '../db';
import logger from '../utils/logger';
import { GROUPS, groupForCompetition, loadGroupMatches, fdNameFor, HistoryMatch } from './history';
import { Prediction } from './predictionModel';

export const MODEL_V3 = 'grid-v3';

export type MatchType = 'mismatch' | 'standard' | 'even' | 'big';

/* ------------------------------------------------------------------ */
/* Relevance grid (from the Scoring Grid page) — rows v3.0 can fill    */
/* ------------------------------------------------------------------ */

interface RowDef {
  id: string;
  name: string;
  rel: Record<MatchType, number>;
  /** 'team' rows favour a side; 'draw' rows feed the draw pot */
  kind: 'team' | 'draw';
  /** proxy = stands in for a richer parameter until its feed exists */
  note?: string;
}

const ROWS: RowDef[] = [
  { id: '#1', name: 'Strength (table, decayed)', rel: { mismatch: 5, standard: 5, even: 4, big: 4 }, kind: 'team', note: 'proxy for lineup value until squad values are loaded' },
  { id: '#19', name: 'Attack vs opponent tier', rel: { mismatch: 4, standard: 5, even: 5, big: 4 }, kind: 'team' },
  { id: '#14', name: 'Defence vs opponent tier', rel: { mismatch: 4, standard: 4, even: 4, big: 3 }, kind: 'team' },
  { id: '#10', name: 'Freshness (fixture load)', rel: { mismatch: 3, standard: 4, even: 4, big: 3 }, kind: 'team' },
  { id: '#23', name: 'Home / away record, specific', rel: { mismatch: 2, standard: 4, even: 5, big: 5 }, kind: 'team' },
  { id: '#7', name: 'Head-to-head, last 10', rel: { mismatch: 1, standard: 2, even: 3, big: 4 }, kind: 'team' },
  { id: '#21', name: 'Form, last 6', rel: { mismatch: 2, standard: 3, even: 4, big: 3 }, kind: 'team', note: 'stands in for time patterns until minute data exists' },
  { id: '#15', name: 'Draw-prone teams', rel: { mismatch: 1, standard: 3, even: 5, big: 4 }, kind: 'draw' },
  { id: '#30', name: 'League draw rate', rel: { mismatch: 1, standard: 3, even: 5, big: 4 }, kind: 'draw' },
  { id: '#16', name: 'Derby / stakes flag', rel: { mismatch: 4, standard: 3, even: 3, big: 5 }, kind: 'draw' }
];

/** Conversion constants — placeholders until calibrated on the backtest. */
export const CONV = {
  drawBase: { mismatch: 100, standard: 200, even: 260, big: 220 } as Record<MatchType, number>,
  drawCap: { mismatch: 200, standard: 300, even: 340, big: 330 } as Record<MatchType, number>,
  kDraw: 2.0, // points per (value−5) × relevance for draw rows
  gapScale: 0.1, // logistic scale on the relative gap between team totals (0.1 ≈ a 10% gap → 73/27)
  floorOutsider: 35,
  floorDraw: 60,
  halfLifeProd: 120, // days, production/form rows
  halfLifeLong: 365 // days, home record / h2h
};

/* ------------------------------------------------------------------ */
/* Derbies (football-data.co.uk names)                                  */
/* ------------------------------------------------------------------ */

const DERBIES: [string, string][] = [
  ['Real Madrid', 'Ath Madrid'], ['Barcelona', 'Real Madrid'], ['Barcelona', 'Espanol'], ['Sevilla', 'Betis'],
  ['Ath Bilbao', 'Sociedad'], ['Valencia', 'Levante'], ['Barcelona', 'Ath Madrid'],
  ['Man United', 'Man City'], ['Liverpool', 'Everton'], ['Arsenal', 'Tottenham'], ['Chelsea', 'Tottenham'],
  ['Arsenal', 'Chelsea'], ['Liverpool', 'Man United'], ['West Ham', 'Tottenham'], ['Newcastle', 'Sunderland'],
  ['Aston Villa', 'Birmingham'], ['Sheffield United', 'Sheffield Weds'], ['Nott\'m Forest', 'Derby'],
  ['Inter', 'Milan'], ['Roma', 'Lazio'], ['Juventus', 'Torino'], ['Juventus', 'Inter'], ['Genoa', 'Sampdoria'],
  ['Dortmund', 'Schalke 04'], ['Bayern Munich', 'Dortmund'], ['Hamburg', 'Werder Bremen'], ['Hamburg', 'St Pauli'],
  ['Paris SG', 'Marseille'], ['Lyon', 'St Etienne'], ['Lyon', 'Marseille'], ['Nice', 'Monaco'],
  ['Ajax', 'Feyenoord'], ['Ajax', 'PSV Eindhoven'], ['Feyenoord', 'PSV Eindhoven'],
  ['Benfica', 'Porto'], ['Benfica', 'Sp Lisbon'], ['Porto', 'Sp Lisbon']
];
const derbyKey = (a: string, b: string) => [a, b].sort().join('|');
const DERBY_SET = new Set(DERBIES.map(([a, b]) => derbyKey(a, b)));
export const isDerby = (a: string, b: string) => DERBY_SET.has(derbyKey(a, b));

/* ------------------------------------------------------------------ */
/* Team state from history                                             */
/* ------------------------------------------------------------------ */

interface TeamFeat {
  name: string;
  division: string;
  played: number; // this season, own division
  tier: 1 | 2 | 3 | 4;
  ppgSeason: number; // decayed ppg proxy for strength
  attack: number; // opponent-adjusted goals for / game (decayed)
  defence: number; // opponent-adjusted goals against / game (decayed), lower = better
  formPts: number; // points in last 6 league games
  homePpg: number; // decayed home ppg
  awayPpg: number; // decayed away ppg
  drawRate: number; // decayed share of draws
  gamesLast8: number; // matches in the 8 days before asOf
  lastMatch: string | null;
  /** values 1–10 (rank within division) */
  v: Record<string, number>;
}

interface GroupState {
  group: string;
  asOf: string;
  teams: Map<string, TeamFeat>;
  leagueDrawRate: Record<string, number>; // per division
  leagueAvgGoals: Record<string, number>; // per team per game
  homeAdv: Record<string, number>; // home goals / away goals
}

const DAY = 24 * 3600 * 1000;
const days = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / DAY;
const decay = (age: number, halfLife: number) => Math.pow(0.5, age / halfLife);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Rank-based 1–10 value within a list (higher raw = higher value unless invert). */
function rankValues(items: { name: string; raw: number }[], invert = false): Map<string, number> {
  const out = new Map<string, number>();
  const sorted = [...items].sort((a, b) => (invert ? a.raw - b.raw : b.raw - a.raw));
  const n = sorted.length;
  sorted.forEach((it, i) => out.set(it.name, n <= 1 ? 5.5 : Math.round((1 + 9 * (1 - i / (n - 1))) * 10) / 10));
  return out;
}

/** Season code (e.g. "2526") for a date. */
function seasonOf(date: string) {
  const d = new Date(date);
  const y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${String(y).slice(2)}${String(y + 1).slice(2)}`;
}

/**
 * Build the state of every team in a group as of a date, from matches strictly before it.
 */
export function buildState(group: string, all: HistoryMatch[], asOf: string): GroupState {
  const past = all.filter(m => m.date < asOf);
  const season = seasonOf(asOf);
  const divisions = GROUPS[group]?.divisions || [];
  const teams = new Map<string, TeamFeat>();

  // --- which division is each team in this season? (last division seen this season, else last ever)
  const divOf = new Map<string, string>();
  for (const m of past) {
    for (const t of [m.home, m.away]) {
      if (m.season === season || !divOf.has(t)) divOf.set(t, m.division);
    }
  }
  // teams whose only appearances are in older seasons and not in this one: still keep (early season)
  const ensure = (name: string) => {
    let t = teams.get(name);
    if (!t) {
      t = {
        name, division: divOf.get(name) || divisions[0], played: 0, tier: 3, ppgSeason: 1, attack: 1.3, defence: 1.3,
        formPts: 6, homePpg: 1.5, awayPpg: 1.1, drawRate: 0.25, gamesLast8: 0, lastMatch: null, v: {}
      };
      teams.set(name, t);
    }
    return t;
  };

  // --- league-level numbers per division (last two seasons, decayed)
  const leagueDrawRate: Record<string, number> = {};
  const leagueAvgGoals: Record<string, number> = {};
  const homeAdv: Record<string, number> = {};
  for (const div of divisions) {
    let w = 0, draws = 0, goals = 0, hg = 0, ag = 0;
    for (const m of past) {
      if (m.division !== div) continue;
      const k = decay(days(m.date, asOf), 540);
      w += k; draws += k * (m.hg === m.ag ? 1 : 0); goals += k * (m.hg + m.ag); hg += k * m.hg; ag += k * m.ag;
    }
    leagueDrawRate[div] = w ? draws / w : 0.25;
    leagueAvgGoals[div] = w ? goals / w / 2 : 1.35;
    homeAdv[div] = ag ? hg / ag : 1.25;
  }

  // --- raw decayed aggregates per team
  interface Agg { w: number; gf: number; ga: number; pts: number; hw: number; hpts: number; aw: number; apts: number; d: number; games: { date: string; pts: number; season: string; division: string }[] }
  const agg = new Map<string, Agg>();
  const A = (n: string) => { let a = agg.get(n); if (!a) { a = { w: 0, gf: 0, ga: 0, pts: 0, hw: 0, hpts: 0, aw: 0, apts: 0, d: 0, games: [] }; agg.set(n, a); } return a; };
  for (const m of past) {
    const age = days(m.date, asOf);
    const kP = decay(age, CONV.halfLifeProd);
    const kL = decay(age, CONV.halfLifeLong);
    const hPts = m.hg > m.ag ? 3 : m.hg === m.ag ? 1 : 0;
    const aPts = m.hg < m.ag ? 3 : m.hg === m.ag ? 1 : 0;
    const h = A(m.home), a = A(m.away);
    h.w += kP; h.gf += kP * m.hg; h.ga += kP * m.ag; h.pts += kP * hPts; h.d += kP * (hPts === 1 ? 1 : 0);
    a.w += kP; a.gf += kP * m.ag; a.ga += kP * m.hg; a.pts += kP * aPts; a.d += kP * (aPts === 1 ? 1 : 0);
    h.hw += kL; h.hpts += kL * hPts; a.aw += kL; a.apts += kL * aPts;
    h.games.push({ date: m.date, pts: hPts, season: m.season, division: m.division });
    a.games.push({ date: m.date, pts: aPts, season: m.season, division: m.division });
    ensure(m.home); ensure(m.away);
  }

  // --- first pass: unadjusted attack/defence per game
  const rawAtt = new Map<string, number>(), rawDef = new Map<string, number>();
  agg.forEach((x, n) => { rawAtt.set(n, x.w ? x.gf / x.w : 1.3); rawDef.set(n, x.w ? x.ga / x.w : 1.3); });
  // --- second pass: opponent-adjusted (divide by opponent's defence / attack relative to league)
  const adjAtt = new Map<string, number>(), adjDef = new Map<string, number>();
  {
    const acc = new Map<string, { w: number; att: number; def: number }>();
    for (const m of past) {
      const k = decay(days(m.date, asOf), CONV.halfLifeProd);
      const avg = leagueAvgGoals[m.division] || 1.35;
      const oppDefH = (rawDef.get(m.away) || avg) / avg; // how leaky the away side is
      const oppAttH = (rawAtt.get(m.away) || avg) / avg;
      const oppDefA = (rawDef.get(m.home) || avg) / avg;
      const oppAttA = (rawAtt.get(m.home) || avg) / avg;
      const h = acc.get(m.home) || { w: 0, att: 0, def: 0 }; h.w += k; h.att += k * m.hg / Math.max(0.5, oppDefH); h.def += k * m.ag / Math.max(0.5, oppAttH); acc.set(m.home, h);
      const a = acc.get(m.away) || { w: 0, att: 0, def: 0 }; a.w += k; a.att += k * m.ag / Math.max(0.5, oppDefA); a.def += k * m.hg / Math.max(0.5, oppAttA); acc.set(m.away, a);
    }
    acc.forEach((x, n) => { adjAtt.set(n, x.w ? x.att / x.w : 1.3); adjDef.set(n, x.w ? x.def / x.w : 1.3); });
  }

  // --- per-team features
  teams.forEach(t => {
    const x = agg.get(t.name);
    if (!x) return;
    const thisSeason = x.games.filter(g => g.season === season && g.division === t.division);
    t.played = thisSeason.length;
    t.attack = adjAtt.get(t.name) ?? 1.3;
    t.defence = adjDef.get(t.name) ?? 1.3;
    t.ppgSeason = x.w ? x.pts / x.w : 1;
    t.drawRate = x.w ? x.d / x.w : 0.25;
    t.homePpg = x.hw ? x.hpts / x.hw : 1.5;
    t.awayPpg = x.aw ? x.apts / x.aw : 1.1;
    const recent = [...x.games].sort((p, q) => (p.date < q.date ? 1 : -1)).slice(0, 6);
    t.formPts = recent.reduce((s, g) => s + g.pts, 0) + (6 - recent.length) * 1; // pad missing games with a draw
    t.gamesLast8 = x.games.filter(g => days(g.date, asOf) <= 8).length;
    t.lastMatch = x.games.length ? x.games.reduce((m, g) => (g.date > m ? g.date : m), x.games[0].date) : null;
  });

  // --- tiers and 1–10 values per division
  for (const div of divisions) {
    const list = Array.from(teams.values()).filter(t => t.division === div);
    if (!list.length) continue;
    // strength = decayed ppg (early season this naturally leans on last season)
    const strength = rankValues(list.map(t => ({ name: t.name, raw: t.ppgSeason })));
    const sortedStrength = [...list].sort((a, b) => b.ppgSeason - a.ppgSeason);
    sortedStrength.forEach((t, i) => { t.tier = (Math.min(3, Math.floor((i / sortedStrength.length) * 4)) + 1) as 1 | 2 | 3 | 4; });
    const att = rankValues(list.map(t => ({ name: t.name, raw: t.attack })));
    const def = rankValues(list.map(t => ({ name: t.name, raw: t.defence })), true);
    const form = rankValues(list.map(t => ({ name: t.name, raw: t.formPts })));
    const home = rankValues(list.map(t => ({ name: t.name, raw: t.homePpg })));
    const away = rankValues(list.map(t => ({ name: t.name, raw: t.awayPpg })));
    const draws = rankValues(list.map(t => ({ name: t.name, raw: t.drawRate })));
    for (const t of list) {
      t.v = {
        strength: strength.get(t.name)!, attack: att.get(t.name)!, defence: def.get(t.name)!, form: form.get(t.name)!,
        home: home.get(t.name)!, away: away.get(t.name)!, draws: draws.get(t.name)!,
        fresh: t.gamesLast8 === 0 ? 8 : t.gamesLast8 === 1 ? 6 : t.gamesLast8 === 2 ? 4 : 2
      };
    }
  }

  return { group, asOf, teams, leagueDrawRate, leagueAvgGoals, homeAdv };
}

/* ------------------------------------------------------------------ */
/* Scoring one match                                                   */
/* ------------------------------------------------------------------ */

function h2hLast10(all: HistoryMatch[], home: string, away: string, asOf: string) {
  const meet = all.filter(m => m.date < asOf && ((m.home === home && m.away === away) || (m.home === away && m.away === home)))
    .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10);
  if (!meet.length) return null;
  let share = 0;
  for (const m of meet) {
    const homeWon = (m.home === home && m.hg > m.ag) || (m.away === home && m.ag > m.hg);
    share += m.hg === m.ag ? 0.5 : homeWon ? 1 : 0;
  }
  return { n: meet.length, share: share / meet.length };
}

export function matchTypeFor(h: TeamFeat, a: TeamFeat, derby: boolean): MatchType {
  if (derby) return 'big';
  const gap = Math.abs(h.tier - a.tier);
  if (gap >= 2) return 'mismatch';
  if (h.tier === 1 && a.tier === 1) return 'big';
  if (gap === 0) return 'even';
  return 'standard';
}

/** Poisson helpers for the goal-based extras (xG, over 2.5, BTTS, top scores) */
function poisson(l: number, k: number) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; }

export function scoreMatch(state: GroupState, all: HistoryMatch[], home: string, away: string, asOf: string): Prediction | null {
  const h = state.teams.get(home), a = state.teams.get(away);
  if (!h || !a) return null;
  const derby = isDerby(home, away);
  const type = matchTypeFor(h, a, derby);
  const div = h.division;
  const leagueDraw = state.leagueDrawRate[div] ?? 0.25;

  const h2h = h2hLast10(all, home, away, asOf);
  const rows: NonNullable<Prediction['grid']>['rows'] = [];
  let totH = 0, totA = 0, drawFactors = 0;

  const push = (def: RowDef, vh: number, va: number, note?: string) => {
    const rel = def.rel[type];
    if (def.kind === 'team') {
      const ph = vh * rel, pa = va * rel;
      totH += ph; totA += pa;
      rows.push({ id: def.id, name: def.name, rel, home: vh, away: va, edge: Math.round((ph - pa) * 10) / 10, note: note || def.note });
    } else {
      // draw rows: a single value (how much this pushes toward the draw), stored in both columns
      drawFactors += (vh - 5) * rel * CONV.kDraw;
      rows.push({ id: def.id, name: def.name, rel, home: vh, away: vh, edge: 0, note: note || def.note });
    }
  };
  const R = (id: string) => ROWS.find(r => r.id === id)!;

  push(R('#1'), h.v.strength, a.v.strength);
  push(R('#19'), h.v.attack, a.v.attack);
  push(R('#14'), h.v.defence, a.v.defence);
  push(R('#10'), h.v.fresh, a.v.fresh, `${h.gamesLast8} vs ${a.gamesLast8} games in the last 8 days`);
  push(R('#23'), h.v.home, a.v.away, 'home record of the home side vs away record of the away side');
  if (h2h) push(R('#7'), 1 + 9 * h2h.share, 1 + 9 * (1 - h2h.share), `${h2h.n} meetings, home side share ${Math.round(h2h.share * 100)}%`);
  else push(R('#7'), 5, 5, 'no previous meetings in the data');
  push(R('#21'), h.v.form, a.v.form, `last 6: ${h.formPts} vs ${a.formPts} pts`);
  // draw rows: draw-prone = average of both teams' draw values; league = draw rate vs 25% norm; derby flag
  push(R('#15'), Math.round(((h.v.draws + a.v.draws) / 2) * 10) / 10, 0);
  push(R('#30'), clamp(5 + (leagueDraw - 0.25) * 60, 1, 10), 0, `league draw rate ${Math.round(leagueDraw * 100)}%`);
  push(R('#16'), derby ? 8 : 5, 0, derby ? 'derby' : undefined);

  // --- draw pot
  const base = CONV.drawBase[type];
  const volatility = 0; // no card/referee feed yet
  let drawPts = clamp(base + drawFactors + volatility, CONV.floorDraw, CONV.drawCap[type]);

  // --- split the rest by the relative gap
  const gap = (totH - totA) / (totH + totA);
  const pH = 1 / (1 + Math.exp(-gap / CONV.gapScale));
  let rest = 1000 - drawPts;
  let ptsH = rest * pH, ptsA = rest - ptsH;
  if (ptsA < CONV.floorOutsider) { ptsH -= CONV.floorOutsider - ptsA; ptsA = CONV.floorOutsider; }
  if (ptsH < CONV.floorOutsider) { ptsA -= CONV.floorOutsider - ptsH; ptsH = CONV.floorOutsider; }
  ptsH = Math.round(ptsH); ptsA = Math.round(ptsA); drawPts = 1000 - ptsH - ptsA;

  // --- goal extras from a plain Poisson on the adjusted rates (for xG / O2.5 / BTTS / top scores on the UI)
  const avg = state.leagueAvgGoals[div] || 1.35;
  const ha = state.homeAdv[div] || 1.25;
  const lamH = clamp((h.attack / avg) * (a.defence / avg) * avg * Math.sqrt(ha), 0.3, 4);
  const lamA = clamp((a.attack / avg) * (h.defence / avg) * avg / Math.sqrt(ha), 0.3, 4);
  const grid: number[][] = [];
  let over25 = 0, btts = 0;
  const scores: { home: number; away: number; prob: number }[] = [];
  for (let i = 0; i <= 8; i++) { grid.push([]); for (let j = 0; j <= 8; j++) { const p = poisson(lamH, i) * poisson(lamA, j); grid[i].push(p); if (i + j > 2.5) over25 += p; if (i > 0 && j > 0) btts += p; scores.push({ home: i, away: j, prob: p }); } }
  scores.sort((x, y) => y.prob - x.prob);

  // --- reasons: the rows with the largest edge, plus draw pushes
  const reasons: string[] = [];
  const byEdge = rows.filter(r => r.edge !== 0).sort((x, y) => Math.abs(y.edge) - Math.abs(x.edge)).slice(0, 3);
  for (const r of byEdge) reasons.push(`${r.name}: ${r.edge > 0 ? home : away} +${Math.abs(r.edge)}`);
  if (drawFactors > 8) reasons.push(`draw factors +${Math.round(drawFactors)} (${derby ? 'derby, ' : ''}draw-prone / league)`);

  const evidence = Math.min(h.played, a.played);
  return {
    model: MODEL_V3,
    home: ptsH / 10, draw: drawPts / 10, away: ptsA / 10,
    expectedGoals: { home: Math.round(lamH * 100) / 100, away: Math.round(lamA * 100) / 100 },
    over25: Math.round(over25 * 1000) / 10,
    btts: Math.round(btts * 1000) / 10,
    topScores: scores.slice(0, 5).map(s => ({ ...s, prob: Math.round(s.prob * 1000) / 10 })),
    confidence: evidence < 4 ? 'low' : evidence < 10 ? 'medium' : 'high',
    factors: {
      homeAttack: Math.round((h.attack / avg) * 100) / 100, homeDefence: Math.round((h.defence / avg) * 100) / 100,
      awayAttack: Math.round((a.attack / avg) * 100) / 100, awayDefence: Math.round((a.defence / avg) * 100) / 100,
      homeAdvantage: Math.round(ha * 100) / 100, homeForm: h.formPts / 18, awayForm: a.formPts / 18,
      gamesPlayed: { home: h.played, away: a.played }, leagueAvgGoals: Math.round(avg * 100) / 100
    },
    grid: {
      matchType: type,
      points: { home: ptsH, draw: drawPts, away: ptsA },
      totals: { home: Math.round(totH), away: Math.round(totA) },
      rows,
      drawPot: { base, factors: Math.round(drawFactors), volatility, total: drawPts },
      reasons
    }
  };
}

/* ------------------------------------------------------------------ */
/* Live use                                                            */
/* ------------------------------------------------------------------ */

const liveState = new Map<string, { state: GroupState; all: HistoryMatch[] }>();
let lastBuiltAt: string | null = null;

/** Rebuild every group's state as of today (cheap: a few thousand rows per group). */
export function prepareModelV3() {
  const asOf = new Date(Date.now() + DAY).toISOString().slice(0, 10); // include today's finished games
  let built = 0;
  for (const group of Object.keys(GROUPS)) {
    const all = loadGroupMatches(group);
    if (all.length < 100) continue;
    liveState.set(group, { state: buildState(group, all, asOf), all });
    built++;
  }
  lastBuiltAt = new Date().toISOString();
  logger.info(`model v3 state built for ${built} groups`);
  return built;
}

/** v3 prediction for a Football-Data.org match object, or null if not covered. */
export function predictV3(match: any): Prediction | null {
  const code = match?.competition?.code;
  const group = code ? groupForCompetition(code) : null;
  if (!group) return null;
  const live = liveState.get(group);
  if (!live) return null;
  const home = fdNameFor(group, match.homeTeam?.id);
  const away = fdNameFor(group, match.awayTeam?.id);
  if (!home || !away) return null;
  return scoreMatch(live.state, live.all, home, away, live.state.asOf);
}

export function modelV3Status() {
  const groups: Record<string, any> = {};
  liveState.forEach((v, g) => {
    groups[g] = { teams: v.state.teams.size, asOf: v.state.asOf, leagueDrawRate: v.state.leagueDrawRate };
  });
  return { model: MODEL_V3, lastBuiltAt, conv: CONV, rows: ROWS.map(r => ({ id: r.id, name: r.name, rel: r.rel })), groups };
}

/* ------------------------------------------------------------------ */
/* Backtest (same harness/tables as v2, model = grid-v3)               */
/* ------------------------------------------------------------------ */

// Prepared lazily: the backtest tables are created by historyModel.ts, which may load after this file
let insertBtStmt: any = null;
const insertBt = () =>
  (insertBtStmt ||= db.prepare(`
    INSERT OR REPLACE INTO backtest_predictions
      (run_id, division, date, home, away, hg, ag, outcome, p_home, p_draw, p_away, xg_home, xg_away, odds_home, odds_draw, odds_away, early_h, early_d, early_a, evidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `));

let running: { season: string; group: string; done: number; total: number } | null = null;
export const backtestProgressV3 = () => running;

export async function runBacktestV3(season: string, group: string, conv: Partial<typeof CONV> = {}) {
  const saved = { ...CONV };
  Object.assign(CONV, conv);
  try {
    const divs = GROUPS[group]?.divisions || [];
    if (!divs.length) throw new Error(`Unknown group ${group}`);
    const all = loadGroupMatches(group);
    const target = all.filter(m => m.season === season && m.division === divs[0]);
    if (!target.length) throw new Error(`No matches for ${group} ${season}`);

    db.prepare(`DELETE FROM backtest_predictions WHERE run_id IN (SELECT id FROM backtest_runs WHERE season = ? AND grp = ? AND model = ?)`).run(season, group, MODEL_V3);
    db.prepare(`DELETE FROM backtest_runs WHERE season = ? AND grp = ? AND model = ?`).run(season, group, MODEL_V3);
    const runId = Number(
      db.prepare(`INSERT INTO backtest_runs (season, grp, model, matches, started_at, params) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(season, group, MODEL_V3, target.length, new Date().toISOString(), JSON.stringify(CONV)).lastInsertRowid
    );

    running = { season, group, done: 0, total: target.length };
    let cursor = new Date(target[0].date);
    const last = new Date(target[target.length - 1].date);
    let predicted = 0;
    while (cursor <= last) {
      const from = cursor.toISOString().slice(0, 10);
      const to = new Date(cursor.getTime() + 7 * DAY).toISOString().slice(0, 10);
      const week = target.filter(m => m.date >= from && m.date < to);
      if (week.length) {
        const state = buildState(group, all, from);
        db.exec('BEGIN');
        for (const m of week) {
          const p = scoreMatch(state, all, m.home, m.away, from);
          if (!p) continue;
          const outcome = m.hg > m.ag ? 'H' : m.hg < m.ag ? 'A' : 'D';
          insertBt().run(
            runId, m.division, m.date, m.home, m.away, m.hg, m.ag, outcome,
            p.home, p.draw, p.away, p.expectedGoals.home, p.expectedGoals.away,
            m.close_h ?? m.odds_h, m.close_d ?? m.odds_d, m.close_a ?? m.odds_a,
            m.odds_h, m.odds_d, m.odds_a,
            Math.min(p.factors.gamesPlayed.home, p.factors.gamesPlayed.away)
          );
          predicted++;
        }
        db.exec('COMMIT');
        running.done += week.length;
        await new Promise<void>(resolve => setImmediate(() => resolve()));
      }
      cursor = new Date(cursor.getTime() + 7 * DAY);
    }
    db.prepare(`UPDATE backtest_runs SET finished_at = ?, matches = ? WHERE id = ?`).run(new Date().toISOString(), predicted, runId);
    logger.info(`Backtest v3 ${group} ${season}: ${predicted} predictions`);
    return { runId, predicted };
  } finally {
    Object.assign(CONV, saved);
    running = null;
  }
}

export async function runBacktestV3All(season: string, conv: Partial<typeof CONV> = {}) {
  const out: Record<string, any> = {};
  for (const group of Object.keys(GROUPS)) {
    try { out[group] = await runBacktestV3(season, group, conv); } catch (error: any) { out[group] = { error: error.message }; }
  }
  return out;
}
