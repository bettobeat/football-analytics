/**
 * Weekly data check: are the numbers we show right?
 *
 * For the top scorers of our main leagues (Football-Data.org's official scorer lists) it opens each player's page
 * (API-Football) and compares his league goals and appearances, then runs sanity checks on every page it opened:
 * season totals equal the sum of their rows, ratings between 3 and 10, goals not above 4 per appearance, age 15–45,
 * the header club is not a national team, and an "out" status has a start date. A player the lookup cannot find is
 * reported too.
 *
 * Runs once a week (Monday morning UTC) and on demand; the report is stored and emailed to ADMIN_EMAILS when email
 * is set up. About 80 players; the first run of a week costs a few hundred API-Football calls, later ones are cached.
 */
import { db } from '../db';
import logger from '../utils/logger';
import footballDataAPI from './footballDataAPI';
import { findPlayer, playerPage, FD_TO_AF } from './playerPage';
import { afRemaining } from './apiFootball';
import { emailEnabled, sendEmail } from './email';

db.exec(`CREATE TABLE IF NOT EXISTS data_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, json TEXT NOT NULL)`);

const LEAGUES = ['PL', 'PD', 'SA', 'BL1', 'FL1', 'DED', 'PPL', 'ELC'];
const PER_LEAGUE = 10;

export interface AuditIssue { kind: 'mismatch' | 'not-found' | 'sanity' | 'error'; league?: string; player?: string; detail: string }

let running = false;

export async function runDataAudit(notify = true) {
  if (running) throw new Error('A data check is already running');
  if (afRemaining() < 3000) throw new Error('Not enough API-Football budget left today');
  running = true;
  const t0 = Date.now();
  const issues: AuditIssue[] = [];
  let checked = 0, matched = 0;
  try {
    for (const code of LEAGUES) {
      let scorers: any[] = [];
      try {
        scorers = ((await footballDataAPI.getScorers(code, 20)) as any)?.scorers || [];
      } catch (e: any) {
        issues.push({ kind: 'error', league: code, detail: `scorer list failed: ${e.message}` });
        continue;
      }
      for (const s of scorers.slice(0, PER_LEAGUE)) {
        const name = s.player?.name;
        if (!name || !s.team?.id) continue;
        checked++;
        let id: number | null = null;
        try {
          id = await findPlayer(name, s.team.id, code, s.team.name);
        } catch { /* reported below */ }
        if (!id) {
          issues.push({ kind: 'not-found', league: code, player: name, detail: `no player page (${s.team.shortName || s.team.name})` });
          continue;
        }
        let p: any;
        try {
          p = await playerPage(id, true);
        } catch (e: any) {
          issues.push({ kind: 'error', league: code, player: name, detail: `page failed: ${e.message}` });
          continue;
        }
        const season = p.seasons?.[0];
        const rows = (season?.rows || []).filter((r: any) => r.league?.id === FD_TO_AF[code]);
        const goals = rows.reduce((a: number, r: any) => a + (r.goals || 0), 0);
        const apps = rows.reduce((a: number, r: any) => a + (r.apps || 0), 0);
        if (!rows.length) issues.push({ kind: 'mismatch', league: code, player: name, detail: `no league row on his page (official: ${s.goals} goals)` });
        else if (goals !== (s.goals ?? 0)) issues.push({ kind: 'mismatch', league: code, player: name, detail: `goals: official list ${s.goals}, player page ${goals}` });
        else if (s.playedMatches != null && Math.abs(apps - s.playedMatches) > 1) issues.push({ kind: 'mismatch', league: code, player: name, detail: `appearances: official list ${s.playedMatches}, player page ${apps}` });
        else matched++;

        // sanity checks on the whole page
        for (const se of p.seasons || []) {
          const sum = (se.rows || []).reduce((a: number, r: any) => a + (r.goals || 0), 0);
          if (sum !== se.totals?.goals) issues.push({ kind: 'sanity', league: code, player: name, detail: `${se.label}: total ${se.totals?.goals} ≠ sum of rows ${sum}` });
          for (const r of se.rows || []) {
            if (r.rating != null && (r.rating < 3 || r.rating > 10)) issues.push({ kind: 'sanity', league: code, player: name, detail: `${se.label} ${r.league?.name}: rating ${r.rating}` });
            if (r.apps > 0 && r.goals > r.apps * 4) issues.push({ kind: 'sanity', league: code, player: name, detail: `${se.label} ${r.league?.name}: ${r.goals} goals in ${r.apps} games` });
          }
        }
        const age = p.player?.age;
        if (age != null && (age < 15 || age > 45)) issues.push({ kind: 'sanity', league: code, player: name, detail: `age ${age}` });
        if (p.team && p.player?.nationality && p.team.name === p.player.nationality) issues.push({ kind: 'sanity', league: code, player: name, detail: `header shows the national team (${p.team.name})` });
        if (p.status?.out && !p.status.since) issues.push({ kind: 'sanity', league: code, player: name, detail: 'marked out with no start date' });
      }
    }
  } finally {
    running = false;
  }
  const report = { at: new Date().toISOString(), ms: Date.now() - t0, leagues: LEAGUES.join(', '), checked, matched, issues };
  db.prepare(`INSERT INTO data_audit (at, json) VALUES (?, ?)`).run(report.at, JSON.stringify(report));
  logger.info(`Data check: ${matched}/${checked} matched, ${issues.length} issues`);
  if (notify) await emailReport(report).catch(e => logger.warn(`data check email: ${e.message}`));
  return report;
}

export function lastDataAudit() {
  const r: any = db.prepare(`SELECT json FROM data_audit ORDER BY id DESC LIMIT 1`).get();
  return r ? JSON.parse(r.json) : null;
}

async function emailReport(report: any) {
  const to = (process.env.ADMIN_EMAILS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!emailEnabled || !to.length) return;
  const esc = (x: string) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const lines = report.issues.map((i: AuditIssue) => `${i.league || ''} · ${i.player || ''} — ${i.detail}`);
  const subject = report.issues.length
    ? `Bet To Beat data check: ${report.issues.length} thing${report.issues.length === 1 ? '' : 's'} to look at`
    : 'Bet To Beat data check: all good';
  const text = `${report.matched} of ${report.checked} top scorers match the official lists (${report.leagues}).\n\n${lines.join('\n') || 'Nothing to report.'}`;
  const html = `<p>${report.matched} of ${report.checked} top scorers match the official lists (${esc(report.leagues)}).</p>${
    lines.length ? `<ul>${lines.map((l: string) => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p>Nothing to report.</p>'
  }<p style="color:#888;font-size:12px">Differences between the two data providers usually disappear within a few days. A player page that is still wrong after a week is worth a look.</p>`;
  for (const addr of to) await sendEmail(addr, subject, html, text);
}

/** Every hour: run when the last check is 7 days old and it is Monday 05:00–11:59 UTC (or none has ever run). */
export function startDataAuditScheduler() {
  const tick = () => {
    const last = lastDataAudit();
    const now = new Date();
    const due = !last || Date.now() - new Date(last.at).getTime() > 6.5 * 86400000;
    const window = now.getUTCDay() === 1 && now.getUTCHours() >= 5 && now.getUTCHours() < 12;
    if (due && (window || !last) && !running) runDataAudit().catch(e => logger.warn(`data check: ${e.message}`));
  };
  setTimeout(tick, 10 * 60 * 1000); // not right at start-up
  setInterval(tick, 60 * 60 * 1000);
}
