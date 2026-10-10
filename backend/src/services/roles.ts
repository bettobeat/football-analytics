/**
 * Staff roles and permissions (Oct 2026).
 *
 * - Admin (ADMIN_EMAILS, two-step login required) always has every permission and is not a row here: it cannot be
 *   edited or removed, so the owner can never be locked out.
 * - Every other staff member has one role (users.role = roles.key). A role is a list of permissions, edited in the CRM
 *   (Team & roles) by anyone with the 'team' permission; only the admin can grant or take the 'team' permission itself.
 * - Staff permissions apply only with a confirmed email AND two-step login on AND used for this session.
 */
import { db } from '../db';

export const PERMS = [
  { key: 'inbox.read', group: 'Support inbox', label: 'Read messages', help: 'See support messages (unassigned and their own)' },
  { key: 'inbox.reply', group: 'Support inbox', label: 'Reply and close', help: 'Reply by email, write internal notes, change status, take a message' },
  { key: 'inbox.manage', group: 'Support inbox', label: 'Manage the inbox', help: "See everyone's messages and assign them to teammates" },
  { key: 'customers.view', group: 'Customers', label: 'View customers', help: 'Search accounts; see plan, sign-ins and their messages' },
  { key: 'customers.plan', group: 'Customers', label: 'Change plans', help: 'Give or extend Premium / Pro (e.g. goodwill days), set back to Free' },
  { key: 'customers.security', group: 'Customers', label: 'Account security', help: 'Send a password-reset email, sign a customer out everywhere' },
  { key: 'campaigns', group: 'Marketing', label: 'Email campaigns', help: 'Build segments and send emails to opted-in users' },
  { key: 'revenue', group: 'Business', label: 'Revenue & churn', help: 'Revenue, paying accounts, cancellations' },
  { key: 'security', group: 'Business', label: 'Security log', help: 'Sign-ins, failed attempts, account changes (with IP)' },
  { key: 'model', group: 'Product', label: 'Model & data', help: 'Past seasons, model tests and statistics (read-only)' },
  { key: 'team', group: 'Team', label: 'Manage the team', help: 'Add staff, choose their role, edit role permissions' }
] as const;
export type Perm = (typeof PERMS)[number]['key'];
export const ALL_PERMS: Perm[] = PERMS.map(p => p.key);

const DEFAULT_ROLES: { key: string; name: string; perms: Perm[] }[] = [
  { key: 'support_manager', name: 'Support Manager', perms: ['inbox.read', 'inbox.reply', 'inbox.manage', 'customers.view', 'customers.plan', 'customers.security', 'revenue', 'security'] },
  { key: 'support_agent', name: 'Support Agent', perms: ['inbox.read', 'inbox.reply', 'customers.view'] },
  { key: 'marketing', name: 'Marketing', perms: ['campaigns', 'revenue'] },
  { key: 'analyst', name: 'Analyst', perms: ['revenue', 'model'] },
  { key: 'developer', name: 'Developer', perms: ['security', 'model'] }
];

db.exec(`CREATE TABLE IF NOT EXISTS roles (key TEXT PRIMARY KEY, name TEXT NOT NULL, perms TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT)`);
{
  const n = (db.prepare('SELECT COUNT(*) AS n FROM roles').get() as any).n;
  if (!n) {
    const ins = db.prepare('INSERT INTO roles (key, name, perms, created_at) VALUES (?, ?, ?, ?)');
    for (const r of DEFAULT_ROLES) ins.run(r.key, r.name, JSON.stringify(r.perms), new Date().toISOString());
  }
  // the first version had a single 'support' role: it becomes Support Agent
  try { db.prepare(`UPDATE users SET role = 'support_agent' WHERE role = 'support'`).run(); } catch { /* users table not ready */ }
}

export class RoleError extends Error { constructor(public status: number, msg: string) { super(msg); } }

