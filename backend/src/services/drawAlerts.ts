/**
 * Draw alerts page: one place for the draw signal.
 *
 * Rule (same as the match page and the Accuracy page):
 *   our draw chance = bookmakers' draw chance + 0.75 × (v3 draw − bookmakers' draw)
 *   alert when v3's draw ≥ 30%, our draw chance × draw price − 1 ≥ 2%, and the league is not La Liga.
 *
 * Three views:
 *   upcoming – open v3 predictions that meet the rule now (recorded market price)
 *   live     – settled v3 predictions that met the rule (recorded price at lock), made live or backfilled
 *   history  – walk-forward backtests, priced at the best early price, with the line movement to close
 */
import { db } from '../db';
import { DIVISION_NAMES } from './pastView';
import { GROUPS, loadGroupMatches } from './history';

const K = 0.75, MIN_EDGE = 0.02, MAX_EDGE = 0.2, MIN_V3 = 30, MAX_STREAK = 0.32;
// MAX_STREAK: no alert when BOTH teams drew 32%+ of their last 20 games — bookmakers already over-price those draws
// (draw-factor test: −3.2 / −2.5 pts in 2024-25 / 2025-26; streak alerts +4.9 vs +7.8 and −2.2 vs +7.3 ROI).
// MAX_EDGE: a 20%+ edge usually means v3 over-rates the draw in a one-sided match (the price moved our way only 55% of
// the time in both 2024-25 and 2025-26, vs 62–67% below 20%; 2024-25 20%+ alerts: 13% draws). Too good to be true.
const EXCLUDED = new Set(['PD']); // La Liga: the signal did not hold there
const r1 = (x: number) => Math.round(x * 10) / 10;

function fair(o: (number | null)[]): number[] | null {
  if (o.some(x => !x || x <= 1)) return null;
  const inv = o.map(x => 1 / (x as number));
  const s = inv.reduce((a, b) => a + b, 0);
  return inv.map(x => x / s);
}

function alertOf(pDraw: number, odds: (number | null)[], price: number | null) {
  if (pDraw < MIN_V3 || !price) return null;
  const f = fair(odds);
  if (!f) return null;
  const mkt = f[1];
  const ours = mkt + K * (pDraw / 100 - mkt);
  const edge = ours * price - 1;
  if (edge < MIN_EDGE || edge > MAX_EDGE) return null;
  return { marketDraw: r1(mkt * 100), ourDraw: r1(ours * 100), price, edge: r1(edge * 100) };
}

let hasBackfilled: boolean | null = null;
function backfilledCol() {
  if (hasBackfilled === null) hasBackfilled = (db.prepare(`PRAGMA table_info(predictions)`).all() as any[]).some(c => c.name === 'backfilled');
  return hasBackfilled;
}

function upcoming() {
  const now = new Date().toISOString();
  const rows = db.prepare(`
    SELECT match_id, competition_code, competition_name, utc_date, home_team, away_team, p_home, p_draw, p_away, odds_home, odds_draw, odds_away, draw_streak
    FROM predictions
    WHERE model = 'grid-v3' AND settled = 0 AND locked = 0 AND utc_date > ? AND odds_draw IS NOT NULL
    ORDER BY utc_date
  `).all(now) as any[];
  const out: any[] = [];
  for (const r of rows) {
    if (EXCLUDED.has(r.competition_code)) continue;
    if (r.draw_streak != null && r.draw_streak >= MAX_STREAK) continue;
    const a = alertOf(r.p_draw, [r.odds_home, r.odds_draw, r.odds_away], r.odds_draw);
    if (!a) continue;
    out.push({ matchId: r.match_id, league: r.competition_name || r.competition_code, date: r.utc_date, home: r.home_team, away: r.away_team, v3: { H: r.p_home, D: r.p_draw, A: r.p_away }, ...a });
  }
  return out;
}

