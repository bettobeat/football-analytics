/**
 * Historical results from football-data.co.uk (free CSVs, includes bookmaker odds).
 * Downloaded into SQLite and used to fit the Dixon-Coles model and to backtest.
 */
import { db } from '../db';
import logger from '../utils/logger';

const BASE = 'https://www.football-data.co.uk/mmz4281';

/** football-data.co.uk division codes grouped by country ("model group"). */
export const GROUPS: Record<string, { divisions: string[]; competitions: string[] }> = {
  E: { divisions: ['E0', 'E1'], competitions: ['PL', 'ELC'] },
  SP: { divisions: ['SP1', 'SP2'], competitions: ['PD'] },
  I: { divisions: ['I1', 'I2'], competitions: ['SA'] },
  D: { divisions: ['D1', 'D2'], competitions: ['BL1'] },
  F: { divisions: ['F1', 'F2'], competitions: ['FL1'] },
  N: { divisions: ['N1'], competitions: ['DED'] },
  P: { divisions: ['P1'], competitions: ['PPL'] },
  // Extra leagues served from API-Football (codes AF<league id>); history from the same football-data.co.uk CSVs
  B: { divisions: ['B1'], competitions: ['AF144'] }, // Belgium — Jupiler Pro League
  T: { divisions: ['T1'], competitions: ['AF203'] }, // Turkey — Süper Lig
  SC: { divisions: ['SC0', 'SC1'], competitions: ['AF179'] }, // Scotland — Premiership (+ Championship for promoted teams)
  G: { divisions: ['G1'], competitions: ['AF197'] } // Greece — Super League 1
};

export function groupForCompetition(code: string): string | null {
  for (const [g, cfg] of Object.entries(GROUPS)) if (cfg.competitions.includes(code)) return g;
  return null;
}

/** Seasons to load: current + previous N. Season "2526" = 2025/26. */
export function seasonCodes(count: number = 3): string[] {
  const now = new Date();
  // Season rolls over in July
  const startYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const y = startYear - i;
    codes.push(`${String(y).slice(2)}${String(y + 1).slice(2)}`);
  }
  return codes;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS history_matches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    division    TEXT NOT NULL,
    season      TEXT NOT NULL,
    date        TEXT NOT NULL,       -- YYYY-MM-DD
    home        TEXT NOT NULL,       -- football-data.co.uk team name
    away        TEXT NOT NULL,
    hg          INTEGER NOT NULL,
    ag          INTEGER NOT NULL,
    odds_h      REAL, odds_d REAL, odds_a REAL,          -- best available pre-match (Pinnacle > B365 > Avg)
    close_h     REAL, close_d REAL, close_a REAL,        -- closing odds when present
    UNIQUE (division, season, date, home, away)
  );
  CREATE INDEX IF NOT EXISTS idx_history_div_date ON history_matches(division, date);

  CREATE TABLE IF NOT EXISTS history_sync (
    division    TEXT NOT NULL,
    season      TEXT NOT NULL,
    rows        INTEGER NOT NULL,
    synced_at   TEXT NOT NULL,
    PRIMARY KEY (division, season)
  );

  CREATE TABLE IF NOT EXISTS team_map (
    grp         TEXT NOT NULL,       -- model group (E, SP, ...)
    team_id     INTEGER NOT NULL,    -- Football-Data.org team id
    fd_name     TEXT NOT NULL,       -- football-data.co.uk name
    api_name    TEXT NOT NULL,
    score       REAL NOT NULL,
    PRIMARY KEY (grp, team_id)
  );
`);

// Schema upgrade: best price across bookmakers (Max*) and market average (Avg*), early and closing
{
  const cols = (db.prepare(`PRAGMA table_info(history_matches)`).all() as any[]).map(c => c.name);
  for (const c of ['max_h', 'max_d', 'max_a', 'avg_h', 'avg_d', 'avg_a', 'maxc_h', 'maxc_d', 'maxc_a'])
    if (!cols.includes(c)) db.exec(`ALTER TABLE history_matches ADD COLUMN ${c} REAL`);
}

/* ---------------- CSV ---------------- */

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return [];
  const split = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const header = split(lines[0]);
  return lines.slice(1).map(l => {
    const cells = split(l);
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ''));
    return row;
  });
}

function parseDate(s: string): string | null {
  // dd/mm/yyyy or dd/mm/yy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

const num = (s?: string) => {
  const v = parseFloat(s || '');
  return Number.isFinite(v) && v > 1 ? v : null;
};

const insertMatch = db.prepare(`
  INSERT OR REPLACE INTO history_matches
    (division, season, date, home, away, hg, ag, odds_h, odds_d, odds_a, close_h, close_d, close_a,
     max_h, max_d, max_a, avg_h, avg_d, avg_a, maxc_h, maxc_d, maxc_a)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const upsertSync = db.prepare(
  `INSERT OR REPLACE INTO history_sync (division, season, rows, synced_at) VALUES (?, ?, ?, ?)`
);

