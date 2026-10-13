import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { t, LOCALE } from '../../lib/i18n';
import { useReveal, justRevealed } from '../../lib/reveal';
import CountUp from '../../components/CountUp';
import { LeagueBar } from '../../components/LeagueSidebar';
import { BB_STATUS, BB_COUNTRY, liveLabel, bbRank, timeOf, useBbFavorites } from '../../lib/bb';
/** Shared pieces of the basketball pages — the same look as the football pages. */
/** Reveal ids for basketball games (negative, so they never clash with football match ids). */
export const rid = (g) => -g.id;
/** Status the reveal helper understands: finished games are never covered. */
export const rstatus = (g) => (g.state === 'done' ? 'FT' : g.status);
const PICK_COLOR = { H: 'text-home', A: 'text-away' };
const PICK_BG = { H: 'bg-home', A: 'bg-away' };
export function Card({ title, action, children, className = '' }) {
    return (_jsxs("section", { className: `card p-5 sm:p-6 ${className}`, children: [(title || action) && (_jsxs("div", { className: "flex flex-wrap items-baseline justify-between gap-2 mb-4", children: [title && _jsx("h2", { className: "font-display text-base sm:text-lg font-bold text-ink", children: title }), action] })), children] }));
}
/** Football-style section title over rails and lists. */
export function SectionTitle({ label, sub, count, sticky }) {
    return (_jsxs("div", { className: `flex items-baseline gap-3 mb-3 ${sticky ? 'sticky top-[113px] sm:top-16 z-30 py-2 -my-2 bg-bg/35 backdrop-blur-lg' : ''}`, children: [_jsx("h2", { className: "font-display text-lg font-bold tracking-tight text-ink", children: label }), count !== undefined && _jsx("span", { className: "num text-xs text-faint", children: t('{0} games', { 0: count }) }), sub && _jsx("span", { className: "text-xs text-faint", children: sub })] }));
}
export function TeamLogo({ team, size = 22 }) {
    const [broken, setBroken] = useState(false);
    return team.logo && !broken ? (_jsx("img", { src: team.logo, alt: "", width: size, height: size, loading: "lazy", onError: () => setBroken(true), className: "object-contain flex-shrink-0 drop-shadow-sm", style: { width: size, height: size } })) : (_jsx("span", { className: "rounded-full bg-surface2 border border-line/60 grid place-items-center font-display font-bold text-muted flex-shrink-0 leading-none", style: { width: size, height: size, fontSize: Math.max(7, Math.round(size * 0.36)) }, title: team.name, children: initials(team.name) }));
}
/** "Tokyo Sunrockers" → "TS", "Bayern" → "BAY". */
export const initials = (name) => {
    const w = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(x => x.length > 1 || /\d/.test(x));
    return (w.length >= 2 ? w.slice(0, 2).map(x => x[0]).join('') : (w[0] || name).slice(0, 3)).toUpperCase();
};
export function LockIcon() {
    return (_jsxs("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [_jsx("rect", { x: "5", y: "11", width: "14", height: "10", rx: "2" }), _jsx("path", { d: "M8 11V7a4 4 0 0 1 8 0v4" })] }));
}
/**
 * One game as a thin row, like football's: time · both teams · our pick (1 / 2 with the pick highlighted, then the
 * spread and total points on wide screens). Covered picks show a Reveal button; locked picks a lock. Finished games
 * show the score and whether we were right.
 */
export function GameRow({ g, showLeague = false, showDay = false, compact = false }) {
    const p = g.prediction;
    const { hidden: covered, reveal } = useReveal(rid(g), rstatus(g), !!p && !p.locked);
    const isLive = g.state === 'live';
    const done = g.state === 'done';
    const pick = p && !covered ? p.pick : null;
    const pct = p && pick && !p.locked && typeof p.pHome === 'number' ? Math.round(pick === 'H' ? p.pHome : p.pAway) : null;
    const pickName = pick === 'H' ? g.home.name : pick === 'A' ? g.away.name : null;
    const roll = justRevealed(rid(g));
    const won = (side) => done && g.score ? (side === 'H' ? g.score.home > g.score.away : g.score.away > g.score.home) : false;
    const favWhy = useBbFavorites().reasons(g);
    return (_jsxs(Link, { to: `/basketball/game/${g.id}`, className: `group relative flex items-center gap-2.5 px-3 sm:px-4 py-1.5 hover:bg-surface2/50 transition-colors ${isLive ? 'bg-live/[0.06]' : ''}`, children: [isLive && _jsx("span", { className: "absolute left-0 inset-y-0 w-0.5 bg-live", "aria-hidden": true }), _jsxs("div", { className: "relative w-10 flex-shrink-0 text-center leading-tight", children: [favWhy.length > 0 && (_jsx("span", { className: "absolute -left-2.5 sm:-left-3 top-1/2 -translate-y-1/2 text-accent", title: t('Favorite: {0}', { 0: favWhy.map(f => f.name).join(', ') }), children: _jsx("svg", { viewBox: "0 0 24 24", className: "w-3 h-3", fill: "currentColor", "aria-hidden": true, children: _jsx("path", { d: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" }) }) })), isLive ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "block text-[11px] font-bold text-live", children: BB_STATUS[g.status] || t('LIVE') }), g.clock ? _jsxs("span", { className: "block text-[10px] font-bold text-live num whitespace-nowrap", children: [g.clock.left, "'", _jsx("span", { className: "animate-pulseDot", children: "\u00B7" })] }) : _jsx("span", { className: "inline-block w-1.5 h-1.5 rounded-full bg-live animate-pulseDot" })] })) : done ? (_jsx("span", { className: "block text-[11px] font-bold text-faint", children: BB_STATUS[g.status] || t('Final') })) : g.state === 'off' ? (_jsx("span", { className: "block text-[10px] font-bold text-loss", children: BB_STATUS[g.status] || g.status })) : (_jsxs(_Fragment, { children: [_jsx("span", { className: "block num text-[12px] text-ink/90", children: timeOf(g.kickoff) }), showDay && _jsx("span", { className: "block text-[10px] text-faint", children: new Date(g.kickoff).toLocaleDateString(LOCALE, { weekday: 'short' }) })] }))] }), _jsxs("div", { className: "flex-1 min-w-0", children: [showLeague && _jsx("div", { className: "text-[10px] text-faint mb-0.5 truncate", children: g.league.name }), ['H', 'A'].map(side => {
                        const team = side === 'H' ? g.home : g.away;
                        const score = g.score && g.state !== 'upcoming' ? (side === 'H' ? g.score.home : g.score.away) : null;
                        return (_jsxs("div", { className: "flex items-center gap-2 min-w-0 h-5", children: [_jsx(TeamLogo, { team: team, size: 15 }), _jsx("span", { className: `text-[13px] truncate ${pick === side || won(side) ? 'font-bold text-ink' : 'text-ink/85'}`, children: team.name }), score !== null && _jsx("span", { className: `ml-auto pl-2 num text-[13px] font-extrabold tabular-nums ${isLive ? 'text-live' : done && !won(side) ? 'text-muted' : 'text-ink'}`, children: score })] }, side));
                    })] }), compact ? (_jsxs("div", { className: "flex-shrink-0 flex flex-col items-end gap-0.5 max-w-[96px]", children: [pickName && _jsx("span", { className: `text-[11px] font-semibold truncate max-w-full ${PICK_COLOR[pick]}`, children: pickName }), done && p?.hit !== null && p?.hit !== undefined && (_jsx("span", { className: `rounded-full px-2 py-0.5 text-[10px] font-bold ${p.hit ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'}`, children: p.hit ? t('Hit') : t('Miss') }))] })) : (_jsxs("div", { className: "flex-shrink-0 flex items-center justify-end min-w-[84px] sm:min-w-[150px] gap-1.5", children: [covered ? (_jsxs("button", { type: "button", onClick: e => { e.preventDefault(); e.stopPropagation(); reveal(); }, className: "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-bold bg-accent/10 text-accent border border-accent/30 hover:bg-accent/15", children: [_jsxs("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [_jsx("path", { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" }), _jsx("circle", { cx: "12", cy: "12", r: "3" })] }), t('Reveal')] })) : p && p.locked ? (_jsxs("span", { className: "inline-flex items-center gap-1.5 text-xs text-faint", children: [_jsx(LockIcon, {}), " ", pickName ? _jsx("span", { className: `font-semibold truncate max-w-[110px] ${PICK_COLOR[pick]}`, children: pickName }) : t('Locked')] })) : isLive && p?.live ? (_jsx(LiveRowPct, { g: g })) : p && pick && pct !== null ? (_jsxs(_Fragment, { children: [_jsxs("span", { className: `sm:hidden text-right leading-tight ${roll ? 'pop-in' : ''}`, children: [_jsx("span", { className: `block text-[11px] font-bold truncate max-w-[84px] ${PICK_COLOR[pick]}`, children: pickName }), _jsx(CountUp, { value: pct, suffix: "%", animate: roll, className: "block num text-[11px] font-semibold text-ink/80" })] }), _jsxs("span", { className: "hidden sm:flex items-center gap-1", children: [['H', 'A'].map((k, i) => {
                                        const v = Math.round(k === 'H' ? p.pHome : p.pAway);
                                        const on = k === pick;
                                        return (_jsxs("span", { className: `w-11 h-7 rounded-md grid place-items-center leading-none transition-colors duration-500 ${on ? `${PICK_BG[k]} text-bg` : 'bg-surface2/70 text-muted'} ${roll ? 'pop-in' : ''}`, style: roll ? { animationDelay: `${i * 90}ms` } : undefined, children: [_jsx("span", { className: "text-[8px] font-bold opacity-75", children: k === 'H' ? '1' : '2' }), _jsx(CountUp, { value: v, suffix: "%", animate: roll, delay: i * 90, className: "num text-[11px] font-bold" })] }, k));
                                    }), typeof p.spread === 'number' && typeof p.total === 'number' && (_jsxs(_Fragment, { children: [_jsx("span", { className: "hidden lg:block w-px h-5 bg-line mx-1", "aria-hidden": true }), _jsxs("span", { className: `hidden lg:grid w-[60px] h-7 rounded-md place-items-center leading-none border border-line/70 text-muted ${roll ? 'pop-in' : ''}`, title: t('Point spread'), children: [_jsx("span", { className: "text-[8px] font-bold opacity-75", children: t('Spread') }), _jsxs("span", { className: "num text-[11px] font-bold text-ink", children: [p.spread >= 0 ? '1' : '2', " \u2212", Math.abs(p.spread).toFixed(1)] })] }), _jsxs("span", { className: `hidden lg:grid w-[60px] h-7 rounded-md place-items-center leading-none border border-line/70 text-muted ${roll ? 'pop-in' : ''}`, title: t('Total points'), children: [_jsx("span", { className: "text-[8px] font-bold opacity-75", children: t('Total') }), _jsx("span", { className: "num text-[11px] font-bold text-ink", children: p.total.toFixed(1) })] })] }))] })] })) : (_jsx("span", { className: "text-xs text-faint", children: "\u2013" })), done && p?.hit !== null && p?.hit !== undefined && (_jsx("span", { className: `w-5 h-5 rounded grid place-items-center text-[10px] font-extrabold ${p.hit ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'}`, title: p.hit ? t('Hit') : t('Miss'), children: p.hit ? '✓' : '✗' }))] }))] }));
}
/** A day's games grouped by league (NBA first), each league in its own card with a header — like football. */
export function LeagueCards({ games, logos }) {
    const by = new Map();
    for (const g of games)
        by.set(g.league.code, [...(by.get(g.league.code) || []), g]);
    const order = [...by.keys()].sort((a, b) => bbRank(a) - bbRank(b));
    return (_jsx("div", { className: "space-y-2", children: order.map(code => {
            const list = by.get(code);
            return (_jsxs("div", { className: "card overflow-hidden", children: [_jsx(LeagueBar, { country: BB_COUNTRY[code] || 'world', name: list[0].league.name, logo: logos?.[code], to: `/basketball/league/${code}`, count: list.length }), _jsx("div", { className: "divide-y divide-line/40", children: list.map(g => _jsx(GameRow, { g: g }, g.id)) })] }, code));
        }) }));
}
/** Games by day (sticky day titles), then by league. */
export function GamesByDay({ games, logos, empty }) {
    if (!games.length)
        return _jsx("div", { className: "card p-12 text-center text-muted", children: empty });
    const days = [];
    for (const g of games) {
        const k = new Date(g.kickoff).toDateString();
        const last = days[days.length - 1];
        if (last && last.key === k)
            last.list.push(g);
        else
            days.push({ key: k, list: [g] });
    }
    return (_jsx(_Fragment, { children: days.map(d => (_jsxs("section", { className: "mb-6", children: [_jsx(SectionTitle, { label: dayTitle(d.list[0].kickoff), count: d.list.length, sticky: true }), _jsx(LeagueCards, { games: d.list, logos: logos })] }, d.key))) }));
}
export function dayTitle(iso) {
    const d = new Date(iso);
    const today = new Date();
    const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
    if (diff === 0)
        return t('Today');
    if (diff === 1)
        return t('Tomorrow');
    if (diff === -1)
        return t('Yesterday');
    return d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
}
/** Live game in a sidebar box (football's LiveRow). */
export function LiveRow({ g }) {
    const live = useLiveChance(g);
    const lead = live ? (live.pHome >= 50 ? 'H' : 'A') : null;
    return (_jsxs(Link, { to: `/basketball/game/${g.id}`, className: "block rounded-xl px-2 py-2 hover:bg-surface2 transition-colors", children: [_jsxs("div", { className: "flex items-center justify-between text-[10px] text-faint mb-1", children: [_jsx("span", { className: "truncate", children: g.league.name }), _jsx("span", { className: "font-bold text-live tracking-wider", children: liveLabel(g, true) })] }), ['H', 'A'].map(s => {
                const team = s === 'H' ? g.home : g.away;
                return (_jsxs("div", { className: "flex items-center justify-between gap-2 py-0.5", children: [_jsxs("span", { className: "flex items-center gap-2 min-w-0", children: [_jsx(TeamLogo, { team: team, size: 18 }), _jsx("span", { className: "text-sm font-medium text-ink truncate", children: team.name })] }), _jsxs("span", { className: "flex items-center gap-2", children: [live && _jsxs("span", { className: `num text-[11px] font-semibold ${lead === s ? 'text-live' : 'text-faint'}`, children: [Math.round(s === 'H' ? live.pHome : live.pAway), "%"] }), _jsx("span", { className: "num text-sm font-bold text-ink w-7 text-right", children: g.score ? (s === 'H' ? g.score.home : g.score.away) : 0 })] })] }, s));
            })] }));
}
/** The live win chance of a game the visitor may see (not covered by the free reveal), else null. */
export function useLiveChance(g) {
    const p = g.prediction;
    const { hidden } = useReveal(rid(g), rstatus(g), !!p && !p.locked);
    return g.state === 'live' && p && !p.locked && !hidden && p.live ? p.live : null;
}
/** In a game row while the game is on: who is ahead on win chance now, and the projected final score. */
function LiveRowPct({ g }) {
    const l = g.prediction.live;
    const lead = l.pHome >= 50 ? 'H' : 'A';
    const name = lead === 'H' ? g.home.name : g.away.name;
    const pct = Math.round(lead === 'H' ? l.pHome : l.pAway);
    return (_jsxs(_Fragment, { children: [_jsxs("span", { className: "sm:hidden text-right leading-tight", title: t('Live win chance'), children: [_jsx("span", { className: "block text-[11px] font-bold truncate max-w-[84px] text-live", children: name }), _jsxs("span", { className: "block num text-[11px] font-semibold text-ink/80", children: [pct, "%"] })] }), _jsxs("span", { className: "hidden sm:flex items-center gap-1", title: t('Live win chance'), children: [['H', 'A'].map(k => (_jsxs("span", { className: `w-11 h-7 rounded-md grid place-items-center leading-none ${k === lead ? 'bg-live text-bg' : 'bg-surface2/70 text-muted'}`, children: [_jsx("span", { className: "text-[8px] font-bold opacity-75", children: k === 'H' ? '1' : '2' }), _jsxs("span", { className: "num text-[11px] font-bold", children: [Math.round(k === 'H' ? l.pHome : l.pAway), "%"] })] }, k))), _jsx("span", { className: "hidden lg:block w-px h-5 bg-line mx-1", "aria-hidden": true }), _jsxs("span", { className: "hidden lg:grid w-[60px] h-7 rounded-md place-items-center leading-none border border-live/40 text-muted", title: t('Projected final score'), children: [_jsx("span", { className: "text-[8px] font-bold opacity-75", children: t('Projected') }), _jsxs("span", { className: "num text-[11px] font-bold text-ink", children: [l.score.home, "-", l.score.away] })] })] })] }));
}
/** Game page, while the game is on: win chance now vs at tip-off, and the projected final score. */
export function LiveChanceBox({ g }) {
    const l = useLiveChance(g);
    const p = g.prediction;
    if (!l || !p || typeof p.pHome !== 'number')
        return null;
    const cap = (v) => Math.min(99, Math.max(1, Math.round(v)));
    const rows = [
        { k: 'H', label: g.home.name, now: l.pHome, before: p.pHome, bar: 'bg-home', pts: l.score.home },
        { k: 'A', label: g.away.name, now: l.pAway, before: p.pAway ?? 100 - p.pHome, bar: 'bg-away', pts: l.score.away }
    ];
    const top = l.pHome >= 50 ? 'H' : 'A';
    return (_jsxs("div", { className: "mt-4 rounded-2xl border border-live/40 bg-live/[0.06] p-3 sm:p-4", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "inline-block w-2 h-2 rounded-full bg-live animate-pulseDot", "aria-hidden": true }), _jsx("span", { className: "text-sm font-bold text-ink", children: t('Live win chance') })] }), _jsxs("span", { className: "num text-xs font-semibold text-live", children: [liveLabel(g, true), " \u00B7 ", g.score?.home ?? 0, "-", g.score?.away ?? 0] })] }), _jsx("div", { className: "grid grid-cols-2 gap-2 mt-3", children: rows.map(r => {
                    const diff = Math.round(r.now) - Math.round(r.before);
                    return (_jsxs("div", { className: `rounded-xl px-2 py-2 text-center ${r.k === top ? 'bg-surface border border-line' : ''}`, children: [_jsx("div", { className: "text-[11px] text-muted truncate", children: r.label }), _jsxs("div", { className: "num text-xl sm:text-2xl font-extrabold text-ink", children: [cap(r.now), "%"] }), _jsxs("div", { className: `num text-[11px] font-semibold ${diff > 0 ? 'text-win' : diff < 0 ? 'text-loss' : 'text-faint'}`, children: [diff > 0 ? '▲' : diff < 0 ? '▼' : '=', " ", Math.abs(diff), " ", _jsxs("span", { className: "text-faint font-normal", children: ["\u00B7 ", t('was {0}%', { 0: Math.round(r.before) })] })] })] }, r.k));
                }) }), _jsx("div", { className: "flex h-2 gap-[3px] mt-3", "aria-hidden": true, children: rows.map(r => _jsx("div", { className: `rounded-full ${r.bar} transition-all duration-700`, style: { width: `calc(${Math.max(1, r.now)}% - 3px)` } }, r.k)) }), _jsxs("div", { className: "mt-3 flex items-center justify-between gap-3 rounded-xl bg-surface/70 border border-line/60 px-3 py-2", children: [_jsx("span", { className: "text-xs text-muted", children: t('Projected final score') }), _jsxs("span", { className: "text-right leading-tight", children: [_jsxs("span", { className: "block num text-sm font-extrabold text-ink whitespace-nowrap", children: [l.score.home, " \u2013 ", l.score.away] }), _jsx("span", { className: "block num text-[11px] text-faint whitespace-nowrap", children: t('{0} points in total', { 0: l.total }) })] })] }), _jsx("p", { className: "text-[11px] text-faint mt-2", children: t('Updated every minute from our prediction at tip-off, the score and the time left.') })] }));
}
export function Skeleton({ rows = 4, h = 'h-12' }) {
    return _jsx("div", { className: "space-y-2", children: Array.from({ length: rows }).map((_, i) => _jsx("div", { className: `${h} rounded-xl bg-surface2/60 animate-pulse` }, i)) });
}
/** Premium nudge where numbers are hidden. */
export function LockedNote() {
    return (_jsxs("div", { className: "rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-ink flex flex-wrap items-center justify-between gap-2", children: [_jsxs("span", { className: "inline-flex items-center gap-2", children: [_jsx(LockIcon, {}), " ", t('Win chances, point spread, total points and the predicted score are for Premium members.')] }), _jsx(Link, { to: "/premium", className: "px-3 py-1.5 rounded-lg bg-accent text-bg text-xs font-extrabold", children: t('Go Premium') })] }));
}
/** Plain list (team / league pages): rows under day headings. */
export function GameList({ games, showLeague = false, empty }) {
    if (!games.length)
        return _jsx("p", { className: "text-sm text-faint py-4", children: empty });
    const days = [];
    for (const g of games) {
        const k = new Date(g.kickoff).toDateString();
        const last = days[days.length - 1];
        if (last && last.key === k)
            last.list.push(g);
        else
            days.push({ key: k, list: [g] });
    }
    return (_jsx("div", { className: "space-y-4 -mx-5 sm:-mx-6", children: days.map(d => (_jsxs("div", { children: [_jsx("div", { className: "label pb-1 px-5 sm:px-6", children: dayTitle(d.list[0].kickoff) }), _jsx("div", { className: "divide-y divide-line/50", children: d.list.map(g => _jsx(GameRow, { g: g, showLeague: showLeague }, g.id)) })] }, d.key))) }));
}
