/**
 * Basketball model "bb-v1" (Oct 2026): team ratings from every game, points per game, updated game by game.
 *
 *  - Each team has an attack rating (points scored above the league average) and a defence rating (points allowed
 *    above average). Expected score = league average ± half the home-court edge + own attack + opponent's defence.
 *  - After each game both ratings move toward what happened (learning rate k). Between seasons ratings shrink
 *    toward average (r), because rosters change.
 *  - A team playing on the second night of a back-to-back loses `b2b` points.
 *  - Win % = normal curve of the expected margin over the league's typical miss (sigma), learned as it goes.
 *  - k, r and b2b are chosen per league on one season (tuning season) and then tested on the later seasons,
 *    which the choice never saw (bbBacktest). Only games before kick-off are used for every prediction.
 */
import logger from '../utils/logger';
import { db } from '../db';

export const BB_MODEL = 'bb-v2';
const FINISHED = ['FT', 'AOT'];

type Game = {
  game_id: number; code: string; season: string; kickoff: string; status: string | null;
  home_id: number; away_id: number; hs: number | null; as_: number | null; week: string | null;
};
type Params = { k: number; r: number; b2b: number };
type Team = { o: number; d: number; season: string; games: number; last: number };
type Pred = { pHome: number; margin: number; total: number; home: number; away: number; hca: number; b2bHome: boolean; b2bAway: boolean; restHome: number | null; restAway: number | null };

/** NBA games before 19 October are pre-season (they count less and are left out of the record). */
export const isPreseason = (g: { code: string; kickoff: string }) => {
  if (g.code !== 'NBA') return false;
  const d = new Date(g.kickoff);
  return d.getUTCMonth() === 9 && d.getUTCDate() < 19;
};

const normCdf = (x: number) => {
  // Abramowitz–Stegun
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const p = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const c = 1 - 0.3989422804014327 * Math.exp(-x * x / 2) * p;
  return x >= 0 ? c : 1 - c;
};

class League {
  teams = new Map<number, Team>();
  mu = 0;       // average points per team per game
  hca = 3;      // home-court edge (points)
  sigma = 12;   // typical miss on the margin
  sigmaT = 17;  // typical miss on the total
  n = 0;
  lastPlayed = new Map<number, number>(); // team → kickoff ms of its previous game (any status, by date)
  constructor(public p: Params) {}

  team(id: number, season: string): Team {
    let t = this.teams.get(id);
    if (!t) {
      t = { o: 0, d: 0, season, games: 0, last: 0 };
      this.teams.set(id, t);
    } else if (t.season !== season) {
      t.o *= this.p.r;
      t.d *= this.p.r;
      t.season = season;
    }
    return t;
  }

  predict(g: Game): Pred {
    const h = this.team(g.home_id, g.season), a = this.team(g.away_id, g.season);
    const ko = new Date(g.kickoff).getTime();
    const restOf = (id: number) => {
      const prev = this.lastPlayed.get(id);
      return prev ? (ko - prev) / 86400000 : null;
    };
    const restHome = restOf(g.home_id), restAway = restOf(g.away_id);
    const b2bHome = restHome !== null && restHome < 1.4, b2bAway = restAway !== null && restAway < 1.4;
    const home = this.mu + this.hca / 2 + h.o + a.d - (b2bHome ? this.p.b2b / 2 : 0) + (b2bAway ? this.p.b2b / 2 : 0);
    const away = this.mu - this.hca / 2 + a.o + h.d - (b2bAway ? this.p.b2b / 2 : 0) + (b2bHome ? this.p.b2b / 2 : 0);
    const margin = home - away;
    return {
      pHome: Math.min(0.995, Math.max(0.005, normCdf(margin / this.sigma))),
      margin, total: home + away, home, away, hca: this.hca, b2bHome, b2bAway,
      restHome: restHome === null ? null : Math.round(restHome * 10) / 10,
      restAway: restAway === null ? null : Math.round(restAway * 10) / 10
    };
  }

