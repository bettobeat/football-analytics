/**
 * National-team Elo ("elo-intl") — predictions for friendlies, Nations League and qualifiers.
 *
 * Ratings: every senior men's international result since 2014 from API-Football (World Cup, Euro, Copa América,
 * AFCON, Asian Cup, Gold Cup, qualifiers, Nations League, friendlies). World-Football-Elo style:
 *   K by importance (finals 60 / continental finals 50 / qualifiers & Nations League 40 / friendlies 20),
 *   goal-difference multiplier, home advantage (none at tournament finals, reduced in friendlies).
 * Percentages: ordered logistic on the rating gap, P(H) = σ((d − c)/s), P(A) = σ((−d − c)/s), draw = the rest,
 * with c and s fitted by maximum likelihood on walk-forward (pre-match) ratings.
 */
import { db } from '../db';
import logger from '../utils/logger';
import { afGet, afConfigured } from './apiFootball';
import { Prediction } from './predictionModel';
import { nationalValueFor } from './squadValues';

export const MODEL_ELO = 'elo-intl';
const AF_OFFSET = 1_000_000_000;

/** API-Football league id → [K, home advantage]. */
const COMPS: Record<number, { k: number; ha: number; name: string }> = {
  1: { k: 60, ha: 0, name: 'World Cup' },
  4: { k: 50, ha: 0, name: 'Euro' },
  9: { k: 50, ha: 0, name: 'Copa America' },
  6: { k: 50, ha: 0, name: 'Africa Cup of Nations' },
  7: { k: 50, ha: 0, name: 'Asian Cup' },
  22: { k: 45, ha: 0, name: 'Gold Cup' },
  5: { k: 40, ha: 90, name: 'UEFA Nations League' },
  32: { k: 40, ha: 90, name: 'WC qualification Europe' },
  34: { k: 40, ha: 90, name: 'WC qualification South America' },
  29: { k: 40, ha: 90, name: 'WC qualification Africa' },
  30: { k: 40, ha: 90, name: 'WC qualification Asia' },
  31: { k: 40, ha: 90, name: 'WC qualification CONCACAF' },
  960: { k: 40, ha: 90, name: 'Euro qualification' },
  10: { k: 20, ha: 50, name: 'Friendlies' }
};
const FIRST_SEASON = 2014;
const YOUTH = /\bU-?(1[5-9]|2[0-3])\b|\bUnder[- ]?\d{2}\b|\b(W|Women)$/i;

db.exec(`
  CREATE TABLE IF NOT EXISTS nat_matches (
    fixture_id INTEGER PRIMARY KEY, league_id INTEGER NOT NULL, date TEXT NOT NULL,
    home_id INTEGER NOT NULL, away_id INTEGER NOT NULL, home_name TEXT, away_name TEXT, hg INTEGER, ag INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_nat_date ON nat_matches(date);
  CREATE TABLE IF NOT EXISTS nat_sync (key TEXT PRIMARY KEY, done_at TEXT NOT NULL, n INTEGER);
`);

/* ------------------------------------------------------------------ */
/* Data                                                                 */
/* ------------------------------------------------------------------ */

