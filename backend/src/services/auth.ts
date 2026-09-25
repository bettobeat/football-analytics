/**
 * Accounts, sessions and plans (free / premium).
 *
 * - Passwords: scrypt (Node crypto, no extra packages), per-user salt, constant-time compare.
 * - Sessions: random 32-byte token in an httpOnly cookie; only its SHA-256 hash is stored,
 *   so a leaked database cannot be used to log in. 30-day sliding expiry.
 * - Plans: 'free' (default) or 'premium' (optionally until a date). Admins = emails listed in
 *   ADMIN_EMAILS (comma separated). Payments will set plan/premium_until through setPlan().
 * - Free users get a "teaser": the model's pick and confidence, no percentages (see teaseDeep).
 */
import crypto from 'crypto';
import type express from 'express';
import { db } from '../db';
import logger from '../utils/logger';

export type Plan = 'free' | 'premium';
export type Access = 'anon' | 'free' | 'premium' | 'admin';

export interface User {
  id: number;
  email: string;
  name: string | null;
  plan: Plan;
  premiumUntil: string | null;
  isAdmin: boolean;
  createdAt: string;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    email          TEXT    NOT NULL UNIQUE,
    name           TEXT,
    pass_hash      TEXT    NOT NULL,
    plan           TEXT    NOT NULL DEFAULT 'free',
    premium_until  TEXT,
    created_at     TEXT    NOT NULL,
    last_login_at  TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT    PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT    NOT NULL,
    expires_at  TEXT    NOT NULL,
    user_agent  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

export const SESSION_COOKIE = 'b2b_session';
const SESSION_DAYS = 30;
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
);

// ---------- passwords ----------

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  const key = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(key, expected);
}

// A fixed hash to compare against when the email is unknown, so timing doesn't reveal which emails exist
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'));

// ---------- validation ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normEmail(e: unknown): string {
  return String(e || '').trim().toLowerCase();
}

function checkCredentials(email: string, password: unknown): string | null {
  if (!EMAIL_RE.test(email) || email.length > 200) return 'Please enter a valid email address.';
  const pw = String(password || '');
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 200) return 'Password is too long.';
  return null;
}

// ---------- rate limiting (in memory, per IP and per email) ----------

const attempts = new Map<string, { n: number; reset: number }>();
const WINDOW_MS = 15 * 60 * 1000;

function limited(key: string, max: number): boolean {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.reset < now) {
    attempts.set(key, { n: 1, reset: now + WINDOW_MS });
    return false;
  }
  a.n++;
  return a.n > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, a] of attempts) if (a.reset < now) attempts.delete(k);
}, WINDOW_MS).unref();

// ---------- users ----------

function rowToUser(r: any): User {
  const premiumActive = r.plan === 'premium' && (!r.premium_until || r.premium_until > new Date().toISOString());
  return {
    id: r.id,
    email: r.email,
    name: r.name || null,
    plan: premiumActive ? 'premium' : 'free',
    premiumUntil: r.premium_until || null,
    isAdmin: ADMIN_EMAILS.has(String(r.email).toLowerCase()),
    createdAt: r.created_at
  };
}

export function accessOf(user: User | null): Access {
  if (!user) return 'anon';
  if (user.isAdmin) return 'admin';
  return user.plan === 'premium' ? 'premium' : 'free';
}

export function canSeeFull(access: Access): boolean {
  return access === 'premium' || access === 'admin';
}

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function signup(emailIn: unknown, password: unknown, nameIn: unknown, ip: string): User {
  const email = normEmail(emailIn);
  if (limited(`signup:${ip}`, 10)) throw new AuthError(429, 'Too many sign-ups from this network. Try again later.');
  const bad = checkCredentials(email, password);
  if (bad) throw new AuthError(400, bad);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new AuthError(409, 'An account with this email already exists. Try signing in.');
  const name = String(nameIn || '').trim().slice(0, 80) || null;
  const now = new Date().toISOString();
  const r = db.prepare('INSERT INTO users (email, name, pass_hash, plan, created_at) VALUES (?, ?, ?, ?, ?)').run(email, name, hashPassword(String(password)), 'free', now);
  logger.info(`New account #${r.lastInsertRowid}`);
  return rowToUser(db.prepare('SELECT * FROM users WHERE id = ?').get(Number(r.lastInsertRowid)));
}

