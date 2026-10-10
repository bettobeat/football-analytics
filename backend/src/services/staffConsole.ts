/**
 * Staff console login (Oct 2026): a second, separate sign-in for the CRM and the Users/admin area.
 *
 * - Every staff member (admin included) has a console username + console password, different from their account
 *   password. After each account sign-in (each session), opening the CRM or Users asks for them once; the session is
 *   then marked console-unlocked (sessions.console_ok). /api/crm/* and /api/admin/* refuse locked sessions.
 * - Usernames are chosen by the company (whoever sets the login). The admin sets up their own on first use.
 * - People with the 'team' permission can set / reset another staff member's console login (with a fresh two-step
 *   code, like every team change). Only the admin can do it for someone whose role manages the team. A login set by
 *   someone else must be changed by its owner at the next console sign-in.
 * - Forgot it: the admin can reset their own with account password + two-step code; staff ask a manager.
 * - Passwords: scrypt (same as accounts), at least 10 characters, not the account password, not the username.
 *   5 wrong tries per 15 minutes per account. Everything goes to the security log.
 */
import { db } from '../db';
import { hashPassword, verifyPassword } from './auth';

db.exec(`
  CREATE TABLE IF NOT EXISTS staff_console (
    user_id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, pass_hash TEXT NOT NULL,
    must_change INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, updated_by INTEGER
  );
`);
{
  const cols = new Set((db.prepare('PRAGMA table_info(sessions)').all() as any[]).map(c => c.name));
  if (!cols.has('console_ok')) db.exec('ALTER TABLE sessions ADD COLUMN console_ok INTEGER NOT NULL DEFAULT 0');
}

export class ConsoleError extends Error { constructor(public status: number, msg: string) { super(msg); } }

const USER_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/i;
const now = () => new Date().toISOString();

export function consoleRow(userId: number): { username: string; must_change: number; updated_at: string } | null {
  return (db.prepare('SELECT username, must_change, updated_at FROM staff_console WHERE user_id = ?').get(userId) as any) || null;
}
export const sessionUnlocked = (tokenHash: string) =>
  !!tokenHash && !!(db.prepare('SELECT console_ok FROM sessions WHERE token_hash = ?').get(tokenHash) as any)?.console_ok;
const unlockSession = (tokenHash: string) => db.prepare('UPDATE sessions SET console_ok = 1 WHERE token_hash = ?').run(tokenHash);
export const lockSession = (tokenHash: string) => db.prepare('UPDATE sessions SET console_ok = 0 WHERE token_hash = ?').run(tokenHash);

function checkNew(userId: number, username: string, password: unknown) {
  const pw = String(password || '');
  if (pw.length < 10) throw new ConsoleError(400, 'The console password needs at least 10 characters.');
  if (pw.length > 200) throw new ConsoleError(400, 'That password is too long.');
  if (pw.toLowerCase().includes(username.toLowerCase())) throw new ConsoleError(400, 'The password may not contain the username.');
  const acct = db.prepare('SELECT pass_hash FROM users WHERE id = ?').get(userId) as any;
  if (!acct) throw new ConsoleError(404, 'Account not found.');
  if (verifyPassword(pw, acct.pass_hash)) throw new ConsoleError(400, 'The console password must be different from the account password.');
  return pw;
}

function save(userId: number, usernameIn: unknown, password: unknown, by: number, mustChange: boolean) {
  const username = String(usernameIn || '').trim();
  if (!USER_RE.test(username)) throw new ConsoleError(400, 'Username: 3–32 letters, numbers, dots, dashes or underscores.');
  const taken = db.prepare('SELECT user_id FROM staff_console WHERE username = ? COLLATE NOCASE').get(username) as any;
  if (taken && taken.user_id !== userId) throw new ConsoleError(409, 'That username is taken.');
  const pw = checkNew(userId, username, password);
  db.prepare(`INSERT INTO staff_console (user_id, username, pass_hash, must_change, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, pass_hash = excluded.pass_hash, must_change = excluded.must_change, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .run(userId, username, hashPassword(pw), mustChange ? 1 : 0, now(), by);
  return username;
}

/** First setup by the person themselves (admin only — staff get theirs from a manager). Unlocks this session. */
export function setupOwn(userId: number, tokenHash: string, username: unknown, password: unknown) {
  if (consoleRow(userId)) throw new ConsoleError(409, 'Your console login already exists. Sign in with it.');
  const u = save(userId, username, password, userId, false);
  unlockSession(tokenHash);
  return u;
}

/** A manager (or the admin) sets / resets someone else's console login; the owner must change the password next time. */
export function setFor(targetId: number, username: unknown, password: unknown, by: number) {
  const u = save(targetId, username, password, by, true);
  // their open console sessions close: they sign in again with the new login
  db.prepare('UPDATE sessions SET console_ok = 0 WHERE user_id = ?').run(targetId);
  return u;
}

const fails = new Map<number, number[]>();
/** Console sign-in for this session. */
export function consoleLogin(userId: number, tokenHash: string, username: unknown, password: unknown) {
  const t = Date.now();
  const list = (fails.get(userId) || []).filter(x => t - x < 15 * 60000);
  fails.set(userId, list);
  if (list.length >= 5) throw new ConsoleError(429, 'Too many wrong tries. Wait 15 minutes.');
  const row = db.prepare('SELECT username, pass_hash, must_change FROM staff_console WHERE user_id = ?').get(userId) as any;
  if (!row) throw new ConsoleError(400, 'You have no console login yet.');
  const ok = String(username || '').trim().toLowerCase() === String(row.username).toLowerCase() && verifyPassword(String(password || ''), row.pass_hash);
  if (!ok) { list.push(t); throw new ConsoleError(401, 'Wrong username or password.'); }
  fails.delete(userId);
  unlockSession(tokenHash);
  return { mustChange: !!row.must_change };
}

/** The owner changes their console password (required after a manager set it). */
export function changeOwn(userId: number, current: unknown, next: unknown) {
  const row = db.prepare('SELECT username, pass_hash FROM staff_console WHERE user_id = ?').get(userId) as any;
  if (!row) throw new ConsoleError(400, 'You have no console login yet.');
  if (!verifyPassword(String(current || ''), row.pass_hash)) throw new ConsoleError(401, 'Current console password is wrong.');
  if (String(current) === String(next)) throw new ConsoleError(400, 'Choose a new password.');
  const pw = checkNew(userId, row.username, next);
  db.prepare('UPDATE staff_console SET pass_hash = ?, must_change = 0, updated_at = ?, updated_by = ? WHERE user_id = ?').run(hashPassword(pw), now(), userId, userId);
}

/** Admin forgot their own console login: account password + two-step code were checked by the caller. */
export function resetOwn(userId: number) {
  db.prepare('DELETE FROM staff_console WHERE user_id = ?').run(userId);
  db.prepare('UPDATE sessions SET console_ok = 0 WHERE user_id = ?').run(userId);
}

export function removeFor(userId: number) {
  db.prepare('DELETE FROM staff_console WHERE user_id = ?').run(userId);
  db.prepare('UPDATE sessions SET console_ok = 0 WHERE user_id = ?').run(userId);
}

export function consoleUsers(): Map<number, { username: string; mustChange: boolean; updatedAt: string }> {
  return new Map((db.prepare('SELECT user_id, username, must_change, updated_at FROM staff_console').all() as any[]).map(r => [r.user_id, { username: r.username, mustChange: !!r.must_change, updatedAt: r.updated_at }]));
}
