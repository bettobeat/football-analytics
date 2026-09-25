/**
 * Prediction tracking: save every prediction, lock it at kick-off,
 * settle it against the result, and compute accuracy metrics.
 */
import { db } from '../db';
import logger from '../utils/logger';
import { Prediction } from './predictionModel';

const LIVE_OR_DONE = new Set(['IN_PLAY', 'PAUSED', 'FINISHED', 'AWARDED']);
const SETTLE_AFTER_MS = 105 * 60 * 1000; // kick-off + 105 min before we look for a result
const EDGE_THRESHOLD = 0.05; // bet when model EV at market odds >= +5%

export type Outcome = 'H' | 'D' | 'A';

const upsertStmt = db.prepare(`
  INSERT INTO predictions (
    match_id, model, competition_code, competition_name, utc_date,
    home_team_id, home_team, away_team_id, away_team,
    p_home, p_draw, p_away, xg_home, xg_away, over25, btts, confidence,
    games_home, games_away, odds_home, odds_draw, odds_away,
    locked, settled, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
  ON CONFLICT(match_id, model) DO UPDATE SET
    utc_date = excluded.utc_date,
    p_home = excluded.p_home, p_draw = excluded.p_draw, p_away = excluded.p_away,
    xg_home = excluded.xg_home, xg_away = excluded.xg_away,
    over25 = excluded.over25, btts = excluded.btts, confidence = excluded.confidence,
    games_home = excluded.games_home, games_away = excluded.games_away,
    odds_home = COALESCE(excluded.odds_home, predictions.odds_home),
    odds_draw = COALESCE(excluded.odds_draw, predictions.odds_draw),
    odds_away = COALESCE(excluded.odds_away, predictions.odds_away),
    updated_at = excluded.updated_at
  WHERE predictions.locked = 0
`);

const lockStmt = db.prepare(
  `UPDATE predictions SET locked = 1, locked_at = COALESCE(locked_at, ?), updated_at = ? WHERE match_id = ? AND locked = 0`
);

/** Save/refresh predictions for a batch of matches (with .prediction attached). */
export function recordPredictions(matches: any[]) {
  const now = new Date().toISOString();
  let saved = 0;
  let locked = 0;
  for (const m of matches) {
    const preds: Prediction[] = (m.predictions && m.predictions.length ? m.predictions : [m.prediction]).filter(Boolean);
    if (!preds.length) continue;
    // Postponed / suspended / cancelled matches are not locked: a rescheduled date must still be recordable
    const kickedOff =
      LIVE_OR_DONE.has(m.status) || (new Date(m.utcDate).getTime() <= Date.now() && !['POSTPONED', 'SUSPENDED', 'CANCELLED'].includes(m.status));

    if (kickedOff) {
      // Kick-off: freeze whatever was predicted before the match. Never insert
      // or update after the start — only pre-match predictions count.
      const l = lockStmt.run(now, now, m.id);
      if (Number(l.changes) > 0) locked++;
      continue;
    }

    const odds = m.odds?.msw || {};
    for (const p of preds) {
    const res = upsertStmt.run(
      m.id,
      p.model,
      m.competition?.code || null,
      m.competition?.name || null,
      m.utcDate,
      m.homeTeam?.id || null,
      m.homeTeam?.shortName || m.homeTeam?.name || null,
      m.awayTeam?.id || null,
      m.awayTeam?.shortName || m.awayTeam?.name || null,
      p.home,
      p.draw,
      p.away,
      p.expectedGoals.home,
      p.expectedGoals.away,
      p.over25,
      p.btts,
      p.confidence,
      p.factors.gamesPlayed.home,
      p.factors.gamesPlayed.away,
      odds.homeWin ?? null,
      odds.draw ?? null,
      odds.awayWin ?? null,
      now,
      now
    );
    if (Number(res.changes) > 0) saved++;
    }
  }
  if (saved || locked) logger.info(`Predictions saved: ${saved}, newly locked: ${locked}`);
}

