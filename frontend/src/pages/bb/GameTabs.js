import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Link } from 'react-router-dom';
import { t, LOCALE } from '../../lib/i18n';
import { Card, TeamLogo } from './parts';
import { StandingsTable } from './BbLeague';
const TEXT = { H: 'text-home', A: 'text-away' };
const BG = { H: 'bg-home', A: 'bg-away' };
const DAY = 86400000;
/** Both teams side by side, logo and name, with an optional line under each. */
function TeamsHead({ g, sub }) {
    const side = (s) => {
        const team = s === 'H' ? g.home : g.away;
        return (_jsxs(Link, { to: `/basketball/team/${team.id}`, className: `flex flex-col sm:flex-row items-center gap-2 sm:gap-3 min-w-0 group text-center ${s === 'A' ? 'sm:flex-row-reverse sm:text-right' : 'sm:text-left'}`, children: [_jsx("span", { className: "w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-surface2/80 border border-line/60 grid place-items-center shrink-0", children: _jsx(TeamLogo, { team: team, size: 30 }) }), _jsxs("span", { className: "min-w-0 max-w-full", children: [_jsx("span", { className: "block font-display font-bold text-ink truncate group-hover:text-accent", children: team.name }), sub && _jsx("span", { className: "block", children: sub(s) })] })] }));
    };
    return (_jsxs("div", { className: "grid grid-cols-[1fr_auto_1fr] items-center gap-3", children: [side('H'), _jsx("span", { className: "text-[10px] font-extrabold tracking-widest text-faint", children: "VS" }), side('A')] }));
}
function FormChips({ f, align = 'left' }) {
    return (_jsx("span", { className: `flex gap-1 mt-1 justify-center ${align === 'right' ? 'sm:justify-end' : 'sm:justify-start'}`, children: f.map((r, i) => (_jsx("span", { className: `w-[18px] h-[18px] rounded-[5px] text-[9px] font-extrabold grid place-items-center ${r === 'W' ? 'bg-win/90 text-bg' : 'bg-loss/90 text-bg'} ${i === f.length - 1 ? 'ring-2 ring-offset-1 ring-offset-surface ring-line' : ''}`, children: r === 'W' ? t('W') : t('L') }, i))) }));
}
const GROUPS = [
    { title: t('Scoring'), rows: [{ k: 'pointsFor', label: t('Points scored') }, { k: 'pointsAgainst', label: t('Points allowed'), lowerBetter: true }] },
    { title: t('Shooting'), rows: [{ k: 'fgPct', label: t('Field goal %'), pct: true }, { k: 'threePct', label: t('3-point %'), pct: true }, { k: 'threeMade', label: t('3-pointers made') }, { k: 'ftPct', label: t('Free throw %'), pct: true }] },
    { title: t('Hustle & ball control'), rows: [{ k: 'rebounds', label: t('Rebounds') }, { k: 'assists', label: t('Assists') }, { k: 'steals', label: t('Steals') }, { k: 'blocks', label: t('Blocks') }, { k: 'turnovers', label: t('Turnovers'), lowerBetter: true }] }
];
function StatLine({ r, a, b }) {
    const better = a === b ? null : (a > b) !== !!r.lowerBetter ? 'H' : 'A';
    const sum = a + b || 1;
    const fmt = (x) => `${x}${r.pct ? '%' : ''}`;
    return (_jsxs("li", { className: "py-2", children: [_jsxs("div", { className: "flex items-center justify-between gap-2 text-sm", children: [_jsx("span", { className: `num w-16 ${better === 'H' ? 'font-extrabold text-ink' : 'text-muted'}`, children: fmt(a) }), _jsx("span", { className: "text-[11px] font-semibold text-faint text-center truncate", children: r.label }), _jsx("span", { className: `num w-16 text-right ${better === 'A' ? 'font-extrabold text-ink' : 'text-muted'}`, children: fmt(b) })] }), _jsxs("div", { className: "mt-1.5 grid grid-cols-2 gap-1.5", children: [_jsx("div", { className: "h-2 rounded-full bg-surface2 overflow-hidden flex justify-end", children: _jsx("div", { className: `h-full rounded-full transition-all duration-700 ${better === 'H' ? 'bg-home' : 'bg-home/30'}`, style: { width: `${(a / sum) * 100}%` } }) }), _jsx("div", { className: "h-2 rounded-full bg-surface2 overflow-hidden", children: _jsx("div", { className: `h-full rounded-full transition-all duration-700 ${better === 'A' ? 'bg-away' : 'bg-away/30'}`, style: { width: `${(b / sum) * 100}%` } }) })] })] }));
}
export function StatsTab({ g, home, away }) {
    if (!home || !away)
        return _jsx(Card, { children: _jsx("p", { className: "text-sm text-faint", children: t('Not enough games yet for averages.') }) });
    let hEdge = 0, aEdge = 0, n = 0;
    for (const gr of GROUPS)
        for (const r of gr.rows) {
            const a = home[r.k], b = away[r.k];
            if (a === null || b === null || a === b)
                continue;
            n++;
            if ((a > b) !== !!r.lowerBetter)
                hEdge++;
            else
                aEdge++;
        }
    const lead = hEdge === aEdge ? null : hEdge > aEdge ? 'H' : 'A';
    const net = (x) => Math.round((x.pointsFor - x.pointsAgainst) * 10) / 10;
    return (_jsxs(Card, { title: t('Averages, last {0} games', { 0: Math.max(home.games, away.games) }), children: [_jsx(TeamsHead, { g: g, sub: s => {
                    const x = s === 'H' ? home : away;
                    return (_jsxs(_Fragment, { children: [_jsxs("span", { className: "block text-[11px] text-faint num", children: [t('{0}–{1} in these games', { 0: x.won, 1: x.lost }), " \u00B7 ", _jsxs("span", { className: net(x) >= 0 ? 'text-win' : 'text-loss', children: [net(x) > 0 ? '+' : '', net(x)] })] }), _jsx(FormChips, { f: x.form, align: s === 'A' ? 'right' : 'left' })] }));
                } }), n > 0 && (_jsxs("div", { className: "mt-5 rounded-xl border border-line/60 bg-surface2/40 px-4 py-3", children: [_jsxs("div", { className: "flex items-center justify-between text-xs font-semibold mb-1.5", children: [_jsx("span", { className: TEXT.H, children: hEdge }), _jsx("span", { className: "text-muted", children: lead ? t('{0} lead {1} of {2} categories', { 0: lead === 'H' ? g.home.name : g.away.name, 1: Math.max(hEdge, aEdge), 2: n }) : t('Level: {0} categories each', { 0: hEdge }) }), _jsx("span", { className: TEXT.A, children: aEdge })] }), _jsxs("div", { className: "flex h-2 gap-[3px]", children: [_jsx("div", { className: "rounded-full bg-home", style: { width: `${(hEdge / n) * 100}%` } }), _jsx("div", { className: "rounded-full bg-away", style: { width: `${(aEdge / n) * 100}%` } })] })] })), _jsx("div", { className: "mt-5 space-y-5", children: GROUPS.map(gr => {
                    const rows = gr.rows.filter(r => home[r.k] !== null && away[r.k] !== null);
                    if (!rows.length)
                        return null;
                    return (_jsxs("div", { children: [_jsx("div", { className: "label pb-1", children: gr.title }), _jsx("ul", { className: "divide-y divide-line/40", children: rows.map(r => _jsx(StatLine, { r: r, a: home[r.k], b: away[r.k] }, r.k)) })] }, gr.title));
                }) }), (home.withStats < home.games || away.withStats < away.games) && _jsx("p", { className: "mt-4 text-[11px] text-faint", children: t('Shooting and other stats from the games with a box score.') })] }));
}
const TONE = {
    good: 'border-win/40 bg-win/10 text-win',
    mid: 'border-draw/40 bg-draw/10 text-draw',
    bad: 'border-loss/40 bg-loss/10 text-loss',
    none: 'border-line/60 bg-surface2/50 text-ink'
};
function Tile({ label, value, tone, icon }) {
    return (_jsxs("div", { className: `rounded-xl border px-3 py-2.5 ${TONE[tone]}`, children: [_jsxs("div", { className: "flex items-start gap-1.5 opacity-80", children: [_jsx("span", { className: "hidden sm:inline mt-px", children: icon }), _jsx("span", { className: "text-[10px] font-semibold uppercase sm:tracking-wide leading-tight", children: label })] }), _jsx("div", { className: "num text-xl font-extrabold mt-1 leading-none", children: value })] }));
}
const Ico = {
    bed: _jsxs("svg", { viewBox: "0 0 24 24", className: "w-3.5 h-3.5", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", children: [_jsx("path", { d: "M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5" }), _jsx("circle", { cx: "7", cy: "11", r: "1.6" })] }),
    cal: _jsxs("svg", { viewBox: "0 0 24 24", className: "w-3.5 h-3.5", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", children: [_jsx("rect", { x: "3", y: "5", width: "18", height: "16", rx: "2" }), _jsx("path", { d: "M3 10h18M8 3v4M16 3v4" })] }),
    next: _jsx("svg", { viewBox: "0 0 24 24", className: "w-3.5 h-3.5", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", children: _jsx("path", { d: "M5 12h14M13 6l6 6-6 6" }) })
};
function Result({ b }) {
    const [x, y] = (b.score || '').split('-').map(Number);
    const margin = Number.isFinite(x) && Number.isFinite(y) ? Math.abs(x - y) : null;
    return (_jsx("li", { children: _jsxs(Link, { to: `/basketball/game/${b.id}`, className: "flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface2/60 text-xs", children: [_jsx("span", { className: `w-6 h-6 rounded-md grid place-items-center text-[10px] font-extrabold shrink-0 ${b.result === 'W' ? 'bg-win/15 text-win' : b.result === 'L' ? 'bg-loss/15 text-loss' : 'bg-surface2 text-faint'}`, children: b.result === 'W' ? t('W') : b.result === 'L' ? t('L') : '–' }), _jsx("span", { className: "num text-faint w-12 shrink-0", children: new Date(b.kickoff).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }) }), _jsx("span", { className: `rounded px-1 text-[9px] font-bold shrink-0 ${b.home ? 'bg-home/15 text-home' : 'bg-surface2 text-muted'}`, children: b.home ? t('H') : t('A') }), b.opponentLogo ? _jsx("img", { src: b.opponentLogo, alt: "", className: "w-4 h-4 object-contain shrink-0", loading: "lazy" }) : _jsx("span", { className: "w-4 h-4 shrink-0" }), _jsx("span", { className: "text-ink font-medium truncate", children: b.opponent }), b.score && _jsx("span", { className: "ml-auto num font-bold text-ink shrink-0", children: b.score }), margin !== null && _jsxs("span", { className: `num text-[10px] w-8 text-right shrink-0 ${b.result === 'W' ? 'text-win' : 'text-loss'}`, children: [b.result === 'W' ? '+' : '−', margin] })] }) }));
}
function Upcoming({ b, from }) {
    const days = Math.max(0, Math.round((new Date(b.kickoff).getTime() - from) / DAY));
    return (_jsx("li", { children: _jsxs(Link, { to: `/basketball/game/${b.id}`, className: "flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface2/60 text-xs", children: [_jsx("span", { className: "w-6 h-6 rounded-md grid place-items-center border border-dashed border-line text-faint shrink-0", children: _jsxs("svg", { viewBox: "0 0 24 24", className: "w-3 h-3", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", children: [_jsx("path", { d: "M12 7v5l3 2" }), _jsx("circle", { cx: "12", cy: "12", r: "9" })] }) }), _jsx("span", { className: "num text-faint w-12 shrink-0", children: new Date(b.kickoff).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }) }), _jsx("span", { className: `rounded px-1 text-[9px] font-bold shrink-0 ${b.home ? 'bg-home/15 text-home' : 'bg-surface2 text-muted'}`, children: b.home ? t('H') : t('A') }), b.opponentLogo ? _jsx("img", { src: b.opponentLogo, alt: "", className: "w-4 h-4 object-contain shrink-0", loading: "lazy" }) : _jsx("span", { className: "w-4 h-4 shrink-0" }), _jsx("span", { className: "text-ink font-medium truncate", children: b.opponent }), _jsx("span", { className: "ml-auto rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-semibold text-muted num shrink-0", children: t('+{0} d', { 0: days }) })] }) }));
}
export function RestTab({ g, home, away }) {
    const from = new Date(g.kickoff).getTime();
    const restTone = (s) => (s.restDays === null ? 'none' : s.backToBack ? 'bad' : s.restDays < 2 ? 'mid' : 'good');
    const loadTone = (s) => (s.games7 >= 4 ? 'bad' : s.games7 === 3 ? 'mid' : 'none');
    const nextTone = (s) => (s.nextIn === null ? 'none' : s.nextIn < 1.5 ? 'mid' : 'none');
    const rest = (s) => (s.backToBack ? 0 : s.restDays === null ? null : Math.floor(s.restDays));
    const rh = rest(home), ra = rest(away);
    let edge = null;
    if (home.backToBack && away.backToBack)
        edge = t('Both teams play the second night of a back-to-back.');
    else if (rh !== null && ra !== null && rh !== ra) {
        const s = rh > ra ? 'H' : 'A';
        edge = _jsxs(_Fragment, { children: [_jsx("b", { className: TEXT[s], children: s === 'H' ? g.home.name : g.away.name }), " ", t('come in with {0} more days of rest', { 0: Math.abs(rh - ra) }), (s === 'H' ? away : home).backToBack ? ` · ${t('the other side is on a back-to-back')}` : '', "."] });
    }
    else if (rh !== null && ra !== null)
        edge = t('Same rest for both teams.');
    const panel = (s, x) => {
        const team = s === 'H' ? g.home : g.away;
        return (_jsxs("div", { className: "min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsx("span", { className: `w-1 h-6 rounded-full ${BG[s]}` }), _jsx(TeamLogo, { team: team, size: 22 }), _jsx("span", { className: "font-display font-bold text-ink truncate", children: team.name }), x.backToBack && _jsx("span", { className: "ml-auto rounded-full bg-loss/15 text-loss px-2 py-0.5 text-[10px] font-extrabold", children: t('B2B') })] }), _jsxs("div", { className: "grid grid-cols-3 gap-2 mb-4", children: [_jsx(Tile, { icon: Ico.bed, label: t('Rest'), tone: restTone(x), value: x.restDays === null ? '–' : x.backToBack ? t('B2B') : t('{0} d', { 0: Math.floor(x.restDays) }) }), _jsx(Tile, { icon: Ico.cal, label: t('Last 7 days'), tone: loadTone(x), value: x.games7 }), _jsx(Tile, { icon: Ico.next, label: t('Next game'), tone: nextTone(x), value: x.nextIn === null ? '–' : t('{0} d', { 0: Math.round(x.nextIn) }) })] }), x.recent.length > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: "label pb-1 px-2", children: t('Before this game') }), _jsx("ul", { className: "mb-3", children: x.recent.map(b => _jsx(Result, { b: b }, b.id)) })] })), x.upcoming.length > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: "label pb-1 px-2", children: t('After this game') }), _jsx("ul", { children: x.upcoming.map(b => _jsx(Upcoming, { b: b, from: from }, b.id)) })] }))] }));
    };
    return (_jsxs(Card, { title: t('Schedule & rest'), children: [edge && (_jsxs("div", { className: "mb-5 flex items-center gap-3 rounded-xl border border-accent/25 bg-accent/[0.07] px-4 py-3 text-sm text-ink", children: [_jsx("span", { className: "w-8 h-8 rounded-lg bg-accent/15 text-accent grid place-items-center shrink-0", children: Ico.bed }), _jsx("span", { children: edge })] })), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8", children: [panel('H', home), panel('A', away)] })] }));
}
/* ---------------- Head to head ---------------- */
export function H2HTab({ g, list }) {
    const sideOf = (id) => (id === g.home.id ? 'H' : 'A');
    const teamOf = (s) => (s === 'H' ? g.home : g.away);
    let hw = 0, aw = 0, hp = 0, ap = 0;
    for (const m of list) {
        const hs = sideOf(m.homeId);
        const [x, y] = m.score;
        const ptsH = hs === 'H' ? x : y, ptsA = hs === 'H' ? y : x;
        hp += ptsH;
        ap += ptsA;
        if (ptsH > ptsA)
            hw++;
        else
            aw++;
    }
    const n = list.length;
    const avg = (p) => (n ? (p / n).toFixed(1) : '–');
    return (_jsxs(Card, { title: t('Head to head'), children: [n ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "rounded-2xl border border-line/60 bg-surface2/40 p-4 sm:p-5", children: [_jsxs("div", { className: "grid grid-cols-[1fr_auto_1fr] items-center gap-3", children: [['H', 'A'].map((s, i) => (_jsxs("div", { className: `flex flex-col sm:flex-row items-center gap-2 sm:gap-3 min-w-0 text-center ${i === 1 ? 'order-3 sm:flex-row-reverse sm:text-right' : 'sm:text-left'}`, children: [_jsx("span", { className: "w-12 h-12 rounded-2xl bg-surface border border-line/60 grid place-items-center shrink-0", children: _jsx(TeamLogo, { team: teamOf(s), size: 30 }) }), _jsxs("span", { className: "min-w-0 max-w-full", children: [_jsx("span", { className: "block font-display font-bold text-ink truncate", children: teamOf(s).name }), _jsx("span", { className: "block text-[11px] text-faint num", children: t('{0} pts a game', { 0: avg(s === 'H' ? hp : ap) }) })] })] }, s))), _jsxs("div", { className: "order-2 text-center", children: [_jsxs("div", { className: "num font-display text-3xl sm:text-4xl font-extrabold leading-none", children: [_jsx("span", { className: hw >= aw ? TEXT.H : 'text-muted', children: hw }), _jsx("span", { className: "text-faint mx-1.5", children: "\u2013" }), _jsx("span", { className: aw >= hw ? TEXT.A : 'text-muted', children: aw })] }), _jsx("div", { className: "text-[10px] text-faint mt-1 uppercase tracking-wide", children: t('{0} meetings', { 0: n }) })] })] }), _jsxs("div", { className: "flex h-2 gap-[3px] mt-4", children: [_jsx("div", { className: "rounded-full bg-home", style: { width: `${(hw / n) * 100}%` } }), _jsx("div", { className: "rounded-full bg-away", style: { width: `${(aw / n) * 100}%` } })] })] }), _jsx("ul", { className: "mt-4 divide-y divide-line/40", children: list.map(m => {
                            const hs = sideOf(m.homeId), as = hs === 'H' ? 'A' : 'H';
                            const homeWon = m.score[0] > m.score[1];
                            const winner = homeWon ? hs : as;
                            return (_jsx("li", { children: _jsxs(Link, { to: `/basketball/game/${m.id}`, className: "grid grid-cols-[3.5rem_1fr_auto_1fr_2.5rem] sm:grid-cols-[5.5rem_1fr_auto_1fr_3rem] items-center gap-2 sm:gap-3 py-2 px-1 rounded-lg hover:bg-surface2/50 text-sm", children: [_jsxs("span", { className: "text-[11px] text-faint leading-tight", children: [new Date(m.kickoff).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: '2-digit' }), _jsx("span", { className: "hidden sm:block text-[10px] truncate", children: m.league })] }), _jsxs("span", { className: "flex items-center justify-end gap-2 min-w-0", children: [_jsx("span", { className: `truncate ${homeWon ? 'font-bold text-ink' : 'text-muted'}`, children: m.home }), _jsx(TeamLogo, { team: teamOf(hs), size: 18 })] }), _jsxs("span", { className: "num font-extrabold text-ink rounded-lg bg-surface2/80 px-2.5 py-1 text-center min-w-[72px]", children: [_jsx("span", { className: homeWon ? '' : 'text-muted', children: m.score[0] }), _jsx("span", { className: "text-faint", children: "\u2013" }), _jsx("span", { className: !homeWon ? '' : 'text-muted', children: m.score[1] })] }), _jsxs("span", { className: "flex items-center gap-2 min-w-0", children: [_jsx(TeamLogo, { team: teamOf(as), size: 18 }), _jsx("span", { className: `truncate ${!homeWon ? 'font-bold text-ink' : 'text-muted'}`, children: m.away })] }), _jsx("span", { className: `justify-self-end w-2 h-2 rounded-full ${BG[winner]}`, title: teamOf(winner).name })] }) }, m.id));
                        }) })] })) : _jsx("p", { className: "text-sm text-faint", children: t('These teams have not met in the seasons we hold.') }), _jsx("p", { className: "mt-3 text-[11px] text-faint", children: t('Meetings in our leagues over the last five seasons.') })] }));
}
/* ---------------- Standings ---------------- */
export function StandingsTab({ g, data }) {
    const find = (id) => {
        for (const gr of data.groups) {
            const r = gr.rows.find(x => x.team.id === id);
            if (r)
                return { r, of: gr.rows.length };
        }
        return null;
    };
    const h = find(g.home.id), a = find(g.away.id);
    const diff = (r) => (r.pointsFor !== null && r.pointsAgainst !== null && r.played ? (r.pointsFor - r.pointsAgainst) / r.played : null);
    const card = (s, x) => {
        const team = s === 'H' ? g.home : g.away;
        const d = x ? diff(x.r) : null;
        return (_jsxs("div", { className: `relative overflow-hidden rounded-2xl border border-line/60 bg-surface2/40 p-4 ${s === 'A' ? 'text-right' : ''}`, children: [_jsx("span", { className: `absolute top-0 ${s === 'H' ? 'left-0' : 'right-0'} w-1 h-full ${BG[s]}` }), _jsxs("div", { className: `flex items-center gap-2 ${s === 'A' ? 'flex-row-reverse' : ''}`, children: [_jsx(TeamLogo, { team: team, size: 22 }), _jsx("span", { className: "font-display font-bold text-ink truncate", children: team.name })] }), x ? (_jsxs("div", { className: `mt-3 flex items-end gap-4 ${s === 'A' ? 'flex-row-reverse' : ''}`, children: [_jsxs("div", { children: [_jsxs("div", { className: `num font-display text-4xl font-extrabold leading-none ${TEXT[s]}`, children: [x.r.position, _jsxs("span", { className: "text-sm text-faint font-semibold", children: ["/", x.of] })] }), _jsx("div", { className: "text-[10px] text-faint uppercase tracking-wide mt-1", children: t('Position') })] }), _jsxs("div", { children: [_jsxs("div", { className: "num text-lg font-bold text-ink leading-none", children: [x.r.won, "\u2013", x.r.lost] }), _jsx("div", { className: "text-[10px] text-faint uppercase tracking-wide mt-1", children: t('Record') })] }), d !== null && (_jsxs("div", { children: [_jsxs("div", { className: `num text-lg font-bold leading-none ${d >= 0 ? 'text-win' : 'text-loss'}`, children: [d > 0 ? '+' : '', d.toFixed(1)] }), _jsx("div", { className: "text-[10px] text-faint uppercase tracking-wide mt-1", children: t('Margin') })] }))] })) : _jsx("p", { className: "mt-3 text-xs text-faint", children: t('Not in this table') })] }));
    };
    const gap = h && a ? Math.abs(h.r.position - a.r.position) : 0;
    return (_jsxs(Card, { title: t('Standings'), action: _jsx("span", { className: "text-xs text-faint", children: g.league.name }), children: [_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [card('H', h), card('A', a)] }), h && a && gap > 0 && (_jsxs("p", { className: "mt-3 text-center text-xs text-muted", children: [_jsx("b", { className: TEXT[h.r.position < a.r.position ? 'H' : 'A'], children: h.r.position < a.r.position ? g.home.name : g.away.name }), " ", gap === 1 ? t('are one place higher') : t('are {0} places higher', { 0: gap })] })), _jsx("div", { className: "mt-5", children: _jsx(StandingsTable, { data: data, mark: [g.home.id, g.away.id], colors: { [g.home.id]: 'H', [g.away.id]: 'A' } }) })] }));
}
