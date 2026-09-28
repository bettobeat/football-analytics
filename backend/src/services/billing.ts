/**
 * Plans and the monthly unlock allowance.
 *
 *   Free     — signed-in: FREE_DAILY_UNLOCKS (default 2) full match unlocks a day (UTC); signed out: nothing.
 *   Premium  — $15 / month: PREMIUM_UNLOCKS (default 60) match unlocks per calendar month (UTC). An unlocked match
 *              stays open for good (reopening is free); finished matches are always open; team / player stats and
 *              the track record in full.
 *   Pro      — $30 / month (or yearly): unlimited, plus draw alerts.
 *
 * Payments: no provider is connected yet. While BILLING_TEST_MODE=1 is set (Railway), a signed-in user can switch
 * their own plan from the Premium page to try the flow ("test checkout"). Remove the variable before launch; a real
 * provider (Paddle / Lemon Squeezy — Stripe does not serve Israeli businesses) will call setPlan() from its webhook.
 */
import { db } from '../db';
import { AuthError, setPlan, verificationRequired, type User, type Plan } from './auth';

export const PREMIUM_UNLOCKS = parseInt(process.env.PREMIUM_UNLOCKS || '60', 10);
export const FREE_DAILY_UNLOCKS = parseInt(process.env.FREE_DAILY_UNLOCKS || '2', 10);
/** Money-back window shown on the plans page (the payment provider does the refund). */
export const REFUND_DAYS = 3;
export const billingTestMode = process.env.BILLING_TEST_MODE === '1';

export const PLANS: { id: string; plan?: string; name: string; price: number; period: string; unlocks: number | null }[] = [
  { id: 'premium', name: 'Premium', price: 15, period: 'month', unlocks: PREMIUM_UNLOCKS },
  { id: 'pro', name: 'Pro', price: 30, period: 'month', unlocks: null },
  { id: 'pro-6m', plan: 'pro', name: 'Pro 6 months', price: 144, period: '6 months', unlocks: null }, // 20% off 6 × $30
  { id: 'pro-year', plan: 'pro', name: 'Pro yearly', price: 249, period: 'year', unlocks: null }
];

db.exec(`
  CREATE TABLE IF NOT EXISTS match_unlocks (
    user_id  INTEGER NOT NULL,
    match_id INTEGER NOT NULL,
    at       TEXT    NOT NULL,
    PRIMARY KEY (user_id, match_id)
  );
  CREATE INDEX IF NOT EXISTS idx_unlocks_user_at ON match_unlocks(user_id, at);
`);
// which allowance an unlock came from: 'premium' (monthly) or 'free' (daily); older rows were all Premium
if (!(db.prepare(`PRAGMA table_info(match_unlocks)`).all() as any[]).some(c => c.name === 'kind'))
  db.exec(`ALTER TABLE match_unlocks ADD COLUMN kind TEXT NOT NULL DEFAULT 'premium'`);

const DONE = new Set(['FINISHED', 'AWARDED', 'FT', 'AET', 'PEN']);
export const isFinished = (status: string) => DONE.has(String(status || ''));

function monthStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}
function dayStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}
function nextDayStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}
function nextMonthStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}

// small per-user cache: the match lists call this on every request
const idCache = new Map<number, { at: number; ids: Set<number> }>();

/** Every match this user has unlocked (last 120 days is plenty: older matches are finished and open anyway). */
export function unlockedIds(userId: number): Set<number> {
  const c = idCache.get(userId);
  if (c && Date.now() - c.at < 30000) return c.ids;
  const since = new Date(Date.now() - 120 * 86400000).toISOString();
  const ids = new Set((db.prepare('SELECT match_id FROM match_unlocks WHERE user_id = ? AND at >= ?').all(userId, since) as any[]).map(r => Number(r.match_id)));
  idCache.set(userId, { at: Date.now(), ids });
  if (idCache.size > 5000) idCache.delete(idCache.keys().next().value as number);
  return ids;
}

