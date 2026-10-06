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
  { source: 'Sky Sports', url: 'https://www.skysports.com/rss/11095' }
];
const TTL = 20 * 60 * 1000;

export interface NewsItem { title: string; link: string; source: string; published: string | null; summary: string; image: string | null }

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
  const res = await fetch(f.url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'SportLikely/1.0 (+https://sportlikely.com)' } });
  if (!res.ok) throw new Error(`${f.source}: HTTP ${res.status}`);
  const xml = await res.text();
  const items: NewsItem[] = [];
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
    items.push({ title, link, source: f.source, published: d && !isNaN(d.getTime()) && d.getTime() <= Date.now() + 5 * 60000 ? d.toISOString() : null, summary: summary.length > 180 ? summary.slice(0, 177) + '…' : summary, image });
    if (items.length >= 15) break;
  }
  // Some feeds (ESPN) stamp every item with the feed's build time, not the article's. That date is meaningless, so drop it.
  if (items.length >= 3 && items.every(it => it.published && it.published === items[0].published)) items.forEach(it => { it.published = null; });
  return items;
}

/*
 * Some feeds (ESPN) ship no picture with their items. The article page's own preview image (og:image — the one
 * the outlet provides for link previews) is used instead. Looked up once per article and remembered.
 */
const ogCache = new Map<string, string | null>();
async function previewImage(link: string): Promise<string | null> {
  if (ogCache.has(link)) return ogCache.get(link)!;
  let img: string | null = null;
  try {
    const res = await fetch(link, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'SportLikely/1.0 (+https://sportlikely.com)' } });
    if (res.ok) {
      const html = (await res.text()).slice(0, 300_000);
      const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
      const url = m?.[1]?.replace(/&amp;/g, '&') || null;
      img = url && /^https:\/\//.test(url) ? url : null;
    }
  } catch { /* no picture */ }
  ogCache.set(link, img);
  if (ogCache.size > 2000) ogCache.delete(ogCache.keys().next().value as string);
  return img;
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
  const final = out.slice(0, 30);
  // pictures for stories whose feed has none (a few at a time)
  const missing = final.filter(it => !it.image).slice(0, 15);
  for (let i = 0; i < missing.length; i += 5) {
    await Promise.all(missing.slice(i, i + 5).map(async it => { it.image = await previewImage(it.link); }));
  }
  return final;
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
