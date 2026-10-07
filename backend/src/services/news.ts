/**
 * Football news: headlines from public RSS feeds of major outlets, filed per league.
 * We show the headline, the outlet, the time and a link to the original article (no copying of articles or photos).
 *
 * Oct 2026: every league has its own news.
 *  - General feeds (BBC, Guardian, ESPN, Sky) plus league feeds (BBC / Guardian league sections, Sky Premier League).
 *  - Each story is filed under a league when it comes from that league's feed, names the league ("La Liga",
 *    "Eredivisie"…) or names one of the league's current teams (team names from our API-Football fixtures).
 *  - Stories are stored (news_items) for 21 days, so a quieter league still has a page of news.
 *  - All feeds refresh every 15 minutes in the background; a feed that fails is skipped (and retried later).
 * Home page = every story combined; league page = that league's stories.
 */
import logger from '../utils/logger';
import { db } from '../db';

type Feed = { source: string; url: string; league?: string };

const UA = { 'User-Agent': 'SportLikely/1.0 (+https://sportlikely.com)' };
const BBC = (path: string) => `https://feeds.bbci.co.uk/sport/football/${path}/rss.xml`;
const GDN = (tag: string) => `https://www.theguardian.com/football/${tag}/rss`;

const FEEDS: Feed[] = [
  // general football news (every league; stories are filed by the names they mention)
  { source: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
  { source: 'The Guardian', url: 'https://www.theguardian.com/football/rss' },
  { source: 'ESPN', url: 'https://www.espn.com/espn/rss/soccer/news' },
  { source: 'Sky Sports', url: 'https://www.skysports.com/rss/11095' },
  { source: 'BBC Sport', url: BBC('european') },
  { source: 'The Guardian', url: GDN('europeanfootball') },
  // league sections
  { source: 'BBC Sport', url: BBC('premier-league'), league: 'PL' },
  { source: 'The Guardian', url: GDN('premierleague'), league: 'PL' },
  { source: 'Sky Sports', url: 'https://www.skysports.com/rss/11661', league: 'PL' },
  { source: 'BBC Sport', url: BBC('championship'), league: 'ELC' },
  { source: 'The Guardian', url: GDN('championship'), league: 'ELC' },
  { source: 'BBC Sport', url: BBC('league-one'), league: 'AF41' },
  { source: 'The Guardian', url: GDN('leagueonefootball'), league: 'AF41' },
  { source: 'The Guardian', url: GDN('laligafootball'), league: 'PD' },
  { source: 'The Guardian', url: GDN('serieafootball'), league: 'SA' },
  { source: 'The Guardian', url: GDN('bundesligafootball'), league: 'BL1' },
  { source: 'The Guardian', url: GDN('ligue1football'), league: 'FL1' },
  { source: 'BBC Sport', url: BBC('scottish'), league: 'AF179' },
  { source: 'The Guardian', url: GDN('scottish-premiership'), league: 'AF179' },
  { source: 'The Guardian', url: GDN('mls'), league: 'AF253' },
  { source: 'BBC Sport', url: BBC('champions-league'), league: 'CL' },
  { source: 'The Guardian', url: GDN('championsleague'), league: 'CL' },
  { source: 'BBC Sport', url: BBC('europa-league'), league: 'AF3' },
  { source: 'The Guardian', url: GDN('uefa-europa-league'), league: 'AF3' },
  { source: 'The Guardian', url: GDN('europa-conference-league'), league: 'AF848' }
];

/**
 * Our leagues: name, API-Football league id (its current teams tag stories) and the phrases that name the league.
 * Phrases are matched case-sensitively on whole words; `not` drops a phrase hit preceded by those words
 * ("Austrian Bundesliga" is not the Bundesliga).
 */
export const NEWS_LEAGUES: { code: string; name: string; af?: number; phrases: string[]; not?: string[] }[] = [
  { code: 'PL', name: 'Premier League', af: 39, phrases: ['Premier League'], not: ['Scottish', 'Russian', 'Ukrainian', 'Egyptian', 'Israeli', 'Women’s', "Women's", 'Welsh', 'Northern Irish', 'Irish', 'Indian', 'Saudi'] },
  { code: 'ELC', name: 'Championship', af: 40, phrases: ['EFL Championship'] },
  { code: 'AF41', name: 'League One', af: 41, phrases: ['League One'] },
  { code: 'PD', name: 'La Liga', af: 140, phrases: ['La Liga', 'LaLiga'] },
  { code: 'AF141', name: 'Segunda División', af: 141, phrases: ['Segunda División', 'Segunda Division', 'LaLiga Hypermotion'] },
  { code: 'SA', name: 'Serie A', af: 135, phrases: ['Serie A'], not: ['Brazilian', 'Brazil’s', "Brazil's"] },
  { code: 'AF136', name: 'Serie B', af: 136, phrases: ['Serie B'], not: ['Brazilian'] },
  { code: 'BL1', name: 'Bundesliga', af: 78, phrases: ['Bundesliga'], not: ['2.', 'Austrian', 'Austria’s', "Austria's", 'Women’s', "Women's"] },
  { code: 'AF79', name: '2. Bundesliga', af: 79, phrases: ['2. Bundesliga', 'Bundesliga 2'] },
  { code: 'FL1', name: 'Ligue 1', af: 61, phrases: ['Ligue 1', 'Ligue Un'] },
  { code: 'AF62', name: 'Ligue 2', af: 62, phrases: ['Ligue 2'] },
  { code: 'DED', name: 'Eredivisie', af: 88, phrases: ['Eredivisie'] },
  { code: 'PPL', name: 'Primeira Liga', af: 94, phrases: ['Primeira Liga', 'Liga Portugal'] },
  { code: 'AF144', name: 'Belgian Pro League', af: 144, phrases: ['Belgian Pro League', 'Jupiler Pro League', 'Belgian top flight'] },
  { code: 'AF203', name: 'Süper Lig', af: 203, phrases: ['Süper Lig', 'Super Lig', 'Turkish Super League'] },
  { code: 'AF179', name: 'Scottish Premiership', af: 179, phrases: ['Scottish Premiership'] },
  { code: 'AF180', name: 'Scottish Championship', af: 180, phrases: ['Scottish Championship'] },
  { code: 'AF197', name: 'Greek Super League', af: 197, phrases: ['Greek Super League', 'Super League Greece'] },
  { code: 'BSA', name: 'Brasileirão', af: 71, phrases: ['Brasileirão', 'Brasileirao', 'Brazilian Serie A', 'Brazilian league'] },
  { code: 'AF128', name: 'Liga Profesional (Argentina)', af: 128, phrases: ['Liga Profesional', 'Argentine Primera', 'Argentine league'] },
  { code: 'AF253', name: 'MLS', af: 253, phrases: ['MLS', 'Major League Soccer'] },
  { code: 'AF262', name: 'Liga MX', af: 262, phrases: ['Liga MX'] },
  { code: 'AF98', name: 'J1 League', af: 98, phrases: ['J1 League', 'J.League', 'J-League', 'J League'] },
  { code: 'AF119', name: 'Danish Superliga', af: 119, phrases: ['Danish Superliga', 'Superligaen'] },
  { code: 'AF106', name: 'Ekstraklasa', af: 106, phrases: ['Ekstraklasa'] },
  { code: 'AF103', name: 'Eliteserien', af: 103, phrases: ['Eliteserien'] },
  { code: 'AF113', name: 'Allsvenskan', af: 113, phrases: ['Allsvenskan'] },
  { code: 'AF218', name: 'Austrian Bundesliga', phrases: ['Austrian Bundesliga'] },
  { code: 'AF207', name: 'Swiss Super League', phrases: ['Swiss Super League'] },
  { code: 'AF383', name: "Ligat Ha'Al", phrases: ["Ligat Ha'Al", 'Israeli Premier League'] },
  { code: 'AF307', name: 'Saudi Pro League', phrases: ['Saudi Pro League', 'Saudi Professional League'] },
  { code: 'CL', name: 'Champions League', phrases: ['Champions League'], not: ['AFC', 'CAF', 'Concacaf', 'CONCACAF', 'Women’s', "Women's", 'Asian', 'African'] },
  { code: 'AF3', name: 'Europa League', phrases: ['Europa League'] },
  { code: 'AF848', name: 'Conference League', phrases: ['Conference League', 'Europa Conference League'] }
];
const LEAGUE_NAME = new Map(NEWS_LEAGUES.map(l => [l.code, l.name]));

/** Headline spellings of API-Football team names (normalized name → extra names). */
const TEAM_ALIASES: Record<string, string[]> = {
  'manchester united': ['Man Utd', 'Man United'],
  'manchester city': ['Man City'],
  'tottenham': ['Spurs', 'Tottenham Hotspur'],
  'wolves': ['Wolverhampton'],
  'nottingham forest': ["Nott'm Forest"],
  'bayern munchen': ['Bayern Munich', 'Bayern'],
  'borussia dortmund': ['Dortmund'],
  'borussia monchengladbach': ['Gladbach', 'Monchengladbach', 'Mönchengladbach'],
  'bayer leverkusen': ['Leverkusen'],
  'rb leipzig': ['Leipzig'],
  'eintracht frankfurt': ['Frankfurt'],
  '1899 hoffenheim': ['Hoffenheim'],
  '1. fc koln': ['Cologne', 'Köln'],
  'paris saint germain': ['PSG', 'Paris St-Germain', 'Paris Saint-Germain'],
  'olympique marseille': ['Marseille'],
  'olympique lyonnais': ['Lyon'],
  'atletico madrid': ['Atlético Madrid', 'Atlético', 'Atletico'],
  'athletic club': ['Athletic Bilbao'],
  'ac milan': ['Milan'],
  'inter': ['Inter Milan', 'Internazionale'],
  'as roma': ['Roma'],
  'sporting cp': ['Sporting Lisbon', 'Sporting'],
  'fc porto': ['Porto'],
  'sl benfica': ['Benfica'],
  'olympiakos piraeus': ['Olympiacos', 'Olympiakos'],
  'legia warszawa': ['Legia Warsaw', 'Legia'],
  'fc copenhagen': ['Copenhagen', 'FC København'],
  'bodo/glimt': ['Bodø/Glimt', 'Bodo/Glimt'],
  'fenerbahce': ['Fenerbahçe'],
  'besiktas': ['Beşiktaş'],
  'qpr': ['Queens Park Rangers'],
  'psv eindhoven': ['PSV'],
  'ajax': ['Ajax'],
  'club america': ['Club América'],
  'river plate': ['River Plate'],
  'boca juniors': ['Boca Juniors', 'Boca']
};
/** Short team names that are also ordinary words, cities or surnames: matched only in their full form. */
const RISKY = new Set(['america', 'nice', 'santos', 'leon', 'austin', 'charlotte', 'viking', 'atlas', 'racing', 'nacional', 'juarez', 'union', 'city', 'united', 'real', 'sport', 'chicago', 'toronto', 'vancouver', 'montreal', 'miami', 'orlando', 'houston', 'dallas', 'portland', 'seattle', 'san diego', 'colorado', 'minnesota', 'new york', 'cincinnati', 'columbus', 'philadelphia', 'atlanta', 'nashville', 'kansas city', 'salt lake', 'velez', 'olimpia', 'start', 'sirius']);

export interface NewsItem {
  title: string; link: string; source: string; published: string | null; summary: string; image: string | null;
  leagues: { code: string; name: string }[];
}

db.exec(`
  CREATE TABLE IF NOT EXISTS news_items (
    link      TEXT PRIMARY KEY,
    title     TEXT NOT NULL,
    source    TEXT NOT NULL,
    published TEXT,
    summary   TEXT NOT NULL DEFAULT '',
    image     TEXT,
    leagues   TEXT NOT NULL DEFAULT '',   -- ",PL,CL," (comma-wrapped codes)
    seen_at   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_news_seen ON news_items(seen_at);
`);

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
};

