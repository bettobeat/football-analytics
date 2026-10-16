/**
 * nfl-v1 (fix139, Oct 2026) — the NFL model. Built and tested on our own tables (services/nfl.ts): nfl_games,
 * nfl_team_stats, nfl_player_stats, nfl_injuries. No odds anywhere.
 *
 *  A. Elo (538 style): start 1500, K tuned, margin-of-victory multiplier ln(|m|+1) × 2.2 / (0.001 × winner Elo gap + 2.2),
 *     1/3 back to 1500 between seasons, home field tuned (separately before and from 2020), rest: bye week + / short week −
 *     (both tuned), neutral sites (international games, Super Bowl) = no home field.
 *  B. QB: the starter of a game = the passer with the most attempts. QB value = his rolling ANY/A
 *     ((pass yds + 20·TD − 45·INT − sack yds) / (att + sacks)), shrunk to the league mean (200 attempts). When this game's
 *     starter is not the team's usual starter, the team's Elo moves by (value gap × weight, tuned). Upcoming games: the usual
 *     starter unless the injury report has him Out / Doubtful / on IR — then the team's next QB by attempts.
 *  C. Efficiency (games with box scores): exp-weighted yards per play for / against, turnover margin, third-down %,
 *     red-zone %, sacks.
 *  D. Logistic blend of [A+B Elo gap, efficiency gaps]. Used only when it beats A+B on the walk-forward test log loss.
 * Outputs: pHome (ties ≈ 0), expected margin (Elo gap / 25), expected total (points-for / points-against ratings).
 *
 * Test (never on fitting data): each of the last 5 seasons is predicted game by game with settings tuned on the seasons
 * before it only. GET /api/admin/nfl-model has the report; one log line per season.
 * Live: settings re-tuned every Tuesday on every finished season; ratings replayed after each finished game; predictions
 * of the next 9 days saved in nfl_predictions until kick-off (then frozen).
 */
import { db } from '../db';
import logger from '../utils/logger';
import { yieldLoop } from './perf';
import { teamBox, NflGame } from './nflSite';

export const NFL_MODEL = 'nfl-v1';
const DAY = 86400000;

db.exec(`
  CREATE TABLE IF NOT EXISTS nfl_predictions (
    game_id INTEGER PRIMARY KEY, season INTEGER NOT NULL, kickoff TEXT NOT NULL, model TEXT NOT NULL,
    p_home REAL NOT NULL, margin REAL NOT NULL, total REAL NOT NULL, home_pts REAL NOT NULL, away_pts REAL NOT NULL,
    why TEXT, made_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_nfl_pred_kickoff ON nfl_predictions(kickoff);
`);

/* ---------- data ---------- */

interface G { id: number; season: number; kickoff: string; t: number; stage: string | null; week: string | null; h: number; a: number; hn: string; an: string; hs: number | null; as: number | null; done: boolean; neutral: boolean }
interface Passer { id: number; name: string; att: number; anya: number }
interface Box { ypp: number | null; to: number | null; third: [number, number] | null; rz: [number, number] | null; sacks: number | null }
interface Ctx { qb: Map<string, Passer[]>; box: Map<string, Box> }

const INTL = /london|wembley|tottenham|twickenham|munich|m[üu]nchen|frankfurt|berlin|madrid|mexico|s[ãa]o paulo|dublin|croke|toronto|rio de janeiro|melbourne/i;
const isNeutral = (stage: string | null, week: string | null, venue: string | null) => INTL.test(venue || '') || (/post/i.test(stage || '') && /super/i.test(week || ''));

function loadGames(): G[] {
  return (db.prepare(`SELECT game_id, season, week, stage, kickoff, home_id, away_id, home_name, away_name, status, home_pts, away_pts, venue FROM nfl_games
      WHERE kickoff IS NOT NULL AND home_id IS NOT NULL AND away_id IS NOT NULL AND (stage IS NULL OR stage NOT LIKE 'Pre%') ORDER BY kickoff, game_id`).all() as any[])
    .map(r => ({
      id: r.game_id, season: r.season, kickoff: r.kickoff, t: Date.parse(r.kickoff), stage: r.stage, week: r.week, h: r.home_id, a: r.away_id, hn: r.home_name, an: r.away_name,
      hs: r.home_pts, as: r.away_pts, done: ['FT', 'AOT'].includes(r.status) && r.home_pts != null && r.away_pts != null, neutral: isNeutral(r.stage, r.week, r.venue)
    }));
}

