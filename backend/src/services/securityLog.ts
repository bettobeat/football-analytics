/**
 * Security log (Oct 2026): sign-ins, two-step login and account changes, with the IP address and browser, kept 90 days.
 * Purpose: spot attempts to break into the admin or into users' accounts (legitimate interest: security; stated in the
 * privacy policy). Visitor statistics never use this table.
 */
import { db } from '../db';

db.exec(`
  CREATE TABLE IF NOT EXISTS security_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_id INTEGER, email TEXT, event TEXT NOT NULL,
    ip TEXT, ua TEXT, detail TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_security_log_at ON security_log(at);
  CREATE INDEX IF NOT EXISTS idx_security_log_user ON security_log(user_id);
`);

const ins = db.prepare(`INSERT INTO security_log (at, user_id, email, event, ip, ua, detail) VALUES (?, ?, ?, ?, ?, ?, ?)`);

export function securityLog(req: { ip?: string; headers: Record<string, any> }, event: string, user?: { id?: number | null; email?: string | null } | null, detail?: string) {
  try {
    ins.run(new Date().toISOString(), user?.id ?? null, user?.email ? String(user.email).toLowerCase().slice(0, 254) : null, event,
      (req.ip || '').slice(0, 64) || null, String(req.headers?.['user-agent'] || '').slice(0, 200) || null, detail ? detail.slice(0, 300) : null);
  } catch { /* logging never breaks a request */ }
}

export function securityLogList(limit = 200, userId?: number) {
  const rows = userId
    ? db.prepare(`SELECT * FROM security_log WHERE user_id = ? ORDER BY id DESC LIMIT ?`).all(userId, limit)
    : db.prepare(`SELECT * FROM security_log ORDER BY id DESC LIMIT ?`).all(limit);
  const since = new Date(Date.now() - 86400000).toISOString();
  const failed24h = (db.prepare(`SELECT COUNT(*) AS n FROM security_log WHERE at >= ? AND event IN ('login_fail', '2fa_fail')`).get(since) as any).n;
  return { failed24h, rows: (rows as any[]).map(r => ({ id: r.id, at: r.at, userId: r.user_id, email: r.email, event: r.event, ip: r.ip, ua: r.ua, detail: r.detail })) };
}

/** A user's own sign-in history (for the account page later / data export). */
export function securityLogFor(userId: number) {
  return db.prepare(`SELECT at, event, ip, ua FROM security_log WHERE user_id = ? ORDER BY id DESC LIMIT 200`).all(userId);
}

setInterval(() => {
  try { db.prepare(`DELETE FROM security_log WHERE at < ?`).run(new Date(Date.now() - 90 * 86400000).toISOString()); } catch { /* ignore */ }
}, 6 * 3600000).unref();
