import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../lib/socket';
import { errorText } from '../lib/auth';
import { t as tt, LOCALE } from '../lib/i18n';
const fmt = (n) => (n === null || n === undefined ? '–' : n.toLocaleString(LOCALE));
const pct = (x) => (x === null || x === undefined ? '–' : `${Math.round(x)}%`);
const MODEL_NAME = { 'grid-v3': tt("Our model (v3)") };
function Card({ children, className = '' }) {
    return _jsx("div", { className: `card p-5 sm:p-6 ${className}`, children: children });
}
function Fact({ value, label }) {
    return (_jsxs("div", { className: "rounded-xl border border-line/70 bg-surface2/40 p-3.5", children: [_jsx("div", { className: "num text-xl sm:text-2xl font-extrabold text-ink", children: value }), _jsx("div", { className: "text-xs text-muted mt-0.5 leading-snug", children: label })] }));
}
function Probs({ p, pick, outcome }) {
    return (_jsx("div", { className: "flex gap-1 num text-xs", children: ['H', 'D', 'A'].map(k => (_jsx("span", { className: `w-9 text-center rounded-md py-0.5 ${k === outcome ? 'ring-1 ring-ink/40' : ''} ${pick === k ? 'bg-accent/20 text-ink font-bold' : 'text-muted'}`, title: k === 'H' ? tt("Home") : k === 'D' ? tt("Draw") : tt("Away"), children: p[k] }, k))) }));
}
export default function Past() {
    const [inv, setInv] = useState(null);
    const [seasons, setSeasons] = useState([]);
    const [season, setSeason] = useState(null);
    const [model, setModel] = useState('grid-v3');
    const [division, setDivision] = useState('');
    const [team, setTeam] = useState('');
    const [teamQ, setTeamQ] = useState('');
    const [result, setResult] = useState('');
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    useEffect(() => {
        Promise.all([axios.get(`${API_URL}/past/data`), axios.get(`${API_URL}/past/seasons`)])
            .then(([d, s]) => {
            setInv(d.data.data);
            setSeasons(s.data.data);
            if (s.data.data.length)
                setSeason(s.data.data[0].season);
        })
            .catch(e => setError(errorText(e)));
    }, []);
    // debounce the team search
    useEffect(() => {
        const t = setTimeout(() => setTeamQ(team.trim()), 350);
        return () => clearTimeout(t);
    }, [team]);
    useEffect(() => setPage(1), [season, model, division, teamQ, result]);
    useEffect(() => {
        if (!season)
            return;
        let cancelled = false;
        axios
            .get(`${API_URL}/past/predictions`, { params: { season, model, division: division || undefined, team: teamQ || undefined, result: result || undefined, page, limit: 50 } })
            .then(r => !cancelled && setData(r.data.data))
            .catch(e => !cancelled && setError(errorText(e)));
        return () => {
            cancelled = true;
        };
    }, [season, model, division, teamQ, result, page]);
    const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
    const select = 'rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent';
    return (_jsxs("div", { className: "max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink", children: tt("Past seasons") }), _jsx("p", { className: "text-sm text-muted mt-1 max-w-2xl", children: tt("What our models would have predicted on every match of the last seasons. Each prediction was made the way it is today: using only results known before that match — so these are honest tests, not hindsight.") })] }), error && _jsx("div", { className: "rounded-xl border border-loss/40 bg-loss/10 px-4 py-3 text-sm text-loss", children: error }), inv && (_jsxs(Card, { children: [_jsx("h2", { className: "font-display text-xl font-bold text-ink", children: tt("What we've collected") }), _jsxs("p", { className: "text-sm text-muted mt-0.5 mb-4", children: [tt("All the information the models learn from"), inv.trackingSince ? tt("; live tracking since {0}", { 0: new Date(inv.trackingSince).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }) }) : '', "."] }), _jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3", children: [_jsx(Fact, { value: fmt(inv.leagueMatches), label: tt("league matches · {0} leagues", { 0: inv.leagues }) }), _jsx(Fact, { value: fmt(inv.leagueTeams), label: tt("clubs") }), _jsx(Fact, { value: fmt(inv.withShots), label: tt("matches with shots & corners") }), _jsx(Fact, { value: fmt(inv.withXg), label: tt("matches with expected goals (xG) — still downloading") }), _jsx(Fact, { value: fmt(inv.lineups), label: tt("official lineups") }), _jsx(Fact, { value: fmt(inv.injuries), label: tt("injury & suspension records") }), _jsx(Fact, { value: fmt(inv.squadClubs), label: tt("clubs with monthly squad values ({0} club-months)", { 0: fmt(inv.squadMonths) }) }), _jsx(Fact, { value: fmt(inv.nationalMatches), label: tt("national-team matches{0}", { 0: inv.nationalSince ? ` since ${inv.nationalSince}` : '' }) }), _jsx(Fact, { value: fmt(inv.cupMatches), label: tt("Champions / Europa / Conference League matches") }), _jsx(Fact, { value: fmt(inv.backtestPredictions), label: tt("past predictions (tests)") }), _jsx(Fact, { value: fmt(inv.liveSettled), label: tt("live predictions already scored") })] }), inv.seasons.length > 0 && (_jsx("div", { className: "mt-4 flex flex-wrap gap-2 text-xs text-muted", children: inv.seasons.map(s => (_jsxs("span", { className: "px-2.5 py-1 rounded-full border border-line", children: [s.season, ": ", _jsx("span", { className: "num text-ink", children: fmt(s.matches) }), " ", tt("matches")] }, s.season))) }))] })), seasons.length > 0 && (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: seasons.map(s => {
                    const v3 = s.models['grid-v3'];
                    const v2 = s.models['dc-history-v2'];
                    const active = s.season === season;
                    return (_jsxs("button", { onClick: () => setSeason(s.season), className: `text-left card p-5 transition-colors ${active ? 'border-accent/60 bg-accent/5' : 'hover:border-faint'}`, children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "font-display text-lg font-bold text-ink", children: s.label }), active && _jsx("span", { className: "text-[11px] font-bold uppercase tracking-wider text-accent", children: tt("Showing") })] }), _jsxs("div", { className: "text-xs text-faint mt-0.5", children: [fmt(v3?.n ?? v2?.n), " ", tt("matches"), v3 ? tt(" · {0} leagues", { 0: v3.leagues }) : ''] }), _jsxs("div", { className: "mt-3 space-y-1.5 text-sm", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-muted", children: tt("Our model (v3)") }), _jsx("span", { className: "num font-bold text-ink", children: pct(v3?.hitRate) })] }), v3 && v3.strong60.n > 0 && (_jsx("div", { className: "pt-1.5 mt-1.5 border-t border-line/60 text-xs text-muted", children: tt("When v3 said 60%+: right {0} of {1}", { 0: pct(v3.strong60.hitRate), 1: fmt(v3.strong60.n) }) }))] })] }, s.season));
                }) })), seasons.length > 0 && _jsx("p", { className: "text-xs text-faint -mt-3", children: tt("% = how often the pick (the most likely result) was right. Click a season to browse its matches.") }), season && (_jsxs(Card, { children: [_jsxs("h2", { className: "font-display text-xl font-bold text-ink mb-4", children: [tt("Every prediction ·"), ' ', seasons.find(s => s.season === season)?.label] }), _jsxs("div", { className: "flex flex-wrap gap-2 mb-4", children: [Object.keys(MODEL_NAME).length > 1 && (_jsx("select", { value: model, onChange: e => setModel(e.target.value), className: select, children: Object.entries(MODEL_NAME).map(([k, v]) => (_jsx("option", { value: k, children: v }, k))) })), _jsxs("select", { value: division, onChange: e => setDivision(e.target.value), className: select, children: [_jsx("option", { value: "", children: tt("All leagues") }), (data?.divisions || []).map(d => (_jsx("option", { value: d.code, children: d.name }, d.code)))] }), _jsxs("select", { value: result, onChange: e => setResult(e.target.value), className: select, children: [_jsx("option", { value: "", children: tt("Right and wrong") }), _jsx("option", { value: "right", children: tt("Only right picks") }), _jsx("option", { value: "wrong", children: tt("Only wrong picks") })] }), _jsx("input", { value: team, onChange: e => setTeam(e.target.value), placeholder: tt("Search a team"), className: `${select} w-44` })] }), data && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "text-xs text-faint mb-2", children: [fmt(data.total), " ", tt("matches · numbers are Home / Draw / Away % · our pick is highlighted, the real result is outlined")] }), _jsx("div", { className: "overflow-x-auto -mx-2", children: _jsxs("table", { className: "w-full text-sm min-w-[480px]", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-left text-xs text-faint border-b border-line", children: [_jsx("th", { className: "px-2 py-2 font-medium w-8" }), _jsx("th", { className: "px-2 py-2 font-medium", children: tt("Match") }), _jsx("th", { className: "px-2 py-2 font-medium", children: tt("Our %") })] }) }), _jsxs("tbody", { children: [data.rows.map((r, i) => (_jsxs("tr", { className: "border-b border-line/50 last:border-0", children: [_jsx("td", { className: "px-2 py-2", children: _jsx("span", { className: `w-6 h-6 rounded-full grid place-items-center text-xs font-bold ${r.hit ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'}`, children: r.hit ? '✓' : '✗' }) }), _jsxs("td", { className: "px-2 py-2", children: [_jsxs("div", { className: "text-ink", children: [r.home, " ", _jsx("span", { className: "num font-semibold", children: r.score }), " ", r.away] }), _jsxs("div", { className: "text-xs text-faint", children: [new Date(r.date).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }), " \u00B7 ", r.league] })] }), _jsx("td", { className: "px-2 py-2", children: _jsx(Probs, { p: r.p, pick: r.pick, outcome: r.outcome }) })] }, `${r.date}-${r.home}-${i}`))), !data.rows.length && (_jsx("tr", { children: _jsx("td", { colSpan: 3, className: "px-2 py-8 text-center text-faint", children: tt("No matches for this filter.") }) }))] })] }) }), pages > 1 && (_jsxs("div", { className: "mt-4 flex items-center justify-between text-sm", children: [_jsx("button", { disabled: page <= 1, onClick: () => setPage(p => p - 1), className: "px-3 py-1.5 rounded-xl border border-line text-ink disabled:opacity-40", children: tt("← Newer") }), _jsx("span", { className: "text-muted num", children: tt("Page {0} of {1}", { 0: page, 1: pages }) }), _jsx("button", { disabled: page >= pages, onClick: () => setPage(p => p + 1), className: "px-3 py-1.5 rounded-xl border border-line text-ink disabled:opacity-40", children: tt("Older →") })] }))] }))] }))] }));
}