function live() {
  const bf = backfilledCol() ? 'p.backfilled' : '0';
  const rows = db.prepare(`
    SELECT p.match_id, p.competition_code, p.competition_name, p.utc_date, p.home_team, p.away_team,
           p.p_home, p.p_draw, p.p_away, p.odds_home, p.odds_draw, p.odds_away, p.draw_streak, ${bf} AS backfilled,
           r.home_goals, r.away_goals, r.outcome
    FROM predictions p JOIN results r ON r.match_id = p.match_id
    WHERE p.model = 'grid-v3' AND p.settled = 1 AND r.outcome IN ('H','D','A') AND p.odds_draw IS NOT NULL
    ORDER BY p.utc_date DESC
  `).all() as any[];
  const alerts: any[] = [];
  let all = 0, allDraws = 0;
  const sum = { live: { n: 0, wins: 0, profit: 0 }, backfilled: { n: 0, wins: 0, profit: 0 } };
  for (const r of rows) {
    if (EXCLUDED.has(r.competition_code)) continue;
    all++;
    if (r.outcome === 'D') allDraws++;
    if (r.draw_streak != null && r.draw_streak >= MAX_STREAK) continue;
    const a = alertOf(r.p_draw, [r.odds_home, r.odds_draw, r.odds_away], r.odds_draw);
    if (!a) continue;
    const won = r.outcome === 'D';
    const s = r.backfilled ? sum.backfilled : sum.live;
    s.n++;
    if (won) s.wins++;
    s.profit += won ? r.odds_draw - 1 : -1;
    alerts.push({
      matchId: r.match_id, league: r.competition_name || r.competition_code, date: r.utc_date, home: r.home_team, away: r.away_team,
      score: r.home_goals !== null ? `${r.home_goals}-${r.away_goals}` : null, won, backfilled: !!r.backfilled, ...a
    });
  }
  const pack = (s: { n: number; wins: number; profit: number }) => ({ n: s.n, wins: s.wins, hitRate: s.n ? r1((s.wins / s.n) * 100) : null, roi: s.n ? r1((s.profit / s.n) * 100) : null });
  const both = { n: sum.live.n + sum.backfilled.n, wins: sum.live.wins + sum.backfilled.wins, profit: sum.live.profit + sum.backfilled.profit };
  return {
    live: pack(sum.live), backfilled: pack(sum.backfilled), total: pack(both),
    baseline: { matches: all, drawRate: all ? r1((allDraws / all) * 100) : null },
    alerts: alerts.slice(0, 300)
  };
}

const bucketOut = (b: { range: string; n: number; wins: number; profit: number; moved: number; movedN: number }) => ({
  range: b.range, n: b.n, hitRate: b.n ? r1((b.wins / b.n) * 100) : null, roi: b.n ? r1((b.profit / b.n) * 100) : null,
  lineMovedOurWay: b.movedN ? r1((b.moved / b.movedN) * 100) : null
});

const SEASON_LABEL: Record<string, string> = { '2324': '2023-24', '2425': '2024-25', '2526': '2025-26', '2627': '2026-27' };

/** Both teams' draw share over their last 20 matches before each match (key division|date|home|away). */
let teamDrawCache: { at: number; map: Map<string, number> } | null = null;
function teamDrawMap() {
  if (teamDrawCache && Date.now() - teamDrawCache.at < 6 * 3600_000) return teamDrawCache.map;
  const map = new Map<string, number>();
  for (const group of Object.keys(GROUPS)) {
    const recent = new Map<string, number[]>();
    for (const m of loadGroupMatches(group)) {
      const rh = (recent.get(m.home) || []).slice(-20), ra = (recent.get(m.away) || []).slice(-20);
      if (rh.length >= 10 && ra.length >= 10)
        map.set(`${m.division}|${m.date}|${m.home}|${m.away}`, Math.min(rh.reduce((s, x) => s + x, 0) / rh.length, ra.reduce((s, x) => s + x, 0) / ra.length));
      const d = m.hg === m.ag ? 1 : 0;
      for (const t of [m.home, m.away]) { const l = recent.get(t) || recent.set(t, []).get(t)!; l.push(d); if (l.length > 20) l.shift(); }
    }
  }
  teamDrawCache = { at: Date.now(), map };
  return map;
}