const numOf = (v: any): number | null => { if (v === null || v === undefined || v === '') return null; const n = Number(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
const pairOf = (v: any): [number, number] | null => { const m = String(v ?? '').match(/^\s*(\d+)\s*[-/]\s*(\d+)\s*$/); return m ? [Number(m[1]), Number(m[2])] : null; };

/** Passers of one team in one game, from the provider's "Passing" group (the starter = most attempts). */
export function passersOf(json: string | null): Passer[] {
  let groups: any[] = [];
  try { groups = json ? JSON.parse(json) : []; } catch { return []; }
  const pass = (Array.isArray(groups) ? groups : []).find(g => /^passing$/i.test(String(g?.name || '').trim()));
  if (!pass) return [];
  const out: Passer[] = [];
  for (const p of pass.players || []) {
    const id = numOf(p?.player?.id);
    if (!id) continue;
    const st: Record<string, any> = {};
    for (const x of p.statistics || []) if (x?.name) st[String(x.name).toLowerCase().trim()] = x.value;
    const key = (re: RegExp) => Object.keys(st).find(k => re.test(k));
    const ca = pairOf(st[key(/comp.*att|c\/att|^comp/) || '']);
    const att = ca ? ca[1] : numOf(st[key(/^att(empts)?$/) || '']);
    if (!att) continue;
    const yds = numOf(st[key(/^(yards|yds|passing yards)$/) || '']) ?? 0;
    const td = numOf(st[key(/touch ?downs?|^td/) || '']) ?? 0;
    const int = numOf(st[key(/^(interceptions?|int)$/) || '']) ?? 0;
    const sk = st[key(/^sacks?$/) || ''];
    const sp = pairOf(sk);
    const sacks = sp ? sp[0] : numOf(sk) ?? 0, sackYds = sp ? sp[1] : 0;
    out.push({ id, name: p?.player?.name || String(id), att, anya: (yds + 20 * td - 45 * int - sackYds) / Math.max(1, att + sacks) });
  }
  return out.sort((a, b) => b.att - a.att);
}

let ctxCache: { n: number; ctx: Ctx } | null = null;
/** QB lines and efficiency numbers of every game with a box score (parsed once; rebuilt when new box scores arrive). */
function loadCtx(): Ctx {
  const n = (db.prepare(`SELECT COUNT(*) AS n FROM nfl_team_stats`).get() as any)?.n + (db.prepare(`SELECT COUNT(*) AS n FROM nfl_player_stats`).get() as any)?.n;
  if (ctxCache && ctxCache.n === n) return ctxCache.ctx;
  const qb = new Map<string, Passer[]>(), box = new Map<string, Box>();
  for (const r of db.prepare(`SELECT game_id, team_id, json FROM nfl_player_stats`).all() as any[]) {
    const list = passersOf(r.json);
    if (list.length) qb.set(`${r.game_id}|${r.team_id}`, list);
  }
  for (const r of db.prepare(`SELECT game_id, team_id, json FROM nfl_team_stats`).all() as any[]) {
    let s: any = null;
    try { s = JSON.parse(r.json); } catch { s = null; }
    const b = teamBox(s);
    if (!b) continue;
    box.set(`${r.game_id}|${r.team_id}`, {
      ypp: b.yardsPerPlay ?? (b.yards != null && b.plays ? b.yards / b.plays : null), to: b.turnovers, third: b.third, rz: b.redZone, sacks: b.sacks
    });
  }
  const ctx = { qb, box };
  ctxCache = { n, ctx };
  return ctx;
}

/* ---------- the engine ---------- */

export interface Params { k: number; hfaPre: number; hfaPost: number; bye: number; short: number; qbW: number; alpha: number }
const DEFAULT: Params = { k: 20, hfaPre: 55, hfaPost: 30, bye: 15, short: 10, qbW: 40, alpha: 0.08 };
const ELO_ONLY = (p: Params): Params => ({ ...p, bye: 0, short: 0, qbW: 0 });
const QB_PRIOR = 200, QB_DECAY = 0.985, EFF_A = 0.15;
/** Passers with few attempts are shrunk toward a replacement level below the league mean (most of them are backups). */
const QB_REPLACEMENT = 0.7;
/** The team's usual starter = most attempts over its recent games (each older game counts 0.75 as much). */
const USUAL_DECAY = 0.75;

interface TeamState {
  elo: number; season: number; last: number; o: number; d: number; starter: number | null; seasonAtt: Map<number, number>; recentAtt: Map<number, number>;
  eff: { ypp: number; dypp: number; give: number; take: number; third: number; rz: number; sacks: number; n: number }
}
interface Pre {
  g: G; diff: number; p: number; margin: number; total: number; homePts: number; awayPts: number;
  hfa: number; rest: [number | null, number | null]; restAdj: [number, number];
  qb: [QbInfo | null, QbInfo | null]; eloH: number; eloA: number;
  eff: [TeamState['eff'], TeamState['eff']] | null;
}
interface QbInfo { id: number; name: string; value: number; usualId: number | null; usualName: string | null; usualValue: number | null; adj: number; reason: 'same' | 'changed' | 'injury' | 'new' }

class Engine {
  teams = new Map<number, TeamState>();
  qbr = new Map<number, { s: number; w: number; name: string }>();
  qbMean = 6.0; avg = 22;
  constructor(public p: Params, public ctx: Ctx) {}

  team(id: number, season: number): TeamState {
    let t = this.teams.get(id);
    if (!t) {
      t = { elo: 1500, season, last: 0, o: 0, d: 0, starter: null, seasonAtt: new Map(), recentAtt: new Map(), eff: { ypp: 5.3, dypp: 5.3, give: 1.3, take: 1.3, third: 0.39, rz: 0.55, sacks: 2.4, n: 0 } };
      this.teams.set(id, t);
    } else if (t.season !== season) {
      t.elo = 1500 + ((t.elo - 1500) * 2) / 3; // 1/3 back to the mean
      t.o *= 2 / 3; t.d *= 2 / 3;
      const e = t.eff;
      t.eff = { ypp: (e.ypp + 5.3) / 2, dypp: (e.dypp + 5.3) / 2, give: (e.give + 1.3) / 2, take: (e.take + 1.3) / 2, third: (e.third + 0.39) / 2, rz: (e.rz + 0.55) / 2, sacks: (e.sacks + 2.4) / 2, n: Math.min(e.n, 4) };
      t.season = season; t.seasonAtt = new Map();
    }
    return t;
  }
  qbValue(id: number | null): number | null {
    if (!id) return null;
    const r = this.qbr.get(id);
    const prior = this.qbMean - QB_REPLACEMENT;
    return r ? (r.s + prior * QB_PRIOR) / (r.w + QB_PRIOR) : prior; // unknown passer: replacement level
  }
  qbName(id: number | null) { return id ? this.qbr.get(id)?.name ?? null : null; }

  /** The starter: the box score's (finished games) or the usual one / his backup (upcoming games). */
  starterFor(g: G, teamId: number, t: TeamState, injuredOut?: Set<number>): { id: number | null; name: string | null; reason: QbInfo['reason'] } {
    const list = this.ctx.qb.get(`${g.id}|${teamId}`);
    if (list && list.length) return { id: list[0].id, name: list[0].name, reason: t.starter && t.starter !== list[0].id ? 'changed' : t.starter ? 'same' : 'new' };
    if (!t.starter) return { id: null, name: null, reason: 'new' };
    if (injuredOut && injuredOut.has(t.starter)) {
      const backup = [...t.seasonAtt.entries()].filter(([id]) => id !== t.starter && !injuredOut.has(id)).sort((a, b) => b[1] - a[1])[0];
      return { id: backup ? backup[0] : -1, name: backup ? this.qbName(backup[0]) : 'Backup QB', reason: 'injury' };
    }
    return { id: t.starter, name: this.qbName(t.starter), reason: 'same' };
  }

  pre(g: G, injuredOut?: Set<number>): Pre {
    const H = this.team(g.h, g.season), A = this.team(g.a, g.season);
    const hfa = g.neutral ? 0 : g.season >= 2020 ? this.p.hfaPost : this.p.hfaPre;
    const restOf = (t: TeamState) => (t.last && t.season === g.season ? (g.t - t.last) / DAY : null);
    const rH = restOf(H), rA = restOf(A);
    const restAdj = (r: number | null) => (r === null ? 0 : r >= 12.5 ? this.p.bye : r <= 5.5 ? -this.p.short : 0);
    const qbInfo = (teamId: number, t: TeamState): QbInfo | null => {
      const s = this.starterFor(g, teamId, t, injuredOut);
      if (!s.id) return null;
      const value = s.id === -1 ? this.qbMean - QB_REPLACEMENT : this.qbValue(s.id)!;
      const usualValue = this.qbValue(t.starter);
      const changed = t.starter !== null && s.id !== t.starter;
      return { id: s.id, name: s.name || String(s.id), value, usualId: t.starter, usualName: this.qbName(t.starter), usualValue, adj: changed && usualValue !== null ? this.p.qbW * (value - usualValue) : 0, reason: s.reason };
    };
    const qH = qbInfo(g.h, H), qA = qbInfo(g.a, A);
    const diff = H.elo - A.elo + hfa + restAdj(rH) - restAdj(rA) + (qH?.adj || 0) - (qA?.adj || 0);
    const p = 1 / (1 + Math.pow(10, -diff / 400));
    const margin = diff / 25;
    const total = 2 * this.avg + H.o + A.d + A.o + H.d;
    const effOk = H.eff.n >= 3 && A.eff.n >= 3;
    return {
      g, diff, p, margin, total, homePts: (total + margin) / 2, awayPts: (total - margin) / 2, hfa, rest: [rH, rA], restAdj: [restAdj(rH), restAdj(rA)],
      qb: [qH, qA], eloH: H.elo, eloA: A.elo, eff: effOk ? [{ ...H.eff }, { ...A.eff }] : null
    };
  }

  update(pr: Pre) {
    const g = pr.g;
    if (!g.done) return;
    const H = this.team(g.h, g.season), A = this.team(g.a, g.season);
    const m = g.hs! - g.as!;
    const res = m > 0 ? 1 : m < 0 ? 0 : 0.5;
    const winnerDiff = m > 0 ? pr.diff : m < 0 ? -pr.diff : 0;
    const mult = Math.log(Math.abs(m) + 1) * (2.2 / (winnerDiff * 0.001 + 2.2));
    const delta = this.p.k * mult * (res - pr.p);
    H.elo += delta; A.elo -= delta;
    // points for / against ratings
    const eH = g.hs! - (this.avg + H.o + A.d), eA = g.as! - (this.avg + A.o + H.d);
    H.o += this.p.alpha * eH; A.d += this.p.alpha * eH; A.o += this.p.alpha * eA; H.d += this.p.alpha * eA;
    this.avg += 0.004 * ((g.hs! + g.as!) / 2 - this.avg);
    // QB ratings
    for (const [teamId, t] of [[g.h, H], [g.a, A]] as [number, TeamState][]) {
      const list = this.ctx.qb.get(`${g.id}|${teamId}`);
      if (!list || !list.length) continue;
      for (const q of list) {
        const r = this.qbr.get(q.id) || { s: 0, w: 0, name: q.name };
        r.s = r.s * QB_DECAY + q.anya * q.att; r.w = r.w * QB_DECAY + q.att; r.name = q.name;
        this.qbr.set(q.id, r);
        this.qbMean += 0.0005 * q.att * (q.anya - this.qbMean) / 30;
        t.seasonAtt.set(q.id, (t.seasonAtt.get(q.id) || 0) + q.att);
      }
      // usual starter: most recent attempts (a backup takes over after 2–3 starts, not after one)
      for (const [id, a] of t.recentAtt) t.recentAtt.set(id, a * USUAL_DECAY);
      for (const q of list) t.recentAtt.set(q.id, (t.recentAtt.get(q.id) || 0) + q.att);
      const top = [...t.recentAtt.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= 10) t.starter = top[0];
    }
    // efficiency
    const bH = this.ctx.box.get(`${g.id}|${g.h}`), bA = this.ctx.box.get(`${g.id}|${g.a}`);
    if (bH && bA) {
      const upd = (t: TeamState, me: Box, op: Box) => {
        const e = t.eff, a = EFF_A;
        if (me.ypp != null) e.ypp += a * (me.ypp - e.ypp);
        if (op.ypp != null) e.dypp += a * (op.ypp - e.dypp);
        if (me.to != null) e.give += a * (me.to - e.give);
        if (op.to != null) e.take += a * (op.to - e.take);
        if (me.third && me.third[1]) e.third += a * (me.third[0] / me.third[1] - e.third);
        if (me.rz && me.rz[1]) e.rz += a * (me.rz[0] / me.rz[1] - e.rz);
        if (me.sacks != null) e.sacks += a * (me.sacks - e.sacks);
        e.n++;
      };
      upd(H, bH, bA); upd(A, bA, bH);
    }
    H.last = g.t; A.last = g.t;
  }
}

/** One pass over games in order; `onPre` sees every game's pre-game numbers (finished games update the ratings). */
function run(games: G[], p: Params, ctx: Ctx, onPre?: (pr: Pre) => void, stopBefore?: number) {
  const E = new Engine(p, ctx);
  for (const g of games) {
    if (stopBefore !== undefined && g.t >= stopBefore) break;
    if (!g.done) { // an unplayed game in the past (cancelled / postponed): only the schedule clock moves on
      continue;
    }
    const pr = E.pre(g);
    onPre?.(pr);
    E.update(pr);
  }
  return E;
}

/* ---------- efficiency blend (D) ---------- */

const featOf = (pr: Pre): number[] | null => {
  if (!pr.eff) return null;
  const [h, a] = pr.eff;
  return [pr.diff / 100, (h.ypp - h.dypp) - (a.ypp - a.dypp), (h.take - h.give) - (a.take - a.give), h.third - a.third, h.rz - a.rz, h.sacks - a.sacks];
};
interface Blend { w: number[]; b: number; mu: number[]; sd: number[] }
function fitBlend(rows: { x: number[]; y: number }[]): Blend | null {
  if (rows.length < 150) return null;
  const k = rows[0].x.length;
  const mu = Array.from({ length: k }, (_, j) => rows.reduce((s, r) => s + r.x[j], 0) / rows.length);
  const sd = Array.from({ length: k }, (_, j) => Math.sqrt(rows.reduce((s, r) => s + (r.x[j] - mu[j]) ** 2, 0) / rows.length) || 1);
  const z = rows.map(r => ({ x: r.x.map((v, j) => (v - mu[j]) / sd[j]), y: r.y }));
  const w = new Array(k).fill(0); let b = 0;
  const lr = 0.1, l2 = 0.01;
  for (let it = 0; it < 400; it++) {
    const gw = new Array(k).fill(0); let gb = 0;
    for (const r of z) {
      const s = b + r.x.reduce((acc, v, j) => acc + v * w[j], 0);
      const e = 1 / (1 + Math.exp(-s)) - r.y;
      gb += e; for (let j = 0; j < k; j++) gw[j] += e * r.x[j];
    }
    b -= (lr * gb) / z.length;
    for (let j = 0; j < k; j++) w[j] -= lr * (gw[j] / z.length + l2 * w[j]);
  }
  return { w, b, mu, sd };
}
const blendP = (bl: Blend, x: number[]) => 1 / (1 + Math.exp(-(bl.b + x.reduce((s, v, j) => s + ((v - bl.mu[j]) / bl.sd[j]) * bl.w[j], 0))));

/* ---------- metrics ---------- */

interface Row { p: number; y: number; m: number; mHat: number; tot: number; totHat: number }
const clip = (p: number) => Math.min(0.995, Math.max(0.005, p));
function metrics(rows: Row[]) {
  const n = rows.length;
  if (!n) return { games: 0 };
  let ll = 0, br = 0, hit = 0, hitN = 0, mae = 0, tmae = 0;
  const bins = [[50, 60], [60, 70], [70, 80], [80, 101]].map(([lo, hi]) => ({ bin: hi > 100 ? `${lo}+` : `${lo}-${hi}`, lo, hi, n: 0, sumP: 0, hits: 0 }));
  for (const r of rows) {
    const p = clip(r.p);
    ll += -(r.y * Math.log(p) + (1 - r.y) * Math.log(1 - p));
    br += (p - r.y) ** 2;
    if (r.y !== 0.5) { hitN++; if ((p >= 0.5 ? 1 : 0) === r.y) hit++; }
    mae += Math.abs(r.m - r.mHat); tmae += Math.abs(r.tot - r.totHat);
    const top = Math.max(p, 1 - p) * 100;
    const b = bins.find(x => top >= x.lo && top < x.hi);
    if (b && r.y !== 0.5) { b.n++; b.sumP += top; if ((p >= 0.5 ? 1 : 0) === r.y) b.hits++; }
  }
  const r1 = (x: number) => Math.round(x * 10) / 10, r4 = (x: number) => Math.round(x * 10000) / 10000;
  return {
    games: n, hit: hitN ? r1((100 * hit) / hitN) : null, logLoss: r4(ll / n), brier: r4(br / n), marginMAE: r1(mae / n), totalMAE: r1(tmae / n),
    calibration: bins.map(b => ({ bin: b.bin, games: b.n, predicted: b.n ? r1(b.sumP / b.n) : null, actual: b.n ? r1((100 * b.hits) / b.n) : null }))
  };
}
const rowOf = (pr: Pre, p = pr.p, mHat = pr.margin): Row => {
  const m = pr.g.hs! - pr.g.as!;
  return { p, y: m > 0 ? 1 : m < 0 ? 0 : 0.5, m, mHat, tot: pr.g.hs! + pr.g.as!, totHat: pr.total };
};
const logLossOf = (rows: Row[]) => rows.reduce((s, r) => s - (r.y * Math.log(clip(r.p)) + (1 - r.y) * Math.log(1 - clip(r.p))), 0) / Math.max(1, rows.length);
const marginFromP = (p: number) => (Math.log10(clip(p) / (1 - clip(p))) * 400) / 25;

/* ---------- tuning (coordinate search on log loss; points rate on total MAE) ---------- */

const GRID: Record<keyof Params, number[]> = {
  k: [12, 16, 20, 24, 28, 34], hfaPre: [35, 45, 55, 65, 75], hfaPost: [5, 15, 25, 35, 45, 55], bye: [0, 10, 20, 30], short: [0, 10, 20, 30], qbW: [0, 15, 30, 45, 60, 80], alpha: [0.04, 0.06, 0.08, 0.11, 0.15]
};

/** Tune on the games before `before` (ms), the first season being warm-up only. */
async function tune(games: G[], ctx: Ctx, before: number, eloOnly = false): Promise<Params> {
  const train = games.filter(g => g.t < before);
  const first = train.find(g => g.done)?.season;
  const score = (p: Params, key: 'll' | 'tot') => {
    const rows: Row[] = [];
    run(train, p, ctx, pr => { if (pr.g.season !== first) rows.push(rowOf(pr)); });
    return key === 'll' ? logLossOf(rows) : rows.reduce((s, r) => s + Math.abs(r.tot - r.totHat), 0) / Math.max(1, rows.length);
  };
  let best: Params = eloOnly ? ELO_ONLY(DEFAULT) : { ...DEFAULT };
  const keys: (keyof Params)[] = eloOnly ? ['k', 'hfaPre', 'hfaPost'] : ['k', 'hfaPre', 'hfaPost', 'qbW', 'bye', 'short'];
  for (let pass = 0; pass < 2; pass++) {
    for (const key of keys) {
      let bestS = Infinity, bestV = best[key];
      for (const v of GRID[key]) {
        const s = score({ ...best, [key]: v }, 'll');
        if (s < bestS - 1e-6) { bestS = s; bestV = v; }
        await yieldLoop();
      }
      best = { ...best, [key]: bestV };
    }
  }
  let bestT = Infinity;
  for (const v of GRID.alpha) { const s = score({ ...best, alpha: v }, 'tot'); if (s < bestT) { bestT = s; best = { ...best, alpha: v }; } await yieldLoop(); }
  return best;
}

/* ---------- walk-forward test ---------- */

export interface Report {
  model: string; builtAt: string; seasons: any[]; total: any; baselines: any; blend: { used: boolean; testLogLossAB: number | null; testLogLossD: number | null };
  live: { params: Params; blend: boolean; seasonsTrained: number[] } | null; data: { games: number; finished: number; withBox: number; withQb: number; seasons: number[] }
}

export async function buildReport(): Promise<Report> {
  const games = loadGames();
  const ctx = loadCtx();
  const finished = games.filter(g => g.done);
  const seasons = [...new Set(finished.map(g => g.season))].sort((a, b) => a - b);
  const testSeasons = seasons.filter(s => finished.filter(g => g.season === s).length >= 30).slice(-5).filter(s => s !== seasons[0]);
  const per: any[] = [];
  const all = { ab: [] as Row[], d: [] as Row[], elo: [] as Row[] };
  const base = { home: { hit: 0, n: 0, ll: 0 }, record: { hit: 0, n: 0 } };
  for (const S of testSeasons) {
    const start = Math.min(...finished.filter(g => g.season === S).map(g => g.t));
    const p = await tune(games, ctx, start);
    const pElo = await tune(games, ctx, start, true);
    // blend fitted on the training seasons' pre-game numbers
    const trainRows: { x: number[]; y: number }[] = [];
    run(games, p, ctx, pr => { if (pr.g.t < start && pr.g.season !== seasons[0]) { const x = featOf(pr); if (x) trainRows.push({ x, y: rowOf(pr).y }); } }, start);
    const bl = fitBlend(trainRows.filter(r => r.y !== 0.5));
    const homeRate = (() => { const tr = finished.filter(g => g.t < start); return tr.filter(g => g.hs! > g.as!).length / Math.max(1, tr.length); })();
    const ab: Row[] = [], d: Row[] = [], elo: Row[] = [];
    const rec = new Map<number, { w: number; g: number }>();
    run(games, p, ctx, pr => {
      if (pr.g.season !== S) return;
      const r = rowOf(pr);
      ab.push(r);
      const x = featOf(pr);
      const pd = bl && x ? blendP(bl, x) : pr.p;
      d.push({ ...r, p: pd, mHat: bl && x ? marginFromP(pd) : r.mHat });
      // baselines
      if (r.y !== 0.5) {
        base.home.n++; if (r.y === 1) base.home.hit++;
        const rh = rec.get(pr.g.h) || { w: 0, g: 0 }, ra = rec.get(pr.g.a) || { w: 0, g: 0 };
        const ph = rh.g ? rh.w / rh.g : 0, pa = ra.g ? ra.w / ra.g : 0;
        base.record.n++; if ((pa > ph ? 0 : 1) === r.y) base.record.hit++;
      }
      base.home.ll += -(r.y * Math.log(homeRate) + (1 - r.y) * Math.log(1 - homeRate));
      for (const [id, won] of [[pr.g.h, r.y], [pr.g.a, 1 - r.y]] as [number, number][]) { const x2 = rec.get(id) || { w: 0, g: 0 }; x2.w += won; x2.g++; rec.set(id, x2); }
    });
    run(games, pElo, ctx, pr => { if (pr.g.season === S) elo.push(rowOf(pr)); });
    const mAB = metrics(ab), mD = metrics(d), mElo = metrics(elo);
    const homeS = ab.filter(r => r.y !== 0.5), homeHit = homeS.length ? Math.round((1000 * homeS.filter(r => r.y === 1).length) / homeS.length) / 10 : null;
    per.push({ season: S, params: p, ab: mAB, blend: bl ? mD : null, eloOnly: mElo, homeTeamHit: homeHit });
    all.ab.push(...ab); all.d.push(...d); all.elo.push(...elo);
    logger.info(`${NFL_MODEL} ${S}: hit ${(mAB as any).hit}% LL ${(mAB as any).logLoss} over ${(mAB as any).games} games (home ${homeHit}%, Elo ${(mElo as any).hit}%)${bl ? ` · with efficiency: hit ${(mD as any).hit}% LL ${(mD as any).logLoss}` : ''}`);
    await yieldLoop();
  }
  const llAB = all.ab.length ? logLossOf(all.ab) : null, llD = all.d.length ? logLossOf(all.d) : null;
  const useD = llAB !== null && llD !== null && llD < llAB - 0.0005;
  logger.info(`${NFL_MODEL} total: A+B LL ${llAB === null ? '–' : llAB.toFixed(4)}, with efficiency ${llD === null ? '–' : llD.toFixed(4)} → ${useD ? 'efficiency blend (D) kept' : 'A+B kept'}`);
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const report: Report = {
    model: NFL_MODEL, builtAt: new Date().toISOString(), seasons: per,
    total: { ab: metrics(all.ab), blend: metrics(all.d), eloOnly: metrics(all.elo) },
    baselines: {
      homeTeam: base.home.n ? { hit: r1((100 * base.home.hit) / base.home.n), logLoss: Math.round((base.home.ll / Math.max(1, all.ab.length)) * 10000) / 10000 } : null,
      betterRecord: base.record.n ? { hit: r1((100 * base.record.hit) / base.record.n) } : null,
      eloOnly: { hit: (metrics(all.elo) as any).hit ?? null, logLoss: (metrics(all.elo) as any).logLoss ?? null }
    },
    blend: { used: useD, testLogLossAB: llAB, testLogLossD: llD },
    live: null,
    data: { games: games.length, finished: finished.length, withBox: new Set([...ctx.box.keys()].map(k => k.split('|')[0])).size, withQb: new Set([...ctx.qb.keys()].map(k => k.split('|')[0])).size, seasons }
  };
  return report;
}

/* ---------- live model ---------- */

interface Live { params: Params; blend: Blend | null; trained: number[]; builtAt: string; finishedCount: number; engine: Engine; games: G[] }
let live: Live | null = null;
const sync = (key: string, v: unknown) => db.prepare(`INSERT OR REPLACE INTO nfl_sync (key, at, detail) VALUES (?, ?, ?)`).run(key, new Date().toISOString(), JSON.stringify(v));
const readSync = (key: string): any => { const r = db.prepare(`SELECT detail FROM nfl_sync WHERE key = ?`).get(key) as any; try { return r ? JSON.parse(r.detail) : null; } catch { return null; } };

/** Re-tune on every finished season (+ the walk-forward report), then replay. Weekly (Tuesday) or when nothing is stored. */
export async function retrain(): Promise<Report> {
  const report = await buildReport();
  const games = loadGames(), ctx = loadCtx();
  const finished = games.filter(g => g.done);
  const params = finished.length >= 200 ? await tune(games, ctx, Date.now() + DAY) : DEFAULT;
  let blend: Blend | null = null;
  if (report.blend.used) {
    const first = finished[0]?.season;
    const rows: { x: number[]; y: number }[] = [];
    run(games, params, ctx, pr => { if (pr.g.season !== first) { const x = featOf(pr); const y = rowOf(pr).y; if (x && y !== 0.5) rows.push({ x, y }); } });
    blend = fitBlend(rows);
  }
  const trained = [...new Set(finished.map(g => g.season))].sort((a, b) => a - b);
  report.live = { params, blend: !!blend, seasonsTrained: trained };
  sync('model|params', { params, blend, trained, at: new Date().toISOString() });
  sync('model|report', report);
  live = null; // replayed on next use
  return report;
}

/** The current ratings: replayed from the stored settings when a game has finished since the last replay (cheap). */
function current(): Live | null {
  const games = loadGames();
  const finishedCount = games.filter(g => g.done).length;
  if (live && live.finishedCount === finishedCount && Date.now() - Date.parse(live.builtAt) < 30 * 60 * 1000) return live;
  if (finishedCount < 50) return null;
  const stored = readSync('model|params');
  const params: Params = stored?.params || DEFAULT;
  const ctx = loadCtx();
  const engine = run(games, params, ctx);
  live = { params, blend: stored?.blend || null, trained: stored?.trained || [], builtAt: new Date().toISOString(), finishedCount, engine, games };
  return live;
}

const OUT = /out|doubtful|injured reserve|^ir$|reserve/i;
function injuredOut(teamId: number): Set<number> {
  return new Set((db.prepare(`SELECT player_id, status FROM nfl_injuries WHERE team_id = ?`).all(teamId) as any[]).filter(r => OUT.test(String(r.status || ''))).map(r => r.player_id));
}

export interface NflPred {
  pHome: number; pAway: number; pick: 'H' | 'A'; margin: number; total: number; homePts: number; awayPts: number; strong: boolean; model: string;
  why: { eloHome: number; eloAway: number; eloGap: number; homeField: number; neutral: boolean; rest: [number | null, number | null]; restAdj: [number, number];
    qb: [QbInfo | null, QbInfo | null]; eff: { yppHome: number; yppAway: number; toHome: number; toAway: number } | null; blend: boolean }
}

/** A prediction for one game that has not started, from the current ratings (null when the model has too few games). */
export function predictNfl(gameId: number): NflPred | null {
  const L = current();
  if (!L) return null;
  const g = L.games.find(x => x.id === gameId);
  if (!g || g.done) return null;
  const outs = new Set([...injuredOut(g.h), ...injuredOut(g.a)]);
  // the engine's state is "after every finished game"; a copy is not needed: pre() only reads (team() may regress a new season)
  const pr = L.engine.pre(g, outs);
  const x = featOf(pr);
  const p = L.blend && x ? blendP(L.blend, x) : pr.p;
  const margin = L.blend && x ? marginFromP(p) : pr.margin;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const pHome = Math.round(p * 1000) / 10;
  return {
    pHome, pAway: r1(100 - pHome), pick: p >= 0.5 ? 'H' : 'A', margin: r1(margin), total: r1(pr.total),
    homePts: r1((pr.total + margin) / 2), awayPts: r1((pr.total - margin) / 2), strong: Math.max(p, 1 - p) >= 0.7, model: NFL_MODEL,
    why: {
      eloHome: Math.round(pr.eloH), eloAway: Math.round(pr.eloA), eloGap: Math.round(pr.eloH - pr.eloA), homeField: Math.round(pr.hfa), neutral: g.neutral,
      rest: [pr.rest[0] === null ? null : Math.round(pr.rest[0]), pr.rest[1] === null ? null : Math.round(pr.rest[1])], restAdj: pr.restAdj,
      qb: pr.qb.map(q => (q ? { ...q, value: r1(q.value), usualValue: q.usualValue === null ? null : r1(q.usualValue), adj: Math.round(q.adj) } : null)) as [QbInfo | null, QbInfo | null],
      eff: pr.eff ? { yppHome: r1(pr.eff[0].ypp - pr.eff[0].dypp), yppAway: r1(pr.eff[1].ypp - pr.eff[1].dypp), toHome: r1(pr.eff[0].take - pr.eff[0].give), toAway: r1(pr.eff[1].take - pr.eff[1].give) } : null,
      blend: !!L.blend
    }
  };
}

/** Save / refresh the predictions of the games of the next 9 days that have not started (frozen at kick-off). */
export function saveNflPredictions(): number {
  const now = new Date();
  const rows = db.prepare(`SELECT game_id, season, kickoff FROM nfl_games WHERE kickoff > ? AND kickoff < ? AND (status IS NULL OR status = 'NS') AND (stage IS NULL OR stage NOT LIKE 'Pre%')`)
    .all(now.toISOString(), new Date(now.getTime() + 9 * DAY).toISOString()) as any[];
  const up = db.prepare(`INSERT OR REPLACE INTO nfl_predictions (game_id, season, kickoff, model, p_home, margin, total, home_pts, away_pts, why, made_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let n = 0;
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      const pr = predictNfl(r.game_id);
      if (!pr) continue;
      up.run(r.game_id, r.season, r.kickoff, NFL_MODEL, pr.pHome / 100, pr.margin, pr.total, pr.homePts, pr.awayPts, JSON.stringify(pr.why), now.toISOString());
      n++;
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return n;
}

/** The saved prediction of a game (what was shown before kick-off), with the result once it is over. */
export function savedNflPrediction(gameId: number) {
  const r = db.prepare(`SELECT p.*, g.status, g.home_pts AS hs, g.away_pts AS as_ FROM nfl_predictions p JOIN nfl_games g ON g.game_id = p.game_id WHERE p.game_id = ? AND p.made_at <= p.kickoff`).get(gameId) as any;
  if (!r) return null;
  const done = ['FT', 'AOT'].includes(r.status) && r.hs != null;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const pHome = Math.round(r.p_home * 1000) / 10;
  let why: any = null; try { why = r.why ? JSON.parse(r.why) : null; } catch { why = null; }
  return {
    pHome, pAway: r1(100 - pHome), pick: (r.p_home >= 0.5 ? 'H' : 'A') as 'H' | 'A', margin: r1(r.margin), total: r1(r.total), homePts: r1(r.home_pts), awayPts: r1(r.away_pts),
    strong: Math.max(r.p_home, 1 - r.p_home) >= 0.7, model: r.model, why,
    hit: done && r.hs !== r.as_ ? (r.p_home >= 0.5) === (r.hs > r.as_) : null
  };
}

/**
 * Predictions on game lists (rows, home, game page). Paid / admin get the numbers; everyone else gets a locked
 * marker for games that have not finished (no pick, like basketball since fix123) and the pick + hit once it is over.
 */
export function withNflPrediction<T extends NflGame>(g: T, full: boolean): T & { prediction: any } {
  const s = savedNflPrediction(g.id);
  if (!s) return { ...g, prediction: null };
  if (full) return { ...g, prediction: { ...s, locked: false } };
  // finished games: everyone sees the numbers and the hit (like basketball), not the reasons
  if (g.state === 'done') { const { why: _why, ...rest } = s; return { ...g, prediction: { ...rest, locked: false } }; }
  return { ...g, prediction: { locked: true, model: s.model } };
}

/** Our record on one team's games (saved before kick-off, finished): picks, right, strong picks right. */
export function nflTeamRecord(teamId: number, season: number) {
  const rows = db.prepare(`SELECT p.p_home, g.home_pts AS hs, g.away_pts AS as_ FROM nfl_predictions p JOIN nfl_games g ON g.game_id = p.game_id
    WHERE p.season = ? AND (g.home_id = ? OR g.away_id = ?) AND p.made_at <= p.kickoff AND g.status IN ('FT','AOT') AND g.home_pts IS NOT NULL AND g.home_pts != g.away_pts`).all(season, teamId, teamId) as any[];
  const hit = (r: any) => (r.p_home >= 0.5) === (r.hs > r.as_);
  const strong = rows.filter(r => Math.max(r.p_home, 1 - r.p_home) >= 0.7);
  return { games: rows.length, right: rows.filter(hit).length, strong: strong.length, strongRight: strong.filter(hit).length };
}

/** Team page model tiles (fix139): Elo and its rank, the starting QB and his value, points for / against ratings. */
export function nflTeamModel(teamId: number) {
  const L = current();
  if (!L) return null;
  const E = L.engine;
  const season = Math.max(...L.games.filter(g => g.done).map(g => g.season));
  const active = [...E.teams.entries()].filter(([, t]) => t.season === season);
  const me = E.teams.get(teamId);
  if (!me || me.season !== season) return null;
  const rank = active.filter(([, t]) => t.elo > me.elo).length + 1;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    elo: Math.round(me.elo), rank, teams: active.length,
    qb: me.starter ? { id: me.starter, name: E.qbName(me.starter), value: r1(E.qbValue(me.starter)!) , league: r1(E.qbMean) } : null,
    offense: r1(E.avg + me.o), defense: r1(E.avg + me.d), leaguePoints: r1(E.avg),
    offRank: active.filter(([, t]) => t.o > me.o).length + 1, defRank: active.filter(([, t]) => t.d < me.d).length + 1
  };
}

export const nflModelReport = (): Report | null => readSync('model|report');

/* ---------- jobs ---------- */

let busy = false;
/** Weekly re-tune (Tuesday, or first run without settings) + save the coming predictions. Called from the NFL scheduler. */
export async function nflModelTick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const stored = readSync('model|params');
    const last = stored?.at ? Date.parse(stored.at) : 0;
    const finished = (db.prepare(`SELECT COUNT(*) AS n FROM nfl_games WHERE status IN ('FT','AOT') AND home_pts IS NOT NULL`).get() as any)?.n || 0;
    if (finished >= 200 && (!stored || (new Date().getUTCDay() === 2 && Date.now() - last > 5 * DAY) || Date.now() - last > 8 * DAY)) {
      const rep = await retrain();
      logger.info(`${NFL_MODEL}: re-tuned (${rep.live?.seasonsTrained.join(', ')}), test LL ${rep.blend.testLogLossAB}${rep.blend.used ? ` → blend ${rep.blend.testLogLossD}` : ''}`);
    }
    const n = saveNflPredictions();
    if (n) logger.info(`${NFL_MODEL}: ${n} predictions saved`);
  } catch (e: any) {
    logger.warn(`${NFL_MODEL}: ${e.message}`);
  } finally { busy = false; }
}
