import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../lib/socket';
import { errorText } from '../lib/auth';
const DOT = { ok: 'bg-win', warn: 'bg-draw', fail: 'bg-loss' };
const WORD = { ok: 'OK', warn: 'Check', fail: 'Problem' };
/** Admin: is every data feed current, and does the data add up? Refreshes every minute while open. */
export default function DataHealth() {
    const [r, setR] = useState(null);
    const [error, setError] = useState(null);
    const [open, setOpen] = useState(null);
    const [running, setRunning] = useState(null);
    const runPlayers = () => axios
        .get(`${API_URL}/data-audit/run`, { params: { bg: 1, email: 0 } })
        .then(() => setRunning('Player check started: it takes a few minutes. Press "Check now" later to see the result.'))
        .catch(e => setRunning(errorText(e)));
    const load = () => axios
        .get(`${API_URL}/data-health`)
        .then(x => { setR(x.data.data); setError(null); })
        .catch(e => setError(errorText(e)));
    useEffect(() => {
        load();
        const t = setInterval(load, 60 * 1000);
        return () => clearInterval(t);
    }, []);
    return (_jsxs("section", { className: "card p-5 sm:p-6 mb-6", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 mb-4", children: [_jsxs("div", { className: "flex items-center gap-2.5", children: [_jsx("h2", { className: "font-display text-lg font-bold text-ink", children: "Data health" }), r && (_jsxs("span", { className: `inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-surface2 text-ink`, children: [_jsx("span", { className: `w-2 h-2 rounded-full ${DOT[r.level]}`, "aria-hidden": true }), r.level === 'ok' ? 'All good' : r.level === 'warn' ? 'Needs a look' : 'Problem'] }))] }), _jsxs("div", { className: "flex items-center gap-3 text-xs text-faint", children: [r && _jsxs("span", { children: ["Checked ", new Date(r.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })] }), _jsx("button", { onClick: runPlayers, className: "font-bold text-muted hover:text-ink", children: "Run player check" }), _jsx("button", { onClick: load, className: "font-bold text-accent", children: "Check now" })] })] }), error && _jsx("p", { className: "text-sm text-loss", children: error }), running && _jsx("p", { className: "text-xs text-muted mb-3", children: running }), !r && !error && _jsx("p", { className: "text-sm text-faint", children: "Checking\u2026" }), r && (_jsx("ul", { className: "divide-y divide-line/50", children: r.checks.map(c => (_jsxs("li", { className: "py-2.5", children: [_jsxs("button", { type: "button", onClick: () => setOpen(open === c.id ? null : c.id), disabled: !c.items?.length, className: "w-full flex items-start gap-3 text-left", children: [_jsx("span", { className: `mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${DOT[c.level]}`, "aria-hidden": true }), _jsxs("span", { className: "flex-1 min-w-0", children: [_jsxs("span", { className: "block text-sm font-semibold text-ink", children: [c.label, " ", _jsx("span", { className: "text-[11px] font-bold text-faint ml-1", children: WORD[c.level] })] }), _jsx("span", { className: "block text-xs text-muted", children: c.detail })] }), !!c.items?.length && _jsx("span", { className: "text-[11px] text-accent font-bold whitespace-nowrap", children: open === c.id ? 'Hide' : `${c.items.length} item${c.items.length === 1 ? '' : 's'}` })] }), open === c.id && c.items && (_jsx("ul", { className: "mt-2 ml-5 space-y-1 text-xs text-muted list-disc pl-4", children: c.items.map((it, i) => _jsx("li", { children: it }, i)) }))] }, c.id))) }))] }));
}