async function fetchCSV(division: string, season: string): Promise<string> {
  const url = `${BASE}/${season}/${division}.csv`;
  const res = await fetch(url, { headers: { 'User-Agent': 'BetToBeat/1.0' } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

/** Download and store one division/season. Returns rows stored. */
export async function syncDivision(division: string, season: string) {
  const text = await fetchCSV(division, season);
  const rows = parseCSV(text);
  let stored = 0;
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      const date = parseDate(r.Date);
      const hg = parseInt(r.FTHG, 10);
      const ag = parseInt(r.FTAG, 10);
      if (!date || !r.HomeTeam || !r.AwayTeam || Number.isNaN(hg) || Number.isNaN(ag)) continue;
      // Pre-match odds preference: Pinnacle (PSH), Bet365 (B365H), market average (AvgH)
      const oh = num(r.PSH) ?? num(r.B365H) ?? num(r.AvgH);
      const od = num(r.PSD) ?? num(r.B365D) ?? num(r.AvgD);
      const oa = num(r.PSA) ?? num(r.B365A) ?? num(r.AvgA);
      // Closing odds: Pinnacle closing (PSCH), else Bet365 closing, else market avg closing
      const ch = num(r.PSCH) ?? num(r.B365CH) ?? num(r.AvgCH);
      const cd = num(r.PSCD) ?? num(r.B365CD) ?? num(r.AvgCD);
      const ca = num(r.PSCA) ?? num(r.B365CA) ?? num(r.AvgCA);
      // Best price across bookmakers and market average (early), best price at close
      insertMatch.run(
        division, season, date, r.HomeTeam, r.AwayTeam, hg, ag, oh, od, oa, ch, cd, ca,
        num(r.MaxH) ?? num(r.BbMxH), num(r.MaxD) ?? num(r.BbMxD), num(r.MaxA) ?? num(r.BbMxA),
        num(r.AvgH) ?? num(r.BbAvH), num(r.AvgD) ?? num(r.BbAvD), num(r.AvgA) ?? num(r.BbAvA),
        num(r.MaxCH), num(r.MaxCD), num(r.MaxCA)
      );
      stored++;
    }
    upsertSync.run(division, season, stored, new Date().toISOString());
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return stored;
}

/** Sync every division for the given seasons. Current season is always re-downloaded. */
export async function syncAll(seasons: string[] = seasonCodes(3), force: boolean = false) {
  const current = seasons[0];
  const summary: { division: string; season: string; rows: number; skipped?: boolean; error?: string }[] = [];
  for (const cfg of Object.values(GROUPS)) {
    for (const division of cfg.divisions) {
      for (const season of seasons) {
        const existing: any = db.prepare(`SELECT rows, synced_at FROM history_sync WHERE division = ? AND season = ?`).get(division, season);
        const stale = !existing || season === current || force;
        if (!stale) {
          summary.push({ division, season, rows: existing.rows, skipped: true });
          continue;
        }
        try {
          const rows = await syncDivision(division, season);
          summary.push({ division, season, rows });
          console.log(`  📥 ${division} ${season}: ${rows} matches`);
        } catch (error: any) {
          summary.push({ division, season, rows: 0, error: error.message });
          console.log(`  ⚠️  ${division} ${season}: ${error.message}`);
        }
      }
    }
  }
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM history_matches`).get() as any).c;
  logger.info(`History sync done: ${total} matches in database`);
  return { total, summary };
}

export interface HistoryMatch {
  division: string;
  season: string;
  date: string;
  home: string;
  away: string;
  hg: number;
  ag: number;
  odds_h: number | null;
  odds_d: number | null;
  odds_a: number | null;
  close_h: number | null;
  close_d: number | null;
  close_a: number | null;
}

export function loadGroupMatches(group: string, before?: string): HistoryMatch[] {
  const divs = GROUPS[group]?.divisions || [];
  if (!divs.length) return [];
  const placeholders = divs.map(() => '?').join(',');
  const sql = `SELECT * FROM history_matches WHERE division IN (${placeholders}) ${before ? 'AND date < ?' : ''} ORDER BY date`;
  return before ? db.prepare(sql).all(...divs, before) : db.prepare(sql).all(...divs);
}

export function historyStatus() {
  const perDiv = db
    .prepare(`SELECT division, season, rows, synced_at FROM history_sync ORDER BY division, season DESC`)
    .all();
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM history_matches`).get() as any).c;
  const mapped = (db.prepare(`SELECT COUNT(*) AS c FROM team_map`).get() as any).c;
  return { total, mapped, divisions: perDiv };
}