function history() {
  const tdm = teamDrawMap();
  const seasons = (db.prepare(`SELECT DISTINCT season FROM backtest_runs WHERE model = 'grid-v3' ORDER BY season`).all() as any[]).map(r => r.season);
  const out: any[] = [];
  for (const season of seasons) {
    const rows = db.prepare(`
      SELECT b.division, b.date, b.home, b.away, b.outcome, b.p_draw, b.odds_home AS ch, b.odds_draw AS cd, b.odds_away AS ca,
             b.early_h AS eh, b.early_d AS ed, b.early_a AS ea, h.max_d
      FROM backtest_predictions b
      JOIN backtest_runs r ON r.id = b.run_id AND r.season = ? AND r.model = 'grid-v3'
      LEFT JOIN history_matches h ON h.division = b.division AND h.date = b.date AND h.home = b.home AND h.away = b.away
    `).all(season) as any[];
    let matches = 0, draws = 0, n = 0, wins = 0, profit = 0, moved = 0, movedN = 0;
    const byDiv = new Map<string, { n: number; wins: number; profit: number }>();
    // buckets: how big the edge was, and how likely the bookmakers thought a draw was (low = one-sided match)
    const EDGE_B = [[2, 10], [10, 20], [20, 1000]], MKT_B = [[0, 22], [22, 26], [26, 100]];
    const byEdge = EDGE_B.map(([lo, hi]) => ({ range: hi > 100 ? `${lo}%+` : `${lo}–${hi}%`, lo, hi, n: 0, wins: 0, profit: 0, moved: 0, movedN: 0 }));
    // "draw streak" teams: the draw-factor test showed bookmakers OVER-price draws when both teams drew a lot lately
    const byStreak = [
      { range: 'both teams drew 32%+ of last 20', lo: 0.32, hi: 2, n: 0, wins: 0, profit: 0, moved: 0, movedN: 0 },
      { range: 'other alerts', lo: -1, hi: 0.32, n: 0, wins: 0, profit: 0, moved: 0, movedN: 0 }
    ];
    const byMkt = MKT_B.map(([lo, hi]) => ({ range: hi > 99 ? `${lo}%+` : `under ${hi}%`.replace('under 26%', '22–26%'), lo, hi, n: 0, wins: 0, profit: 0, moved: 0, movedN: 0 }));
    for (const r of rows) {
      if (r.division.startsWith('SP')) continue;
      matches++;
      if (r.outcome === 'D') draws++;
      const a = alertOf(r.p_draw, [r.eh, r.ed, r.ea], r.max_d);
      if (!a) continue;
      const tdv = tdm.get(`${r.division}|${r.date}|${r.home}|${r.away}`);
      if (tdv !== undefined && tdv >= MAX_STREAK) continue; // same rule as live
      const won = r.outcome === 'D';
      n++;
      if (won) wins++;
      profit += won ? r.max_d - 1 : -1;
      const d = byDiv.get(r.division) || byDiv.set(r.division, { n: 0, wins: 0, profit: 0 }).get(r.division)!;
      d.n++;
      if (won) d.wins++;
      d.profit += won ? r.max_d - 1 : -1;
      const ef = fair([r.eh, r.ed, r.ea]), cf = fair([r.ch, r.cd, r.ca]);
      const mv = ef && cf ? (cf[1] > ef[1] ? 1 : 0) : -1;
      if (mv >= 0) { movedN++; moved += mv; }
      const td = tdm.get(`${r.division}|${r.date}|${r.home}|${r.away}`);
      const streak = td === undefined ? byStreak[1] : byStreak.find(x => td >= x.lo && td < x.hi);
      for (const b of [byEdge.find(x => a.edge >= x.lo && a.edge < x.hi), byMkt.find(x => a.marketDraw >= x.lo && a.marketDraw < x.hi), streak]) {
        if (!b) continue;
        b.n++;
        if (won) b.wins++;
        b.profit += won ? r.max_d - 1 : -1;
        if (mv >= 0) { b.movedN++; b.moved += mv; }
      }
    }
    if (!n) continue;
    out.push({
      season, label: SEASON_LABEL[season] || season, matches, drawRate: matches ? r1((draws / matches) * 100) : null,
      alerts: n, wins, hitRate: r1((wins / n) * 100), roi: r1((profit / n) * 100),
      lineMovedOurWay: movedN ? r1((moved / movedN) * 100) : null,
      byEdge: byEdge.map(bucketOut),
      byMarketDraw: byMkt.map(bucketOut),
      byDrawStreak: byStreak.map(bucketOut),
      byLeague: [...byDiv.entries()].map(([division, d]) => ({ division, league: DIVISION_NAMES[division] || division, n: d.n, hitRate: r1((d.wins / d.n) * 100), roi: r1((d.profit / d.n) * 100) })).sort((a, b) => b.n - a.n)
    });
  }
  return out;
}

