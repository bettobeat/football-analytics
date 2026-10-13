import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../lib/socket';
import { errorText, useAuth } from '../lib/auth';
import DataHealth from '../components/DataHealth';
import VisitorsCard from '../components/VisitorsCard';
import LeaguesCard from '../components/LeaguesCard';
function fmt(iso) {
    return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '–';
}
/** Admin panel: an overview (visitors, accounts, data health) and, on its own tab, the users list (the future CRM). */
export default function Admin() {
    const { access, loading } = useAuth();
    const [rows, setRows] = useState([]);
    const [stats, setStats] = useState(null);
    const [error, setError] = useState(null);
    const [q, setQ] = useState('');
    const [params, setParams] = useSearchParams();
    const tab = params.get('tab') === 'users' ? 'users' : 'overview';
    const go = (x) => setParams(x === 'overview' ? {} : { tab: x }, { replace: true });
    const load = () => axios
        .get(`${API_URL}/admin/users`)
        .then(r => {
        setRows(r.data.data);
        setStats(r.data.stats);
        setError(null);
    })
        .catch(e => setError(errorText(e)));
    useEffect(() => {
        if (access === 'admin')
            load();
    }, [access]);
    if (loading)
        return null;
    if (access !== 'admin')
        return _jsx("div", { className: "max-w-3xl mx-auto px-4 sm:px-6 py-16 text-sm text-muted", children: "Admins only." });
    const setPlan = async (u, plan) => {
        let until = null;
        if (plan !== 'free') {
            const days = window.prompt(`${plan === 'pro' ? 'Pro' : 'Premium'} for ${u.email}: number of days (empty = no end date)`, '30');
            if (days === null)
                return;
            const n = parseInt(days, 10);
            if (n > 0)
                until = new Date(Date.now() + n * 86400000).toISOString();
        }
        try {
            await axios.post(`${API_URL}/admin/users/${u.id}/plan`, { plan, until });
            load();
        }
        catch (e) {
            setError(errorText(e));
        }
    };
    const resetPw = async (u) => {
        const pw = window.prompt(`New temporary password for ${u.email} (min 8 characters)`);
        if (!pw)
            return;
        try {
            await axios.post(`${API_URL}/admin/users/${u.id}/password`, { password: pw });
            setError(null);
            window.alert('Password changed. Send it to the user privately and ask them to change it in Account.');
        }
        catch (e) {
            setError(errorText(e));
        }
    };
    const shown = rows.filter(r => !q || r.email.includes(q.toLowerCase()) || (r.name || '').toLowerCase().includes(q.toLowerCase()));
    const tile = (label, value, onClick) => (_jsxs("button", { type: "button", onClick: onClick, className: "text-left rounded-xl border border-line/60 bg-surface2/50 px-4 py-3 hover:border-accent/40 transition-colors", children: [_jsx("div", { className: "text-[10px] font-semibold uppercase tracking-wide text-faint", children: label }), _jsx("div", { className: "num text-2xl font-extrabold text-ink leading-none mt-1.5", children: value ?? '–' })] }));
    return (_jsxs("div", { className: "max-w-5xl mx-auto px-4 sm:px-6 py-10", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 mb-6", children: [_jsx("h1", { className: "font-display text-3xl font-extrabold tracking-tight text-ink", children: "Admin" }), _jsx("nav", { className: "flex gap-1 rounded-full border border-line/60 bg-surface p-1", children: ['overview', 'users'].map(x => (_jsx("button", { type: "button", onClick: () => go(x), "aria-current": tab === x ? 'page' : undefined, className: `px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${tab === x ? 'bg-accent text-bg' : 'text-muted hover:text-ink'}`, children: x === 'overview' ? 'Overview' : `Users${stats ? ` · ${stats.total}` : ''}` }, x))) })] }), tab === 'overview' && (_jsxs(_Fragment, { children: [_jsx(VisitorsCard, {}), _jsx(SiteErrorsCard, {}), _jsx(BackupsCard, {}), _jsx(BbResultsCard, {}), _jsx(LeaguesCard, {}), _jsx(LeaguesCard, { sport: "basketball" }), _jsxs("section", { className: "card p-5 sm:p-6 mb-8", children: [_jsxs("div", { className: "flex flex-wrap items-baseline justify-between gap-2 mb-4", children: [_jsx("h2", { className: "font-display text-lg font-bold text-ink", children: "Accounts" }), _jsx("button", { type: "button", onClick: () => go('users'), className: "text-xs font-semibold text-accent", children: "Open users \u2192" })] }), _jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3", children: [tile('Accounts', stats?.total, () => go('users')), tile('Confirmed email', stats?.verified, () => go('users')), tile('Premium / Pro', stats?.premium, () => go('users')), tile('Want updates', stats?.optIn, () => go('users'))] })] }), _jsx(ContactCard, {}), _jsx(SecurityCard, {}), _jsx(LeaveCard, {}), _jsx(DataHealth, {})] })), tab === 'users' && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex flex-wrap items-end justify-between gap-3 mb-5", children: [_jsxs("div", { children: [_jsx("h2", { className: "font-display text-2xl font-extrabold tracking-tight text-ink", children: "Users" }), stats && (_jsxs("p", { className: "text-sm text-muted", children: [_jsx("span", { className: "num", children: stats.total }), " accounts \u00B7 ", _jsx("span", { className: "num", children: stats.verified }), " confirmed \u00B7", ' ', _jsx("span", { className: "num", children: stats.premium }), " premium \u00B7 ", _jsx("span", { className: "num", children: stats.optIn }), " want updates"] }))] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("a", { href: `${API_URL}/admin/users.csv`, className: "rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:border-faint whitespace-nowrap", children: "Export CSV" }), _jsx("input", { value: q, onChange: e => setQ(e.target.value), placeholder: "Search email or name", className: "rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent w-64 max-w-full" })] })] }), error && _jsx("div", { className: "mb-4 rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss", children: error }), _jsx("div", { className: "card overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-left text-faint text-xs border-b border-line", children: [_jsx("th", { className: "px-4 py-3 font-medium", children: "Email" }), _jsx("th", { className: "px-4 py-3 font-medium", children: "Plan" }), _jsx("th", { className: "px-4 py-3 font-medium", children: "Status" }), _jsx("th", { className: "px-4 py-3 font-medium", children: "Updates" }), _jsx("th", { className: "px-4 py-3 font-medium", children: "Joined" }), _jsx("th", { className: "px-4 py-3 font-medium", children: "Last sign-in" }), _jsx("th", { className: "px-4 py-3 font-medium text-right", children: "Actions" })] }) }), _jsxs("tbody", { children: [shown.map(u => (_jsxs("tr", { className: "border-b border-line/60 last:border-0", children: [_jsxs("td", { className: "px-4 py-3", children: [_jsx("div", { className: "text-ink", children: u.email }), u.name && _jsx("div", { className: "text-xs text-faint", children: u.name })] }), _jsx("td", { className: "px-4 py-3", children: u.isAdmin ? (_jsx("span", { className: "text-xs font-semibold text-accent", children: "Admin" })) : u.plan !== 'free' ? (_jsxs("span", { className: "text-xs font-semibold text-accent", children: [u.plan === 'pro' ? 'Pro' : 'Premium', u.premiumUntil ? _jsxs("span", { className: "text-faint font-normal", children: [" \u00B7 until ", fmt(u.premiumUntil)] }) : null] })) : (_jsx("span", { className: "text-xs text-muted", children: "Free" })) }), _jsx("td", { className: "px-4 py-3 text-xs", children: u.emailVerified ? _jsx("span", { className: "text-win", children: "Confirmed" }) : _jsx("span", { className: "text-draw", children: "Pending" }) }), _jsx("td", { className: "px-4 py-3 text-xs", children: u.marketingOptIn ? _jsx("span", { className: "text-win", children: "Yes" }) : _jsx("span", { className: "text-faint", children: "No" }) }), _jsx("td", { className: "px-4 py-3 num text-muted", children: fmt(u.createdAt) }), _jsx("td", { className: "px-4 py-3 num text-muted", children: fmt(u.lastLoginAt) }), _jsxs("td", { className: "px-4 py-3 text-right whitespace-nowrap", children: [!u.isAdmin &&
                                                            _jsxs(_Fragment, { children: [u.plan !== 'premium' && (_jsx("button", { onClick: () => setPlan(u, 'premium'), className: "text-xs font-semibold text-accent mr-3", children: "Premium" })), u.plan !== 'pro' && (_jsx("button", { onClick: () => setPlan(u, 'pro'), className: "text-xs font-semibold text-accent mr-3", children: "Pro" })), u.plan !== 'free' && (_jsx("button", { onClick: () => setPlan(u, 'free'), className: "text-xs text-muted hover:text-loss mr-3", children: "Free" }))] }), u.role && _jsx(Link, { to: "/crm?tab=team", className: "text-xs text-draw font-semibold mr-3", title: "Staff role \u2014 change it in CRM \u2192 Team & roles", children: u.role.replace(/_/g, ' ') }), _jsx("button", { onClick: () => resetPw(u), className: "text-xs text-muted hover:text-ink", children: "Reset password" })] })] }, u.id))), !shown.length && (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "px-4 py-8 text-center text-faint", children: "No accounts yet." }) }))] })] }) })] }))] }));
}
const REASON_LABEL = {
    too_expensive: 'Too expensive', not_accurate: 'Predictions not accurate enough', not_using: 'Not using it enough',
    missing_feature: 'Missing feature / sport', other_service: 'Found another service', technical: 'Technical problems', other: 'Something else'
};
const EVENT_LABEL = {
    login_ok: 'Signed in', login_ok_recovery_code: 'Signed in with a recovery code', login_password_ok: 'Password OK, waiting for code',
    login_fail: 'Wrong email or password', '2fa_fail': 'Wrong two-step code', '2fa_on': 'Two-step login turned on', '2fa_off': 'Two-step login turned off',
    '2fa_recovery_new': 'New recovery codes', password_reset: 'Password reset by email', password_change: 'Password changed',
    admin_set_password: 'Admin set a user password', role_changed: 'Staff role changed', role_created: 'Role created', role_updated: 'Role permissions changed', role_deleted: 'Role deleted', staff_plan_change: 'Staff changed a plan', staff_sent_reset: 'Staff sent a password reset', staff_signed_out_user: 'Staff signed a customer out', campaign_sent: 'Email campaign sent', '2fa_device_added': 'Two-step: another device added',
    email_change_started: 'Email change started', email_changed: 'Email changed'
};
const BAD = new Set(['role_changed', 'role_updated', 'role_created', 'role_deleted', 'login_fail', '2fa_fail', '2fa_off', 'login_ok_recovery_code', 'admin_set_password', 'email_changed', '2fa_device_added']);
function browserOf(ua) {
    if (!ua)
        return '';
    const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
    const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
    return [b, os].filter(Boolean).join(' · ');
}
const mb = (n) => (n == null ? '–' : n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`);
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');
/** Daily database backups: status, copies on the server and off-site, "Back up now", download (needs a two-step code). */
function BackupsCard() {
    const [d, setD] = useState(null);
    const [err, setErr] = useState(null);
    const [busy, setBusy] = useState(false);
    const [ask, setAsk] = useState(null); // file waiting for the two-step code
    const [code, setCode] = useState('');
    const load = () => axios.get(`${API_URL}/admin/backups`).then(r => { setD(r.data.data); setErr(null); }).catch(e => setErr(errorText(e)));
    useEffect(() => { load(); }, []);
    useEffect(() => {
        if (!d?.running)
            return;
        const t = setInterval(load, 4000);
        return () => clearInterval(t);
    }, [d?.running]);
    const runNow = async () => {
        setBusy(true);
        try {
            await axios.post(`${API_URL}/admin/backups/run`);
            await load();
        }
        catch (e) {
            setErr(errorText(e));
        }
        finally {
            setBusy(false);
        }
    };
    const download = async (name) => {
        setBusy(true);
        setErr(null);
        try {
            const r = await axios.get(`${API_URL}/admin/backups/download/${encodeURIComponent(name)}`, { responseType: 'blob' });
            const url = URL.createObjectURL(r.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
        }
        catch (e) {
            if (e?.response?.status === 401)
                setAsk(name);
            else
                setErr('Download failed.');
        }
        finally {
            setBusy(false);
        }
    };
    const confirm = async () => {
        setBusy(true);
        setErr(null);
        try {
            await axios.post(`${API_URL}/crm/team/sudo`, { code });
            const name = ask;
            setAsk(null);
            setCode('');
            setBusy(false);
            await download(name);
        }
        catch (e) {
            setErr(errorText(e));
            setCode('');
        }
        finally {
            setBusy(false);
        }
    };
    if (!d)
        return err ? _jsxs("section", { className: "card p-5 sm:p-6 mb-8 text-sm text-loss", children: ["Backups: ", err] }) : null;
    const last = d.history[0];
    return (_jsxs("section", { className: "card p-5 sm:p-6 mb-8", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 mb-4", children: [_jsx("h2", { className: "font-display text-lg font-bold text-ink", children: "Database backups" }), _jsx("button", { type: "button", disabled: busy || d.running, onClick: runNow, className: "rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-faint disabled:opacity-60", children: d.running ? 'Backing up…' : 'Back up now' })] }), _jsxs("div", { className: "grid gap-3 sm:grid-cols-3 mb-4", children: [_jsxs("div", { className: `rounded-xl border px-4 py-3 ${d.healthy ? 'border-win/40 bg-win/10' : 'border-loss/40 bg-loss/10'}`, children: [_jsx("div", { className: `text-sm font-bold ${d.healthy ? 'text-win' : 'text-loss'}`, children: d.healthy ? 'Backed up' : d.lastOkAt ? 'Backup is late' : 'No backup yet' }), _jsxs("div", { className: "text-[11px] text-muted mt-0.5", children: ["Last good: ", when(d.lastOkAt), " \u00B7 ", d.schedule] })] }), _jsxs("div", { className: "rounded-xl border border-line px-4 py-3", children: [_jsx("div", { className: "text-sm font-bold text-ink", children: "On the server" }), _jsxs("div", { className: "text-[11px] text-muted mt-0.5", children: [d.local.length, " of ", d.localKeep, " copies \u00B7 database ", mb(last?.dbBytes), " \u2192 ", mb(last?.gzBytes), " zipped"] })] }), _jsxs("div", { className: `rounded-xl border px-4 py-3 ${d.remote.ready && !d.remote.listError ? 'border-line' : 'border-draw/40 bg-draw/10'}`, children: [_jsx("div", { className: `text-sm font-bold ${d.remote.ready && !d.remote.listError ? 'text-ink' : 'text-draw'}`, children: "Off-site copy" }), _jsx("div", { className: "text-[11px] text-muted mt-0.5", children: !d.remote.configured ? 'Not set up yet (Cloudflare R2) — a server copy alone is lost if the volume is lost.'
                                    : !d.remote.encrypted ? 'Storage is set, but BACKUP_KEY is missing — nothing is uploaded.'
                                        : d.remote.listError ? `Storage error: ${d.remote.listError}`
                                            : `${d.remote.copies ?? 0} encrypted copies (${mb(d.remote.bytes)}), kept ${d.remote.keepDays} days` })] })] }), d.disk && (() => {
                const v = d.disk.volume;
                const low = !!v && (v.free < 500e6 || v.free / v.total < 0.1);
                return (_jsxs("div", { className: `rounded-xl border px-3 py-2 text-xs mb-3 ${low ? 'border-loss/40 bg-loss/10 text-loss' : 'border-line text-muted'}`, children: [_jsx("b", { className: low ? '' : 'text-ink', children: "Disk:" }), " database ", mb(d.disk.dbBytes), " \u00B7 volume ", v ? `${mb(v.free)} free of ${mb(v.total)}` : 'unknown', " \u00B7 temp disk ", d.disk.temp ? `${mb(d.disk.temp.free)} free` : 'unknown', low && _jsxs(_Fragment, { children: [" \u2014 ", _jsx("b", { children: "the volume is almost full." }), " The site saves everything there: make the volume bigger in Railway (service \u2192 Settings \u2192 Volume)."] })] }));
            })(), d.lastError && _jsxs("div", { className: "rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss mb-3", children: ["Last attempt: ", d.lastError] }), err && _jsx("div", { className: "rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss mb-3", children: err }), ask && (_jsxs("form", { onSubmit: e => { e.preventDefault(); confirm(); }, className: "rounded-xl border border-accent/40 p-4 mb-4 space-y-2", children: [_jsx("div", { className: "text-sm font-semibold text-ink", children: "Confirm the download with two-step login" }), _jsx("p", { className: "text-xs text-muted", children: "The file holds every account (emails, password hashes). Keep it somewhere safe and delete it when you're done." }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("input", { value: code, onChange: e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6)), inputMode: "numeric", autoComplete: "one-time-code", placeholder: "000000", autoFocus: true, "aria-label": "6-digit code", className: "w-[160px] rounded-xl border border-line bg-surface2/60 px-3 py-2 text-center num text-xl tracking-[0.35em] text-ink outline-none focus:border-accent" }), _jsx("button", { type: "submit", disabled: busy || code.length !== 6, className: "rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm disabled:opacity-60", children: "Confirm" }), _jsx("button", { type: "button", onClick: () => { setAsk(null); setCode(''); }, className: "rounded-xl px-3 py-2 text-sm text-muted", children: "Cancel" })] })] })), d.local.length > 0 && (_jsx("ul", { className: "divide-y divide-line/50 text-sm", children: d.local.map(f => (_jsxs("li", { className: "py-2 flex flex-wrap items-center gap-x-3 gap-y-1", children: [_jsx("span", { className: "w-32 shrink-0 text-[11px] text-faint num", children: when(f.at) }), _jsx("span", { className: "text-ink truncate num text-xs", children: f.name }), _jsx("span", { className: "text-[11px] text-faint num", children: mb(f.size) }), _jsx("button", { type: "button", disabled: busy, onClick: () => download(f.name), className: "ml-auto text-xs font-semibold text-accent disabled:opacity-60", children: "Download" })] }, f.name))) })), d.history.some(h => !h.ok) && (_jsxs("p", { className: "mt-3 text-[11px] text-faint", children: ["Failed in the last ", d.history.length, " attempts: ", d.history.filter(h => !h.ok).length, ". A failure also emails you."] }))] }));
}
/** Pages that broke in visitors' browsers (sent by the site itself). "Mark fixed" after a fix is deployed: it reopens if it happens again. */
function SiteErrorsCard() {
    const [d, setD] = useState(null);
    const [showFixed, setShowFixed] = useState(false);
    const load = () => axios.get(`${API_URL}/admin/client-errors`).then(r => setD(r.data.data)).catch(() => setD(null));
    useEffect(() => { load(); }, []);
    if (!d)
        return null;
    const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const mark = (sig, resolved) => axios.post(`${API_URL}/admin/client-errors/${sig}`, { resolved }).then(load).catch(() => undefined);
    const rows = d.rows.filter(r => showFixed || !r.resolvedAt);
    const fixed = d.rows.length - d.open;
    return (_jsxs("section", { className: "card p-5 sm:p-6 mb-8", children: [_jsxs("div", { className: "flex flex-wrap items-baseline justify-between gap-2 mb-3", children: [_jsx("h2", { className: "font-display text-lg font-bold text-ink", children: "Site errors" }), _jsxs("span", { className: `text-xs ${d.open ? 'text-loss font-semibold' : 'text-faint'}`, children: [d.open ? `${d.open} open problem${d.open === 1 ? '' : 's'} · ${d.last24h} time${d.last24h === 1 ? '' : 's'} in the last 24 h` : 'No open problems', " \u00B7 pages that broke for visitors \u00B7 kept 30 days"] })] }), rows.length === 0 ? _jsx("p", { className: "text-sm text-faint", children: "Nothing broke. \uD83C\uDF89" }) : (_jsx("ul", { className: "divide-y divide-line/50 text-sm", children: rows.map(r => (_jsxs("li", { className: `py-3 ${r.resolvedAt ? 'opacity-60' : ''}`, children: [_jsxs("div", { className: "flex flex-wrap items-baseline gap-x-3 gap-y-1", children: [_jsx("span", { className: "font-semibold text-ink", children: r.pageKind }), _jsxs("span", { className: "text-[11px] num text-loss font-bold", children: [r.count, "\u00D7"] }), _jsxs("span", { className: "text-[11px] text-faint", children: ["last ", when(r.lastAt), " \u00B7 first ", when(r.firstAt), r.browsers.length ? ` · ${r.browsers.join(', ')}` : ''] }), _jsx("button", { type: "button", onClick: () => mark(r.sig, !r.resolvedAt), className: "ml-auto text-xs font-semibold text-accent hover:underline", children: r.resolvedAt ? 'Reopen' : 'Mark fixed' })] }), _jsx("div", { className: "mt-1 text-xs text-muted break-words", children: r.message }), _jsxs("div", { className: "mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px]", children: [r.pages.slice(0, 6).map(p => _jsx("a", { href: p, target: "_blank", rel: "noreferrer", className: "text-accent hover:underline", children: p }, p)), r.pages.length > 6 && _jsxs("span", { className: "text-faint", children: ["+", r.pages.length - 6, " more"] })] }), r.where && (_jsxs("details", { className: "mt-1 text-[11px] text-faint", children: [_jsx("summary", { className: "cursor-pointer", children: "Code location (for Claude)" }), _jsxs("pre", { className: "mt-1 whitespace-pre-wrap break-all", children: [r.where, r.version ? `\nsite version ${r.version}` : ''] })] }))] }, r.sig))) })), fixed > 0 && (_jsx("button", { type: "button", onClick: () => setShowFixed(v => !v), className: "mt-3 text-xs text-muted hover:text-ink underline", children: showFixed ? 'Hide fixed' : `Show fixed (${fixed})` }))] }));
}
function BbResultsCard() {
    const [d, setD] = useState(null);
    useEffect(() => { axios.get(`${API_URL}/admin/bb/result-checks`).then(r => setD(r.data.data)).catch(() => setD(null)); }, []);
    if (!d)
        return null;
    const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return (_jsxs("section", { className: "card p-5 sm:p-6 mb-8", children: [_jsxs("div", { className: "flex flex-wrap items-baseline justify-between gap-2 mb-3", children: [_jsx("h2", { className: "font-display text-lg font-bold text-ink", children: "Basketball results to check" }), _jsx("span", { className: "text-xs text-faint", children: "Checked every 30 min \u00B7 NBA corrected automatically from balldontlie \u00B7 flagged games don't count until checked" })] }), d.open.length === 0 ? _jsx("p", { className: "text-sm text-faint", children: "Nothing to check." }) : (_jsx("ul", { className: "divide-y divide-line/50 text-sm", children: d.open.map(x => (_jsxs("li", { className: "py-2 flex flex-wrap items-baseline gap-x-3", children: [_jsx("span", { className: "w-16 text-[11px] text-faint num", children: day(x.kickoff) }), _jsxs(Link, { to: `/basketball/game/${x.game_id}`, className: "font-semibold text-draw hover:underline", children: [x.home_name, " ", x.hs, "\u2013", x.as_, " ", x.away_name] }), _jsxs("span", { className: "text-[11px] text-muted", children: [x.code, " \u00B7 ", x.detail] })] }, x.game_id))) })), d.fixes.length > 0 && (_jsxs("details", { className: "mt-3 text-xs text-muted", children: [_jsxs("summary", { className: "cursor-pointer", children: ["Corrections (", d.fixes.length, ")"] }), _jsx("ul", { className: "mt-2 space-y-1", children: d.fixes.map(f => _jsxs("li", { children: [day(f.kickoff), " \u00B7 ", _jsxs(Link, { to: `/basketball/game/${f.game_id}`, className: "underline", children: [f.home_name, " \u2013 ", f.away_name] }), ": ", f.provider_hs, "\u2013", f.provider_as, " \u2192 ", _jsxs("b", { className: "text-ink", children: [f.hs, "\u2013", f.as_] }), " (", f.source, f.by_user ? `, ${f.by_user}` : '', ")"] }, f.game_id)) })] }))] }));
}
function SecurityCard() {
    const [d, setD] = useState(null);
    const [all, setAll] = useState(false);
    useEffect(() => { axios.get(`${API_URL}/admin/security-log`).then(r => setD(r.data.data)).catch(() => setD(null)); }, []);
    if (!d)
        return null;
    const rows = all ? d.rows : d.rows.slice(0, 12);
    return (_jsxs("section", { className: "card p-5 sm:p-6 mb-8", children: [_jsxs("div", { className: "flex flex-wrap items-baseline justify-between gap-2 mb-4", children: [_jsx("h2", { className: "font-display text-lg font-bold text-ink", children: "Security log" }), _jsxs("span", { className: `text-xs ${d.failed24h > 5 ? 'text-loss font-semibold' : 'text-faint'}`, children: [d.failed24h, " failed sign-ins in the last 24 h \u00B7 IPs kept 90 days"] })] }), d.rows.length === 0 ? _jsx("p", { className: "text-sm text-faint", children: "Nothing logged yet." }) : (_jsxs(_Fragment, { children: [_jsx("ul", { className: "divide-y divide-line/50 text-sm", children: rows.map(r => (_jsxs("li", { className: "py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5", children: [_jsx("span", { className: "w-32 shrink-0 text-[11px] text-faint num", children: fmt(r.at) }), _jsx("span", { className: `font-semibold ${BAD.has(r.event) ? 'text-loss' : 'text-ink'}`, children: EVENT_LABEL[r.event] || r.event }), _jsx("span", { className: "text-muted truncate", children: r.email || '—' }), _jsxs("span", { className: "ml-auto text-[11px] text-faint num", children: [r.ip || '', r.ua ? ` · ${browserOf(r.ua)}` : ''] })] }, r.id))) }), d.rows.length > 12 && (_jsx("button", { type: "button", onClick: () => setAll(v => !v), className: "mt-3 text-xs font-semibold text-accent", children: all ? 'Show less' : `Show all ${d.rows.length}` }))] }))] }));
}
const TOPIC_LABEL = {
    question: 'Question', account: 'Account / sign-in', billing: 'Billing / plan', privacy: 'Privacy / my data',
    bug: 'Something is broken', idea: 'Idea / feedback', business: 'Business / partnership', other: 'Other'
};
/** Messages from the contact form (they also arrive in support@ by email; reply from there). */
function ContactCard() {
    const [d, setD] = useState(null);
    const [all, setAll] = useState(false);
    const load = () => axios.get(`${API_URL}/admin/contact`).then(r => setD(r.data.data)).catch(() => setD(null));
    useEffect(() => { load(); }, []);
    if (!d)
        return null;
    const mark = async (id, handled) => {
        setD(prev => prev && { open: prev.open + (handled ? -1 : 1), rows: prev.rows.map(r => (r.id === id ? { ...r, handled } : r)) });
        await axios.post(`${API_URL}/admin/contact/${id}`, { handled }).catch(load);
    };
    const rows = d.rows.filter(r => all || !r.handled);
    return (_jsxs("section", { className: "card p-5 sm:p-6 mb-8", children: [_jsxs("div", { className: "flex flex-wrap items-baseline justify-between gap-2 mb-4", children: [_jsxs("h2", { className: "font-display text-lg font-bold text-ink", children: ["Contact messages ", _jsx(Link, { to: "/crm", className: "ml-2 text-xs font-semibold text-accent", children: "Open CRM inbox \u2192" })] }), _jsxs("span", { className: "text-xs text-faint", children: [d.open, " open \u00B7 ", d.rows.length, " total \u00B7", ' ', _jsx("button", { type: "button", onClick: () => setAll(v => !v), className: "text-accent font-semibold", children: all ? 'Open only' : 'Show all' })] })] }), rows.length === 0 ? (_jsx("p", { className: "text-sm text-faint", children: d.rows.length ? 'Nothing open. All answered.' : 'No messages yet.' })) : (_jsx("ul", { className: "divide-y divide-line/50 text-sm", children: rows.slice(0, 30).map(r => (_jsxs("li", { className: `py-3 ${r.handled ? 'opacity-55' : ''}`, children: [_jsxs("div", { className: "flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-faint", children: [_jsx("span", { className: "px-1.5 py-0.5 rounded bg-surface2 text-ink font-semibold", children: TOPIC_LABEL[r.topic] || r.topic }), _jsxs("span", { children: ["#", r.id, " \u00B7 ", fmt(r.at)] }), _jsx("span", { className: "text-ink", children: r.name || '—' }), _jsx("a", { href: `mailto:${r.email}?subject=${encodeURIComponent(`Re: your message to SportLikely (#${r.id})`)}`, className: "text-accent", children: r.email }), r.userId && _jsxs("span", { children: ["account #", r.userId] }), !r.sent && _jsx("span", { className: "text-loss font-semibold", children: "email not delivered \u2014 reply from here" }), _jsx("button", { type: "button", onClick: () => mark(r.id, !r.handled), className: "ml-auto text-xs font-semibold text-accent", children: r.handled ? 'Reopen' : 'Mark answered' })] }), _jsx("p", { className: "text-ink mt-1 whitespace-pre-wrap break-words", children: r.message })] }, r.id))) }))] }));
}
function LeaveCard() {
    const [d, setD] = useState(null);
    useEffect(() => { axios.get(`${API_URL}/admin/leave-feedback`).then(r => setD(r.data.data)).catch(() => setD(null)); }, []);
    if (!d)
        return null;
    const rows = Object.entries(d.counts).sort((a, b) => b[1].cancel + b[1].delete - (a[1].cancel + a[1].delete));
    const max = Math.max(1, ...rows.map(([, c]) => c.cancel + c.delete));
    return (_jsxs("section", { className: "card p-5 sm:p-6 mb-8", children: [_jsxs("div", { className: "flex flex-wrap items-baseline justify-between gap-2 mb-4", children: [_jsx("h2", { className: "font-display text-lg font-bold text-ink", children: "Why people leave" }), _jsxs("span", { className: "text-xs text-faint", children: ["last 12 months \u00B7 ", d.cancels, " cancelled \u00B7 ", d.deletes, " deleted \u00B7 ", d.cancelledStillActive, " cancelled but still active"] })] }), d.total === 0 ? _jsx("p", { className: "text-sm text-faint", children: "Nobody has cancelled or deleted an account yet." }) : (_jsxs(_Fragment, { children: [_jsx("ul", { className: "space-y-2 mb-5", children: rows.map(([k, c]) => (_jsxs("li", { className: "text-sm", children: [_jsxs("div", { className: "flex justify-between gap-3", children: [_jsx("span", { className: "text-ink", children: REASON_LABEL[k] || k }), _jsxs("span", { className: "num text-muted", children: [c.cancel, " cancel \u00B7 ", c.delete, " delete"] })] }), _jsxs("div", { className: "mt-1 h-2 rounded-full bg-surface2 overflow-hidden flex", children: [_jsx("div", { className: "h-full bg-draw", style: { width: `${(c.cancel / max) * 100}%` } }), _jsx("div", { className: "h-full bg-loss", style: { width: `${(c.delete / max) * 100}%` } })] })] }, k))) }), _jsx("div", { className: "label pb-2", children: "Latest comments" }), _jsxs("ul", { className: "divide-y divide-line/50 text-sm", children: [d.recent.filter(r => r.details).slice(0, 15).map((r, i) => (_jsxs("li", { className: "py-2", children: [_jsxs("div", { className: "text-[11px] text-faint", children: [fmt(r.at), " \u00B7 ", r.kind === 'cancel' ? 'cancelled' : 'deleted', " \u00B7 ", r.plan || 'free', " \u00B7 ", REASON_LABEL[r.reason] || r.reason, r.memberDays !== null ? ` · member ${r.memberDays} days` : ''] }), _jsx("div", { className: "text-ink mt-0.5", children: r.details })] }, i))), !d.recent.some(r => r.details) && _jsx("li", { className: "py-2 text-faint", children: "No written comments yet." })] })] }))] }));
}
