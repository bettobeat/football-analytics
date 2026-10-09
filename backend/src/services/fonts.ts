import fs from 'fs';
import path from 'path';
import type express from 'express';
import logger from '../utils/logger';

/**
 * Self-hosted fonts (Oct 2026, privacy): visitors' browsers no longer contact Google Fonts (which sends their IP
 * address to Google — an EU privacy issue). The server downloads the four font files once from Google's font CDN,
 * keeps them on the data volume and serves them from sportlikely.com.
 */
const FILES: Record<string, string> = {
  'manrope-latin.woff2': 'https://fonts.gstatic.com/s/manrope/v20/xn7gYHE41ni1AdIRggexSg.woff2',
  'manrope-latin-ext.woff2': 'https://fonts.gstatic.com/s/manrope/v20/xn7gYHE41ni1AdIRggmxSuXd.woff2',
  'unbounded-latin.woff2': 'https://fonts.gstatic.com/s/unbounded/v12/Yq6W-LOTXCb04q32xlpwu8Zf.woff2',
  'unbounded-latin-ext.woff2': 'https://fonts.gstatic.com/s/unbounded/v12/Yq6W-LOTXCb04q32xlpwtcZfrxE.woff2'
};
const DIR = path.join(process.env.DATA_DIR || path.resolve(process.cwd(), 'data'), 'fonts');
const mem = new Map<string, Buffer>();
const pending = new Map<string, Promise<Buffer>>();

async function load(name: string): Promise<Buffer> {
  const hit = mem.get(name);
  if (hit) return hit;
  const file = path.join(DIR, name);
  if (fs.existsSync(file)) { const b = fs.readFileSync(file); mem.set(name, b); return b; }
  let p = pending.get(name);
  if (!p) {
    p = (async () => {
      const res = await fetch(FILES[name]);
      if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
      const b = Buffer.from(await res.arrayBuffer());
      try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file, b); } catch (e: any) { logger.warn(`fonts: could not store ${name}: ${e.message}`); }
      mem.set(name, b);
      return b;
    })().finally(() => pending.delete(name));
    pending.set(name, p);
  }
  return p;
}

export function fontRoute(req: express.Request, res: express.Response) {
  const name = req.params.file;
  if (!FILES[name]) return res.status(404).end();
  load(name)
    .then(b => res.type('font/woff2').set('Cache-Control', 'public, max-age=31536000, immutable').set('Access-Control-Allow-Origin', '*').send(b))
    .catch(e => { logger.warn(`fonts: ${e.message}`); res.status(502).end(); });
}

/** Warm the cache at start-up so the first visitor doesn't wait. */
export function warmFonts() {
  for (const n of Object.keys(FILES)) load(n).catch(e => logger.warn(`fonts warm-up: ${e.message}`));
}

const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF';
const face = (fam: string, file: string, weight: string, range: string) =>
  `@font-face{font-family:'${fam}';font-style:normal;font-weight:${weight};font-display:swap;src:url(/fonts/${file}) format('woff2');unicode-range:${range}}`;

/** <head> markup replacing the Google Fonts links. */
export const FONT_HEAD = [
  '<link rel="preload" href="/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin />',
  '<link rel="preload" href="/fonts/unbounded-latin.woff2" as="font" type="font/woff2" crossorigin />',
  `<style>${face('Manrope', 'manrope-latin-ext.woff2', '200 800', LATIN_EXT)}${face('Manrope', 'manrope-latin.woff2', '200 800', LATIN)}${face('Unbounded', 'unbounded-latin-ext.woff2', '200 900', LATIN_EXT)}${face('Unbounded', 'unbounded-latin.woff2', '200 900', LATIN)}</style>`
].join('\n    ');