export function drawAlertsReport() {
  return { rule: { k: K, minEdge: MIN_EDGE * 100, maxEdge: MAX_EDGE * 100, maxStreak: MAX_STREAK * 100, minV3Draw: MIN_V3, excluded: [...EXCLUDED] }, upcoming: upcoming(), ...live(), history: history() };
}

/* ------------------------------------------------------------------ */
/* Do team draw habits or head-to-head draws predict draws the bookmakers miss?                              */
/* ------------------------------------------------------------------ */
/*
 * For every league match of a season with closing odds: the bookmakers' draw chance (margin removed) vs what
 * happened, split by facts known before kick-off:
 *   teamDraw20   – average of both teams' draw share over their last 20 matches (each needs ≥ 10)
 *   excessPrev   – average of both teams' "draws above the bookmakers" (actual − expected) over the PREVIOUS season
 *   excessRecent – same over each team's last 30 matches (any season)
 *   h2h          – draw share of the last 10 meetings (≥ 3 needed)
 * If a group draws more (or less) than the bookmakers said, in both seasons, the factor carries information.
 */

type Acc = { n: number; draws: number; mkt: number };
const newAcc = (): Acc => ({ n: 0, draws: 0, mkt: 0 });
const accOut = (label: string, a: Acc) => {
  const act = a.n ? a.draws / a.n : 0, exp = a.n ? a.mkt / a.n : 0;
  const se = a.n ? Math.sqrt((exp * (1 - exp)) / a.n) : 0;
  return { group: label, n: a.n, actualDraw: r1(act * 100), bookmakersDraw: r1(exp * 100), diff: r1((act - exp) * 100), noise: r1(se * 100) };
};
const prevSeason = (s: string) => `${String(Number(s.slice(0, 2)) - 1).padStart(2, '0')}${s.slice(0, 2)}`;