async function syncLeagueSeason(leagueId: number, season: number) {
  const j = await afGet('/fixtures', { league: leagueId, season });
  const ins = db.prepare(`INSERT OR REPLACE INTO nat_matches (fixture_id, league_id, date, home_id, away_id, home_name, away_name, hg, ag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let n = 0;
  db.exec('BEGIN');
  try {
    for (const f of j.response || []) {
      if (!['FT', 'AET', 'PEN'].includes(f.fixture?.status?.short)) continue;
      const h = f.teams?.home, a = f.teams?.away;
      if (!h?.id || !a?.id || YOUTH.test(h.name || '') || YOUTH.test(a.name || '')) continue;
      // score after 90/120 minutes (penalty shoot-outs count as a draw)
      const hg = f.score?.extratime?.home ?? f.score?.fulltime?.home ?? f.goals?.home;
      const ag = f.score?.extratime?.away ?? f.score?.fulltime?.away ?? f.goals?.away;
      if (hg === null || hg === undefined || ag === null || ag === undefined) continue;
      ins.run(f.fixture.id, leagueId, String(f.fixture.date).slice(0, 10), h.id, a.id, h.name, a.name, hg, ag);
      n++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  db.prepare(`INSERT OR REPLACE INTO nat_sync (key, done_at, n) VALUES (?, ?, ?)`).run(`${leagueId}|${season}`, new Date().toISOString(), n);
  return n;
}

/** Past seasons once, the current and previous year every 12 h. */
export async function syncNationalHistory(force = false) {
  if (!afConfigured()) return { requests: 0, matches: 0 };
  const year = new Date().getUTCFullYear();
  let requests = 0, matches = 0;
  for (const id of Object.keys(COMPS).map(Number)) {
    for (let s = FIRST_SEASON; s <= year; s++) {
      const key = `${id}|${s}`;
      const row: any = db.prepare(`SELECT done_at FROM nat_sync WHERE key = ?`).get(key);
      const recent = s >= year - 1;
      if (!force && row && (!recent || Date.now() - new Date(row.done_at).getTime() < 12 * 3600 * 1000)) continue;
      try {
        matches += await syncLeagueSeason(id, s);
        requests++;
      } catch (e: any) {
        logger.warn(`national history ${key}: ${e.message}`);
      }
    }
  }
  return { requests, matches };
}

/* ------------------------------------------------------------------ */
/* Ratings + fit                                                        */
/* ------------------------------------------------------------------ */

const ratings = new Map<number, { elo: number; name: string; n: number; last: string }>();
let fit = { c: 60, s: 110, beta: 0 }; // ordered-logit parameters (Elo points); beta = Elo points per unit of ln(squad value ratio)
let lastBuilt: string | null = null;
let evalStats: any = null;

const sig = (x: number) => 1 / (1 + Math.exp(-x));
function probs(d: number, c = fit.c, s = fit.s) {
  const h = sig((d - c) / s), a = sig((-d - c) / s);
  const dr = Math.max(0.03, 1 - h - a);
  const t = h + a + dr;
  return { h: h / t, d: dr / t, a: a / t };
}
function gdMult(gd: number) {
  const g = Math.abs(gd);
  return g <= 1 ? 1 : g === 2 ? 1.5 : (11 + g) / 8;
}

export function buildNationalElo() {
  const rows = db.prepare(`SELECT * FROM nat_matches ORDER BY date, fixture_id`).all() as any[];
  ratings.clear();
  const pre: { d: number; lv: number; o: 'H' | 'D' | 'A'; date: string }[] = [];
  const valueCache = new Map<number, number | null>();
  const valueOf = (id: number, name: string) => {
    if (!valueCache.has(id)) valueCache.set(id, nationalValueFor(name));
    return valueCache.get(id)!;
  };
  const get = (id: number, name: string) => ratings.get(id) || ratings.set(id, { elo: 1500, name, n: 0, last: '' }).get(id)!;
  for (const r of rows) {
    const cfg = COMPS[r.league_id] || COMPS[10];
    const H = get(r.home_id, r.home_name), A = get(r.away_id, r.away_name);
    const d = H.elo - A.elo + cfg.ha;
    const o = r.hg > r.ag ? 'H' : r.hg < r.ag ? 'A' : 'D';
    if (H.n >= 10 && A.n >= 10) {
      const vh = valueOf(r.home_id, r.home_name), va = valueOf(r.away_id, r.away_name);
      pre.push({ d, lv: vh && va ? Math.log(vh / va) : 0, o, date: r.date });
    }
    const we = 1 / (1 + Math.pow(10, -d / 400));
    const w = o === 'H' ? 1 : o === 'D' ? 0.5 : 0;
    const delta = cfg.k * gdMult(r.hg - r.ag) * (w - we);
    H.elo += delta; A.elo -= delta;
    H.n++; A.n++; H.last = r.date; A.last = r.date;
  }
  // fit c, s (and beta for the squad-value term) on matches from 2018; evaluate on the last 2 years
  const train = pre.filter(x => x.date >= '2018-01-01');
  const llOf = (xs: typeof pre, c: number, s: number, beta: number) => {
    let ll = 0;
    for (const x of xs) { const p = probs(x.d + beta * x.lv, c, s); ll -= Math.log(Math.max(1e-6, x.o === 'H' ? p.h : x.o === 'D' ? p.d : p.a)); }
    return ll;
  };
  const fitGrid = (betas: number[]) => {
    let best = { ll: Infinity, c: 60, s: 110, beta: 0 };
    for (const beta of betas)
      for (let c = 0; c <= 300; c += 10)
        for (let s = 60; s <= 400; s += 10) {
          const ll = llOf(train, c, s, beta);
          if (ll < best.ll) best = { ll, c, s, beta };
        }
    return best;
  };
  const base = fitGrid([0]);
  const withValue = fitGrid([0, 25, 50, 75, 100, 125, 150, 175, 200, 250, 300, 350]);
  fit = { c: withValue.c, s: withValue.s, beta: withValue.beta };
  const test = pre.filter(x => x.date >= new Date(Date.now() - 2 * 365 * 86400000).toISOString().slice(0, 10));
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const score = (c: number, s: number, beta: number) => {
    let brier = 0, ll = 0, hits = 0;
    for (const x of test) {
      const p = probs(x.d + beta * x.lv, c, s);
      brier += (p.h - (x.o === 'H' ? 1 : 0)) ** 2 + (p.d - (x.o === 'D' ? 1 : 0)) ** 2 + (p.a - (x.o === 'A' ? 1 : 0)) ** 2;
      ll -= Math.log(Math.max(1e-6, x.o === 'H' ? p.h : x.o === 'D' ? p.d : p.a));
      const pick = p.h >= p.d && p.h >= p.a ? 'H' : p.a >= p.d ? 'A' : 'D';
      if (pick === x.o) hits++;
    }
    return { brier: r3(brier / test.length), logLoss: r3(ll / test.length), hitRate: Math.round((hits / test.length) * 1000) / 10 };
  };
  evalStats = test.length
    ? {
        matches: test.length,
        eloOnly: score(base.c, base.s, 0),
        eloPlusSquadValue: score(withValue.c, withValue.s, withValue.beta),
        withValues: test.filter(x => x.lv !== 0).length,
        note: 'parameters fitted on 2018+, scored on the last 2 years; squad values are a July 2026 snapshot (mild look-ahead on older matches)'
      }
    : null;
  lastBuilt = new Date().toISOString();
  logger.info(`National Elo: ${rows.length} matches, ${ratings.size} teams, fit c=${fit.c} s=${fit.s}`);
  return { matches: rows.length, teams: ratings.size };
}

/* ------------------------------------------------------------------ */
/* Prediction                                                           */
/* ------------------------------------------------------------------ */

function poisson(l: number, k: number) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; }

/** Prediction for an API-Football-backed match object (team ids are offset). */
export function predictNational(match: any, leagueId: number): Prediction | null {
  const hid = (match.homeTeam?.id || 0) - AF_OFFSET, aid = (match.awayTeam?.id || 0) - AF_OFFSET;
  const H = ratings.get(hid), A = ratings.get(aid);
  if (!H || !A || H.n < 5 || A.n < 5) return null;
  const cfg = COMPS[leagueId] || COMPS[10];
  const vh = nationalValueFor(H.name), va = nationalValueFor(A.name);
  const valueTerm = vh && va ? fit.beta * Math.log(vh / va) : 0;
  const d = H.elo - A.elo + cfg.ha + valueTerm;
  const p = probs(d);
  // goals: league-average international game, tilted by the rating gap
  const lamH = Math.max(0.2, 1.3 * Math.exp(d / 650)), lamA = Math.max(0.2, 1.3 * Math.exp(-d / 650));
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
  const n = Math.min(H.n, A.n);
  return {
    model: MODEL_ELO,
    home: pct(p.h), draw: pct(p.d), away: pct(p.a),
    expectedGoals: { home: Math.round(lamH * 100) / 100, away: Math.round(lamA * 100) / 100 },
    over25: pct(over25), btts: pct(btts),
    topScores: scores.slice(0, 3).map(s => ({ ...s, prob: pct(s.prob) })),
    confidence: n >= 30 ? 'high' : n >= 15 ? 'medium' : 'low',
    factors: {
      homeAttack: Math.round(H.elo), homeDefence: 0, awayAttack: Math.round(A.elo), awayDefence: 0,
      homeAdvantage: cfg.ha, homeForm: Math.round(valueTerm), awayForm: 1, gamesPlayed: { home: H.n, away: A.n }, leagueAvgGoals: 1.3
    }
  };
}

export function nationalEloStatus() {
  const top = [...ratings.entries()]
    .filter(([, r]) => r.n >= 15 && r.last >= new Date(Date.now() - 3 * 365 * 86400000).toISOString().slice(0, 10))
    .sort((a, b) => b[1].elo - a[1].elo)
    .slice(0, 30)
    .map(([, r], i) => ({ rank: i + 1, team: r.name, elo: Math.round(r.elo), matches: r.n, squadValueM: Math.round((nationalValueFor(r.name) || 0) / 1e6) }));
  const n: any = db.prepare(`SELECT COUNT(*) AS n, MIN(date) AS first, MAX(date) AS last FROM nat_matches`).get();
  // Active teams without a squad value (name mismatch, or fewer than 11 valued players)
  const since = new Date(Date.now() - 3 * 365 * 86400000).toISOString().slice(0, 10);
  const active = [...ratings.values()].filter(r => r.n >= 15 && r.last >= since);
  const noValue = active.filter(r => !nationalValueFor(r.name)).sort((a, b) => b.elo - a.elo).map(r => `${r.name} (${Math.round(r.elo)})`);
  return { model: MODEL_ELO, lastBuilt, matches: n, teams: ratings.size, activeTeams: active.length, withValue: active.length - noValue.length, noValue, fit, evaluation: evalStats, top };
}

export function startNationalEloScheduler() {
  if (!afConfigured()) return;
  try { buildNationalElo(); } catch { /* empty table on first boot */ }
  const run = () => syncNationalHistory().then(r => { if (r.requests) buildNationalElo(); }).catch(() => undefined);
  setTimeout(run, 3 * 60 * 1000);
  setInterval(run, 12 * 3600 * 1000);
}