/* ---------------- team name matching ---------------- */

export const ALIASES: Record<string, string> = {
  // football-data.co.uk name (lowercased) → hint matching Football-Data.org name/shortName
  'man united': 'manchester united',
  'man city': 'manchester city',
  "nott'm forest": 'nottingham forest',
  'wolves': 'wolverhampton',
  'sheffield united': 'sheffield utd',
  'sheffield weds': 'sheffield wednesday',
  'qpr': 'queens park rangers',
  'ath madrid': 'atletico madrid',
  'ath bilbao': 'athletic club',
  'espanol': 'espanyol',
  'sociedad': 'real sociedad',
  'betis': 'real betis',
  'vallecano': 'rayo vallecano',
  'celta': 'celta vigo',
  'alaves': 'alaves',
  'valladolid': 'real valladolid',
  'milan': 'ac milan',
  'inter': 'internazionale',
  'verona': 'hellas verona',
  'roma': 'as roma',
  'lazio': 'ss lazio',
  'bayern munich': 'bayern munchen',
  'ein frankfurt': 'eintracht frankfurt',
  "m'gladbach": 'monchengladbach',
  'werder bremen': 'werder bremen',
  'fc koln': 'koln',
  'hamburg': 'hamburger sv',
  'mainz': 'mainz 05',
  'st pauli': 'st. pauli',
  'leverkusen': 'bayer leverkusen',
  'dortmund': 'borussia dortmund',
  'paris sg': 'paris saint-germain',
  'paris fc': 'paris fc',
  'st etienne': 'saint-etienne',
  'rennes': 'stade rennais',
  'brest': 'stade brestois',
  'lyon': 'olympique lyonnais',
  'sp lisbon': 'sporting cp',
  'sp braga': 'braga',
  'guimaraes': 'vitoria sc',
  'estrela': 'estrela da amadora',
  'nacional': 'nacional',
  'avs': 'avs',
  'psv eindhoven': 'psv',
  'go ahead eagles': 'go ahead eagles',
  'nijmegen': 'nec nijmegen',
  'zwolle': 'pec zwolle',
  'for sittard': 'fortuna sittard',
  'waalwijk': 'rkc waalwijk',
  'sparta rotterdam': 'sparta rotterdam',
  // Belgium / Turkey / Scotland / Greece (football-data.co.uk → API-Football spelling)
  'club brugge': 'club brugge kv',
  'st truiden': 'sint-truiden',
  'st. gilloise': 'union st. gilloise',
  'waregem': 'zulte waregem',
  'oud-heverlee leuven': 'oh leuven',
  'fenerbahce': 'fenerbahce',
  'buyuksehyr': 'istanbul basaksehir',
  'ad. demirspor': 'adana demirspor',
  'celtic': 'celtic',
  'rangers': 'rangers',
  'st mirren': 'st. mirren',
  'st johnstone': 'st johnstone',
  'olympiakos': 'olympiakos piraeus',
  'paok': 'paok',
  'aek': 'aek athens fc'
};

