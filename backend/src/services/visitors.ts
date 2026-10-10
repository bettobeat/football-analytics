import crypto from 'crypto';
import type express from 'express';
import { db } from '../db';
import { countryOf, geoStatus } from './geo';

/**
 * Visitor counts for the admin page (Oct 2026): who is on the site now, and unique visitors per day / 7 / 30 days.
 * A visitor is one IP address. IPs are never stored: only a salted hash and the visitor's country (services/geo.ts),
 * and rows older than 90 days are deleted.
 * Admins, maintenance tokens and bots are not counted.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS visits (
    day TEXT NOT NULL, vid TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 0, signed_in INTEGER NOT NULL DEFAULT 0,
    first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, PRIMARY KEY (day, vid)
  );
  CREATE TABLE IF NOT EXISTS visit_salt (id INTEGER PRIMARY KEY CHECK (id = 1), salt TEXT NOT NULL);
`);
// Oct 2026: visitor country (2-letter code from services/geo.ts; the IP itself is never stored)
{
  const cols = new Set((db.prepare('PRAGMA table_info(visits)').all() as any[]).map(c => c.name));
  if (!cols.has('country')) db.exec('ALTER TABLE visits ADD COLUMN country TEXT');
}

function salt(): string {
  const row = db.prepare('SELECT salt FROM visit_salt WHERE id = 1').get();
  if (row?.salt) return row.salt;
  const s = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT OR IGNORE INTO visit_salt (id, salt) VALUES (1, ?)').run(s);
  return db.prepare('SELECT salt FROM visit_salt WHERE id = 1').get().salt;
}
const SALT = process.env.VISITOR_SALT || salt();
const hash = (ip: string) => crypto.createHash('sha256').update(SALT + ip).digest('hex').slice(0, 32);

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|uptime|curl|wget|python|axios|node-fetch|headless|lighthouse/i;
const ONLINE_MS = 5 * 60000;
const online = new Map<string, { at: number; signedIn: boolean }>();
const written = new Map<string, number>(); // vid|day → last DB write (at most once a minute per visitor)

const upsert = db.prepare(`
  INSERT INTO visits (day, vid, hits, signed_in, first_seen, last_seen, country) VALUES (?, ?, 1, ?, ?, ?, ?)
  ON CONFLICT(day, vid) DO UPDATE SET hits = hits + 1, signed_in = MAX(signed_in, excluded.signed_in), last_seen = excluded.last_seen,
    country = COALESCE(excluded.country, country)
`);

/** Express middleware: counts browser visits to the API (the site calls it on every page). */
export function trackVisit(req: express.Request, _res: express.Response, next: express.NextFunction) {
  try {
    const ua = req.get('user-agent') || '';
    if (req.access === 'admin' || req.query.token || !ua || BOT.test(ua) || req.path.startsWith('/admin')) return next();
    const ip = req.ip || '';
    if (!ip) return next();
    const vid = hash(ip);
    const now = Date.now();
    const signedIn = !!req.user;
    online.set(vid, { at: now, signedIn: signedIn || !!online.get(vid)?.signedIn });
    const day = new Date(now).toISOString().slice(0, 10);
    const k = `${vid}|${day}`;
    if ((written.get(k) || 0) < now - 60000) {
      written.set(k, now);
      const iso = new Date(now).toISOString();
      upsert.run(day, vid, signedIn ? 1 : 0, iso, iso, countryOf(ip));
    }
  } catch { /* counting never breaks a request */ }
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of online) if (v.at < now - ONLINE_MS) online.delete(k);
  for (const [k, t] of written) if (t < now - 2 * 86400000) written.delete(k);
}, 60000).unref();
setInterval(() => {
  try { db.prepare("DELETE FROM visits WHERE day < date('now', '-90 days')").run(); } catch { /* ignore */ }
}, 6 * 3600000).unref();

const since = (days: number) => new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);

export function visitorStats() {
  const now = Date.now();
  let onlineNow = 0, onlineSignedIn = 0;
  for (const v of online.values()) if (v.at >= now - ONLINE_MS) { onlineNow++; if (v.signedIn) onlineSignedIn++; }
  const uniq = (days: number) => db.prepare('SELECT COUNT(DISTINCT vid) AS n FROM visits WHERE day >= ?').get(since(days)).n as number;
  const daily = db.prepare(`
    SELECT day, COUNT(*) AS visitors, SUM(signed_in) AS signedIn, SUM(hits) AS hits FROM visits WHERE day >= ? GROUP BY day ORDER BY day
  `).all(since(30)) as { day: string; visitors: number; signedIn: number; hits: number }[];
  const returning = db.prepare('SELECT COUNT(*) AS n FROM (SELECT vid FROM visits WHERE day >= ? GROUP BY vid HAVING COUNT(*) > 1)').get(since(30)).n as number;
  const first = db.prepare('SELECT MIN(day) AS d FROM visits').get()?.d || null;
  // visitors by country (one row per visitor: the country of their latest day)
  const byCountry = (days: number) => db.prepare(`
    SELECT COALESCE(country, '??') AS country, COUNT(*) AS visitors, SUM(signed) AS signedIn FROM (
      SELECT vid, MAX(signed_in) AS signed, (SELECT v2.country FROM visits v2 WHERE v2.vid = v.vid AND v2.day >= ? AND v2.country IS NOT NULL ORDER BY v2.day DESC LIMIT 1) AS country
      FROM visits v WHERE day >= ? GROUP BY vid
    ) GROUP BY COALESCE(country, '??') ORDER BY visitors DESC`).all(since(days), since(days)) as { country: string; visitors: number; signedIn: number }[];
  const countriesSince = db.prepare('SELECT MIN(day) AS d FROM visits WHERE country IS NOT NULL').get()?.d || null;
  return {
    onlineNow, onlineSignedIn, onlineWindowMin: ONLINE_MS / 60000,
    today: uniq(1), last7: uniq(7), last30: uniq(30), returning30: returning,
    daily, countingSince: first,
    countries: { last7: byCountry(7), last30: byCountry(30), since: countriesSince, geo: geoStatus() }
  };
}