const pendingStmt = db.prepare(
  `SELECT DISTINCT match_id, utc_date FROM predictions WHERE settled = 0 AND utc_date <= ? ORDER BY utc_date`
);
const insertResult = db.prepare(
  `INSERT OR REPLACE INTO results (match_id, status, home_goals, away_goals, outcome, settled_at) VALUES (?, ?, ?, ?, ?, ?)`
);
const markSettled = db.prepare(`UPDATE predictions SET settled = 1, locked = 1, updated_at = ? WHERE match_id = ?`);
// Postponed / suspended: unlock so the rescheduled date (and a fresh pre-match prediction) can be recorded
const unlockStmt = db.prepare(`UPDATE predictions SET locked = 0, updated_at = ? WHERE match_id = ? AND settled = 0`);

const AF_ID_OFFSET = 1_000_000_000;
const MAX_PENDING_DAYS = 21; // give up on a result after 3 weeks (void)
const RESCHEDULE_STATUSES = new Set(['POSTPONED', 'SUSPENDED']);

/** Normalised result from either source. status: FINISHED | VOID | RESCHEDULE | OPEN */
interface ResultRow { id: number; status: 'FINISHED' | 'VOID' | 'RESCHEDULE' | 'OPEN'; raw: string; h: number | null; a: number | null }

/** Football-Data.org match → result. 1X2 is settled on the 90-minute score (regularTime after extra time / penalties). */
function fdResult(m: any): ResultRow {
  if (m.status === 'FINISHED' || m.status === 'AWARDED') {
    const s = m.score?.duration && m.score.duration !== 'REGULAR' && m.score.regularTime ? m.score.regularTime : m.score?.fullTime;
    const h = s?.home, a = s?.away;
    if (h === null || h === undefined || a === null || a === undefined) return { id: m.id, status: 'OPEN', raw: m.status, h: null, a: null };
    return { id: m.id, status: 'FINISHED', raw: m.status, h, a };
  }
  if (m.status === 'CANCELLED') return { id: m.id, status: 'VOID', raw: m.status, h: null, a: null };
  if (RESCHEDULE_STATUSES.has(m.status)) return { id: m.id, status: 'RESCHEDULE', raw: m.status, h: null, a: null };
  // moved to a later date without a POSTPONED flag
  if (m.utcDate && new Date(m.utcDate).getTime() > Date.now()) return { id: m.id, status: 'RESCHEDULE', raw: m.status, h: null, a: null };
  return { id: m.id, status: 'OPEN', raw: m.status, h: null, a: null };
}

/** API-Football fixture → result (id offset applied). 1X2 on the 90-minute score. */
export function afResult(f: any): ResultRow {
  const id = AF_ID_OFFSET + f.fixture.id;
  const st = f.fixture?.status?.short;
  if (['FT', 'AET', 'PEN'].includes(st)) {
    const h = f.score?.fulltime?.home ?? f.goals?.home, a = f.score?.fulltime?.away ?? f.goals?.away;
    if (h === null || h === undefined || a === null || a === undefined) return { id, status: 'OPEN', raw: st, h: null, a: null };
    return { id, status: 'FINISHED', raw: 'FINISHED', h, a };
  }
  if (['AWD', 'WO', 'CANC', 'ABD'].includes(st)) return { id, status: 'VOID', raw: st, h: null, a: null };
  if (['PST', 'SUSP', 'INT', 'TBD'].includes(st)) return { id, status: 'RESCHEDULE', raw: st, h: null, a: null };
  if (f.fixture?.date && new Date(f.fixture.date).getTime() > Date.now()) return { id, status: 'RESCHEDULE', raw: st, h: null, a: null };
  return { id, status: 'OPEN', raw: st, h: null, a: null };
}

let settling = false;

/**
 * Settle pending predictions.
 * `fetchRange(dateFrom, dateTo)` returns Football-Data.org matches (any status) between two ISO dates.
 * `fetchAf(ids)` returns API-Football fixtures by fixture id (ids without the offset).
 */