  update(g: Game, pr: Pred) {
    const w = isPreseason(g) ? 0.3 : 1;
    const hs = g.hs!, as = g.as_!;
    const h = this.team(g.home_id, g.season), a = this.team(g.away_id, g.season);
    const eh = hs - pr.home, ea = as - pr.away;
    const k = this.p.k * w * (this.n < 100 ? 2 : 1);
    h.o += k * eh; a.d += k * eh;
    a.o += k * ea; h.d += k * ea;
    h.games++; a.games++;
    // league-wide numbers learn slowly
    const alpha = this.n < 100 ? 0.05 : 0.01;
    if (!this.n) this.mu = (hs + as) / 2;
    else this.mu += alpha * w * ((hs + as) / 2 - this.mu);
    this.hca += alpha * w * 0.5 * (hs - as - pr.margin);
    const em = hs - as - pr.margin, et = hs + as - pr.total;
    this.sigma = Math.sqrt(Math.max(36, this.sigma ** 2 + alpha * w * (em * em - this.sigma ** 2)));
    this.sigmaT = Math.sqrt(Math.max(64, this.sigmaT ** 2 + alpha * w * (et * et - this.sigmaT ** 2)));
    this.n++;
  }

  /** Mark that a team played (finished or not — rest counts from the schedule). */
  played(g: Game) {
    const t = new Date(g.kickoff).getTime();
    this.lastPlayed.set(g.home_id, t);
    this.lastPlayed.set(g.away_id, t);
  }
}

/* ------------------------------------------------------------------ */
/* bb-v2 (Oct 2026): ratings per 100 possessions + pace, from box scores */
/* ------------------------------------------------------------------ */
// Backtest (browser research, 7 Oct 2026, seasons 2024-25 + 2025-26 never seen when the settings were chosen):
//   log loss v1 → v2: NBA 0.607 → 0.603, ACB 0.587 → 0.586, Serie A 0.602 → 0.599, EuroLeague 0.627 → 0.629 (blend wins there)
type P2 = { k: number; kp: number; r: number; rp: number; rh: number; b2b: number; clip: number; early: number; kh: number };
const P2_DEFAULT: P2 = { k: 0.05, kp: 0.05, r: 0.9, rp: 0.7, rh: 0.8, b2b: 1.5, clip: 40, early: 1.5, kh: 0.01 };
const P2_LEAGUE: Record<string, Partial<P2>> = { NBA: { b2b: 3 } };
type T2 = { o: number; d: number; p: number; h: number; season: string; n: number };

