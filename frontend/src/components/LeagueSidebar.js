import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { t, LOCALE } from '../lib/i18n';
import { FavStar } from '../lib/favorites';
const INTL = new Set(['eu', 'world', 'int']);
const SPECIAL = { 'gb-eng': 'England', 'gb-sct': 'Scotland', 'gb-wls': 'Wales', 'gb-nir': 'Northern Ireland', eu: 'Europe', world: 'World', int: 'International' };
let regionNames = null;
/** Country name in the visitor's language. */
export function countryName(code) {
    if (SPECIAL[code])
        return t(SPECIAL[code]);
    try {
        regionNames || (regionNames = new Intl.DisplayNames([LOCALE], { type: 'region' }));
        return regionNames.of(code.toUpperCase()) || code.toUpperCase();
    }
    catch {
        return code.toUpperCase();
    }
}
export function Flag({ code, size = 18 }) {
    if (INTL.has(code)) {
        return (_jsx("span", { className: "grid place-items-center rounded-[3px] bg-accent/15 text-accent shrink-0", style: { width: size, height: Math.round(size * 0.72) }, "aria-hidden": true, children: _jsxs("svg", { viewBox: "0 0 24 24", width: size * 0.6, height: size * 0.6, fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("circle", { cx: "12", cy: "12", r: "9" }), _jsx("path", { d: "M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" })] }) }));
    }
    return _jsx("img", { src: `https://media.api-sports.io/flags/${code}.svg`, alt: "", loading: "lazy", className: "object-cover rounded-[3px] shrink-0 shadow-sm", style: { width: size, height: Math.round(size * 0.72) } });
}
const STORE = 'sl-side-countries';
function readOpen() {
    try {
        return new Set(JSON.parse(localStorage.getItem(STORE) || '[]'));
    }
    catch {
        return new Set();
    }
}
export default function LeagueSidebar({ leagues, selected, onSelect, pinned, teams, total, favCount, addTeamTo, sportLabel }) {
    const [open, setOpen] = useState(readOpen);
    const toggle = (c) => setOpen(prev => {
        const next = new Set(prev);
        if (next.has(c))
            next.delete(c);
        else
            next.add(c);
        try {
            localStorage.setItem(STORE, JSON.stringify([...next]));
        }
        catch { /* storage unavailable */ }
        return next;
    });
    const byCode = new Map(leagues.map(l => [l.code, l]));
    const pins = pinned.map(c => byCode.get(c)).filter(Boolean);
    // a pinned league shows only once, at the top (not again under International / its country)
    const pinnedSet = new Set(pins.map(l => l.code));
    const rest = leagues.filter(l => !pinnedSet.has(l.code));
    const intl = rest.filter(l => INTL.has(l.country));
    const countries = new Map();
    for (const l of rest)
        if (!INTL.has(l.country)) {
            if (!countries.has(l.country))
                countries.set(l.country, []);
            countries.get(l.country).push(l);
        }
    const countryList = [...countries.entries()].sort((a, b) => countryName(a[0]).localeCompare(countryName(b[0]), LOCALE));
    const Row = ({ l, indent }) => (_jsxs("li", { className: "relative", children: [_jsxs("button", { onClick: () => onSelect(l.code), className: `side-item pr-9 ${indent ? 'pl-7' : ''} ${selected === l.code ? 'side-item-active' : ''}`, children: [l.logo ? _jsx("img", { src: l.logo, alt: "", className: "w-5 h-5 object-contain shrink-0" }) : _jsx(Flag, { code: l.country }), _jsx("span", { className: "truncate", children: indent ? l.short || l.name : l.name }), l.note && _jsx("span", { className: "shrink-0 text-[9px] font-bold uppercase text-faint", children: l.note }), _jsx("span", { className: "ml-auto num text-xs text-faint", children: l.count || '' })] }), _jsx("span", { className: "absolute right-1.5 top-1/2 -translate-y-1/2", children: _jsx(FavStar, { size: "sm", fav: l.fav }) })] }));
    const Head = ({ icon, children }) => (_jsxs("div", { className: "flex items-center gap-2 px-2.5 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-faint", children: [icon, children] }));
    return (_jsxs("section", { className: "card p-2 lg:flex-1 lg:min-h-[180px] lg:overflow-y-auto overscroll-contain", children: [sportLabel, _jsxs("ul", { className: "space-y-0.5", children: [_jsx("li", { children: _jsxs("button", { onClick: () => onSelect('ALL'), className: `side-item ${selected === 'ALL' ? 'side-item-active' : ''}`, children: [_jsx("span", { className: "w-5 h-5 rounded-md bg-surface2 grid place-items-center text-[10px] font-bold text-muted", children: "\u221E" }), t('All leagues'), _jsx("span", { className: "ml-auto num text-xs text-faint", children: total })] }) }), _jsx("li", { children: _jsxs("button", { onClick: () => onSelect('FAV'), className: `side-item ${selected === 'FAV' ? 'side-item-active' : ''}`, children: [_jsx("span", { className: "w-5 h-5 rounded-md bg-accent/15 grid place-items-center text-accent", children: _jsx("svg", { viewBox: "0 0 24 24", className: "w-3.5 h-3.5", fill: "currentColor", "aria-hidden": true, children: _jsx("path", { d: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" }) }) }), t('My favorites'), _jsx("span", { className: "ml-auto num text-xs text-faint", children: favCount ?? '' })] }) })] }), _jsx(Head, { icon: _jsx("svg", { viewBox: "0 0 24 24", className: "w-3 h-3", fill: "currentColor", "aria-hidden": true, children: _jsx("path", { d: "M15 3l6 6-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z" }) }), children: t('Pinned leagues') }), _jsx("ul", { className: "space-y-0.5", children: pins.map(l => _jsx(Row, { l: l }, `p${l.code}`)) }), _jsx(Head, { icon: _jsx("svg", { viewBox: "0 0 24 24", className: "w-3 h-3", fill: "currentColor", "aria-hidden": true, children: _jsx("path", { d: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" }) }), children: t('My teams') }), _jsxs("ul", { className: "space-y-0.5", children: [teams.map(tm => (_jsx("li", { children: _jsxs(Link, { to: tm.to, className: "side-item", children: [tm.logo ? _jsx("img", { src: tm.logo, alt: "", className: "w-5 h-5 object-contain shrink-0" }) : _jsx("span", { className: "w-5 h-5 rounded-full bg-surface2 shrink-0" }), _jsx("span", { className: "truncate", children: tm.name })] }) }, tm.key))), _jsx("li", { children: _jsxs(Link, { to: addTeamTo, className: "side-item text-accent font-bold hover:text-accent", children: [_jsx("span", { className: "w-5 h-5 grid place-items-center text-lg leading-none", children: "+" }), t('Add a team')] }) })] }), intl.length > 0 && _jsxs(_Fragment, { children: [_jsx(Head, { icon: null, children: t('International') }), _jsx("ul", { className: "space-y-0.5", children: intl.map(l => _jsx(Row, { l: l }, `i${l.code}`)) })] }), countryList.length > 0 && _jsx(Head, { icon: null, children: t('Countries') }), _jsx("ul", { className: "space-y-0.5 pb-1", children: countryList.map(([c, list]) => {
                    const isOpen = open.has(c) || list.some(l => l.code === selected);
                    const n = list.reduce((s, l) => s + l.count, 0);
                    return (_jsxs("li", { children: [_jsxs("button", { onClick: () => toggle(c), className: "side-item", "aria-expanded": isOpen, children: [_jsx(Flag, { code: c }), _jsx("span", { className: "truncate", children: countryName(c) }), _jsx("span", { className: "ml-auto num text-xs text-faint", children: n || '' }), _jsx("span", { className: `text-faint transition-transform ${isOpen ? 'rotate-90' : ''}`, children: "\u203A" })] }), isOpen && _jsx("ul", { className: "space-y-0.5", children: list.map(l => _jsx(Row, { l: l, indent: true }, l.code)) })] }, c));
                }) })] }));
}
/**
 * Phones and small tablets (below lg): the games come first. A live strip (when games are on), a row of chips
 * (all, favorites, pinned leagues) and a "Leagues" button that opens the full menu as a bottom sheet.
 */
export function MobileLeagueBar({ side, live, liveCount }) {
    const [sheet, setSheet] = useState(false);
    const byCode = new Map(side.leagues.map(l => [l.code, l]));
    const pins = side.pinned.map(c => byCode.get(c)).filter(Boolean);
    const current = side.selected !== 'ALL' && side.selected !== 'FAV' && !side.pinned.includes(side.selected) ? byCode.get(side.selected) : null;
    const chip = (active) => `shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-semibold border transition-colors ${active ? 'bg-accent text-bg border-accent' : 'bg-surface2/70 text-ink border-line/70 hover:border-accent/50'}`;
    const pick = (c) => { side.onSelect(c); setSheet(false); };
    return (_jsxs("div", { className: "lg:hidden -mx-4 sm:-mx-6 mb-5", children: [!!liveCount && live && live.length > 0 && (_jsxs("div", { className: "mb-3", children: [_jsxs("div", { className: "flex items-center gap-2 px-4 sm:px-6 mb-2", children: [_jsx("span", { className: "w-2 h-2 rounded-full bg-live animate-pulseDot" }), _jsx("span", { className: "font-display font-bold text-ink", children: t('Live') }), _jsx("span", { className: "num text-xs text-faint", children: liveCount })] }), _jsx("div", { className: "flex gap-2 overflow-x-auto no-scrollbar px-4 sm:px-6 pb-1", children: live.map((n, i) => _jsx("div", { className: "shrink-0 w-56 card p-1.5", children: n }, i)) })] })), _jsxs("div", { className: "flex gap-2 overflow-x-auto no-scrollbar px-4 sm:px-6 pb-1", children: [_jsxs("button", { type: "button", onClick: () => setSheet(true), className: chip(false) + ' !border-accent/50', "aria-haspopup": "dialog", children: [_jsx("svg", { viewBox: "0 0 24 24", className: "w-4 h-4", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", "aria-hidden": true, children: _jsx("path", { d: "M4 6h16M4 12h16M4 18h10" }) }), t('Leagues')] }), _jsxs("button", { type: "button", onClick: () => pick('ALL'), className: chip(side.selected === 'ALL'), children: [t('All'), _jsx("span", { className: "num text-[11px] opacity-70", children: side.total || '' })] }), _jsxs("button", { type: "button", onClick: () => pick('FAV'), className: chip(side.selected === 'FAV'), children: [_jsx("svg", { viewBox: "0 0 24 24", className: "w-3.5 h-3.5", fill: "currentColor", "aria-hidden": true, children: _jsx("path", { d: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" }) }), t('Favorites')] }), current && (_jsxs("button", { type: "button", onClick: () => pick(current.code), className: chip(true), children: [current.logo ? _jsx("img", { src: current.logo, alt: "", className: "w-4 h-4 object-contain" }) : _jsx(Flag, { code: current.country, size: 16 }), current.short || current.name] })), pins.map(l => (_jsxs("button", { type: "button", onClick: () => pick(l.code), className: chip(side.selected === l.code), children: [l.logo ? _jsx("img", { src: l.logo, alt: "", className: "w-4 h-4 object-contain" }) : _jsx(Flag, { code: l.country, size: 16 }), _jsx("span", { className: "max-w-[140px] truncate", children: l.name })] }, l.code)))] }), sheet && (_jsxs("div", { className: "fixed inset-0 z-[70] flex flex-col justify-end", role: "dialog", "aria-modal": "true", "aria-label": t('Leagues'), children: [_jsx("button", { type: "button", className: "absolute inset-0 bg-black/60 backdrop-blur-sm", onClick: () => setSheet(false), "aria-label": t('Close') }), _jsxs("div", { className: "relative max-h-[85vh] overflow-y-auto overscroll-contain rounded-t-3xl bg-bg border-t border-line shadow-2xl pb-[env(safe-area-inset-bottom)]", children: [_jsxs("div", { className: "sticky top-0 z-10 flex items-center justify-between px-5 py-3 bg-bg/40 backdrop-blur border-b border-line/60", children: [_jsx("span", { className: "mx-auto absolute left-1/2 -translate-x-1/2 top-1.5 w-10 h-1 rounded-full bg-line", "aria-hidden": true }), _jsx("span", { className: "font-display text-lg font-bold text-ink", children: t('Leagues') }), _jsx("button", { type: "button", onClick: () => setSheet(false), className: "h-9 px-3 rounded-full text-sm font-semibold text-muted hover:text-ink", children: t('Close') })] }), _jsx("div", { className: "p-3", children: _jsx(LeagueSidebar, { ...side, onSelect: pick }) })] })] }))] }));
}
/** Flashscore-style thin league bar over a block of games: flag · COUNTRY: League · count. */
export function LeagueBar({ country, name, logo, to, count }) {
    return (_jsxs(Link, { to: to, className: "flex items-center gap-2 h-8 px-3 sm:px-4 bg-surface2/60 border-b border-line/60 hover:bg-surface2 transition-colors min-w-0", children: [_jsx(Flag, { code: country, size: 16 }), _jsxs("span", { className: "min-w-0 truncate text-[11px] leading-none", children: [_jsxs("span", { className: "uppercase tracking-wide font-semibold text-faint", children: [countryName(country), ": "] }), _jsx("span", { className: "font-bold text-ink", children: name })] }), logo && _jsx("img", { src: logo, alt: "", className: "w-3.5 h-3.5 object-contain opacity-80 shrink-0" }), _jsx("span", { className: "ml-auto text-[10px] font-semibold text-faint num shrink-0", children: count })] }));
}
