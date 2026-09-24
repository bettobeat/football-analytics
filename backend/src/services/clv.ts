/**
 * Live closing-line value (CLV) — "are we beating the market?", measured the way professionals do.
 *
 * For every top-league fixture:
 *   OPEN   when kick-off is ≤ 48 h away: store the bookmaker price (Pinnacle if offered, else Bet365, else
 *          the first book) AND v3's prediction at that moment (no lineups yet — what you could bet on).
 *   CLOSE  in the last 35 min before kick-off: store the price again (refreshed every tick until kick-off).
 *   RESULT once the match is finished.
 *
 * A "value selection" is an outcome where v3's probability × the open price − 1 ≥ edge.
 *   CLV       = open price × fair closing probability − 1   (> 0: we got a better price than the close)
 *   moved our way = the fair closing probability of that outcome is higher than at open
 * A model that keeps a positive average CLV has a real edge, whatever the short-run results say.
 *
 * Prices come from API-Football /odds (part of the Pro plan), so The Odds API credits stay for the site.
 */
import { db } from '../db';
import logger from '../utils/logger';
import { afGet, afBudgetLeft, afConfigured, AF_LEAGUES } from './apiFootball';
import { predictV3ByNames } from './gridModel';

type O = 'H' | 'D' | 'A';
const OPEN_WINDOW_MS = 48 * 3600 * 1000;
const CLOSE_WINDOW_MS = 35 * 60 * 1000;
const BOOK_PREFERENCE = ['Pinnacle', 'Bet365', '1xBet', 'Unibet', 'Bwin', 'William Hill'];

db.exec(`
  CREATE TABLE IF NOT EXISTS clv_tracking (
    fixture_id  INTEGER PRIMARY KEY,
    grp TEXT NOT NULL, division TEXT, fd_home TEXT NOT NULL, fd_away TEXT NOT NULL,
    home_name TEXT, away_name TEXT, kickoff TEXT NOT NULL,
    open_at TEXT, open_book TEXT, open_h REAL, open_d REAL, open_a REAL,
    v3_h REAL, v3_d REAL, v3_a REAL,
    close_at TEXT, close_book TEXT, close_h REAL, close_d REAL, close_a REAL,
    outcome TEXT
  );
`);

async function fetchOdds(fixtureId: number): Promise<{ book: string; h: number; d: number; a: number } | null> {
  const json = await afGet('/odds', { fixture: fixtureId, bet: 1 }); // bet 1 = Match Winner
  const books: any[] = json.response?.[0]?.bookmakers || [];
  if (!books.length) return null;
  const ranked = [...books].sort((x, y) => {
    const ix = BOOK_PREFERENCE.indexOf(x.name), iy = BOOK_PREFERENCE.indexOf(y.name);
    return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy);
  });
  for (const b of ranked) {
    const bet = (b.bets || []).find((t: any) => t.id === 1 || /match winner/i.test(t.name || ''));
    if (!bet) continue;
    const odd = (v: string) => parseFloat((bet.values || []).find((x: any) => x.value === v)?.odd);
    const h = odd('Home'), d = odd('Draw'), a = odd('Away');
    if ([h, d, a].every(x => Number.isFinite(x) && x > 1)) return { book: b.name, h, d, a };
  }
  return null;
}

let running = false;
let last: { at: string; opened: number; closed: number; settled: number; note: string } | null = null;