export async function settlePending(
  fetchRange: (dateFrom: string, dateTo: string) => Promise<any[]>,
  fetchAf?: (fixtureIds: number[]) => Promise<any[]>
) {
  if (settling) return { settled: 0, pending: 0, skipped: true };
  settling = true;
  try {
    const cutoff = new Date(Date.now() - SETTLE_AFTER_MS).toISOString();
    const pending: { match_id: number; utc_date: string }[] = pendingStmt.all(cutoff);
    if (!pending.length) return { settled: 0, pending: 0 };
    const now = new Date().toISOString();
    const giveUp = new Date(Date.now() - MAX_PENDING_DAYS * 86400000).toISOString();
    let settled = 0;

    // Too old to still be waiting: void (keeps the fetch range short)
    const stale = pending.filter(p => p.utc_date < giveUp);
    for (const p of stale) {
      insertResult.run(p.match_id, 'UNRESOLVED', null, null, 'VOID', now);
      markSettled.run(now, p.match_id);
      settled++;
    }
    const live = pending.filter(p => p.utc_date >= giveUp);
    const fdPending = live.filter(p => p.match_id < AF_ID_OFFSET);
    const afPending = live.filter(p => p.match_id >= AF_ID_OFFSET);
    const results: ResultRow[] = [];

    if (fdPending.length) {
      const day = (d: Date) => d.toISOString().slice(0, 10);
      let from = new Date(new Date(fdPending[0].utc_date).getTime() - 24 * 3600 * 1000);
      const end = new Date(new Date(fdPending[fdPending.length - 1].utc_date).getTime() + 24 * 3600 * 1000);
      while (from <= end) {
        const to = new Date(Math.min(from.getTime() + 9 * 24 * 3600 * 1000, end.getTime()));
        try {
          for (const m of await fetchRange(day(from), day(to))) results.push(fdResult(m));
        } catch (error: any) {
          logger.warn('Settle fetch failed', { from: day(from), to: day(to), message: error.message });
        }
        from = new Date(to.getTime() + 24 * 3600 * 1000);
      }
    }
    if (afPending.length && fetchAf) {
      const ids = afPending.map(p => p.match_id - AF_ID_OFFSET);
      for (let i = 0; i < ids.length; i += 20) {
        try {
          for (const f of await fetchAf(ids.slice(i, i + 20))) results.push(afResult(f));
        } catch (error: any) {
          logger.warn('Settle (API-Football) failed', { message: error.message });
          break;
        }
      }
    }

    const ids = new Set(live.map(p => p.match_id));
    for (const r of results) {
      if (!ids.has(r.id)) continue;
      if (r.status === 'FINISHED') {
        const outcome: Outcome = r.h! > r.a! ? 'H' : r.h! < r.a! ? 'A' : 'D';
        insertResult.run(r.id, r.raw, r.h, r.a, outcome, now);
        markSettled.run(now, r.id);
        settled++;
      } else if (r.status === 'VOID') {
        insertResult.run(r.id, r.raw, null, null, 'VOID', now);
        markSettled.run(now, r.id);
        settled++;
      } else if (r.status === 'RESCHEDULE') {
        unlockStmt.run(now, r.id);
      }
    }
    if (settled) logger.info(`Settled ${settled} predictions (${pending.length - settled} still pending)`);
    return { settled, pending: pending.length - settled };
  } finally {
    settling = false;
  }
}

/* ---------------- metrics ---------------- */

interface SettledRow {
  match_id: number;
  model: string;
  competition_code: string | null;
  competition_name: string | null;
  utc_date: string;
  home_team: string;
  away_team: string;
  p_home: number;
  p_draw: number;
  p_away: number;
  confidence: string | null;
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
  home_goals: number;
  away_goals: number;
  outcome: Outcome;
}

function settledRows(days: number, competition?: string, model?: string): SettledRow[] {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const args: any[] = [since];
  let where = '';
  if (competition) {
    where += ' AND p.competition_code = ?';
    args.push(competition);
  }
  if (model) {
    where += ' AND p.model = ?';
    args.push(model);
  }
  const sql = `
    SELECT p.match_id, p.model, p.competition_code, p.competition_name, p.utc_date,
           p.home_team, p.away_team, p.p_home, p.p_draw, p.p_away, p.confidence,
           p.odds_home, p.odds_draw, p.odds_away,
           r.home_goals, r.away_goals, r.outcome
    FROM predictions p JOIN results r ON r.match_id = p.match_id
    WHERE p.settled = 1 AND r.outcome IN ('H','D','A') AND p.utc_date >= ?${where}
    ORDER BY p.utc_date DESC`;
  return db.prepare(sql).all(...args);
}