class LeagueV2 {
  teams = new Map<number, T2>();
  ppp = 105; pace = 90; hca = 3; sigma = 12; sigmaT = 17; n = 0; first = true;
  constructor(public p: P2) {}
  team(id: number, season: string): T2 {
    let t = this.teams.get(id);
    if (!t) { t = { o: 0, d: 0, p: 0, h: 0, season, n: 0 }; this.teams.set(id, t); }
    else if (t.season !== season) { t.o *= this.p.r; t.d *= this.p.r; t.p *= this.p.rp; t.h *= this.p.rh; t.season = season; t.n = 0; }
    return t;
  }
  predict(g: Game, restH: number | null, restA: number | null) {
    const H = this.team(g.home_id, g.season), A = this.team(g.away_id, g.season);
    const hca = this.hca + H.h;
    const b2bHome = restH !== null && restH < 1.4, b2bAway = restA !== null && restA < 1.4;
    const fh = b2bHome ? this.p.b2b : 0, fa = b2bAway ? this.p.b2b : 0;
    const pace = Math.max(55, this.pace + H.p + A.p);
    const per = 100 / this.pace;
    const ph = (this.ppp + H.o + A.d + (hca / 2) * per - fh * per) / 100;
    const pa = (this.ppp + A.o + H.d - (hca / 2) * per - fa * per) / 100;
    const home = pace * ph, away = pace * pa, margin = home - away;
    return {
      pHome: Math.min(0.995, Math.max(0.005, normCdf(margin / this.sigma))), margin, total: home + away, home, away, hca, b2bHome, b2bAway,
      restHome: restH === null ? null : Math.round(restH * 10) / 10, restAway: restA === null ? null : Math.round(restA * 10) / 10,
      _ph: ph, _pa: pa, _pace: pace
    };
  }
  update(g: Game, pr: ReturnType<LeagueV2['predict']>, poss: number | null) {
    const w = isPreseason(g) ? 0.3 : 1;
    if (this.first && poss) { this.pace = poss; this.ppp = (100 * (g.hs! + g.as_!)) / 2 / poss; this.first = false; }
    const H = this.team(g.home_id, g.season), A = this.team(g.away_id, g.season);
    const pz = poss || pr._pace;
    const clip = (x: number) => Math.max(-this.p.clip, Math.min(this.p.clip, x));
    const ah = (100 * g.hs!) / pz, aa = (100 * g.as_!) / pz;
    const eH = clip(ah - pr._ph * 100), eA = clip(aa - pr._pa * 100);
    const k = this.p.k * w * (H.n < 10 || A.n < 10 ? this.p.early : 1);
    H.o += k * eH; A.d += k * eH; A.o += k * eA; H.d += k * eA;
    const al = this.n < 150 ? 0.04 : 0.008;
    if (poss) { const ep = poss - pr._pace; H.p += (this.p.kp * w * ep) / 2; A.p += (this.p.kp * w * ep) / 2; this.pace += al * w * ep; }
    const res = g.hs! - g.as_! - pr.margin;
    H.h += this.p.kh * w * res;
    H.n++; A.n++;
    this.ppp += al * w * ((ah + aa) / 2 - this.ppp);
    this.hca += al * w * 0.5 * res;
    this.sigma = Math.sqrt(Math.max(36, this.sigma ** 2 + al * w * (res * res - this.sigma ** 2)));
    const et = g.hs! + g.as_! - pr.total;
    this.sigmaT = Math.sqrt(Math.max(64, this.sigmaT ** 2 + al * w * (et * et - this.sigmaT ** 2)));
    this.n++;
  }
}

/** Possessions of each finished game with a box score (both teams' estimate averaged). */
function possessionsOf(code: string): Map<number, number> {
  const rows = db.prepare(`SELECT t.game_id, t.fgm, t.fga, t.oreb, t.tov, t.fta FROM bb_team_stats t JOIN bb_games g ON g.game_id = t.game_id WHERE g.code = ? AND t.fga > 0`).all(code) as any[];
  const by = new Map<number, number[]>();
  for (const r of rows) {
    const oreb = r.oreb != null ? r.oreb : 0.27 * (r.fga - (r.fgm || 0));
    const est = r.fga - oreb + (r.tov || 0) + 0.44 * (r.fta || 0);
    if (!by.has(r.game_id)) by.set(r.game_id, []);
    by.get(r.game_id)!.push(est);
  }
  const out = new Map<number, number>();
  for (const [id, v] of by) if (v.length === 2) out.set(id, (v[0] + v[1]) / 2);
  return out;
}

function runV2(games: Game[], p: P2, poss: Map<number, number>, onPred?: (g: Game, pr: ReturnType<LeagueV2['predict']>) => void) {
  const L = new LeagueV2(p);
  const last = new Map<number, number>();
  for (const g of games) {
    if (!done(g)) continue;
    const t = new Date(g.kickoff).getTime();
    const rh = last.has(g.home_id) ? (t - last.get(g.home_id)!) / 86400000 : null;
    const ra = last.has(g.away_id) ? (t - last.get(g.away_id)!) / 86400000 : null;
    const pr = L.predict(g, rh, ra);
    onPred?.(g, pr);
    L.update(g, pr, poss.get(g.game_id) ?? null);
    last.set(g.home_id, t); last.set(g.away_id, t);
  }
  return L;
}