export async function clvTick() {
  if (!afConfigured() || running) return last;
  running = true;
  let opened = 0, closed = 0, settled = 0;
  const notes: string[] = [];
  try {
    const now = Date.now();
    const top = AF_LEAGUES.filter(l => l.top).map(l => l.id).join(',');
    const base = `
      SELECT f.fixture_id, f.grp, f.division, f.kickoff, f.date, f.home_name, f.away_name, th.fd_name AS fh, ta.fd_name AS fa
      FROM af_fixtures f
      JOIN af_teams th ON th.grp = f.grp AND th.team_id = f.home_id
      JOIN af_teams ta ON ta.grp = f.grp AND ta.team_id = f.away_id
      WHERE f.league_id IN (${top}) AND th.fd_name IS NOT NULL AND ta.fd_name IS NOT NULL`;

    // OPEN: within 48 h, not yet tracked
    const toOpen = db.prepare(`${base} AND f.kickoff > ? AND f.kickoff <= ? AND f.fixture_id NOT IN (SELECT fixture_id FROM clv_tracking) ORDER BY f.kickoff`)
      .all(new Date(now + CLOSE_WINDOW_MS).toISOString(), new Date(now + OPEN_WINDOW_MS).toISOString()) as any[];
    const ins = db.prepare(`
      INSERT OR IGNORE INTO clv_tracking (fixture_id, grp, division, fd_home, fd_away, home_name, away_name, kickoff, open_at, open_book, open_h, open_d, open_a, v3_h, v3_d, v3_a)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const f of toOpen) {
      if (afBudgetLeft() < 1) { notes.push('budget reserve'); break; }
      const p = predictV3ByNames(f.grp, f.fh, f.fa, f.date);
      if (!p) continue;
      let o: Awaited<ReturnType<typeof fetchOdds>> = null;
      try { o = await fetchOdds(f.fixture_id); } catch (e: any) { notes.push(`odds ${f.fixture_id}: ${e.message}`); continue; }
      if (!o) continue; // no prices yet — try again next tick
      ins.run(f.fixture_id, f.grp, f.division, f.fh, f.fa, f.home_name, f.away_name, f.kickoff, new Date().toISOString(), o.book, o.h, o.d, o.a, p.home / 100, p.draw / 100, p.away / 100);
      opened++;
    }

    // CLOSE: last 35 min before kick-off — refreshed every tick, so the last one is within ~10 min of kick-off
    const toClose = db.prepare(`SELECT fixture_id FROM clv_tracking WHERE kickoff > ? AND kickoff <= ?`)
      .all(new Date(now).toISOString(), new Date(now + CLOSE_WINDOW_MS).toISOString()) as any[];
    const upd = db.prepare(`UPDATE clv_tracking SET close_at = ?, close_book = ?, close_h = ?, close_d = ?, close_a = ? WHERE fixture_id = ?`);
    for (const f of toClose) {
      if (afBudgetLeft() < 1) break;
      try {
        const o = await fetchOdds(f.fixture_id);
        if (o) { upd.run(new Date().toISOString(), o.book, o.h, o.d, o.a, f.fixture_id); closed++; }
      } catch (e: any) { notes.push(`close ${f.fixture_id}: ${e.message}`); }
    }

    // RESULT
    const r = db.prepare(`
      UPDATE clv_tracking SET outcome = (
        SELECT CASE WHEN f.hg > f.ag THEN 'H' WHEN f.hg < f.ag THEN 'A' ELSE 'D' END
        FROM af_fixtures f WHERE f.fixture_id = clv_tracking.fixture_id AND f.status IN ('FT','AET','PEN') AND f.hg IS NOT NULL)
      WHERE outcome IS NULL AND kickoff < ?`).run(new Date(now - 2 * 3600 * 1000).toISOString());
    settled = Number(r.changes) || 0;
  } catch (e: any) {
    notes.push(e.message);
    logger.warn(`CLV tick failed: ${e.message}`);
  } finally {
    running = false;
    last = { at: new Date().toISOString(), opened, closed, settled, note: notes.slice(0, 5).join(' · ') };
  }
  return last;
}

export function startClvScheduler() {
  if (!afConfigured()) return;
  setTimeout(() => { clvTick().catch(() => undefined); setInterval(() => { clvTick().catch(() => undefined); }, 10 * 60 * 1000); }, 5 * 60 * 1000);
}

/* ------------------------------------------------------------------ */
/* Report                                                               */
/* ------------------------------------------------------------------ */

const fair = (h: number, d: number, a: number) => { const s = 1 / h + 1 / d + 1 / a; return [1 / h / s, 1 / d / s, 1 / a / s]; };
const IDX: Record<O, number> = { H: 0, D: 1, A: 2 };
const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const brier = (p: number[], o: O) => p.reduce((s, x, i) => s + (x - (i === IDX[o] ? 1 : 0)) ** 2, 0);

export function clvReport(days = 90) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = db.prepare(`SELECT * FROM clv_tracking WHERE kickoff >= ? AND open_h IS NOT NULL ORDER BY kickoff DESC`).all(since) as any[];
  const withClose = rows.filter(r => r.close_h);
  const selections = (edge: number) => {
    let bets = 0, clvSum = 0, clvPos = 0, moved = 0, settledBets = 0, wins = 0, profit = 0;
    for (const r of withClose) {
      const model = [r.v3_h, r.v3_d, r.v3_a];
      const open = [r.open_h, r.open_d, r.open_a];
      const openFair = fair(r.open_h, r.open_d, r.open_a);
      const closeFair = fair(r.close_h, r.close_d, r.close_a);
      for (let i = 0; i < 3; i++) {
        if (model[i] * open[i] - 1 < edge) continue;
        bets++;
        const clv = open[i] * closeFair[i] - 1;
        clvSum += clv;
        if (clv > 0) clvPos++;
        if (closeFair[i] > openFair[i]) moved++;
        if (r.outcome) { settledBets++; const won = IDX[r.outcome as O] === i; if (won) wins++; profit += won ? open[i] - 1 : -1; }
      }
    }
    return {
      edge, bets,
      avgClv: bets ? r1((clvSum / bets) * 100) : null,
      clvPositive: bets ? r1((clvPos / bets) * 100) : null,
      lineMovedOurWay: bets ? r1((moved / bets) * 100) : null,
      settled: settledBets, wins, roi: settledBets ? r1((profit / settledBets) * 100) : null
    };
  };
  const settledRows = withClose.filter(r => r.outcome);
  const mean = (f: (r: any) => number) => (settledRows.length ? r3(settledRows.reduce((s, r) => s + f(r), 0) / settledRows.length) : null);
  // Would a blend of v3 and the open price have been closer to the closing price? (info test, no results needed)
  const toClose = (w: number) => {
    if (!withClose.length) return null;
    let tv = 0;
    for (const r of withClose) {
      const o = fair(r.open_h, r.open_d, r.open_a), c = fair(r.close_h, r.close_d, r.close_a), m = [r.v3_h, r.v3_d, r.v3_a];
      const b = o.map((x, i) => (1 - w) * x + w * m[i]);
      tv += b.reduce((s, x, i) => s + Math.abs(x - c[i]), 0) / 2;
    }
    return r3(tv / withClose.length);
  };
  return {
    days,
    tracked: rows.length,
    withClose: withClose.length,
    settled: settledRows.length,
    lastTick: last,
    // lower = closer to where the market ended up
    distanceToClose: { openPrice: toClose(0), openPlus25pctV3: toClose(0.25), openPlus50pctV3: toClose(0.5) },
    brier: settledRows.length
      ? {
          v3AtOpen: mean(r => brier([r.v3_h, r.v3_d, r.v3_a], r.outcome)),
          marketOpen: mean(r => brier(fair(r.open_h, r.open_d, r.open_a), r.outcome)),
          marketClose: mean(r => brier(fair(r.close_h, r.close_d, r.close_a), r.outcome))
        }
      : null,
    value: [0.02, 0.05, 0.1].map(selections),
    recent: withClose.slice(0, 25).map(r => {
      const model = [r.v3_h, r.v3_d, r.v3_a], open = [r.open_h, r.open_d, r.open_a], closeFair = fair(r.close_h, r.close_d, r.close_a);
      const evs = model.map((p, i) => p * open[i] - 1);
      const i = evs.indexOf(Math.max(...evs));
      return {
        kickoff: r.kickoff, match: `${r.home_name} – ${r.away_name}`, book: r.open_book,
        selection: (['H', 'D', 'A'] as O[])[i], v3: Math.round(model[i] * 100), openOdds: open[i],
        closeOdds: [r.close_h, r.close_d, r.close_a][i], edge: r1(evs[i] * 100), clv: r1((open[i] * closeFair[i] - 1) * 100),
        outcome: r.outcome
      };
    })
  };
}
