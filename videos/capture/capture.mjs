// SportLikely guide-video capture.
// Opens a real Chrome window, lets you log in, then takes razor-sharp
// screenshots of every page the video needs. No recording, no mouse wheel.
import { chromium } from 'playwright';
import fs from 'node:fs';
import readline from 'node:readline';

const BASE = 'https://sportlikely.com';
const OUT = 'shots';
const SCALE = 1.5;               // 1920x1080 viewport rendered at 2880x1620
const MAX_H = 5200;              // tallest page capture (CSS px)
fs.mkdirSync(OUT, { recursive: true });

const ask = (q) => new Promise((res) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, (a) => { rl.close(); res(a); });
});

const browser = await chromium.launch({ headless: false, channel: 'chrome' }).catch(() => chromium.launch({ headless: false }));
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: SCALE, locale: 'en-US' });
const page = await ctx.newPage();

async function settle() {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(900);
  // scroll once to the bottom so lazy content renders, then back up
  await page.evaluate(async () => { for (let y = 0; y < Math.min(document.body.scrollHeight, 6000); y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(600);
}
async function shot(name) {
  const h = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
  const height = Math.min(h, MAX_H);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, clip: { x: 0, y: 0, width: 1920, height } });
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ url: page.url(), height, viewport: 1080, scale: SCALE }));
  console.log(`✔ ${name}  (${height}px)`);
}
async function go(path) { await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await settle(); }
async function tryClick(locator, label) {
  try { await locator.first().click({ timeout: 4000 }); await page.waitForTimeout(1200); return true; }
  catch { console.log(`  (skipped: ${label} not found)`); return false; }
}

await go('/');
await ask('\n➡  Log in to your account in the Chrome window, then come back here and press ENTER... ');
await go('/');

// 1. Home
await shot('01-home');

// 2. Matches
await go('/matches');
await shot('02-matches');

// 3. Match page: first match link on the matches page
const matchHref = await page.evaluate(() => {
  const a = [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href'))
    .find(h => /\/(match|matches|game|fixture)\/[^/]+/.test(h) && !/^\/matches\/?$/.test(h));
  return a || null;
});
console.log('match link:', matchHref);
if (matchHref) {
  await go(matchHref);
  await shot('03-match-top');
  // Your picks: click the first pick option, then capture
  await tryClick(page.getByRole('button', { name: /^(home|draw|away|over|under|yes|no)$/i }), 'pick button');
  await shot('04-match-pick-made');
  await tryClick(page.getByText(/^H2H$/i), 'H2H tab');
  await shot('05-match-h2h');
  await tryClick(page.getByText(/^(Form|Stats|Lineups|Standings)$/i), 'second tab');
  await shot('06-match-tab2');

  // Team page from the match page
  const teamHref = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).find(h => /\/team\//.test(h));
    return a || null;
  });
  console.log('team link:', teamHref);
  if (teamHref) { await go(teamHref); await shot('07-team'); }
}

// 4. Search (type a club name, capture the dropdown)
await go('/');
const search = page.getByPlaceholder(/search/i).first();
try { await search.click({ timeout: 4000 }); await search.type('Barcelona', { delay: 90 }); await page.waitForTimeout(1200); await shot('08-search'); }
catch { console.log('  (skipped: search box not found)'); }

// 5. Plans, My picks, Accuracy, Favorites, Upset watch
for (const [p, n] of [['/premium', '09-plans'], ['/my-picks', '10-my-picks'], ['/accuracy', '11-accuracy'], ['/favorites', '12-favorites'], ['/upset-watch', '13-upset-watch']]) {
  try { await go(p); await shot(n); } catch (e) { console.log(`  (skipped ${p}: ${e.message.split('\n')[0]})`); }
}

// 6. A finished match (result + whether we were right): first link under results/finished, if any
await go('/matches');
const doneHref = await page.evaluate(() => {
  const els = [...document.querySelectorAll('a[href]')];
  const hit = els.find(a => /FT|Final|\d+\s*[-–:]\s*\d+/.test(a.textContent || '') && /\/(match|game)\//.test(a.getAttribute('href') || ''));
  return hit ? hit.getAttribute('href') : null;
});
if (doneHref) { await go(doneHref); await shot('14-match-finished'); } else console.log('  (no finished match found on the list — fine, I will use the accuracy page instead)');

console.log('\n✅ Done. Send me the "shots" folder (it is inside videos\\capture).');
await browser.close();