export function unlockStatus(user: User | null, access: string) {
  const unlimited = access === 'pro' || access === 'admin';
  if (!user) return { plan: 'anon', unlimited: false, allowance: FREE_DAILY_UNLOCKS, period: 'day', used: 0, left: 0, resetsAt: nextDayStart(), testMode: billingTestMode };
  const daily = access === 'free';
  const since = daily ? dayStart() : monthStart();
  const kind = daily ? 'free' : 'premium';
  const used = (db.prepare('SELECT COUNT(*) n FROM match_unlocks WHERE user_id = ? AND at >= ? AND kind = ?').get(user.id, since, kind) as any).n;
  const allowance = access === 'premium' ? PREMIUM_UNLOCKS : daily ? FREE_DAILY_UNLOCKS : 0;
  return {
    plan: access === 'admin' ? 'admin' : user.plan,
    unlimited,
    allowance,
    period: daily ? 'day' : 'month',
    used,
    left: unlimited ? null : Math.max(0, allowance - used),
    resetsAt: daily ? nextDayStart() : nextMonthStart(),
    testMode: billingTestMode
  };
}

/**
 * Spend one unlock on a match (Premium). Already unlocked or finished: free. Out of unlocks: 402 with upgrade: true.
 * Pro / admin never need to unlock (they see everything).
 */
export function unlockMatch(user: User, access: string, matchId: number, status: string) {
  if (access === 'pro' || access === 'admin') return { unlocked: true, charged: false, ...unlockStatus(user, access) };
  if (access !== 'premium' && access !== 'free') throw Object.assign(new AuthError(401, 'Create a free account to unlock matches.'), { upgrade: false });
  // free picks need a confirmed email, so nobody farms them with throwaway accounts
  if (access === 'free' && verificationRequired && !user.emailVerified) throw new AuthError(403, 'Confirm your email to use your free picks.');
  const have = db.prepare('SELECT 1 FROM match_unlocks WHERE user_id = ? AND match_id = ?').get(user.id, matchId);
  if (have || isFinished(status)) return { unlocked: true, charged: false, ...unlockStatus(user, access) };
  const st = unlockStatus(user, access);
  if ((st.left ?? 0) <= 0)
    throw Object.assign(
      new AuthError(402, access === 'free' ? `You've used your ${FREE_DAILY_UNLOCKS} free picks today. Premium opens 60 matches a month, Pro all of them.` : `You've used all ${PREMIUM_UNLOCKS} unlocks this month. Pro is unlimited.`),
      { upgrade: true }
    );
  db.prepare('INSERT OR IGNORE INTO match_unlocks (user_id, match_id, at, kind) VALUES (?, ?, ?, ?)').run(user.id, matchId, new Date().toISOString(), access === 'free' ? 'free' : 'premium');
  idCache.delete(user.id);
  return { unlocked: true, charged: true, ...unlockStatus(user, access) };
}

/** Test checkout (BILLING_TEST_MODE=1 only): the signed-in user switches their own plan. */
export function testCheckout(user: User, planId: string) {
  if (!billingTestMode) throw new AuthError(403, 'Payments are not open yet.');
  const plan = PLANS.find(p => p.id === planId);
  const target: Plan = planId === 'free' ? 'free' : ((plan as any)?.plan || plan?.id) as Plan;
  if (!target || !['free', 'premium', 'pro'].includes(target)) throw new AuthError(400, 'Unknown plan.');
  const days = plan?.period === 'year' ? 365 : plan?.period === '6 months' ? 183 : 31;
  const until = target === 'free' ? null : new Date(Date.now() + days * 86400000).toISOString();
  return setPlan(user.id, target, until);
}

export function unlockStats() {
  const since = monthStart();
  const r: any = db.prepare(`SELECT COUNT(*) n, COUNT(DISTINCT user_id) users FROM match_unlocks WHERE at >= ? AND kind = 'premium'`).get(since);
  const out = db.prepare(`SELECT COUNT(*) n FROM (SELECT user_id, COUNT(*) c FROM match_unlocks WHERE at >= ? AND kind = 'premium' GROUP BY user_id HAVING c >= ?)`).get(since, PREMIUM_UNLOCKS) as any;
  const free: any = db.prepare(`SELECT COUNT(*) n, COUNT(DISTINCT user_id) users FROM match_unlocks WHERE at >= ? AND kind = 'free'`).get(since);
  return { month: since.slice(0, 7), unlocks: r.n, users: r.users, usersAtLimit: out.n, allowance: PREMIUM_UNLOCKS, freeUnlocks: free.n, freeUsers: free.users, freeDaily: FREE_DAILY_UNLOCKS };
}
