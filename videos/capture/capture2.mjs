// SportLikely guide-video capture, pass 2: the Man City – PSG match with the
// prediction revealed, every tab, and a few finished matches from "Latest results".
import { chromium } from 'playwright';
import fs from 'node:fs';
import readline from 'node:readline';

const BASE = 'https://sportlikely.com';
const OUT = 'shots2';
const SCALE = 1.5;
const MAX_H = 5200;
const MATCH = '/match/575353'; // Man City – PSG (Wed 14 Oct)
fs.mkdirSync(OUT, { recursive: true });

const ask = (q) => new Promise((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); res(a); }); });
const browser = await chromium.launch({ headless: false, channel: 'chrome' }).catch(() => chromium.launch({ headless: false }));
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: SCALE, locale: 'en-US' });
// hide the scrollbar and the floating accessibility button in every page
await ctx.addInitScript(() => {
  const css = document.createElement('style');
  css.textContent = `::-webkit-scrollbar{display:none} html{scrollbar-width:none}`;
  document.addEventListener('DOMContentLoaded', () => document.head.appendChild(css));
});
const page = await ctx.newPage();

async function hideFloating() {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 120 && r.height < 120 && r.left < 160 && r.bottom > innerHeight - 200) el.style.display = 'none';
    }
  });
}
async function settle() {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(900);
  await page.evaluate(async () => { for (let y = 0; y < Math.min(document.body.scrollHeight, 6000); y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(600);
  await hideFloating();
}
async function shot(name) {
  await hideFloating();
  const h = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
  const height = Math.min(h, MAX_H);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, clip: { x: 0, y: 0, width: 1920, height } });
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ url: page.url(), height }));
  console.log(`✔ ${name}  (${height}px)`);
}
async function go(path) { await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await settle(); }
async function clickText(re, label) {
  try { await page.getByText(re, { exact: false }).first().click({ timeout: 4000 }); await page.waitForTimeout(1500); await hideFloating(); return true; }
  catch { console.log(`  (skipped: ${label})`); return false; }
}

await go('/');
await ask('\n➡  Log in in the Chrome window (if not already), then press ENTER here... ');

// Home + matches again, now without the scrollbar / floating button
await go('/'); await shot('01-home');
await go('/matches'); await shot('02-matches');

// Man City – PSG
await go(MATCH);
await shot('20-match-hidden');
await clickText(/Reveal prediction/i, 'reveal button');
await shot('21-match-prediction');
for (const [tab, n] of [[/^Statistics/, '22-statistics'], [/^Lineups/, '23-lineups'], [/^Schedule/, '24-schedule'], [/^H2H$/, '25-h2h'], [/^Standings/, '26-standings']]) {
  const ok = await clickText(tab, `tab ${n}`);
  if (ok) await shot(n);
}
// back to the prediction tab, scrolled so the full card is visible
await clickText(/^Prediction$/, 'prediction tab');
await shot('27-match-prediction-again');

// Team page from the match (Man City)
const teamHref = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).find(h => /\/team\//.test(h)) || null);
if (teamHref) { await go(teamHref); await shot('28-team'); }

// Finished matches from "Latest results" on the home page
await go('/');
const resultLinks = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('h2,h3')].filter(h => /latest results/i.test(h.textContent || ''));
  const box = heads[0]?.closest('section,div,article');
  const links = box ? [...box.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => /\/match\//.test(h)) : [];
  return [...new Set(links)].slice(0, 4);
});
console.log('finished match links:', resultLinks);
let i = 30;
for (const h of resultLinks) { await go(h); await clickText(/Reveal prediction/i, 'reveal'); await shot(`${i++}-finished`); }

// Accuracy + plans + my picks once more (no scrollbar)
for (const [p, n] of [['/accuracy', '40-accuracy'], ['/premium', '41-plans'], ['/my-picks', '42-my-picks'], ['/draw-picks', '43-draw-picks'], ['/upset-watch', '44-upset-watch']]) {
  try { await go(p); await shot(n); } catch (e) { console.log(`  (skipped ${p})`); }
}

console.log('\n✅ Done. Tell me "done" and I will take the shots2 folder.');
await browser.close();
