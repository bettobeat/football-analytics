/**
 * Beta testers (Oct 2026): invite links that give free Pro for N days (default 21), and the tester list for the CRM.
 *
 * - The admin / staff with 'customers.plan' make an invite link (sportlikely.com/join/<code>), optionally with a limit of
 *   people, and can close it any time.
 * - Whoever opens the link and signs in (or creates an account) joins: Pro until join + days. A paid plan that runs
 *   longer is never shortened. Each account joins once. Plan changes are logged in plan_events with source 'admin'
 *   (not revenue).
 * - Tester feedback (the Feedback button) goes into the CRM support inbox as topic 'feedback'.
 */
import crypto from 'crypto';
import { db } from '../db';
import { setPlan, userById } from './auth';

db.exec(`
  CREATE TABLE IF NOT EXISTS tester_invites (
    code TEXT PRIMARY KEY, label TEXT, days INTEGER NOT NULL DEFAULT 21, max_uses INTEGER, open INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, created_by INTEGER
  );
  CREATE TABLE IF NOT EXISTS testers (
    user_id INTEGER PRIMARY KEY, code TEXT NOT NULL, joined_at TEXT NOT NULL, until TEXT NOT NULL
  );
`);

export class TesterError extends Error { constructor(public status: number, msg: string) { super(msg); } }

const CODE_RE = /^[A-Za-z0-9]{6,32}$/;
const usesOf = (code: string) => (db.prepare('SELECT COUNT(*) AS n FROM testers WHERE code = ?').get(code) as any).n as number;

export function createInvite(label: unknown, days: unknown, maxUses: unknown, by: number) {
  const d = Math.round(Number(days) || 21);
  if (d < 1 || d > 90) throw new TesterError(400, 'Days: 1 to 90.');
  const m = maxUses === null || maxUses === undefined || maxUses === '' ? null : Math.round(Number(maxUses));
  if (m !== null && (!Number.isFinite(m) || m < 1 || m > 10000)) throw new TesterError(400, 'Limit: 1 to 10,000 people, or empty for no limit.');
  const code = crypto.randomBytes(9).toString('base64url').replace(/[-_]/g, '').slice(0, 10);
  db.prepare('INSERT INTO tester_invites (code, label, days, max_uses, open, created_at, created_by) VALUES (?, ?, ?, ?, 1, ?, ?)')
    .run(code, String(label || '').trim().slice(0, 60) || null, d, m, new Date().toISOString(), by);
  return code;
}

export function setInviteOpen(code: string, open: boolean) {
  const r = db.prepare('UPDATE tester_invites SET open = ? WHERE code = ?').run(open ? 1 : 0, code);
  if (!Number(r.changes)) throw new TesterError(404, 'Invite not found.');
}

/** Public: is this invite usable? (no personal data) */
export function inviteInfo(code: string) {
  if (!CODE_RE.test(code)) return null;
  const r = db.prepare('SELECT code, days, max_uses, open FROM tester_invites WHERE code = ?').get(code) as any;
  if (!r) return null;
  const full = r.max_uses !== null && usesOf(code) >= r.max_uses;
  return { valid: !!r.open && !full, closed: !r.open, full, days: r.days, plan: 'pro' };
}

export function joinAsTester(userId: number, code: string) {
  if (!CODE_RE.test(code)) throw new TesterError(404, 'This invite link is not valid.');
  const inv = db.prepare('SELECT * FROM tester_invites WHERE code = ?').get(code) as any;
  if (!inv) throw new TesterError(404, 'This invite link is not valid.');
  const already = db.prepare('SELECT * FROM testers WHERE user_id = ?').get(userId) as any;
  if (already) return { already: true, until: already.until as string };
  if (!inv.open) throw new TesterError(410, 'This invite link has been closed.');
  if (inv.max_uses !== null && usesOf(code) >= inv.max_uses) throw new TesterError(410, 'This invite link is full.');
  const u = userById(userId);
  if (!u) throw new TesterError(404, 'Account not found.');
  const until = new Date(Date.now() + inv.days * 86400000).toISOString();
  // never cut a longer paid plan short
  const paidLonger = (u.plan === 'premium' || u.plan === 'pro') && (!u.premiumUntil || u.premiumUntil > until) && !(u as any).isAdmin;
  // (a longer Premium is kept as it is: switching it to a short Pro would end their paid plan early)
  const end = paidLonger ? (u.premiumUntil || until) : until;
  if (!paidLonger) setPlan(userId, 'pro', until, 'admin');
  db.prepare('INSERT INTO testers (user_id, code, joined_at, until) VALUES (?, ?, ?, ?)').run(userId, code, new Date().toISOString(), end);
  return { already: false, until: end };
}

export const testerOf = (userId: number) =>
  (db.prepare('SELECT until FROM testers WHERE user_id = ?').get(userId) as any) || null;

/** CRM: invites with use counts, and the testers with activity and feedback counts. */
export function testerOverview() {
  const invites = (db.prepare('SELECT * FROM tester_invites ORDER BY created_at DESC').all() as any[]).map(r => ({
    code: r.code, label: r.label, days: r.days, maxUses: r.max_uses, open: !!r.open, createdAt: r.created_at, uses: usesOf(r.code)
  }));
  const now = new Date().toISOString();
  const testers = (db.prepare(`
    SELECT t.user_id AS id, t.code, t.joined_at AS joinedAt, t.until, u.email, u.name, u.email_verified AS verified, u.last_login_at AS lastLoginAt,
      (SELECT COUNT(*) FROM contact_messages c WHERE c.user_id = t.user_id AND c.topic = 'feedback') AS feedback
    FROM testers t JOIN users u ON u.id = t.user_id ORDER BY t.joined_at DESC`).all() as any[])
    .map(r => ({ ...r, verified: !!r.verified, active: r.until > now }));
  return { invites, testers };
}