type Raw = Omit<NewsItem, 'leagues'> & { feedLeague?: string };

async function fetchFeed(f: Feed): Promise<Raw[]> {
  const res = await fetch(f.url, { signal: AbortSignal.timeout(8000), headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const items: Raw[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const title = tag(b, 'title');
    const link = tag(b, 'link') || (b.match(/<guid[^>]*>(https?:[^<]+)<\/guid>/i)?.[1] ?? '');
    if (!title || !/^https:\/\//.test(link)) continue;
    // football only: some feeds mix in other sports (tennis, F1, cricket…)
    if (/\/(tennis|f1|formula-1|cricket|golf|boxing|rugby-union|rugby-league|nfl|nba|darts|racing|cycling|snooker|netball|athletics)\//i.test(link)) continue;
    const pub = tag(b, 'pubDate') || tag(b, 'dc:date');
    const d = pub ? new Date(pub) : null;
    // picture the feed ships with the story (media:content / media:thumbnail / enclosure) — the largest one
    let image: string | null = null, best = -1;
    for (const im of b.matchAll(/<(media:content|media:thumbnail|enclosure)\b([^>]*)>/gi)) {
      const attrs = im[2];
      const url = attrs.match(/url="([^"]+)"/i)?.[1];
      if (!url || !/^https:\/\//.test(url)) continue;
      const type = attrs.match(/type="([^"]+)"/i)?.[1] || '';
      if (type && !/^image\//i.test(type)) continue;
      const w = Number(attrs.match(/width="(\d+)"/i)?.[1] || 0);
      if (w > best) { best = w; image = url.replace(/&amp;/g, '&'); }
    }
    // BBC ships 240px thumbnails; its image server has the same picture at 480px
    if (image && /ichef\.bbci\.co\.uk\/.*\/240\//.test(image)) image = image.replace('/240/', '/480/');
    const summary = tag(b, 'description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); // some feeds escape their HTML
    items.push({
      title, link, source: f.source, feedLeague: f.league,
      published: d && !isNaN(d.getTime()) && d.getTime() <= Date.now() + 5 * 60000 ? d.toISOString() : null,
      summary: summary.length > 180 ? summary.slice(0, 177) + '…' : summary, image
    });
    if (items.length >= 30) break;
  }
  // Some feeds (ESPN) stamp every item with the feed's build time, not the article's. That date is meaningless, so drop it.
  if (items.length >= 3 && items.every(it => it.published && it.published === items[0].published)) items.forEach(it => { it.published = null; });
  return items;
}

/*
 * Some feeds (ESPN) ship no picture with their items. The article page's own preview image (og:image — the one
 * the outlet provides for link previews) is used instead. Looked up once per article and stored with it.
 */
async function previewImage(link: string): Promise<string | null> {
  try {
    const res = await fetch(link, { signal: AbortSignal.timeout(6000), headers: UA });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 300_000);
    const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    const url = m?.[1]?.replace(/&amp;/g, '&') || null;
    return url && /^https:\/\//.test(url) ? url : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Filing stories under leagues                                         */
/* ------------------------------------------------------------------ */

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const GENERIC = /^(fc|afc|cf|sc|ac|as|ss|sv|vfb|vfl|fk|bk|if|ik|cd|ca|cr|club|sl|rc|rcd|ud|sd|kv|krc|kaa|rsc)\s+|\s+(fc|afc|cf|sc|fk|bk|if|ff|sk|kv|ac)$/i;

let matcher: { re: RegExp; leaguesOf: Map<string, Set<string>> } | null = null;
let matcherAt = 0;

/** One regex over every team name (longest first, so "Inter Miami" wins over "Inter") and every league phrase. */
function buildMatcher() {
  const leaguesOf = new Map<string, Set<string>>();
  const add = (name: string, code: string) => {
    const k = norm(name).trim();
    if (k.length < 3) return;
    if (!leaguesOf.has(k)) leaguesOf.set(k, new Set());
    leaguesOf.get(k)!.add(code);
  };
  for (const l of NEWS_LEAGUES) {
    if (!l.af) continue;
    let names: string[] = [];
    try {
      names = (db.prepare(`
        SELECT DISTINCT n FROM (
          SELECT home_name AS n FROM af_fixtures WHERE league_id = ? AND season = (SELECT MAX(season) FROM af_fixtures WHERE league_id = ? AND kickoff <= datetime('now', '+30 days'))
          UNION SELECT away_name FROM af_fixtures WHERE league_id = ? AND season = (SELECT MAX(season) FROM af_fixtures WHERE league_id = ? AND kickoff <= datetime('now', '+30 days'))
        )`).all(l.af, l.af, l.af, l.af) as any[]).map(r => r.n);
    } catch { /* fixtures table not ready yet */ }
    for (const full of names) {
      const short = full.replace(GENERIC, '').trim();
      const key = norm(full).toLowerCase();
      // the full name always counts; the short form only when it isn't an ordinary word
      add(full, l.code);
      if (short !== full && !RISKY.has(norm(short).toLowerCase())) add(short, l.code);
      for (const a of TEAM_ALIASES[key] || TEAM_ALIASES[norm(short).toLowerCase()] || []) add(a, l.code);
    }
  }
  // a full name that is itself an ordinary word ("Nice", "Viking") is dropped too — the league phrase still files those stories
  for (const k of [...leaguesOf.keys()]) if (RISKY.has(k.toLowerCase())) leaguesOf.delete(k);
  const alts = [...leaguesOf.keys()].sort((a, b) => b.length - a.length).map(esc);
  const re = alts.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join('|')})(?![\\p{L}\\p{N}])`, 'gu') : /(?!)/g;
  matcher = { re, leaguesOf };
  matcherAt = Date.now();
}

const phraseRes = NEWS_LEAGUES.map(l => ({
  code: l.code,
  re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${l.phrases.map(p => esc(norm(p))).join('|')})(?![\\p{L}\\p{N}])`, 'gu'),
  not: (l.not || []).map(n => norm(n))
}));

/** League codes a story belongs to. */
export function leaguesFor(title: string, summary: string, feedLeague?: string): string[] {
  if (!matcher || Date.now() - matcherAt > 6 * 3600 * 1000) buildMatcher();
  const text = norm(`${title} . ${summary}`);
  const out = new Set<string>(feedLeague ? [feedLeague] : []);
  for (const p of phraseRes) {
    for (const m of text.matchAll(p.re)) {
      const before = text.slice(Math.max(0, m.index! - 20), m.index!).trimEnd();
      if (!p.not.some(n => before.endsWith(n))) { out.add(p.code); break; }
    }
  }
  for (const m of text.matchAll(matcher!.re)) {
    const hit = m[0];
    // names are proper nouns: skip a match that starts lower-case ("forest fire")
    if (hit[0] !== hit[0].toUpperCase()) continue;
    for (const c of matcher!.leaguesOf.get(hit) || []) out.add(c);
  }
  return [...out];
}

/* ------------------------------------------------------------------ */
/* Refresh and storage                                                   */
/* ------------------------------------------------------------------ */

const feedStatus = new Map<string, { source: string; league: string | null; ok: boolean; items: number; last14d?: number; newest?: string | null; error: string | null; at: string }>();
let lastRefresh: string | null = null;
let refreshing: Promise<void> | null = null;

async function refresh() {
  const t0 = Date.now();
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  const now = new Date().toISOString();
  const raws: Raw[] = [];
  results.forEach((r, i) => {
    const f = FEEDS[i];
    if (r.status === 'fulfilled') {
      raws.push(...r.value);
      const cut = Date.now() - 14 * 86400000;
      const dated = r.value.map(x => x.published).filter((x): x is string => !!x).sort();
      feedStatus.set(f.url, {
        source: f.source, league: f.league || null, ok: true, items: r.value.length,
        last14d: r.value.filter(x => !x.published || new Date(x.published).getTime() >= cut).length,
        newest: dated.length ? dated[dated.length - 1] : null, error: null, at: now
      });
    } else {
      const msg = (r.reason as any)?.message || String(r.reason);
      const prev = feedStatus.get(f.url);
      if (prev?.ok !== false) logger.warn(`News feed ${f.source} ${f.url} failed`, { message: msg }); // log once per outage
      feedStatus.set(f.url, { source: f.source, league: f.league || null, ok: false, items: 0, error: msg, at: now });
    }
  });
  buildMatcher(); // team lists can change (new season, promotions)
  const get = db.prepare(`SELECT leagues, image FROM news_items WHERE link = ?`);
  const ins = db.prepare(`INSERT INTO news_items (link, title, source, published, summary, image, leagues, seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const upd = db.prepare(`UPDATE news_items SET leagues = ?, image = COALESCE(image, ?), published = COALESCE(published, ?) WHERE link = ?`);
  const fresh: string[] = [];
  const titles = new Set<string>();
  db.exec('BEGIN');
  try {
    for (const it of raws) {
      const tkey = it.title.toLowerCase().slice(0, 60);
      const codes = leaguesFor(it.title, it.summary, it.feedLeague);
      const old: any = get.get(it.link);
      if (old) {
        // the same story in another feed (league section) adds that league
        const merged = new Set([...String(old.leagues).split(',').filter(Boolean), ...codes]);
        upd.run(merged.size ? `,${[...merged].join(',')},` : '', it.image, it.published, it.link);
        continue;
      }
      if (titles.has(tkey)) continue; // same story twice in one refresh under two links
      titles.add(tkey);
      ins.run(it.link, it.title, it.source, it.published, it.summary, it.image, codes.length ? `,${codes.join(',')},` : '', now);
      if (!it.image) fresh.push(it.link);
    }
    db.prepare(`DELETE FROM news_items WHERE seen_at < ? AND (leagues = '' OR seen_at < ?)`)
      .run(new Date(Date.now() - 21 * 86400000).toISOString(), new Date(Date.now() - 60 * 86400000).toISOString());
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  // pictures for new stories whose feed has none (a few at a time)
  const setImg = db.prepare(`UPDATE news_items SET image = ? WHERE link = ?`);
  const todo = fresh.slice(0, 30);
  for (let i = 0; i < todo.length; i += 5) {
    await Promise.all(todo.slice(i, i + 5).map(async link => { const img = await previewImage(link); if (img) setImg.run(img, link); }));
  }
  lastRefresh = now;
  logger.info(`News refreshed: ${raws.length} stories from ${results.filter(r => r.status === 'fulfilled').length}/${FEEDS.length} feeds, ${fresh.length} new pictures looked up, ${Math.round((Date.now() - t0) / 1000)}s`);
}

function refreshNow(): Promise<void> {
  if (!refreshing) {
    refreshing = refresh()
      .catch((e: any) => { logger.warn('News refresh failed', { message: e?.message }); })
      .finally(() => { refreshing = null; });
  }
  return refreshing as Promise<void>;
}

let started = false;
/** Refresh every 15 minutes (first run shortly after boot). */
export function startNewsScheduler() {
  if (started) return;
  started = true;
  setTimeout(() => void refreshNow(), 20 * 1000).unref();
  setInterval(() => void refreshNow(), 15 * 60 * 1000).unref();
}

function toItem(r: any): NewsItem {
  return {
    title: r.title, link: r.link, source: r.source, published: r.published, summary: r.summary, image: r.image,
    leagues: String(r.leagues || '').split(',').filter(Boolean).map((c: string) => ({ code: c, name: LEAGUE_NAME.get(c) || c }))
  };
}
const when = (r: any) => r.published || r.seen_at;

/** Interleave outlets so one of them doesn't fill the list (each outlet newest first). */
function mix(rows: any[], limit: number): any[] {
  const bySource = new Map<string, any[]>();
  for (const r of rows) {
    if (!bySource.has(r.source)) bySource.set(r.source, []);
    bySource.get(r.source)!.push(r);
  }
  const lists = [...bySource.values()].map(l => l.sort((a, b) => when(b).localeCompare(when(a))))
    .sort((a, b) => when(b[0]).localeCompare(when(a[0])));
  const out: any[] = [];
  for (let i = 0; out.length < limit && lists.some(l => i < l.length); i++) for (const l of lists) if (l[i] && out.length < limit) out.push(l[i]);
  return out;
}

/**
 * Home page: every story of the last 3 days, all leagues combined (outlets interleaved).
 * League page (`league` = competition code): that league's stories of the last 14 days, newest first.
 */
export async function footballNews(limit = 12, league?: string): Promise<NewsItem[]> {
  const have: any = db.prepare(`SELECT COUNT(*) AS n FROM news_items`).get();
  if (!have.n) await refreshNow(); // first boot: wait for the first fill
  else if (!lastRefresh) void refreshNow();
  if (league) {
    // the last 14 days; a quiet league (fewer than 8 stories) also gets its older stories, up to 60 days back
    const code = league.toUpperCase();
    const q = db.prepare(`
      SELECT * FROM news_items WHERE leagues LIKE ? AND COALESCE(published, seen_at) >= ?
      ORDER BY COALESCE(published, seen_at) DESC LIMIT ?`);
    let rows = q.all(`%,${code},%`, new Date(Date.now() - 14 * 86400000).toISOString(), limit);
    if (rows.length < Math.min(8, limit)) rows = q.all(`%,${code},%`, new Date(Date.now() - 60 * 86400000).toISOString(), Math.min(limit, 8));
    return rows.map(toItem);
  }
  const rows = db.prepare(`SELECT * FROM news_items WHERE COALESCE(published, seen_at) >= ? ORDER BY COALESCE(published, seen_at) DESC LIMIT 300`)
    .all(new Date(Date.now() - 3 * 86400000).toISOString());
  return mix(rows, limit).map(toItem);
}

/** Admin: every feed's last result and how many stories each league has. */
export function newsStatus() {
  const counts = new Map<string, number>();
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  for (const r of db.prepare(`SELECT leagues FROM news_items WHERE COALESCE(published, seen_at) >= ?`).all(since) as any[])
    for (const c of String(r.leagues).split(',').filter(Boolean)) counts.set(c, (counts.get(c) || 0) + 1);
  const total: any = db.prepare(`SELECT COUNT(*) AS n FROM news_items`).get();
  return {
    lastRefresh,
    stored: total.n,
    teamNames: matcher?.leaguesOf.size || 0,
    feeds: FEEDS.map(f => ({ url: f.url, ...(feedStatus.get(f.url) || { source: f.source, league: f.league || null, ok: null, items: 0, error: null, at: null }) })),
    leagues: NEWS_LEAGUES.map(l => ({ code: l.code, name: l.name, stories14d: counts.get(l.code) || 0 }))
  };
}
