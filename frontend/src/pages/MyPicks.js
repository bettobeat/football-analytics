import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../lib/socket';
import { useAuth } from '../lib/auth';
import { t as tt, LOCALE } from '../lib/i18n';
import { marketLabel, optionsFor, ResultBadge } from '../components/YourPicks';
const TYPES = [
    { key: 'fb:result', sport: 'fb', market: 'result' },
    { key: 'fb:ou25', sport: 'fb', market: 'ou25' },
    { key: 'fb:btts', sport: 'fb', market: 'btts' },
    { key: 'bb:win', sport: 'bb', market: 'win' },
    { key: 'bb:total', sport: 'bb', market: 'total' }
];
const pct = (s) => (s.settled ? Math.round((s.hits / s.settled) * 1000) / 10 : null);
export default function MyPicks() {
    const { user, loading } = useAuth();
    const [d, setD] = useState(null);
    const [err, setErr] = useState(false);
    const [sport, setSport] = useState('all');
    useEffect(() => {
        if (!user)
            return;
        axios.get(`${API_URL}/picks/record`).then(r => setD(r.data.data)).catch(() => setErr(true));
    }, [user]);
    const list = useMemo(() => (d ? d.list.filter(r => sport === 'all' || r.sport === sport) : []), [d, sport]);
    if (loading)
        return null;
    if (!user)
        return (_jsxs("div", { className: "max-w-xl mx-auto px-4 py-16 text-center space-y-4", children: [_jsx("h1", { className: "font-display text-2xl font-bold text-ink", children: tt('My picks') }), _jsx("p", { className: "text-muted", children: tt('Pick the winner, goals and more yourself, and build your own record against the results.') }), _jsx(Link, { to: "/login?next=%2Fmy-picks", className: "inline-block px-5 py-2.5 rounded-xl bg-accent text-bg font-semibold", children: tt('Sign in to pick') })] }));
    const day = (iso) => new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
    const total = d?.total;
    const overall = total ? pct(total) : null;
    const types = TYPES.filter(x => x.sport === 'fb' || d?.basketball).filter(x => sport === 'all' || x.sport === sport);
    return (_jsxs("div", { className: "max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6", children: [_jsxs("div", { className: "flex flex-wrap items-end justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h1", { className: "font-display text-2xl sm:text-3xl font-bold text-ink", children: tt('My picks') }), _jsx("p", { className: "text-sm text-muted mt-1", children: tt('Your own picks and how they turned out. Picks lock at kick-off.') })] }), d?.basketball && (_jsx("div", { className: "inline-flex p-1 rounded-full bg-surface2 border border-line/60", role: "tablist", children: ['all', 'fb', 'bb'].map(s => (_jsx("button", { type: "button", role: "tab", "aria-selected": sport === s, onClick: () => setSport(s), className: `px-3 py-1.5 rounded-full text-xs font-semibold ${sport === s ? 'bg-accent text-bg' : 'text-muted hover:text-ink'}`, children: s === 'all' ? tt('All') : s === 'fb' ? tt('Football') : tt('Basketball') }, s))) }))] }), err && _jsx("p", { className: "text-sm text-loss", children: tt('Something went wrong. Try again.') }), !d && !err && _jsx("div", { className: "card h-40 animate-pulse" }), d && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3", children: [_jsxs("div", { className: "card p-4", children: [_jsx("div", { className: "text-xs text-muted", children: tt('Right') }), _jsx("div", { className: `font-display text-2xl font-bold ${overall !== null && overall >= 50 ? 'text-win' : 'text-ink'}`, children: overall !== null ? `${overall}%` : '–' }), _jsx("div", { className: "text-[11px] text-faint", children: tt('{0} of {1} settled', { 0: total.hits, 1: total.settled }) })] }), _jsxs("div", { className: "card p-4", children: [_jsx("div", { className: "text-xs text-muted", children: tt('Picks made') }), _jsx("div", { className: "font-display text-2xl font-bold text-ink", children: total.picks })] }), _jsxs("div", { className: "card p-4", children: [_jsx("div", { className: "text-xs text-muted", children: tt('Waiting for the result') }), _jsx("div", { className: "font-display text-2xl font-bold text-ink", children: total.pending })] }), _jsxs("div", { className: "card p-4", children: [_jsx("div", { className: "text-xs text-muted", children: tt('Current streak') }), _jsx("div", { className: "font-display text-2xl font-bold text-accent", children: d.streak }), _jsx("div", { className: "text-[11px] text-faint", children: tt('right in a row') })] })] }), _jsxs("section", { className: "card p-5 sm:p-6", children: [_jsx("h2", { className: "font-display text-base font-bold text-ink mb-4", children: tt('By pick type') }), _jsx("div", { className: "divide-y divide-line/50", children: types.map(x => {
                                    const s = d.stats[x.key];
                                    const p = s ? pct(s) : null;
                                    return (_jsxs("div", { className: "py-3 flex items-center gap-3", children: [_jsx("span", { className: "text-[10px] font-bold uppercase tracking-wide text-faint w-16 shrink-0", children: x.sport === 'fb' ? tt('Football') : tt('Basketball') }), _jsx("span", { className: "text-sm font-semibold text-ink flex-1 min-w-0 truncate", children: marketLabel(x.market) }), _jsx("div", { className: "hidden sm:block w-40 h-2 rounded-full bg-surface2 overflow-hidden", children: _jsx("div", { className: "h-full bg-accent", style: { width: `${p ?? 0}%` } }) }), _jsx("span", { className: "text-sm font-bold text-ink num w-14 text-right", children: p !== null ? `${p}%` : '–' }), _jsx("span", { className: "text-[11px] text-faint num w-20 text-right", children: s ? `${s.hits}/${s.settled}` : '0/0' })] }, x.key));
                                }) })] }), _jsxs("section", { className: "card p-5 sm:p-6", children: [_jsx("h2", { className: "font-display text-base font-bold text-ink mb-4", children: tt('All my picks') }), list.length === 0 ? (_jsxs("div", { className: "text-sm text-faint space-y-2", children: [_jsx("p", { children: tt('No picks yet. Open any game and pick under "Your picks".') }), _jsxs(Link, { to: "/matches", className: "inline-block text-accent font-semibold hover:underline", children: [tt('See the matches'), " \u2192"] })] })) : (_jsx("ul", { className: "divide-y divide-line/50", children: list.map(r => {
                                    const opt = optionsFor(r.market, r.home || tt('Home'), r.away || tt('Away'), r.line).find(o => o.k === r.pick);
                                    return (_jsxs("li", { className: "py-3 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1", children: [_jsx("span", { className: "text-[11px] text-faint num w-14 shrink-0", children: day(r.kickoff) }), _jsxs(Link, { to: r.sport === 'fb' ? `/match/${r.gameId}` : `/basketball/game/${r.gameId}`, className: "flex-1 min-w-0 text-sm text-ink hover:text-accent truncate", children: [_jsxs("span", { className: "font-semibold", children: [r.home || '?', " \u2013 ", r.away || '?'] }), r.league && _jsxs("span", { className: "text-faint text-xs", children: [" \u00B7 ", r.league] })] }), _jsxs("span", { className: "text-xs text-muted shrink-0", children: [marketLabel(r.market), ": ", _jsx("b", { className: "text-ink", children: opt?.label || r.pick })] }), _jsx("span", { className: "shrink-0", children: _jsx(ResultBadge, { r: r.result }) })] }, `${r.sport}-${r.gameId}-${r.market}`));
                                }) }))] }), _jsx("p", { className: "text-[11px] text-faint", children: tt('Your picks are private and only for you. Cancelled games are void and not counted.') })] }))] }));
}