function gamesOf(code: string): Game[] {
  return db.prepare(`SELECT game_id, code, season, kickoff, status, home_id, away_id, hs, as_, stage AS week FROM bb_games WHERE code = ? ORDER BY kickoff, game_id`).all(code) as Game[];
}
const done = (g: Game) => FINISHED.includes(g.status || '') && g.hs !== null && g.as_ !== null;

type Metrics = { n: number; hits: number; logLoss: number; brier: number; maeMargin: number; maeTotal: number; homeHits: number };
const emptyM = (): Metrics => ({ n: 0, hits: 0, logLoss: 0, brier: 0, maeMargin: 0, maeTotal: 0, homeHits: 0 });
function addM(m: Metrics, pr: Pred, g: Game) {
  const y = g.hs! > g.as_! ? 1 : 0;
  const p = pr.pHome;
  m.n++;
  m.hits += (p >= 0.5 ? 1 : 0) === y ? 1 : 0;
  m.homeHits += y;
  m.logLoss += -(y ? Math.log(p) : Math.log(1 - p));
  m.brier += (p - y) ** 2;
  m.maeMargin += Math.abs(g.hs! - g.as_! - pr.margin);
  m.maeTotal += Math.abs(g.hs! + g.as_! - pr.total);
}
const fin = (m: Metrics) => m.n ? {
  games: m.n, hitRate: Math.round((m.hits / m.n) * 1000) / 10, homeWinRate: Math.round((m.homeHits / m.n) * 1000) / 10,
  logLoss: Math.round((m.logLoss / m.n) * 10000) / 10000, brier: Math.round((m.brier / m.n) * 10000) / 10000,
  maeMargin: Math.round((m.maeMargin / m.n) * 10) / 10, maeTotal: Math.round((m.maeTotal / m.n) * 10) / 10
} : { games: 0 };

/** Run the model through a league's games in order. `onPred` sees every finished game's pre-game prediction. */
function run(games: Game[], p: Params, onPred?: (g: Game, pr: Pred) => void) {
  const L = new League(p);
  for (const g of games) {
    if (!done(g)) continue;
    const pr = L.predict(g);
    onPred?.(g, pr);
    L.update(g, pr);
    L.played(g);
  }
  return L;
}

const GRID: Params[] = [];
for (const k of [0.03, 0.05, 0.07, 0.09, 0.12]) for (const r of [0.5, 0.65, 0.8, 0.9]) for (const b2b of [0, 1.5, 3]) GRID.push({ k, r, b2b });

type LeagueModel = { code: string; params: Params; L: League; L2: LeagueV2 | null; w2: number; tuneSeason: string | null; testSeasons: string[]; test: any; tune: any; compare?: any; builtAt: string };
const models = new Map<string, LeagueModel>();