// Club-name filler that carries no identity. Distinguishing words such as "Real",
// "Atletico", "Sporting", "Borussia" are deliberately kept.
const STOP = new Set(['fc', 'cf', 'afc', 'sc', 'ac', 'ss', 'ssc', 'us', 'ud', 'cd', 'sd', 'rcd', 'rc', 'ca', 'bc', 'sv', 'tsg', 'vfb', 'vfl', 'fsv', 'bsc', 'sad', 'ev', 'club', 'clube', 'de', 'la', 'calcio', 'futebol', 'football', 'stade', 'olympique', 'associazione', 'sportiva', '1', '04', '05', '09', '29', '65', '1846', '1899', '1901', '1904', '1907', '1909', '1910', '1913']);

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return normalizeName(s)
    .split(' ')
    .filter(t => t && !STOP.has(t));
}

export function similarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  let inter = 0;
  ta.forEach(t => {
    if (tb.has(t)) inter++;
  });
  const jacc = ta.size && tb.size ? inter / (ta.size + tb.size - inter) : 0;
  const shorter = Math.min(na.length, nb.length);
  const contains = shorter >= 4 && (na.includes(nb) || nb.includes(na)) ? 0.6 : 0;
  // prefix match on first meaningful token (e.g. "brighton" vs "brighton hove")
  const fa = [...ta][0];
  const fb = [...tb][0];
  const prefix = fa && fb && (fa.startsWith(fb) || fb.startsWith(fa)) ? 0.5 : 0;
  return Math.max(jacc, contains, prefix);
}

export interface ApiTeam {
  id: number;
  name: string;
  shortName?: string;
  tla?: string;
}

/**
 * Map Football-Data.org teams (from standings) to football-data.co.uk names for a group.
 * Returns the mapping and the API teams that could not be matched.
 */
export function buildTeamMap(group: string, apiTeams: ApiTeam[]) {
  const divs = GROUPS[group]?.divisions || [];
  if (!divs.length) return { mapped: 0, unmatched: apiTeams.map(t => t.name) };
  const placeholders = divs.map(() => '?').join(',');
  const fdNames: string[] = db
    .prepare(`SELECT DISTINCT home AS n FROM history_matches WHERE division IN (${placeholders})`)
    .all(...divs)
    .map((r: any) => r.n);

  const upsert = db.prepare(
    `INSERT OR REPLACE INTO team_map (grp, team_id, fd_name, api_name, score) VALUES (?, ?, ?, ?, ?)`
  );
  db.prepare(`DELETE FROM team_map WHERE grp = ?`).run(group);

  // Score every (api team, fd name) pair, then assign greedily by best score so
  // that a strong match always beats a weaker one for the same name.
  const pairs: { t: ApiTeam; fd: string; score: number }[] = [];
  for (const t of apiTeams) {
    const candidates = [t.name, t.shortName || '', t.tla || ''].filter(Boolean);
    for (const fd of fdNames) {
      const alias = ALIASES[fd.toLowerCase()];
      let score = 0;
      for (const c of candidates) {
        score = Math.max(score, similarity(fd, c));
        if (alias) score = Math.max(score, similarity(alias, c));
      }
      if (score >= 0.5) pairs.push({ t, fd, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const assignedTeam = new Set<number>();
  const assignedName = new Set<string>();
  const bestSeen = new Map<number, { fd: string; score: number }>();
  let mapped = 0;
  for (const p of pairs) {
    if (!bestSeen.has(p.t.id)) bestSeen.set(p.t.id, { fd: p.fd, score: p.score });
    if (assignedTeam.has(p.t.id) || assignedName.has(p.fd)) continue;
    upsert.run(group, p.t.id, p.fd, p.t.name, p.score);
    assignedTeam.add(p.t.id);
    assignedName.add(p.fd);
    mapped++;
  }
  const unmatched = apiTeams
    .filter(t => !assignedTeam.has(t.id))
    .map(t => {
      const b = bestSeen.get(t.id);
      return `${t.name}${b ? ` (best: ${b.fd} ${b.score.toFixed(2)}, taken)` : ''}`;
    });
  if (unmatched.length) logger.warn(`Team map ${group}: ${unmatched.length} unmatched`, { unmatched });
  return { mapped, unmatched };
}

export function fdNameFor(group: string, teamId: number): string | null {
  const row: any = db.prepare(`SELECT fd_name FROM team_map WHERE grp = ? AND team_id = ?`).get(group, teamId);
  return row ? row.fd_name : null;
}

export function teamMapStatus() {
  return db.prepare(`SELECT grp, team_id, fd_name, api_name, score FROM team_map ORDER BY grp, api_name`).all();
}
