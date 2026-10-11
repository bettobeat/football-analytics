/**
 * Basketball result checks and corrections (Oct 2026).
 *
 * Why: API-Basketball sometimes sends a final score with home and away swapped (Wizards–Pistons pre-season,
 * 10 Oct 2026: the provider had 108–114, the real result was 114–108 to Washington in overtime). We showed the
 * provider's numbers as they were. Now:
 *  1. NBA (not pre-season): every final is compared with balldontlie; a different result is corrected automatically.
 *  2. Every league: the players' points in the box score are added up per team. When they match the score the
 *     other way round, or the quarters don't add up to the total, the game is put "under review": no Right/Wrong
 *     badge and left out of the record until it is settled. The admin gets an email.
 *  3. The admin can correct any result by hand (swap, set the score, or confirm the provider) on the game page or
 *     in Users → Results to check. A correction survives every later provider update; "undo" removes it.
 * Missing overtime column (provider sends quarters 1–4 only): overtime = total − quarters, shown on the page.
 */
import { db } from '../db';
import logger from '../utils/logger';
import { sendMail } from './email';
import { isPreseason } from './bbModel';

db.exec(`
  CREATE TABLE IF NOT EXISTS bb_result_fix (
    game_id INTEGER PRIMARY KEY, hs INTEGER NOT NULL, as_ INTEGER NOT NULL, quarters TEXT, source TEXT NOT NULL,
    note TEXT, by_user TEXT, at TEXT NOT NULL, provider_hs INTEGER, provider_as INTEGER
  );
  CREATE TABLE IF NOT EXISTS bb_result_check (
    game_id INTEGER PRIMARY KEY, issue TEXT NOT NULL, detail TEXT, found_at TEXT NOT NULL,
    resolved_at TEXT, resolution TEXT, by_user TEXT
  );
`);

type Q = { home: (number | null)[]; away: (number | null)[] } | null;
const parseQ = (s: string | null): Q => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const sum4 = (a: (number | null)[]) => a.slice(0, 4).reduce<number>((s, v) => s + (v ?? 0), 0);

/** Quarters with the overtime filled in when the provider left it out (total − four quarters, both sides ≥ 0). */
export function fillOvertime(q: Q, hs: number | null, as_: number | null): Q {
  if (!q || hs == null || as_ == null || q.home.length < 4 || q.away.length < 4) return q;
  if (q.home.slice(0, 4).some(v => v == null) || q.away.slice(0, 4).some(v => v == null)) return q;
  if (q.home[4] != null || q.away[4] != null) return q;
  const oh = hs - sum4(q.home), oa = as_ - sum4(q.away);
  if (oh === 0 && oa === 0) return q;
  if (oh < 0 || oa < 0 || oh > 40 || oa > 40) return q;
  return { home: [...q.home.slice(0, 4), oh], away: [...q.away.slice(0, 4), oa] };
}

/** Re-apply our corrections after a provider update (they always win until undone). */
export function applyResultFixes() {
  db.exec(`UPDATE bb_games SET
      hs = (SELECT f.hs FROM bb_result_fix f WHERE f.game_id = bb_games.game_id),
      as_ = (SELECT f.as_ FROM bb_result_fix f WHERE f.game_id = bb_games.game_id),
      quarters = COALESCE((SELECT f.quarters FROM bb_result_fix f WHERE f.game_id = bb_games.game_id), quarters)
    WHERE game_id IN (SELECT game_id FROM bb_result_fix)`);
}

export const openCheck = (gameId: number) =>
  (db.prepare('SELECT issue, detail, found_at FROM bb_result_check WHERE game_id = ? AND resolved_at IS NULL').get(gameId) as any) || null;
export const resultFix = (gameId: number) =>
  (db.prepare('SELECT hs, as_, source, note, by_user, at, provider_hs, provider_as FROM bb_result_fix WHERE game_id = ?').get(gameId) as any) || null;