/** Choose k, r, b2b on the tuning season; test on the seasons after it; keep the final ratings for predictions. */
export function buildLeague(code: string): LeagueModel | null {
  const games = gamesOf(code);
  const seasons = [...new Set(games.filter(done).map(g => g.season))].sort();
  if (seasons.length < 2) return null;
  // tuning season: the third-last finished season (the first is warm-up); test: every season after it
  const tuneSeason = seasons.length >= 4 ? seasons[seasons.length - 4] : seasons[0];
  const testSeasons = seasons.filter(s => s > tuneSeason);
  let best: { p: Params; ll: number } | null = null;
  for (const p of GRID) {
    const m = emptyM();
    run(games, p, (g, pr) => { if (g.season === tuneSeason && !isPreseason(g)) addM(m, pr, g); });
    const ll = m.n ? m.logLoss / m.n : Infinity;
    if (!best || ll < best.ll) best = { p, ll };
  }
  const params = best!.p;
  // v1 and v2 predictions of every finished game, then the blend weight of v2 chosen on the tuning season
  const p1 = new Map<number, Pred>(), p2 = new Map<number, Pred>();
  const L = run(games, params, (g, pr) => { p1.set(g.game_id, pr); });
  const poss = possessionsOf(code);
  const P2v: P2 = { ...P2_DEFAULT, ...(P2_LEAGUE[code] || {}) };
  const L2 = poss.size >= 200 ? runV2(games, P2v, poss, (g, pr) => { p2.set(g.game_id, pr); }) : null;
  const blend = (a: Pred, b: Pred | undefined, w: number): Pred => !b || !w ? a : {
    ...b, pHome: w * b.pHome + (1 - w) * a.pHome, margin: w * b.margin + (1 - w) * a.margin, total: w * b.total + (1 - w) * a.total,
    home: w * b.home + (1 - w) * a.home, away: w * b.away + (1 - w) * a.away
  };
  const fin2 = done;
  const tuneGames = games.filter(g => fin2(g) && g.season === tuneSeason && !isPreseason(g));
  let w2 = 0;
  if (L2) {
    let bestLL = Infinity;
    for (const w of [0, 0.5, 1]) {
      const m = emptyM();
      for (const g of tuneGames) addM(m, blend(p1.get(g.game_id)!, p2.get(g.game_id), w), g);
      const ll = m.n ? m.logLoss / m.n : Infinity;
      if (ll < bestLL - 1e-4) { bestLL = ll; w2 = w; }
    }
  }
  const tune = emptyM(), test = emptyM(), t1 = emptyM(), t2 = emptyM();
  const bySeason = new Map<string, Metrics>();
  for (const g of games) {
    if (!fin2(g) || isPreseason(g) || !p1.has(g.game_id)) continue;
    const pr = blend(p1.get(g.game_id)!, p2.get(g.game_id), w2);
    if (g.season === tuneSeason) addM(tune, pr, g);
    if (testSeasons.includes(g.season)) {
      addM(test, pr, g);
      addM(t1, p1.get(g.game_id)!, g);
      if (p2.has(g.game_id)) addM(t2, p2.get(g.game_id)!, g);
      if (!bySeason.has(g.season)) bySeason.set(g.season, emptyM());
      addM(bySeason.get(g.season)!, pr, g);
    }
  }
  const model: LeagueModel = {
    code, params, L, L2, w2, tuneSeason, testSeasons,
    tune: fin(tune), test: { all: fin(test), bySeason: Object.fromEntries([...bySeason.entries()].map(([s, m]) => [s, fin(m)])) },
    compare: { v1: fin(t1), v2: fin(t2), v2Weight: w2 },
    builtAt: new Date().toISOString()
  };
  models.set(code, model);
  return model;
}

export function buildAll(codes: string[]) {
  for (const c of codes) {
    try {
      const m = buildLeague(c);
      if (m) logger.info(`${BB_MODEL} ${c}: k=${m.params.k} r=${m.params.r} b2b=${m.params.b2b}, test hit ${(m.test.all as any).hitRate}% over ${(m.test.all as any).games} games`);
    } catch (e: any) {
      logger.warn(`${BB_MODEL} ${c}: ${e.message}`);
    }
  }
}

