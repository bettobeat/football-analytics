import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../lib/socket';
const flagOf = (cc) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map(c => 0x1f1e6 + c.charCodeAt(0) - 65)) : '🌐');
let regionNames = null;
try {
    regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
}
catch { /* old browser */ }
const nameOf = (cc) => (cc === '??' ? 'Unknown' : (() => { try {
    return regionNames?.of(cc) || cc;
}
catch {
    return cc;
} })());
/** Visitors by country (from the IP at the moment of the visit; only the country is kept). */
function Countries({ c }) {
    const [range, setRange] = useState('last30');
    const [all, setAll] = useState(false);
    const rows = c[range];
    const total = rows.reduce((a, r) => a + r.visitors, 0);
    const shown = all ? rows : rows.slice(0, 10);
    const max = Math.max(1, ...rows.map(r => r.visitors));
    return (_jsxs("div", { className: "mt-6 pt-5 border-t border-line/60", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 mb-3", children: [_jsx("h3", { className: "font-display font-bold text-ink", children: "Visitors by country" }), _jsxs("div", { className: "seg", children: [_jsx("button", { type: "button", onClick: () => setRange('last7'), className: `seg-btn ${range === 'last7' ? 'seg-btn-active' : ''}`, children: "7 days" }), _jsx("button", { type: "button", onClick: () => setRange('last30'), className: `seg-btn ${range === 'last30' ? 'seg-btn-active' : ''}`, children: "30 days" })] })] }), !c.geo.loaded && _jsxs("p", { className: "text-xs text-draw mb-2", children: ["Country data not loaded yet (", c.geo.status, "). It downloads by itself a minute after the server starts."] }), rows.length === 0 ? _jsx("p", { className: "text-sm text-faint", children: "No visits yet." }) : (_jsx("ul", { className: "space-y-1.5", children: shown.map(r => (_jsxs("li", { className: "flex items-center gap-3 text-sm", children: [_jsx("span", { className: "w-6 text-center text-base leading-none", "aria-hidden": true, children: flagOf(r.country) }), _jsx("span", { className: "w-40 truncate text-ink", children: nameOf(r.country) }), _jsx("span", { className: "flex-1 h-2 rounded-full bg-surface2 overflow-hidden", children: _jsx("span", { className: "block h-full rounded-full bg-accent/70", style: { width: `${(r.visitors / max) * 100}%` } }) }), _jsx("span", { className: "w-10 text-right num text-ink", children: r.visitors }), _jsxs("span", { className: "w-12 text-right num text-[11px] text-faint", children: [total ? Math.round((r.visitors / total) * 100) : 0, "%"] })] }, r.country))) })), rows.length > 10 && _jsx("button", { type: "button", onClick: () => setAll(v => !v), className: "mt-2 text-xs font-semibold text-accent", children: all ? 'Show top 10' : `Show all ${rows.length} countries` }), _jsxs("p", { className: "mt-3 text-[10px] text-faint", children: ["Only the country is kept, never the IP", c.since ? ` · countries since ${new Date(c.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : '', " \u00B7 \"Unknown\" = visits before countries were counted or unlisted addresses \u00B7 IP data by ", _jsx("a", { href: "https://db-ip.com", target: "_blank", rel: "noreferrer", className: "underline", children: "DB-IP" }), " (CC BY 4.0)"] })] }));
}
/** Admin: people on the site now, and unique visitors (one per IP) today / 7 / 30 days, with a 30-day bar chart. */
export default function VisitorsCard() {
    const [v, setV] = useState(null);
    const [err, setErr] = useState(false);
    useEffect(() => {
        let off = false;
        const load = () => axios.get(`${API_URL}/admin/visitors`).then(r => { if (!off) {
            setV(r.data.data);
            setErr(false);
        } }).catch(() => !off && setErr(true));
        load();
        const iv = setInterval(load, 30000);
        return () => { off = true; clearInterval(iv); };
    }, []);
    if (err && !v)
        return null;
    // the last 30 days, missing days as 0
    const days = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        const r = v?.daily.find(x => x.day === d);
        days.push({ day: d, visitors: r?.visitors || 0, signedIn: r?.signedIn || 0 });
    }
    const max = Math.max(1, ...days.map(d => d.visitors));
    const tile = (label, value, sub, live = false) => (_jsxs("div", { className: `rounded-xl border px-4 py-3 ${live ? 'border-live/40 bg-live/[0.07]' : 'border-line/60 bg-surface2/50'}`, children: [_jsxs("div", { className: "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-faint", children: [live && _jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-live animate-pulseDot" }), label] }), _jsx("div", { className: `num text-2xl font-extrabold leading-none mt-1.5 ${live ? 'text-live' : 'text-ink'}`, children: value ?? '–' }), sub && _jsx("div", { className: "text-[11px] text-faint mt-1", children: sub })] }));
    return (_jsxs("section", { className: "card p-5 sm:p-6 mb-8", children: [_jsxs("div", { className: "flex flex-wrap items-baseline justify-between gap-2 mb-4", children: [_jsx("h2", { className: "font-display text-lg font-bold text-ink", children: "Visitors" }), _jsxs("span", { className: "text-xs text-faint", children: ["one visitor = one IP address \u00B7 admins and bots not counted", v?.countingSince ? ` · counting since ${new Date(v.countingSince).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''] })] }), _jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3", children: [tile('Online now', v?.onlineNow, v ? `${v.onlineSignedIn} signed in · last ${v.onlineWindowMin} min` : undefined, true), tile('Today', v?.today), tile('Last 7 days', v?.last7), tile('Last 30 days', v?.last30, v ? `${v.returning30} came back on another day` : undefined)] }), _jsxs("div", { className: "mt-5", children: [_jsx("div", { className: "flex items-end gap-[3px] h-28", children: days.map(d => (_jsx("div", { className: "group relative flex-1 h-full flex flex-col justify-end", title: `${d.day}: ${d.visitors} visitors, ${d.signedIn} signed in`, children: _jsx("div", { className: "w-full rounded-t-[3px] bg-accent/70 group-hover:bg-accent transition-colors flex flex-col justify-end overflow-hidden", style: { height: `${(d.visitors / max) * 100}%`, minHeight: d.visitors ? 2 : 0 }, children: _jsx("div", { className: "w-full bg-home/80", style: { height: d.visitors ? `${(d.signedIn / d.visitors) * 100}%` : 0 } }) }) }, d.day))) }), _jsxs("div", { className: "flex justify-between text-[10px] text-faint mt-1.5 num", children: [_jsx("span", { children: new Date(days[0].day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }), _jsxs("span", { className: "flex items-center gap-3", children: [_jsxs("span", { className: "flex items-center gap-1", children: [_jsx("span", { className: "w-2 h-2 rounded-sm bg-accent/70" }), "visitors per day"] }), _jsxs("span", { className: "flex items-center gap-1", children: [_jsx("span", { className: "w-2 h-2 rounded-sm bg-home/80" }), "signed in"] })] }), _jsx("span", { children: "Today" })] })] }), v?.countries && _jsx(Countries, { c: v.countries })] }));
}
