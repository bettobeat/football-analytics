/**
 * World football news for the home page: headlines from public RSS feeds of major outlets.
 * We show the headline, the outlet, the time and a link to the original article (no copying of articles or photos).
 * Feeds are fetched on demand and cached for 20 minutes; a feed that fails is skipped.
 */
import logger from '../utils/logger';

const FEEDS: { source: string; url: string }[] = [
  { source: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
  { source: 'The Guardian', url: 'https://www.theguardian.com/football/rss' },
  { source: 'ESPN', url: 'https://www.espn.com/espn/rss/soccer/news' },
  { source: 'Sky Sports', url: 'https://www.skysports.com/rss/12040' }
];
const TTL = 20 * 60 * 1000;

export interface NewsItem { title: string; link: string; source: string; published: string | null; summary: string }

let cache: { at: number; items: NewsItem[] } | null = null;
let inflight: Promise<NewsItem[]> | null = null;

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

async function fetchFeed(f: { source: string; url: string }): Promise<NewsItem[]> {
  const res = await fetch(f.url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'BetToBeat/1.0 (+https://bettobeat.com)' } });
  if (!res.ok) throw new Error(`${f.source}: HTTP ${res.status}`);
  const xml = await res.text();
  const items: NewsItem[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const title = tag(b, 'title');
    const link = tag(b, 'link') || (b.match(/<guid[^>]*>(https?:[^<]+)<\/guid>/i)?.[1] ?? '');
    if (!title || !/^https:\/\//.test(link)) continue;
    const pub = tag(b, 'pubDate') || tag(b, 'dc:date');
    const d = pub ? new Date(pub) : null;
    const summary = tag(b, 'description');
    items.push({ title, link, source: f.source, published: d && !isNaN(d.getTime()) ? d.toISOString() : null, summary: summary.length > 180 ? summary.slice(0, 177) + '…' : summary });
    if (items.length >= 15) break;
  }
  // Some feeds (ESPN) stamp every item with the feed's build time, not the article's. That date is meaningless, so drop it.
  if (items.length >= 3 && items.every(it => it.published && it.published === items[0].published)) items.forEach(it => { it.published = null; });
  return items;
}

async function load(): Promise<NewsItem[]> {
  const all: NewsItem[] = [];
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') all.push(...r.value);
    else logger.warn(`News feed ${FEEDS[i].source} failed`, { message: (r.reason as any)?.message });
  });
  // Drop anything older than 3 days, sort each outlet newest first (undated items keep the feed's own order),
  // then interleave the outlets so one of them doesn't fill the page.
  const cutoff = Date.now() - 3 * 86400000;
  const bySource = new Map<string, NewsItem[]>();
  for (const it of all) {
    if (it.published && new Date(it.published).getTime() < cutoff) continue;
    if (!bySource.has(it.source)) bySource.set(it.source, []);
    bySource.get(it.source)!.push(it);
  }
  for (const list of bySource.values()) list.sort((a, b) => (a.published && b.published ? b.published.localeCompare(a.published) : 0));
  const lists = [...bySource.values()].sort((a, b) => (b[0]?.published || '').localeCompare(a[0]?.published || ''));
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (let i = 0; out.length < 30 && lists.some(l => i < l.length); i++) {
    for (const l of lists) {
      const it = l[i];
      if (!it) continue;
      const key = it.title.toLowerCase().slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
    }
  }
  return out.slice(0, 30);
}

export async function footballNews(limit = 12): Promise<NewsItem[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.items.slice(0, limit);
  if (!inflight) inflight = load().finally(() => { inflight = null; });
  try {
    const items = await inflight;
    if (items.length) cache = { at: Date.now(), items };
    return (items.length ? items : cache?.items || []).slice(0, limit);
  } catch {
    return (cache?.items || []).slice(0, limit);
  }
}
