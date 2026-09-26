/**
 * Official match highlights from YouTube, embedded on the match page after full time.
 *
 * Only videos from official channels are used: the leagues and competitions themselves, their licensed broadcasters,
 * or the two clubs' own channels. Fan uploads and re-uploads are never shown. The video is played through YouTube's
 * own player (the channel decides where it can be watched; some are blocked in some countries).
 *
 * Needs YOUTUBE_API_KEY (YouTube Data API v3, free quota 10,000 units/day; one search = 100 units). Searched only
 * when someone opens a finished match, cached forever once found; while not found, retried at most every 2 hours
 * for 4 days after the match. Without a key the feature is simply off.
 */
import { db } from '../db';
import logger from '../utils/logger';

db.exec(`
  CREATE TABLE IF NOT EXISTS match_highlights (
    match_id   INTEGER PRIMARY KEY,
    video_id   TEXT,
    title      TEXT,
    channel    TEXT,
    published  TEXT,
    checked_at TEXT NOT NULL,
    tries      INTEGER NOT NULL DEFAULT 0
  );
`);

const KEY = () => process.env.YOUTUBE_API_KEY || '';
const RETRY_MS = 2 * 3600 * 1000;
const GIVE_UP_MS = 4 * 86400 * 1000;
let quotaBlockedUntil = 0;

// Official channels (name as YouTube shows it, lower-case; matched exactly or as "<name> …")
const OFFICIAL = [
  'premier league', 'sky sports premier league', 'sky sports football', 'nbc sports', 'efl', 'sky sports football league',
  'laliga', 'laliga hypermotion', 'laliga en español', 'serie a', 'lega serie b', 'bundesliga', '2. bundesliga', 'ligue 1 mcdonald\'s',
  'ligue 1', 'ligue 2 bkt', 'eredivisie', 'espn nl', 'liga portugal', 'liga portugal betclic', 'spfl', 'trendyol süper lig', 'süper lig',
  'pro league', 'jupiler pro league', 'super league greece', 'uefa', 'uefa champions league', 'uefa europa league',
  'uefa conference league', 'cbs sports golazo', 'tnt sports football', 'dazn football', 'dazn', 'canal+ sport', 'bein sports',
  'fifa', 'concacaf', 'caf tv', 'afc asian cup', 'the afc channel', 'conmebol'
];

const norm = (s: string) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&amp;/g, '&').replace(/[^a-z0-9+.' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const clubKey = (s: string) => norm(s).split(' ').filter(w => !['fc', 'cf', 'afc', 'sc', 'ac', 'club', 'de', 'cd', 'sad', 'official'].includes(w)).join(' ');

function isOfficial(channel: string, home: string, away: string) {
  const c = norm(channel);
  if (OFFICIAL.some(o => c === norm(o))) return true;
  const ck = clubKey(channel);
  // a club's own channel: "FC Barcelona", "Liverpool FC", "Juventus"
  return !!ck && (ck === clubKey(home) || ck === clubKey(away));
}

/** The words of a team name worth searching for ("Wolverhampton Wanderers" → "Wolverhampton"). */
const short = (s: string) => clubKey(s).split(' ').sort((a, b) => b.length - a.length)[0] || s;

function mentions(title: string, team: string) {
  const t = norm(title);
  const k = clubKey(team);
  return k.split(' ').some(w => w.length >= 4 && t.includes(w)) || t.includes(k);
}

export interface Highlight { videoId: string; title: string; channel: string; published: string }

export async function highlightsFor(match: any): Promise<Highlight | null> {
  if (!match || !['FINISHED', 'AWARDED'].includes(match.status)) return null;
  const row: any = db.prepare(`SELECT * FROM match_highlights WHERE match_id = ?`).get(match.id);
  if (row?.video_id) return { videoId: row.video_id, title: row.title, channel: row.channel, published: row.published };
  if (!KEY() || Date.now() < quotaBlockedUntil) return null;
  const ko = new Date(match.utcDate).getTime();
  if (!Number.isFinite(ko) || Date.now() - ko > GIVE_UP_MS) return null;
  if (row && Date.now() - new Date(row.checked_at).getTime() < RETRY_MS) return null;

  const home = match.homeTeam?.shortName || match.homeTeam?.name || '', away = match.awayTeam?.shortName || match.awayTeam?.name || '';
  const q = `${short(home)} ${short(away)} highlights`;
  const params = new URLSearchParams({
    part: 'snippet', type: 'video', maxResults: '15', q, videoEmbeddable: 'true', order: 'relevance',
    publishedAfter: new Date(ko).toISOString(), key: KEY()
  });
  let found: Highlight | null = null;
  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { signal: AbortSignal.timeout(8000) });
    if (r.status === 403) { quotaBlockedUntil = Date.now() + 3600 * 1000; throw new Error('quota or key refused (403)'); }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j: any = await r.json();
    for (const it of j.items || []) {
      const s = it.snippet || {};
      const title = String(s.title || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      if (!it.id?.videoId || !isOfficial(s.channelTitle, match.homeTeam?.name || home, match.awayTeam?.name || away)) continue;
      if (!mentions(title, home) || !mentions(title, away)) continue;
      if (!/highlight|resumen|sintesi|samenvatting|resume|zusammenfassung|melhores momentos|özet|all goals|goals/i.test(title)) continue;
      found = { videoId: it.id.videoId, title, channel: s.channelTitle, published: s.publishedAt };
      break;
    }
  } catch (e: any) {
    logger.warn(`highlights ${match.id}: ${e.message}`);
  }
  db.prepare(`
    INSERT INTO match_highlights (match_id, video_id, title, channel, published, checked_at, tries) VALUES (?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(match_id) DO UPDATE SET video_id = excluded.video_id, title = excluded.title, channel = excluded.channel,
      published = excluded.published, checked_at = excluded.checked_at, tries = match_highlights.tries + 1`)
    .run(match.id, found?.videoId || null, found?.title || null, found?.channel || null, found?.published || null, new Date().toISOString());
  return found;
}

export function highlightsStatus() {
  const r: any = db.prepare(`SELECT COUNT(*) n, SUM(video_id IS NOT NULL) found FROM match_highlights`).get();
  return { configured: !!KEY(), checked: r.n, found: r.found || 0, quotaBlocked: Date.now() < quotaBlockedUntil };
}
