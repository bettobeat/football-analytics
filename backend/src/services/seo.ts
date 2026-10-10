import { db } from '../db';
import { BB_LEAGUES } from './basketball';
import { bbPublic } from './bbSite';
import { FONT_HEAD } from './fonts';

/**
 * Search engines (Oct 2026). The site is a single-page app, so every address used to send the same empty page with
 * the home page's title. Now each page address gets its own title, description, canonical link, language
 * alternates and a short HTML version of its content (teams, date, competition, links) inside #root. The app
 * replaces that HTML when it starts, so visitors see the same thing as before; crawlers and link previews see
 * real content. Data comes from our own database only (no provider calls), so crawling costs nothing.
 */

const SITE = 'https://sportlikely.com';
const LANGS = ['en', 'es', 'pt', 'de', 'fr', 'it', 'tr'] as const;
type Lang = (typeof LANGS)[number];
const BRAND = 'SportLikely';

export interface SeoInfo {
  title: string;
  description: string;
  path: string; // without the language prefix
  lang: Lang;
  body: string; // HTML for crawlers (replaced by the app)
  jsonld?: any[];
  noindex?: boolean;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const short = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const link = (lang: Lang, p: string) => (lang === 'en' ? p : `/${lang}${p === '/' ? '' : p}`);

/* ---------- football data from our predictions table (every match we predict is stored before kick-off) ---------- */

interface FbMatch { id: number; date: string; code: string | null; comp: string | null; homeId: number | null; home: string; awayId: number | null; away: string }
const fbRow = (r: any): FbMatch => ({ id: r.match_id, date: r.utc_date, code: r.competition_code, comp: r.competition_name, homeId: r.home_team_id, home: r.home_team, awayId: r.away_team_id, away: r.away_team });
const FB_COLS = `match_id, MAX(utc_date) AS utc_date, MAX(competition_code) AS competition_code, MAX(competition_name) AS competition_name,
  MAX(home_team_id) AS home_team_id, MAX(home_team) AS home_team, MAX(away_team_id) AS away_team_id, MAX(away_team) AS away_team`;

function fbMatch(id: number): FbMatch | null {
  const r = db.prepare(`SELECT ${FB_COLS} FROM predictions WHERE match_id = ? GROUP BY match_id`).get(id) as any;
  return r && r.home_team ? fbRow(r) : null;
}
function fbUpcoming(limit: number, where = '', ...args: any[]): FbMatch[] {
  const now = new Date().toISOString(), to = new Date(Date.now() + 14 * 86400000).toISOString();
  return (db.prepare(`SELECT ${FB_COLS} FROM predictions WHERE utc_date >= ? AND utc_date <= ? ${where} GROUP BY match_id ORDER BY utc_date LIMIT ?`).all(now, to, ...args, limit) as any[])
    .filter(r => r.home_team).map(fbRow);
}
function fbRecent(days: number, limit: number): FbMatch[] {
  const from = new Date(Date.now() - days * 86400000).toISOString(), now = new Date().toISOString();
  return (db.prepare(`SELECT ${FB_COLS} FROM predictions WHERE utc_date >= ? AND utc_date < ? GROUP BY match_id ORDER BY utc_date DESC LIMIT ?`).all(from, now, limit) as any[])
    .filter(r => r.home_team).map(fbRow);
}
function fbCompetitions(): { code: string; name: string }[] {
  const from = new Date(Date.now() - 120 * 86400000).toISOString();
  return (db.prepare(`SELECT competition_code AS code, MAX(competition_name) AS name FROM predictions WHERE utc_date >= ? AND competition_code IS NOT NULL GROUP BY competition_code ORDER BY COUNT(*) DESC`).all(from) as any[]).filter(r => r.name);
}
function fbTeamName(id: number): string | null {
  const r = db.prepare(`SELECT CASE WHEN home_team_id = ? THEN home_team ELSE away_team END AS name FROM predictions WHERE home_team_id = ? OR away_team_id = ? ORDER BY utc_date DESC LIMIT 1`).get(id, id, id) as any;
  return r?.name || null;
}

const fbList = (lang: Lang, list: FbMatch[]) =>
  list.length ? `<ul>${list.map(m => `<li><a href="${link(lang, `/match/${m.id}`)}">${esc(m.home)} vs ${esc(m.away)}</a> · ${esc(m.comp || '')} · ${short(m.date)}</li>`).join('')}</ul>` : '';

const sportsEvent = (name: string, date: string, home: string, away: string, url: string, comp?: string | null, sport = 'Soccer') => ({
  '@context': 'https://schema.org', '@type': 'SportsEvent', name, startDate: date, sport, url,
  ...(comp ? { superEvent: { '@type': 'SportsEvent', name: comp } } : {}),
  homeTeam: { '@type': 'SportsTeam', name: home }, awayTeam: { '@type': 'SportsTeam', name: away },
  eventStatus: 'https://schema.org/EventScheduled'
});

/* ---------- basketball ---------- */

function bbGameRow(id: number) {
  return db.prepare(`SELECT game_id, code, kickoff, home_id, home_name, away_id, away_name FROM bb_games WHERE game_id = ?`).get(id) as any;
}
function bbUpcoming(limit: number, code?: string) {
  const now = new Date().toISOString(), to = new Date(Date.now() + 10 * 86400000).toISOString();
  return db.prepare(`SELECT game_id, code, kickoff, home_name, away_name FROM bb_games WHERE kickoff >= ? AND kickoff <= ? ${code ? 'AND code = ?' : ''} ORDER BY kickoff LIMIT ?`)
    .all(...(code ? [now, to, code, limit] : [now, to, limit])) as any[];
}
const bbLeagueName = (code: string) => BB_LEAGUES.find(l => l.code === code)?.name || code;
const bbList = (lang: Lang, list: any[]) =>
  list.length ? `<ul>${list.map(g => `<li><a href="${link(lang, `/basketball/game/${g.game_id}`)}">${esc(g.home_name)} vs ${esc(g.away_name)}</a> · ${esc(bbLeagueName(g.code))} · ${short(g.kickoff)}</li>`).join('')}</ul>` : '';

/* ---------- pages ---------- */

const NAV = (lang: Lang) => `<nav><a href="${link(lang, '/')}">${BRAND}</a> · <a href="${link(lang, '/matches')}">Football matches</a> · <a href="${link(lang, '/accuracy')}">Our record</a> · <a href="${link(lang, '/premium')}">Premium</a>${bbPublic() ? ` · <a href="${link(lang, '/basketball')}">Basketball</a>` : ''}</nav>`;
const PRIVATE = /^\/(admin|account|verify|forgot|login|signup|favorites|join|crm)(\/|$)|^\/basketball\/(favorites|past)(\/|$)|^\/past(\/|$)/;

export function seoPage(rawPath: string): SeoInfo {
  let path = rawPath.split('?')[0].replace(/\/+$/, '') || '/';
  let lang: Lang = 'en';
  const m0 = path.match(/^\/(es|pt|de|fr|it|tr)(\/|$)/);
  if (m0) { lang = m0[1] as Lang; path = path.slice(3) || '/'; }
  const page = (title: string, description: string, body: string, extra: Partial<SeoInfo> = {}): SeoInfo =>
    ({ title, description, path, lang, body: `${NAV(lang)}<main>${body}</main>`, ...extra });

  if (PRIVATE.test(path)) return page(BRAND, 'SportLikely account page.', '', { noindex: true });

  let m: RegExpMatchArray | null;
  try {
    if (path === '/') {
      return page(`${BRAND} · Sports predictions, tested in public`,
        'Sports predictions tested in public: football leagues, cups and national teams, with basketball and more sports coming. Win chances, goals and points, form and head-to-head. Every prediction is saved before kick-off and checked against the result.',
        `<h1>Sports predictions, tested in public</h1><p>Football predictions for the top leagues, cups and national teams, with basketball and more sports coming: win, draw and loss chances, goals and the reasons behind every pick. Every prediction is saved before kick-off and scored after the game.</p><h2>Next football matches</h2>${fbList(lang, fbUpcoming(30))}`,
        { jsonld: [
          { '@context': 'https://schema.org', '@type': 'Organization', name: BRAND, url: SITE, logo: `${SITE}/icon-512.png`, description: 'Sports predictions tested in public.' },
          { '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, url: SITE }
        ] });
    }
    if (path === '/matches') {
      return page(`Football predictions for today and the coming days | ${BRAND}`,
        'Today\u2019s and upcoming football matches with our win, draw and loss chances, over 2.5 goals and both-teams-score, for the top leagues, cups and national teams.',
        `<h1>Football matches and predictions</h1>${fbList(lang, fbUpcoming(120))}<h2>Competitions</h2><ul>${fbCompetitions().map(c => `<li><a href="${link(lang, `/league/${c.code}`)}">${esc(c.name)}</a></li>`).join('')}</ul>`);
    }
    if ((m = path.match(/^\/match\/(\d+)$/))) {
      const x = fbMatch(Number(m[1]));
      if (x) {
        const name = `${x.home} vs ${x.away}`;
        const when = day(x.date);
        return page(`${name} prediction · ${x.comp || 'Football'} · ${short(x.date)} | ${BRAND}`,
          `${name} (${x.comp || 'football'}, ${when}): our win, draw and loss chances, expected goals, form, head-to-head, injuries and line-ups. Saved before kick-off and checked after the game.`,
          `<h1>${esc(name)} prediction</h1><p>${esc(x.comp || '')} · ${esc(when)}</p><p>Win, draw and loss chances, expected goals, over 2.5 goals and both teams to score, recent form, head-to-head, injuries and line-ups for ${esc(name)}.</p><ul>${x.code ? `<li><a href="${link(lang, `/league/${x.code}`)}">${esc(x.comp || x.code)}</a></li>` : ''}${x.homeId ? `<li><a href="${link(lang, `/team/${x.homeId}`)}">${esc(x.home)}</a></li>` : ''}${x.awayId ? `<li><a href="${link(lang, `/team/${x.awayId}`)}">${esc(x.away)}</a></li>` : ''}</ul>`,
          { jsonld: [sportsEvent(name, x.date, x.home, x.away, SITE + link(lang, path), x.comp)] });
      }
    }
    if ((m = path.match(/^\/league\/([A-Za-z0-9]+)$/))) {
      const code = m[1].toUpperCase();
      const comp = fbCompetitions().find(c => c.code === code);
      if (comp) {
        return page(`${comp.name} predictions, table and stats | ${BRAND}`,
          `${comp.name}: predictions for every match, the table, top scorers and assists, with our win, draw and loss chances saved before kick-off.`,
          `<h1>${esc(comp.name)} predictions</h1>${fbList(lang, fbUpcoming(60, 'AND competition_code = ?', code))}`);
      }
    }
    if ((m = path.match(/^\/team\/(\d+)$/))) {
      const id = Number(m[1]);
      const name = fbTeamName(id);
      if (name) {
        return page(`${name}: next matches, predictions and form | ${BRAND}`,
          `${name}: upcoming matches with our predictions, recent results, form, squad and player stats.`,
          `<h1>${esc(name)}</h1>${fbList(lang, fbUpcoming(10, 'AND (home_team_id = ? OR away_team_id = ?)', id, id))}`);
      }
    }
    if (path === '/accuracy') {
      return page(`Our record: every prediction checked against the result | ${BRAND}`,
        'How often our predictions are right, league by league: every pick is saved before kick-off and scored after the game, in public.',
        `<h1>Our record</h1><p>Every prediction is saved before kick-off and checked against the result. Recent matches we predicted:</p>${fbList(lang, fbRecent(14, 60))}`);
    }
    if (path === '/premium') return page(`Premium and Pro plans | ${BRAND}`, 'Full win, draw and loss percentages, goals markets, team analysis and more predictions with SportLikely Premium and Pro.', '<h1>SportLikely Premium and Pro</h1>');
    if (path === '/draw-alerts') return page(`Draw alerts | ${BRAND}`, 'Matches where our model sees an unusually high chance of a draw.', '<h1>Draw alerts</h1>');
    if (path === '/terms') return page(`Terms of use | ${BRAND}`, 'Terms of use of SportLikely.', '<h1>Terms of use</h1>');
    if (path === '/privacy') return page(`Privacy policy | ${BRAND}`, 'How SportLikely handles your data.', '<h1>Privacy policy</h1>');
    if (path === '/accessibility') return page(`Accessibility | ${BRAND}`, 'Accessibility statement of SportLikely.', '<h1>Accessibility statement</h1>');
    if (path === '/contact') return page(`Contact us | ${BRAND}`, 'Questions, problems or ideas? Write to the SportLikely team: we answer by email within 1–2 working days.', '<h1>Contact us</h1><p>Write to support@sportlikely.com or use the contact form.</p>');

    if (path.startsWith('/basketball')) {
      if (!bbPublic()) return page(`Basketball predictions · coming soon | ${BRAND}`, 'Basketball predictions are coming soon to SportLikely.', '<h1>Basketball · coming soon</h1>', { noindex: true });
      if (path === '/basketball' || path === '/basketball/games') {
        return page(`Basketball predictions: NBA, EuroLeague and more | ${BRAND}`,
          'Basketball predictions for the NBA, EuroLeague, EuroCup and the top national leagues: win chances, point spread and total points, saved before tip-off.',
          `<h1>Basketball predictions</h1>${bbList(lang, bbUpcoming(80))}<h2>Leagues</h2><ul>${BB_LEAGUES.map(l => `<li><a href="${link(lang, `/basketball/league/${l.code}`)}">${esc(l.name)}</a></li>`).join('')}</ul>`);
      }
      if ((m = path.match(/^\/basketball\/game\/(\d+)$/))) {
        const g = bbGameRow(Number(m[1]));
        if (g) {
          const name = `${g.home_name} vs ${g.away_name}`, lg = bbLeagueName(g.code);
          return page(`${name} prediction · ${lg} · ${short(g.kickoff)} | ${BRAND}`,
            `${name} (${lg}, ${day(g.kickoff)}): win chances, point spread, total points, form, rest, head-to-head and key players.`,
            `<h1>${esc(name)} prediction</h1><p>${esc(lg)} · ${esc(day(g.kickoff))}</p><ul><li><a href="${link(lang, `/basketball/league/${g.code}`)}">${esc(lg)}</a></li><li><a href="${link(lang, `/basketball/team/${g.home_id}`)}">${esc(g.home_name)}</a></li><li><a href="${link(lang, `/basketball/team/${g.away_id}`)}">${esc(g.away_name)}</a></li></ul>`,
            { jsonld: [sportsEvent(name, g.kickoff, g.home_name, g.away_name, SITE + link(lang, path), lg, 'Basketball')] });
        }
      }
      if ((m = path.match(/^\/basketball\/league\/([A-Za-z0-9]+)$/))) {
        const code = m[1].toUpperCase();
        if (BB_LEAGUES.some(l => l.code === code)) {
          const lg = bbLeagueName(code);
          return page(`${lg} predictions and standings | ${BRAND}`, `${lg}: predictions for every game, standings and team stats.`, `<h1>${esc(lg)} predictions</h1>${bbList(lang, bbUpcoming(40, code))}`);
        }
      }
      return page(`Basketball | ${BRAND}`, 'Basketball predictions on SportLikely.', '<h1>Basketball</h1>');
    }
  } catch { /* fall through to the generic page */ }
  return page(`${BRAND} · Sports predictions, tested in public`, 'Sports predictions tested in public: football now, basketball and more sports coming.', `<h1>${BRAND}</h1>`);
}

/** index.html with this page's head tags and crawler HTML. */
export function renderIndex(html: string, s: SeoInfo): string {
  const url = SITE + link(s.lang, s.path);
  const title = esc(s.title), desc = esc(s.description);
  let out = html
    .replace(/<html lang="[^"]*"/, `<html lang="${s.lang}"`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${desc}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${url}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${title}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${desc}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${url}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${title}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${desc}" />`);
  // fonts from our own server instead of Google Fonts (privacy): drop the Google links, add our @font-face rules
  out = out.replace(/\s*<link rel="preconnect" href="https:\/\/fonts\.(googleapis|gstatic)\.com"[^>]*>/g, '')
    .replace(/\s*<link\s+href="https:\/\/fonts\.googleapis\.com\/css2[^"]*"\s+rel="stylesheet"\s*\/?>/, '');
  const head: string[] = [FONT_HEAD];
  if (s.noindex) head.push('<meta name="robots" content="noindex, nofollow" />');
  else {
    for (const l of LANGS) head.push(`<link rel="alternate" hreflang="${l}" href="${SITE + link(l, s.path)}" />`);
    head.push(`<link rel="alternate" hreflang="x-default" href="${SITE + s.path}" />`);
  }
  for (const j of s.jsonld || []) head.push(`<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`);
  out = out.replace('</head>', `    ${head.join('\n    ')}\n  </head>`);
  // Visitors with JavaScript get the app within a moment: the plain version only fades in if the app has not started
  // after 3 s (no flash of unstyled text). Crawlers read the HTML either way.
  out = out.replace('<div id="root"></div>', `<div id="root"><div style="opacity:0;animation:slseo .2s 3s forwards;max-width:960px;margin:0 auto;padding:24px 16px;font-family:system-ui,sans-serif;line-height:1.6"><style>@keyframes slseo{to{opacity:1}}</style>${s.body}</div></div>`);
  return out;
}

/** sitemap.xml: main pages, competitions and the next two weeks of matches (+ the last two weeks: our public record). */
export function sitemapXml(): string {
  const urls: { loc: string; freq: string; pri: string }[] = [];
  const add = (p: string, freq: string, pri: string) => urls.push({ loc: p, freq, pri });
  add('/', 'hourly', '1.0'); add('/matches', 'hourly', '0.9'); add('/accuracy', 'daily', '0.8'); add('/draw-alerts', 'daily', '0.6'); add('/premium', 'monthly', '0.5');
  add('/terms', 'yearly', '0.2'); add('/privacy', 'yearly', '0.2'); add('/accessibility', 'yearly', '0.2'); add('/contact', 'yearly', '0.3');
  for (const c of fbCompetitions()) add(`/league/${c.code}`, 'daily', '0.7');
  for (const x of fbUpcoming(1500)) add(`/match/${x.id}`, 'hourly', '0.8');
  for (const x of fbRecent(14, 1500)) add(`/match/${x.id}`, 'weekly', '0.4');
  if (bbPublic()) {
    add('/basketball', 'hourly', '0.8');
    for (const l of BB_LEAGUES) add(`/basketball/league/${l.code}`, 'daily', '0.6');
    for (const g of bbUpcoming(1500)) add(`/basketball/game/${g.game_id}`, 'hourly', '0.7');
  }
  const alt = (p: string) => LANGS.map(l => `<xhtml:link rel="alternate" hreflang="${l}" href="${SITE + link(l, p)}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls
    .map(u => `  <url><loc>${SITE}${u.loc}</loc>${alt(u.loc)}<changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join('\n')}\n</urlset>\n`;
}
