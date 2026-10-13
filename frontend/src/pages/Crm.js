import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../lib/socket';
import { errorText, useAuth } from '../lib/auth';
import { useConsole } from '../components/ConsoleGate';
const fmt = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const TOPIC = {
    feedback: 'Tester feedback', question: 'Question', account: 'Account', billing: 'Billing', privacy: 'Privacy', bug: 'Bug', idea: 'Idea', business: 'Business', other: 'Other'
};
const STATUS_TONE = { open: 'bg-accent/15 text-accent', waiting: 'bg-draw/15 text-draw', closed: 'bg-surface2 text-muted' };
const input = 'w-full rounded-xl border border-line bg-surface2/60 px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
const Err = ({ e }) => (e ? _jsx("div", { className: "rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss", children: e }) : null);
export default function Crm() {
    const { staff, user, loading, can } = useAuth();
    const con = useConsole();
    const [params, setParams] = useSearchParams();
    useEffect(() => { document.title = 'CRM · SportLikely'; }, []);
    if (loading)
        return null;
    if (!staff)
        return (_jsxs("div", { className: "max-w-md mx-auto px-4 py-16 text-center space-y-3", children: [_jsx("h1", { className: "font-display text-2xl font-extrabold text-ink", children: "CRM" }), _jsx("p", { className: "text-sm text-muted", children: user?.role
                        ? user.twoFactor
                            ? 'Sign out and sign in again with your two-step code to open the CRM.'
                            : 'Staff need two-step login. Turn it on in your account settings, then come back.'
                        : 'Staff only.' }), user?.role && !user.twoFactor && _jsx(Link, { to: "/account", className: "inline-block rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm", children: "Go to settings" })] }));
    const all = [
        { k: 'inbox', label: 'Support inbox', ok: can('inbox.read') },
        { k: 'customers', label: 'Customers', ok: can('customers.view') },
        { k: 'testers', label: 'Testers', ok: can('customers.view') },
        { k: 'campaigns', label: 'Campaigns', ok: can('campaigns') },
        { k: 'revenue', label: 'Revenue & churn', ok: can('revenue') },
        { k: 'security', label: 'Security log', ok: can('security') },
        { k: 'activity', label: 'Staff activity', ok: can('activity') },
        { k: 'team', label: 'Team & roles', ok: can('team') }
    ];
    const tabs = all.filter(t => t.ok);
    const want = params.get('tab');
    const tab = tabs.find(t => t.k === want)?.k || tabs[0]?.k || null;
    const roleName = staff === 'admin' ? 'Admin' : staff.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return (_jsxs("div", { className: "max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6", children: [_jsxs("div", { className: "flex flex-wrap items-end justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "font-display text-3xl font-extrabold tracking-tight text-ink", children: "CRM" }), _jsxs("p", { className: "text-sm text-muted mt-1", children: [roleName, " \u00B7 ", user?.email] }), con.username && (_jsxs("p", { className: "text-[11px] text-faint mt-1", children: ["Console: ", _jsx("b", { className: "text-muted", children: con.username }), " \u00B7", ' ', staff === 'admin' && _jsxs(_Fragment, { children: [_jsx("button", { type: "button", onClick: con.changePassword, className: "underline hover:text-ink", children: "Change console password" }), " \u00B7", ' '] }), _jsx("button", { type: "button", onClick: con.lock, className: "underline hover:text-ink", children: "Lock" })] }))] }), _jsx("div", { className: "seg flex-wrap", children: tabs.map(t => (_jsx("button", { type: "button", onClick: () => setParams({ tab: t.k }, { replace: true }), className: `seg-btn ${tab === t.k ? 'seg-btn-active' : ''}`, children: t.label }, t.k))) })] }), !tab && _jsx("div", { className: "card p-6 text-sm text-muted", children: "Your role has no CRM permissions yet. Ask the admin." }), tab === 'inbox' && _jsx(Inbox, {}), tab === 'customers' && _jsx(Customers, {}), tab === 'testers' && _jsx(Testers, { canInvite: can('customers.plan') }), tab === 'campaigns' && _jsx(Campaigns, {}), tab === 'revenue' && _jsx(Revenue, {}), tab === 'security' && _jsx(SecurityLog, {}), tab === 'activity' && _jsx(Activity, {}), tab === 'team' && _jsx(Team, {})] }));
}
function Inbox() {
    const [status, setStatus] = useState('open');
    const [list, setList] = useState(null);
    const [openId, setOpenId] = useState(null);
    const [error, setError] = useState(null);
    const load = () => axios.get(`${API_URL}/crm/inbox`, { params: { status: status || undefined } }).then(r => { setList(r.data.data); setError(null); }).catch(e => setError(errorText(e)));
    useEffect(() => { load(); }, [status]);
    return (_jsxs("div", { className: "grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr] items-start", children: [_jsxs("section", { className: "card overflow-hidden", children: [_jsx("div", { className: "flex gap-1 p-2 border-b border-line/60", children: ['open', 'waiting', 'closed', ''].map(s => (_jsxs("button", { type: "button", onClick: () => setStatus(s), className: `flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${status === s ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink'}`, children: [s ? `${s[0].toUpperCase()}${s.slice(1)}` : 'All', s && list ? ` · ${list.counts[s] ?? 0}` : ''] }, s || 'all'))) }), _jsx(Err, { e: error }), !list ? _jsx("div", { className: "p-6 text-sm text-faint", children: "Loading\u2026" }) : list.rows.length === 0 ? (_jsx("div", { className: "p-6 text-sm text-faint", children: status === 'open' ? 'Nothing open. All answered.' : 'No messages here.' })) : (_jsx("ul", { className: "divide-y divide-line/50 max-h-[70vh] overflow-y-auto", children: list.rows.map(r => (_jsx("li", { children: _jsxs("button", { type: "button", onClick: () => setOpenId(r.id), className: `w-full text-left px-4 py-3 hover:bg-surface2/50 ${openId === r.id ? 'bg-surface2/70' : ''}`, children: [_jsxs("div", { className: "flex items-center gap-2 text-[11px] text-faint", children: [_jsx("span", { className: `px-1.5 py-0.5 rounded font-bold uppercase tracking-wide text-[9px] ${STATUS_TONE[r.status] || ''}`, children: r.status }), _jsxs("span", { children: ["#", r.id] }), _jsx("span", { children: TOPIC[r.topic] || r.topic }), r.plan && r.plan !== 'free' && _jsx("span", { className: "text-accent font-semibold", children: r.plan }), _jsx("span", { className: "ml-auto", children: fmt(r.updatedAt || r.at) })] }), _jsx("div", { className: "text-sm font-semibold text-ink truncate mt-0.5", children: r.name || r.email }), _jsx("div", { className: "text-xs text-muted line-clamp-2", children: r.preview }), _jsxs("div", { className: "flex gap-3 text-[11px] text-faint mt-0.5", children: [r.replies > 0 && _jsxs("span", { children: [r.replies, " ", r.replies === 1 ? 'reply' : 'replies', " sent"] }), _jsx("span", { className: r.assignedTo ? 'text-ink/80' : '', children: r.assignedName ? `→ ${r.assignedName}` : 'Unassigned' })] })] }) }, r.id))) }))] }), openId ? _jsx(ThreadView, { id: openId, onChange: load, staff: list?.staff || [] }) : _jsx("section", { className: "card p-8 text-sm text-faint hidden lg:block", children: "Pick a message on the left." })] }));
}
function ThreadView({ id, onChange, staff }) {
    const { user, can } = useAuth();
    const [t, setT] = useState(null);
    const [text, setText] = useState('');
    const [mode, setMode] = useState('reply');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const load = () => axios.get(`${API_URL}/crm/inbox/${id}`).then(r => { setT(r.data.data); setError(null); }).catch(e => setError(errorText(e)));
    useEffect(() => { setT(null); setText(''); load(); }, [id]);
    const act = async (fn) => {
        setBusy(true);
        setError(null);
        try {
            await fn();
            await load();
            onChange();
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setBusy(false);
        }
    };
    const send = (close) => (e) => {
        e?.preventDefault();
        act(async () => {
            if (mode === 'note')
                await axios.post(`${API_URL}/crm/inbox/${id}/note`, { body: text });
            else
                await axios.post(`${API_URL}/crm/inbox/${id}/reply`, { body: text, close });
            setText('');
        });
    };
    const setStatus = (s) => act(() => axios.post(`${API_URL}/crm/inbox/${id}/status`, { status: s }));
    const assignTo = (to) => act(() => axios.post(`${API_URL}/crm/inbox/${id}/assign`, { to }));
    const canReply = can('inbox.reply'), manage = can('inbox.manage');
    if (!t)
        return _jsx("section", { className: "card p-6 text-sm text-faint", children: error || 'Loading…' });
    const m = t.message;
    return (_jsxs("section", { className: "card p-5 sm:p-6 space-y-5", children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "text-[11px] text-faint", children: ["#", m.id, " \u00B7 ", TOPIC[m.topic] || m.topic, " \u00B7 ", fmt(m.at), m.page ? ` · from ${m.page}` : ''] }), _jsx("h2", { className: "font-display text-xl font-bold text-ink truncate", children: m.name || m.email }), _jsx("a", { href: `mailto:${m.email}`, className: "text-sm text-accent", children: m.email })] }), _jsxs("div", { className: "flex flex-col items-end gap-2", children: [_jsx("div", { className: "flex gap-1", children: ['open', 'waiting', 'closed'].map(s => (_jsx("button", { type: "button", disabled: busy || m.status === s || !canReply, onClick: () => setStatus(s), className: `rounded-lg px-2.5 py-1 text-xs font-semibold ${m.status === s ? STATUS_TONE[s] : 'text-muted hover:text-ink border border-line'}`, children: s }, s))) }), manage ? (_jsxs("select", { value: m.assignedTo ?? '', disabled: busy, onChange: e => assignTo(e.target.value ? Number(e.target.value) : null), className: "rounded-lg border border-line bg-surface2/60 px-2 py-1 text-xs text-ink", children: [_jsx("option", { value: "", children: "Unassigned" }), staff.map(p => _jsx("option", { value: p.id, children: p.id === user?.id ? `${p.name} (me)` : p.name }, p.id))] })) : m.assignedTo === user?.id ? (_jsx("span", { className: "text-xs text-muted", children: "Assigned to you" })) : canReply && !m.assignedTo ? (_jsx("button", { type: "button", disabled: busy, onClick: () => assignTo(user.id), className: "rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink", children: "Take it" })) : null] })] }), t.account && (_jsxs("div", { className: "flex flex-wrap gap-x-5 gap-y-1 rounded-xl bg-surface2/50 border border-line/60 px-3 py-2 text-xs text-muted", children: [_jsxs("span", { children: ["Account #", t.account.id] }), _jsxs("span", { children: ["Plan ", _jsx("b", { className: "text-ink", children: t.account.plan }), t.account.premiumUntil ? ` until ${fmtDay(t.account.premiumUntil)}` : ''] }), _jsxs("span", { children: ["Joined ", fmtDay(t.account.createdAt)] }), _jsxs("span", { children: ["Last sign-in ", fmtDay(t.account.lastLoginAt)] }), t.account.cancelAt && _jsxs("span", { className: "text-loss", children: ["Cancelled ", fmtDay(t.account.cancelAt)] })] })), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "rounded-2xl border border-line bg-surface2/40 p-4", children: [_jsxs("div", { className: "text-[11px] text-faint mb-1", children: [m.name || 'Customer', " wrote"] }), _jsx("p", { className: "text-sm text-ink whitespace-pre-wrap break-words", children: m.message })] }), t.replies.map(r => (_jsxs("div", { className: `rounded-2xl p-4 ${r.kind === 'note' ? 'border border-dashed border-draw/50 bg-draw/5' : 'border border-accent/30 bg-accent/5 ml-4 sm:ml-10'}`, children: [_jsxs("div", { className: "text-[11px] text-faint mb-1", children: [r.kind === 'note' ? 'Internal note' : 'Reply', " \u00B7 ", r.byName, " \u00B7 ", fmt(r.at), r.kind === 'reply' && !r.sent ? ' · not delivered' : ''] }), _jsx("p", { className: "text-sm text-ink whitespace-pre-wrap break-words", children: r.body })] }, r.id))), t.replies.some(r => r.kind === 'reply') && (_jsxs("p", { className: "text-[11px] text-faint", children: ["The customer's answer arrives in the support@ inbox (Gmail), with [#", m.id, "] in the subject."] }))] }), canReply && _jsxs("form", { onSubmit: send(false), className: "space-y-2", children: [_jsxs("div", { className: "flex gap-1", children: [_jsx("button", { type: "button", onClick: () => setMode('reply'), className: `rounded-lg px-3 py-1 text-xs font-semibold ${mode === 'reply' ? 'bg-accent text-bg' : 'text-muted border border-line'}`, children: "Reply by email" }), _jsx("button", { type: "button", onClick: () => setMode('note'), className: `rounded-lg px-3 py-1 text-xs font-semibold ${mode === 'note' ? 'bg-draw text-bg' : 'text-muted border border-line'}`, children: "Internal note" })] }), _jsx("textarea", { className: `${input} min-h-[140px] resize-y`, value: text, onChange: e => setText(e.target.value), placeholder: mode === 'reply' ? `Hi ${m.name || ''}…` : 'Only staff see this', maxLength: 10000 }), _jsx(Err, { e: error }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("button", { type: "submit", disabled: busy || text.trim().length < 2, className: "rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm disabled:opacity-60", children: busy ? 'Sending…' : mode === 'reply' ? 'Send reply' : 'Save note' }), mode === 'reply' && (_jsx("button", { type: "button", onClick: () => send(true)(), disabled: busy || text.trim().length < 2, className: "rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60", children: "Send and close" }))] }), mode === 'reply' && _jsx("p", { className: "text-[11px] text-faint", children: "Sent from support@sportlikely.com with your message quoted below it." })] }), t.others.length > 0 && (_jsxs("div", { className: "text-xs text-muted", children: ["Other messages from this email: ", t.others.map(o => _jsxs("span", { className: "mr-2", children: ["#", o.id, " (", TOPIC[o.topic] || o.topic, ", ", o.status, ")"] }, o.id))] }))] }));
}
function Campaigns() {
    const [seg, setSeg] = useState({ plans: [], joinedWithinDays: '', activeWithinDays: '', inactiveForDays: '', includeStaff: false });
    const [preview, setPreview] = useState(null);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [list, setList] = useState([]);
    const [busy, setBusy] = useState(false);
    const [info, setInfo] = useState(null);
    const [error, setError] = useState(null);
    const segment = useMemo(() => ({
        plans: seg.plans, includeStaff: seg.includeStaff,
        joinedWithinDays: seg.joinedWithinDays || null, activeWithinDays: seg.activeWithinDays || null, inactiveForDays: seg.inactiveForDays || null
    }), [seg]);
    const loadList = () => axios.get(`${API_URL}/crm/campaigns`).then(r => setList(r.data.data)).catch(() => undefined);
    useEffect(() => { loadList(); }, []);
    useEffect(() => {
        const t = setTimeout(() => { axios.post(`${API_URL}/crm/segment`, { segment }).then(r => setPreview(r.data.data)).catch(e => setError(errorText(e))); }, 300);
        return () => clearTimeout(t);
    }, [segment]);
    useEffect(() => {
        if (!list.some(c => c.status === 'sending'))
            return;
        const t = setInterval(loadList, 3000);
        return () => clearInterval(t);
    }, [list]);
    const run = async (fn) => {
        setBusy(true);
        setError(null);
        setInfo(null);
        try {
            await fn();
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setBusy(false);
        }
    };
    const test = () => run(async () => {
        const r = await axios.post(`${API_URL}/crm/campaigns/test`, { subject, body });
        setInfo(`Test sent to ${r.data.data.sentTo}.`);
    });
    const send = () => {
        if (!preview?.count)
            return;
        if (!window.confirm(`Send "${subject}" to ${preview.count} ${preview.count === 1 ? 'person' : 'people'} now? This cannot be undone.`))
            return;
        run(async () => {
            const r = await axios.post(`${API_URL}/crm/campaigns`, { subject, body, segment, confirm: true });
            setInfo(`Sending to ${r.data.data.total}…`);
            setSubject('');
            setBody('');
            await loadList();
        });
    };
    const togglePlan = (p) => setSeg(s => ({ ...s, plans: s.plans.includes(p) ? s.plans.filter(x => x !== p) : [...s.plans, p] }));
    const num = (k, label) => (_jsxs("label", { className: "block", children: [_jsx("span", { className: "label", children: label }), _jsx("input", { className: `${input} mt-1`, inputMode: "numeric", value: seg[k], onChange: e => setSeg(s => ({ ...s, [k]: e.target.value.replace(/\D/g, '').slice(0, 4) })), placeholder: "any" })] }));
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs("div", { className: "grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr] items-start", children: [_jsxs("section", { className: "card p-5 space-y-4", children: [_jsx("h2", { className: "font-display text-lg font-bold text-ink", children: "Who gets it" }), _jsxs("div", { children: [_jsx("span", { className: "label", children: "Plan" }), _jsx("div", { className: "flex gap-2 mt-1", children: ['free', 'premium', 'pro'].map(p => (_jsx("button", { type: "button", onClick: () => togglePlan(p), className: `rounded-lg px-3 py-1.5 text-xs font-semibold border ${seg.plans.includes(p) ? 'bg-accent text-bg border-accent' : 'border-line text-muted'}`, children: p }, p))) }), _jsx("p", { className: "text-[11px] text-faint mt-1", children: "None selected = every plan." })] }), num('joinedWithinDays', 'Joined in the last … days'), num('activeWithinDays', 'Signed in during the last … days'), num('inactiveForDays', 'No sign-in for … days (win back)'), _jsxs("label", { className: "flex items-center gap-2 text-sm text-muted", children: [_jsx("input", { type: "checkbox", checked: seg.includeStaff, onChange: e => setSeg(s => ({ ...s, includeStaff: e.target.checked })), className: "w-4 h-4 accent-[rgb(var(--accent))]" }), "Include admin and staff accounts"] }), _jsxs("div", { className: "rounded-xl bg-surface2/60 border border-line px-3 py-2", children: [_jsx("div", { className: "num text-2xl font-extrabold text-ink", children: preview ? preview.count : '–' }), _jsxs("div", { className: "text-[11px] text-muted", children: ["people in this segment \u00B7 ", preview?.optedIn ?? '–', " accounts accept update emails in total"] }), preview && preview.sample.length > 0 && _jsx("div", { className: "text-[11px] text-faint mt-1 truncate", children: preview.sample.map(x => x.email).join(', ') })] }), _jsx("p", { className: "text-[11px] text-faint", children: "Only accounts that ticked \"email updates\" and confirmed their email. Every email has a one-click unsubscribe link." })] }), _jsxs("section", { className: "card p-5 space-y-3", children: [_jsx("h2", { className: "font-display text-lg font-bold text-ink", children: "Message" }), _jsx("input", { className: input, value: subject, onChange: e => setSubject(e.target.value), placeholder: "Subject", maxLength: 150 }), _jsx("textarea", { className: `${input} min-h-[220px] resize-y`, value: body, onChange: e => setBody(e.target.value), maxLength: 20000, placeholder: 'Hi {name},\n\nWrite your update here. A blank line starts a new paragraph. **bold** works, links are clickable.\n\nThe SportLikely team' }), _jsxs("p", { className: "text-[11px] text-faint", children: ['{name}', " is replaced by the person's name (or \"there\"). Replies go to support@."] }), _jsx(Err, { e: error }), info && _jsx("div", { className: "rounded-xl border border-win/40 bg-win/10 px-3 py-2 text-sm text-win", children: info }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("button", { type: "button", onClick: test, disabled: busy || subject.trim().length < 3 || body.trim().length < 10, className: "rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50", children: "Send me a test" }), _jsxs("button", { type: "button", onClick: send, disabled: busy || !preview?.count || subject.trim().length < 3 || body.trim().length < 10, className: "rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm disabled:opacity-50", children: ["Send to ", preview?.count ?? 0] })] })] })] }), _jsxs("section", { className: "card overflow-hidden", children: [_jsx("div", { className: "px-5 py-3 border-b border-line/60 font-display font-bold text-ink", children: "Sent campaigns" }), list.length === 0 ? _jsx("p", { className: "p-5 text-sm text-faint", children: "None yet." }) : (_jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-[11px] uppercase tracking-wide text-faint text-left", children: [_jsx("th", { className: "px-5 py-2", children: "Date" }), _jsx("th", { className: "px-2 py-2", children: "Subject" }), _jsx("th", { className: "px-2 py-2 text-right", children: "Sent" }), _jsx("th", { className: "px-5 py-2 text-right", children: "Status" })] }) }), _jsx("tbody", { className: "divide-y divide-line/50", children: list.map(c => (_jsxs("tr", { children: [_jsx("td", { className: "px-5 py-2 text-muted whitespace-nowrap", children: fmt(c.createdAt) }), _jsx("td", { className: "px-2 py-2 text-ink truncate max-w-[280px]", children: c.subject }), _jsxs("td", { className: "px-2 py-2 text-right num", children: [c.sent, "/", c.total, c.failed ? _jsxs("span", { className: "text-loss", children: [" \u00B7 ", c.failed, " failed"] }) : ''] }), _jsx("td", { className: "px-5 py-2 text-right text-xs", children: c.status === 'sending' ? _jsx("span", { className: "text-draw font-semibold", children: "sending\u2026" }) : _jsx("span", { className: "text-win", children: "done" }) })] }, c.id))) })] }))] })] }));
}
const REASON = {
    too_expensive: 'Too expensive', not_accurate: 'Predictions not accurate enough', not_using: 'Not using it enough',
    missing_feature: 'Missing a feature', other_service: 'Found another service', technical: 'Technical problems', other: 'Other'
};
function Revenue() {
    const [d, setD] = useState(null);
    const [error, setError] = useState(null);
    useEffect(() => { axios.get(`${API_URL}/crm/revenue`).then(r => setD(r.data.data)).catch(e => setError(errorText(e))); }, []);
    if (error)
        return _jsx(Err, { e: error });
    if (!d)
        return _jsx("div", { className: "card p-6 text-sm text-faint", children: "Loading\u2026" });
    const maxSign = Math.max(1, ...d.monthly.map(m => m.signups));
    const tile = (label, value, sub) => (_jsxs("div", { className: "rounded-2xl border border-line/60 bg-surface2/50 px-4 py-3", children: [_jsx("div", { className: "text-[10px] font-semibold uppercase tracking-wide text-faint", children: label }), _jsx("div", { className: "num text-2xl font-extrabold text-ink leading-none mt-1.5", children: value }), sub && _jsx("div", { className: "text-[11px] text-muted mt-1", children: sub })] }));
    return (_jsxs("div", { className: "space-y-5", children: [!d.paymentsLive && (_jsxs("div", { className: "rounded-xl border border-draw/40 bg-draw/10 px-4 py-3 text-sm text-ink", children: ["Payments are not live yet: money figures stay at $0 until real payments come in. Plans set by hand or in test mode are counted as accounts, not revenue (", d.paying.testOrManual, " now)."] })), _jsxs("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-3", children: [tile('Monthly revenue (MRR)', `$${d.mrr.toLocaleString('en-US')}`, `$${d.arr.toLocaleString('en-US')} a year at this rate`), tile('Paying accounts', String(d.paying.total), `${d.paying.premium} Premium · ${d.paying.pro} Pro`), tile('Free → paid', d.conversion !== null ? `${d.conversion}%` : '–', `of ${d.accounts} accounts`), tile('Churn this month', d.churnThisMonth !== null ? `${d.churnThisMonth}%` : '–', `${d.cancelledStillActive} cancelled, still active`)] }), _jsxs("section", { className: "card overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-line/60 flex items-baseline justify-between gap-3", children: [_jsx("h2", { className: "font-display font-bold text-ink", children: "Last 12 months" }), _jsxs("span", { className: "text-[11px] text-faint", children: ["Premium $", d.prices.premium, " \u00B7 Pro $", d.prices.pro, " a month"] })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm min-w-[560px]", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-[11px] uppercase tracking-wide text-faint text-left", children: [_jsx("th", { className: "px-5 py-2", children: "Month" }), _jsx("th", { className: "px-2 py-2", children: "Sign-ups" }), _jsx("th", { className: "px-2 py-2 text-right", children: "New paying" }), _jsx("th", { className: "px-2 py-2 text-right", children: "Revenue" }), _jsx("th", { className: "px-2 py-2 text-right", children: "Cancelled" }), _jsx("th", { className: "px-5 py-2 text-right", children: "Deleted" })] }) }), _jsx("tbody", { className: "divide-y divide-line/50", children: d.monthly.slice().reverse().map(m => (_jsxs("tr", { children: [_jsx("td", { className: "px-5 py-2 text-muted num whitespace-nowrap", children: new Date(`${m.month}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) }), _jsx("td", { className: "px-2 py-2", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "w-6 text-right num text-ink", children: m.signups }), _jsx("span", { className: "flex-1 max-w-[160px] h-1.5 rounded-full bg-surface2 overflow-hidden", children: _jsx("span", { className: "block h-full bg-accent rounded-full", style: { width: `${(m.signups / maxSign) * 100}%` } }) })] }) }), _jsx("td", { className: "px-2 py-2 text-right num text-ink", children: m.newPaid || '–' }), _jsx("td", { className: "px-2 py-2 text-right num text-ink", children: m.revenue ? `$${m.revenue.toLocaleString('en-US')}` : '–' }), _jsx("td", { className: `px-2 py-2 text-right num ${m.cancels ? 'text-loss' : 'text-faint'}`, children: m.cancels || '–' }), _jsx("td", { className: `px-5 py-2 text-right num ${m.deletes ? 'text-loss' : 'text-faint'}`, children: m.deletes || '–' })] }, m.month))) })] }) })] }), _jsxs("section", { className: "card p-5", children: [_jsx("h2", { className: "font-display font-bold text-ink mb-3", children: "Why people leave (12 months)" }), d.reasons.length === 0 ? _jsx("p", { className: "text-sm text-faint", children: "Nobody has cancelled or deleted an account yet." }) : (_jsx("ul", { className: "space-y-2", children: d.reasons.map(r => {
                            const max = d.reasons[0].n;
                            return (_jsxs("li", { className: "flex items-center gap-3 text-sm", children: [_jsx("span", { className: "w-56 truncate text-ink", children: REASON[r.reason] || r.reason }), _jsx("span", { className: "flex-1 h-2 rounded-full bg-surface2 overflow-hidden", children: _jsx("span", { className: "block h-full bg-loss/80 rounded-full", style: { width: `${(r.n / max) * 100}%` } }) }), _jsx("span", { className: "w-8 text-right num text-muted", children: r.n })] }, r.reason));
                        }) }))] })] }));
}
const PLAN_TONE = { free: 'text-muted', premium: 'text-accent', pro: 'text-accent font-bold' };
function Customers() {
    const [q, setQ] = useState('');
    const [rows, setRows] = useState(null);
    const [openId, setOpenId] = useState(null);
    const [error, setError] = useState(null);
    useEffect(() => {
        const t = setTimeout(() => { axios.get(`${API_URL}/crm/customers`, { params: { q } }).then(r => { setRows(r.data.data); setError(null); }).catch(e => setError(errorText(e))); }, 250);
        return () => clearTimeout(t);
    }, [q]);
    return (_jsxs("div", { className: "grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr] items-start", children: [_jsxs("section", { className: "card overflow-hidden", children: [_jsx("div", { className: "p-2 border-b border-line/60", children: _jsx("input", { className: input, value: q, onChange: e => setQ(e.target.value), placeholder: "Search email or name", autoCapitalize: "none", autoCorrect: "off", spellCheck: false }) }), _jsx(Err, { e: error }), !rows ? _jsx("div", { className: "p-6 text-sm text-faint", children: "Loading\u2026" }) : rows.length === 0 ? _jsx("div", { className: "p-6 text-sm text-faint", children: "No accounts found." }) : (_jsx("ul", { className: "divide-y divide-line/50 max-h-[70vh] overflow-y-auto", children: rows.map(r => (_jsx("li", { children: _jsxs("button", { type: "button", onClick: () => setOpenId(r.id), className: `w-full text-left px-4 py-2.5 hover:bg-surface2/50 ${openId === r.id ? 'bg-surface2/70' : ''}`, children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-sm text-ink truncate flex-1", children: r.email }), _jsx("span", { className: `text-[11px] uppercase ${PLAN_TONE[r.plan] || ''}`, children: r.plan })] }), _jsxs("div", { className: "text-[11px] text-faint", children: [r.name ? `${r.name} · ` : '', "joined ", fmtDay(r.createdAt), " \u00B7 last seen ", fmtDay(r.lastLoginAt), r.cancelAt ? ' · cancelled' : ''] })] }) }, r.id))) }))] }), openId ? _jsx(CustomerView, { id: openId }) : _jsx("section", { className: "card p-8 text-sm text-faint hidden lg:block", children: "Pick an account on the left." })] }));
}
function CustomerView({ id }) {
    const { can } = useAuth();
    const [c, setC] = useState(null);
    const [plan, setPlan] = useState('premium');
    const [days, setDays] = useState('7');
    const [busy, setBusy] = useState(false);
    const [info, setInfo] = useState(null);
    const [error, setError] = useState(null);
    const load = () => axios.get(`${API_URL}/crm/customers/${id}`).then(r => { setC(r.data.data); setError(null); }).catch(e => setError(errorText(e)));
    useEffect(() => { setC(null); setInfo(null); load(); }, [id]);
    const act = async (fn) => {
        setBusy(true);
        setError(null);
        setInfo(null);
        try {
            setInfo(await fn());
            await load();
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setBusy(false);
        }
    };
    if (!c)
        return _jsx("section", { className: "card p-6 text-sm text-faint", children: error || 'Loading…' });
    const staffAcct = !!c.role;
    const row = (k, v) => _jsxs("div", { className: "flex justify-between gap-3 py-1.5 border-b border-line/40 text-sm", children: [_jsx("span", { className: "text-muted", children: k }), _jsx("span", { className: "text-ink text-right", children: v })] });
    return (_jsxs("section", { className: "card p-5 sm:p-6 space-y-5", children: [_jsxs("div", { children: [_jsxs("div", { className: "text-[11px] text-faint", children: ["Account #", c.id, staffAcct ? ` · staff (${c.role})` : ''] }), _jsx("h2", { className: "font-display text-xl font-bold text-ink truncate", children: c.name || c.email }), _jsx("div", { className: "text-sm text-muted truncate", children: c.email })] }), _jsxs("div", { children: [row('Plan', _jsxs("span", { className: PLAN_TONE[c.plan], children: [c.plan, c.premiumUntil ? ` · until ${fmtDay(c.premiumUntil)}` : '', c.cancelAt ? ' · cancelled' : ''] })), row('Joined', fmtDay(c.createdAt)), row('Last sign-in', fmt(c.lastLoginAt)), row('Email confirmed', c.emailVerified ? 'Yes' : 'No'), row('Email updates', c.emailUpdates ? 'Yes' : 'No'), row('Two-step login', c.twoFactor ? 'On' : 'Off'), row('Signed-in devices', c.devices), row('Unlocks this month', c.unlocksThisMonth), row('Favorites', c.favorites)] }), can('customers.plan') && !staffAcct && (_jsxs("div", { className: "rounded-2xl border border-line p-4 space-y-3", children: [_jsx("div", { className: "font-semibold text-ink text-sm", children: "Change plan" }), _jsxs("div", { className: "flex flex-wrap items-end gap-2", children: [_jsxs("select", { value: plan, onChange: e => setPlan(e.target.value), className: "rounded-lg border border-line bg-surface2/60 px-2 py-2 text-sm text-ink", children: [_jsx("option", { value: "premium", children: "Premium" }), _jsx("option", { value: "pro", children: "Pro" }), _jsx("option", { value: "free", children: "Free" })] }), plan !== 'free' && (_jsxs("label", { className: "text-xs text-muted", children: ["Days", _jsx("input", { value: days, onChange: e => setDays(e.target.value.replace(/\D/g, '').slice(0, 3)), className: "ml-1 w-16 rounded-lg border border-line bg-surface2/60 px-2 py-2 text-sm text-ink num", inputMode: "numeric" })] })), _jsx("button", { type: "button", disabled: busy, onClick: () => {
                                    if (!window.confirm(plan === 'free' ? `Set ${c.email} back to Free?` : `Give ${c.email} ${plan} for ${days} days?`))
                                        return;
                                    act(async () => { await axios.post(`${API_URL}/crm/customers/${id}/plan`, { plan, days: Number(days) || 7 }); return 'Plan updated.'; });
                                }, className: "rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm disabled:opacity-60", children: "Apply" })] }), _jsx("p", { className: "text-[11px] text-faint", children: "Same plan already running: the days are added to its end date. Recorded as a manual change (not revenue)." })] })), can('customers.security') && !staffAcct && (_jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("button", { type: "button", disabled: busy, onClick: () => act(async () => { const r = await axios.post(`${API_URL}/crm/customers/${id}/reset-email`); return `Password-reset code sent to ${r.data.data.sentTo}.`; }), className: "rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink", children: "Send password reset email" }), _jsx("button", { type: "button", disabled: busy, onClick: () => { if (window.confirm('Sign this customer out on every device?'))
                            act(async () => { const r = await axios.post(`${API_URL}/crm/customers/${id}/sign-out`); return `Signed out on ${r.data.data.devices} device(s).`; }); }, className: "rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink", children: "Sign out everywhere" })] })), _jsx(Err, { e: error }), info && _jsx("div", { className: "rounded-xl border border-win/40 bg-win/10 px-3 py-2 text-sm text-win", children: info }), c.planHistory.length > 0 && (_jsxs("div", { children: [_jsx("div", { className: "label pb-1", children: "Plan history" }), _jsx("ul", { className: "text-xs text-muted space-y-1", children: c.planHistory.map((h, i) => _jsxs("li", { children: [fmt(h.at), " \u00B7 ", h.fromPlan || '—', " \u2192 ", _jsx("b", { className: "text-ink", children: h.toPlan }), h.until ? ` until ${fmtDay(h.until)}` : '', " \u00B7 ", h.source] }, i)) })] })), c.messages.length > 0 && (_jsxs("div", { children: [_jsx("div", { className: "label pb-1", children: "Messages" }), _jsx("ul", { className: "text-xs text-muted space-y-1", children: c.messages.map(m => _jsxs("li", { children: ["#", m.id, " \u00B7 ", fmt(m.at), " \u00B7 ", TOPIC[m.topic] || m.topic, " \u00B7 ", m.status] }, m.id)) })] })), c.staffActivity && c.staffActivity.length > 0 && (_jsxs("div", { children: [_jsx("div", { className: "label pb-1", children: "What staff did on this account" }), _jsx("ul", { className: "text-xs text-muted space-y-1", children: c.staffActivity.slice(0, 15).map(a => _jsxs("li", { children: [fmt(a.at), " \u00B7 ", _jsx("span", { className: "text-ink", children: a.staffEmail }), " \u00B7 ", a.label, a.detail ? ` (${a.detail})` : ''] }, a.id)) })] })), c.security && c.security.length > 0 && (_jsxs("div", { children: [_jsx("div", { className: "label pb-1", children: "Recent sign-ins and security events" }), _jsx("ul", { className: "text-xs text-muted space-y-1", children: c.security.slice(0, 12).map((x, i) => _jsxs("li", { children: [fmt(x.at), " \u00B7 ", _jsx("span", { className: "text-ink", children: x.event.replace(/_/g, ' ') }), x.ip ? ` · ${x.ip}` : ''] }, i)) })] }))] }));
}
/* ================================================================== */
/* Security log                                                       */
/* ================================================================== */
function SecurityLog() {
    const [d, setD] = useState(null);
    const [q, setQ] = useState('');
    const [error, setError] = useState(null);
    useEffect(() => { axios.get(`${API_URL}/crm/security`).then(r => setD(r.data.data)).catch(e => setError(errorText(e))); }, []);
    if (error)
        return _jsx(Err, { e: error });
    if (!d)
        return _jsx("div", { className: "card p-6 text-sm text-faint", children: "Loading\u2026" });
    const term = q.trim().toLowerCase();
    const rows = d.rows.filter(r => !term || `${r.email} ${r.event} ${r.ip} ${r.detail}`.toLowerCase().includes(term));
    const bad = (e) => /fail|off|deleted|role_|signed_out|reset|recovery/.test(e);
    return (_jsxs("section", { className: "card overflow-hidden", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-line/60", children: [_jsxs("span", { className: `text-sm ${d.failed24h > 5 ? 'text-loss font-semibold' : 'text-muted'}`, children: [d.failed24h, " failed sign-ins in the last 24 h \u00B7 IPs kept 90 days"] }), _jsx("input", { className: `${input} max-w-xs`, value: q, onChange: e => setQ(e.target.value), placeholder: "Filter (email, IP, event)" })] }), _jsx("div", { className: "overflow-x-auto", children: _jsx("table", { className: "w-full text-sm min-w-[640px]", children: _jsx("tbody", { className: "divide-y divide-line/50", children: rows.slice(0, 300).map(r => (_jsxs("tr", { children: [_jsx("td", { className: "px-5 py-2 text-[11px] text-faint whitespace-nowrap num", children: fmt(r.at) }), _jsx("td", { className: `px-2 py-2 font-semibold whitespace-nowrap ${bad(r.event) ? 'text-loss' : 'text-ink'}`, children: r.event.replace(/_/g, ' ') }), _jsx("td", { className: "px-2 py-2 text-muted truncate max-w-[220px]", children: r.email || '—' }), _jsx("td", { className: "px-2 py-2 text-[11px] text-faint truncate max-w-[260px]", children: r.detail || '' }), _jsx("td", { className: "px-5 py-2 text-[11px] text-faint num whitespace-nowrap", children: r.ip || '' })] }, r.id))) }) }) })] }));
}
function Team() {
    const [d, setD] = useState(null);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('');
    const [newName, setNewName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [info, setInfo] = useState(null);
    // team changes need a fresh two-step code (opens a 5-minute window on the server)
    const [left, setLeft] = useState(0);
    const [pending, setPending] = useState(null);
    const [code, setCode] = useState('');
    const [conFor, setConFor] = useState(null);
    const [conUser, setConUser] = useState('');
    const [conPw, setConPw] = useState('');
    const load = () => axios.get(`${API_URL}/crm/team`).then(r => { setD(r.data.data); setError(null); }).catch(e => setError(errorText(e)));
    const loadSudo = () => axios.get(`${API_URL}/crm/team/sudo`).then(r => setLeft(r.data.data.leftMs)).catch(() => undefined);
    useEffect(() => { load(); loadSudo(); }, []);
    useEffect(() => {
        if (left <= 0)
            return;
        const t = setInterval(() => setLeft(x => Math.max(0, x - 1000)), 1000);
        return () => clearInterval(t);
    }, [left > 0]);
    const act = async (fn) => {
        setBusy(true);
        setError(null);
        setInfo(null);
        try {
            const m = await fn();
            if (m)
                setInfo(m);
            await load();
        }
        catch (e) {
            if (e?.response?.status === 401 && e?.response?.data?.sudo) {
                setLeft(0);
                setPending(() => fn);
            }
            else
                setError(errorText(e));
        }
        finally {
            setBusy(false);
        }
    };
    const unlock = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const r = await axios.post(`${API_URL}/crm/team/sudo`, { code });
            setLeft(r.data.data.leftMs);
            setCode('');
            const fn = pending;
            setPending(null);
            if (fn) {
                setBusy(false);
                await act(fn);
                return;
            }
        }
        catch (err) {
            setError(errorText(err));
            setCode('');
        }
        finally {
            setBusy(false);
        }
    };
    if (!d)
        return _jsx("div", { className: "card p-6 text-sm text-faint", children: error || 'Loading…' });
    const mmss = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
    const groups = [...new Set(d.perms.map(p => p.group))];
    const toggle = (r, perm) => {
        const perms = r.perms.includes(perm) ? r.perms.filter(x => x !== perm) : [...r.perms, perm];
        act(async () => { await axios.post(`${API_URL}/crm/team/roles/${r.key}`, { perms }); });
    };
    const cols = [d.admin, ...d.roles];
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs("div", { className: `flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${left > 0 ? 'border-win/40 bg-win/10' : 'border-line bg-surface2/40'}`, children: [_jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", className: left > 0 ? 'text-win' : 'text-muted', "aria-hidden": true, children: [_jsx("rect", { x: "5", y: "11", width: "14", height: "10", rx: "2" }), _jsx("path", { d: left > 0 ? 'M8 11V7a4 4 0 0 1 7.5-2' : 'M8 11V7a4 4 0 0 1 8 0v4' })] }), _jsx("span", { className: "flex-1 text-ink", children: left > 0 ? _jsxs(_Fragment, { children: ["Team changes unlocked for ", _jsx("b", { className: "num", children: mmss }), ". Every change is logged."] }) : 'Team changes are locked. Each time you change the team or a role, you confirm it with a code from your authenticator app.' }), left <= 0 && !pending && _jsx("button", { type: "button", onClick: () => setPending(() => async () => 'Unlocked.'), className: "rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink", children: "Unlock now" })] }), pending && (_jsxs("form", { onSubmit: unlock, className: "card p-5 space-y-3 border-accent/40", children: [_jsx("div", { className: "font-display font-bold text-ink", children: "Confirm with two-step login" }), _jsx("p", { className: "text-sm text-muted", children: "Enter the 6-digit code from your authenticator app. The change you asked for is saved right after." }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("input", { className: "w-[200px] rounded-xl border border-line bg-surface2/60 px-4 py-2.5 text-center num text-2xl tracking-[0.4em] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20", value: code, onChange: e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6)), inputMode: "numeric", autoComplete: "one-time-code", placeholder: "000000", autoFocus: true, "aria-label": "6-digit code" }), _jsx("button", { type: "submit", disabled: busy || code.length !== 6, className: "rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm disabled:opacity-60", children: busy ? 'Checking…' : 'Confirm' }), _jsx("button", { type: "button", onClick: () => { setPending(null); setCode(''); }, className: "rounded-xl px-4 py-2 text-sm text-muted", children: "Cancel" })] })] })), _jsx(Err, { e: error }), info && _jsx("div", { className: "rounded-xl border border-win/40 bg-win/10 px-3 py-2 text-sm text-win", children: info }), _jsxs("section", { className: "card overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-line/60 flex flex-wrap items-baseline justify-between gap-2", children: [_jsxs("h2", { className: "font-display font-bold text-ink", children: ["Team (", d.staff.length, ")"] }), _jsx("span", { className: "text-[11px] text-faint", children: "Staff need a confirmed email and two-step login before their role works." })] }), _jsxs("form", { onSubmit: e => { e.preventDefault(); act(async () => { await axios.post(`${API_URL}/crm/team/member`, { email, role: role || null }); setEmail(''); return 'Saved.'; }); }, className: "flex flex-wrap gap-2 p-4 border-b border-line/60", children: [_jsx("input", { className: `${input} flex-1 min-w-[220px]`, type: "email", required: true, value: email, onChange: e => setEmail(e.target.value), placeholder: "Their account email (they sign up first)", autoCapitalize: "none", spellCheck: false }), _jsxs("select", { value: role, onChange: e => setRole(e.target.value), className: "rounded-xl border border-line bg-surface2/60 px-3 py-2 text-sm text-ink", children: [_jsx("option", { value: "", children: "Choose a role\u2026" }), d.roles.map(r => _jsx("option", { value: r.key, children: r.name }, r.key))] }), _jsx("button", { type: "submit", disabled: busy || !role, className: "rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm disabled:opacity-60", children: "Add to team" })] }), d.staff.length === 0 ? _jsx("p", { className: "p-5 text-sm text-faint", children: "No staff yet. You (admin) have every permission." }) : (_jsx("ul", { className: "divide-y divide-line/50", children: d.staff.map(m => (_jsxs("li", { className: "flex flex-wrap items-center gap-3 px-5 py-3 text-sm", children: [_jsxs("span", { className: "flex-1 min-w-[200px]", children: [_jsx("span", { className: "block text-ink truncate", children: m.name || m.email }), _jsxs("span", { className: "block text-[11px] text-faint truncate", children: [m.email, " \u00B7 last seen ", fmtDay(m.lastLoginAt)] }), _jsxs("span", { className: "mt-1 inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface2/60 px-2 py-0.5 text-xs", children: [_jsx("span", { className: "text-faint", children: "Console username" }), m.console ? _jsx("b", { className: "num text-ink select-all", children: m.console.username }) : _jsx("span", { className: "text-loss font-semibold", children: "not set" })] })] }), (!m.twoFactor || !m.emailVerified) && _jsx("span", { className: "text-[11px] text-draw font-semibold", children: !m.emailVerified ? 'email not confirmed' : 'no two-step login yet' }), _jsx("button", { type: "button", disabled: busy, onClick: () => { setConFor(conFor === m.id ? null : m.id); setConUser(m.console?.username || ''); setConPw(''); }, className: "text-xs text-accent font-semibold", children: m.console ? 'Edit console login' : 'Set console login' }), _jsx("select", { value: m.role, disabled: busy, onChange: e => act(async () => { await axios.post(`${API_URL}/crm/team/member`, { email: m.email, role: e.target.value }); return `${m.email} is now ${d.roles.find(r => r.key === e.target.value)?.name}.`; }), className: "rounded-lg border border-line bg-surface2/60 px-2 py-1.5 text-xs text-ink", children: d.roles.map(r => _jsx("option", { value: r.key, children: r.name }, r.key)) }), _jsx("button", { type: "button", disabled: busy, onClick: () => { if (window.confirm(`Remove ${m.email} from the team? Their access stops at once.`))
                                        act(async () => { await axios.post(`${API_URL}/crm/team/member`, { email: m.email, role: null }); return 'Removed from the team.'; }); }, className: "text-xs text-muted hover:text-loss", children: "Remove" }), conFor === m.id && (_jsxs("form", { onSubmit: e => {
                                        e.preventDefault();
                                        const id = m.id, u = conUser.trim(), p = conPw;
                                        if (m.console && !p && u === m.console.username) {
                                            setConFor(null);
                                            return;
                                        }
                                        act(async () => {
                                            const r = await axios.post(`${API_URL}/crm/team/console`, { userId: id, username: u, password: p || undefined });
                                            setConFor(null);
                                            setConPw('');
                                            return r.data.data.passwordChanged
                                                ? `Console login for ${m.email}: username ${r.data.data.username}, new password saved. Give it to them in person or by phone (not by email).`
                                                : `Console username for ${m.email} is now ${r.data.data.username}. Their password did not change.`;
                                        });
                                    }, className: "basis-full rounded-xl border border-line bg-surface2/40 p-3 space-y-2", children: [_jsx("div", { className: "text-xs font-semibold text-ink", children: m.console ? 'Edit console login' : 'Set console login' }), _jsxs("div", { className: "grid gap-2 sm:grid-cols-2", children: [_jsxs("label", { className: "block", children: [_jsx("span", { className: "block text-[11px] text-faint mb-1", children: "Console username" }), _jsx("input", { className: input, value: conUser, onChange: e => setConUser(e.target.value), placeholder: "e.g. dana.s", autoCapitalize: "none", spellCheck: false, autoComplete: "off", required: true })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "block text-[11px] text-faint mb-1", children: m.console ? 'New password (leave empty to keep it)' : 'Password' }), _jsx("input", { className: input, type: "text", value: conPw, onChange: e => setConPw(e.target.value), placeholder: "10+ characters", autoComplete: "off", minLength: 10, required: !m.console })] })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("button", { type: "submit", disabled: busy, className: "rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm disabled:opacity-60", children: "Save" }), _jsx("button", { type: "button", onClick: () => setConFor(null), className: "rounded-xl px-3 py-2 text-sm text-muted", children: "Cancel" }), _jsx("span", { className: "text-[11px] text-faint", children: "Only managers set console passwords \u2014 staff can't change their own. A new password signs them out of the console." })] })] }))] }, m.id))) }))] }), _jsxs("section", { className: "card overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-line/60 flex flex-wrap items-baseline justify-between gap-2", children: [_jsx("h2", { className: "font-display font-bold text-ink", children: "Roles & permissions" }), _jsx("span", { className: "text-[11px] text-faint", children: "Click a box to switch a permission on or off. Changes apply at once. Admin always has everything." })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm min-w-[760px]", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-[11px] text-faint", children: [_jsx("th", { className: "text-left px-5 py-2 font-semibold w-[260px]", children: "Permission" }), cols.map(r => (_jsxs("th", { className: "px-2 py-2 font-semibold text-center align-bottom", children: [_jsx("span", { className: "block text-ink", children: r.name }), _jsx("span", { className: "block font-normal", children: r.locked ? 'locked' : `${r.members ?? 0} ${(r.members ?? 0) === 1 ? 'person' : 'people'}` })] }, r.key)))] }) }), _jsxs("tbody", { children: [groups.map(g => (_jsxs(Fragment, { children: [_jsx("tr", { children: _jsx("td", { colSpan: cols.length + 1, className: "px-5 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-faint", children: g }) }), d.perms.filter(p => p.group === g).map(p => (_jsxs("tr", { className: "border-t border-line/40", children: [_jsxs("td", { className: "px-5 py-2", children: [_jsx("span", { className: "block text-ink", children: p.label }), _jsx("span", { className: "block text-[11px] text-faint", children: p.help })] }), cols.map(r => {
                                                            const on = r.perms.includes(p.key);
                                                            const locked = !!r.locked || (p.key === 'team' && !d.isAdmin);
                                                            return (_jsx("td", { className: "px-2 py-2 text-center", children: _jsx("button", { type: "button", disabled: busy || locked, onClick: () => toggle(r, p.key), "aria-pressed": on, "aria-label": `${p.label} for ${r.name}`, className: `w-7 h-7 rounded-lg border grid place-items-center mx-auto transition-colors ${on ? 'bg-accent border-accent text-bg' : 'border-line text-transparent hover:border-faint'} ${locked ? 'opacity-60 cursor-not-allowed' : ''}`, children: _jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: _jsx("path", { d: "M5 12l5 5L20 7" }) }) }) }, r.key));
                                                        })] }, p.key)))] }, g))), _jsxs("tr", { className: "border-t border-line/60", children: [_jsx("td", { className: "px-5 py-3 text-[11px] text-faint", children: "Rename / delete" }), cols.map(r => (_jsx("td", { className: "px-2 py-3 text-center", children: !r.locked && (_jsxs("span", { className: "inline-flex flex-col gap-1", children: [_jsx("button", { type: "button", disabled: busy, onClick: () => { const n = window.prompt('New name for this role', r.name); if (n && n.trim() !== r.name)
                                                                    act(async () => { await axios.post(`${API_URL}/crm/team/roles/${r.key}`, { name: n }); }); }, className: "text-[11px] text-accent", children: "Rename" }), _jsx("button", { type: "button", disabled: busy, onClick: () => { if (window.confirm(`Delete the role "${r.name}"?`))
                                                                    act(async () => { await axios.delete(`${API_URL}/crm/team/roles/${r.key}`); return 'Role deleted.'; }); }, className: "text-[11px] text-muted hover:text-loss", children: "Delete" })] })) }, r.key)))] })] })] }) }), _jsxs("form", { onSubmit: e => { e.preventDefault(); act(async () => { await axios.post(`${API_URL}/crm/team/roles`, { name: newName, perms: [] }); setNewName(''); return 'Role created. Tick its permissions in the table.'; }); }, className: "flex flex-wrap gap-2 p-4 border-t border-line/60", children: [_jsx("input", { className: `${input} max-w-xs`, value: newName, onChange: e => setNewName(e.target.value), placeholder: "New role name (e.g. Finance)", maxLength: 40 }), _jsx("button", { type: "submit", disabled: busy || newName.trim().length < 2, className: "rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60", children: "Create role" })] })] })] }));
}
function Testers({ canInvite }) {
    const [d, setD] = useState(null);
    const [label, setLabel] = useState('');
    const [days, setDays] = useState('21');
    const [limit, setLimit] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(null);
    const load = () => axios.get(`${API_URL}/crm/testers`).then(r => { setD(r.data.data); setError(null); }).catch(e => setError(errorText(e)));
    useEffect(() => { load(); }, []);
    const linkOf = (code) => `${window.location.origin}/join/${code}`;
    const copy = async (code) => {
        try {
            await navigator.clipboard.writeText(linkOf(code));
            setCopied(code);
            setTimeout(() => setCopied(null), 1500);
        }
        catch { /* no clipboard */ }
    };
    const act = async (fn) => {
        setBusy(true);
        setError(null);
        try {
            await fn();
            await load();
        }
        catch (e) {
            setError(errorText(e));
        }
        finally {
            setBusy(false);
        }
    };
    if (!d)
        return _jsx("div", { className: "card p-6 text-sm text-faint", children: error || 'Loading…' });
    const active = d.testers.filter(t => t.active).length;
    const week = Date.now() - 7 * 86400000;
    const seenWeek = d.testers.filter(t => t.lastLoginAt && new Date(t.lastLoginAt).getTime() > week).length;
    const fb = d.testers.reduce((a, t) => a + t.feedback, 0);
    return (_jsxs("div", { className: "space-y-5", children: [_jsx("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3", children: [['Testers', d.testers.length], ['Pro still on', active], ['Seen in the last 7 days', seenWeek], ['Feedback messages', fb]].map(([k, v]) => (_jsxs("div", { className: "card px-4 py-3", children: [_jsx("div", { className: "num text-2xl font-extrabold text-ink", children: v }), _jsx("div", { className: "text-[11px] text-faint", children: k })] }, k))) }), _jsx(Err, { e: error }), _jsxs("section", { className: "card overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-line/60 flex flex-wrap items-baseline justify-between gap-2", children: [_jsx("h2", { className: "font-display font-bold text-ink", children: "Invite links" }), _jsx("span", { className: "text-[11px] text-faint", children: "Anyone with the link gets free Pro for the days you choose. Feedback arrives in the Support inbox as \"Tester feedback\"." })] }), canInvite && (_jsxs("form", { onSubmit: e => { e.preventDefault(); act(async () => { await axios.post(`${API_URL}/crm/testers/invite`, { label, days: Number(days), maxUses: limit ? Number(limit) : null }); setLabel(''); setLimit(''); }); }, className: "flex flex-wrap gap-2 p-4 border-b border-line/60", children: [_jsx("input", { className: `${input} flex-1 min-w-[180px]`, value: label, onChange: e => setLabel(e.target.value), placeholder: "Name for the link (e.g. Friends WhatsApp)" }), _jsxs("label", { className: "flex items-center gap-1.5 text-xs text-muted", children: ["Days ", _jsx("input", { className: `${input} w-20`, type: "number", min: 1, max: 90, value: days, onChange: e => setDays(e.target.value) })] }), _jsxs("label", { className: "flex items-center gap-1.5 text-xs text-muted", children: ["Max people ", _jsx("input", { className: `${input} w-24`, type: "number", min: 1, value: limit, onChange: e => setLimit(e.target.value), placeholder: "no limit" })] }), _jsx("button", { type: "submit", disabled: busy, className: "rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm disabled:opacity-60", children: "Create link" })] })), d.invites.length === 0 ? _jsx("p", { className: "p-5 text-sm text-faint", children: "No invite links yet." }) : (_jsx("ul", { className: "divide-y divide-line/50", children: d.invites.map(i => (_jsxs("li", { className: "flex flex-wrap items-center gap-3 px-5 py-3 text-sm", children: [_jsxs("span", { className: "flex-1 min-w-[220px]", children: [_jsxs("span", { className: "block text-ink font-semibold", children: [i.label || 'Invite link', " ", !i.open && _jsx("span", { className: "ml-1 text-[11px] text-loss", children: "closed" })] }), _jsx("span", { className: "block text-[11px] text-faint num select-all break-all", children: linkOf(i.code) })] }), _jsxs("span", { className: "text-xs text-muted num", children: [i.uses, i.maxUses ? ` / ${i.maxUses}` : '', " joined \u00B7 ", i.days, " days Pro"] }), _jsx("button", { type: "button", onClick: () => copy(i.code), className: "text-xs font-semibold text-accent", children: copied === i.code ? 'Copied ✓' : 'Copy link' }), canInvite && _jsx("button", { type: "button", disabled: busy, onClick: () => act(() => axios.post(`${API_URL}/crm/testers/invite/${i.code}`, { open: !i.open })), className: "text-xs text-muted hover:text-ink", children: i.open ? 'Close' : 'Reopen' })] }, i.code))) }))] }), _jsxs("section", { className: "card overflow-hidden", children: [_jsx("div", { className: "px-5 py-3 border-b border-line/60", children: _jsxs("h2", { className: "font-display font-bold text-ink", children: ["Testers (", d.testers.length, ")"] }) }), d.testers.length === 0 ? _jsx("p", { className: "p-5 text-sm text-faint", children: "Nobody has joined yet." }) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm min-w-[640px]", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-[11px] text-faint text-left", children: [_jsx("th", { className: "px-5 py-2 font-semibold", children: "Tester" }), _jsx("th", { className: "px-3 py-2 font-semibold", children: "Joined" }), _jsx("th", { className: "px-3 py-2 font-semibold", children: "Pro until" }), _jsx("th", { className: "px-3 py-2 font-semibold", children: "Last seen" }), _jsx("th", { className: "px-3 py-2 font-semibold text-right", children: "Feedback" })] }) }), _jsx("tbody", { className: "divide-y divide-line/50", children: d.testers.map(t => (_jsxs("tr", { children: [_jsxs("td", { className: "px-5 py-2", children: [_jsx("span", { className: "block text-ink truncate max-w-[260px]", children: t.name || t.email }), _jsxs("span", { className: "block text-[11px] text-faint truncate max-w-[260px]", children: [t.email, !t.verified && _jsx("span", { className: "text-draw", children: " \u00B7 email not confirmed" })] })] }), _jsx("td", { className: "px-3 py-2 text-muted num", children: fmtDay(t.joinedAt) }), _jsx("td", { className: `px-3 py-2 num ${t.active ? 'text-ink' : 'text-faint'}`, children: fmtDay(t.until) }), _jsx("td", { className: "px-3 py-2 text-muted num", children: fmtDay(t.lastLoginAt) }), _jsx("td", { className: "px-3 py-2 text-right num text-ink", children: t.feedback })] }, t.id))) })] }) }))] })] }));
}
const ACT_GROUPS = [
    { k: '', label: 'Everything' }, { k: 'inbox', label: 'Support inbox' }, { k: 'customer', label: 'Customers' },
    { k: 'campaign', label: 'Campaigns' }, { k: 'tester', label: 'Testers' }, { k: 'team', label: 'Team' }, { k: 'role', label: 'Roles' },
    { k: 'console', label: 'Console sign-ins' }, { k: 'backup', label: 'Backups' }, { k: 'users', label: 'Users export' }
];
const ACT_TONE = (a) => (/password|sign_out|reset|role_|team_|backup_download|users_export|customer_plan/.test(a) ? 'text-draw' : 'text-ink');
function Activity() {
    const [d, setD] = useState(null);
    const [staffId, setStaffId] = useState('');
    const [group, setGroup] = useState('');
    const [error, setError] = useState(null);
    useEffect(() => {
        axios.get(`${API_URL}/crm/activity`, { params: { staff: staffId || undefined, action: group || undefined } })
            .then(r => { setD(r.data.data); setError(null); }).catch(e => setError(errorText(e)));
    }, [staffId, group]);
    if (!d)
        return _jsx("div", { className: "card p-6 text-sm text-faint", children: error || 'Loading…' });
    const wk = (re) => d.week.filter(w => re.test(w.action)).reduce((a, w) => a + w.n, 0);
    return (_jsxs("div", { className: "space-y-5", children: [_jsx("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3", children: [['Replies sent', wk(/^inbox_reply$/)], ['Profiles opened', wk(/^customer_open$/)], ['Plan changes', wk(/^customer_plan$/)], ['Team / role changes', wk(/^(team_|role_)/)]].map(([k, v]) => (_jsxs("div", { className: "card px-4 py-3", children: [_jsx("div", { className: "num text-2xl font-extrabold text-ink", children: v }), _jsxs("div", { className: "text-[11px] text-faint", children: [k, " \u00B7 last 7 days"] })] }, k))) }), _jsxs("section", { className: "card overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3 border-b border-line/60 flex flex-wrap items-center gap-2", children: [_jsx("h2", { className: "font-display font-bold text-ink mr-auto", children: "Staff activity" }), _jsxs("select", { value: staffId, onChange: e => setStaffId(e.target.value), className: "rounded-lg border border-line bg-surface2/60 px-2 py-1.5 text-xs text-ink", children: [_jsx("option", { value: "", children: "All staff" }), d.staff.map(s => _jsxs("option", { value: s.id, children: [s.email, " (", s.n, ")"] }, s.id))] }), _jsx("select", { value: group, onChange: e => setGroup(e.target.value), className: "rounded-lg border border-line bg-surface2/60 px-2 py-1.5 text-xs text-ink", children: ACT_GROUPS.map(g => _jsx("option", { value: g.k, children: g.label }, g.k)) })] }), _jsx(Err, { e: error }), d.rows.length === 0 ? _jsx("p", { className: "p-5 text-sm text-faint", children: "Nothing recorded yet." }) : (_jsx("ul", { className: "divide-y divide-line/50 text-sm", children: d.rows.map(r => (_jsxs("li", { className: "px-5 py-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5", children: [_jsx("span", { className: "w-32 shrink-0 text-[11px] text-faint num", children: fmt(r.at) }), _jsx("span", { className: "w-48 shrink-0 truncate text-muted", title: r.role || '', children: r.staffEmail }), _jsx("span", { className: `font-semibold ${ACT_TONE(r.action)}`, children: r.label }), (r.targetEmail || r.target) && _jsx("span", { className: "text-muted truncate", children: [r.targetEmail, r.target && r.target !== r.targetEmail ? r.target : null].filter(Boolean).join(' · ') }), r.detail && _jsx("span", { className: "text-[11px] text-faint", children: r.detail })] }, r.id))) })), _jsx("p", { className: "px-5 py-3 text-[11px] text-faint border-t border-line/60", children: "Recorded automatically for every staff action, kept 1 year. Message texts and passwords are never stored here." })] })] }));
}
