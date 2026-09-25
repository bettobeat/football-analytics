/**
 * European club Elo ("elo-euro") — predictions for Champions League, Europa League and Conference League.
 *
 * Ratings: domestic results of our 12 API-Football leagues (af_fixtures, 3 seasons) + UEFA cup results
 * (4 seasons) in one timeline. Cup matches connect the leagues. Each club starts from its squad value
 * (so clubs from leagues we do not track, e.g. Ukraine or Denmark, start sensibly), then moves with results.
 * Percentages: ordered logistic on (Elo gap + home advantage + β·ln(squad value ratio)), fitted on cup matches.
 */
import { db } from '../db';
import logger from '../utils/logger';
import { afGet, afConfigured } from './apiFootball';
import { similarity, normalizeName } from './history';
import { Prediction } from './predictionModel';

export const MODEL_EURO = 'elo-euro';
const AF_OFFSET = 1_000_000_000;
const CUPS: Record<number, string> = { 2: 'Champions League', 3: 'Europa League', 848: 'Conference League' };
const K_DOMESTIC = 18, K_CUP = 32, HA = 60;

db.exec(`
  CREATE TABLE IF NOT EXISTS eur_matches (
    fixture_id INTEGER PRIMARY KEY, league_id INTEGER NOT NULL, season INTEGER NOT NULL, date TEXT NOT NULL,
    home_id INTEGER NOT NULL, away_id INTEGER NOT NULL, home_name TEXT, away_name TEXT, hg INTEGER, ag INTEGER
  );
  CREATE TABLE IF NOT EXISTS eur_sync (key TEXT PRIMARY KEY, done_at TEXT NOT NULL, n INTEGER);
`);

/* ---------- data ---------- */