function saveFix(g: any, hs: number, as_: number, quarters: Q, source: string, note: string | null, by: string | null) {
  const prev = resultFix(g.game_id);
  db.prepare(`INSERT OR REPLACE INTO bb_result_fix (game_id, hs, as_, quarters, source, note, by_user, at, provider_hs, provider_as) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(g.game_id, hs, as_, quarters ? JSON.stringify(quarters) : null, source, note, by, new Date().toISOString(),
      prev ? prev.provider_hs : g.hs, prev ? prev.provider_as : g.as_);
  db.prepare('UPDATE bb_games SET hs = ?, as_ = ?, quarters = COALESCE(?, quarters) WHERE game_id = ?')
    .run(hs, as_, quarters ? JSON.stringify(quarters) : null, g.game_id);
}
function resolve(gameId: number, resolution: string, by: string | null) {
  db.prepare('UPDATE bb_result_check SET resolved_at = ?, resolution = ?, by_user = ? WHERE game_id = ? AND resolved_at IS NULL')
    .run(new Date().toISOString(), resolution, by, gameId);
}
const swapQ = (q: Q): Q => (q ? { home: q.away, away: q.home } : null);

/* ---------- admin actions ---------- */

export class ResultError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export function adminResult(gameId: number, action: string, body: any, by: string) {
  const g: any = db.prepare('SELECT * FROM bb_games WHERE game_id = ?').get(gameId);
  if (!g) throw new ResultError(404, 'Game not found.');
  if (action === 'undo') {
    const f = resultFix(gameId);
    if (!f) throw new ResultError(400, 'Nothing to undo.');
    db.prepare('DELETE FROM bb_result_fix WHERE game_id = ?').run(gameId);
    if (f.provider_hs != null) db.prepare('UPDATE bb_games SET hs = ?, as_ = ? WHERE game_id = ?').run(f.provider_hs, f.provider_as, gameId);
    return { undone: true };
  }
  if (g.hs == null || g.as_ == null) throw new ResultError(400, 'This game has no score yet.');
  if (action === 'confirm') { resolve(gameId, 'provider confirmed', by); return { confirmed: true }; }
  if (action === 'swap') {
    saveFix(g, g.as_, g.hs, swapQ(parseQ(g.quarters)), 'manual', body?.note ? String(body.note).slice(0, 200) : 'home and away swapped', by);
    resolve(gameId, 'swapped', by);
    return { hs: g.as_, as_: g.hs };
  }
  if (action === 'set') {
    const hs = parseInt(String(body?.hs), 10), as_ = parseInt(String(body?.as_), 10);
    if (!Number.isFinite(hs) || !Number.isFinite(as_) || hs < 0 || as_ < 0 || hs > 250 || as_ > 250) throw new ResultError(400, 'Enter both scores (0–250).');
    if (hs === as_) throw new ResultError(400, 'A basketball game can’t end in a tie.');
    // quarters: swap them too when the new score is the old one the other way round
    const q = hs === g.as_ && as_ === g.hs ? swapQ(parseQ(g.quarters)) : null;
    saveFix(g, hs, as_, q, 'manual', body?.note ? String(body.note).slice(0, 200) : null, by);
    resolve(gameId, `set ${hs}-${as_}`, by);
    return { hs, as_ };
  }
  throw new ResultError(400, 'Unknown action.');
}

export function resultChecksList() {
  const open = db.prepare(`SELECT c.game_id, c.issue, c.detail, c.found_at, g.code, g.kickoff, g.home_name, g.away_name, g.hs, g.as_
    FROM bb_result_check c JOIN bb_games g ON g.game_id = c.game_id WHERE c.resolved_at IS NULL ORDER BY c.found_at DESC`).all();
  const fixes = db.prepare(`SELECT f.game_id, f.hs, f.as_, f.source, f.note, f.by_user, f.at, f.provider_hs, f.provider_as, g.code, g.kickoff, g.home_name, g.away_name
    FROM bb_result_fix f JOIN bb_games g ON g.game_id = f.game_id ORDER BY f.at DESC LIMIT 30`).all();
  return { open, fixes };
}

/* ---------- automatic checks ---------- */

function bdlFinal(g: any): { hs: number; as_: number } | null {
  try {
    const team = (name: string) => (db.prepare('SELECT id FROM bdl_teams WHERE full_name = ? OR name = ?').get(name, String(name).split(' ').pop()) as any)?.id ?? null;
    const h = team(g.home_name), a = team(g.away_name);
    if (!h || !a) return null;
    // the same two teams in one window of ±36 h: the game closest in time (playoff games are 2+ days apart)
    const t = Date.parse(g.kickoff);
    const near = (db.prepare(`SELECT hs, as_, status, date FROM bdl_games WHERE home_id = ? AND away_id = ? AND hs IS NOT NULL AND date BETWEEN ? AND ?`)
      .all(h, a, new Date(t - 36 * 3600000).toISOString(), new Date(t + 36 * 3600000).toISOString()) as any[]);
    if (near.length !== 1) return null; // none, or ambiguous
    const r = near[0];
    if (!r || String(r.status || '').toLowerCase() !== 'final') return null;
    return { hs: r.hs, as_: r.as_ };
  } catch { return null; }
}

let alerted = new Set<number>();
export async function checkResults(days = 10) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const games = db.prepare(`SELECT * FROM bb_games WHERE status IN ('FT','AOT') AND hs IS NOT NULL AND as_ IS NOT NULL AND kickoff >= ?`).all(since) as any[];
  const fresh: string[] = [];
  let fixedAuto = 0;
  for (const g of games) {
    const fix = resultFix(g.game_id);
    if (fix?.source === 'manual') continue; // the admin decided
    const done: any = db.prepare('SELECT resolved_at FROM bb_result_check WHERE game_id = ?').get(g.game_id);
    // 1) NBA regular season / playoffs: balldontlie is the second source
    if (g.code === 'NBA' && !isPreseason({ code: g.code, kickoff: g.kickoff })) {
      const b = bdlFinal(g);
      if (b && (b.hs !== g.hs || b.as_ !== g.as_)) {
        const swapped = b.hs === g.as_ && b.as_ === g.hs;
        saveFix(g, b.hs, b.as_, swapped ? swapQ(parseQ(g.quarters)) : null, 'balldontlie', `provider had ${g.hs}-${g.as_}`, null);
        resolve(g.game_id, 'corrected from balldontlie', null);
        fixedAuto++;
        logger.warn(`bb result: ${g.home_name}–${g.away_name} corrected from balldontlie ${g.hs}-${g.as_} → ${b.hs}-${b.as_}`);
        fresh.push(`${g.home_name} – ${g.away_name} (${g.kickoff.slice(0, 10)}): corrected automatically from ${g.hs}-${g.as_} to ${b.hs}-${b.as_} (balldontlie).`);
        continue;
      }
      if (b) continue; // both sources agree
    }
    if (done) continue; // already reviewed (or open)
    // 2) box score: players' points per team the other way round
    const pts = (team: number) => (db.prepare('SELECT SUM(pts) AS s, COUNT(*) AS n FROM bb_player_stats WHERE game_id = ? AND team_id = ?').get(g.game_id, team) as any);
    const ph = pts(g.home_id), pa = pts(g.away_id);
    let issue: string | null = null, detail: string | null = null;
    if (ph?.n && pa?.n && ph.s === g.as_ && pa.s === g.hs && g.hs !== g.as_) {
      issue = 'swapped?';
      detail = `Score ${g.hs}-${g.as_}, but the players' points add up to ${ph.s}-${pa.s}: home and away may be swapped.`;
    }
    // 3) quarters that can't add up to the total (more than a missing overtime explains)
    const q = parseQ(g.quarters);
    if (!issue && q && q.home.slice(0, 4).every(v => v != null) && q.away.slice(0, 4).every(v => v != null)) {
      const oh = g.hs - sum4(q.home) - (q.home[4] ?? 0), oa = g.as_ - sum4(q.away) - (q.away[4] ?? 0);
      if (oh < 0 || oa < 0 || (q.home[4] != null && (oh !== 0 || oa !== 0))) {
        issue = 'quarters';
        detail = `Quarters add up to ${sum4(q.home) + (q.home[4] ?? 0)}-${sum4(q.away) + (q.away[4] ?? 0)}, the final score is ${g.hs}-${g.as_}.`;
      }
    }
    if (issue) {
      db.prepare('INSERT OR IGNORE INTO bb_result_check (game_id, issue, detail, found_at) VALUES (?, ?, ?, ?)').run(g.game_id, issue, detail, new Date().toISOString());
      if (!alerted.has(g.game_id)) { alerted.add(g.game_id); fresh.push(`${g.home_name} – ${g.away_name} (${g.kickoff.slice(0, 10)}): ${detail} It is left out of the record until you check it.`); }
    }
  }
  if (fresh.length) await alert(fresh);
  return { checked: games.length, fixedAuto, open: (db.prepare('SELECT COUNT(*) AS n FROM bb_result_check WHERE resolved_at IS NULL').get() as any).n };
}

async function alert(lines: string[]) {
  const to = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean)[0];
  if (!to) return;
  try {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    await sendMail({
      to, subject: `SportLikely: ${lines.length} basketball result${lines.length === 1 ? '' : 's'} to check`,
      text: `${lines.join('\n')}\n\nUsers → Overview → Results to check, or the game page.`,
      html: `<ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul><p>Users → Overview → Results to check, or the game page.</p>`
    });
  } catch { /* email off */ }
}
