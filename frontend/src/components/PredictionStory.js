import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { explainPrediction } from '../lib/explain';
import { t as tt } from '../lib/i18n';
const DRAW_ROWS = new Set(['#15', '#30', '#16']);
/** Plain names for the model's factors. */
const LABEL = {
    '#1': tt("Squad value"),
    '#1e': tt("Overall strength"),
    '#1p': tt("Player quality"),
    '#12': tt("Confirmed lineups"),
    '#13': tt("Missing players"),
    '#19': tt('Attack'),
    '#14': tt('Defence'),
    '#10': tt("Rest and fixture load"),
    '#23': tt("Home and away record"),
    '#7': tt('Head-to-head'),
    '#21': tt("Recent form")
};
const HINT = {
    '#1': 'what the best players are worth on the market',
    '#1e': 'a rating built from every result, bigger wins count more',
    '#12': 'usual starters missing from the published lineup',
    '#13': 'injured and suspended regulars',
    '#19': 'goals scored, adjusted for the opponents faced',
    '#14': 'goals conceded, adjusted for the opponents faced',
    '#10': 'games played in the last 8 days',
    '#23': "the home side's home games vs the away side's away games",
    '#7': 'the last 10 meetings',
    '#21': 'points from the last 6 games'
};
const labelOf = (r) => (r.name.startsWith('Home advantage') || r.name.startsWith('Rest days') || r.name.startsWith('Goals:') || r.name.startsWith('Squad value (') || r.name.startsWith('Strength (rating)') || r.name.startsWith('Form, last 6 (') ? tt(r.name.replace(/\s*\(.*\)$/, '').replace('Goals: attack vs defence', 'Goals: attack and defence')) : LABEL[r.id] || tt(r.name));
function strength(share) {
    if (share >= 0.3)
        return 'big edge';
    if (share >= 0.12)
        return 'clear edge';
    return 'small edge';
}
function Block({ title, children, note }) {
    return (_jsxs("div", { className: "space-y-2.5", children: [_jsxs("div", { className: "flex flex-wrap items-baseline justify-between gap-2", children: [_jsx("h3", { className: "text-[11px] font-extrabold uppercase tracking-wide text-accent", children: title }), note && _jsx("span", { className: "text-[11px] text-faint", children: note })] }), children] }));
}
/** One factor: both teams' scores at the ends, a bar from the middle toward the side it favours. */
function Tug({ r, max, total, hn, an }) {
    const side = r.edge > 0 ? 'H' : r.edge < 0 ? 'A' : null;
    const width = max ? (Math.abs(r.edge) / max) * 50 : 0;
    const who = side === 'H' ? hn : side === 'A' ? an : null;
    const note = r.note && /\d/.test(r.note) && !/^(stands in|market value of|Elo over|regulars listed|usual starters left|how strong the clubs)/i.test(r.note) ? r.note : HINT[r.id] || r.note || '';
    return (_jsxs("li", { className: "py-2.5", children: [_jsxs("div", { className: "flex items-baseline justify-between gap-3", children: [_jsx("span", { className: "text-sm font-semibold text-ink", children: labelOf(r) }), _jsx("span", { className: `text-[11px] font-bold whitespace-nowrap ${side === 'H' ? 'text-home' : side === 'A' ? 'text-away' : 'text-faint'}`, children: who ? `${who} · ${strength(total ? Math.abs(r.edge) / total : 0)}` : tt("Even") })] }), _jsxs("div", { className: "mt-1.5 flex items-center gap-2", children: [_jsx("span", { className: `w-9 text-right num text-xs ${side === 'H' ? 'font-bold text-ink' : 'text-muted'}`, children: fmt(r.home) }), _jsxs("div", { className: "relative flex-1 h-2.5 rounded-full bg-surface2", children: [_jsx("span", { className: "absolute left-1/2 top-[-3px] bottom-[-3px] w-px bg-line", "aria-hidden": true }), side && (_jsx("span", { className: `absolute top-0 bottom-0 rounded-full ${side === 'H' ? 'bg-home right-1/2' : 'bg-away left-1/2'}`, style: { width: `${Math.max(2, width)}%` } }))] }), _jsx("span", { className: `w-9 num text-xs ${side === 'A' ? 'font-bold text-ink' : 'text-muted'}`, children: fmt(r.away) })] }), note && _jsx("div", { className: "mt-1 text-[11px] text-faint", children: note })] }));
}
const fmt = (x) => (Math.round(x * 10) / 10).toFixed(1);
/** The most likely of: the result, double chance, over/under 1.5 and 2.5, both teams to score (same as the record page). */
function safestBet(p, home, away) {
    if (p.locked || typeof p.home !== 'number')
        return null;
    const c = [];
    const top = [{ l: tt("{0} to win", { 0: home }), v: p.home }, { l: 'Draw', v: p.draw }, { l: tt("{0} to win", { 0: away }), v: p.away }].sort((a, b) => b.v - a.v)[0];
    c.push({ label: top.l, p: top.v });
    const dc = [{ l: tt("{0} or draw", { 0: home }), v: p.home + p.draw }, { l: tt("{0} or draw", { 0: away }), v: p.away + p.draw }, { l: tt("{0} or {1} (no draw)", { 0: home, 1: away }), v: p.home + p.away }].sort((a, b) => b.v - a.v)[0];
    c.push({ label: dc.l, p: dc.v });
    const lam = p.expectedGoals.home + p.expectedGoals.away;
    const o15 = Math.max((1 - Math.exp(-lam) * (1 + lam)) * 100, p.over25);
    c.push(o15 >= 50 ? { label: tt("Over 1.5 goals"), p: o15 } : { label: tt("Under 1.5 goals"), p: 100 - o15 });
    c.push(p.over25 >= 50 ? { label: tt("Over 2.5 goals"), p: p.over25 } : { label: tt("Under 2.5 goals"), p: 100 - p.over25 });
    c.push(p.btts >= 50 ? { label: tt("Both teams score"), p: p.btts } : { label: tt("Not both teams score"), p: 100 - p.btts });
    const best = c.sort((a, b) => b.p - a.p)[0];
    return { label: best.label, p: Math.round(best.p) };
}
export default function PredictionStory({ p, home, away, upcoming, friendly }) {
    const g = p.grid;
    const ex = explainPrediction(p, home, away, upcoming);
    if (!g || !ex)
        return null;
    const team = g.rows.filter(r => !DRAW_ROWS.has(r.id));
    const moving = team.filter(r => r.edge !== 0).sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
    const still = team.filter(r => r.edge === 0);
    const max = Math.max(0, ...moving.map(r => Math.abs(r.edge)));
    const total = moving.reduce((s, r) => s + Math.abs(r.edge), 0);
    const forH = moving.filter(r => r.edge > 0).reduce((s, r) => s + r.edge, 0);
    const forA = moving.filter(r => r.edge < 0).reduce((s, r) => s - r.edge, 0);
    // what adds up: 1000 points
    const pts = g.points;
    const drawBase = g.drawPot?.base ?? null;
    // what could still change it
    const risks = [];
    // (lineups not out yet: the blue "check again 1 hour before kick-off" note above already says it)
    const xi = g.rows.find(r => r.id === '#12');
    if (upcoming && xi && xi.note && /^usual starters out/.test(xi.note))
        risks.push(tt("The lineups are in and already counted: {0} ({1}).", { 0: xi.note.replace(/^usual starters out: /, 'usual starters out ').replace(' | ', ` (${home}) · `), 1: away }));
    const inj = g.rows.find(r => r.id === '#13' && r.note && /^out: /.test(r.note));
    if (inj) {
        const [h, a] = inj.note.replace(/^out: /, '').split(' | ');
        const list = [h && h !== 'none' && h !== 'n/a' ? `${home}: ${h}` : null, a && a !== 'none' && a !== 'n/a' ? `${away}: ${a}` : null].filter(Boolean);
        if (list.length)
            risks.push(tt("Missing: {0}.", { 0: list.join(' · ') }));
    }
    if (friendly || g.rows.some(r => /friendly/i.test(r.name)))
        risks.push(tt("It is a friendly: coaches rotate their squads, so results are harder to predict."));
    if (p.confidence === 'low')
        risks.push(tt("One of the teams has played few games, so there is less to go on."));
    if (!risks.length)
        risks.push(tt("Nothing unusual: the teams, the form and the data all point the same way."));
    return (_jsxs("div", { className: "mt-4 rounded-2xl border border-line bg-surface2/40 p-4 sm:p-5 space-y-6", children: [_jsxs("div", { children: [_jsx("div", { className: "text-[11px] font-extrabold uppercase tracking-wide text-accent", children: tt("Why we think so") }), _jsx("p", { className: "mt-1.5 text-lg font-display font-bold text-ink leading-snug", children: ex.headline }), (() => {
                        const b = safestBet(p, home, away);
                        return b ? (_jsxs("div", { className: "mt-2.5 inline-flex flex-wrap items-center gap-2 rounded-xl border border-win/30 bg-win/10 px-3 py-2 text-sm", children: [_jsx("span", { className: "text-[10px] font-extrabold uppercase tracking-wider text-win", children: tt("Safest bet") }), _jsx("span", { className: "font-semibold text-ink", children: b.label }), _jsxs("span", { className: "num font-bold text-win", children: [b.p, "%"] }), _jsx("span", { className: "text-[11px] text-faint", children: tt("the bet we are most sure about in this match") })] })) : null;
                    })(), ex.forPick.length > 0 && (_jsxs("ul", { className: "mt-2 space-y-1 text-sm text-muted", children: [ex.forPick.map((t, i) => (_jsxs("li", { className: "flex gap-2", children: [_jsx("span", { className: "text-win mt-[1px]", children: "+" }), _jsx("span", { children: t })] }, i))), ex.against && _jsxs("li", { className: "flex gap-2", children: [_jsx("span", { className: "text-loss mt-[1px]", children: "\u2212" }), _jsxs("span", { children: [tt("On the other side:"), ' ', ex.against] })] })] }))] }), moving.length > 0 && (_jsxs(Block, { title: tt("Factor by factor"), note: tt("{0} ← → {1} · scores out of 10", { 0: home, 1: away }), children: [_jsx("ul", { className: "divide-y divide-line/50", children: moving.map(r => _jsx(Tug, { r: r, max: max, total: total, hn: home, an: away }, r.id)) }), still.length > 0 && (_jsxs("p", { className: "text-[11px] text-faint", children: [tt("Level or no data yet:"), ' ', still.map(r => labelOf(r).toLowerCase()).join(', '), "."] }))] })), _jsxs(Block, { title: tt("How it adds up"), children: [_jsxs("div", { className: "flex h-3 gap-[3px] rounded-full overflow-hidden", "aria-hidden": true, children: [_jsx("div", { className: "bg-home", style: { width: `${pts.home / 10}%` } }), _jsx("div", { className: "bg-draw", style: { width: `${pts.draw / 10}%` } }), _jsx("div", { className: "bg-away", style: { width: `${pts.away / 10}%` } })] }), _jsxs("div", { className: "text-sm text-muted space-y-1.5", children: [total > 0 && (_jsx("p", { children: tt("Adding every factor up, {0} come out ahead: {1} points of edge for {2} against {3} for {4}.", {
                                    0: forH >= forA ? home : away, 1: Math.round(forH), 2: home, 3: Math.round(forA), 4: away
                                }) })), _jsxs("p", { children: [drawBase !== null
                                        ? tt("The draw: with the goals we expect ({0} – {1}), a game like this ends level about {2}% of the time", { 0: p.expectedGoals.home, 1: p.expectedGoals.away, 2: Math.round(drawBase / 10) })
                                        : tt("The draw: from the gap between the teams"), Math.abs(Math.round(p.draw) - Math.round((drawBase ?? p.draw * 10) / 10)) >= 2
                                        ? (p.draw > (drawBase ?? 0) / 10
                                            ? tt(", and draw-prone teams, the league and a close match push it up to {0}%.", { 0: Math.round(p.draw) })
                                            : tt(", and the gap between the teams pushes it down to {0}%.", { 0: Math.round(p.draw) }))
                                        : tt(": {0}%.", { 0: Math.round(p.draw) }), ex.draw.length > 0 && _jsxs(_Fragment, { children: [" ", ex.draw.join(' ')] })] }), _jsx("p", { children: tt("The rest is split by the edge: {0}% {1}, {2}% {3}.", { 0: Math.round(p.home), 1: home, 2: Math.round(p.away), 3: away }) })] })] }), _jsx(Block, { title: tt("What could change it"), children: _jsx("ul", { className: "space-y-1.5 text-sm text-muted", children: risks.map((t, i) => (_jsxs("li", { className: "flex gap-2", children: [_jsx("span", { className: "text-draw mt-[1px]", children: "!" }), _jsx("span", { children: t })] }, i))) }) })] }));
}