export function drawFactorTest(season: string) {
  const buckets = {
    teamDraw20: { labels: ['under 20%', '20–27%', '27–34%', '34%+'], cut: (x: number) => (x < 0.2 ? 0 : x < 0.27 ? 1 : x < 0.34 ? 2 : 3) },
    excessPrev: { labels: ['drew 4+ pts less than expected', 'about as expected', 'drew 4+ pts more than expected'], cut: (x: number) => (x < -0.04 ? 0 : x <= 0.04 ? 1 : 2) },
    excessRecent: { labels: ['drew 4+ pts less than expected', 'about as expected', 'drew 4+ pts more than expected'], cut: (x: number) => (x < -0.04 ? 0 : x <= 0.04 ? 1 : 2) },
    h2h: { labels: ['no draws in last meetings', 'under 30% draws', '30–50% draws', '50%+ draws'], cut: (x: number) => (x === 0 ? 0 : x < 0.3 ? 1 : x < 0.5 ? 2 : 3) }
  };
  const acc: Record<string, Acc[]> = Object.fromEntries(Object.entries(buckets).map(([k, b]) => [k, b.labels.map(newAcc)]));
  const unknown: Record<string, Acc> = Object.fromEntries(Object.keys(buckets).map(k => [k, newAcc()]));
  const all = newAcc();
  // both-teams-extreme views: both low draw teams / both high
  const both = { bothLow: newAcc(), bothHigh: newAcc() };
  const prev = prevSeason(season);

  for (const group of Object.keys(GROUPS)) {
    const matches = loadGroupMatches(group);
    const recent = new Map<string, { d: number; ex: number }[]>(); // per team, newest last
    const seasonEx = new Map<string, { n: number; ex: number }>(); // `${team}|${season}`
    const h2h = new Map<string, number[]>();
    for (const m of matches) {
      const f = fair([m.close_h ?? m.odds_h, m.close_d ?? m.odds_d, m.close_a ?? m.odds_a]);
      const isD = m.hg === m.ag ? 1 : 0;
      const key = [m.home, m.away].sort().join('|');
      if (m.season === season && f && m.division === GROUPS[group].divisions[0]) {
        const mk = f[1];
        const add = (a: Acc) => { a.n++; a.draws += isD; a.mkt += mk; };
        add(all);
        const rh = recent.get(m.home) || [], ra = recent.get(m.away) || [];
        // teamDraw20
        const l20h = rh.slice(-20), l20a = ra.slice(-20);
        if (l20h.length >= 10 && l20a.length >= 10) {
          const v = (l20h.reduce((s, x) => s + x.d, 0) / l20h.length + l20a.reduce((s, x) => s + x.d, 0) / l20a.length) / 2;
          add(acc.teamDraw20[buckets.teamDraw20.cut(v)]);
          const th = l20h.reduce((s, x) => s + x.d, 0) / l20h.length, ta = l20a.reduce((s, x) => s + x.d, 0) / l20a.length;
          if (th < 0.2 && ta < 0.2) add(both.bothLow);
          if (th >= 0.32 && ta >= 0.32) add(both.bothHigh);
        } else add(unknown.teamDraw20);
        // excessPrev
        const ph = seasonEx.get(`${m.home}|${prev}`), pa = seasonEx.get(`${m.away}|${prev}`);
        if (ph && pa && ph.n >= 10 && pa.n >= 10) add(acc.excessPrev[buckets.excessPrev.cut((ph.ex / ph.n + pa.ex / pa.n) / 2)]);
        else add(unknown.excessPrev);
        // excessRecent
        const e30h = rh.slice(-30).filter(x => !Number.isNaN(x.ex)), e30a = ra.slice(-30).filter(x => !Number.isNaN(x.ex));
        if (e30h.length >= 15 && e30a.length >= 15)
          add(acc.excessRecent[buckets.excessRecent.cut((e30h.reduce((s, x) => s + x.ex, 0) / e30h.length + e30a.reduce((s, x) => s + x.ex, 0) / e30a.length) / 2)]);
        else add(unknown.excessRecent);
        // h2h
        const hh = (h2h.get(key) || []).slice(-10);
        if (hh.length >= 3) add(acc.h2h[buckets.h2h.cut(hh.reduce((s, x) => s + x, 0) / hh.length)]);
        else add(unknown.h2h);
      }
      // update state (after using it)
      const ex = f ? isD - f[1] : NaN;
      for (const t of [m.home, m.away]) {
        const l = recent.get(t) || recent.set(t, []).get(t)!;
        l.push({ d: isD, ex });
        if (l.length > 40) l.shift();
        if (f) {
          const k = `${t}|${m.season}`;
          const s = seasonEx.get(k) || seasonEx.set(k, { n: 0, ex: 0 }).get(k)!;
          s.n++;
          s.ex += ex;
        }
      }
      (h2h.get(key) || h2h.set(key, []).get(key)!).push(isD);
    }
  }
  const out: any = { season, note: 'top divisions, closing prices; diff = real draw % − bookmakers\' draw %; noise ≈ one standard error', all: accOut('all matches', all) };
  for (const [k, b] of Object.entries(buckets)) out[k] = [...b.labels.map((l, i) => accOut(l, acc[k][i])), accOut('not enough history', unknown[k])];
  out.bothTeams = [accOut('both teams draw under 20% lately', both.bothLow), accOut('both teams draw 32%+ lately', both.bothHigh)];
  return out;
}