export function modelsTracked(): string[] {
  return db.prepare(`SELECT DISTINCT model FROM predictions ORDER BY model`).all().map((r: any) => r.model);
}

function pick(r: { p_home: number; p_draw: number; p_away: number }): Outcome {
  if (r.p_home >= r.p_draw && r.p_home >= r.p_away) return 'H';
  if (r.p_away >= r.p_draw) return 'A';
  return 'D';
}

function probOf(r: { p_home: number; p_draw: number; p_away: number }, o: Outcome) {
  return (o === 'H' ? r.p_home : o === 'D' ? r.p_draw : r.p_away) / 100;
}

/** Generic row shape for metric computation (live tracking and backtests). */
export interface MetricRow {
  p_home: number;
  p_draw: number;
  p_away: number;
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
  outcome: Outcome;
  groupKey: string;
  groupName: string;
  drawAlertEligible?: boolean; // v3 prediction outside La Liga
}

function oddsOf(r: MetricRow, o: Outcome) {
  return o === 'H' ? r.odds_home : o === 'D' ? r.odds_draw : r.odds_away;
}

/** Bookmaker implied probabilities with the overround removed. */
function marketProbs(r: MetricRow): Record<Outcome, number> | null {
  if (!r.odds_home || !r.odds_draw || !r.odds_away) return null;
  const inv = { H: 1 / r.odds_home, D: 1 / r.odds_draw, A: 1 / r.odds_away };
  const sum = inv.H + inv.D + inv.A;
  return { H: inv.H / sum, D: inv.D / sum, A: inv.A / sum };
}

