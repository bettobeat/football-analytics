/**
 * fix164: team-link check. For the matches of the last 7 and the next 7 days in every sport (football incl. cups,
 * basketball, NFL, college), every team link is resolved exactly as the site builds it — the resolver only, never an
 * API-Football call — and the failures are listed for /api/admin/link-check and the Admin overview
 * ("Broken team links: N"). Runs once a day after the 04:00 jobs.
 */
import { db } from '../db';
import logger from '../utils/logger';
import { AF_OFFSET } from './afMatches';
import { groupForCompetition } from './history';
import { resolveAfTeamId } from './teamPage';
import { nflTeamRow } from './nflSite';
import { yieldLoop } from './perf';

export interface LinkFailure { sport: 'football' | 'basketball' | 'american-football'; teamId: number; name: string; competition: string; link: string; matchId: number; date: string }
export interface LinkCheck { at: string; ms: number; checked: Record<string, number>; failures: LinkFailure[] }

let last: LinkCheck | null = null;
export const lastLinkCheck = () => last;

/** The football team link the site makes (components: lib/teamLink.ts): a domestic league's code, never a cup's, + the full name. */
export const footballTeamLink = (id: number, name: string, code: string | null) =>
  `/team/${id}?${new URLSearchParams({ ...(code && groupForCompetition(code) ? { c: code } : {}), n: name }).toString()}`;

export async function runLinkCheck(): Promise<LinkCheck> {
  let n = 0;
  const pause = async () => { if (++n % 50 === 0) await yieldLoop(); }; // fix158 rule: no long block
  const t0 = Date.now();
  const from = new Date(Date.now() - 7 * 86400000).toISOString(), to = new Date(Date.now() + 7 * 86400000).toISOString();
  const failures: LinkFailure[] = [];
  const checked: Record<string, number> = { football: 0, basketball: 0, 'american-football': 0 };
  const seen = new Set<string>();

  // football: every saved prediction (Football-Data.org and API-Football matches, leagues and cups)
  const fb = db.prepare(`SELECT DISTINCT match_id, competition_code AS code, competition_name AS comp, utc_date AS date, home_team_id AS hid, home_team AS hn, away_team_id AS aid, away_team AS an
    FROM predictions WHERE utc_date >= ? AND utc_date < ?`).all(from, to) as any[];
  for (const m of fb) for (const [id, name] of [[m.hid, m.hn], [m.aid, m.an]] as [number, string][]) {
    if (!id || seen.has(`f|${id}|${m.code}`)) continue;
    seen.add(`f|${id}|${m.code}`);
    checked.football++;
    await pause();
    if (id >= AF_OFFSET) continue; // API-Football ids open the page directly
    const code = m.code && groupForCompetition(m.code) ? m.code : undefined;
    if (!resolveAfTeamId(id, code, name || undefined)) failures.push({ sport: 'football', teamId: id, name: name || '?', competition: m.comp || m.code || '?', link: footballTeamLink(id, name || '', m.code), matchId: m.match_id, date: m.date });
  }

  // basketball: a team page exists for every team that has a game
  try {
    const bb = db.prepare(`SELECT game_id, code, kickoff, home_id, home_name, away_id, away_name FROM bb_games WHERE kickoff >= ? AND kickoff < ?`).all(from, to) as any[];
    const has = db.prepare(`SELECT 1 FROM bb_games WHERE home_id = ? OR away_id = ? LIMIT 1`);
    for (const g of bb) for (const [id, name] of [[g.home_id, g.home_name], [g.away_id, g.away_name]] as [number, string][]) {
      if (!id || seen.has(`b|${id}`)) continue;
      seen.add(`b|${id}`);
      checked.basketball++;
      await pause();
      if (!has.get(id, id)) failures.push({ sport: 'basketball', teamId: id, name: name || '?', competition: g.code, link: `/basketball/team/${id}`, matchId: g.game_id, date: g.kickoff });
    }
  } catch { /* no basketball tables */ }

  // NFL + college: the team row (nfl_teams, or the latest game)
  try {
    const nfl = db.prepare(`SELECT game_id, league, kickoff, home_id, home_name, away_id, away_name FROM nfl_games WHERE kickoff >= ? AND kickoff < ?`).all(from, to) as any[];
    for (const g of nfl) for (const [id, name] of [[g.home_id, g.home_name], [g.away_id, g.away_name]] as [number, string][]) {
      if (!id || seen.has(`n|${id}`)) continue;
      seen.add(`n|${id}`);
      checked['american-football']++;
      await pause();
      if (!nflTeamRow(id)) failures.push({ sport: 'american-football', teamId: id, name: name || '?', competition: g.league === 2 ? 'College football' : 'NFL', link: `/american-football/team/${id}`, matchId: g.game_id, date: g.kickoff });
    }
  } catch { /* no NFL tables */ }

  last = { at: new Date().toISOString(), ms: Date.now() - t0, checked, failures };
  logger.info(`link check: ${failures.length} broken team links (football ${checked.football}, basketball ${checked.basketball}, NFL / college ${checked['american-football']} teams, ${last.ms} ms)`);
  return last;
}

/** Once a day, after the 04:00 UTC jobs (called hourly; runs at 05:xx UTC or when it has not run yet since boot). */
export async function linkCheckTick() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (last && last.at.slice(0, 10) === today) return;
  if (now.getUTCHours() < 5 && last) return;
  try { await runLinkCheck(); } catch (e: any) { logger.warn(`link check: ${e.message}`); }
}