/** Prediction for an upcoming (or live) game from the latest ratings; rest from the schedule before it. */
export function predictGame(g: Game): Pred | null {
  const m = models.get(g.code);
  if (!m) return null;
  const L = m.L;
  // rest: the team's previous game on the schedule (it may not be in the finished list yet)
  const prev = (id: number) => {
    const r: any = db.prepare(`SELECT MAX(kickoff) AS k FROM bb_games WHERE (home_id = ? OR away_id = ?) AND kickoff < ? AND game_id != ?`)
      .get(id, id, new Date(new Date(g.kickoff).getTime() - 3 * 3600 * 1000).toISOString(), g.game_id);
    return r?.k ? new Date(r.k).getTime() : undefined;
  };
  const saved = new Map(L.lastPlayed);
  const ph = prev(g.home_id), pa = prev(g.away_id);
  if (ph) L.lastPlayed.set(g.home_id, ph); else L.lastPlayed.delete(g.home_id);
  if (pa) L.lastPlayed.set(g.away_id, pa); else L.lastPlayed.delete(g.away_id);
  // predicting must not change the stored ratings (a new season shrinks them only for this prediction)
  const keep = [g.home_id, g.away_id].map(id => [id, L.teams.get(id) ? { ...L.teams.get(id)! } : null] as const);
  const pr = L.predict(g);
  for (const [id, t] of keep) { if (t) L.teams.set(id, t); else L.teams.delete(id); }
  L.lastPlayed = saved;
  if (!m.L2 || !m.w2) return pr;
  // bb-v2: possession ratings, blended with v1 by the weight chosen on the tuning season
  const ko = new Date(g.kickoff).getTime();
  const keep2 = [g.home_id, g.away_id].map(id => [id, m.L2!.teams.get(id) ? { ...m.L2!.teams.get(id)! } : null] as const);
  const p2 = m.L2.predict(g, ph ? (ko - ph) / 86400000 : null, pa ? (ko - pa) / 86400000 : null);
  for (const [id, t] of keep2) { if (t) m.L2.teams.set(id, t); else m.L2.teams.delete(id); }
  const w = m.w2;
  return {
    ...pr, pHome: w * p2.pHome + (1 - w) * pr.pHome, margin: w * p2.margin + (1 - w) * pr.margin, total: w * p2.total + (1 - w) * pr.total,
    home: w * p2.home + (1 - w) * pr.home, away: w * p2.away + (1 - w) * pr.away, hca: w * p2.hca + (1 - w) * pr.hca
  };
}

/** Every team's ratings in a league (this season's teams), ranked: attack 1 = scores most, defence 1 = allows least. */
export function leagueRatings(code: string) {
  const m = models.get(code);
  if (!m) return [];
  const latest = [...m.L.teams.values()].reduce((a, t) => (t.season > a ? t.season : a), '');
  const list = [...m.L.teams.entries()].filter(([, t]) => t.season === latest && t.games > 0)
    .map(([id, t]) => ({ id, attack: t.o, defence: -t.d, net: t.o - t.d }));
  const rank = (key: 'attack' | 'defence' | 'net') => new Map([...list].sort((a, b) => b[key] - a[key]).map((x, i) => [x.id, i + 1]));
  const ra = rank('attack'), rd = rank('defence'), rn = rank('net');
  return list.map(x => ({ ...x, attackRank: ra.get(x.id)!, defenceRank: rd.get(x.id)!, netRank: rn.get(x.id)!, of: list.length }));
}

export function teamRating(code: string, teamId: number) {
  const t = models.get(code)?.L.teams.get(teamId);
  return t ? { attack: Math.round(t.o * 10) / 10, defence: Math.round(-t.d * 10) / 10, net: Math.round((t.o - t.d) * 10) / 10, games: t.games } : null;
}

/** Admin: how each league's model did on seasons it never saw. */
export function bbBacktest() {
  return [...models.values()].map(m => ({
    code: m.code, params: m.params, tuneSeason: m.tuneSeason, testSeasons: m.testSeasons, tune: m.tune, test: m.test, compare: m.compare,
    now: { avgPoints: Math.round(m.L.mu * 10) / 10, homeEdge: Math.round(m.L.hca * 10) / 10, sigma: Math.round(m.L.sigma * 10) / 10, sigmaTotal: Math.round(m.L.sigmaT * 10) / 10 },
    builtAt: m.builtAt
  }));
}

/* ------------------------------------------------------------------ */
/* Saved predictions (the public record)                                */
/* ------------------------------------------------------------------ */