function brier(p: Record<Outcome, number>, actual: Outcome) {
  return (['H', 'D', 'A'] as Outcome[]).reduce((s, o) => s + Math.pow(p[o] - (o === actual ? 1 : 0), 2), 0);
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const pct = (x: number) => Math.round(x * 1000) / 10;

export function computeMetrics(rows: MetricRow[], opts: { edgeThreshold?: number } = {}) {
  const EDGE = opts.edgeThreshold ?? EDGE_THRESHOLD;
  const n = rows.length;
  let hits = 0;
  let brierSum = 0;
  let logLossSum = 0;
  let mHits = 0;
  let mBrier = 0;
  let mLogLoss = 0;
  let mN = 0;
  const outcomes = { H: 0, D: 0, A: 0 };
  const picks = { H: 0, D: 0, A: 0 };
  const bins = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.01].map((hi, i, arr) => ({
    from: i === 0 ? 0 : arr[i - 1],
    to: hi,
    n: 0,
    hits: 0,
    predSum: 0
  }));
  const edgeBets = { bets: 0, wins: 0, profit: 0 };
  const favBets = { bets: 0, wins: 0, profit: 0 };
  // strong picks: the model's pick when it is at least X% sure (and the market's, for comparison)
  const TIERS = [0.5, 0.6, 0.7];
  const tiers = TIERS.map(t => ({ min: t, n: 0, hits: 0, profit: 0, bets: 0, mN: 0, mHits: 0 }));
  // two options (double chance): the two most likely results; "close" = no result reaches 50%
  const two = { n: 0, hits: 0, profit: 0, bets: 0, closeN: 0, closeHits: 0 };
  // draw alerts (v3 rule, priced at the recorded market odds): see DRAW_ALERT in the frontend
  const da = { n: 0, wins: 0, profit: 0 };
  const byGroup = new Map<string, { name: string; n: number; hits: number; brier: number; mBrier: number; mN: number; profit: number; bets: number }>();

  for (const r of rows) {
    const p = { H: r.p_home / 100, D: r.p_draw / 100, A: r.p_away / 100 };
    const pk = pick(r);
    const hit = pk === r.outcome;
    hits += hit ? 1 : 0;
    const b = brier(p, r.outcome);
    brierSum += b;
    logLossSum += -Math.log(Math.max(1e-6, probOf(r, r.outcome)));
    outcomes[r.outcome]++;
    picks[pk]++;

    const bin = bins.find(x => p[pk] >= x.from && p[pk] < x.to);
    if (bin) {
      bin.n++;
      bin.hits += hit ? 1 : 0;
      bin.predSum += p[pk];
    }

    const top2 = (['H', 'D', 'A'] as Outcome[]).sort((x, y) => p[y] - p[x]).slice(0, 2);
    const twoHit = top2.includes(r.outcome);
    two.n++;
    if (twoHit) two.hits++;
    if (p[pk] < 0.5) { two.closeN++; if (twoHit) two.closeHits++; }
    const oa = oddsOf(r, top2[0]), ob = oddsOf(r, top2[1]);
    if (oa && ob) {
      const dc = 1 / (1 / oa + 1 / ob); // double-chance price implied by the 1X2 odds
      two.bets++;
      two.profit += twoHit ? dc - 1 : -1;
    }
    for (const t of tiers) {
      if (p[pk] < t.min) continue;
      t.n++;
      if (hit) t.hits++;
      const o = oddsOf(r, pk);
      if (o) { t.bets++; t.profit += hit ? o - 1 : -1; }
    }

    const g = byGroup.get(r.groupKey) || { name: r.groupName, n: 0, hits: 0, brier: 0, mBrier: 0, mN: 0, profit: 0, bets: 0 };
    g.n++;
    g.hits += hit ? 1 : 0;
    g.brier += b;

    const mp = marketProbs(r);
    if (mp) {
      mN++;
      const mPick = (['H', 'D', 'A'] as Outcome[]).reduce((best, o) => (mp[o] > mp[best] ? o : best), 'H' as Outcome);
      mHits += mPick === r.outcome ? 1 : 0;
      for (const t of tiers) if (mp[mPick] >= t.min) { t.mN++; if (mPick === r.outcome) t.mHits++; }
      if (r.drawAlertEligible && r.odds_draw && p.D >= 0.3) {
        const anchored = mp.D + 0.75 * (p.D - mp.D);
        if (anchored * r.odds_draw - 1 >= 0.02) { da.n++; if (r.outcome === 'D') { da.wins++; da.profit += r.odds_draw - 1; } else da.profit -= 1; }
      }
      const mb = brier(mp, r.outcome);
      mBrier += mb;
      mLogLoss += -Math.log(Math.max(1e-6, mp[r.outcome]));
      g.mBrier += mb;
      g.mN++;

      for (const o of ['H', 'D', 'A'] as Outcome[]) {
        const odds = oddsOf(r, o)!;
        if (p[o] * odds - 1 >= EDGE) {
          edgeBets.bets++;
          g.bets++;
          if (o === r.outcome) {
            edgeBets.wins++;
            edgeBets.profit += odds - 1;
            g.profit += odds - 1;
          } else {
            edgeBets.profit -= 1;
            g.profit -= 1;
          }
        }
      }
      const fo = oddsOf(r, pk)!;
      favBets.bets++;
      if (hit) {
        favBets.wins++;
        favBets.profit += fo - 1;
      } else favBets.profit -= 1;
    }
    byGroup.set(r.groupKey, g);
  }

  return {
    settled: n,
    model: n ? { hitRate: pct(hits / n), brier: r3(brierSum / n), logLoss: r3(logLossSum / n) } : null,
    market: mN ? { n: mN, hitRate: pct(mHits / mN), brier: r3(mBrier / mN), logLoss: r3(mLogLoss / mN) } : null,
    betting: mN
      ? {
          edgeThreshold: EDGE,
          edge: { ...edgeBets, profit: r3(edgeBets.profit), roi: edgeBets.bets ? pct(edgeBets.profit / edgeBets.bets) : 0 },
          favourite: { ...favBets, profit: r3(favBets.profit), roi: favBets.bets ? pct(favBets.profit / favBets.bets) : 0 }
        }
      : null,
    outcomes,
    picks,
    strongPicks: tiers.map(t => ({
      min: Math.round(t.min * 100),
      n: t.n,
      share: n ? pct(t.n / n) : 0, // % of all matches that qualify
      hitRate: t.n ? pct(t.hits / t.n) : null,
      roi: t.bets ? pct(t.profit / t.bets) : null,
      market: t.mN ? { n: t.mN, hitRate: pct(t.mHits / t.mN) } : null
    })),
    drawAlerts: da.n ? { n: da.n, wins: da.wins, hitRate: pct(da.wins / da.n), roi: pct(da.profit / da.n) } : { n: 0, wins: 0, hitRate: null, roi: null },
    twoOptions: {
      n: two.n,
      hitRate: two.n ? pct(two.hits / two.n) : null,
      closeGames: { n: two.closeN, hitRate: two.closeN ? pct(two.closeHits / two.closeN) : null },
      roi: two.bets ? pct(two.profit / two.bets) : null
    },
    calibration: bins
      .filter(x => x.n > 0)
      .map(x => ({ range: `${Math.round(x.from * 100)}–${Math.min(100, Math.round(x.to * 100))}%`, n: x.n, predicted: pct(x.predSum / x.n), actual: pct(x.hits / x.n) })),
    byCompetition: Array.from(byGroup.entries())
      .map(([code, g]) => ({
        code,
        name: g.name,
        n: g.n,
        hitRate: pct(g.hits / g.n),
        brier: r3(g.brier / g.n),
        marketBrier: g.mN ? r3(g.mBrier / g.mN) : null,
        bets: g.bets,
        profit: r3(g.profit)
      }))
      .sort((a, b) => b.n - a.n)
  };
}