export async function syncEuropeanCups(force = false) {
  if (!afConfigured()) return { requests: 0, matches: 0 };
  const now = new Date();
  const cur = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  let requests = 0, matches = 0;
  const ins = db.prepare(`INSERT OR REPLACE INTO eur_matches (fixture_id, league_id, season, date, home_id, away_id, home_name, away_name, hg, ag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const id of Object.keys(CUPS).map(Number))
    for (let s = cur - 3; s <= cur; s++) {
      const key = `${id}|${s}`;
      const row: any = db.prepare(`SELECT done_at FROM eur_sync WHERE key = ?`).get(key);
      if (!force && row && (s < cur || Date.now() - new Date(row.done_at).getTime() < 12 * 3600 * 1000)) continue;
      try {
        const j = await afGet('/fixtures', { league: id, season: s });
        requests++;
        let n = 0;
        db.exec('BEGIN');
        for (const f of j.response || []) {
          if (!['FT', 'AET', 'PEN'].includes(f.fixture?.status?.short)) continue;
          const hg = f.score?.extratime?.home ?? f.score?.fulltime?.home ?? f.goals?.home;
          const ag = f.score?.extratime?.away ?? f.score?.fulltime?.away ?? f.goals?.away;
          if (hg === null || hg === undefined || ag === null || ag === undefined) continue;
          ins.run(f.fixture.id, id, s, String(f.fixture.date).slice(0, 10), f.teams.home.id, f.teams.away.id, f.teams.home.name, f.teams.away.name, hg, ag);
          n++;
        }
        db.exec('COMMIT');
        db.prepare(`INSERT OR REPLACE INTO eur_sync (key, done_at, n) VALUES (?, ?, ?)`).run(key, new Date().toISOString(), n);
        matches += n;
      } catch (e: any) {
        try { db.exec('ROLLBACK'); } catch { /* not in a transaction */ }
        logger.warn(`European cups ${key}: ${e.message}`);
      }
    }
  return { requests, matches };
}

/* ---------- club squad values (top 15 by current club, from the Transfermarkt player dump) ---------- */

let clubValues: { name: string; norm: string; value: number }[] = [];
function loadClubValues() {
  const rows = db.prepare(`SELECT club, value_eur FROM squad_players WHERE club IS NOT NULL`).all() as any[];
  const byClub = new Map<string, number[]>();
  for (const r of rows) (byClub.get(r.club) || byClub.set(r.club, []).get(r.club)!).push(r.value_eur);
  clubValues = [...byClub.entries()]
    .filter(([, v]) => v.length >= 11)
    .map(([name, v]) => ({ name, norm: normalizeName(name), value: v.sort((a, b) => b - a).slice(0, 15).reduce((a, b) => a + b, 0) }));
}
const valueByName = new Map<string, number | null>();
function clubValueFor(name: string): number | null {
  if (valueByName.has(name)) return valueByName.get(name)!;
  let best: { v: number; s: number } | null = null;
  for (const c of clubValues) {
    const s = similarity(name, c.name);
    if (s >= 0.6 && (!best || s > best.s)) best = { v: c.value, s };
  }
  const v = best ? best.v : null;
  valueByName.set(name, v);
  return v;
}

/* ---------- ratings ---------- */

const ratings = new Map<number, { elo: number; name: string; n: number; cup: number }>(); // key = API-Football team id
const byNorm = new Map<string, number>(); // normalised name → team id (for Football-Data.org Champions League matches)
const fdCache = new Map<number, number | null>(); // Football-Data.org team id → API-Football team id
let fit = { c: 60, s: 110, beta: 0 };
let evalStats: any = null;
let lastBuilt: string | null = null;

const sig = (x: number) => 1 / (1 + Math.exp(-x));
function probs(d: number, c = fit.c, s = fit.s) {
  const h = sig((d - c) / s), a = sig((-d - c) / s);
  const dr = Math.max(0.03, 1 - h - a);
  const t = h + a + dr;
  return { h: h / t, d: dr / t, a: a / t };
}
const gdMult = (gd: number) => { const g = Math.abs(gd); return g <= 1 ? 1 : g === 2 ? 1.5 : (11 + g) / 8; };

export function buildClubElo() {
  loadClubValues();
  valueByName.clear();
  const domestic = db.prepare(`
    SELECT fixture_id, date, home_id, away_id, home_name, away_name, hg, ag, 0 AS cup FROM af_fixtures
    WHERE status IN ('FT','AET','PEN') AND hg IS NOT NULL`).all() as any[];
  const cups = db.prepare(`SELECT fixture_id, date, home_id, away_id, home_name, away_name, hg, ag, 1 AS cup FROM eur_matches`).all() as any[];
  const all = [...domestic, ...cups].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.fixture_id - b.fixture_id));
  ratings.clear();
  byNorm.clear();
  fdCache.clear();
  const median = 150e6;
  const get = (id: number, name: string) => {
    let r = ratings.get(id);
    if (!r) {
      const v = clubValueFor(name);
      r = { elo: v ? 1500 + 120 * Math.log(v / median) : 1400, name, n: 0, cup: 0 };
      ratings.set(id, r);
      byNorm.set(normalizeName(name), id);
    }
    return r;
  };
  const pre: { d: number; lv: number; o: 'H' | 'D' | 'A'; date: string }[] = [];
  for (const m of all) {
    const H = get(m.home_id, m.home_name), A = get(m.away_id, m.away_name);
    const d = H.elo - A.elo + HA;
    const o = m.hg > m.ag ? 'H' : m.hg < m.ag ? 'A' : 'D';
    if (m.cup && H.n >= 8 && A.n >= 8) {
      const vh = clubValueFor(H.name), va = clubValueFor(A.name);
      pre.push({ d, lv: vh && va ? Math.log(vh / va) : 0, o, date: m.date });
    }
    const we = 1 / (1 + Math.pow(10, -d / 400));
    const w = o === 'H' ? 1 : o === 'D' ? 0.5 : 0;
    const delta = (m.cup ? K_CUP : K_DOMESTIC) * gdMult(m.hg - m.ag) * (w - we);
    H.elo += delta; A.elo -= delta;
    H.n++; A.n++;
    if (m.cup) { H.cup++; A.cup++; }
  }
  // fit on cup matches; evaluate on the most recent 40 % of them
  const cut = Math.floor(pre.length * 0.6);
  const train = pre.slice(0, cut), test = pre.slice(cut);
  const llOf = (xs: typeof pre, c: number, s: number, b: number) => {
    let ll = 0;
    for (const x of xs) { const p = probs(x.d + b * x.lv, c, s); ll -= Math.log(Math.max(1e-6, x.o === 'H' ? p.h : x.o === 'D' ? p.d : p.a)); }
    return ll;
  };
  const grid = (betas: number[]) => {
    let best = { ll: Infinity, c: 60, s: 110, beta: 0 };
    for (const b of betas) for (let c = 0; c <= 300; c += 10) for (let s = 60; s <= 400; s += 10) {
      const ll = llOf(train, c, s, b);
      if (ll < best.ll) best = { ll, c, s, beta: b };
    }
    return best;
  };
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const score = (c: number, s: number, b: number) => {
    let brier = 0, ll = 0, hits = 0;
    for (const x of test) {
      const p = probs(x.d + b * x.lv, c, s);
      brier += (p.h - (x.o === 'H' ? 1 : 0)) ** 2 + (p.d - (x.o === 'D' ? 1 : 0)) ** 2 + (p.a - (x.o === 'A' ? 1 : 0)) ** 2;
      ll -= Math.log(Math.max(1e-6, x.o === 'H' ? p.h : x.o === 'D' ? p.d : p.a));
      const pick = p.h >= p.d && p.h >= p.a ? 'H' : p.a >= p.d ? 'A' : 'D';
      if (pick === x.o) hits++;
    }
    return test.length ? { brier: r3(brier / test.length), logLoss: r3(ll / test.length), hitRate: Math.round((hits / test.length) * 1000) / 10 } : null;
  };
  if (train.length >= 100) {
    const base = grid([0]);
    const withV = grid([0, 25, 50, 75, 100, 125, 150, 200, 250]);
    fit = { c: withV.c, s: withV.s, beta: withV.beta };
    evalStats = {
      cupMatchesFit: train.length, cupMatchesTest: test.length,
      eloOnly: score(base.c, base.s, 0), eloPlusSquadValue: score(withV.c, withV.s, withV.beta),
      note: 'fitted on the older 60% of UEFA cup matches, scored on the newest 40% (out-of-sample)'
    };
  }
  lastBuilt = new Date().toISOString();
  logger.info(`Club Elo: ${all.length} matches (${cups.length} UEFA cup), ${ratings.size} clubs, fit ${JSON.stringify(fit)}`);
  return { matches: all.length, cupMatches: cups.length, clubs: ratings.size };
}

/* ---------- prediction ---------- */

function findTeam(match: any, side: 'homeTeam' | 'awayTeam') {
  const t = match[side];
  if (!t) return null;
  if (t.id >= AF_OFFSET) { const r = ratings.get(t.id - AF_OFFSET); if (r) return r; }
  // Football-Data.org Champions League: match by name (cached per team id)
  if (fdCache.has(t.id)) { const id = fdCache.get(t.id); return id ? ratings.get(id) || null : null; }
  let found: number | null = byNorm.get(normalizeName(t.name || '')) || null;
  if (!found) {
    let best: { id: number; s: number } | null = null;
    for (const [norm, id] of byNorm) {
      const s = Math.max(similarity(norm, t.name || ''), t.shortName ? similarity(norm, t.shortName) : 0);
      if (s >= 0.7 && (!best || s > best.s)) best = { id, s };
    }
    found = best ? best.id : null;
  }
  fdCache.set(t.id, found);
  return found ? ratings.get(found) || null : null;
}

function poisson(l: number, k: number) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; }

export function predictClubEuro(match: any): Prediction | null {
  const H = findTeam(match, 'homeTeam'), A = findTeam(match, 'awayTeam');
  if (!H || !A || H.n < 8 || A.n < 8) return null;
  const vh = clubValueFor(H.name), va = clubValueFor(A.name);
  const valueTerm = vh && va ? fit.beta * Math.log(vh / va) : 0;
  const d = H.elo - A.elo + HA + valueTerm;
  const p = probs(d);
  const lamH = Math.max(0.2, 1.45 * Math.exp(d / 700)), lamA = Math.max(0.2, 1.2 * Math.exp(-d / 700));
  let over25 = 0, btts = 0;
  const scores: { home: number; away: number; prob: number }[] = [];
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    const q = poisson(lamH, i) * poisson(lamA, j);
    if (i + j > 2.5) over25 += q;
    if (i > 0 && j > 0) btts += q;
    scores.push({ home: i, away: j, prob: q });
  }
  scores.sort((x, y) => y.prob - x.prob);
  const pct = (x: number) => Math.round(x * 1000) / 10;
  return {
    model: MODEL_EURO,
    home: pct(p.h), draw: pct(p.d), away: pct(p.a),
    expectedGoals: { home: Math.round(lamH * 100) / 100, away: Math.round(lamA * 100) / 100 },
    over25: pct(over25), btts: pct(btts),
    topScores: scores.slice(0, 3).map(s => ({ ...s, prob: pct(s.prob) })),
    confidence: Math.min(H.cup, A.cup) >= 12 ? 'high' : Math.min(H.cup, A.cup) >= 4 ? 'medium' : 'low',
    factors: {
      homeAttack: Math.round(H.elo), homeDefence: 0, awayAttack: Math.round(A.elo), awayDefence: 0,
      homeAdvantage: HA, homeForm: Math.round(valueTerm), awayForm: 1, gamesPlayed: { home: H.n, away: A.n }, leagueAvgGoals: 1.3
    }
  };
}

export function clubEloStatus() {
  const top = [...ratings.values()].filter(r => r.cup >= 6).sort((a, b) => b.elo - a.elo).slice(0, 25)
    .map((r, i) => ({ rank: i + 1, club: r.name, elo: Math.round(r.elo), cupMatches: r.cup, squadValueM: Math.round((clubValueFor(r.name) || 0) / 1e6) }));
  const n: any = db.prepare(`SELECT COUNT(*) AS n, MIN(date) AS first, MAX(date) AS last FROM eur_matches`).get();
  return { model: MODEL_EURO, lastBuilt, cupMatches: n, clubs: ratings.size, clubValues: clubValues.length, fit, evaluation: evalStats, top };
}

export function startClubEloScheduler() {
  if (!afConfigured()) return;
  try { buildClubElo(); } catch { /* tables may be empty on first boot */ }
  const run = () => syncEuropeanCups().then(() => buildClubElo()).catch(() => undefined);
  setTimeout(run, 4 * 60 * 1000);
  setInterval(run, 12 * 3600 * 1000);
}