db.exec(`
  CREATE TABLE IF NOT EXISTS bb_predictions (
    game_id INTEGER PRIMARY KEY, code TEXT NOT NULL, kickoff TEXT NOT NULL, model TEXT NOT NULL,
    p_home REAL NOT NULL, margin REAL NOT NULL, total REAL NOT NULL, home_pts REAL NOT NULL, away_pts REAL NOT NULL,
    made_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_bb_pred_kickoff ON bb_predictions(kickoff);
`);

/** Save / refresh predictions for games in the next 7 days. A game's prediction is frozen at tip-off. */
export function recordBbPredictions() {
  const now = new Date();
  const rows = db.prepare(`SELECT game_id, code, season, kickoff, status, home_id, away_id, hs, as_, stage AS week FROM bb_games
    WHERE kickoff > ? AND kickoff < ? AND (status IS NULL OR status = 'NS')`).all(now.toISOString(), new Date(now.getTime() + 7 * 86400000).toISOString()) as Game[];
  const up = db.prepare(`INSERT OR REPLACE INTO bb_predictions (game_id, code, kickoff, model, p_home, margin, total, home_pts, away_pts, made_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let n = 0;
  db.exec('BEGIN');
  try {
    for (const g of rows) {
      const pr = predictGame(g);
      if (!pr) continue;
      up.run(g.game_id, g.code, g.kickoff, BB_MODEL, pr.pHome, pr.margin, pr.total, pr.home, pr.away, now.toISOString());
      n++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return n;
}

/** The public record: every saved prediction of a finished game (pre-season left out). */
export function bbRecord(days = 3650, code?: string) {
  const rows = db.prepare(`
    SELECT p.*, g.hs, g.as_, g.home_name, g.away_name, g.home_logo, g.away_logo, g.status
    FROM bb_predictions p JOIN bb_games g ON g.game_id = p.game_id
    WHERE g.status IN ('FT','AOT') AND g.hs IS NOT NULL AND p.made_at <= p.kickoff AND p.kickoff >= ? ${code ? 'AND p.code = ?' : ''}
    ORDER BY p.kickoff DESC`).all(...[new Date(Date.now() - days * 86400000).toISOString(), ...(code ? [code] : [])]) as any[];
  const list = rows.filter(r => !isPreseason({ code: r.code, kickoff: r.kickoff }));
  const by = new Map<string, { n: number; hits: number; strongN: number; strongHits: number }>();
  const tot = { n: 0, hits: 0, strongN: 0, strongHits: 0 };
  for (const r of list) {
    const hit = (r.p_home >= 0.5) === (r.hs > r.as_);
    const strong = Math.max(r.p_home, 1 - r.p_home) >= 0.7;
    for (const b of [tot, by.get(r.code) || (by.set(r.code, { n: 0, hits: 0, strongN: 0, strongHits: 0 }), by.get(r.code)!)]) {
      b.n++; if (hit) b.hits++;
      if (strong) { b.strongN++; if (hit) b.strongHits++; }
    }
  }
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
  return {
    since: list.length ? list[list.length - 1].kickoff : null,
    total: { ...tot, hitRate: pct(tot.hits, tot.n), strongHitRate: pct(tot.strongHits, tot.strongN) },
    leagues: [...by.entries()].map(([c, b]) => ({ code: c, ...b, hitRate: pct(b.hits, b.n), strongHitRate: pct(b.strongHits, b.strongN) })),
    recent: list.slice(0, 50).map(r => ({
      gameId: r.game_id, code: r.code, kickoff: r.kickoff, home: r.home_name, away: r.away_name, homeLogo: r.home_logo, awayLogo: r.away_logo,
      score: [r.hs, r.as_], pick: r.p_home >= 0.5 ? 'H' : 'A', pHome: r.p_home, hit: (r.p_home >= 0.5) === (r.hs > r.as_)
    }))
  };
}