export function accuracy(days: number = 90, competition?: string, model?: string) {
  const rows = settledRows(days, competition, model);
  const metrics = computeMetrics(
    rows.map(r => ({
      p_home: r.p_home,
      p_draw: r.p_draw,
      p_away: r.p_away,
      odds_home: r.odds_home,
      odds_draw: r.odds_draw,
      odds_away: r.odds_away,
      outcome: r.outcome,
      groupKey: r.competition_code || '?',
      groupName: r.competition_name || r.competition_code || '?',
      drawAlertEligible: r.model === 'grid-v3' && r.competition_code !== 'PD'
    }))
  );
  return {
    days,
    competition: competition || null,
    modelName: model || null,
    models: modelsTracked(),
    pending: (db.prepare(`SELECT COUNT(*) AS c FROM predictions WHERE settled = 0`).get() as any).c,
    ...metrics
  };
}

export function recentSettled(days: number = 90, competition?: string, limit: number = 100, model?: string) {
  return settledRows(days, competition, model)
    .slice(0, limit)
    .map(r => ({
      matchId: r.match_id,
      date: r.utc_date,
      competition: r.competition_name,
      code: r.competition_code,
      home: r.home_team,
      away: r.away_team,
      score: `${r.home_goals}–${r.away_goals}`,
      outcome: r.outcome,
      pick: pick(r),
      hit: pick(r) === r.outcome,
      p: { H: r.p_home, D: r.p_draw, A: r.p_away },
      odds: r.odds_home ? { H: r.odds_home, D: r.odds_draw, A: r.odds_away } : null,
      confidence: r.confidence,
      model: r.model
    }));
}

export function trackingStatus() {
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM predictions`).get() as any).c;
  const locked = (db.prepare(`SELECT COUNT(*) AS c FROM predictions WHERE locked = 1 AND settled = 0`).get() as any).c;
  const settled = (db.prepare(`SELECT COUNT(*) AS c FROM predictions WHERE settled = 1`).get() as any).c;
  const withOdds = (db.prepare(`SELECT COUNT(*) AS c FROM predictions WHERE odds_home IS NOT NULL`).get() as any).c;
  return { total, open: total - locked - settled, locked, settled, withOdds };
}