const clean = (list: unknown): Perm[] => (Array.isArray(list) ? ALL_PERMS.filter(p => list.includes(p)) : []);
let cache: Map<string, { key: string; name: string; perms: Perm[] }> | null = null;
function load() {
  if (cache) return cache;
  cache = new Map();
  for (const r of db.prepare('SELECT key, name, perms FROM roles').all() as any[]) {
    let perms: Perm[] = [];
    try { perms = clean(JSON.parse(r.perms)); } catch { /* none */ }
    cache.set(r.key, { key: r.key, name: r.name, perms });
  }
  return cache;
}

export const roleByKey = (key: string | null | undefined) => (key ? load().get(key) || null : null);
export const roleExists = (key: string) => load().has(key);

export function listRoles() {
  const counts = new Map((db.prepare(`SELECT role, COUNT(*) AS n FROM users WHERE role IS NOT NULL GROUP BY role`).all() as any[]).map(r => [r.role, r.n]));
  return {
    perms: PERMS,
    admin: { key: 'admin', name: 'Admin', perms: ALL_PERMS, locked: true },
    roles: [...load().values()].map(r => ({ ...r, members: counts.get(r.key) || 0 }))
  };
}

const slug = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

/** Create a role. Only the admin may include 'team'. */
export function createRole(name: unknown, perms: unknown, byAdmin: boolean) {
  const n = String(name || '').trim().slice(0, 40);
  if (n.length < 2) throw new RoleError(400, 'Give the role a name.');
  const key = slug(n);
  if (!key || key === 'admin' || roleExists(key)) throw new RoleError(409, 'A role with this name already exists.');
  const p = clean(perms);
  if (p.includes('team') && !byAdmin) throw new RoleError(403, "Only the admin can give the 'Manage the team' permission.");
  db.prepare('INSERT INTO roles (key, name, perms, created_at) VALUES (?, ?, ?, ?)').run(key, n, JSON.stringify(p), new Date().toISOString());
  cache = null;
  return roleByKey(key)!;
}

/** Change a role's name and / or permissions. 'team' can only be added or removed by the admin. */
export function updateRole(key: string, name: unknown, perms: unknown, byAdmin: boolean) {
  const r = roleByKey(key);
  if (!r) throw new RoleError(404, 'Role not found.');
  const p = perms === undefined ? r.perms : clean(perms);
  if (p.includes('team') !== r.perms.includes('team') && !byAdmin) throw new RoleError(403, "Only the admin can give or take the 'Manage the team' permission.");
  const n = name === undefined ? r.name : String(name || '').trim().slice(0, 40);
  if (n.length < 2) throw new RoleError(400, 'Give the role a name.');
  db.prepare('UPDATE roles SET name = ?, perms = ?, updated_at = ? WHERE key = ?').run(n, JSON.stringify(p), new Date().toISOString(), key);
  cache = null;
  return roleByKey(key)!;
}

export function deleteRole(key: string, byAdmin: boolean) {
  const r = roleByKey(key);
  if (!r) throw new RoleError(404, 'Role not found.');
  if (r.perms.includes('team') && !byAdmin) throw new RoleError(403, 'Only the admin can delete a role that manages the team.');
  const n = (db.prepare('SELECT COUNT(*) AS n FROM users WHERE role = ?').get(key) as any).n;
  if (n) throw new RoleError(409, `${n} staff member${n === 1 ? ' has' : 's have'} this role. Move them to another role first.`);
  db.prepare('DELETE FROM roles WHERE key = ?').run(key);
  cache = null;
}

/** Staff list: everyone with a role. */
export function listStaff() {
  return (db.prepare(`SELECT id, email, name, role, email_verified, totp_secret, last_login_at, created_at FROM users WHERE role IS NOT NULL ORDER BY created_at`).all() as any[])
    .map(u => ({ id: u.id, email: u.email, name: u.name || null, role: u.role, roleName: roleByKey(u.role)?.name || u.role, emailVerified: !!u.email_verified, twoFactor: !!u.totp_secret, lastLoginAt: u.last_login_at || null, createdAt: u.created_at }));
}
