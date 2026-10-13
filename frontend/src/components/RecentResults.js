import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../lib/socket';
import { t as tt, LOCALE } from '../lib/i18n';
const PICK_COLOR = { H: 'text-home', D: 'text-draw', A: 'text-away' };
export default function RecentResults({ code, limit, days = 14, compact, large, listClass = '' }) {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState(false);
    useEffect(() => {
        let cancelled = false;
        const load = () => axios
            .get(`${API_URL}/public/results`, { params: { days, limit, ...(code ? { competition: code } : {}) } })
            .then(r => !cancelled && (setRows(r.data.data?.rows || []), setError(false)))
            .catch(() => !cancelled && setError(true));
        load();
        const t = setInterval(load, 5 * 60 * 1000);
        return () => {
            cancelled = true;
            clearInterval(t);
        };
    }, [code, limit, days]);
    const hits = rows?.filter(r => r.hit).length || 0;
    return (_jsxs("div", { children: [_jsxs("div", { className: `flex items-baseline justify-between gap-2 ${large ? 'px-3 pt-3 pb-3' : 'px-1 pb-2'}`, children: [_jsx("h2", { className: `font-display font-bold text-ink ${large ? 'text-lg' : ''}`, children: tt("Latest results") }), rows && rows.length > 0 && (_jsxs("span", { className: "text-[11px] text-faint", children: [_jsx("span", { className: "num font-semibold text-ink", children: hits }), "/", _jsx("span", { className: "num", children: rows.length }), " ", tt("picks right")] }))] }), error && _jsx("p", { className: "px-1 text-xs text-faint", children: tt("Couldn't load results.") }), !rows && !error && (_jsx("div", { className: "space-y-2", children: Array.from({ length: compact ? 3 : 6 }).map((_, i) => (_jsx("div", { className: "h-14 rounded-xl bg-surface2/60 animate-pulse" }, i))) })), rows && rows.length === 0 && _jsx("p", { className: "px-1 text-xs text-faint", children: tt("No finished games in the last {0} days.", { 0: days }) }), _jsx("ul", { className: `space-y-1 ${listClass}`, children: rows?.map(r => (_jsx("li", { children: _jsx(ResultRow, { r: r, compact: compact }) }, r.matchId))) }), rows && rows.length > 0 && (_jsx(Link, { to: "/accuracy", className: "block px-1 pt-2 text-[11px] font-semibold text-muted hover:text-ink", children: tt("How accurate is the model? →") }))] }));
}
function ResultRow({ r, compact }) {
    const [hg, ag] = r.score.split(/[–-]/).map(x => x.trim());
    const pickName = r.pick === 'H' ? r.home : r.pick === 'A' ? r.away : 'Draw';
    const when = new Date(r.date).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
    const side = (name, crest, goals, won) => (_jsxs("div", { className: "flex items-center justify-between gap-2 py-0.5", children: [_jsxs("span", { className: "flex items-center gap-2 min-w-0", children: [_jsx(SmallCrest, { src: crest, name: name }), _jsx("span", { className: `text-sm truncate ${won ? 'font-semibold text-ink' : 'text-muted'}`, children: name })] }), _jsx("span", { className: `num text-sm ${won ? 'font-bold text-ink' : 'text-muted'}`, children: goals })] }));
    return (_jsxs(Link, { to: `/match/${r.matchId}`, className: "block rounded-xl px-2 py-2 hover:bg-surface2 transition-colors", children: [_jsxs("div", { className: "flex items-center justify-between gap-2 text-[10px] text-faint mb-1", children: [_jsx("span", { className: "truncate", children: r.competition }), _jsx("span", { className: "flex-shrink-0", children: when })] }), side(r.home, r.homeCrest, hg, r.outcome === 'H'), side(r.away, r.awayCrest, ag, r.outcome === 'A'), _jsx("div", { className: "mt-1 flex items-center justify-between gap-2 text-[11px]", children: _jsxs("span", { className: "text-faint truncate", children: [tt("Pick"), ' ', _jsx("span", { className: `font-semibold ${PICK_COLOR[r.pick]}`, children: pickName }), !compact && r.p && _jsxs("span", { className: "num", children: [" ", Math.round(r.p[r.pick]), "%"] })] }) })] }));
}
/** A badge from a URL; falls back to .svg (some football-data.org crests), then to initials. */
function SmallCrest({ src, name }) {
    const [url, setUrl] = useState(src || '');
    const [failed, setFailed] = useState(!src);
    useEffect(() => {
        setUrl(src || '');
        setFailed(!src);
    }, [src]);
    if (failed)
        return (_jsx("span", { className: "w-[18px] h-[18px] rounded-full bg-surface2 flex-shrink-0 grid place-items-center text-[8px] font-bold text-faint", children: name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() }));
    return (_jsx("img", { src: url, alt: "", width: 18, height: 18, loading: "lazy", className: "w-[18px] h-[18px] object-contain flex-shrink-0", onError: () => (url.endsWith('.png') && url.includes('football-data.org') ? setUrl(url.replace(/\.png$/, '.svg')) : setFailed(true)) }));
}
