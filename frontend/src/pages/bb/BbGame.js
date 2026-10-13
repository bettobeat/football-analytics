import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../../lib/socket';
import { t, LOCALE } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { useReveal, justRevealed, guessFirstOn, hideMatch } from '../../lib/reveal';
import CountUp from '../../components/CountUp';
import YourPicks from '../../components/YourPicks';
import { RevealCover } from '../../components/Reveal';
import { BB_STATUS, liveLabel, spreadText, bbTeamFav, bbLeagueFav, useBbConfig } from '../../lib/bb';
import { FavStar } from '../../lib/favorites';
import { Card, TeamLogo, LockedNote, LiveChanceBox, rid, rstatus } from './parts';
import { StatsTab, RestTab, H2HTab, StandingsTab } from './GameTabs';
import { MarketsCard, CompareCard, PlayersCard, ModelTable } from './GameExtras';
/** A game page — laid out like football's match page: hero, tabs, prediction first. */
export default function BbGame() {
    const { id = '' } = useParams();
    const { access } = useAuth();
    const [d, setD] = useState(null);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState(() => {
        const raw = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
        const h = (raw === 'injuries' ? 'players' : raw);
        return TABS.includes(h) ? h : 'prediction';
    });
    const pickTab = (x) => {
        setTab(x);
        try {
            history.replaceState(null, '', x === 'prediction' ? window.location.pathname + window.location.search : `#${x}`);
        }
        catch { /* ignore */ }
    };
    useEffect(() => {
        let cancelled = false;
        setD(null);
        setError(null);
        const load = () => axios.get(`${API_URL}/basketball/game/${id}`)
            .then(r => { if (!cancelled)
            setD(r.data.data); })
            .catch(e => { if (!cancelled)
            setError(e?.response?.status === 404 ? t('Game not found') : t('Could not load the game')); });
        load();
        const iv = setInterval(load, 60000);
        return () => { cancelled = true; clearInterval(iv); };
    }, [id, access]);
    useEffect(() => {
        if (d)
            document.title = t('{0} · SportLikely', { 0: `${d.game.home.name} vs ${d.game.away.name}` });
    }, [d?.game.id]);
    if (error)
        return _jsxs("div", { className: "max-w-5xl mx-auto px-4 py-10", children: [_jsx(Link, { to: "/basketball/games", className: "text-sm text-muted hover:text-ink", children: t('← All games') }), _jsx("div", { className: "mt-4 card border-loss/40 text-loss rounded-lg p-4", children: error })] });
    if (!d)
        return _jsx("div", { className: "max-w-5xl mx-auto px-4 py-16 text-center text-muted", children: t('Loading game…') });
    const g = d.game;
    const live = g.state === 'live', done = g.state === 'done';
    const showScore = !!g.score && g.state !== 'upcoming';
    const pick = g.prediction?.pick || null;
    const pickVar = pick === 'H' ? '--home' : '--away';
    const tabs = [
        { id: 'prediction', label: t('Prediction'), hint: '' },
        ...(d.box ? [{ id: 'box', label: t('Box score'), short: t('Box'), hint: live ? t('Live player stats') : t('Every player: points, shooting, rebounds, assists'), live }] : []),
        { id: 'stats', label: t('Statistics'), short: t('Stats'), hint: t('Averages from the last 10 games') },
        { id: 'players', label: d.injuries ? t('Players & injuries') : t('Players'), short: t('Players'), hint: d.injuries ? t('Key players and the NBA injury reports') : t('Each team’s key players this season') },
        { id: 'rest', label: t('Schedule & rest'), short: t('Rest'), hint: t('Back-to-backs, rest days and the next game') },
        { id: 'h2h', label: t('H2H'), hint: t('Last meetings and recent form') },
        ...(d.standings ? [{ id: 'table', label: t('Standings'), short: t('Table'), hint: t('{0} table', { 0: g.league.name }) }] : [])
    ];
    const q = g.quarters;
    const showQ = showScore && q && q.home.some(x => x !== null);
    return (_jsxs("div", { className: "max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 xl:pb-10", children: [_jsxs(Link, { to: "/basketball/games", className: "inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors", children: [_jsx("span", { "aria-hidden": true, children: "\u2190" }), " ", t('All games')] }), _jsxs("div", { className: `mt-4 card relative overflow-hidden p-4 sm:p-8 ${live ? 'shadow-glow border-live/40' : ''}`, children: [pick && _jsx("div", { className: "pointer-events-none absolute inset-0 opacity-[0.10]", style: { background: `radial-gradient(700px 260px at 50% 120%, rgb(var(${pickVar})), transparent 70%)` } }), _jsxs("div", { className: "relative flex flex-wrap items-center justify-between gap-2 text-sm text-muted mb-6", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Link, { to: `/basketball/league/${g.league.code}`, className: "font-medium text-ink/90 hover:underline", children: g.league.name }), _jsx(LeagueStar, { code: g.league.code, name: g.league.name }), g.round && _jsxs("span", { className: "text-faint", children: ["\u00B7 ", g.round] }), g.preseason && _jsx("span", { className: "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-draw/15 text-draw", children: t('Pre-season') }), g.league.trial && _jsx("span", { title: t("We added this league recently. Its predictions are being tested and don’t count in our public record yet."), className: "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-accent/15 text-accent", children: t("New league · in testing") })] }), _jsx("div", { className: "text-faint", children: new Date(g.kickoff).toLocaleString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })] }), _jsxs("div", { className: "relative grid grid-cols-[1fr_auto_1fr] items-start sm:items-center gap-2 sm:gap-8", children: [_jsx(TeamHero, { team: g.home, align: "right", league: g.league.code }), _jsxs("div", { className: "text-center min-w-[96px] sm:min-w-[170px] self-center", children: [showScore ? (_jsxs("div", { className: "num text-5xl sm:text-6xl font-extrabold text-ink tracking-tight", children: [g.score.home, _jsx("span", { className: "text-faint mx-2 font-light", children: ":" }), g.score.away] })) : (_jsx("div", { className: "num text-4xl sm:text-5xl font-extrabold text-ink tracking-tight", children: new Date(g.kickoff).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) })), _jsxs("div", { className: `mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider px-3 py-1 rounded-full border ${live ? 'bg-live/10 text-live border-live/30' : done ? 'bg-surface2 text-muted border-line' : 'bg-accent/10 text-accent border-accent/30'}`, children: [live && _jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-live animate-pulseDot" }), live ? liveLabel(g).toUpperCase() : done ? (BB_STATUS[g.status] || t('Final')).toUpperCase() : g.state === 'off' ? (BB_STATUS[g.status] || g.status).toUpperCase() : t('TIP-OFF')] })] }), _jsx(TeamHero, { team: g.away, align: "left", league: g.league.code })] }), showQ && (_jsx("div", { className: "relative mt-6 pt-4 border-t border-line/60 overflow-x-auto", children: _jsxs("table", { className: "mx-auto text-xs num", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-faint", children: [_jsx("th", { className: "px-3 text-left font-semibold" }), ['Q1', 'Q2', 'Q3', 'Q4', 'OT'].map((x, i) => (i < 4 || q.home[4] !== null) && _jsx("th", { className: "px-3 font-semibold", children: t(x) }, x)), _jsx("th", { className: "px-3 font-semibold", children: t('Total') })] }) }), _jsx("tbody", { children: ['home', 'away'].map(s => (_jsxs("tr", { children: [_jsx("td", { className: "px-3 py-0.5 text-muted font-semibold font-sans text-left", children: (s === 'home' ? g.home : g.away).name }), q[s].map((v, i) => (i < 4 || q.home[4] !== null) && _jsx("td", { className: "px-3 text-center text-ink", children: v ?? '–' }, i)), _jsx("td", { className: "px-3 text-center text-ink font-bold", children: s === 'home' ? g.score.home : g.score.away })] }, s))) })] }) }))] }), live && _jsx(LiveChanceBox, { g: g }), g.corrected && done && _jsx("p", { className: "mt-2 text-center text-[11px] text-faint", children: t('Final score corrected by us: our data provider had it wrong.') }), access === 'admin' && done && _jsx(ResultAdmin, { game: g, onDone: () => axios.get(`${API_URL}/basketball/game/${id}`).then(r => setD(r.data.data)).catch(() => undefined) }), _jsx("div", { className: "sticky top-16 sm:top-[72px] z-30 -mx-4 sm:mx-0 mt-6 px-4 sm:px-0 py-2 bg-bg/35 backdrop-blur-xl", children: _jsx("nav", { className: "flex gap-1 p-1 rounded-full bg-surface2/60 border border-line/60 overflow-x-auto no-scrollbar", "aria-label": t('Game sections'), children: tabs.map(x => (_jsxs("button", { type: "button", onClick: () => pickTab(x.id), "aria-current": tab === x.id ? 'page' : undefined, className: `flex-1 min-w-max inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-full text-[13px] sm:text-sm font-semibold transition-colors ${tab === x.id ? 'bg-accent text-bg shadow' : 'text-muted hover:text-ink'}`, children: [x.short ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "sm:hidden", children: x.short }), _jsx("span", { className: "hidden sm:inline", children: x.label })] })) : x.label, x.live && _jsx("span", { className: `w-1.5 h-1.5 rounded-full animate-pulseDot ${tab === x.id ? 'bg-bg' : 'bg-live'}` })] }, x.id))) }) }), _jsxs("div", { className: "mt-4 space-y-6 min-w-0", children: [tab === 'prediction' && (_jsxs(_Fragment, { children: [_jsx(PredictionSection, { d: d }), _jsx(YourPicks, { sport: "bb", gameId: g.id, home: g.home.name, away: g.away.name }), _jsx(MarketsGate, { d: d }), d.preview && _jsx(CompareCard, { g: g, home: d.preview.home, away: d.preview.away, table: d.standings ? d.standings.groups.flatMap(x => x.rows) : null, form: d.stats.home && d.stats.away ? { home: d.stats.home.form, away: d.stats.away.form } : null }), d.players && _jsx(PlayersCard, { g: g, home: d.players.home, away: d.players.away, limit: 4, title: t('Players to watch') }), _jsx(AnalysisCard, { d: d }), _jsx("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3", children: tabs.filter(x => x.id !== 'prediction').map(x => (_jsxs("button", { type: "button", onClick: () => pickTab(x.id), className: "card p-4 text-left hover:border-accent/50 transition-colors", children: [_jsxs("div", { className: "font-display font-bold text-ink", children: [x.label, " ", _jsx("span", { "aria-hidden": true, className: "text-accent", children: "\u2192" })] }), _jsx("div", { className: "text-xs text-muted mt-1", children: x.hint })] }, x.id))) })] })), tab === 'box' && d.box && _jsx(BoxTab, { d: d }), tab === 'stats' && _jsx(StatsTab, { g: g, home: d.stats.home, away: d.stats.away }), tab === 'players' && (_jsxs(_Fragment, { children: [d.injuries && _jsx(InjuriesCard, { d: d }), d.players && _jsx(PlayersCard, { g: g, home: d.players.home, away: d.players.away, limit: 10, title: t('Key players') })] })), tab === 'rest' && _jsx(RestTab, { g: g, home: d.schedule.home, away: d.schedule.away }), tab === 'h2h' && _jsx(H2HTab, { g: g, list: d.h2h }), tab === 'table' && d.standings && _jsx(StandingsTab, { g: g, data: d.standings })] })] }));
}
const TABS = ['prediction', 'box', 'stats', 'players', 'rest', 'h2h', 'table'];
function LeagueStar({ code, name }) {
    const cfg = useBbConfig();
    const logo = cfg?.leagues.find(l => l.code === code)?.logo || null;
    return _jsx(FavStar, { size: "sm", fav: bbLeagueFav({ code, name, logo }) });
}
function TeamHero({ team, align, league }) {
    return (_jsxs(Link, { to: `/basketball/team/${team.id}`, className: `flex flex-col items-center text-center gap-2 sm:gap-4 min-w-0 hover:opacity-90 ${align === 'right' ? 'sm:flex-row-reverse sm:text-right' : 'sm:flex-row sm:text-left'}`, children: [_jsx(TeamLogo, { team: team, size: 72 }), _jsxs("div", { className: "min-w-0 w-full sm:w-auto", children: [_jsx("div", { className: "font-sans font-extrabold text-[15px] sm:font-display sm:text-2xl text-ink leading-tight break-words sm:truncate", children: team.name }), _jsxs("div", { className: `flex items-center justify-center gap-1 mt-1 sm:mt-0.5 ${align === 'right' ? 'sm:justify-end' : 'sm:justify-start'}`, children: [_jsx("span", { className: "text-[11px] text-accent font-semibold whitespace-nowrap", children: t('Team page →') }), _jsx(FavStar, { size: "sm", fav: bbTeamFav(team, league) })] })] })] }));
}
function Tile({ k, label, v, active, roll, delay = 0, text }) {
    const color = k === 'H' ? 'text-home' : k === 'A' ? 'text-away' : 'text-ink';
    const border = k === 'H' ? 'border-home/50 bg-home/10' : 'border-away/50 bg-away/10';
    return (_jsxs("div", { className: `rounded-xl border p-3 sm:p-4 text-center ${active ? border : 'border-line/70 bg-surface2/40'} ${roll && active ? 'animate-pop' : ''}`, children: [_jsxs("div", { className: "text-[11px] text-faint mb-1 truncate", children: [k !== 'T' && _jsx("span", { className: `font-bold mr-1 ${active ? color : ''}`, children: k === 'H' ? '1' : '2' }), label] }), _jsx("div", { className: `num text-2xl sm:text-3xl font-extrabold ${active ? color : k === 'T' ? 'text-ink' : 'text-ink/70'}`, children: text !== undefined ? text : _jsx(CountUp, { value: v || 0, decimals: 1, suffix: "%", animate: roll, delay: delay }) })] }));
}
/** Prediction: who wins (1 · total · 2), how strong the pick is, the spread, total and predicted score, and why. */
function PredictionSection({ d }) {
    const g = d.game;
    const p = g.prediction;
    const { hidden, reveal } = useReveal(rid(g), rstatus(g), !!p && !p.locked);
    const [anim, setAnim] = useState(false);
    const roll = justRevealed(rid(g));
    const note = p ? [p.model || 'bb-v1', g.state === 'upcoming' ? t('Updated until tip-off') : t('Saved before tip-off')].join(' · ') : undefined;
    return (_jsx(Card, { title: t('Prediction'), action: note ? _jsx("span", { className: "text-xs text-faint", children: note }) : undefined, children: !p ? (_jsx("p", { className: "text-sm text-faint", children: t('No prediction for this game.') })) : p.locked ? (_jsxs("div", { className: "space-y-4", children: [p.pick && (_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(TeamLogo, { team: p.pick === 'H' ? g.home : g.away, size: 40 }), _jsxs("div", { children: [_jsx("div", { className: "text-xs text-faint", children: t('Our pick') }), _jsx("div", { className: `font-display text-xl font-extrabold ${p.pick === 'H' ? 'text-home' : 'text-away'}`, children: t('{0} to win', { 0: (p.pick === 'H' ? g.home : g.away).name }) })] })] })), _jsx(LockedNote, {})] })) : hidden || anim ? (_jsx(RevealCover, { autoStart: anim, onReveal: () => { setAnim(false); reveal(); } }, anim ? 'auto' : 'cover')) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsx(Tile, { k: "H", label: g.home.name, v: p.pHome, active: p.pick === 'H', roll: roll }), _jsx(Tile, { k: "T", label: t('Total points'), text: p.total !== undefined ? p.total.toFixed(1) : '–', active: false, roll: roll }), _jsx(Tile, { k: "A", label: g.away.name, v: p.pAway, active: p.pick === 'A', roll: roll, delay: 240 })] }), (() => {
                    const topV = Math.max(p.pHome || 0, p.pAway || 0);
                    const team = p.pick === 'H' ? g.home : g.away;
                    return (_jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-2 text-sm", children: [_jsx("span", { className: `px-2.5 py-1 rounded-full text-xs font-bold border ${topV >= 70 ? 'bg-accent/15 text-accent border-accent/40' : topV >= 60 ? 'bg-accent/15 text-accent border-accent/40' : 'bg-surface2 text-ink border-line'}`, children: topV >= 80 ? t('Very strong pick') : topV >= 70 ? t('Strong pick') : topV >= 55 ? t('Pick') : t('Close game') }), _jsxs("span", { className: "text-muted", children: [team.name, " ", _jsxs("span", { className: "num text-ink font-semibold", children: [Math.round(topV), "%"] })] }), p.hit !== null && _jsx("span", { className: `ml-auto rounded-full px-3 py-1 text-xs font-bold ${p.hit ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'}`, children: p.hit ? t('Right') : t('Wrong') }), g.resultCheck && _jsx("span", { title: t('The final score from our data provider looks wrong. This game doesn’t count in our record until it is checked.'), className: "ml-auto rounded-full px-3 py-1 text-xs font-bold bg-draw/15 text-draw", children: t('Result being checked') })] }));
                })(), _jsxs("div", { className: "flex h-2.5 gap-[3px] mt-4", children: [_jsx("div", { className: `rounded-full bg-home ${p.pick === 'H' ? '' : 'opacity-35'}`, style: { width: `calc(${p.pHome}% - 2px)` } }), _jsx("div", { className: `rounded-full bg-away ${p.pick === 'A' ? '' : 'opacity-35'}`, style: { width: `calc(${p.pAway}% - 2px)` } })] }), g.state !== 'upcoming' && (_jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-2 text-xs text-muted", children: [_jsx("span", { className: "px-2.5 py-1 rounded-full bg-surface2 border border-line font-semibold text-ink", children: t('Saved before tip-off') }), _jsx("span", { children: t('This is exactly what we predicted before the game — it is never recalculated after the result.') })] })), _jsxs("div", { className: "mt-5 grid grid-cols-3 gap-2", children: [_jsx(Stat, { label: t('Point spread'), value: spreadText(g) || '–' }), _jsx(Stat, { label: t('Predicted score'), value: p.score ? `${p.score.home}–${p.score.away}` : '–' }), _jsx(Stat, { label: t('Total points'), value: p.total !== undefined ? p.total.toFixed(1) : '–' })] }), d.why.length > 0 && (_jsxs("div", { className: "mt-5 rounded-2xl border border-line/60 bg-surface2/30 p-4", children: [_jsx("div", { className: "text-sm font-bold text-ink mb-2", children: t('Why we think so') }), _jsx("ul", { className: "space-y-2", children: d.why.map((w, i) => {
                                const team = w.side === 'H' ? g.home : g.away;
                                const other = w.side === 'H' ? g.away : g.home;
                                const pv = d.preview;
                                const mine = pv ? (w.side === 'H' ? pv.home : pv.away) : null;
                                const theirs = pv ? (w.side === 'H' ? pv.away : pv.home) : null;
                                const pts = Math.abs(w.points).toFixed(1);
                                let text;
                                let tone = w.side;
                                if (w.kind === 'strength') {
                                    text = mine?.ranks && theirs?.ranks
                                        ? t('{0} are the stronger team: about {1} points per game better in our ratings (overall rank {2} against {3}, out of {4}).', { 0: team.name, 1: pts, 2: mine.ranks.overall, 3: theirs.ranks.overall, 4: mine.ranks.of })
                                        : t('{0} are the stronger team: about {1} points per game better in our ratings.', { 0: team.name, 1: pts });
                                }
                                else if (w.kind === 'attack') {
                                    const dr = theirs?.ranks?.defence;
                                    text = w.points > 0
                                        ? (dr ? t('{0} should score about {1} points more than an average team against {2}’s defence (rank {3}).', { 0: team.name, 1: pts, 2: other.name, 3: dr }) : t('{0} should score about {1} points more than an average team against {2}’s defence.', { 0: team.name, 1: pts, 2: other.name }))
                                        : (dr ? t('{0}’s defence (rank {1}) should hold {2} to about {3} points below an average team.', { 0: other.name, 1: dr, 2: team.name, 3: pts }) : t('{0}’s defence should hold {1} to about {2} points below an average team.', { 0: other.name, 1: team.name, 2: pts }));
                                    tone = w.points > 0 ? w.side : (w.side === 'H' ? 'A' : 'H');
                                }
                                else if (w.kind === 'home') {
                                    const sp = mine?.splits;
                                    text = sp && sp.homeWon + sp.homeLost > 0 && !mine?.previousSeason
                                        ? t('Home court is worth about {0} points to {1} (home record this season: {2}–{3}).', { 0: pts, 1: team.name, 2: sp.homeWon, 3: sp.homeLost })
                                        : t('Home court is worth about {0} points to {1}.', { 0: pts, 1: team.name });
                                }
                                else if (w.kind === 'b2b') {
                                    text = t('{0} played last night (second game of a back-to-back), which costs about {1} points.', { 0: other.name, 1: pts });
                                }
                                else if (w.kind === 'b2bBoth') {
                                    text = t('Both teams played last night, so tiredness evens out.');
                                    tone = 'N';
                                }
                                else if (w.kind === 'talent') {
                                    text = t('{0} have more talent on the floor right now (the players they used in their latest games): about {1} points.', { 0: team.name, 1: pts });
                                }
                                else {
                                    text = t('Injuries hurt {0} more: they are missing about {1} points of production.', { 0: other.name, 1: pts });
                                }
                                const sub = w.kind === 'attack';
                                return (_jsxs("li", { className: `flex items-start gap-3 text-sm ${sub ? 'pl-5' : ''}`, children: [_jsx("span", { className: `mt-1.5 w-2 h-2 rounded-full shrink-0 ${tone === 'H' ? 'bg-home' : tone === 'A' ? 'bg-away' : 'bg-faint'} ${sub ? 'opacity-60' : ''}` }), _jsx("span", { className: `flex-1 leading-snug ${sub ? 'text-muted' : 'text-ink'}`, children: text }), w.points !== 0 && w.kind !== 'b2bBoth' && (_jsxs("span", { className: `num text-xs font-bold whitespace-nowrap ${tone === 'H' ? 'text-home' : tone === 'A' ? 'text-away' : 'text-muted'}`, children: [tone === 'N' ? '' : '+', pts, " ", t('pts')] }))] }, i));
                            }) }), d.model ? (_jsxs("details", { className: "mt-3", children: [_jsx("summary", { className: "cursor-pointer text-xs text-muted hover:text-ink select-none", children: t('How this was calculated') }), _jsx(ModelTable, { g: g, model: d.model, ratings: d.ratings })] })) : null] })), guessFirstOn() && g.state === 'upcoming' && (_jsx("div", { className: "mt-2 text-right", children: _jsx("button", { type: "button", onClick: () => hideMatch(rid(g)), className: "text-xs text-faint hover:text-ink underline underline-offset-4", children: t('Hide prediction again') }) }))] })) }));
}
/** Written preview: form, home/away record, ratings, rest, shooting, meetings and our verdict — in plain sentences. */
function AnalysisCard({ d }) {
    const g = d.game;
    const pv = d.preview;
    const { hidden } = useReveal(rid(g), rstatus(g), !!g.prediction && !g.prediction.locked);
    if (!pv)
        return null;
    const H = g.home.name, A = g.away.name;
    const paras = [];
    const rec = (side, name, home) => {
        const s = side.splits;
        if (!s.games)
            return null;
        const where = home ? t('{0}–{1} at home', { 0: s.homeWon, 1: s.homeLost }) : t('{0}–{1} on the road', { 0: s.awayWon, 1: s.awayLost });
        return side.previousSeason
            ? t('Last season {0} went {1}–{2} ({3}).', { 0: name, 1: s.won, 2: s.lost, 3: where })
            : t('{0} are {1}–{2} this season ({3}) and have won {4} of their last {5}.', { 0: name, 1: s.won, 2: s.lost, 3: where, 4: side.last10.won, 5: side.last10.won + side.last10.lost });
    };
    const form = [rec(pv.home, H, true), rec(pv.away, A, false)].filter(Boolean).join(' ');
    if (form)
        paras.push(form);
    const streaks = [[pv.home, H], [pv.away, A]]
        .filter(([s]) => !s.previousSeason && s.streak && s.streak.n >= 3)
        .map(([s, n]) => (s.streak.kind === 'W' ? t('{0} have won {1} in a row.', { 0: n, 1: s.streak.n }) : t('{0} have lost {1} in a row.', { 0: n, 1: s.streak.n })));
    if (streaks.length)
        paras.push(streaks.join(' '));
    const rh = pv.home.ranks, ra = pv.away.ranks;
    if (rh && ra) {
        paras.push(t('In our ratings {0} rank {1} in attack and {2} in defence out of {3} teams; {4} rank {5} and {6}.', { 0: H, 1: rh.attack, 2: rh.defence, 3: rh.of, 4: A, 5: ra.attack, 6: ra.defence }));
        // the key matchup: the bigger gap between one side's attack and the other side's defence
        const gapH = ra.defence - rh.attack, gapA = rh.defence - ra.attack;
        const [att, def, ar, dr] = gapH >= gapA ? [H, A, rh.attack, ra.defence] : [A, H, ra.attack, rh.defence];
        if (Math.abs(gapH - gapA) >= 3)
            paras.push(t('The key matchup: {0}’s attack (rank {1}) against {2}’s defence (rank {3}).', { 0: att, 1: ar, 2: def, 3: dr }));
    }
    const sh = d.schedule.home, sa = d.schedule.away;
    if (sh.backToBack || sa.backToBack) {
        paras.push([sh.backToBack ? t('{0} played last night (second game of a back-to-back).', { 0: H }) : '', sa.backToBack ? t('{0} played last night (second game of a back-to-back).', { 0: A }) : ''].filter(Boolean).join(' '));
    }
    else if (sh.restDays !== null && sa.restDays !== null && Math.abs(Math.floor(sh.restDays) - Math.floor(sa.restDays)) >= 2) {
        const fresher = sh.restDays > sa.restDays ? H : A;
        paras.push(t('{0} are fresher, with {1} more days of rest.', { 0: fresher, 1: Math.abs(Math.floor(sh.restDays) - Math.floor(sa.restDays)) }));
    }
    const ph = pv.home.profile, pa = pv.away.profile;
    if (ph.team && pa.team && ph.league && ph.team.threePct !== null && pa.team.threePct !== null && ph.league.threePct !== null) {
        const lg = ph.league.threePct;
        const best = ph.team.threePct - lg >= pa.team.threePct - lg ? [H, ph.team.threePct] : [A, pa.team.threePct];
        if (Math.abs(best[1] - lg) >= 1.5)
            paras.push(best[1] > lg
                ? t('{0} shoot {1}% from three, above the league average of {2}%.', { 0: best[0], 1: best[1], 2: lg })
                : t('Both teams shoot below the league average from three ({0}%).', { 0: lg }));
    }
    if (d.injuries) {
        const key = (list, name) => {
            const out = list.filter(x => x.weight >= 1 && (x.minutes || 0) >= 12).map(x => x.name);
            const maybe = list.filter(x => x.weight >= 0.4 && x.weight < 1 && (x.minutes || 0) >= 12).map(x => x.name);
            return [out.length ? t('{0} will be without {1}.', { 0: name, 1: out.join(', ') }) : '', maybe.length ? t('For {0}, {1} may not play.', { 0: name, 1: maybe.join(', ') }) : ''].filter(Boolean).join(' ');
        };
        const txt = [key(d.injuries.home, H), key(d.injuries.away, A)].filter(Boolean).join(' ');
        if (txt)
            paras.push(txt);
    }
    const p = g.prediction;
    if (pv.h2h.games > 0) {
        // one-sided head-to-head (Oct 2026): say it, and whether our pick agrees. Tested: in basketball past meetings add
        // nothing once form, rest and rosters are known, so they don't move the percentages — but readers should see them.
        const hw = pv.h2h.homeWins, aw = pv.h2h.awayWins, n = pv.h2h.games;
        const dom = n >= 4 ? (hw / n >= 0.75 ? 'H' : aw / n >= 0.75 ? 'A' : null) : null;
        const pickSide = p?.pick && !hidden ? p.pick : null;
        if (dom && pickSide) {
            const dn = dom === 'H' ? H : A, dw = dom === 'H' ? hw : aw;
            paras.push(dom === pickSide
                ? t('{0} also have the upper hand in this matchup: they won {1} of the last {2} meetings.', { 0: dn, 1: dw, 2: n })
                : t('{0} won {1} of the last {2} meetings, but our numbers still favour {3}: in basketball past meetings say little once current form, rest and the rosters are known.', { 0: dn, 1: dw, 2: n, 3: pickSide === 'H' ? H : A }));
        }
        else
            paras.push(t('In their last {0} meetings {1} won {2} and {3} won {4}.', { 0: n, 1: H, 2: hw, 3: A, 4: aw }));
    }
    if (p?.pick && !hidden) {
        const team = p.pick === 'H' ? H : A;
        paras.push(!p.locked && typeof p.pHome === 'number'
            ? t('Our verdict: {0} with {1}%, by about {2} points, with around {3} points in total.', { 0: team, 1: Math.round(p.pick === 'H' ? p.pHome : p.pAway), 2: Math.abs(p.spread || 0).toFixed(1), 3: (p.total || 0).toFixed(0) })
            : t('Our pick: {0}.', { 0: team }));
    }
    if (!paras.length)
        return null;
    return (_jsxs(Card, { title: g.state === 'upcoming' ? t('Our analysis') : t('Our analysis before the game'), children: [_jsx("div", { className: "space-y-3 text-[15px] leading-relaxed text-ink/90", children: paras.map((x, i) => _jsx("p", { children: x }, i)) }), _jsx("p", { className: "mt-4 text-[11px] text-faint", children: t('Written from the numbers: this season’s results, our team ratings, the schedule and box scores.') })] }));
}
/** NBA injury list of both teams; regulars (12+ minutes) are the ones the model takes points off for. */
function InjuriesCard({ d }) {
    const g = d.game;
    const side = (team, list, pts) => (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsx(TeamLogo, { team: team, size: 22 }), _jsx("span", { className: "font-display font-bold text-ink", children: team.name }), pts ? _jsxs("span", { className: "ml-auto text-xs font-bold text-loss num", children: ["\u2212", pts.toFixed(1), " ", t('pts')] }) : null] }), list.length === 0 ? _jsx("p", { className: "text-sm text-faint", children: t('No injuries listed.') }) : (_jsx("ul", { className: "space-y-2", children: list.map(x => (_jsxs("li", { className: "text-sm", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: `w-2 h-2 rounded-full shrink-0 ${x.weight >= 1 ? 'bg-loss' : x.weight >= 0.4 ? 'bg-draw' : 'bg-faint'}` }), x.playerId ? _jsx(Link, { to: `/basketball/player/${x.playerId}`, className: "text-ink font-semibold truncate hover:text-accent", children: x.name }) : _jsx("span", { className: "text-ink font-semibold truncate", children: x.name }), x.minutes !== null && _jsx("span", { className: "text-[11px] text-faint num", children: t('{0} min', { 0: x.minutes }) }), _jsx("span", { className: `ml-auto text-xs font-bold ${x.weight >= 1 ? 'text-loss' : 'text-draw'}`, children: x.status })] }), x.comment && _jsx("p", { className: "mt-0.5 ml-4 text-xs text-muted line-clamp-2", children: x.comment })] }, x.name))) }))] }));
    return (_jsxs(Card, { title: t('Injuries'), action: _jsx("span", { className: "text-xs text-faint", children: t('Updated every 15 minutes') }), children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8", children: [side(g.home, d.injuries.home, g.prediction?.injHome), side(g.away, d.injuries.away, g.prediction?.injAway)] }), _jsx("p", { className: "mt-4 text-[11px] text-faint", children: t('Our prediction takes off the points a team is expected to lose without its injured regulars (by minutes and production; doubtful and questionable players count partly).') })] }));
}
function Stat({ label, value }) {
    return (_jsxs("div", { className: "rounded-xl bg-surface2/60 border border-line/50 p-3 text-center", children: [_jsx("div", { className: "num text-sm sm:text-base font-bold text-ink truncate", children: value }), _jsx("div", { className: "text-[10px] text-faint mt-0.5", children: label })] }));
}
function BoxTab({ d }) {
    const g = d.game;
    const side = (team, s) => {
        const more = s.players.some(p => p.plusMinus !== undefined && p.plusMinus !== null);
        return (_jsx(Card, { title: team.name, children: _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-xs num", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-faint", children: [_jsx("th", { className: "text-left font-semibold py-1", children: t('Player') }), _jsx("th", { className: "text-right font-semibold px-1", children: t('MIN') }), _jsx("th", { className: "text-right font-semibold px-1", children: t('PTS') }), _jsx("th", { className: "text-right font-semibold px-1", children: t('FG') }), _jsx("th", { className: "text-right font-semibold px-1", children: t('3PT') }), _jsx("th", { className: "text-right font-semibold px-1", children: t('FT') }), _jsx("th", { className: "text-right font-semibold px-1", children: t('REB') }), _jsx("th", { className: "text-right font-semibold px-1", children: t('AST') }), more && _jsxs(_Fragment, { children: [_jsx("th", { className: "text-right font-semibold px-1", children: t('STL') }), _jsx("th", { className: "text-right font-semibold px-1", children: t('BLK') }), _jsx("th", { className: "text-right font-semibold px-1", children: t('TO') }), _jsx("th", { className: "text-right font-semibold px-1", children: "+/\u2212" })] })] }) }), _jsx("tbody", { children: s.players.map(pl => (_jsxs("tr", { className: "border-t border-line/40", children: [_jsxs("td", { className: "py-1 font-sans text-ink whitespace-nowrap", children: [_jsx(Link, { to: `/basketball/player/${pl.id}`, className: "hover:text-accent", children: pl.name }), pl.starter && _jsx("span", { className: "ml-1 text-[9px] text-accent font-bold", children: t('S') })] }), _jsx("td", { className: "text-right px-1 text-muted", children: pl.minutes !== null ? Math.round(pl.minutes) : '–' }), _jsx("td", { className: "text-right px-1 text-ink font-bold", children: pl.points ?? '–' }), _jsxs("td", { className: "text-right px-1 text-muted", children: [pl.fgm ?? 0, "/", pl.fga ?? 0] }), _jsxs("td", { className: "text-right px-1 text-muted", children: [pl.tpm ?? 0, "/", pl.tpa ?? 0] }), _jsxs("td", { className: "text-right px-1 text-muted", children: [pl.ftm ?? 0, "/", pl.fta ?? 0] }), _jsx("td", { className: "text-right px-1 text-muted", children: pl.rebounds ?? '–' }), _jsx("td", { className: "text-right px-1 text-muted", children: pl.assists ?? '–' }), more && _jsxs(_Fragment, { children: [_jsx("td", { className: "text-right px-1 text-muted", children: pl.steals ?? '–' }), _jsx("td", { className: "text-right px-1 text-muted", children: pl.blocks ?? '–' }), _jsx("td", { className: "text-right px-1 text-muted", children: pl.turnovers ?? '–' }), _jsx("td", { className: `text-right px-1 ${pl.plusMinus == null ? 'text-faint' : pl.plusMinus > 0 ? 'text-win' : pl.plusMinus < 0 ? 'text-loss' : 'text-muted'}`, children: pl.plusMinus == null ? '–' : pl.plusMinus > 0 ? `+${pl.plusMinus}` : pl.plusMinus })] })] }, pl.id))) })] }) }) }));
    };
    return (_jsxs("div", { className: "grid gap-6 lg:grid-cols-2", children: [side(g.home, d.box.home), side(g.away, d.box.away)] }));
}
/** Points markets, shown once the prediction is uncovered (never under the reveal cover). */
function MarketsGate({ d }) {
    const g = d.game;
    const { hidden } = useReveal(rid(g), rstatus(g), !!g.prediction && !g.prediction.locked);
    if (!d.markets || hidden)
        return null;
    return _jsx(MarketsCard, { g: g, m: d.markets });
}
/** Admin only: correct a wrong final score (swap home/away, set it, or confirm the provider). */
function ResultAdmin({ game, onDone }) {
    const [open, setOpen] = useState(false);
    const [hs, setHs] = useState(String(game.score?.home ?? ''));
    const [as_, setAs] = useState(String(game.score?.away ?? ''));
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);
    const act = async (action, extra = {}) => {
        setBusy(true);
        setMsg(null);
        try {
            await axios.post(`${API_URL}/admin/bb/game/${game.id}/result`, { action, ...extra });
            setMsg('Saved.');
            onDone();
        }
        catch (e) {
            setMsg(e?.response?.data?.error || 'Failed.');
        }
        finally {
            setBusy(false);
        }
    };
    const btn = 'rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-faint disabled:opacity-60';
    return (_jsx("div", { className: "mt-2 text-center", children: !open ? (_jsx("button", { type: "button", onClick: () => setOpen(true), className: "text-[11px] text-faint hover:text-ink underline", children: game.resultCheck ? 'Admin: result flagged — check it' : 'Admin: correct the result' })) : (_jsxs("div", { className: "inline-flex flex-wrap items-center justify-center gap-2 rounded-xl border border-line bg-surface2/50 px-3 py-2 text-xs", children: [_jsx("span", { className: "text-muted", children: game.home.name }), _jsx("input", { value: hs, onChange: e => setHs(e.target.value.replace(/\D/g, '')), className: "w-14 rounded-md border border-line bg-bg px-2 py-1 text-center num", inputMode: "numeric" }), _jsx("span", { className: "text-faint", children: ":" }), _jsx("input", { value: as_, onChange: e => setAs(e.target.value.replace(/\D/g, '')), className: "w-14 rounded-md border border-line bg-bg px-2 py-1 text-center num", inputMode: "numeric" }), _jsx("span", { className: "text-muted", children: game.away.name }), _jsx("button", { type: "button", disabled: busy, onClick: () => act('set', { hs: Number(hs), as_: Number(as_) }), className: btn, children: "Save score" }), _jsx("button", { type: "button", disabled: busy, onClick: () => act('swap'), className: btn, children: "Swap home/away" }), game.resultCheck && _jsx("button", { type: "button", disabled: busy, onClick: () => act('confirm'), className: btn, children: "Provider is right" }), game.corrected && _jsx("button", { type: "button", disabled: busy, onClick: () => act('undo'), className: btn, children: "Undo correction" }), _jsx("button", { type: "button", onClick: () => setOpen(false), className: "text-faint", children: "Close" }), msg && _jsx("span", { className: "text-muted", children: msg })] })) }));
}
