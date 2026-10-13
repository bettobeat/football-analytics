import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../lib/socket';
import { isCovered, revealMatch, useRevealState } from '../lib/reveal';
import RecentResults from '../components/RecentResults';
import { FavStar } from '../lib/favorites';
import { t as tt, LOCALE } from '../lib/i18n';
const MAIN = ['grid-v3', 'elo-intl', 'elo-euro'];
const LIVE = new Set(['IN_PLAY', 'PAUSED', 'LIVE']);
const tn = (t) => t.shortName || t.name;
const ago = (iso) => {
    if (!iso)
        return '';
    const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return m < 60 ? tt("{0} min ago", { 0: m }) : m < 1440 ? tt("{0} h ago", { 0: Math.round(m / 60) }) : tt("{0} d ago", { 0: Math.round(m / 1440) });
};
const mainPred = (m) => m.predictions?.find(p => MAIN.includes(p.model)) || m.prediction || null;
// the years the games were played in ("2026", or "2024–25"), not the provider's season number
const editionYears = (e) => {
    const ys = e.matches.map(m => new Date(m.utcDate).getFullYear()).filter(Boolean);
    if (!ys.length)
        return e.season ? String(e.season) : '';
    const a = Math.min(...ys), b = Math.max(...ys);
    return a === b ? String(a) : `${a}–${String(b).slice(2)}`;
};
const hasPct = (p) => !!p && !p.locked && typeof p.home === 'number';
const playerHref = (s, code) => code.startsWith('AF') || s.player.id >= 1000000000
    ? `/player/${s.player.id}`
    : `/player/find?${new URLSearchParams({ name: s.player.name, team: String(s.team.id), c: code, n: s.team.name }).toString()}`;
