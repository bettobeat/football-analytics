import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../../lib/socket';
import { t } from '../../lib/i18n';
import { useBbConfig, bbLeagueFav } from '../../lib/bb';
import { FavStar } from '../../lib/favorites';
import { Card, GameList, Skeleton, TeamLogo, LiveRow } from './parts';
import { useNews, NewsRows } from '../../components/NewsList';
/** Standings table(s); the teams of a game are marked (in the home / away colours when given). */
export function StandingsTable({ data, mark = [], colors }) {
    return (_jsx("div", { className: "space-y-5", children: data.groups.map((g, i) => (_jsxs("div", { children: [data.groups.length > 1 && g.name && _jsx("div", { className: "label pb-2", children: g.name }), _jsxs("table", { className: "w-full table-fixed text-xs sm:text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-faint text-[10px] uppercase tracking-wide", children: [_jsx("th", { className: "text-left font-semibold py-1.5 w-9", children: "#" }), _jsx("th", { className: "text-left font-semibold py-1.5", children: t('Team') }), _jsx("th", { className: "text-right font-semibold py-1.5 w-8 sm:w-10", children: t('P') }), _jsx("th", { className: "text-right font-semibold py-1.5 w-8 sm:w-10", children: t('W') }), _jsx("th", { className: "text-right font-semibold py-1.5 w-8 sm:w-10", children: t('L') }), _jsx("th", { className: "text-right font-semibold py-1.5 w-14 sm:w-32", children: "%" }), _jsx("th", { className: "text-right font-semibold py-1.5 w-16 hidden sm:table-cell", children: t('+/−') })] }) }), _jsx("tbody", { children: g.rows.map(r => {
                                const c = colors?.[r.team.id];
                                const on = mark.includes(r.team.id);
                                const diff = r.pointsFor !== null && r.pointsAgainst !== null && r.played ? (r.pointsFor - r.pointsAgainst) / r.played : null;
                                return (_jsxs("tr", { className: `border-t border-line/40 ${c === 'H' ? 'bg-home/10' : c === 'A' ? 'bg-away/10' : on ? 'bg-accent/10' : 'hover:bg-surface2/40'}`, children: [_jsxs("td", { className: "py-1.5 relative", children: [(c || on) && _jsx("span", { className: `absolute left-0 inset-y-1 w-[3px] rounded-full ${c === 'H' ? 'bg-home' : c === 'A' ? 'bg-away' : 'bg-accent'}` }), _jsx("span", { className: `ml-1.5 inline-grid place-items-center w-5 h-5 rounded-md num text-[10px] font-bold ${r.position <= 3 ? 'bg-accent/15 text-accent' : 'text-faint'}`, children: r.position })] }), _jsx("td", { className: "py-1.5 pr-2", children: _jsxs(Link, { to: `/basketball/team/${r.team.id}`, className: `flex items-center gap-2 hover:text-accent ${on ? 'font-bold text-ink' : 'text-ink'}`, children: [_jsx(TeamLogo, { team: r.team, size: 18 }), _jsx("span", { className: "truncate", children: r.team.name })] }) }), _jsx("td", { className: "py-1.5 text-right num text-muted", children: r.played }), _jsx("td", { className: "py-1.5 text-right num text-ink font-semibold", children: r.won }), _jsx("td", { className: "py-1.5 text-right num text-muted", children: r.lost }), _jsx("td", { className: "py-1.5 text-right num text-muted", children: _jsxs("span", { className: "inline-flex items-center justify-end gap-2", children: [r.pct !== null && _jsx("span", { className: "hidden sm:block w-12 h-1.5 rounded-full bg-surface2 overflow-hidden", children: _jsx("span", { className: "block h-full rounded-full bg-win/70", style: { width: `${r.pct * 100}%` } }) }), r.pct !== null ? r.pct.toFixed(3).replace(/^0/, '') : '–'] }) }), _jsx("td", { className: `py-1.5 text-right num hidden sm:table-cell font-semibold ${diff === null ? 'text-muted' : diff > 0 ? 'text-win' : diff < 0 ? 'text-loss' : 'text-muted'}`, children: diff !== null ? (diff > 0 ? '+' : '') + diff.toFixed(1) : '–' })] }, r.team.id));
                            }) })] })] }, i))) }));
}
/** A league: standings, next games, latest results. */
export default function BbLeague() {
    const { code = '' } = useParams();
    const cfg = useBbConfig();
    const league = cfg?.leagues.find(l => l.code === code.toUpperCase());
    const [table, setTable] = useState(undefined);
    const [next, setNext] = useState(null);
    const [results, setResults] = useState(null);
    const news = useNews({ sport: 'basketball', league: code.toUpperCase(), limit: 10 });
    const [leaders, setLeaders] = useState(null);
    useEffect(() => {
        setLeaders(null);
        if (code.toUpperCase() === 'NBA')
            axios.get(`${API_URL}/basketball/leaders`).then(r => setLeaders(r.data.data || null)).catch(() => undefined);
    }, [code]);
    useEffect(() => {
        const c = code.toUpperCase();
        setTable(undefined);
        setNext(null);
        setResults(null);
        axios.get(`${API_URL}/basketball/standings/${c}`).then(r => setTable(r.data.data || null)).catch(() => setTable(null));
        axios.get(`${API_URL}/basketball/games`, { params: { league: c, days: 10 } }).then(r => setNext((r.data.data || []).filter((g) => g.state !== 'done'))).catch(() => setNext([]));
        axios.get(`${API_URL}/basketball/games`, { params: { league: c, days: 21, results: 1 } }).then(r => setResults((r.data.data || []).filter((g) => g.state === 'done'))).catch(() => setResults([]));
    }, [code]);
    const live = (next || []).filter(g => g.state === 'live');
    // live box: refresh the league's games every minute while one is on (score, clock, live win chance)
    useEffect(() => {
        if (!live.length)
            return;
        const c = code.toUpperCase();
        const iv = setInterval(() => {
            axios.get(`${API_URL}/basketball/games`, { params: { league: c, days: 10 } }).then(r => setNext((r.data.data || []).filter((g) => g.state !== 'done'))).catch(() => undefined);
        }, 60000);
        return () => clearInterval(iv);
    }, [code, live.length > 0]);
    useEffect(() => { if (league)
        document.title = t('{0} · SportLikely', { 0: league.name }); }, [league]);
    return (_jsxs("div", { className: "max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6 pb-28 xl:pb-10", children: [_jsxs("div", { className: "flex items-center gap-3", children: [league?.logo && _jsx("img", { src: league.logo, alt: "", className: "w-12 h-12 object-contain" }), _jsxs("div", { children: [_jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [_jsx("h1", { className: "font-display text-2xl sm:text-3xl font-extrabold text-ink", children: league?.name || code.toUpperCase() }), league && _jsx(FavStar, { label: true, fav: bbLeagueFav(league) })] }), league && _jsxs("p", { className: "text-sm text-muted", children: [t(league.country), table?.season ? ` · ${table.season}` : ''] })] })] }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start", children: [_jsx(Card, { title: t('Standings'), children: table === undefined ? _jsx(Skeleton, { rows: 10, h: "h-7" }) : table ? _jsx(StandingsTable, { data: table }) : _jsx("p", { className: "text-sm text-faint", children: t('No table yet.') }) }), _jsxs("div", { className: "space-y-6 min-w-0", children: [live.length > 0 && (_jsx(Card, { title: t('Live now'), action: _jsxs("span", { className: "inline-flex items-center gap-1.5 text-xs font-bold text-live", children: [_jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-live animate-pulseDot" }), t('{0} live', { 0: live.length })] }), children: _jsx("ul", { className: "space-y-1", children: live.map(g => _jsx("li", { children: _jsx(LiveRow, { g: g }) }, g.id)) }) })), leaders && leaders.lists.length > 0 && _jsx(LeadersCard, { data: leaders }), _jsx(Card, { title: t('Next games'), children: !next ? _jsx(Skeleton, { rows: 5 }) : _jsx("div", { className: "max-h-[520px] overflow-y-auto overscroll-contain pr-1", children: _jsx(GameList, { games: next, empty: t('No games in the next 10 days.') }) }) }), _jsx(Card, { title: t('Latest results'), children: !results ? _jsx(Skeleton, { rows: 5 }) : _jsx("div", { className: "max-h-[520px] overflow-y-auto overscroll-contain pr-1", children: _jsx(GameList, { games: results, empty: t('No results in the last three weeks.') }) }) }), _jsx(Card, { title: t('{0} news', { 0: league?.name || code.toUpperCase() }), children: news === null ? _jsx(Skeleton, { rows: 3, h: "h-14" }) : news.length ? _jsx("div", { className: "-mx-2 max-h-[520px] overflow-y-auto overscroll-contain", children: _jsx(NewsRows, { items: news }) }) : _jsx("p", { className: "text-sm text-faint", children: t('No news about this league in the last two weeks.') }) })] })] })] }));
}
const STAT_LABEL = { pts: 'Points', reb: 'Rebounds', ast: 'Assists', stl: 'Steals', blk: 'Blocks' };
/** NBA league leaders per game (balldontlie). */
function LeadersCard({ data }) {
    const [stat, setStat] = useState(data.lists[0].stat);
    const list = data.lists.find(l => l.stat === stat) || data.lists[0];
    return (_jsxs(Card, { title: t('League leaders'), action: _jsx("span", { className: "text-xs text-faint", children: data.season }), children: [_jsx("div", { className: "seg mb-3 flex-wrap", children: data.lists.map(l => _jsx("button", { onClick: () => setStat(l.stat), className: `seg-btn ${l.stat === stat ? 'seg-btn-active' : ''}`, children: t(STAT_LABEL[l.stat] || l.stat) }, l.stat)) }), _jsx("ol", { className: "divide-y divide-line/50", children: list.top.map(x => (_jsxs("li", { className: "flex items-center gap-3 py-2 text-sm", children: [_jsx("span", { className: "w-5 num text-faint", children: x.rank }), x.id ? _jsx(Link, { to: `/basketball/player/${x.id}`, className: "text-ink font-semibold hover:text-accent truncate", children: x.name }) : _jsx("span", { className: "text-ink font-semibold truncate", children: x.name }), _jsx("span", { className: "ml-auto num font-bold text-ink", children: x.value }), _jsx("span", { className: "text-[10px] text-faint w-12 text-right", children: t('{0} GP', { 0: x.games }) })] }, x.name))) }), _jsx("p", { className: "mt-2 text-[11px] text-faint", children: t('Per game, regular season.') })] }));
}
