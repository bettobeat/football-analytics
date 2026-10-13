import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { useReveal, justRevealed } from '../lib/reveal';
import CountUp from '../components/CountUp';
import { fame } from '../lib/fame';
import RecentResults from '../components/RecentResults';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API_URL, socket } from '../lib/socket';
import { pickOfPrediction } from '../lib/predict';
import { useFavorites } from '../lib/favorites';
import LeagueSidebar, { MobileLeagueBar, LeagueBar } from '../components/LeagueSidebar';
import { footballCountry, leagueShortName } from '../lib/leagueCountry';
import { t as tt, LOCALE } from '../lib/i18n';
import { useAuth } from '../lib/auth';
/** Pinned in the league menu until the visitor stars leagues of their own. */
const DEFAULT_PINNED = ['PL', 'PD', 'BL1', 'SA', 'FL1', 'CL'];
export const LIVE = new Set(['IN_PLAY', 'PAUSED']);
export const ENDED = new Set(['FINISHED', 'AWARDED', 'CANCELLED']);
const DAY_OPTIONS = [3, 7, 14, 30];
const PICK_COLOR = { H: 'text-home', D: 'text-draw', A: 'text-away' };
const PICK_BG = { H: 'bg-home', D: 'bg-draw', A: 'bg-away' };
export function dayKey(iso) {
    const d = new Date(iso);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
export function dayLabel(ts) {
    const today = dayKey(new Date().toISOString());
    const diff = Math.round((ts - today) / 86400000);
    if (diff === 0)
        return tt('Today');
    if (diff === 1)
        return tt('Tomorrow');
    return new Date(ts).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'short' });
}
function kickoff(iso) {
    return new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
}
function pickOf(p) {
    return pickOfPrediction(p);
}
function LockIcon() {
    return (_jsxs("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [_jsx("rect", { x: "4", y: "11", width: "16", height: "10", rx: "2" }), _jsx("path", { d: "M8 11V7a4 4 0 0 1 8 0v4" })] }));
}
function Dashboard() {
    const [matches, setMatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // opened on one league (search, shared link): show its whole month, so the list is never empty between rounds
    const [days, setDays] = useState(() => (new URLSearchParams(window.location.search).get('league') ? 30 : 7));
    const [params, setParams] = useSearchParams();
    const [league, setLeagueState] = useState(params.get('league') || 'ALL');
    // the league is kept in the address (?league=PL), so search results and shared links open the right league
    const setLeague = (code) => {
        setLeagueState(code);
        setParams(code === 'ALL' ? {} : { league: code }, { replace: true });
    };
    useEffect(() => {
        const fromUrl = params.get('league') || 'ALL';
        if (fromUrl !== league) {
            setLeagueState(fromUrl);
            if (fromUrl !== 'ALL')
                setDays(30);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params]);
    useEffect(() => {
        let cancelled = false;
        const load = (initial) => {
            if (initial)
                setLoading(true);
            axios
                .get(`${API_URL}/matches/upcoming`, { params: { days: 30 } })
                .then(res => {
                if (cancelled)
                    return;
                setMatches(res.data.data || []);
                setError(null);
            })
                .catch(err => {
                if (!cancelled && initial)
                    setError(err.response?.data?.message || err.message);
            })
                .finally(() => {
                if (!cancelled)
                    setLoading(false);
            });
        };
        load(true);
        const timer = setInterval(() => load(false), 5 * 60 * 1000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, []);
    useEffect(() => {
        const onLive = (payload) => {
            const live = new Map(payload.data.map(m => [m.id, m]));
            if (live.size === 0)
                return;
            // the live feed carries the pick only for $15 Premium: keep a prediction this user already unlocked
            setMatches(prev => prev.map(m => {
                const n = live.get(m.id);
                if (!n)
                    return m;
                return n.prediction?.locked && m.prediction && !m.prediction.locked ? { ...n, prediction: m.prediction } : n;
            }));
        };
        socket.on('matches:live', onLive);
        return () => {
            socket.off('matches:live', onLive);
        };
    }, []);
    const competitions = useMemo(() => {
        const map = new Map();
        matches.forEach(m => map.set(m.competition.code, m.competition));
        return Array.from(map.values())
            .map(c => ({ ...c, rank: c.rank ?? (c.code === 'CL' ? 1 : 0) }))
            .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.name.localeCompare(b.name));
    }, [matches]);
    const { list: favList, reasons } = useFavorites();
    const favMode = league === 'FAV';
    const visible = useMemo(() => {
        const cutoff = Date.now() + days * 86400000;
        return matches.filter(m => new Date(m.utcDate).getTime() <= cutoff && (league === 'ALL' || (favMode ? reasons(m).length > 0 : m.competition.code === league)));
    }, [matches, league, days, favMode, reasons]);
    // favorites first: their next games on top of the full list
    const favUpcoming = useMemo(() => league !== 'ALL'
        ? []
        : matches
            .filter(m => !LIVE.has(m.status) && !ENDED.has(m.status) && new Date(m.utcDate).getTime() <= Date.now() + days * 86400000 && reasons(m).length > 0)
            .sort((a, b) => a.utcDate.localeCompare(b.utcDate))
            .slice(0, 8), [matches, league, days, reasons]);
    const favCount = useMemo(() => matches.filter(m => reasons(m).length > 0).length, [matches, reasons]);
    // Live box: on a league page, that league's live games only; other leagues' games only when it has none (Yarin, 10 Oct)
    const liveAll = matches.filter(m => LIVE.has(m.status));
    const liveOwn = league === 'ALL' || favMode ? [] : liveAll.filter(m => m.competition.code === league);
    const live = liveOwn.length ? liveOwn : liveAll;
    const liveOther = league !== 'ALL' && !favMode && !liveOwn.length && liveAll.length > 0;
    // finished / cancelled games leave the list (they are in Latest results); live ones have their own row
    const upcoming = visible.filter(m => !LIVE.has(m.status) && !ENDED.has(m.status));
    // Spotlight: the three biggest games of the coming days — big clubs first, then model strength
    const spotlight = useMemo(() => {
        if (favMode)
            return [];
        const soon = Date.now() + 4 * 86400000;
        return upcoming
            .filter(m => new Date(m.utcDate).getTime() <= soon)
            .map(m => {
            const fh = fame(m.homeTeam);
            const fa = fame(m.awayTeam);
            // the biggest club decides, the opponent adds a little; model strength only breaks ties
            const f = Math.max(fh, fa) + 0.4 * Math.min(fh, fa);
            const s = m.prediction?.factors ? (m.prediction.factors.homeAttack + m.prediction.factors.awayAttack) / 20 : 0;
            return { m, s: f + s };
        })
            .sort((a, b) => b.s - a.s)
            .slice(0, 3)
            .map(x => x.m);
    }, [upcoming, favMode]);
    const spotlightIds = useMemo(() => new Set(spotlight.map(m => m.id)), [spotlight]);
    // Day lists never repeat a Spotlight match
    const grouped = useMemo(() => {
        const groups = new Map();
        upcoming
            .filter(m => !spotlightIds.has(m.id))
            .forEach(m => {
            const k = dayKey(m.utcDate);
            groups.set(k, [...(groups.get(k) || []), m]);
        });
        return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
    }, [upcoming, spotlightIds]);
    const side = {
        leagues: competitions.map(c => ({
            code: c.code, name: c.name, short: leagueShortName(c.name), logo: c.emblem || null, country: footballCountry(c),
            count: matches.filter(m => m.competition.code === c.code).length,
            fav: { kind: 'league', ref: c.code, code: c.code, name: c.name, img: c.emblem || null }
        })),
        selected: league,
        onSelect: setLeague,
        pinned: (() => {
            const mine = favList.filter(f => f.kind === 'league').map(f => f.code || f.ref).filter(c => competitions.some(x => x.code === c));
            return mine.length ? mine : DEFAULT_PINNED.filter(c => competitions.some(x => x.code === c));
        })(),
        teams: favList.filter(f => f.kind === 'team').map(f => ({ key: f.ref, name: f.name, logo: f.img || null, to: f.ids?.[0] ? `/team/${f.ids[0]}?${new URLSearchParams({ n: f.name }).toString()}` : '/favorites' })),
        total: matches.length,
        favCount: favList.length ? favCount : null,
        addTeamTo: '/favorites'
    };
    return (_jsx("div", { className: `max-w-[1400px] mx-auto px-4 sm:px-6 py-6 lg:py-8 ${league === 'ALL' ? '2xl:max-w-[1760px]' : ''}`, children: _jsxs("div", { className: `grid grid-cols-1 gap-6 lg:gap-8 items-start ${league === 'ALL' ? 'lg:grid-cols-[250px_1fr] 2xl:grid-cols-[250px_1fr_340px]' : favMode ? 'lg:grid-cols-[250px_1fr]' : 'lg:grid-cols-[250px_1fr] xl:grid-cols-[250px_1fr_320px]'}`, children: [_jsxs("aside", { className: "hidden lg:flex lg:sticky lg:top-20 flex-col gap-6 lg:max-h-[calc(100vh-6.5rem)]", children: [_jsxs("section", { className: "card p-4 shrink-0", children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsxs("h2", { className: "font-display font-bold text-ink flex items-center gap-2", children: [_jsx("span", { className: `w-2 h-2 rounded-full ${live.length ? 'bg-live animate-pulseDot' : 'bg-faint'}` }), tt("Live")] }), _jsx("span", { className: "num text-xs text-faint", children: live.length })] }), live.length === 0 ? (_jsx("p", { className: "text-xs text-faint", children: tt("No matches in play right now.") })) : liveOther ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "text-[11px] text-faint mb-2", children: tt("Nothing in play in this league. Live elsewhere:") }), _jsx("ul", { className: "space-y-1 max-h-60 overflow-y-auto", children: live.map(m => (_jsx("li", { children: _jsx(LiveRow, { match: m }) }, m.id))) })] })) : (_jsx("ul", { className: "space-y-1 max-h-60 overflow-y-auto", children: live.map(m => (_jsx("li", { children: _jsx(LiveRow, { match: m }) }, m.id))) }))] }), _jsx(LeagueSidebar, { ...side }), league === 'ALL' && (_jsx("section", { className: "card p-3 hidden lg:block 2xl:hidden shrink-0", children: _jsx(RecentResults, { limit: 6, compact: true }) }))] }), _jsxs("div", { className: "min-w-0", children: [_jsx(MobileLeagueBar, { side: side, liveCount: live.length, live: live.map(m => _jsx(LiveRow, { match: m }, m.id)) }), _jsxs("div", { className: "flex flex-wrap items-end justify-between gap-4 mb-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink", children: league === 'ALL' ? tt("Matches") : favMode ? tt("My favorites") : competitions.find(c => c.code === league)?.name || tt("Matches") }), _jsxs("p", { className: "mt-1 text-sm text-muted", children: [tt("{0} fixtures in the next {1} days", { 0: upcoming.length, 1: days }), league !== 'ALL' && !favMode && (_jsx(Link, { to: `/league/${league}`, className: "ml-3 font-bold text-accent", children: tt("League page →") }))] })] }), _jsx("div", { className: "seg", children: DAY_OPTIONS.map(d => (_jsxs("button", { onClick: () => setDays(d), className: `seg-btn ${days === d ? 'seg-btn-active' : ''}`, children: [d, "d"] }, d))) })] }), loading && (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4", children: Array.from({ length: 6 }).map((_, i) => (_jsx("div", { className: "card h-44 animate-pulse bg-surface2/60" }, i))) })), error && _jsxs("div", { className: "card p-5 border-loss/40 text-loss", children: [tt("Failed to load matches:"), ' ', error] }), !loading && !error && upcoming.length === 0 && (favMode && !favList.length ? (_jsxs("div", { className: "card p-10 text-center space-y-3", children: [_jsx("p", { className: "text-ink font-semibold", children: tt("You have no favorites yet.") }), _jsx("p", { className: "text-sm text-muted max-w-md mx-auto", children: tt("Tap the star next to a league here, or on any team, league or player page. Their games then show up in this list.") }), _jsx(Link, { to: "/favorites", className: "inline-block text-sm font-bold text-accent", children: tt("Manage favorites →") })] })) : (_jsx("div", { className: "card p-12 text-center text-muted", children: favMode ? tt("None of your favorites play in this period.") : tt("No matches for this selection.") }))), !loading && favUpcoming.length > 0 && (_jsxs("section", { className: "mb-8", children: [_jsx(SectionTitle, { label: tt("Your favorites"), sub: tt("their next games") }), _jsx("div", { className: "card overflow-hidden border-accent/25 divide-y divide-line/50", children: favUpcoming.map(m => (_jsx(MatchRow, { match: m, showComp: true, showDay: true }, m.id))) }), _jsx("button", { type: "button", onClick: () => setLeague('FAV'), className: "mt-2 text-xs font-bold text-accent", children: tt("Show only my favorites →") })] })), !loading && spotlight.length > 0 && (_jsxs("section", { className: "mb-8", children: [_jsx(SectionTitle, { label: tt("Spotlight"), sub: tt("the biggest games of the coming days") }), _jsx("div", { className: "card overflow-hidden border-accent/25 divide-y divide-line/50", children: spotlight.map(m => (_jsx(MatchRow, { match: m, showComp: true, showDay: true }, m.id))) })] })), !loading &&
                            grouped.map(([ts, dayMatches]) => (_jsxs("section", { className: "mb-6", children: [_jsx(SectionTitle, { label: dayLabel(ts), count: dayMatches.length, sticky: true }), _jsx("div", { className: "space-y-2", children: byCompetition(dayMatches).map(([comp, list]) => (_jsxs("div", { className: "card overflow-hidden", children: [_jsx(LeagueBar, { country: footballCountry(comp), name: leagueShortName(comp.name), logo: comp.emblem, to: `/league/${comp.code}`, count: list.length }), _jsx("div", { className: "divide-y divide-line/40", children: list.map(m => (_jsx(MatchRow, { match: m }, m.id))) })] }, comp.code))) })] }, ts)))] }), league !== 'ALL' && !favMode && _jsx(LeaguePanel, { code: league }), league === 'ALL' && (_jsx("aside", { className: "hidden 2xl:block 2xl:sticky 2xl:top-20", children: _jsx("section", { className: "card p-3 max-h-[calc(100vh-6.5rem)] overflow-y-auto", children: _jsx(RecentResults, { limit: 40 }) }) }))] }) }));
}
function LeaguePanel({ code }) {
    const [tables, setTables] = useState([]);
    const [scorers, setScorers] = useState([]);
    const [tab, setTab] = useState('table');
    const [error, setError] = useState(null);
    useEffect(() => {
        let cancelled = false;
        setError(null);
        Promise.all([axios.get(`${API_URL}/leagues/${code}/standings`), axios.get(`${API_URL}/leagues/${code}/scorers`, { params: { limit: 40 } })])
            .then(([st, sc]) => {
            if (cancelled)
                return;
            setTables(st.data.data?.standings || []);
            setScorers(sc.data.data?.scorers || []);
        })
            .catch(err => !cancelled && setError(err.response?.data?.message || err.message));
        return () => {
            cancelled = true;
        };
    }, [code]);
    const totals = tables.filter(t => t.type === 'TOTAL');
    const topScorers = [...scorers].sort((a, b) => (b.goals || 0) - (a.goals || 0) || (b.assists || 0) - (a.assists || 0)).slice(0, 15);
    const topAssists = [...scorers].filter(s => (s.assists || 0) > 0).sort((a, b) => (b.assists || 0) - (a.assists || 0) || (b.goals || 0) - (a.goals || 0)).slice(0, 15);
    return (_jsxs("aside", { className: "xl:sticky xl:top-20 space-y-4", children: [_jsx("div", { className: "seg w-full", children: ['table', 'results', 'scorers', 'assists'].map(t => (_jsx("button", { onClick: () => setTab(t), className: `seg-btn flex-1 ${tab === t ? 'seg-btn-active' : ''}`, children: t === 'table' ? tt("Table") : t === 'results' ? tt("Results") : t === 'scorers' ? tt("Scorers") : tt("Assists") }, t))) }), error && _jsx("div", { className: "card p-4 text-xs text-loss", children: error }), tab === 'table' &&
                (totals.length ? totals : tables).map((t, i) => (_jsxs("section", { className: "card p-3", children: [t.group && _jsx("div", { className: "label px-1 pb-2", children: t.group.replace(/_/g, ' ') }), _jsxs("table", { className: "w-full text-xs", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-faint", children: [_jsx("th", { className: "text-left font-medium py-1 pl-1 w-6", children: "#" }), _jsx("th", { className: "text-left font-medium py-1", children: tt("Team") }), _jsx("th", { className: "text-right font-medium py-1 num", children: "P" }), _jsx("th", { className: "text-right font-medium py-1 num", children: tt("GD") }), _jsx("th", { className: "text-right font-medium py-1 pr-1 num", children: tt("Pts") })] }) }), _jsx("tbody", { children: t.table.map(r => (_jsxs("tr", { className: "border-t border-line/50", children: [_jsx("td", { className: "py-1.5 pl-1 num text-faint", children: r.position }), _jsx("td", { className: "py-1.5", children: _jsxs("span", { className: "flex items-center gap-2 min-w-0", children: [_jsx(Crest, { team: r.team, size: 16 }), _jsx("span", { className: "truncate text-ink", children: r.team.shortName || r.team.name })] }) }), _jsx("td", { className: "py-1.5 text-right num text-muted", children: r.playedGames }), _jsxs("td", { className: `py-1.5 text-right num ${r.goalDifference > 0 ? 'text-win' : r.goalDifference < 0 ? 'text-loss' : 'text-muted'}`, children: [r.goalDifference > 0 ? '+' : '', r.goalDifference] }), _jsx("td", { className: "py-1.5 pr-1 text-right num font-bold text-ink", children: r.points })] }, r.team.id))) })] })] }, i))), tab === 'results' && (_jsx("section", { className: "card p-3", children: _jsx(RecentResults, { code: code, limit: 30, days: 60 }) })), (tab === 'scorers' || tab === 'assists') && (_jsxs("section", { className: "card p-3", children: [_jsxs("table", { className: "w-full text-xs", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-faint", children: [_jsx("th", { className: "text-left font-medium py-1 pl-1 w-6", children: "#" }), _jsx("th", { className: "text-left font-medium py-1", children: tt("Player") }), _jsx("th", { className: "text-right font-medium py-1 num", children: tab === 'scorers' ? 'G' : 'A' }), _jsx("th", { className: "text-right font-medium py-1 pr-1 num", children: tab === 'scorers' ? 'A' : 'G' })] }) }), _jsxs("tbody", { children: [(tab === 'scorers' ? topScorers : topAssists).map((sc, i) => (_jsxs("tr", { className: "border-t border-line/50", children: [_jsx("td", { className: "py-1.5 pl-1 num text-faint", children: i + 1 }), _jsx("td", { className: "py-1.5", children: _jsxs("span", { className: "flex items-center gap-2 min-w-0", children: [_jsx(Crest, { team: sc.team, size: 16 }), _jsxs("span", { className: "min-w-0", children: [_jsx("span", { className: "block truncate text-ink", children: sc.player.name }), _jsx("span", { className: "block truncate text-[10px] text-faint", children: sc.team.shortName || sc.team.name })] })] }) }), _jsx("td", { className: "py-1.5 text-right num font-bold text-ink", children: tab === 'scorers' ? sc.goals ?? 0 : sc.assists ?? 0 }), _jsx("td", { className: "py-1.5 pr-1 text-right num text-muted", children: tab === 'scorers' ? sc.assists ?? 0 : sc.goals ?? 0 })] }, sc.player.id))), (tab === 'scorers' ? topScorers : topAssists).length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 4, className: "py-4 text-center text-faint", children: tt("No data yet this season.") }) }))] })] }), tab === 'assists' && _jsx("p", { className: "text-[10px] text-faint mt-2 px-1", children: tt("Assists from the top-40 scorers list.") })] }))] }));
}
/* ---------- pieces ---------- */
export function SectionTitle({ label, sub, count, accent, sticky }) {
    return (_jsxs("div", { className: `flex items-baseline gap-3 mb-3 ${sticky ? 'sticky top-[113px] sm:top-16 z-30 py-2 -my-2 bg-bg/35 backdrop-blur-lg' : ''}`, children: [_jsxs("h2", { className: `font-display text-lg font-bold tracking-tight ${accent === 'live' ? 'text-live' : 'text-ink'}`, children: [accent === 'live' && _jsx("span", { className: "inline-block w-2 h-2 rounded-full bg-live animate-pulseDot mr-2 align-middle" }), label] }), count !== undefined && _jsxs("span", { className: "num text-xs text-faint", children: [count, " ", tt("matches")] }), sub && _jsx("span", { className: "text-xs text-faint", children: sub })] }));
}
function LiveRow({ match }) {
    const ft = match.score?.fullTime;
    return (_jsxs(Link, { to: `/match/${match.id}`, className: "block rounded-xl px-2 py-2 hover:bg-surface2 transition-colors", children: [_jsxs("div", { className: "flex items-center justify-between text-[10px] text-faint mb-1", children: [_jsx("span", { className: "truncate", children: match.competition.name }), _jsx("span", { className: "font-bold text-live tracking-wider", children: match.status === 'PAUSED' ? tt("HT") : tt("LIVE") })] }), [match.homeTeam, match.awayTeam].map((t, i) => (_jsxs("div", { className: "flex items-center justify-between gap-2 py-0.5", children: [_jsxs("span", { className: "flex items-center gap-2 min-w-0", children: [_jsx(Crest, { team: t, size: 18 }), _jsx("span", { className: "text-sm font-medium text-ink truncate", children: t.shortName || t.name })] }), _jsx("span", { className: "num text-sm font-bold text-ink", children: i === 0 ? ft?.home ?? 0 : ft?.away ?? 0 })] }, t.id)))] }));
}
function Crest({ team, size = 32 }) {
    return team.crest ? (_jsx("img", { src: team.crest, alt: "", width: size, height: size, className: "object-contain flex-shrink-0 drop-shadow-sm", style: { width: size, height: size } })) : (_jsx("span", { className: "rounded-full bg-surface2 flex-shrink-0 grid place-items-center text-[10px] text-faint", style: { width: size, height: size }, children: team.tla || '?' }));
}
/** A day's games grouped by competition: top leagues first (competition rank), then by name; games by kick-off. */
export function byCompetition(list) {
    const map = new Map();
    for (const m of list) {
        const g = map.get(m.competition.code) || { comp: m.competition, games: [] };
        g.games.push(m);
        map.set(m.competition.code, g);
    }
    return [...map.values()]
        .sort((a, b) => (a.comp.rank ?? 0) - (b.comp.rank ?? 0) || a.comp.name.localeCompare(b.comp.name))
        .map(g => [g.comp, g.games.sort((x, y) => x.utcDate.localeCompare(y.utcDate))]);
}
/**
 * One game as a thin row: time · both teams · our 1-X-2 (pick highlighted). Locked picks show a lock, the
 * "guess first" cover shows a small Reveal button. The whole row opens the match page.
 */
export function MatchRow({ match, showComp = false, showDay = false }) {
    const favWhy = useFavorites().reasons(match);
    const { full } = useAuth();
    const isLive = LIVE.has(match.status);
    const p = match.prediction;
    const { hidden: covered, reveal } = useReveal(match.id, match.status, !!p && !p.locked);
    const pick = p && !covered && !(p.locked && !p.pick) ? pickOf(p) : null;
    const ft = match.score?.fullTime;
    const name = (t) => t.shortName || t.name;
    const pickName = pick === 'H' ? name(match.homeTeam) : pick === 'A' ? name(match.awayTeam) : pick === 'D' ? 'Draw' : null;
    const pickPct = p && pick && !p.locked ? Math.round(pick === 'H' ? p.home : pick === 'D' ? p.draw : p.away) : null;
    const roll = justRevealed(match.id);
    // goals markets next to 1-X-2: over 2.5 goals and both teams to score (yes or no, whichever is likelier)
    const extras = p && pick && pickPct !== null && typeof p.over25 === 'number' && typeof p.btts === 'number'
        ? [
            { k: 'o25', top: p.over25 >= 50 ? tt("Over 2.5") : tt("Under 2.5"), v: p.over25 >= 50 ? p.over25 : 100 - p.over25 },
            { k: 'btts', top: p.btts >= 50 ? tt("Both score") : tt("Not both"), v: p.btts >= 50 ? p.btts : 100 - p.btts }
        ]
        : null;
    return (_jsxs(Link, { to: `/match/${match.id}`, className: `group relative flex items-center gap-2.5 px-3 sm:px-4 py-1.5 hover:bg-surface2/50 transition-colors ${isLive ? 'bg-live/[0.06]' : ''}`, children: [isLive && _jsx("span", { className: "absolute left-0 inset-y-0 w-0.5 bg-live", "aria-hidden": true }), _jsxs("div", { className: "relative w-10 flex-shrink-0 text-center leading-tight", children: [favWhy.length > 0 && (_jsx("span", { className: "absolute -left-2.5 sm:-left-3 top-1/2 -translate-y-1/2 text-accent", title: tt("Favorite: {0}", { 0: favWhy.map(f => f.name).join(', ') }), children: _jsx("svg", { viewBox: "0 0 24 24", className: "w-3 h-3", fill: "currentColor", "aria-hidden": true, children: _jsx("path", { d: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" }) }) })), isLive ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "block text-[11px] font-bold text-live", children: match.status === 'PAUSED' ? tt("HT") : tt("LIVE") }), _jsx("span", { className: "inline-block w-1.5 h-1.5 rounded-full bg-live animate-pulseDot" })] })) : (_jsxs(_Fragment, { children: [_jsx("span", { className: "block num text-[12px] text-ink/90", children: kickoff(match.utcDate) }), showDay && _jsx("span", { className: "block text-[10px] text-faint", children: new Date(match.utcDate).toLocaleDateString(LOCALE, { weekday: 'short' }) })] }))] }), _jsxs("div", { className: "flex-1 min-w-0", children: [showComp && (_jsxs("div", { className: "flex items-center gap-1 text-[10px] text-faint mb-0.5 truncate", children: [match.competition.emblem && _jsx("img", { src: match.competition.emblem, alt: "", className: "w-3 h-3 object-contain" }), _jsx("span", { className: "truncate", children: match.competition.name })] })), [match.homeTeam, match.awayTeam].map((t, i) => {
                        const side = i === 0 ? 'H' : 'A';
                        const score = isLive ? (i === 0 ? ft?.home : ft?.away) : null;
                        return (_jsxs("div", { className: "flex items-center gap-2 min-w-0 h-5", children: [_jsx(Crest, { team: t, size: 15 }), _jsx("span", { className: `text-[13px] truncate ${pick === side ? 'font-bold text-ink' : 'text-ink/85'}`, children: name(t) }), score !== null && score !== undefined && _jsx("span", { className: "ml-auto pl-2 num text-[13px] font-extrabold tabular-nums text-live", children: score })] }, t.id));
                    }), full && p && !p.locked && !covered && ['SCHEDULED', 'TIMED'].includes(match.status) && (() => {
                        const up = Math.min(p.home, p.away), fav = Math.max(p.home, p.away);
                        if (up < 30 || fav - up < 10)
                            return null;
                        return (_jsxs("span", { className: "block text-[10px] font-bold text-loss", title: tt("Our model gives the underdog {0}% to win", { 0: Math.round(up) }), children: [tt("Upset watch"), " \u00B7 ", Math.round(up), "%"] }));
                    })(), isLive && p?.live && !covered && (() => {
                        const l = p.live;
                        const k = l.home >= l.draw && l.home >= l.away ? 'H' : l.away >= l.draw ? 'A' : 'D';
                        const v = Math.min(99, Math.round(k === 'H' ? l.home : k === 'D' ? l.draw : l.away));
                        return (_jsxs("div", { className: "text-[10px] text-live font-semibold truncate", children: [tt("Now"), ": ", k === 'D' ? tt("Draw") : name(k === 'H' ? match.homeTeam : match.awayTeam), " ", _jsxs("span", { className: "num", children: [v, "%"] })] }));
                    })(), extras && (_jsx("div", { className: `lg:hidden flex gap-3 text-[10px] text-muted ${roll ? 'pop-in' : ''}`, style: roll ? { animationDelay: '420ms' } : undefined, children: extras.map(x => (_jsxs("span", { children: [x.top, " ", _jsx(CountUp, { value: x.v, suffix: "%", animate: roll, delay: 420, className: `num font-semibold ${x.v >= 60 ? 'text-accent' : 'text-ink'}` })] }, x.k))) }))] }), _jsx("div", { className: "flex-shrink-0 flex items-center justify-end min-w-[84px] sm:min-w-[150px]", children: covered ? (_jsxs("button", { type: "button", onClick: e => { e.preventDefault(); e.stopPropagation(); reveal(); }, className: "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-bold bg-accent/10 text-accent border border-accent/30 hover:bg-accent/15", children: [_jsxs("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [_jsx("path", { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" }), _jsx("circle", { cx: "12", cy: "12", r: "3" })] }), tt("Reveal")] })) : p && p.locked && !pickPct ? (_jsxs("span", { className: "inline-flex items-center gap-1.5 text-xs text-faint", children: [_jsx(LockIcon, {}), " ", pickName ? _jsx("span", { className: `font-semibold ${PICK_COLOR[pick]}`, children: pickName }) : tt("Locked")] })) : p && pick && pickPct !== null ? (_jsxs(_Fragment, { children: [_jsxs("span", { className: `sm:hidden text-right leading-tight ${roll ? 'pop-in' : ''}`, children: [_jsx("span", { className: `block text-[11px] font-bold truncate max-w-[84px] ${PICK_COLOR[pick]}`, children: pickName }), _jsx(CountUp, { value: pickPct, suffix: "%", animate: roll, className: "block num text-[11px] font-semibold text-ink/80" })] }), _jsxs("span", { className: "hidden sm:flex items-center gap-1", children: [['H', 'D', 'A'].map((k, i) => {
                                    const v = Math.round(k === 'H' ? p.home : k === 'D' ? p.draw : p.away);
                                    const on = k === pick;
                                    return (_jsxs("span", { className: `w-11 h-7 rounded-md grid place-items-center leading-none transition-colors duration-500 ${on ? `${PICK_BG[k]} text-bg` : 'bg-surface2/70 text-muted'} ${roll ? 'pop-in' : ''}`, style: roll ? { animationDelay: `${i * 90}ms` } : undefined, children: [_jsx("span", { className: "text-[8px] font-bold opacity-75", children: k === 'H' ? '1' : k === 'D' ? 'X' : '2' }), _jsx(CountUp, { value: v, suffix: "%", animate: roll, delay: i * 90, className: "num text-[11px] font-bold" })] }, k));
                                }), extras && (_jsxs(_Fragment, { children: [_jsx("span", { className: "hidden lg:block w-px h-5 bg-line mx-1", "aria-hidden": true }), extras.map((x, i) => (_jsxs("span", { className: `hidden lg:grid w-[60px] h-7 rounded-md place-items-center leading-none border ${x.v >= 60 ? 'border-accent/40 bg-accent/10 text-accent' : 'border-line/70 text-muted'} ${roll ? 'pop-in' : ''}`, style: roll ? { animationDelay: `${300 + i * 90}ms` } : undefined, title: x.k === 'o25' ? tt("Over 2.5 goals: {0}% · Under: {1}%", { 0: Math.round(p.over25), 1: Math.round(100 - p.over25) }) : tt("Both teams score: {0}% · Not both: {1}%", { 0: Math.round(p.btts), 1: Math.round(100 - p.btts) }), children: [_jsx("span", { className: "text-[8px] font-bold opacity-75 whitespace-nowrap", children: x.top }), _jsx(CountUp, { value: x.v, suffix: "%", animate: roll, delay: 300 + i * 90, className: "num text-[11px] font-bold" })] }, x.k)))] }))] })] })) : (_jsx("span", { className: "text-xs text-faint", children: "\u2013" })) })] }));
}
export default Dashboard;