const teamLink = (t, code) => `/team/${t.id}?${new URLSearchParams({ c: code, n: t.name }).toString()}`;
function Card({ title, action, children, className = '' }) {
    return (_jsxs("section", { className: `card p-4 sm:p-5 ${className}`, children: [_jsxs("div", { className: "flex items-center justify-between gap-3 mb-3", children: [_jsx("h2", { className: "font-display text-lg font-bold text-ink", children: title }), action] }), children] }));
}
function Crest({ team, size = 20 }) {
    return team.crest ? (_jsx("img", { src: team.crest, alt: "", width: size, height: size, className: "object-contain flex-shrink-0", style: { width: size, height: size } })) : (_jsx("span", { className: "rounded-full bg-surface2 flex-shrink-0 grid place-items-center text-[9px] text-faint", style: { width: size, height: size }, children: team.tla || tn(team).slice(0, 2).toUpperCase() }));
}
const FORM_BG = { W: 'bg-win', D: 'bg-draw', L: 'bg-loss' };
// Leagues we get from Football-Data.org (fixtures, predictions and results are filed under these codes): the
// API-Football code of the same league (from player pages) opens the main page instead
const FD_OF = { AF39: 'PL', AF40: 'ELC', AF140: 'PD', AF135: 'SA', AF78: 'BL1', AF61: 'FL1', AF88: 'DED', AF94: 'PPL', AF2: 'CL', AF71: 'BSA' };
export default function LeagueRoute() {
    const { code = '' } = useParams();
    const fd = FD_OF[code.toUpperCase()];
    if (fd)
        return _jsx(Navigate, { to: `/league/${fd}`, replace: true });
    return _jsx(League, {}, code.toUpperCase());
}
function League() {
    const { code: raw = '' } = useParams();
    const code = raw.toUpperCase();
    const [comp, setComp] = useState(null);
    const [tables, setTables] = useState(null);
    const [scorers, setScorers] = useState(null);
    const [matches, setMatches] = useState(null);
    const [record, setRecord] = useState(null);
    const [edition, setEdition] = useState(null);
    const [leaders, setLeaders] = useState('goals');
    const [news, setNews] = useState(null);
    useRevealState();
    useEffect(() => {
        let cancelled = false;
        setComp(null);
        setTables(null);
        setScorers(null);
        setMatches(null);
        setRecord(null);
        setEdition(null);
        setNews(null);
        axios
            .get(`${API_URL}/news`, { params: { league: code, limit: 12 } })
            .then(r => !cancelled && setNews(r.data.data || []))
            .catch(() => !cancelled && setNews([]));
        // competitions from our second data source: the latest played edition (a cup between editions is never empty)
        if (/^AF\d+$/.test(code)) {
            axios
                .get(`${API_URL}/leagues/${code}/results`)
                .then(r => {
                if (cancelled)
                    return;
                const d = r.data.data;
                setEdition(d);
                const c = d?.competition;
                if (c?.name)
                    setComp(prev => (prev ? { ...prev, area: prev.area || c.area } : { ...c, code }));
            })
                .catch(() => undefined);
        }
        axios
            .get(`${API_URL}/leagues/${code}/standings`)
            .then(r => {
            if (cancelled)
                return;
            setTables(r.data.data?.standings || []);
            const c = r.data.data?.competition;
            if (c?.name)
                setComp(prev => (prev ? { ...prev, area: prev.area || r.data.data?.area } : { code, name: c.name, emblem: c.emblem, area: r.data.data?.area }));
        })
            .catch(() => !cancelled && setTables([]));
        axios
            .get(`${API_URL}/leagues/${code}/scorers`, { params: { limit: 40 } })
            .then(r => !cancelled && setScorers(r.data.data?.scorers || []))
            .catch(() => !cancelled && setScorers([]));
        axios
            .get(`${API_URL}/matches/upcoming`, { params: { days: 30 } })
            .then(r => {
            if (cancelled)
                return;
            const list = (r.data.data || []).filter(m => m.competition.code === code);
            setMatches(list);
            if (list[0])
                setComp(prev => ({ ...list[0].competition, area: list[0].competition.area || prev?.area }));
        })
            .catch(() => !cancelled && setMatches([]));
        axios
            .get(`${API_URL}/public/results`, { params: { days: 365, competition: code, limit: 1 } })
            .then(r => !cancelled && setRecord(r.data.data?.record || null))
            .catch(() => undefined);
        // name and emblem for competitions with no table and no fixtures right now
        axios
            .get(`${API_URL}/leagues`)
            .then(r => {
            if (cancelled)
                return;
            const c = (r.data.data || []).find((x) => String(x.code).toUpperCase() === code);
            if (c)
                setComp(prev => (prev ? { ...prev, area: prev.area || c.area } : { code, name: c.name, emblem: c.emblem, area: c.area }));
        })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [code]);
    useEffect(() => {
        if (comp?.name)
            document.title = tt("{0} · SportLikely", { 0: comp.name });
    }, [comp]);
    const totals = useMemo(() => {
        if (!tables)
            return [];
        const t = tables.filter(x => x.type === 'TOTAL');
        return t.length ? t : tables;
    }, [tables]);
    const top = useMemo(() => {
        if (!scorers)
            return [];
        const key = leaders === 'goals' ? 'goals' : 'assists';
        const other = leaders === 'goals' ? 'assists' : 'goals';
        return [...scorers].filter(s => (s[key] || 0) > 0).sort((a, b) => (b[key] || 0) - (a[key] || 0) || (b[other] || 0) - (a[other] || 0)).slice(0, 15);
    }, [scorers, leaders]);
    const hasForm = totals.some(t => t.table.some(r => r.form));
    const upcoming = (matches || []).filter(m => !LIVE.has(m.status) && !['FINISHED', 'AWARDED', 'CANCELLED'].includes(m.status)).slice(0, 12);
    const live = (matches || []).filter(m => LIVE.has(m.status));
    return (_jsxs("div", { className: "max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6", children: [_jsxs("section", { className: "card relative overflow-hidden p-5 sm:p-7", children: [_jsx("div", { className: "pointer-events-none absolute inset-0 opacity-[0.12]", style: { background: 'radial-gradient(600px 220px at 10% 0%, rgb(var(--accent)), transparent 70%)' } }), _jsxs("div", { className: "relative flex flex-wrap items-center gap-5", children: [_jsx("span", { className: "w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/90 grid place-items-center flex-shrink-0 p-2", children: comp?.emblem ? _jsx("img", { src: comp.emblem, alt: "", className: "w-full h-full object-contain" }) : _jsx("span", { className: "text-2xl", children: "\uD83C\uDFC6" }) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex items-center gap-2 text-xs text-faint", children: [comp?.area?.flag && _jsx("img", { src: comp.area.flag, alt: "", className: "w-4 h-3 object-cover rounded-[2px]" }), _jsx("span", { children: comp?.area?.name || tt("League") })] }), _jsx("h1", { className: "font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink truncate", children: comp?.name || code }), comp?.name && code && (_jsx(FavStar, { label: true, className: "mt-2", fav: { kind: 'league', ref: code, code, name: comp.name, img: comp.emblem || null } }))] }), record && record.hitRate !== null && record.n > 0 && (_jsx("div", { className: "flex gap-3", children: _jsxs("div", { className: "glass px-4 py-3 text-center", children: [_jsx("div", { className: "text-[11px] text-faint", children: tt("Our picks right") }), _jsxs("div", { className: "font-display text-2xl font-extrabold text-accent num", children: [Math.round(record.hitRate), "%"] }), _jsxs("div", { className: "text-[10px] text-faint num", children: [record.n, " ", tt("games · 12 months")] })] }) }))] })] }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start", children: [_jsxs("div", { className: "space-y-6 min-w-0", children: [_jsx(Card, { title: tt("Table"), children: !tables ? (_jsx("div", { className: "space-y-2", children: Array.from({ length: 8 }).map((_, i) => _jsx("div", { className: "h-7 rounded-lg bg-surface2/60 animate-pulse" }, i)) })) : totals.length === 0 ? (_jsx("p", { className: "text-sm text-faint", children: tt("No league table here: it's a knockout cup, friendlies, or a tournament that isn't on right now.") })) : (_jsx("div", { className: "space-y-5", children: totals.map((t, i) => (_jsxs("div", { className: "overflow-x-auto", children: [t.group && totals.length > 1 && _jsx("div", { className: "label pb-2", children: t.group.replace(/_/g, ' ') }), _jsxs("table", { className: "w-full text-sm min-w-[520px]", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-[11px] text-faint", children: [_jsx("th", { className: "text-left font-medium py-1.5 pl-2 w-8", children: "#" }), _jsx("th", { className: "text-left font-medium py-1.5", children: tt("Team") }), _jsx("th", { className: "text-right font-medium py-1.5 num w-9", children: "P" }), _jsx("th", { className: "text-right font-medium py-1.5 num w-9", children: "W" }), _jsx("th", { className: "text-right font-medium py-1.5 num w-9", children: "D" }), _jsx("th", { className: "text-right font-medium py-1.5 num w-9", children: "L" }), _jsx("th", { className: "text-right font-medium py-1.5 num w-16 hidden sm:table-cell", children: tt("Goals") }), _jsx("th", { className: "text-right font-medium py-1.5 num w-10", children: tt("GD") }), _jsx("th", { className: "text-right font-medium py-1.5 num w-10 pr-2", children: tt("Pts") }), hasForm && _jsx("th", { className: "text-center font-medium py-1.5 w-[104px] hidden md:table-cell", title: tt("Last 5 league games, latest on the right"), children: tt("Form") })] }) }), _jsx("tbody", { children: t.table.map(r => (_jsxs("tr", { className: "border-t border-line/50 hover:bg-surface2/40", children: [_jsx("td", { className: "py-2 pl-2 num text-faint", children: r.position }), _jsx("td", { className: "py-2", children: _jsxs(Link, { to: teamLink(r.team, code), className: "flex items-center gap-2 min-w-0 hover:text-accent", children: [_jsx(Crest, { team: r.team }), _jsx("span", { className: "truncate font-medium text-ink", children: tn(r.team) })] }) }), _jsx("td", { className: "py-2 text-right num text-muted", children: r.playedGames }), _jsx("td", { className: "py-2 text-right num text-muted", children: r.won }), _jsx("td", { className: "py-2 text-right num text-muted", children: r.draw }), _jsx("td", { className: "py-2 text-right num text-muted", children: r.lost }), _jsxs("td", { className: "py-2 text-right num text-muted hidden sm:table-cell", children: [r.goalsFor ?? '–', ":", r.goalsAgainst ?? '–'] }), _jsxs("td", { className: `py-2 text-right num ${r.goalDifference > 0 ? 'text-win' : r.goalDifference < 0 ? 'text-loss' : 'text-muted'}`, children: [r.goalDifference > 0 ? '+' : '', r.goalDifference] }), _jsx("td", { className: "py-2 pr-2 text-right num font-bold text-ink", children: r.points }), hasForm && _jsx("td", { className: "py-2 hidden md:table-cell", children: _jsx("span", { className: "flex justify-center gap-1", children: String(r.form || '')
                                                                            .split(/[,\s]*/)
                                                                            .filter(x => FORM_BG[x])
                                                                            // both providers list the newest result first: show the last 5 with the newest on the right
                                                                            .slice(0, 5)
                                                                            .reverse()
                                                                            .map((x, j) => (_jsx("span", { className: `w-4 h-4 rounded-[4px] grid place-items-center text-[9px] font-extrabold text-bg ${FORM_BG[x]}`, children: x }, j))) }) })] }, r.team.id))) })] })] }, i))) })) }), _jsx(Card, { title: leaders === 'goals' ? tt("Top scorers") : tt("Top assists"), action: _jsx("div", { className: "seg", children: ['goals', 'assists'].map(k => (_jsx("button", { onClick: () => setLeaders(k), className: `seg-btn ${leaders === k ? 'seg-btn-active' : ''}`, children: k === 'goals' ? 'Goals' : 'Assists' }, k))) }), children: !scorers ? (_jsx("div", { className: "space-y-2", children: Array.from({ length: 5 }).map((_, i) => _jsx("div", { className: "h-8 rounded-lg bg-surface2/60 animate-pulse" }, i)) })) : top.length === 0 ? (_jsx("p", { className: "text-sm text-faint", children: tt("No data yet this season.") })) : (_jsxs("ol", { className: "space-y-1", children: [top.map((s, i) => {
                                            const v = leaders === 'goals' ? s.goals || 0 : s.assists || 0;
                                            const max = leaders === 'goals' ? top[0].goals || 1 : top[0].assists || 1;
                                            return (_jsxs("li", { className: "flex items-center gap-3 py-1.5", children: [_jsx("span", { className: "w-5 text-xs num text-faint text-right", children: i + 1 }), _jsx(Crest, { team: s.team, size: 22 }), _jsxs("span", { className: "min-w-0 flex-1", children: [_jsx(Link, { to: playerHref(s, code), className: "block text-sm font-semibold text-ink truncate hover:text-accent", children: s.player.name }), _jsx("span", { className: "block h-1.5 mt-1 rounded-full bg-surface2", children: _jsx("span", { className: "block h-full rounded-full bg-accent", style: { width: `${(v / max) * 100}%` } }) })] }), _jsx("span", { className: "text-[11px] text-faint w-28 truncate text-right hidden sm:block", children: tn(s.team) }), _jsx("span", { className: "font-display font-bold text-ink num w-6 text-right", children: v })] }, s.player.id));
                                        }), leaders === 'assists' && _jsx("li", { className: "text-[10px] text-faint pt-1", children: tt("Assists among the league's top-40 scorers list.") })] })) })] }), _jsxs("div", { className: "space-y-6 min-w-0", children: [live.length > 0 && (_jsx(Card, { title: tt("Live now"), children: _jsx("ul", { className: "space-y-1", children: live.map(m => (_jsx("li", { children: _jsxs(Link, { to: `/match/${m.id}`, className: "flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface2/60 text-sm", children: [_jsx("span", { className: "w-2 h-2 rounded-full bg-live animate-pulseDot" }), _jsxs("span", { className: "truncate flex-1 font-semibold", children: [tn(m.homeTeam), " \u2013 ", tn(m.awayTeam)] })] }) }, m.id))) }) })), _jsx(Card, { title: tt("Next fixtures"), action: _jsx(Link, { to: `/matches?league=${code}`, className: "text-xs font-bold text-accent", children: "All \u2192" }), children: !matches ? (_jsx("div", { className: "space-y-2", children: Array.from({ length: 4 }).map((_, i) => _jsx("div", { className: "h-12 rounded-xl bg-surface2/60 animate-pulse" }, i)) })) : upcoming.length === 0 ? (_jsx("p", { className: "text-sm text-faint", children: tt("No fixtures in the next 30 days.") })) : (_jsx("ul", { className: "max-h-[430px] overflow-y-auto overscroll-contain pr-1 space-y-1", children: upcoming.map(m => (_jsx("li", { children: _jsx(FixtureRow, { m: m }) }, m.id))) })) }), _jsx(Card, { title: tt("{0} news", { 0: comp?.name || tt("League") }), children: !news ? (_jsx("div", { className: "space-y-2", children: Array.from({ length: 3 }).map((_, i) => _jsx("div", { className: "h-16 rounded-xl bg-surface2/60 animate-pulse" }, i)) })) : news.length === 0 ? (_jsx("p", { className: "text-sm text-faint", children: tt("No news about this league in the last two weeks.") })) : (_jsx("ul", { className: "max-h-[520px] overflow-y-auto overscroll-contain pr-1 space-y-1", children: news.map(n => (_jsx("li", { children: _jsxs("a", { href: n.link, target: "_blank", rel: "noreferrer", className: "flex gap-3 p-2 rounded-xl hover:bg-surface2/60 transition-colors", children: [_jsx("span", { className: "w-20 h-14 rounded-lg overflow-hidden bg-surface2 flex-shrink-0 grid place-items-center", children: n.image ? (_jsx("img", { src: n.image, alt: "", loading: "lazy", className: "w-full h-full object-cover", onError: e => { e.currentTarget.style.display = 'none'; } })) : (_jsx("span", { className: "text-[9px] font-extrabold uppercase tracking-wide text-faint px-1 text-center", children: n.source })) }), _jsxs("span", { className: "min-w-0 flex flex-col gap-1", children: [_jsx("span", { className: "text-[13px] font-bold leading-snug text-ink line-clamp-2", children: n.title }), _jsxs("span", { className: "text-[11px] text-faint", children: [n.source, n.published ? ` · ${ago(n.published)}` : ''] })] })] }) }, n.link))) })) }), edition && edition.matches.length > 0 && (_jsx(Card, { title: tt("Latest edition{0}", { 0: editionYears(edition) ? ` · ${editionYears(edition)}` : '' }), action: edition.winner ? (_jsxs("span", { className: "inline-flex items-center gap-1.5 text-xs font-bold text-ink", children: [_jsx("span", { "aria-hidden": true, children: "\uD83C\uDFC6" }), edition.winner.crest && _jsx("img", { src: edition.winner.crest, alt: "", className: "w-4 h-4 object-contain" }), tn(edition.winner)] })) : undefined, children: _jsx("ul", { className: "max-h-[430px] overflow-y-auto overscroll-contain pr-1 divide-y divide-line/50", children: edition.matches.map(m => {
                                        const ft = m.score?.fullTime;
                                        return (_jsx("li", { children: _jsxs(Link, { to: `/match/${m.id}`, className: "flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface2/60 text-sm", children: [_jsx("span", { className: "w-14 text-[11px] text-faint", children: new Date(m.utcDate).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }) }), _jsxs("span", { className: "flex-1 min-w-0", children: [_jsxs("span", { className: "block truncate", children: [_jsx("span", { className: "text-ink font-semibold", children: tn(m.homeTeam) }), " ", _jsxs("span", { className: "num font-bold text-ink", children: [ft?.home ?? '–', "\u2013", ft?.away ?? '–'] }), " ", _jsx("span", { className: "text-ink font-semibold", children: tn(m.awayTeam) })] }), _jsxs("span", { className: "block text-[11px] text-faint truncate", children: [m.round, m.penalties ? tt(" · pens {0}–{1}", { 0: m.penalties.home, 1: m.penalties.away }) : ''] })] })] }) }, m.id));
                                    }) }) })), _jsx("section", { className: "card p-3", children: _jsx(RecentResults, { code: code, limit: 50, days: 120, compact: true, large: true, listClass: "max-h-[430px] overflow-y-auto overscroll-contain pr-1" }) })] })] })] }));
}
function FixtureRow({ m }) {
    const p = mainPred(m);
    const pct = hasPct(p);
    const covered = pct && isCovered(m.id, m.status, true);
    const k = p ? p.pick || (pct ? (p.home >= p.draw && p.home >= p.away ? 'H' : p.away >= p.draw ? 'A' : 'D') : null) : null;
    const name = k === 'H' ? tn(m.homeTeam) : k === 'A' ? tn(m.awayTeam) : k === 'D' ? 'Draw' : null;
    const color = k === 'H' ? 'text-home' : k === 'A' ? 'text-away' : 'text-draw';
    const val = pct && k ? (k === 'H' ? p.home : k === 'A' ? p.away : p.draw) : null;
    return (_jsxs(Link, { to: `/match/${m.id}`, className: "flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface2/60 transition-colors", children: [_jsxs("span", { className: "w-12 flex-shrink-0 text-center", children: [_jsx("span", { className: "block text-[10px] text-faint", children: new Date(m.utcDate).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric' }) }), _jsx("span", { className: "block text-xs font-bold text-ink num", children: new Date(m.utcDate).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) })] }), _jsxs("span", { className: "min-w-0 flex-1 space-y-1", children: [_jsxs("span", { className: "flex items-center gap-2 text-sm", children: [_jsx(Crest, { team: m.homeTeam, size: 16 }), _jsx("span", { className: "truncate text-ink", children: tn(m.homeTeam) })] }), _jsxs("span", { className: "flex items-center gap-2 text-sm", children: [_jsx(Crest, { team: m.awayTeam, size: 16 }), _jsx("span", { className: "truncate text-ink", children: tn(m.awayTeam) })] })] }), _jsx("span", { className: "flex-shrink-0 text-right w-24", children: covered ? (_jsx("button", { onClick: e => {
                        e.preventDefault();
                        revealMatch(m.id);
                    }, className: "text-[11px] font-bold text-bg bg-accent px-2.5 py-1 rounded-full", children: tt("Reveal") })) : name ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "block text-[10px] text-faint", children: tt("Pick") }), _jsxs("span", { className: `block text-xs font-bold truncate ${color}`, children: [name, val !== null && _jsxs("span", { className: "num", children: [" ", Math.round(val), "%"] })] })] })) : (_jsx("span", { className: "text-[11px] text-faint", children: "\u2013" })) })] }));
}
