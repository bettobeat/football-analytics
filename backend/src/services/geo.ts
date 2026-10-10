/**
 * Country from an IP address, offline (Oct 2026) — for the visitor counts only. The IP is looked up in memory at the
 * moment of the visit; only the 2-letter country code is kept (next to the hashed visitor id). No IP is stored.
 *
 * Data: "IP to Country Lite" by DB-IP (https://db-ip.com), licence CC BY 4.0 — attribution on the privacy page and the
 * admin card. The server downloads the monthly file itself (DATA_DIR/geo, a few MB) and refreshes it every ~35 days.
 * IPv6 ranges are matched on their first 64 bits (country data is never finer than that).
 * GEO_OFF=1 switches it off.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import https from 'https';
import net from 'net';
import readline from 'readline';
import { PassThrough } from 'stream';
import logger from '../utils/logger';

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const DIR = path.join(DATA_DIR, 'geo');
const FILE = path.join(DIR, 'dbip-country-lite.csv.gz');
const MAX_AGE = 35 * 86400000;

let v4s: Uint32Array | null = null, v4e: Uint32Array | null = null, v4c: Uint16Array | null = null;
let v6s: BigUint64Array | null = null, v6e: BigUint64Array | null = null, v6c: Uint16Array | null = null;
let codes: string[] = [];
let loadedAt: string | null = null;
let status = 'not loaded';

const v4num = (ip: string) => ip.split('.').reduce((a, p) => a * 256 + (parseInt(p, 10) & 255), 0) >>> 0;
/** first 64 bits of an IPv6 address */
function v6hi(ip: string): bigint {
  let s = ip;
  const z = s.indexOf('%'); if (z >= 0) s = s.slice(0, z);
  if (s.includes('.')) { // embedded IPv4 at the end
    const i = s.lastIndexOf(':'); const n = v4num(s.slice(i + 1));
    s = `${s.slice(0, i + 1)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [h, t] = s.split('::');
  const head = h ? h.split(':') : [];
  const tail = t !== undefined ? (t ? t.split(':') : []) : [];
  const groups = t !== undefined ? [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail] : head;
  let v = 0n;
  for (let i = 0; i < 4; i++) v = (v << 16n) | BigInt(parseInt(groups[i] || '0', 16) & 0xffff);
  return v;
}

/** Parse a DB-IP country CSV(.gz): "start,end,CC" per line. */
export async function loadGeo(file = FILE, minV4 = 1000) {
  const s4: number[] = [], e4: number[] = [], c4: number[] = [];
  const s6: bigint[] = [], e6: bigint[] = [], c6: number[] = [];
  const idx = new Map<string, number>();
  const ci = (cc: string) => { let i = idx.get(cc); if (i === undefined) { i = idx.size; idx.set(cc, i); } return i; };
  const input = fs.createReadStream(file).pipe(file.endsWith('.gz') ? zlib.createGunzip() : new PassThrough());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    const parts = line.replace(/"/g, '').split(',');
    if (parts.length < 3) continue;
    const [a, b, cc] = parts;
    const code = cc.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) continue;
    if (net.isIPv4(a) && net.isIPv4(b)) { s4.push(v4num(a)); e4.push(v4num(b)); c4.push(ci(code)); }
    else if (net.isIPv6(a) && net.isIPv6(b)) { s6.push(v6hi(a)); e6.push(v6hi(b)); c6.push(ci(code)); }
  }
  if (s4.length < minV4) throw new Error(`only ${s4.length} IPv4 ranges — file looks broken`);
  v4s = Uint32Array.from(s4); v4e = Uint32Array.from(e4); v4c = Uint16Array.from(c4);
  v6s = BigUint64Array.from(s6); v6e = BigUint64Array.from(e6); v6c = Uint16Array.from(c6);
  codes = [...idx.keys()];
  loadedAt = new Date().toISOString();
  status = `${s4.length} IPv4 + ${s6.length} IPv6 ranges`;
  return { v4: s4.length, v6: s6.length };
}

function find<T extends number | bigint>(starts: ArrayLike<T>, ends: ArrayLike<T>, x: T): number {
  let lo = 0, hi = starts.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= x) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return best >= 0 && x <= ends[best] ? best : -1;
}

/** 2-letter country code, or null (unknown, private address, data not loaded). */
export function countryOf(ipIn: string): string | null {
  try {
    let ip = ipIn.trim();
    if (ip.startsWith('::ffff:') && net.isIPv4(ip.slice(7))) ip = ip.slice(7);
    if (net.isIPv4(ip) && v4s) { const i = find(v4s, v4e!, v4num(ip)); return i >= 0 ? codes[v4c![i]] : null; }
    if (net.isIPv6(ip) && v6s) { const i = find(v6s, v6e!, v6hi(ip)); return i >= 0 ? codes[v6c![i]] : null; }
  } catch { /* unknown */ }
  return null;
}

export const geoStatus = () => ({ loaded: !!v4s, loadedAt, status, source: 'IP to Country Lite by DB-IP (db-ip.com), CC BY 4.0' });

function download(url: string, dst: string, redirects = 3): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'SportLikely/1.0 (visitor countries)' }, timeout: 120000 }, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume(); return download(new URL(res.headers.location, url).toString(), dst, redirects - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`download answered ${res.statusCode}`)); }
      const out = fs.createWriteStream(dst);
      res.pipe(out);
      out.on('finish', () => resolve());
      out.on('error', reject);
      res.on('error', reject);
    }).on('timeout', function (this: any) { this.destroy(new Error('download timeout')); }).on('error', reject);
  });
}

async function refresh() {
  fs.mkdirSync(DIR, { recursive: true });
  const now = new Date();
  // the new month's file appears at the start of the month: try this month, then the previous one
  for (const back of [0, 1]) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const tmp = FILE + '.part';
    try {
      await download(`https://download.db-ip.com/free/dbip-country-lite-${ym}.csv.gz`, tmp);
      await loadGeo(tmp); // check it parses before replacing the old one
      fs.renameSync(tmp, FILE);
      logger.info(`geo: DB-IP country data ${ym} loaded (${status})`);
      return;
    } catch (e: any) {
      fs.rmSync(tmp, { force: true });
      logger.warn(`geo: ${ym} not loaded: ${e.message}`);
    }
  }
  throw new Error('no country data could be downloaded');
}

/** At start-up: load the saved file, download a new one when missing or older than ~35 days. Monthly check after. */
export function startGeo() {
  if (process.env.GEO_OFF === '1') { status = 'off (GEO_OFF=1)'; return; }
  const run = async () => {
    try {
      const fresh = fs.existsSync(FILE) && Date.now() - fs.statSync(FILE).mtimeMs < MAX_AGE;
      if (fs.existsSync(FILE) && !v4s) await loadGeo().catch(e => { status = `saved file unreadable: ${e.message}`; });
      if (!fresh) await refresh();
    } catch (e: any) {
      status = v4s ? status : `not loaded: ${e.message}`;
      logger.warn(`geo: ${e.message}`);
    }
  };
  setTimeout(() => { run(); }, 30000).unref();
  setInterval(() => { run(); }, 24 * 3600000).unref();
}
