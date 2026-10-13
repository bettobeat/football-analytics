import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../lib/socket';
import { errorText } from '../lib/auth';
const TIER_STYLE = {
    full: 'bg-accent/15 text-accent',
    good: 'bg-draw/15 text-draw',
    basic: 'bg-line/40 text-faint'
};
const STATUS_TEXT = { predicted: 'Predicted', added: 'Added', shown: 'On site, no model', new: '' };
export default function LeaguesCard({ sport = 'football' }) {
    const bb = sport === 'basketball';
    const ep = (x) => `${API_URL}/admin/${bb ? 'bb-' : ''}${x}`;
    const [d, setD] = useState(null);
    const [err, setErr] = useState(null);
    const [busy, setBusy] = useState(false);
    const [view, setView] = useState('recommended');
    const [q, setQ] = useState('');
    const [picked, setPicked] = useState(new Set());
    const [confirming, setConfirming] = useState(false);
    const [msg, setMsg] = useState(null);
    const [open, setOpen] = useState(false);
    const load = (refresh = false) => {
        setBusy(true);
        setErr(null);
        return axios.get(`${ep('league-coverage')}${refresh ? '?refresh=1' : ''}`)
            .then(r => setD(r.data.data))
            .catch(e => setErr(errorText(e)))
            .finally(() => setBusy(false));
    };
    useEffect(() => { if (open && !d)
        load(); }, [open]);
    const list = useMemo(() => {
        if (!d)
            return [];
        const s = q.trim().toLowerCase();
        return d.leagues.filter(l => {
            if (s && !`${l.country} ${l.name}`.toLowerCase().includes(s))
                return false;
            if (view === 'recommended')
                return l.recommended;
            if (view === 'full')
                return l.tier === 'full';
            if (view === 'good')
                return l.tier === 'good';
            return true;
        });
    }, [d, view, q]);
    const addable = (l) => (l.status === 'new' || l.status === 'shown') && l.tier !== 'basic' && l.history >= 1;
    const toggle = (id) => setPicked(p => { const n = new Set(p); if (n.has(id))
        n.delete(id);
    else
        n.add(id); return n; });
    const pickAllShown = () => setPicked(new Set(list.filter(addable).map(l => l.id)));
    const add = () => {
        setBusy(true);
        setMsg(null);
        axios.post(ep('extra-leagues'), { ids: [...picked] })
            .then(r => {
            const x = r.data.data;
            setMsg(`Added ${x.added.length} league${x.added.length === 1 ? '' : 's'}${x.skipped.length ? ` · skipped ${x.skipped.length}` : ''}. ${x.note}`);
            setPicked(new Set());
            setConfirming(false);
            return load();
        })
            .catch(e => setMsg(errorText(e)))
            .finally(() => setBusy(false));
    };
    const setTrial = (id, trial) => axios.post(ep(`extra-leagues/${id}/trial`), { trial }).then(() => load()).catch(e => setMsg(errorText(e)));
    const remove = (id) => axios.post(ep(`extra-leagues/${id}/remove`), {}).then(r => { setMsg(r.data.data.note); return load(); }).catch(e => setMsg(errorText(e)));
    const tile = (label, value, hint) => (_jsxs("div", { className: "rounded-xl border border-line/60 bg-surface2/40 px-3 py-2.5", children: [_jsx("div", { className: "text-[11px] uppercase tracking-wide text-faint", children: label }), _jsx("div", { className: "num text-xl font-bold text-ink", children: value ?? '–' }), hint && _jsx("div", { className: "text-[11px] text-faint", children: hint })] }));
    return (_jsxs("section", { className: "card p-5 sm:p-6 mb-8", children: [_jsxs("div", { className: "flex flex-wrap items-baseline justify-between gap-2", children: [_jsx("h2", { className: "font-display text-lg font-bold text-ink", children: bb ? 'Basketball leagues' : 'Football leagues' }), _jsx("button", { type: "button", onClick: () => setOpen(o => !o), className: "text-xs font-semibold text-accent", children: open ? 'Hide' : 'Open coverage & add leagues →' })] }), !open ? (_jsxs("p", { className: "mt-1 text-xs text-faint", children: ["Every ", bb ? 'basketball' : 'football', " league our data plan has, by how much information it gives, and the leagues added from here."] })) : (_jsxs("div", { className: "mt-4", children: [err && _jsx("p", { className: "text-sm text-loss mb-3", children: err }), !d ? _jsx("p", { className: "text-sm text-faint", children: busy ? 'Scanning API-Football (one request)…' : '' }) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4", children: [tile('Full information', d.totals.fullActive, bb ? 'playing now · team + player box scores' : 'playing now · lineups, stats, players'), tile('Ready to add', d.totals.recommended, bb ? 'full + 2 past seasons' : `full + 2 past seasons · ${d.totals.recommendedWithInjuries} with injuries`), tile('Predicted now', d.totals.predicted + d.totals.added, d.totals.added ? `${d.totals.added} added from here` : undefined), tile('All senior leagues', d.totals.leagues, `${d.totals.good} good · ${d.totals.basic} scores only`)] }), d.extra.length > 0 && (_jsxs("div", { className: "mb-5", children: [_jsx("h3", { className: "text-sm font-semibold text-ink mb-2", children: "Added from here" }), _jsx("ul", { className: "divide-y divide-line/50 text-sm rounded-xl border border-line/60", children: d.extra.map(x => (_jsxs("li", { className: `flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 ${x.enabled ? '' : 'opacity-50'}`, children: [_jsx("span", { className: "text-faint w-28 truncate", children: x.country }), _jsx("span", { className: "font-semibold text-ink", children: x.name }), _jsxs("span", { className: "text-[11px] text-faint num", children: [bb ? 'BB' : 'AF', x.id] }), !x.enabled && _jsxs("span", { className: "text-[11px] text-loss", children: ["removed", x.live ? ' · leaves after the next deploy' : ''] }), x.enabled && (_jsxs("span", { className: "ml-auto flex items-center gap-3", children: [_jsxs("label", { className: "flex items-center gap-1.5 text-xs text-muted cursor-pointer", children: [_jsx("input", { type: "checkbox", checked: x.trial, onChange: e => setTrial(x.id, e.target.checked) }), "In testing"] }), _jsx("button", { type: "button", onClick: () => remove(x.id), className: "text-xs text-loss hover:underline", children: "Remove" })] }))] }, x.id))) }), _jsx("p", { className: "mt-1 text-[11px] text-faint", children: "\"In testing\" = predictions are made and saved, but kept out of the public record and marked \"New league \u00B7 in testing\"." })] })), _jsxs("div", { className: "flex flex-wrap items-center gap-2 mb-3", children: [_jsx("nav", { className: "flex gap-1 rounded-full border border-line/60 bg-surface p-1", children: [['recommended', `Ready to add · ${d.totals.recommended}`], ['full', `Full · ${d.totals.full}`], ['good', `Good · ${d.totals.good}`], ['all', 'All']].map(([k, label]) => (_jsx("button", { type: "button", onClick: () => setView(k), className: `px-3 py-1 rounded-full text-xs font-semibold ${view === k ? 'bg-accent text-bg' : 'text-muted hover:text-ink'}`, children: label }, k))) }), _jsx("input", { value: q, onChange: e => setQ(e.target.value), placeholder: "Country or league", className: "flex-1 min-w-[10rem] rounded-full border border-line/60 bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-faint" }), _jsx("button", { type: "button", onClick: () => load(true), disabled: busy, className: "text-xs text-muted hover:text-ink underline disabled:opacity-50", children: "Scan again" })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-3 mb-2 text-xs", children: [_jsx("button", { type: "button", onClick: pickAllShown, className: "font-semibold text-accent hover:underline", children: "Select all in this list" }), picked.size > 0 && _jsxs("button", { type: "button", onClick: () => setPicked(new Set()), className: "text-muted hover:underline", children: ["Clear (", picked.size, ")"] }), _jsxs("span", { className: "text-faint", children: [list.length, " leagues \u00B7 scanned ", new Date(d.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })] })] }), _jsx("div", { className: "max-h-[28rem] overflow-y-auto rounded-xl border border-line/60", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "sticky top-0 bg-surface text-[11px] uppercase tracking-wide text-faint", children: _jsxs("tr", { children: [_jsx("th", { className: "w-8 px-2 py-2" }), _jsx("th", { className: "text-left px-2 py-2", children: "Country" }), _jsx("th", { className: "text-left px-2 py-2", children: "League" }), _jsx("th", { className: "px-2 py-2", children: "Data" }), !bb && _jsx("th", { className: "px-2 py-2", children: "Injuries" }), _jsx("th", { className: "px-2 py-2", children: "Past seasons" }), _jsx("th", { className: "px-2 py-2", children: "Season" }), _jsx("th", { className: "text-left px-2 py-2" })] }) }), _jsx("tbody", { className: "divide-y divide-line/40", children: list.map(l => (_jsxs("tr", { className: addable(l) ? 'cursor-pointer hover:bg-surface2/40' : 'opacity-70', onClick: () => addable(l) && toggle(l.id), children: [_jsx("td", { className: "px-2 py-1.5 text-center", children: addable(l) && _jsx("input", { type: "checkbox", checked: picked.has(l.id), onChange: () => toggle(l.id), onClick: e => e.stopPropagation(), "aria-label": `Add ${l.name}` }) }), _jsxs("td", { className: "px-2 py-1.5 whitespace-nowrap", children: [l.flag && _jsx("img", { src: l.flag, alt: "", className: "inline-block w-4 h-3 mr-1.5 align-[-1px] object-cover rounded-[2px]", loading: "lazy" }), _jsx("span", { className: "text-muted", children: l.country })] }), _jsx("td", { className: "px-2 py-1.5 text-ink", children: l.name }), _jsx("td", { className: "px-2 py-1.5 text-center", children: _jsx("span", { className: `rounded-full px-2 py-0.5 text-[11px] font-semibold ${TIER_STYLE[l.tier]}`, children: l.tier }) }), !bb && _jsx("td", { className: "px-2 py-1.5 text-center text-xs", children: l.injuries ? '✓' : _jsx("span", { className: "text-faint", children: "\u2013" }) }), _jsx("td", { className: "px-2 py-1.5 text-center num text-xs", children: l.history }), _jsx("td", { className: "px-2 py-1.5 text-center text-[11px] text-faint whitespace-nowrap", children: l.active ? `${l.start.slice(0, 7)} → ${l.end.slice(0, 7)}` : 'not playing' }), _jsx("td", { className: "px-2 py-1.5 text-[11px] text-faint whitespace-nowrap", children: STATUS_TEXT[l.status] })] }, l.id))) })] }) }), _jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-3", children: [!confirming ? (_jsxs("button", { type: "button", disabled: !picked.size || busy, onClick: () => setConfirming(true), className: "rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40", children: ["Add ", picked.size || '', " league", picked.size === 1 ? '' : 's'] })) : (_jsxs(_Fragment, { children: [_jsxs("span", { className: "text-sm text-ink", children: ["Add ", picked.size, " league", picked.size === 1 ? '' : 's', " to the site, in testing?"] }), _jsx("button", { type: "button", disabled: busy, onClick: add, className: "rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40", children: "Yes, add" }), _jsx("button", { type: "button", onClick: () => setConfirming(false), className: "text-sm text-muted hover:underline", children: "Cancel" })] })), msg && _jsx("span", { className: "text-xs text-muted", children: msg })] }), _jsx("p", { className: "mt-2 text-[11px] text-faint", children: bb
                                    ? 'Each league loads 5 seasons of games and box scores (a few hundred requests once, then a few a day). Predictions start after the next model build.'
                                    : 'Each league costs about 50–100 API requests a day (fixtures, live scores, lineups, stats). Adding many at once fills their history over the next hours; predictions start once 3 seasons of results are in.' })] }))] }))] }));
}