export function login(emailIn: unknown, password: unknown, ip: string): User {
  const email = normEmail(emailIn);
  if (limited(`login-ip:${ip}`, 30) || limited(`login-email:${email}`, 10))
    throw new AuthError(429, 'Too many attempts. Wait 15 minutes and try again.');
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const ok = verifyPassword(String(password || ''), row ? row.pass_hash : DUMMY_HASH);
  if (!row || !ok) throw new AuthError(401, 'Wrong email or password.');
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);
  return rowToUser(row);
}

export function changePassword(userId: number, current: unknown, next: unknown): void {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!row) throw new AuthError(404, 'Account not found.');
  if (!verifyPassword(String(current || ''), row.pass_hash)) throw new AuthError(401, 'Current password is wrong.');
  const bad = checkCredentials(row.email, next);
  if (bad) throw new AuthError(400, bad);
  db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(String(next)), userId);
  // sign out everywhere else
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

/** Set a user's plan (admin screen now, payment webhooks later). until = ISO date or null for no end. */
export function setPlan(userId: number, plan: Plan, until: string | null): User {
  const r = db.prepare('UPDATE users SET plan = ?, premium_until = ? WHERE id = ?').run(plan, plan === 'premium' ? until : null, userId);
  if (!Number(r.changes)) throw new AuthError(404, 'Account not found.');
  return rowToUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
}

/** Admin: set a new password for a user (until email reset exists) and sign them out. */
export function adminResetPassword(userId: number, next: unknown): void {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!row) throw new AuthError(404, 'Account not found.');
  const bad = checkCredentials(row.email, next);
  if (bad) throw new AuthError(400, bad);
  db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(String(next)), userId);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function listUsers(): (User & { lastLoginAt: string | null })[] {
  return db
    .prepare('SELECT * FROM users ORDER BY created_at DESC')
    .all()
    .map((r: any) => ({ ...rowToUser(r), lastLoginAt: r.last_login_at || null }));
}

export function userStats() {
  const all = listUsers();
  return { total: all.length, premium: all.filter(u => u.plan === 'premium').length, admins: all.filter(u => u.isAdmin).length };
}

// ---------- sessions ----------

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(userId: number, userAgent?: string): { token: string; expires: Date } {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)').run(
    sha(token),
    userId,
    now.toISOString(),
    expires.toISOString(),
    (userAgent || '').slice(0, 200)
  );
  return { token, expires };
}

export function destroySession(token: string | undefined) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
}

const lastTouch = new Map<string, number>();

/** User for a session token, or null. Extends the session (at most once an hour). */
export function userForToken(token: string | undefined): User | null {
  if (!token) return null;
  const h = sha(token);
  const row = db
    .prepare('SELECT u.*, s.expires_at AS s_expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?')
    .get(h);
  if (!row) return null;
  const now = Date.now();
  if (row.s_expires < new Date(now).toISOString()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(h);
    return null;
  }
  if ((lastTouch.get(h) || 0) < now - 3600000) {
    lastTouch.set(h, now);
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(new Date(now + SESSION_DAYS * 86400000).toISOString(), h);
  }
  return rowToUser(row);
}

setInterval(() => {
  try {
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  } catch {}
}, 6 * 3600000).unref();

// ---------- cookies ----------

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
}

export function setSessionCookie(res: express.Response, token: string, expires: Date, secure: boolean) {
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, expires, path: '/' });
}

export function clearSessionCookie(res: express.Response, secure: boolean) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
}

// ---------- teaser (what free users receive instead of full predictions) ----------

/** Model pick + confidence only. Keeps the shape recognisable: { model, locked, pick, confidence }. */
export function teasePrediction(p: any) {
  if (!p || typeof p !== 'object' || p.locked) return p;
  const h = Number(p.home), d = Number(p.draw), a = Number(p.away);
  const pick = h >= d && h >= a ? 'H' : a >= d ? 'A' : 'D';
  return { model: p.model, locked: true, pick, confidence: p.confidence };
}

/**
 * Deep copy of an API payload with every `prediction` / `predictions` value replaced by a teaser.
 * Works for match lists, match details and the live socket feed alike.
 */
export function teaseDeep(value: any, depth = 0): any {
  if (depth > 8 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => teaseDeep(v, depth + 1));
  const out: any = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === 'prediction') out[k] = v ? teasePrediction(v) : v;
    else if (k === 'predictions' && Array.isArray(v)) out[k] = v.map(teasePrediction);
    else out[k] = teaseDeep(v, depth + 1);
  }
  return out;
}
