import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import YourPicks from '../components/YourPicks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { API_URL, socket } from '../lib/socket';
import { modelInfo, CONFIDENCE_LABEL, MATCH_TYPE_LABEL, pickOfPrediction } from '../lib/predict';
import { useAuth } from '../lib/auth';
import WinProbability from '../components/WinProbability';
import { useReveal, justRevealed, hideMatch, guessFirstOn } from '../lib/reveal';
import { useUnlocks, unlockMatch, resetDay } from '../lib/unlocks';
import CountUp from '../components/CountUp';
import { RevealCover } from '../components/Reveal';
import PredictionStory from '../components/PredictionStory';
import { FavStar, nameKey as favKey } from '../lib/favorites';
import { t as tt, LOCALE } from '../lib/i18n';
const LIVE = new Set(['IN_PLAY', 'PAUSED']);
const DONE = new Set(['FINISHED', 'AWARDED']);
/* ---------- helpers ---------- */
function fmtDate(iso) {
    return new Date(iso).toLocaleDateString(LOCALE, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}
function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
}
function resultFor(teamId, m) {
    const w = m.score?.winner;
    if (!w)
        return null;
    if (w === 'DRAW')
        return 'D';
    const isHome = m.homeTeam.id === teamId;
    return (w === 'HOME_TEAM') === isHome ? 'W' : 'L';
}
function statusLabel(m) {
    if (m.status === 'IN_PLAY')
        return m.minute ? `${m.minute}'${m.injuryTime ? `+${m.injuryTime}` : ''}` : 'LIVE';
    if (m.status === 'PAUSED')
        return 'Half-time';
    if (m.status === 'FINISHED')
        return 'Full-time';
    if (m.status === 'POSTPONED')
        return 'Postponed';
    if (m.status === 'CANCELLED')
        return 'Cancelled';
    if (m.status === 'SUSPENDED')
        return 'Suspended';
    return fmtTime(m.utcDate);
}
// Display order: the most telling numbers first (like a live-score app)
const STAT_LABELS = {
    expected_goals: tt("Expected goals (xG)"),
    ball_possession: tt("Possession %"),
    shots: tt("Total shots"),
    shots_on_goal: tt("Shots on target"),
    shots_off_goal: tt("Shots off target"),
    blocked_shots: tt("Blocked shots"),
    shots_inside_box: tt("Shots inside the box"),
    shots_outside_box: tt("Shots outside the box"),
    corner_kicks: tt('Corners'),
    saves: tt("Goalkeeper saves"),
    passes: tt('Passes'),
    pass_accuracy: tt("Pass accuracy %"),
    fouls: tt('Fouls'),
    offsides: tt('Offsides'),
    free_kicks: tt("Free kicks"),
    goal_kicks: tt("Goal kicks"),
    throw_ins: tt('Throw-ins'),
    yellow_cards: tt("Yellow cards"),
    red_cards: tt("Red cards")
};
/** Two-sided stat bars (home left, away right), possession as one big split bar. */
function StatsPanel({ home, away, hs, as, keys }) {
    const fmt = (k, v) => (k === 'expected_goals' || k === 'goals_prevented' ? v.toFixed(2) : String(Math.round(v)));
    const poss = keys.includes('ball_possession') ? { h: hs.ball_possession ?? 0, a: as.ball_possession ?? 0 } : null;
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between text-xs font-semibold mb-3", children: [_jsx("span", { className: "text-home truncate", children: home.shortName || home.name }), _jsx("span", { className: "text-away truncate text-right", children: away.shortName || away.name })] }), poss && (_jsxs("div", { className: "mb-5", children: [_jsx("div", { className: "text-[11px] text-faint text-center mb-1.5", children: tt("Possession") }), _jsxs("div", { className: "flex h-7 rounded-lg overflow-hidden text-xs font-bold num", children: [_jsxs("div", { className: "bg-home/80 text-bg grid place-items-center transition-all", style: { width: `${poss.h || 50}%` }, children: [Math.round(poss.h), "%"] }), _jsxs("div", { className: "bg-away/80 text-bg grid place-items-center transition-all", style: { width: `${poss.a || 50}%` }, children: [Math.round(poss.a), "%"] })] })] })), _jsx("div", { className: "space-y-3", children: keys
                    .filter(k => k !== 'ball_possession')
                    .map(k => {
                    const h = hs[k] ?? 0;
                    const a = as[k] ?? 0;
                    const total = h + a || 1;
                    const lead = h === a ? null : h > a ? 'H' : 'A';
                    return (_jsxs("div", { className: "grid grid-cols-[52px_1fr_52px] items-center gap-3 text-sm", children: [_jsx("span", { className: `num font-semibold text-right ${lead === 'H' ? 'text-ink' : 'text-muted'}`, children: fmt(k, h) }), _jsxs("div", { children: [_jsx("div", { className: "text-[11px] text-faint text-center mb-1", children: STAT_LABELS[k] }), _jsxs("div", { className: "flex h-1.5 gap-0.5", children: [_jsx("div", { className: "flex-1 flex justify-end", children: _jsx("div", { className: `h-full rounded-l-full bg-home transition-all ${lead === 'A' ? 'opacity-50' : ''}`, style: { width: `${(h / total) * 100}%` } }) }), _jsx("div", { className: "flex-1", children: _jsx("div", { className: `h-full rounded-r-full bg-away transition-all ${lead === 'H' ? 'opacity-50' : ''}`, style: { width: `${(a / total) * 100}%` } }) })] })] }), _jsx("span", { className: `num font-semibold ${lead === 'A' ? 'text-ink' : 'text-muted'}`, children: fmt(k, a) })] }, k));
                }) })] }));
}
/* ---------- page ---------- */
/** v3 grid breakdown: match type, 1000-point split, per-parameter values × relevance. */
function GridBreakdown({ p, home, away }) {
    const g = p.grid;
    const hn = home.shortName || home.name;
    const an = away.shortName || away.name;
    const DRAW_ROWS = new Set(['#15', '#30', '#16']);
    // rows with weight 0 are measured but carry no points (the October 2026 fit found they add nothing once the others are in)
    const unused = g.rows.filter(r => !r.rel).map(r => tt(r.name));
    const teamRows = g.rows.filter(r => !DRAW_ROWS.has(r.id) && r.rel > 0);
    const drawRows = g.rows.filter(r => DRAW_ROWS.has(r.id) && r.rel > 0);
    return (_jsxs("div", { className: "mt-5 rounded-xl border border-line/70 bg-surface/60 p-4", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 mb-3", children: [_jsxs("div", { className: "text-xs text-muted", children: [_jsx("span", { className: "font-semibold text-ink", children: MATCH_TYPE_LABEL[g.matchType] }), _jsxs("span", { className: "text-faint", children: [" ", tt("· relevance weights for this match type")] })] }), _jsxs("div", { className: "num text-xs text-muted", children: [_jsx("span", { className: "text-home font-semibold", children: g.points.home }), " \u00B7 ", _jsx("span", { className: "text-draw font-semibold", children: g.points.draw }), " \u00B7", ' ', _jsx("span", { className: "text-away font-semibold", children: g.points.away }), " ", _jsx("span", { className: "text-faint", children: "/ 1000" })] })] }), g.reasons.length > 0 && (_jsx("ul", { className: "mb-3 space-y-0.5 text-xs text-muted", children: g.reasons.map((r, i) => (_jsxs("li", { children: ["\u00B7 ", r] }, i))) })), _jsxs("table", { className: "w-full text-xs", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-faint", children: [_jsx("th", { className: "text-left font-medium py-1", children: tt("Parameter") }), _jsx("th", { className: "text-right font-medium py-1 w-12", children: tt("Rel.") }), _jsx("th", { className: "text-right font-medium py-1 w-16", children: hn }), _jsx("th", { className: "text-right font-medium py-1 w-16", children: an }), _jsx("th", { className: "text-right font-medium py-1 w-16", children: tt("Edge") })] }) }), _jsxs("tbody", { children: [teamRows.map(r => (_jsxs("tr", { className: "border-t border-line/40", title: r.note, children: [_jsx("td", { className: "py-1 text-muted", children: tt(r.name) }), _jsx("td", { className: "py-1 text-right num text-faint", children: r.rel }), _jsx("td", { className: "py-1 text-right num text-ink", children: r.home }), _jsx("td", { className: "py-1 text-right num text-ink", children: r.away }), _jsxs("td", { className: `py-1 text-right num font-semibold ${r.edge > 0 ? 'text-home' : r.edge < 0 ? 'text-away' : 'text-faint'}`, children: [r.edge > 0 ? '+' : '', r.edge] })] }, r.id))), _jsxs("tr", { className: "border-t border-line/70 font-semibold", children: [_jsx("td", { className: "py-1 text-ink", children: tt("Total") }), _jsx("td", {}), _jsx("td", { className: "py-1 text-right num text-ink", children: g.totals.home }), _jsx("td", { className: "py-1 text-right num text-ink", children: g.totals.away }), _jsxs("td", { className: `py-1 text-right num ${g.totals.home > g.totals.away ? 'text-home' : 'text-away'}`, children: [g.totals.home - g.totals.away > 0 ? '+' : '', Math.round((g.totals.home - g.totals.away) * 10) / 10] })] })] })] }), drawRows.length > 0 && (_jsxs("div", { className: "mt-3 pt-2 border-t border-line/40 text-xs text-muted flex flex-wrap gap-x-4 gap-y-1", children: [_jsx("span", { className: "text-faint", children: tt("Draw pot") }), drawRows.map(r => (_jsxs("span", { title: r.note, children: [tt(r.name), " ", _jsx("span", { className: "num text-ink", children: r.home }), _jsxs("span", { className: "text-faint", children: ["\u00D7", r.rel] })] }, r.id))), _jsxs("span", { children: [tt("base"), ' ', _jsx("span", { className: "num text-ink", children: g.drawPot.base }), " ", g.drawPot.factors >= 0 ? '+' : '−', " ", _jsx("span", { className: "num text-ink", children: Math.abs(g.drawPot.factors) }), " =", ' ', _jsx("span", { className: "num text-draw font-semibold", children: g.drawPot.total })] })] })), g.scope === 'national' || g.scope === 'cups' ? (_jsx("p", { className: "mt-3 text-[11px] text-faint", children: g.scope === 'national' ? tt("v3's national-team engine. Each parameter is scored among all active national teams (5.5 = average) and weighted by how much it predicted results since 2018. Edge = how many points (out of 1000) that parameter moves toward one side. Friendlies count for less, because teams rotate their squads.") : tt("v3's European-cup engine. Each parameter is scored among all clubs playing in UEFA competitions (5.5 = average), from their league and cup games together, and weighted by how much it predicted past cup results. Edge = how many points (out of 1000) that parameter moves toward one side.") })) : (_jsxs("p", { className: "mt-3 text-[11px] text-faint", children: [tt("Each parameter is scored within the league (5.5 = average; most teams land between 1 and 10, standouts like the league's superteams can go above 10) and multiplied by its relevance for this match type. The difference between the two totals sets the home/away split of the points left after the draw pot, which starts from the goals-based chance of a draw. Weights fitted on the 2024-25 and 2025-26 seasons and checked on 2026-27 (October 2026)."), unused.length > 0 && _jsxs(_Fragment, { children: [" ", tt("Measured but not used, because they add nothing once the others are in:"), ' ', unused.join(', '), "."] })] }))] }));
}
function MatchDetail() {
    const { id } = useParams();
    const matchId = Number(id);
    const [details, setDetails] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    // premium "guess first": the prediction stays covered until the member taps Reveal (upcoming games only)
    const { hidden, reveal } = useReveal(matchId, details?.match.status, true);
    // just unlocked ($15 Premium): play the "v3 is analysing" reveal automatically, then roll the numbers in
    const [unlockAnim, setUnlockAnim] = useState(false);
    // confirmed lineups in: the updated analysis waits behind its own "reveal" button (remembered per match)
    const xiKey = `b2b-xi-seen-${matchId}`;
    const [xiSeen, setXiSeen] = useState(() => { try {
        return localStorage.getItem(xiKey) === '1';
    }
    catch {
        return false;
    } });
    const [xiAnim, setXiAnim] = useState(false);
    const markXiSeen = () => { setXiSeen(true); try {
        localStorage.setItem(xiKey, '1');
    }
    catch { /* private mode */ } };
    const load = (initial = false) => {
        if (initial)
            setLoading(true);
        return axios
            .get(`${API_URL}/matches/${matchId}/details`)
            .then(res => {
            setDetails(res.data.data);
            setError(null);
        })
            .catch(err => setError(err.response?.data?.message || err.message))
            .finally(() => setLoading(false));
    };
    useEffect(() => {
        if (!matchId)
            return;
        load(true);
    }, [matchId]);
    // browser tab: "Arsenal vs Chelsea · SportLikely"
    const tabTitle = details ? `${details.match.homeTeam.shortName || details.match.homeTeam.name} vs ${details.match.awayTeam.shortName || details.match.awayTeam.name}` : '';
    useEffect(() => {
        if (tabTitle)
            document.title = tt("{0} · SportLikely", { 0: tabTitle });
    }, [tabTitle]);
    // Live scores arrive over the socket; full details (events, lineups) are re-fetched on a timer:
    //   live → every 60s · within 2h of kick-off → every 90s (official lineups land ~1h before) · otherwise every 5 min
    const isLive = details ? LIVE.has(details.match.status) : false;
    const isDone = details ? DONE.has(details.match.status) : false;
    const kickoff = details ? new Date(details.match.utcDate).getTime() : 0;
    const hasOfficialLineups = details
        ? (details.match.homeTeam.lineup?.length || 0) > 0 || (details.match.awayTeam.lineup?.length || 0) > 0
        : false;
    useEffect(() => {
        if (!matchId)
            return;
        // rooms belong to one connection: subscribe again after every (re)connect
        const subscribe = () => socket.emit('subscribe_match', matchId);
        subscribe();
        socket.on('connect', subscribe);
        const onLive = (m) => {
            if (m.id !== matchId)
                return;
            // Only take the live fields — the slim live payload has no lineups/stats/events
            setDetails(prev => prev
                ? withLiveChance({ ...prev, match: { ...prev.match, status: m.status, minute: m.minute, injuryTime: m.injuryTime, score: m.score } }, m.prediction?.live)
                : prev);
        };
        socket.on('match:live', onLive);
        let timer = null;
        if (!isDone) {
            const soon = kickoff - Date.now() < 2 * 60 * 60 * 1000 && !hasOfficialLineups;
            const every = isLive ? 60 : soon ? 90 : 300;
            timer = setInterval(() => load(false), every * 1000);
        }
        return () => {
            socket.emit('unsubscribe_match', matchId);
            socket.off('connect', subscribe);
            socket.off('match:live', onLive);
            if (timer)
                clearInterval(timer);
        };
    }, [matchId, isLive, isDone, hasOfficialLineups, Math.floor((kickoff - Date.now()) / (30 * 60 * 1000))]);
    // Which model the Prediction section shows (default: the one the backend prefers, v2 when available)
    const [modelId, setModelId] = useState(null);
    // Probable lineups are built server-side from recent matches; if they weren't ready in time
    // for the first response (API quota), try again a few times shortly after.
    const [probableRetries, setProbableRetries] = useState(0);
    const probableMissing = !!details &&
        !isDone &&
        !hasOfficialLineups &&
        !(details.probableLineups?.home?.lineup.length || details.probableLineups?.away?.lineup.length);
    useEffect(() => {
        if (!probableMissing || probableRetries >= 4)
            return;
        const t = setTimeout(() => {
            setProbableRetries(n => n + 1);
            load(false);
        }, 15 * 1000);
        return () => clearTimeout(t);
    }, [probableMissing, probableRetries]);
    const events = useMemo(() => {
        if (!details)
            return [];
        const m = details.match;
        const list = [];
        (m.goals || []).forEach(g => list.push({
            minute: g.minute,
            extra: g.injuryTime || 0,
            kind: g.type === 'OWN' ? 'own' : g.type === 'PENALTY' ? 'pen' : 'goal',
            teamId: g.team.id,
            text: g.scorer.name + (g.type === 'PENALTY' ? tt(" (pen)") : g.type === 'OWN' ? ' (og)' : ''),
            sub: g.assist ? `assist: ${g.assist.name}` : undefined
        }));
        (m.bookings || []).forEach(b => list.push({ minute: b.minute, extra: 0, kind: b.card.toLowerCase(), teamId: b.team.id, text: b.player.name }));
        (m.substitutions || []).forEach(s => list.push({
            minute: s.minute,
            extra: 0,
            kind: 'sub',
            teamId: s.team.id,
            text: s.playerIn.name,
            sub: `for ${s.playerOut.name}`
        }));
        return list.sort((a, b) => a.minute - b.minute || a.extra - b.extra);
    }, [details]);
    // Page sections as tabs: Prediction first, then Statistics, Lineups and the league table.
    // The open tab lives in the URL hash (#stats, #lineups, #table) so a link can open it directly.
    const [tab, setTab] = useState(() => {
        const h = (typeof window !== 'undefined' ? window.location.hash.slice(1) : '');
        return TAB_IDS.includes(h) ? h : 'prediction';
    });
    const pickTab = (t) => {
        setTab(t);
        try {
            history.replaceState(null, '', t === 'prediction' ? window.location.pathname + window.location.search : `#${t}`);
        }
        catch { /* ignore */ }
    };
    // League table (fetched once per competition; the tab is hidden when there is none)
    const compCode = details?.match.competition.code;
    const [tables, setTables] = useState(null);
    useEffect(() => {
        if (!compCode)
            return;
        let cancelled = false;
        setTables(null);
        axios
            .get(`${API_URL}/leagues/${compCode}/standings`)
            .then(res => !cancelled && setTables(res.data.data?.standings || []))
            .catch(() => !cancelled && setTables([]));
        return () => {
            cancelled = true;
        };
    }, [compCode]);
    // Tab data loaded on first open (built from API-Football: last 10 games, last 5 lineups, last 10 meetings).
    // undefined = not loaded yet, null = nothing available.
    const [xStats, setXStats] = useState(undefined);
    const [xLineups, setXLineups] = useState(undefined);
    const [xH2H, setXH2H] = useState(undefined);
    const [xRest, setXRest] = useState(undefined);
    const requested = useRef({ id: 0, parts: new Set() });
    useEffect(() => {
        if (!matchId || !details)
            return;
        if (requested.current.id !== matchId) {
            requested.current = { id: matchId, parts: new Set() };
            setXStats(undefined);
            setXLineups(undefined);
            setXH2H(undefined);
            setXRest(undefined);
        }
        const setters = { stats: setXStats, lineups: setXLineups, h2h: setXH2H, rest: setXRest };
        // the open tab; the expected lineups also load in the background from the prediction tab
        const parts = [tab, ...(tab === 'prediction' ? ['lineups'] : [])].filter(p => p in setters);
        for (const part of parts) {
            if (requested.current.parts.has(part))
                continue;
            requested.current.parts.add(part);
            const id = matchId;
            axios
                .get(`${API_URL}/matches/${id}/extras/${part}`, { timeout: 90000 })
                .then(res => requested.current.id === id && setters[part](res.data.data ?? null))
                .catch(() => requested.current.id === id && setters[part](null));
        }
    }, [tab, matchId, !!details]);
    if (loading)
        return _jsx("div", { className: "max-w-5xl mx-auto px-4 py-16 text-center text-muted", children: tt("Loading match…") });
    if (error || !details)
        return (_jsxs("div", { className: "max-w-5xl mx-auto px-4 py-10", children: [_jsx(Link, { to: "/matches", className: "text-sm text-muted hover:text-ink", children: tt("← Back") }), _jsxs("div", { className: "mt-4 card border-loss/40 text-loss rounded-lg p-4", children: [tt("Could not load match:"), ' ', error || tt("unknown error")] })] }));
    const m = details.match;
    const home = m.homeTeam;
    const away = m.awayTeam;
    const live = LIVE.has(m.status);
    const done = DONE.has(m.status);
    const halted = ['SUSPENDED', 'POSTPONED', 'CANCELLED'].includes(m.status);
    const showScore = live || done;
    // v1 (standings) is a fallback only: shown when no other model covers the match
    const allModels = details.predictions && details.predictions.length ? details.predictions : details.prediction ? [details.prediction] : [];
    // Only our own model (v3) is shown; the older v1/v2 stay as a fallback for matches v3 doesn't cover
    const OLD = ['poisson-dc-v1', 'dc-history-v2'];
    const models = allModels.some(m => !OLD.includes(m.model))
        ? allModels.filter(m => !OLD.includes(m.model))
        : allModels.some(m => m.model === 'dc-history-v2') ? allModels.filter(m => m.model === 'dc-history-v2') : allModels;
    // our main model first (v3 for leagues, national teams, European cups); older models only on request
    const p = (modelId && models.find(m => m.model === modelId)) || models.find(m => ['grid-v3', 'elo-intl', 'elo-euro'].includes(m.model)) || details.prediction || models[0] || null;
    const ft = m.score.fullTime;
    const ht = m.score.halfTime;
    const referee = (m.referees || []).find(r => !r.type || r.type === 'REFEREE') || (m.referees || [])[0];
    const homeStats = home.statistics || null;
    const awayStats = away.statistics || null;
    const statKeys = homeStats && awayStats ? Object.keys(STAT_LABELS).filter(k => k in homeStats && k in awayStats) : [];
    const hasLineups = (home.lineup?.length || 0) > 0 || (away.lineup?.length || 0) > 0;
    // Usual XIs (from recent matches) — shown until the official lineups arrive
    const pl = details.probableLineups;
    const probable = !hasLineups && !done && pl && ((pl.home?.lineup.length || 0) > 0 || (pl.away?.lineup.length || 0) > 0)
        ? {
            home: { ...home, formation: pl.home?.formation || null, lineup: pl.home?.lineup || [], bench: [], basedOn: pl.home?.basedOn || 0 },
            away: { ...away, formation: pl.away?.formation || null, lineup: pl.away?.lineup || [], bench: [], basedOn: pl.away?.basedOn || 0 },
            basedOn: { home: pl.home?.basedOn || 0, away: pl.away?.basedOn || 0 }
        }
        : null;
    // expected XI from the last 5 lineups (API-Football), in the same shape the pitch draws
    const xProbable = xLineups && ((xLineups.home?.lineup.length || 0) > 0 || (xLineups.away?.lineup.length || 0) > 0)
        ? {
            home: { ...home, formation: xLineups.home?.formation || null, lineup: xLineups.home?.lineup || [], bench: [], basedOn: xLineups.home?.basedOn || 0 },
            away: { ...away, formation: xLineups.away?.formation || null, lineup: xLineups.away?.lineup || [], bench: [], basedOn: xLineups.away?.basedOn || 0 }
        }
        : null;
    // a locked upcoming match carries no pick at all
    const pick = p && !(p.locked && !p.pick) ? pickOfPrediction(p) : null;
    const pickVar = pick === 'H' ? '--home' : pick === 'A' ? '--away' : '--draw';
    const tableTotals = (tables || []).filter(t => t.type === 'TOTAL');
    const tableInvolving = tableTotals.filter(t => t.table.some(r => r.team.id === home.id || r.team.id === away.id));
    const tableShow = tableInvolving.length ? tableInvolving : tableTotals;
    const tabs = [
        { id: 'prediction', label: tt('Prediction'), hint: '' },
        ...(done ? [{ id: 'highlights', label: tt('Highlights'), short: tt('Video'), hint: tt("Official match highlights") }] : []),
        { id: 'stats', label: tt('Statistics'), short: tt('Stats'), hint: live ? tt("Live stats, match events and averages") : done ? tt("Match stats, events and averages") : tt("Averages from the last 10 games"), live },
        { id: 'lineups', label: tt('Lineups & injuries'), short: tt('Lineups'), hint: hasLineups ? tt("Official lineups") : done ? tt('Lineups') : tt("Expected XI from the last 5 games") },
        { id: 'rest', label: tt('Schedule & rest'), short: tt('Rest'), hint: tt("Days of rest, recent and next games") },
        { id: 'h2h', label: tt('H2H'), hint: tt("Last 10 meetings and recent form") },
        ...(tables === null || tableShow.length ? [{ id: 'table', label: tt('Standings'), short: tt('Table'), hint: tt('{0} table', { 0: m.competition.name }) }] : [])
    ];
    // "Matchday 2 · League Stage · Group A" (the "·" of the translated "· Matchday" moves to the join)
    const roundBits = [
        m.matchday ? `${tt("· Matchday").replace(/^·\s*/, '')} ${m.matchday}` : null,
        m.stage && m.stage !== 'REGULAR_SEASON' ? m.stage.replace(/_/g, ' ').toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/ - /g, ' · ') : null,
        m.group ? m.group.replace(/_/g, ' ') : null
    ].filter((x) => !!x);
    return (_jsxs("div", { className: "max-w-5xl mx-auto px-4 sm:px-6 py-6", children: [tabTitle && _jsxs("h1", { className: "sr-only", children: [tabTitle, m.competition?.name ? ` · ${m.competition.name}` : '', " ", tt("prediction")] }), _jsxs(Link, { to: "/matches", className: "inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors", children: [_jsx("span", { "aria-hidden": true, children: "\u2190" }), " ", tt("All matches")] }), _jsxs("div", { className: `mt-4 card relative overflow-hidden p-4 sm:p-8 ${live ? 'shadow-glow border-live/40' : ''}`, children: [pick && (_jsx("div", { className: "pointer-events-none absolute inset-0 opacity-[0.10]", style: { background: `radial-gradient(700px 260px at 50% 120%, rgb(var(${pickVar})), transparent 70%)` } })), _jsxs("div", { className: "relative mb-5 sm:mb-6 flex flex-col items-center gap-1 text-center sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:text-left text-sm text-muted", children: [_jsxs("div", { className: "min-w-0 max-w-full flex flex-col items-center gap-0.5 sm:flex-row sm:items-center sm:gap-2", children: [_jsxs(Link, { to: `/league/${m.competition.code}`, className: "inline-flex items-center gap-2 max-w-full min-w-0 hover:text-ink", children: [m.competition.emblem && _jsx("img", { src: m.competition.emblem, alt: "", className: "w-5 h-5 object-contain shrink-0" }), _jsx("span", { className: "font-semibold text-ink/90 hover:underline truncate", children: m.competition.name })] }), roundBits.length > 0 && (_jsxs("span", { className: "text-xs sm:text-sm text-faint sm:whitespace-nowrap", children: [_jsx("span", { className: "hidden sm:inline", children: "\u00B7 " }), roundBits.join(' · ')] }))] }), _jsxs("div", { className: "flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs sm:text-sm", children: [m.competition.trial && (_jsx("span", { className: "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-draw/15 text-draw", title: tt("We added this league recently. Its predictions are being tested and don’t count in our public record yet."), children: tt("New league · in testing") })), _jsx("span", { className: "text-faint whitespace-nowrap", children: fmtDate(m.utcDate) })] })] }), _jsxs("div", { className: "relative grid grid-cols-[1fr_auto_1fr] items-start sm:items-center gap-2 sm:gap-8", children: [_jsx(TeamHero, { team: home, align: "right", code: m.competition?.code }), _jsxs("div", { className: "text-center min-w-[96px] sm:min-w-[170px] self-center", children: [showScore ? (_jsxs("div", { className: "num text-5xl sm:text-6xl font-extrabold text-ink tracking-tight", children: [ft.home ?? 0, _jsx("span", { className: "text-faint mx-2 font-light", children: ":" }), ft.away ?? 0] })) : (_jsx("div", { className: "num text-4xl sm:text-5xl font-extrabold text-ink tracking-tight", children: fmtTime(m.utcDate) })), showScore && ht && ht.home !== null && (done || m.status === 'PAUSED' || (m.minute ?? 0) > 45) && (_jsxs("div", { className: "num text-xs text-faint mt-1", children: [tt("HT"), ' ', ht.home, "\u2013", ht.away] })), _jsxs("div", { className: `mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider px-3 py-1 rounded-full border ${live ? 'bg-live/10 text-live border-live/30' : halted ? 'bg-loss/10 text-loss border-loss/30' : done ? 'bg-surface2 text-muted border-line' : 'bg-accent/10 text-accent border-accent/30'}`, children: [live && _jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-live animate-pulseDot" }), live ? statusLabel(m).toUpperCase() : halted ? tt(statusLabel(m)).toUpperCase() : done ? tt("FULL-TIME") : tt("KICK-OFF")] }), halted && (_jsx("p", { className: "mt-2 max-w-[260px] mx-auto text-[11px] text-muted", children: m.status === 'CANCELLED'
                                            ? tt("This match was abandoned or cancelled. It does not count in our record.")
                                            : m.status === 'SUSPENDED'
                                                ? tt("This match was suspended. It does not count in our record unless it is completed later.")
                                                : tt("This match was postponed. Our prediction stays until the new date.") }))] }), _jsx(TeamHero, { team: away, align: "left", code: m.competition?.code })] }), (m.venue || referee || m.attendance) && (_jsxs("div", { className: "relative mt-6 pt-4 border-t border-line/60 flex flex-wrap gap-x-6 gap-y-1 justify-center text-xs text-faint", children: [m.venue && (_jsxs("span", { children: [tt("Venue"), ' ', _jsx("span", { className: "text-muted", children: m.venue }), " ", _jsxs("span", { className: "text-faint", children: ["(", home.shortName || home.name, ")"] })] })), referee && _jsxs("span", { children: [tt("Referee"), ' ', _jsx("span", { className: "text-muted", children: referee.name })] }), m.attendance && _jsxs("span", { children: [tt("Attendance"), ' ', _jsx("span", { className: "num text-muted", children: m.attendance.toLocaleString() })] })] }))] }), _jsx("div", { className: "sticky top-16 sm:top-[72px] z-30 -mx-4 sm:mx-0 mt-6 px-4 sm:px-0 py-2 bg-bg/35 backdrop-blur-xl", children: _jsx("nav", { className: "flex gap-1 p-1 rounded-full bg-surface2/60 border border-line/60 overflow-x-auto no-scrollbar", "aria-label": tt("Match sections"), children: tabs.map(t => (_jsxs("button", { type: "button", onClick: () => pickTab(t.id), "aria-current": tab === t.id ? 'page' : undefined, className: `flex-1 min-w-max inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-full text-[13px] sm:text-sm font-semibold transition-colors ${tab === t.id ? 'bg-accent text-bg shadow' : 'text-muted hover:text-ink'}`, children: [t.short ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "sm:hidden", children: t.short }), _jsx("span", { className: "hidden sm:inline", children: t.label })] })) : t.label, t.live && _jsx("span", { className: `w-1.5 h-1.5 rounded-full animate-pulseDot ${tab === t.id ? 'bg-bg' : 'bg-live'}` })] }, t.id))) }) }), _jsxs("div", { className: "mt-4 space-y-6 min-w-0", children: [tab === 'prediction' && (_jsxs(_Fragment, { children: [_jsx(Section, { title: tt("Prediction"), note: p ? [modelInfo(p.model).tag, modelInfo(p.model).name.replace(new RegExp(`^${modelInfo(p.model).tag} · `), ''), p.confidence ? CONFIDENCE_LABEL[p.confidence] : null].filter(Boolean).join(' · ') : undefined, children: p && p.locked ? (_jsx(LockedPrediction, { pick: pick, home: home, away: away, matchId: m.id, status: m.status, onUnlocked: () => { setUnlockAnim(true); load(false); } })) : p && pick ? (hidden || unlockAnim ? (_jsx(RevealCover, { autoStart: unlockAnim, onReveal: () => {
                                        setUnlockAnim(false);
                                        reveal();
                                    } }, unlockAnim ? 'auto' : 'cover')) : xiAnim ? (_jsx(RevealCover, { autoStart: true, onReveal: () => { setXiAnim(false); markXiSeen(); } }, "xi")) : p.beforeLineups && !xiSeen && ['SCHEDULED', 'TIMED'].includes(m.status) ? (_jsx(LineupUpdateCover, { before: p.beforeLineups, home: home, away: away, onReveal: () => setXiAnim(true) })) : (_jsxs(_Fragment, { children: [models.length > 1 && (_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 mb-4", children: [_jsx("div", { className: "seg", children: models.map(m => {
                                                        const info = modelInfo(m.model);
                                                        return (_jsxs("button", { onClick: () => setModelId(m.model), className: `seg-btn flex items-center gap-1.5 ${p.model === m.model ? 'seg-btn-active' : ''}`, title: info.desc, children: [_jsx("span", { className: "font-bold", children: info.tag }), _jsx("span", { className: "hidden sm:inline", children: info.name })] }, m.model));
                                                    }) }), _jsx("span", { className: "text-[11px] text-faint", children: modelInfo(p.model).desc })] })), _jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsx(OutcomeTile, { k: "H", label: home.shortName || home.name, v: p.home, active: pick === 'H', roll: justRevealed(matchId), delay: 0 }), _jsx(OutcomeTile, { k: "D", label: tt("Draw"), v: p.draw, active: pick === 'D', roll: justRevealed(matchId), delay: 120 }), _jsx(OutcomeTile, { k: "A", label: away.shortName || away.name, v: p.away, active: pick === 'A', roll: justRevealed(matchId), delay: 240 })] }), (() => {
                                            const opts = [
                                                { k: 'H', label: home.shortName || home.name, v: p.home },
                                                { k: 'D', label: tt('Draw'), v: p.draw },
                                                { k: 'A', label: away.shortName || away.name, v: p.away }
                                            ].sort((x, y) => y.v - x.v);
                                            const top = opts[0];
                                            if (top.v >= 50)
                                                return (_jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-2 text-sm", children: [_jsx("span", { className: `px-2.5 py-1 rounded-full text-xs font-bold border ${top.v >= 60 ? 'bg-accent/15 text-accent border-accent/40' : 'bg-surface2 text-ink border-line'}`, children: top.v >= 70 ? tt("Very strong pick") : top.v >= 60 ? tt("Strong pick") : tt("Pick") }), _jsxs("span", { className: "text-muted", children: [top.label, " ", _jsxs("span", { className: "num text-ink font-semibold", children: [Math.round(top.v), "%"] })] })] }));
                                            const pair = opts.slice(0, 2);
                                            return (_jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-2 text-sm", children: [_jsx("span", { className: "px-2.5 py-1 rounded-full text-xs font-bold border bg-surface2 text-ink border-line", children: tt("Close game · two options") }), _jsxs("span", { className: "text-muted", children: [pair[0].label, " ", tt("or"), ' ', pair[1].label.toLowerCase() === 'draw' ? tt("draw") : pair[1].label, ' ', _jsxs("span", { className: "num text-ink font-semibold", children: [Math.round(pair[0].v + pair[1].v), "%"] })] })] }));
                                        })(), _jsxs("div", { className: "flex h-2.5 gap-[3px] mt-4", children: [_jsx("div", { className: `rounded-full bg-home ${pick === 'H' ? '' : 'opacity-35'}`, style: { width: `calc(${p.home}% - 3px)` } }), _jsx("div", { className: `rounded-full bg-draw ${pick === 'D' ? '' : 'opacity-35'}`, style: { width: `calc(${p.draw}% - 3px)` } }), _jsx("div", { className: `rounded-full bg-away ${pick === 'A' ? '' : 'opacity-35'}`, style: { width: `calc(${p.away}% - 3px)` } })] }), p.live && LIVE.has(m.status) && _jsx(LiveChance, { p: p, home: home, away: away, paused: m.status === 'PAUSED' }), ['SCHEDULED', 'TIMED'].includes(m.status) && (_jsx(LineupTip, { kickoff: kickoff, lineupsOut: hasLineups, usesLineups: p.model === 'grid-v3' })), p.frozen && (_jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-2 text-xs text-muted", children: [_jsx("span", { className: "px-2.5 py-1 rounded-full bg-surface2 border border-line font-semibold text-ink", children: tt("Saved before kick-off") }), _jsxs("span", { children: [tt("This is exactly what we predicted before the game — it is never recalculated after the result."), p.frozen.full ? '' : tt(" The detailed breakdown was only stored from 26 Sept 2026.")] })] })), p.beforeLineups && _jsx(LineupChange, { p: p, home: home, away: away }), _jsx(PredictionStory, { p: p, home: home.shortName || home.name, away: away.shortName || away.name, upcoming: ['SCHEDULED', 'TIMED'].includes(m.status), friendly: /friendl/i.test(m.competition.name || '') }), guessFirstOn() && ['SCHEDULED', 'TIMED'].includes(m.status) && (_jsx("div", { className: "mt-2 text-right", children: _jsx("button", { type: "button", onClick: () => hideMatch(matchId), className: "text-xs text-faint hover:text-ink underline underline-offset-4", children: tt("Hide prediction again") }) })), _jsx(GoalsPanel, { p: p, home: home, away: away, roll: justRevealed(matchId) }), p.grid && (_jsxs("details", { className: "mt-4 group", children: [_jsx("summary", { className: "cursor-pointer text-xs text-muted hover:text-ink select-none", children: tt("For experts: the full model table") }), _jsx(GridBreakdown, { p: p, home: home, away: away })] })), _jsxs("details", { className: "mt-4 group", children: [_jsx("summary", { className: "cursor-pointer text-xs text-muted hover:text-ink select-none", children: p.grid ? tt("Goal model behind the extras") : tt("How this was calculated") }), p.model.startsWith('elo-') ? (_jsxs("div", { className: "mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-muted", children: [_jsxs("span", { children: [home.shortName || home.name, " ", tt("Elo")] }), _jsx("span", { className: "num text-ink", children: p.factors.homeAttack }), _jsxs("span", { children: [away.shortName || away.name, " ", tt("Elo")] }), _jsx("span", { className: "num text-ink", children: p.factors.awayAttack }), _jsx("span", { children: tt("Home advantage (Elo points)") }), _jsx("span", { className: "num text-ink", children: p.factors.homeAdvantage }), _jsxs("span", { children: [tt("Squad value adjustment (Elo points, + favours"), ' ', home.shortName || home.name, ")"] }), _jsxs("span", { className: "num text-ink", children: [p.factors.homeForm > 0 ? '+' : '', p.factors.homeForm] }), _jsx("span", { children: tt("Matches rated") }), _jsxs("span", { className: "num text-ink", children: [p.factors.gamesPlayed.home, " / ", p.factors.gamesPlayed.away] })] })) : (_jsxs("div", { className: "mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-muted", children: [_jsxs("span", { children: [home.shortName || home.name, " ", tt("attack / defence")] }), _jsxs("span", { className: "num text-ink", children: [p.factors.homeAttack, " / ", p.factors.homeDefence] }), _jsxs("span", { children: [away.shortName || away.name, " ", tt("attack / defence")] }), _jsxs("span", { className: "num text-ink", children: [p.factors.awayAttack, " / ", p.factors.awayDefence] }), _jsx("span", { children: tt("Home advantage") }), _jsxs("span", { className: "num text-ink", children: ["\u00D7", p.factors.homeAdvantage] }), _jsx("span", { children: tt("Evidence (weighted games)") }), _jsxs("span", { className: "num text-ink", children: [p.factors.gamesPlayed.home, " / ", p.factors.gamesPlayed.away] }), _jsx("span", { children: tt("League average goals per team") }), _jsx("span", { className: "num text-ink", children: p.factors.leagueAvgGoals }), _jsx("span", { children: tt("Other likely scores") }), _jsx("span", { className: "num text-ink", children: p.topScores.slice(1).map(sc => `${sc.home}–${sc.away} (${Math.round(sc.prob)}%)`).join(' · ') })] })), _jsx("p", { className: "mt-3 text-xs text-faint", children: tt("Strength = goals per game relative to the league average, adjusted for opponent quality and shrunk toward average early in the season (1.00 = average). Attack above 1 is good; defence below 1 is good.") })] })] }))) : (_jsx("p", { className: "text-sm text-faint", children: tt("No prediction available for this match yet.") })) }), _jsx(YourPicks, { sport: "fb", gameId: m.id, home: home.shortName || home.name, away: away.shortName || away.name }), (live || done) && p && !p.locked && !hidden && !unlockAnim && (_jsx(Section, { title: live ? tt("Live win probability") : tt("How the game swung"), note: tt("From our pre-match prediction, updated with the score, time and red cards"), children: _jsx(WinProbability, { p: p, m: m }) })), _jsx("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3", children: tabs.filter(t => t.id !== 'prediction').map(t => (_jsxs("button", { type: "button", onClick: () => pickTab(t.id), className: "card p-4 text-left hover:border-accent/50 transition-colors", children: [_jsxs("div", { className: "font-display font-bold text-ink", children: [t.label, " ", _jsx("span", { "aria-hidden": true, className: "text-accent", children: "\u2192" })] }), _jsx("div", { className: "text-xs text-muted mt-1", children: t.hint })] }, t.id))) })] })), tab === 'highlights' && done && _jsx(Highlights, { matchId: matchId }), tab === 'stats' && (_jsxs(_Fragment, { children: [live && (_jsx(Section, { title: tt("Live stats"), note: m.minute ? tt("{0}'{1} · updates every minute", { 0: m.minute, 1: m.injuryTime ? `+${m.injuryTime}` : '' }) : tt("updates every minute"), children: statKeys.length > 0 && homeStats && awayStats ? (_jsx(StatsPanel, { home: home, away: away, hs: homeStats, as: awayStats, keys: statKeys })) : (_jsx("p", { className: "text-sm text-muted", children: tt("Our data provider doesn’t publish live statistics for this match (common for friendlies and some smaller competitions). Score, cards, goals and substitutions still update live.") })) })), events.length > 0 && (_jsx(Section, { title: tt("Match events"), children: _jsxs("ol", { className: "relative", children: [_jsx("div", { className: "absolute left-1/2 top-0 bottom-0 w-px bg-line/70 -translate-x-1/2" }), events.map((e, i) => {
                                            const isHome = e.teamId === home.id;
                                            return (_jsxs("li", { className: `relative grid grid-cols-[1fr_56px_1fr] items-center py-1.5 text-sm ${isHome ? '' : ''}`, children: [_jsx("div", { className: `${isHome ? 'text-right pr-3' : ''}`, children: isHome && _jsx(EventText, { e: e, align: "right" }) }), _jsx("div", { className: "flex items-center justify-center", children: _jsxs("span", { className: "num text-[11px] text-faint bg-surface px-1.5 py-0.5 rounded-md border border-line/60", children: [e.minute, "'", e.extra ? `+${e.extra}` : ''] }) }), _jsx("div", { className: `${!isHome ? 'pl-3' : ''}`, children: !isHome && _jsx(EventText, { e: e, align: "left" }) })] }, i));
                                        })] }) })), !live && statKeys.length > 0 && homeStats && awayStats && (_jsx(Section, { title: tt("Statistics"), children: _jsx(StatsPanel, { home: home, away: away, hs: homeStats, as: awayStats, keys: statKeys }) })), _jsxs("section", { children: [_jsxs("div", { className: "flex items-baseline justify-between gap-3 mb-3 px-1", children: [_jsx("h2", { className: "font-display text-lg font-bold text-ink", children: tt("Statistics") }), _jsxs("span", { className: "text-xs text-faint", children: [tt("Last"), ' ', Math.max(xStats?.home.games || 0, xStats?.away.games || 0) || 10, " ", tt("games · all competitions")] })] }), xStats === undefined ? (_jsx("div", { className: "rounded-2xl border border-line/60 bg-surface2/30 p-10 text-sm text-muted text-center", children: tt("Loading the last 10 games of both teams…") })) : xStats && (xStats.home.games || xStats.away.games) ? (_jsx(AveragesPanel, { home: home, away: away, h: xStats.home, a: xStats.away, form: { home: details.form.home.map(x => resultFor(home.id, x)).filter((r) => !!r).reverse(), away: details.form.away.map(x => resultFor(away.id, x)).filter((r) => !!r).reverse() } })) : (_jsx("div", { className: "rounded-2xl border border-line/60 bg-surface2/30 p-6 text-sm text-faint", children: tt("No recent games found for these teams.") }))] })] })), tab === 'h2h' && (_jsxs(_Fragment, { children: [(() => {
                                // the copy inside the match details can come without totals (some competitions): only used when complete
                                const early = details.head2head?.aggregates && Array.isArray(details.head2head.matches) ? details.head2head : null;
                                const h2h = xH2H?.aggregates && Array.isArray(xH2H.matches) ? xH2H : early;
                                if (xH2H === undefined && !early)
                                    return _jsx("p", { className: "text-sm text-muted text-center py-10", children: tt("Loading head-to-head…") });
                                return h2h && h2h.aggregates.numberOfMatches > 0 ? (_jsx(Section, { title: tt("Last {0} meetings", { 0: h2h.matches.length }), note: h2h.matches.length ? tt("since {0}", { 0: new Date(h2h.matches[h2h.matches.length - 1].utcDate).getFullYear() }) : undefined, children: _jsx(H2H, { h2h: h2h, home: home, away: away }) })) : (_jsx("p", { className: "text-sm text-faint text-center py-6", children: tt("These teams have never met in the games we can see.") }));
                            })(), _jsx(Section, { title: tt("Form"), note: tt("Last results"), children: _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8", children: [_jsx(TeamPanel, { team: home, side: "H", row: details.standings.home, recent: details.form.home }), _jsx(TeamPanel, { team: away, side: "A", row: details.standings.away, recent: details.form.away })] }) })] })), tab === 'lineups' && (_jsxs(_Fragment, { children: [hasLineups ? (_jsxs(Section, { title: live ? tt("Live pitch") : done ? tt("Lineups and match events") : tt("Official lineups"), note: [home.formation, away.formation].filter(Boolean).join(' vs ') || undefined, children: [live || done ? _jsx(LivePitch, { m: m, home: home, away: away, live: live }) : _jsx(Pitch, { home: home, away: away, code: m.competition?.code }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6 mt-5", children: [_jsx(Bench, { team: home, code: m.competition?.code }), _jsx(Bench, { team: away, code: m.competition?.code })] })] })) : !done && xProbable ? (_jsxs(Section, { title: tt("Probable lineups"), note: [xProbable.home.formation, xProbable.away.formation].filter(Boolean).join(' vs ') || undefined, children: [_jsx(Pitch, { home: xProbable.home, away: xProbable.away, probable: true, code: m.competition?.code }), _jsxs("div", { className: "mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-faint", children: [_jsx("span", { children: tt("Our expected XI from each team's last {0} games: the formation they used most, and the player who played each position most · the dots show how many of those games he started", { 0: Math.max(xProbable.home.basedOn || 0, xProbable.away.basedOn || 0) }) }), _jsxs("span", { className: "inline-flex items-center gap-1.5", children: [_jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-accent animate-pulseDot" }), tt("Replaced automatically when the official lineups are published (~1h before kick-off)")] })] })] })) : !done && xLineups === undefined && !probable ? (_jsx("p", { className: "text-sm text-muted text-center py-10", children: tt("Working out the expected lineups from the last 5 games…") })) : probable ? (_jsxs(Section, { title: tt("Probable lineups"), note: [probable.home.formation, probable.away.formation].filter(Boolean).join(' vs ') || undefined, children: [_jsx(Pitch, { home: probable.home, away: probable.away, probable: true, code: m.competition?.code }), _jsxs("div", { className: "mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-faint", children: [_jsx("span", { children: tt("Usual XI from each team's last {0} matches · the dots show how many of those a player started", { 0: Math.max(probable.basedOn.home, probable.basedOn.away) }) }), _jsxs("span", { className: "inline-flex items-center gap-1.5", children: [_jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-accent animate-pulseDot" }), tt("Replaced automatically when the official lineups are published (~1h before kick-off)")] })] })] })) : (_jsx("p", { className: "text-xs text-faint text-center", children: live || done ? tt("No lineup data from the provider for this match.") : tt("Lineups are published about an hour before kick-off.") })), xLineups?.injuries && (_jsx(Section, { title: tt("Injuries & suspensions"), note: tt("Importance 1–5: how often he started lately and his value to the squad"), children: xLineups.injuries.home.length || xLineups.injuries.away.length ? (_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8", children: [_jsx(InjuryList, { team: home, list: xLineups.injuries.home }), _jsx(InjuryList, { team: away, list: xLineups.injuries.away })] })) : (_jsx("p", { className: "text-sm text-faint", children: done ? tt("No missing players were listed for this match.") : tt("No missing players listed yet — the list usually fills in during the days before the game.") })) }))] })), tab === 'rest' && (xRest === undefined ? (_jsx("p", { className: "text-sm text-muted text-center py-10", children: tt("Loading schedule…") })) : xRest ? (_jsx(_Fragment, { children: _jsxs(Section, { title: tt("Schedule & rest"), note: tt("All competitions"), children: [_jsx(RestSummary, { home: home, away: away, h: xRest.home, a: xRest.away }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mt-5", children: [_jsx(RestPanel, { team: home, side: "H", s: xRest.home }), _jsx(RestPanel, { team: away, side: "A", s: xRest.away })] })] }) })) : (_jsx("p", { className: "text-sm text-faint text-center py-10", children: tt("No schedule data for this match.") }))), tab === 'table' && (tables === null ? (_jsx("p", { className: "text-sm text-muted text-center py-10", children: tt("Loading table…") })) : tableShow.length ? (_jsx(LeagueTable, { tables: tableShow, name: details.match.competition.name, home: home, away: away })) : (_jsx("p", { className: "text-sm text-faint text-center py-10", children: tt("There is no league table for this competition.") })))] })] }));
}
/* ---------- pieces ---------- */
/** Lineups are in: the earlier numbers, and a button to reveal the analysis updated with the confirmed XI. */
/** Socket update: the new live win chance goes on the main prediction and on the same model in the list. */
function withLiveChance(d, live) {
    if (!live)
        return d;
    const model = d.prediction?.model;
    return {
        ...d,
        prediction: d.prediction ? { ...d.prediction, live } : d.prediction,
        predictions: d.predictions?.map(x => (x.model === model ? { ...x, live } : x))
    };
}
/** While the match is played: win chance now vs before kick-off. */
function LiveChance({ p, home, away, paused }) {
    const l = p.live;
    const cap = (v) => Math.min(99, Math.max(1, Math.round(v)));
    const rows = [
        { k: 'H', label: home.shortName || home.name, now: l.home, before: p.home, bar: 'bg-home' },
        { k: 'D', label: tt("Draw"), now: l.draw, before: p.draw, bar: 'bg-draw' },
        { k: 'A', label: away.shortName || away.name, now: l.away, before: p.away, bar: 'bg-away' }
    ];
    const top = [...rows].sort((a, b) => b.now - a.now)[0];
    return (_jsxs("div", { className: "mt-4 rounded-2xl border border-live/40 bg-live/[0.06] p-3 sm:p-4", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "inline-block w-2 h-2 rounded-full bg-live animate-pulseDot", "aria-hidden": true }), _jsx("span", { className: "text-sm font-bold text-ink", children: tt("Live win chance") })] }), _jsxs("span", { className: "num text-xs font-semibold text-live", children: [paused ? tt("HT") : `${Math.min(90, l.minute)}'${l.minute > 90 ? '+' : ''}`, " \u00B7 ", l.score[0], "-", l.score[1]] })] }), _jsx("div", { className: "grid grid-cols-3 gap-2 mt-3", children: rows.map(r => {
                    const diff = Math.round(r.now) - Math.round(r.before);
                    return (_jsxs("div", { className: `rounded-xl px-2 py-2 text-center ${r.k === top.k ? 'bg-surface border border-line' : ''}`, children: [_jsx("div", { className: "text-[11px] text-muted truncate", children: r.label }), _jsxs("div", { className: "num text-xl sm:text-2xl font-extrabold text-ink", children: [cap(r.now), "%"] }), _jsxs("div", { className: `num text-[11px] font-semibold ${diff > 0 ? 'text-win' : diff < 0 ? 'text-loss' : 'text-faint'}`, children: [diff > 0 ? '▲' : diff < 0 ? '▼' : '=', " ", Math.abs(diff), " ", _jsxs("span", { className: "text-faint font-normal", children: ["\u00B7 ", tt("was {0}%", { 0: Math.round(r.before) })] })] })] }, r.k));
                }) }), _jsx("div", { className: "flex h-2 gap-[3px] mt-3", "aria-hidden": true, children: rows.map(r => _jsx("div", { className: `rounded-full ${r.bar} transition-all duration-700`, style: { width: `calc(${Math.max(1, r.now)}% - 3px)` } }, r.k)) }), _jsxs("p", { className: "text-[11px] text-faint mt-2", children: [tt("Updated every minute from our pre-match prediction, the score, the time left and red cards."), (l.reds[0] > 0 || l.reds[1] > 0) && ` ${tt("Red cards: {0} – {1}.", { 0: l.reds[0], 1: l.reds[1] })}`] })] }));
}
function LineupUpdateCover({ before, home, away, onReveal }) {
    const hn = home.shortName || home.name, an = away.shortName || away.name;
    return (_jsxs("div", { className: "relative overflow-hidden rounded-2xl border border-accent/40 bg-[linear-gradient(150deg,rgb(var(--accent)/0.12),rgb(var(--surface)/0.6))] p-5 sm:p-6 text-center space-y-4", children: [_jsxs("div", { className: "inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-accent", children: [_jsx("span", { className: "w-2 h-2 rounded-full bg-accent animate-pulseDot" }), " ", tt("Lineups are out")] }), _jsx("div", { className: "font-display text-xl sm:text-2xl font-extrabold text-ink", children: tt("Our analysis is updated with the starting 11") }), _jsx("p", { className: "text-sm text-muted max-w-md mx-auto", children: tt("The teams have published their lineups and we have recalculated the prediction with the players who actually start.") }), _jsxs("div", { className: "text-xs text-faint num", children: [tt("Before the lineups:"), ' ', hn, " ", Math.round(before.home), tt("% · Draw"), ' ', Math.round(before.draw), "% \u00B7 ", an, " ", Math.round(before.away), "%"] }), _jsxs("button", { type: "button", onClick: onReveal, className: "inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-accent text-bg font-extrabold shadow-lift hover:brightness-105", children: [_jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [_jsx("path", { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" }), _jsx("circle", { cx: "12", cy: "12", r: "3" })] }), tt("Reveal the updated analysis")] })] }));
}
/** After the reveal: how the lineups moved the numbers. */
function LineupChange({ p, home, away }) {
    const b = p.beforeLineups;
    const hn = home.shortName || home.name, an = away.shortName || away.name;
    const items = [[hn, b.home, p.home], ['Draw', b.draw, p.draw], [an, b.away, p.away]];
    const moved = items.some(([, x, y]) => Math.abs(y - x) >= 1);
    const d = (x, y) => { const v = Math.round((y - x) * 10) / 10; return v === 0 ? '±0' : `${v > 0 ? '+' : ''}${v}`; };
    return (_jsxs("div", { className: "mt-4 rounded-xl border border-accent/30 bg-accent/5 p-3 sm:p-4", children: [_jsx("div", { className: "text-[11px] font-extrabold uppercase tracking-wide text-accent", children: tt("Updated with the confirmed lineups") }), moved ? (_jsx("div", { className: "mt-2 grid grid-cols-3 gap-2 text-center", children: items.map(([label, x, y]) => (_jsxs("div", { className: "rounded-lg bg-surface2/60 py-2", children: [_jsx("div", { className: "text-[11px] text-faint truncate px-1", children: label }), _jsxs("div", { className: "num text-sm text-ink", children: [_jsxs("span", { className: "text-faint", children: [Math.round(x), "%"] }), " \u2192 ", _jsxs("b", { children: [Math.round(y), "%"] })] }), _jsx("div", { className: `num text-[11px] font-bold ${y - x >= 1 ? 'text-win' : y - x <= -1 ? 'text-loss' : 'text-faint'}`, children: d(x, y) })] }, label))) })) : (_jsx("p", { className: "mt-1 text-sm text-muted", children: tt("The starting 11s are as expected: the prediction hardly moved.") }))] }));
}
/**
 * Upcoming matches: lineups come out about 1 hour before kick-off, and for league matches (v3) the prediction is
 * recalculated with the confirmed starting 11. Tell people to come back then.
 */
function LineupTip({ kickoff, lineupsOut, usesLineups }) {
    const checkAt = kickoff ? fmtTime(new Date(kickoff - 60 * 60 * 1000).toISOString()) : null;
    const soon = kickoff > 0 && kickoff - Date.now() <= 75 * 60 * 1000;
    let title;
    let text;
    if (lineupsOut) {
        title = tt("Lineups are out");
        text = usesLineups
            ? tt("This prediction is updated with the confirmed starting 11 within a few minutes of the lineups being published. Refresh the page to see the latest numbers.")
            : tt("Check the starting 11 below before you decide: a missing key player can change the picture.");
    }
    else {
        title = tt("Check again 1 hour before kick-off");
        text = usesLineups
            ? tt("We recommend coming back to this match about 1 hour before kick-off{0}. That’s when the teams publish their lineups, and we recalculate the prediction with the players who actually start.", { 0: soon || !checkAt ? '' : ` (around ${checkAt})` })
            : tt("We recommend checking this match again about 1 hour before kick-off{0}, when the teams publish their lineups. A missing key player can change the picture.", { 0: soon || !checkAt ? '' : ` (around ${checkAt})` });
    }
    return (_jsxs("div", { className: "mt-4 flex gap-3 rounded-xl border border-home/40 bg-home/10 p-3", children: [_jsxs("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", className: "text-home flex-shrink-0 mt-0.5", "aria-hidden": true, children: [_jsx("circle", { cx: "12", cy: "12", r: "9" }), _jsx("path", { d: "M12 7v5l3 2" })] }), _jsxs("div", { className: "text-sm", children: [_jsx("div", { className: "font-semibold text-ink", children: title }), _jsx("div", { className: "text-muted mt-0.5", children: text })] })] }));
}
function Section({ title, note, children }) {
    return (_jsxs("section", { className: "card p-5 sm:p-6", children: [_jsxs("div", { className: "flex flex-wrap items-baseline justify-between gap-2 mb-4", children: [_jsx("h2", { className: "font-display text-base font-bold text-ink", children: title }), note && _jsx("span", { className: "text-xs text-faint", children: note })] }), children] }));
}
function TeamHero({ team, align, code }) {
    return (_jsxs(Link, { to: `/team/${team.id}?${new URLSearchParams({ ...(code ? { c: code } : {}), n: team.name }).toString()}`, title: tt("{0}: team page", { 0: team.name }), className: `flex flex-col items-center text-center gap-2 sm:gap-4 min-w-0 hover:opacity-90 ${align === 'right' ? 'sm:flex-row-reverse sm:text-right' : 'sm:flex-row sm:text-left'}`, children: [team.crest ? (_jsx("img", { src: team.crest, alt: "", className: "w-14 h-14 sm:w-[72px] sm:h-[72px] object-contain flex-shrink-0 drop-shadow" })) : (_jsx("span", { className: "w-14 h-14 sm:w-[72px] sm:h-[72px] rounded-full bg-surface2 flex-shrink-0" })), _jsxs("div", { className: "min-w-0 w-full sm:w-auto", children: [_jsx("div", { className: "font-sans font-extrabold text-[15px] sm:font-display sm:text-2xl text-ink leading-tight break-words sm:truncate", children: team.shortName || team.name }), team.coach?.name && _jsx("div", { className: "hidden sm:block text-xs text-faint mt-0.5 truncate", children: team.coach.name }), _jsxs("div", { className: `flex items-center justify-center gap-1 mt-1 sm:mt-0.5 ${align === 'right' ? 'sm:justify-end' : 'sm:justify-start'}`, children: [_jsx("span", { className: "text-[11px] text-accent font-semibold whitespace-nowrap", children: tt("Team page →") }), _jsx(FavStar, { size: "sm", fav: { kind: 'team', ref: favKey(team.name), name: team.shortName || team.name, img: team.crest || null, ids: [team.id] } })] })] })] }));
}
/** Free / signed-out view: the pick and confidence; percentages, value and the breakdown are Premium. */
/** Official highlights (YouTube), click-to-play: nothing loads from YouTube until the viewer presses play. */
function Highlights({ matchId }) {
    const [h, setH] = useState(undefined);
    const [play, setPlay] = useState(false);
    useEffect(() => {
        let off = false;
        setH(undefined);
        axios.get(`${API_URL}/matches/${matchId}/highlights`).then(r => { if (!off)
            setH(r.data.data || null); }).catch(() => { if (!off)
            setH(null); });
        return () => { off = true; };
    }, [matchId]);
    if (h === undefined)
        return _jsx("div", { className: "card aspect-video max-h-[420px] animate-pulse", "aria-label": tt("Loading…") });
    if (!h)
        return (_jsxs("div", { className: "card p-8 sm:p-10 text-center space-y-3", children: [_jsx("div", { className: "w-14 h-14 mx-auto rounded-2xl bg-surface2 text-muted grid place-items-center", children: _jsxs("svg", { width: "26", height: "26", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [_jsx("rect", { x: "2", y: "5", width: "15", height: "14", rx: "2" }), _jsx("path", { d: "M17 10l5-3v10l-5-3z" })] }) }), _jsx("div", { className: "font-display text-lg font-bold text-ink", children: tt("There is no official highlight for this game yet") }), _jsx("p", { className: "text-sm text-muted max-w-md mx-auto", children: tt("Official highlights usually come out a few hours after the final whistle. We keep checking the league and club channels, so come back later.") })] }));
    return (_jsxs(Section, { title: tt("Highlights"), note: tt("Official video · {0}", { 0: h.channel }), children: [_jsx("div", { className: "relative aspect-video rounded-2xl overflow-hidden bg-black border border-line/60", children: play ? (_jsx("iframe", { src: `https://www.youtube-nocookie.com/embed/${h.videoId}?autoplay=1&rel=0&modestbranding=1&origin=${encodeURIComponent(window.location.origin)}`, title: h.title, referrerPolicy: "strict-origin-when-cross-origin", className: "absolute inset-0 w-full h-full", allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture", allowFullScreen: true })) : (_jsxs("button", { type: "button", onClick: () => setPlay(true), className: "group absolute inset-0 w-full h-full", "aria-label": tt("Play highlights: {0}", { 0: h.title }), children: [_jsx("img", { src: `https://i.ytimg.com/vi/${h.videoId}/hqdefault.jpg`, alt: "", className: "absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" }), _jsx("span", { className: "absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" }), _jsx("span", { className: "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-accent text-bg grid place-items-center shadow-lift group-hover:scale-105 transition-transform", children: _jsx("svg", { width: "26", height: "26", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true, children: _jsx("path", { d: "M8 5v14l11-7z" }) }) }), _jsx("span", { className: "absolute left-4 right-4 bottom-3 text-left text-sm font-bold text-white line-clamp-2", children: h.title })] })) }), _jsxs("div", { className: "mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1", children: [_jsx("p", { className: "text-[11px] text-faint", children: tt("Played by YouTube from the official channel. Some videos are only available in certain countries.") }), _jsxs("a", { href: `https://www.youtube.com/watch?v=${h.videoId}`, target: "_blank", rel: "noopener noreferrer", className: "text-xs font-bold text-accent hover:underline whitespace-nowrap", children: [tt("Watch on YouTube"), " \u2197"] })] })] }));
}
function LockedPrediction({ pick, home, away, matchId, status, onUnlocked }) {
    const { user, access } = useAuth();
    // signed-in Free (2 picks a week) and $15 Premium (60 a month) unlock match by match
    const canUnlock = !!user && (access === 'premium' || access === 'free');
    const u = useUnlocks(canUnlock);
    const weekly = u?.period === 'week';
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const [needPro, setNeedPro] = useState(false);
    const doUnlock = async () => {
        setBusy(true);
        setErr(null);
        try {
            await unlockMatch(matchId, status);
            onUnlocked();
        }
        catch (e) {
            if (e?.upgrade)
                setNeedPro(true);
            else
                setErr(e?.message || tt("Could not unlock this match."));
        }
        finally {
            setBusy(false);
        }
    };
    const out = canUnlock && (needPro || (u && u.left === 0));
    const name = pick === 'H' ? home.shortName || home.name : pick === 'A' ? away.shortName || away.name : pick === 'D' ? 'Draw' : null;
    const color = pick === 'H' ? 'text-home' : pick === 'D' ? 'text-draw' : 'text-away';
    const tiles = [
        { k: 'H', label: home.shortName || home.name },
        { k: 'D', label: tt('Draw') },
        { k: 'A', label: away.shortName || away.name }
    ];
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2 text-sm mb-4", children: [_jsx("span", { className: "px-2.5 py-1 rounded-full text-xs font-bold border bg-surface2 text-ink border-line", children: tt("Model pick") }), name ? (_jsx("span", { className: `font-display font-bold text-lg ${color}`, children: name })) : (_jsx("span", { className: "font-display font-bold text-lg text-muted", children: tt("Locked") }))] }), _jsxs("div", { className: "relative min-h-[190px]", children: [_jsx("div", { className: "grid grid-cols-3 gap-3 pt-6 select-none blur-[5px] opacity-60", "aria-hidden": true, children: tiles.map(t => (_jsx(OutcomeTile, { k: t.k, label: t.label, v: 33.3, active: false }, t.k))) }), _jsx("div", { className: "absolute inset-0 grid place-items-center", children: canUnlock ? (_jsx("div", { className: "rounded-2xl border border-line bg-surface/95 shadow-lift px-5 py-4 text-center max-w-sm", children: out ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "font-display font-bold text-ink", children: weekly ? tt("You've used this week's free picks") : tt("You've used all your unlocks this month") }), _jsx("div", { className: "text-xs text-muted mt-1", children: weekly ? tt("Your {0} free picks come back on Monday. Premium opens 60 matches a month; Pro opens every match.", { 0: u?.allowance ?? 2 }) : tt("{0}Pro is unlimited, and adds draw picks.", { 0: u ? tt("Your {0} unlocks renew on {1}. ", { 0: u.allowance, 1: resetDay(u.resetsAt) }) : '' }) }), _jsx("div", { className: "mt-3 flex justify-center", children: _jsx(Link, { to: "/premium", className: "px-4 py-2 rounded-xl bg-accent text-bg text-sm font-extrabold", children: weekly ? tt("See plans") : tt("Upgrade to Pro") }) })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "font-display font-bold text-ink", children: tt("Unlock this match") }), _jsxs("div", { className: "text-xs text-muted mt-1", children: [tt("The full prediction, why this pick, goals and the v3 breakdown."), ' ', weekly ? tt("Uses 1 of your {0} free picks this week", { 0: u?.allowance ?? 2 }) : tt("Uses 1 of your monthly unlocks"), tt("; it stays open after that.")] }), _jsxs("div", { className: "mt-3 flex flex-col items-center gap-1.5", children: [_jsx("button", { onClick: doUnlock, disabled: busy, className: "px-4 py-2 rounded-xl bg-accent text-bg text-sm font-extrabold disabled:opacity-60", children: busy ? tt("Unlocking…") : tt("Unlock prediction") }), u && u.left !== null && _jsx("span", { className: "text-[11px] text-faint num", children: weekly ? tt("{0} of {1} free picks left this week", { 0: u.left, 1: u.allowance }) : tt("{0} of {1} unlocks left this month", { 0: u.left, 1: u.allowance }) }), err && _jsx("span", { className: "text-[11px] text-loss", children: err })] })] })) })) : (_jsxs("div", { className: "rounded-2xl border border-line bg-surface/95 shadow-lift px-5 py-4 text-center max-w-sm", children: [_jsx("div", { className: "font-display font-bold text-ink", children: user ? tt("Full prediction with Premium") : tt("Get 2 free picks every week") }), _jsx("div", { className: "text-xs text-muted mt-1", children: user ? tt("The pick, win / draw / loss %, why this pick in plain words, goals, draw picks and the full v3 breakdown.") : tt("Create a free account and open the full prediction of any 2 matches a week. No card needed.") }), _jsx("div", { className: "mt-3 flex justify-center gap-2", children: user ? (_jsx(Link, { to: "/premium", className: "px-3.5 py-1.5 rounded-xl bg-accent text-bg text-sm font-semibold", children: tt("See Premium") })) : (_jsxs(_Fragment, { children: [_jsx(Link, { to: `/signup?next=${encodeURIComponent(window.location.pathname.replace(/^\/[a-z]{2}(?=\/|$)/, ''))}`, className: "px-3.5 py-1.5 rounded-xl bg-accent text-bg text-sm font-semibold", children: tt("Create free account") }), _jsx(Link, { to: `/login?next=${encodeURIComponent(window.location.pathname.replace(/^\/[a-z]{2}(?=\/|$)/, ''))}`, className: "px-3.5 py-1.5 rounded-xl border border-line text-sm font-medium text-ink hover:border-faint", children: tt("Sign in") })] })) })] })) })] })] }));
}
function OutcomeTile({ k, label, v, active, roll = false, delay = 0 }) {
    const color = k === 'H' ? 'text-home' : k === 'D' ? 'text-draw' : 'text-away';
    const border = k === 'H' ? 'border-home/50 bg-home/10' : k === 'D' ? 'border-draw/50 bg-draw/10' : 'border-away/50 bg-away/10';
    return (_jsxs("div", { className: `rounded-xl border p-3 sm:p-4 text-center ${active ? border : 'border-line/70 bg-surface2/40'} ${roll && active ? 'animate-pop' : ''}`, children: [_jsxs("div", { className: "text-[11px] text-faint mb-1 truncate", children: [_jsx("span", { className: `font-bold mr-1 ${active ? color : ''}`, children: k === 'H' ? '1' : k === 'D' ? 'X' : '2' }), label] }), _jsx("div", { className: `num text-2xl sm:text-3xl font-extrabold ${active ? color : 'text-ink/70'}`, children: _jsx(CountUp, { value: v, decimals: 1, suffix: "%", animate: roll, delay: delay }) })] }));
}
/**
 * Goals and scores: total-goals lines (over 1.5 / 2.5 / 3.5 / 4.5) and the most likely correct scores.
 * Worked out from the model's expected goals (a Poisson score grid, the same method the models use); where the model
 * sends its own figure (over 2.5, BTTS, its top scores) that figure is used, so the page never shows two numbers
 * for the same thing.
 */
function scoreGrid(lh, la) {
    const pois = (l, k) => { let f = 1; for (let i = 2; i <= k; i++)
        f *= i; return (Math.exp(-l) * Math.pow(l, k)) / f; };
    const cells = [];
    for (let i = 0; i <= 10; i++)
        for (let j = 0; j <= 10; j++)
            cells.push({ home: i, away: j, prob: pois(lh, i) * pois(la, j) * 100 });
    return cells;
}
function GoalsPanel({ p, home, away, roll }) {
    const cells = scoreGrid(p.expectedGoals.home, p.expectedGoals.away);
    const over = (line) => cells.filter(c => c.home + c.away > line).reduce((a, c) => a + c.prob, 0);
    // keep the model's own over 2.5, and keep the lines in order (1.5 ≥ 2.5 ≥ 3.5 ≥ 4.5)
    const o25 = p.over25;
    const o15 = Math.max(over(1.5), o25), o35 = Math.min(over(3.5), o25), o45 = Math.min(over(4.5), o35);
    const lines = [{ l: '1.5', v: o15 }, { l: '2.5', v: o25 }, { l: '3.5', v: o35 }, { l: '4.5', v: o45 }];
    const own = new Map(p.topScores.map(t => [`${t.home}-${t.away}`, t.prob]));
    const scores = cells.map(c => ({ ...c, prob: own.get(`${c.home}-${c.away}`) ?? c.prob })).sort((a, b) => b.prob - a.prob).slice(0, 8);
    const hn = home.shortName || home.name, an = away.shortName || away.name;
    return (_jsxs("div", { className: "mt-5 space-y-3", children: [_jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsx(Stat, { label: tt("Expected goals"), value: `${p.expectedGoals.home} – ${p.expectedGoals.away}` }), _jsx(Stat, { label: tt("Both teams score"), value: `${Math.round(p.btts)}%` }), _jsx(Stat, { label: tt("Most likely score"), value: scores[0] ? `${scores[0].home}–${scores[0].away}` : '–', sub: scores[0] ? `${Math.round(scores[0].prob)}%` : undefined })] }), _jsxs("div", { className: "grid gap-3 md:grid-cols-2", children: [_jsxs("div", { className: "rounded-xl border border-line/70 bg-surface2/40 p-4", children: [_jsx("div", { className: "label mb-3", children: tt("Total goals") }), _jsx("div", { className: "space-y-2.5", children: lines.map((x, i) => (_jsxs("div", { className: "grid grid-cols-[74px_1fr_44px] items-center gap-3 text-sm", children: [_jsxs("span", { className: "text-muted", children: [tt("Over"), ' ', x.l] }), _jsx("span", { className: "h-2 rounded-full bg-surface2 overflow-hidden", children: _jsx("span", { className: "block h-full rounded-full bg-accent transition-[width] duration-1000 ease-out", style: { width: `${Math.round(x.v)}%`, transitionDelay: `${i * 90}ms` } }) }), _jsx("span", { className: "num font-bold text-ink text-right", children: _jsx(CountUp, { value: x.v, suffix: "%", animate: roll, delay: 300 + i * 90 }) })] }, x.l))) }), _jsxs("div", { className: "mt-3 text-[11px] text-faint", children: [tt("Under = 100% minus over. Under 2.5:"), ' ', _jsxs("span", { className: "num text-muted", children: [Math.round(100 - o25), "%"] })] })] }), _jsxs("div", { className: "rounded-xl border border-line/70 bg-surface2/40 p-4", children: [_jsx("div", { className: "label mb-3", children: tt("Correct score") }), _jsx("div", { className: "grid grid-cols-4 gap-2", children: scores.map((c, i) => (_jsxs("div", { className: `rounded-lg px-2 py-2 text-center ${i === 0 ? 'bg-accent/15 border border-accent/40' : 'bg-surface2/70'}`, children: [_jsxs("div", { className: `num font-bold ${i === 0 ? 'text-accent' : 'text-ink'}`, children: [c.home, "\u2013", c.away] }), _jsx("div", { className: "num text-[11px] text-muted", children: _jsx(CountUp, { value: c.prob, decimals: 1, suffix: "%", animate: roll, delay: 400 + i * 60 }) })] }, `${c.home}-${c.away}`))) }), _jsx("div", { className: "mt-3 text-[11px] text-faint", children: tt("{0} first · {1} second", { 0: hn, 1: an }) })] })] }), (() => {
                // who scores first: the first goal goes to each side in proportion to its expected goals
                const lh = Math.max(0.01, p.expectedGoals.home), la = Math.max(0.01, p.expectedGoals.away), lam = lh + la;
                const none = Math.exp(-lam) * 100;
                const fh = (lh / lam) * (100 - none), fa = (la / lam) * (100 - none);
                return (_jsxs("div", { className: "rounded-xl border border-line/70 bg-surface2/40 p-4", children: [_jsx("div", { className: "label mb-3", children: tt("Who scores first") }), _jsxs("div", { className: "flex h-2.5 gap-[3px] rounded-full overflow-hidden", "aria-hidden": true, children: [_jsx("div", { className: "bg-home", style: { width: `${fh}%` } }), _jsx("div", { className: "bg-faint/50", style: { width: `${none}%` } }), _jsx("div", { className: "bg-away", style: { width: `${fa}%` } })] }), _jsxs("div", { className: "mt-2 grid grid-cols-3 text-sm", children: [_jsxs("span", { children: [_jsx("span", { className: "text-muted", children: hn }), " ", _jsxs("b", { className: "num text-ink", children: [Math.round(fh), "%"] })] }), _jsxs("span", { className: "text-center", children: [_jsx("span", { className: "text-muted", children: tt("No goal") }), " ", _jsxs("b", { className: "num text-ink", children: [Math.round(none), "%"] })] }), _jsxs("span", { className: "text-right", children: [_jsx("span", { className: "text-muted", children: an }), " ", _jsxs("b", { className: "num text-ink", children: [Math.round(fa), "%"] })] })] })] }));
            })()] }));
}
function Stat({ label, value, sub }) {
    return (_jsxs("div", { className: "rounded-xl bg-surface2/60 border border-line/50 px-3 py-2.5 text-center", children: [_jsxs("div", { className: "num text-lg font-bold text-ink", children: [value, sub && _jsx("span", { className: "text-xs text-faint font-medium ml-1", children: sub })] }), _jsx("div", { className: "text-[11px] text-faint", children: label })] }));
}
function EventText({ e, align }) {
    return (_jsxs("div", { className: `flex items-center gap-2 ${align === 'right' ? 'justify-end' : ''}`, children: [align === 'left' && _jsx(EventIcon, { kind: e.kind }), _jsxs("span", { className: "min-w-0", children: [_jsx("span", { className: "text-ink font-medium", children: e.text }), e.sub && _jsx("span", { className: "block text-[11px] text-faint", children: e.sub })] }), align === 'right' && _jsx(EventIcon, { kind: e.kind })] }));
}
function EventIcon({ kind }) {
    if (kind === 'goal' || kind === 'pen' || kind === 'own')
        return _jsx("span", { className: `text-base leading-none ${kind === 'own' ? 'opacity-50' : ''}`, children: "\u26BD" });
    if (kind === 'yellow')
        return _jsx("span", { className: "inline-block w-3 h-4 rounded-[2px] bg-draw" });
    if (kind === 'red')
        return _jsx("span", { className: "inline-block w-3 h-4 rounded-[2px] bg-live" });
    if (kind === 'yellow_red')
        return _jsx("span", { className: "inline-block w-3 h-4 rounded-[2px] bg-gradient-to-b from-draw to-live" });
    return _jsx("span", { className: "text-faint text-sm", children: "\u21C4" });
}
const SIDE_TEXT = { H: 'text-home', A: 'text-away' };
const SIDE_BG = { H: 'bg-home', A: 'bg-away' };
const tname = (t) => t.shortName || t.name;
function CrestBox({ team, size = 30 }) {
    return (_jsx("span", { className: "w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-surface2/80 border border-line/60 grid place-items-center shrink-0", children: team.crest ? _jsx("img", { src: team.crest, alt: "", className: "object-contain", style: { width: size, height: size } }) : _jsx("span", { className: "text-[10px] font-bold text-muted", children: (team.tla || team.name).slice(0, 3).toUpperCase() }) }));
}
function SideTitle({ team, side, right }) {
    return (_jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsx("span", { className: `w-1 h-6 rounded-full ${SIDE_BG[side]}` }), team.crest && _jsx("img", { src: team.crest, alt: "", className: "w-6 h-6 object-contain" }), _jsx("span", { className: "font-display font-bold text-ink truncate", children: tname(team) }), right && _jsx("span", { className: "ml-auto shrink-0", children: right })] }));
}
const FORM_CLS = { W: 'bg-win/90 text-bg', D: 'bg-muted/60 text-bg', L: 'bg-loss/90 text-bg' };
function FormChips({ f, align = 'left' }) {
    if (!f.length)
        return null;
    return (_jsx("span", { className: `flex gap-1 mt-1 justify-center ${align === 'right' ? 'sm:justify-end' : 'sm:justify-start'}`, children: f.map((r, i) => (_jsx("span", { className: `w-[18px] h-[18px] rounded-[5px] text-[9px] font-extrabold grid place-items-center ${FORM_CLS[r] || 'bg-line text-muted'} ${i === f.length - 1 ? 'ring-2 ring-offset-1 ring-offset-surface ring-line' : ''}`, children: r }, i))) }));
}
function TeamsHead({ home, away, sub }) {
    const side = (s) => {
        const team = s === 'H' ? home : away;
        return (_jsxs("div", { className: `flex flex-col sm:flex-row items-center gap-2 sm:gap-3 min-w-0 text-center ${s === 'A' ? 'sm:flex-row-reverse sm:text-right' : 'sm:text-left'}`, children: [_jsx(CrestBox, { team: team }), _jsxs("span", { className: "min-w-0 max-w-full", children: [_jsx("span", { className: "block font-display font-bold text-ink truncate", children: tname(team) }), sub && _jsx("span", { className: "block", children: sub(s) })] })] }));
    };
    return (_jsxs("div", { className: "grid grid-cols-[1fr_auto_1fr] items-center gap-3", children: [side('H'), _jsx("span", { className: "text-[10px] font-extrabold tracking-widest text-faint", children: "VS" }), side('A')] }));
}
const TONE = {
    good: 'border-win/40 bg-win/10 text-win',
    mid: 'border-draw/40 bg-draw/10 text-draw',
    bad: 'border-loss/40 bg-loss/10 text-loss',
    none: 'border-line/60 bg-surface2/50 text-ink'
};
function ToneTile({ label, value, tone, icon }) {
    return (_jsxs("div", { className: `rounded-xl border px-3 py-2.5 ${TONE[tone]}`, children: [_jsxs("div", { className: "flex items-start gap-1.5 opacity-80", children: [icon && _jsx("span", { className: "hidden sm:inline mt-px", children: icon }), _jsx("span", { className: "text-[10px] font-semibold uppercase sm:tracking-wide leading-tight", children: label })] }), _jsx("div", { className: "num text-xl font-extrabold mt-1 leading-none", children: value })] }));
}
const ICO = {
    bed: _jsxs("svg", { viewBox: "0 0 24 24", className: "w-3.5 h-3.5", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", children: [_jsx("path", { d: "M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5" }), _jsx("circle", { cx: "7", cy: "11", r: "1.6" })] }),
    cal: _jsxs("svg", { viewBox: "0 0 24 24", className: "w-3.5 h-3.5", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", children: [_jsx("rect", { x: "3", y: "5", width: "18", height: "16", rx: "2" }), _jsx("path", { d: "M3 10h18M8 3v4M16 3v4" })] }),
    next: _jsx("svg", { viewBox: "0 0 24 24", className: "w-3.5 h-3.5", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", children: _jsx("path", { d: "M5 12h14M13 6l6 6-6 6" }) }),
    clock: _jsxs("svg", { viewBox: "0 0 24 24", className: "w-3 h-3", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", children: [_jsx("path", { d: "M12 7v5l3 2" }), _jsx("circle", { cx: "12", cy: "12", r: "9" })] })
};
const RES_CLS = { W: 'bg-win/15 text-win', D: 'bg-surface2 text-muted', L: 'bg-loss/15 text-loss' };
function TeamPanel({ team, side, row, recent }) {
    const formFromTable = row?.form ? row.form.split(',').map(s => s.trim()).filter(Boolean) : null;
    const formFromMatches = recent.map(m => resultFor(team.id, m)).filter((r) => !!r).reverse();
    const form = formFromTable && formFromTable.length ? formFromTable : formFromMatches;
    return (_jsxs("div", { className: "min-w-0", children: [_jsx(SideTitle, { team: team, side: side, right: row ? _jsxs("span", { className: `num text-xs font-bold ${SIDE_TEXT[side]}`, children: ["#", row.position, row.teamsInTable ? _jsxs("span", { className: "text-faint font-medium", children: [" / ", row.teamsInTable] }) : null] }) : undefined }), row ? (_jsxs("div", { className: "grid grid-cols-3 gap-2 mb-3", children: [_jsx(ToneTile, { label: tt("Points"), value: row.points, tone: "none" }), _jsx(ToneTile, { label: "W-D-L", value: _jsxs("span", { className: "text-base", children: [row.won, "-", row.draw, "-", row.lost] }), tone: "none" }), _jsx(ToneTile, { label: tt("GD"), value: `${row.goalDifference > 0 ? '+' : ''}${row.goalDifference}`, tone: row.goalDifference > 0 ? 'good' : row.goalDifference < 0 ? 'bad' : 'none' })] })) : (_jsx("p", { className: "text-xs text-faint mb-3", children: tt("No league table for this competition.") })), form.length > 0 && (_jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsx("span", { className: "text-[10px] font-semibold uppercase tracking-wide text-faint", children: tt("Form") }), _jsx(FormChips, { f: form })] })), recent.length > 0 && (_jsx("ul", { children: recent.map(m => {
                    const isHome = m.homeTeam.id === team.id;
                    const opp = isHome ? m.awayTeam : m.homeTeam;
                    const gf = isHome ? m.score.fullTime.home : m.score.fullTime.away;
                    const ga = isHome ? m.score.fullTime.away : m.score.fullTime.home;
                    const r = resultFor(team.id, m);
                    return (_jsx("li", { children: _jsxs("div", { className: "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs", children: [_jsx("span", { className: `w-6 h-6 rounded-md grid place-items-center text-[10px] font-extrabold shrink-0 ${r ? RES_CLS[r] : 'bg-surface2 text-faint'}`, children: r || '–' }), _jsx("span", { className: "num text-faint w-14 shrink-0 whitespace-nowrap", children: new Date(m.utcDate).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }) }), _jsx("span", { className: `rounded px-1 text-[9px] font-bold shrink-0 ${isHome ? 'bg-home/15 text-home' : 'bg-surface2 text-muted'}`, children: isHome ? tt("H") : tt("A") }), opp.crest ? _jsx("img", { src: opp.crest, alt: "", className: "w-4 h-4 object-contain shrink-0", loading: "lazy" }) : _jsx("span", { className: "w-4 h-4 shrink-0" }), _jsx("span", { className: "text-ink font-medium truncate", children: tname(opp) }), _jsxs("span", { className: "ml-auto num font-bold text-ink shrink-0", children: [gf, "\u2013", ga] })] }) }, m.id));
                }) }))] }));
}
function H2H({ h2h, home, away }) {
    const agg = h2h.aggregates;
    const total = agg.numberOfMatches || 1;
    const hw = agg.homeTeam.wins;
    const d = agg.homeTeam.draws;
    const aw = agg.awayTeam.wins;
    const played = h2h.matches.filter(h => DONE.has(h.status));
    // results are shown from this page's home team's side (they may have been the away side back then)
    const isHomeSide = (id, name) => id === agg.homeTeam.id || id === home.id || name === home.name || name === home.shortName;
    const lead = hw === aw ? null : hw > aw ? 'H' : 'A';
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "rounded-2xl border border-line/60 bg-surface2/40 p-4 sm:p-5", children: [_jsxs("div", { className: "grid grid-cols-[1fr_auto_1fr] items-center gap-3", children: [['H', 'A'].map((s, i) => {
                                const team = s === 'H' ? home : away;
                                return (_jsxs("div", { className: `flex flex-col sm:flex-row items-center gap-2 sm:gap-3 min-w-0 text-center ${i === 1 ? 'order-3 sm:flex-row-reverse sm:text-right' : 'sm:text-left'}`, children: [_jsx(CrestBox, { team: team }), _jsxs("span", { className: "min-w-0 max-w-full", children: [_jsx("span", { className: "block font-display font-bold text-ink truncate", children: tname(team) }), _jsx("span", { className: "block text-[11px] text-faint", children: tt("{0} wins", { 0: s === 'H' ? hw : aw }) })] })] }, s));
                            }), _jsxs("div", { className: "order-2 text-center", children: [_jsxs("div", { className: "num font-display text-3xl sm:text-4xl font-extrabold leading-none whitespace-nowrap", children: [_jsx("span", { className: lead !== 'A' ? SIDE_TEXT.H : 'text-muted', children: hw }), _jsx("span", { className: "text-faint text-xl sm:text-2xl mx-1.5 align-middle", children: d }), _jsx("span", { className: lead !== 'H' ? SIDE_TEXT.A : 'text-muted', children: aw })] }), _jsx("div", { className: "text-[10px] text-faint mt-1 uppercase tracking-wide", children: tt("wins · draws · wins") })] })] }), _jsxs("div", { className: "flex h-2 gap-[3px] mt-4", children: [_jsx("div", { className: "rounded-full bg-home", style: { width: `${(hw / total) * 100}%` } }), _jsx("div", { className: "rounded-full bg-muted/50", style: { width: `${(d / total) * 100}%` } }), _jsx("div", { className: "rounded-full bg-away", style: { width: `${(aw / total) * 100}%` } })] }), _jsx("div", { className: "mt-2 text-center text-[11px] text-faint num", children: tt("{0} goals in {1} games · {2} per game", { 0: agg.totalGoals, 1: agg.numberOfMatches, 2: (agg.totalGoals / total).toFixed(1) }) })] }), _jsx("ul", { className: "mt-4 divide-y divide-line/40", children: played.map(h => {
                    const hg = h.score.fullTime.home ?? 0;
                    const ag = h.score.fullTime.away ?? 0;
                    const ourHomeWasHome = isHomeSide(h.homeTeam.id, h.homeTeam.name);
                    const ours = ourHomeWasHome ? hg - ag : ag - hg;
                    const dot = ours > 0 ? 'bg-home' : ours < 0 ? 'bg-away' : 'bg-muted/50';
                    return (_jsx("li", { children: _jsxs("div", { className: "grid grid-cols-[3.5rem_1fr_auto_1fr_0.75rem] sm:grid-cols-[6rem_1fr_auto_1fr_1rem] items-center gap-2 sm:gap-3 py-2 px-1 text-sm", children: [_jsxs("span", { className: "text-[11px] text-faint leading-tight min-w-0", children: [_jsx("span", { className: "num block whitespace-nowrap", children: new Date(h.utcDate).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: '2-digit' }) }), _jsx("span", { className: "hidden sm:block text-[10px] truncate", title: h.competition?.name, children: h.competition?.name })] }), _jsxs("span", { className: "flex items-center justify-end gap-2 min-w-0", children: [_jsx("span", { className: `truncate ${hg > ag ? 'font-bold text-ink' : 'text-muted'}`, children: tname(h.homeTeam) }), h.homeTeam.crest && _jsx("img", { src: h.homeTeam.crest, alt: "", className: "w-[18px] h-[18px] object-contain shrink-0", loading: "lazy" })] }), _jsxs("span", { className: "num font-extrabold text-ink rounded-lg bg-surface2/80 px-2.5 py-1 text-center min-w-[56px]", children: [_jsx("span", { className: hg >= ag ? '' : 'text-muted', children: hg }), _jsx("span", { className: "text-faint", children: "\u2013" }), _jsx("span", { className: ag >= hg ? '' : 'text-muted', children: ag })] }), _jsxs("span", { className: "flex items-center gap-2 min-w-0", children: [h.awayTeam.crest && _jsx("img", { src: h.awayTeam.crest, alt: "", className: "w-[18px] h-[18px] object-contain shrink-0", loading: "lazy" }), _jsx("span", { className: `truncate ${ag > hg ? 'font-bold text-ink' : 'text-muted'}`, children: tname(h.awayTeam) })] }), _jsx("span", { className: `justify-self-end w-2 h-2 rounded-full ${dot}` })] }) }, h.id));
                }) })] }));
}
const IMP_TONE = { 5: 'text-loss', 4: 'text-draw', 3: 'text-ink', 2: 'text-muted', 1: 'text-faint' };
const IMP_BAR = { 5: 'bg-loss', 4: 'bg-draw', 3: 'bg-ink/70', 2: 'bg-muted/70', 1: 'bg-faint/70' };
/** Importance 1–5 as five small bars plus a word. */
function Importance({ x }) {
    if (!x.importance)
        return _jsx("span", { className: "text-[11px] text-faint", children: tt("Importance unknown") });
    const lvl = x.importance;
    const why = x.starts != null && x.of ? tt("Started {0} of the last {1} games", { 0: x.starts, 1: x.of }) : undefined;
    return (_jsxs("span", { className: "inline-flex items-center gap-1.5", title: why, children: [_jsx("span", { className: "inline-flex items-end gap-[2px]", "aria-hidden": true, children: [1, 2, 3, 4, 5].map(i => _jsx("span", { className: `w-[4px] rounded-sm ${i <= lvl ? IMP_BAR[lvl] : 'bg-line'}`, style: { height: `${4 + i * 2}px` } }, i)) }), _jsxs("span", { className: `text-[11px] font-semibold ${IMP_TONE[lvl]}`, children: [lvl, "/5 \u00B7 ", tt(x.importanceLabel || '')] })] }));
}
function InjuryList({ team, list }) {
    const key = list.filter(x => x.out && (x.importance ?? 0) >= 4).length;
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [team.crest && _jsx("img", { src: team.crest, alt: "", className: "w-6 h-6 object-contain" }), _jsx("span", { className: "font-display font-bold text-ink", children: team.shortName || team.name }), _jsxs("span", { className: "ml-auto num text-xs text-faint", children: [list.filter(x => x.out).length, " ", tt("out"), " \u00B7 ", list.filter(x => !x.out).length, " ", tt("doubtful")] })] }), list.length > 0 && (_jsx("p", { className: `text-xs mb-3 ${key ? 'text-loss font-semibold' : 'text-faint'}`, children: key ? (key === 1 ? tt("1 key or important player out") : tt("{0} key or important players out", { 0: key })) : tt("No key players out") })), list.length ? (_jsx("ul", { className: "divide-y divide-line/40", children: list.map((x, i) => (_jsxs("li", { className: "flex items-center gap-3 py-2 text-sm", children: [_jsx("span", { className: `w-1.5 h-1.5 rounded-full shrink-0 ${x.out ? 'bg-loss' : 'bg-draw'}` }), _jsxs("span", { className: "min-w-0 flex-1", children: [x.id ? _jsx(Link, { to: `/player/${x.id}`, className: "block text-ink hover:text-accent truncate font-medium", children: x.name }) : _jsx("span", { className: "block text-ink truncate font-medium", children: x.name }), _jsxs("span", { className: "block text-[11px] text-faint truncate", children: [x.out ? tt("Out") : tt("Doubtful"), x.reason ? ` · ${x.reason}` : ''] })] }), _jsx("span", { className: "shrink-0", children: _jsx(Importance, { x: x }) })] }, x.id ?? i))) })) : (_jsx("p", { className: "text-xs text-faint", children: tt("Nobody listed.") }))] }));
}
const daysText = (d) => (d < 1 ? tt("under a day") : tt("{0} days", { 0: Math.floor(d) }));
/** Both teams' rest and workload, in a short banner. */
function RestSummary({ home, away, h, a }) {
    const lines = [];
    const hr = h.previous?.days, ar = a.previous?.days;
    if (hr != null && ar != null) {
        const diff = Math.floor(hr) - Math.floor(ar);
        if (Math.abs(diff) >= 2) {
            const s = diff > 0 ? 'H' : 'A';
            lines.push(_jsxs(_Fragment, { children: [_jsx("b", { className: SIDE_TEXT[s], children: tname(s === 'H' ? home : away) }), " ", tt("has {0} more days of rest.", { 0: Math.abs(diff) })] }));
        }
        else
            lines.push(tt("Similar rest for both teams."));
    }
    for (const [t, s] of [[home, h], [away, a]]) {
        if (s.games14 >= 4)
            lines.push(tt("{0} played {1} games in the last 14 days.", { 0: tname(t), 1: s.games14 }));
        if (s.next && s.next.days <= 4)
            lines.push(tt("{0} plays again {1} later ({2}).", { 0: tname(t), 1: daysText(s.next.days), 2: s.next.competition || '' }));
    }
    if (!lines.length)
        return null;
    return (_jsxs("div", { className: "flex items-start gap-3 rounded-xl border border-accent/25 bg-accent/[0.07] px-4 py-3 text-sm text-ink", children: [_jsx("span", { className: "w-8 h-8 rounded-lg bg-accent/15 text-accent grid place-items-center shrink-0", children: ICO.bed }), _jsx("div", { className: "space-y-0.5 pt-1.5 min-w-0", children: lines.map((l, i) => _jsx("p", { children: l }, i)) })] }));
}
function RestPanel({ team, side, s }) {
    const rest = s.previous?.days;
    const restTone = rest == null ? 'none' : rest < 3 ? 'bad' : rest < 4 ? 'mid' : 'good';
    const loadTone = s.games14 >= 5 ? 'bad' : s.games14 === 4 ? 'mid' : 'none';
    const nextTone = !s.next ? 'none' : s.next.days <= 3 ? 'mid' : 'none';
    const res = (f) => {
        if (!f.score)
            return null;
        const [x, y] = f.score.split('-').map(Number);
        return x > y ? 'W' : x < y ? 'L' : 'D';
    };
    const date = (f) => new Date(f.date).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
    const opp = (f) => (_jsxs(_Fragment, { children: [_jsx("span", { className: `rounded px-1 text-[9px] font-bold shrink-0 ${f.home ? 'bg-home/15 text-home' : 'bg-surface2 text-muted'}`, children: f.home ? tt("H") : tt("A") }), f.opponentCrest ? _jsx("img", { src: f.opponentCrest, alt: "", className: "w-4 h-4 object-contain shrink-0", loading: "lazy" }) : _jsx("span", { className: "w-4 h-4 shrink-0" }), _jsxs("span", { className: "min-w-0 truncate", children: [_jsx("span", { className: "text-ink font-medium", children: f.opponent }), f.competition && _jsx("span", { className: "hidden sm:inline text-[10px] text-faint ml-1.5", children: f.competition })] })] }));
    return (_jsxs("div", { className: "min-w-0", children: [_jsx(SideTitle, { team: team, side: side }), _jsxs("div", { className: "grid grid-cols-3 gap-2 mb-4", children: [_jsx(ToneTile, { icon: ICO.bed, label: tt("Rest"), tone: restTone, value: rest == null ? '—' : rest < 1 ? '<1 d' : tt("{0} d", { 0: Math.floor(rest) }) }), _jsx(ToneTile, { icon: ICO.cal, label: tt("Last 14 days"), tone: loadTone, value: s.games14 }), _jsx(ToneTile, { icon: ICO.next, label: tt("Next game"), tone: nextTone, value: s.next ? tt("{0} d", { 0: Math.floor(s.next.days) }) : '—' })] }), s.recent.length > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: "label pb-1 px-2", children: tt("Before this match") }), _jsx("ul", { className: "mb-3", children: s.recent.map((f, i) => {
                            const r = res(f);
                            return (_jsxs("li", { className: "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs", children: [_jsx("span", { className: `w-6 h-6 rounded-md grid place-items-center text-[10px] font-extrabold shrink-0 ${r ? RES_CLS[r] : 'bg-surface2 text-faint'}`, children: r || '–' }), _jsx("span", { className: "num text-faint w-12 shrink-0", children: date(f) }), opp(f), f.score && _jsx("span", { className: "ml-auto num font-bold text-ink shrink-0", children: f.score.replace('-', '–') })] }, i));
                        }) })] })), s.upcoming.length > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: "label pb-1 px-2", children: tt("After this match") }), _jsx("ul", { children: s.upcoming.map((f, i) => (_jsxs("li", { className: "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs", children: [_jsx("span", { className: "w-6 h-6 rounded-md grid place-items-center border border-dashed border-line text-faint shrink-0", children: ICO.clock }), _jsx("span", { className: "num text-faint w-12 shrink-0", children: date(f) }), opp(f), _jsxs("span", { className: "ml-auto rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-semibold text-muted num shrink-0", children: ["+", tt("{0} d", { 0: Math.floor(f.days) })] })] }, i))) })] })), s.games30 != null && _jsx("p", { className: "mt-3 px-2 text-[11px] text-faint", children: tt("{0} games in the last 30 days, {1} of them away.", { 0: s.games30, 1: s.away30 ?? 0 }) })] }));
}
const AVG_GROUPS = [
    { title: tt("Goals"), rows: [
            { k: 'totalGoals', label: tt("Total goals"), neutral: true },
            { k: 'goalsFor', label: tt("Goals scored") },
            { k: 'goalsAgainst', label: tt("Goals conceded"), lowerBetter: true },
            { k: 'expected_goals', label: tt("Expected goals (xG)"), dec: 2 }
        ] },
    { title: tt("Attack"), rows: [
            { k: 'shots', label: tt("Total shots") },
            { k: 'shots_on_goal', label: tt("Shots on target") },
            { k: 'shots_off_goal', label: tt("Shots off target"), neutral: true },
            { k: 'corner_kicks', label: tt('Corners') }
        ] },
    { title: tt("Ball & keeper"), rows: [
            { k: 'ball_possession', label: tt('Possession'), pct: true },
            { k: 'pass_accuracy', label: tt("Pass accuracy"), pct: true },
            { k: 'saves', label: tt("Goalkeeper saves"), neutral: true }
        ] },
    { title: tt("Discipline"), rows: [
            { k: 'fouls', label: tt('Fouls'), lowerBetter: true },
            { k: 'offsides', label: tt('Offsides'), lowerBetter: true },
            { k: 'yellow_cards', label: tt("Yellow cards"), lowerBetter: true },
            { k: 'red_cards', label: tt("Red cards"), lowerBetter: true, dec: 2 }
        ] }
];
function avgValue(t, k) {
    if (k === 'totalGoals' || k === 'goalsFor' || k === 'goalsAgainst')
        return t.games ? t[k] : null;
    const v = t.averages?.[k];
    return typeof v === 'number' ? v : null;
}
function CmpLine({ r }) {
    const sum = r.hv + r.av || 1;
    const better = r.neutral || r.hv === r.av ? null : (r.lowerBetter ? r.hv < r.av : r.hv > r.av) ? 'H' : 'A';
    return (_jsxs("li", { className: "py-2", children: [_jsxs("div", { className: "flex items-center justify-between gap-2 text-sm", children: [_jsx("span", { className: `num w-16 ${better === 'H' ? 'font-extrabold text-ink' : 'text-muted'}`, children: r.text(r.hv) }), _jsx("span", { className: "text-[11px] font-semibold text-faint text-center truncate", children: r.label }), _jsx("span", { className: `num w-16 text-right ${better === 'A' ? 'font-extrabold text-ink' : 'text-muted'}`, children: r.text(r.av) })] }), _jsxs("div", { className: "mt-1.5 grid grid-cols-2 gap-1.5", children: [_jsx("div", { className: "h-2 rounded-full bg-surface2 overflow-hidden flex justify-end", children: _jsx("div", { className: `h-full rounded-full transition-all duration-700 ${better === 'H' ? 'bg-home' : 'bg-home/30'}`, style: { width: `${(r.hv / sum) * 100}%` } }) }), _jsx("div", { className: "h-2 rounded-full bg-surface2 overflow-hidden", children: _jsx("div", { className: `h-full rounded-full transition-all duration-700 ${better === 'A' ? 'bg-away' : 'bg-away/30'}`, style: { width: `${(r.av / sum) * 100}%` } }) })] })] }));
}
function AveragesPanel({ home, away, h, a, form }) {
    const groups = [];
    for (const g of AVG_GROUPS) {
        const rows = [];
        for (const r of g.rows) {
            const hv = avgValue(h, r.k), av = avgValue(a, r.k);
            if (hv === null || av === null)
                continue;
            rows.push({ label: r.label, hv, av, lowerBetter: r.lowerBetter, neutral: r.neutral, text: v => (r.pct ? `${Math.round(v)}%` : r.dec ? v.toFixed(r.dec) : String(Math.round(v * 10) / 10)) });
        }
        if (rows.length)
            groups.push({ title: g.title, rows });
    }
    const n = Math.min(h.games, a.games);
    if (n) {
        const count = (v) => String(v);
        groups.push({ title: tt("Last {0} games", { 0: n }), rows: [
                { label: tt("Wins (of {0})", { 0: n }), hv: h.record.won, av: a.record.won, text: count },
                { label: tt("Clean sheets"), hv: h.cleanSheets, av: a.cleanSheets, text: count },
                { label: tt("Both teams scored"), hv: h.btts, av: a.btts, text: count, neutral: true },
                { label: tt("Over 2.5 goals"), hv: h.over25, av: a.over25, text: count, neutral: true }
            ] });
    }
    let he = 0, ae = 0;
    for (const g of groups)
        for (const r of g.rows) {
            if (r.neutral || r.hv === r.av)
                continue;
            if (r.lowerBetter ? r.hv < r.av : r.hv > r.av)
                he++;
            else
                ae++;
        }
    const cats = he + ae;
    const lead = he === ae ? null : he > ae ? 'H' : 'A';
    return (_jsxs("div", { className: "card p-5 sm:p-6", children: [_jsx(TeamsHead, { home: home, away: away, sub: s => {
                    const x = s === 'H' ? h : a;
                    const gd = Math.round((x.goalsFor - x.goalsAgainst) * 10) / 10;
                    return (_jsxs(_Fragment, { children: [_jsxs("span", { className: "block text-[11px] text-faint num", children: [x.record.won, "-", x.record.draw, "-", x.record.lost, " \u00B7 ", _jsxs("span", { className: gd > 0 ? 'text-win' : gd < 0 ? 'text-loss' : '', children: [gd > 0 ? '+' : '', gd] }), " ", tt("goals/game")] }), form && _jsx(FormChips, { f: s === 'H' ? form.home : form.away, align: s === 'A' ? 'right' : 'left' })] }));
                } }), cats > 0 && (_jsxs("div", { className: "mt-5 rounded-xl border border-line/60 bg-surface2/40 px-4 py-3", children: [_jsxs("div", { className: "flex items-center justify-between text-xs font-semibold mb-1.5", children: [_jsx("span", { className: SIDE_TEXT.H, children: he }), _jsx("span", { className: "text-muted text-center", children: lead ? tt("{0} lead {1} of {2} categories", { 0: tname(lead === 'H' ? home : away), 1: Math.max(he, ae), 2: cats }) : tt("Level: {0} categories each", { 0: he }) }), _jsx("span", { className: SIDE_TEXT.A, children: ae })] }), _jsxs("div", { className: "flex h-2 gap-[3px]", children: [_jsx("div", { className: "rounded-full bg-home", style: { width: `${(he / cats) * 100}%` } }), _jsx("div", { className: "rounded-full bg-away", style: { width: `${(ae / cats) * 100}%` } })] })] })), _jsx("div", { className: "mt-5 space-y-5", children: groups.map(g => (_jsxs("div", { children: [_jsx("div", { className: "label pb-1", children: g.title }), _jsx("ul", { className: "divide-y divide-line/40", children: g.rows.map(r => _jsx(CmpLine, { r: r }, r.label)) })] }, g.title))) }), Math.min(h.withStats, a.withStats) < Math.min(h.games, a.games) && (_jsx("p", { className: "mt-4 text-[11px] text-faint", children: tt("Goals are from all {0} games. Shots, corners and cards are averaged over the games where our data provider has detailed statistics ({1}: {2}, {3}: {4}).", { 0: Math.max(h.games, a.games), 1: tname(home), 2: h.withStats, 3: tname(away), 4: a.withStats }) }))] }));
}
const TAB_IDS = ['prediction', 'highlights', 'stats', 'lineups', 'rest', 'h2h', 'table'];
function LeagueTable({ tables: show, name, home, away }) {
    const homeId = home.id, awayId = away.id;
    const find = (id) => {
        for (const t of show) {
            const r = t.table.find(x => x.team.id === id);
            if (r)
                return { r, of: t.table.length };
        }
        return null;
    };
    const h = find(homeId), a = find(awayId);
    const card = (s, x) => {
        const team = s === 'H' ? home : away;
        return (_jsxs("div", { className: `relative overflow-hidden rounded-2xl border border-line/60 bg-surface2/40 p-4 ${s === 'A' ? 'text-right' : ''}`, children: [_jsx("span", { className: `absolute top-0 ${s === 'H' ? 'left-0' : 'right-0'} w-1 h-full ${SIDE_BG[s]}` }), _jsxs("div", { className: `flex items-center gap-2 ${s === 'A' ? 'flex-row-reverse' : ''}`, children: [team.crest && _jsx("img", { src: team.crest, alt: "", className: "w-[22px] h-[22px] object-contain" }), _jsx("span", { className: "font-display font-bold text-ink truncate", children: tname(team) })] }), x ? (_jsxs("div", { className: `mt-3 flex flex-wrap items-end gap-x-4 gap-y-2 ${s === 'A' ? 'flex-row-reverse' : ''}`, children: [_jsxs("div", { children: [_jsxs("div", { className: `num font-display text-4xl font-extrabold leading-none ${SIDE_TEXT[s]}`, children: [x.r.position, _jsxs("span", { className: "text-sm text-faint font-semibold", children: ["/", x.of] })] }), _jsx("div", { className: "text-[10px] text-faint uppercase tracking-wide mt-1", children: tt("Position") })] }), _jsxs("div", { children: [_jsx("div", { className: "num text-lg font-bold text-ink leading-none", children: x.r.points }), _jsx("div", { className: "text-[10px] text-faint uppercase tracking-wide mt-1", children: tt("Pts") })] }), _jsxs("div", { className: "hidden sm:block", children: [_jsxs("div", { className: "num text-lg font-bold text-ink leading-none", children: [x.r.won, "-", x.r.draw, "-", x.r.lost] }), _jsx("div", { className: "text-[10px] text-faint uppercase tracking-wide mt-1", children: "W-D-L" })] }), _jsxs("div", { children: [_jsxs("div", { className: `num text-lg font-bold leading-none ${x.r.goalDifference > 0 ? 'text-win' : x.r.goalDifference < 0 ? 'text-loss' : 'text-ink'}`, children: [x.r.goalDifference > 0 ? '+' : '', x.r.goalDifference] }), _jsx("div", { className: "text-[10px] text-faint uppercase tracking-wide mt-1", children: tt("GD") })] })] })) : _jsx("p", { className: "mt-3 text-xs text-faint", children: tt("Not in this table") })] }));
    };
    const sameTable = h && a && show.some(t => t.table.some(x => x.team.id === homeId) && t.table.some(x => x.team.id === awayId));
    const gap = h && a && sameTable ? Math.abs(h.r.position - a.r.position) : 0;
    const pts = h && a && sameTable ? Math.abs(h.r.points - a.r.points) : 0;
    const upper = h && a && gap ? (h.r.position < a.r.position ? 'H' : 'A') : null;
    const hasForm = show.some(t => t.table.some(r => r.form));
    return (_jsxs(Section, { title: tt("Standings"), note: name, children: [_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [card('H', h), card('A', a)] }), upper && (_jsxs("p", { className: "mt-3 text-center text-xs text-muted", children: [_jsx("b", { className: SIDE_TEXT[upper], children: tname(upper === 'H' ? home : away) }), " ", gap === 1 ? tt("are one place higher") : tt("are {0} places higher", { 0: gap }), pts ? ` · ${tt("{0} points apart", { 0: pts })}` : ''] })), _jsx("div", { className: "mt-5 space-y-5", children: show.map((t, i) => (_jsxs("div", { children: [t.group && show.length > 1 && _jsx("div", { className: "label pb-2", children: t.group.replace(/_/g, ' ') }), _jsxs("table", { className: "w-full table-fixed text-xs sm:text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-faint text-[10px] uppercase tracking-wide", children: [_jsx("th", { className: "text-left font-semibold py-1.5 w-9", children: "#" }), _jsx("th", { className: "text-left font-semibold py-1.5", children: tt("Team") }), _jsx("th", { className: "text-right font-semibold py-1.5 num w-8 sm:w-10", children: "P" }), _jsx("th", { className: "hidden sm:table-cell text-right font-semibold py-1.5 num w-10", children: "W" }), _jsx("th", { className: "hidden sm:table-cell text-right font-semibold py-1.5 num w-10", children: "D" }), _jsx("th", { className: "hidden sm:table-cell text-right font-semibold py-1.5 num w-10", children: "L" }), _jsx("th", { className: "hidden sm:table-cell text-right font-semibold py-1.5 num w-16", children: tt("Goals") }), _jsx("th", { className: "text-right font-semibold py-1.5 num w-10 sm:w-12", children: tt("GD") }), hasForm && _jsx("th", { className: "hidden lg:table-cell text-center font-semibold py-1.5 w-32", children: tt("Form") }), _jsx("th", { className: "text-right font-semibold py-1.5 pr-2 num w-10 sm:w-12", children: tt("Pts") })] }) }), _jsx("tbody", { children: t.table.map(r => {
                                        const side = r.team.id === homeId ? 'H' : r.team.id === awayId ? 'A' : null;
                                        const f = r.form ? r.form.split(',').map(x => x.trim()).filter(Boolean).slice(-5) : [];
                                        return (_jsxs("tr", { className: `border-t border-line/40 ${side === 'H' ? 'bg-home/10' : side === 'A' ? 'bg-away/10' : 'hover:bg-surface2/40'}`, children: [_jsxs("td", { className: "py-1.5 relative", children: [side && _jsx("span", { className: `absolute left-0 inset-y-1 w-[3px] rounded-full ${SIDE_BG[side]}` }), _jsx("span", { className: `ml-1.5 inline-grid place-items-center w-5 h-5 rounded-md num text-[10px] font-bold ${r.position <= 4 && show.length === 1 ? 'bg-accent/15 text-accent' : 'text-faint'}`, children: r.position })] }), _jsx("td", { className: "py-1.5 pr-2", children: _jsxs("span", { className: "flex items-center gap-2 min-w-0", children: [r.team.crest ? _jsx("img", { src: r.team.crest, alt: "", className: "w-[18px] h-[18px] object-contain flex-shrink-0" }) : _jsx("span", { className: "w-[18px] h-[18px] rounded-full bg-surface2 flex-shrink-0" }), _jsx("span", { className: `truncate ${side ? 'font-bold text-ink' : 'text-ink'}`, children: r.team.shortName || r.team.name })] }) }), _jsx("td", { className: "py-1.5 text-right num text-muted", children: r.playedGames }), _jsx("td", { className: "hidden sm:table-cell py-1.5 text-right num text-muted", children: r.won }), _jsx("td", { className: "hidden sm:table-cell py-1.5 text-right num text-muted", children: r.draw }), _jsx("td", { className: "hidden sm:table-cell py-1.5 text-right num text-muted", children: r.lost }), _jsxs("td", { className: "hidden sm:table-cell py-1.5 text-right num text-muted", children: [r.goalsFor, ":", r.goalsAgainst] }), _jsxs("td", { className: `py-1.5 text-right num font-semibold ${r.goalDifference > 0 ? 'text-win' : r.goalDifference < 0 ? 'text-loss' : 'text-muted'}`, children: [r.goalDifference > 0 ? '+' : '', r.goalDifference] }), hasForm && (_jsx("td", { className: "hidden lg:table-cell py-1.5", children: _jsx("span", { className: "flex justify-center gap-0.5", children: f.map((x, j) => _jsx("span", { className: `w-4 h-4 rounded text-[8px] font-extrabold grid place-items-center ${FORM_CLS[x] || 'bg-line text-muted'}`, children: x }, j)) }) })), _jsx("td", { className: "py-1.5 pr-2 text-right num font-extrabold text-ink", children: r.points })] }, r.team.id));
                                    }) })] })] }, i))) })] }));
}
/** Split a lineup into rows using the formation string (e.g. "4-2-3-1"); falls back to positions. */
function formationRows(team) {
    const lineup = (team.lineup || []);
    if (!lineup.length)
        return [];
    // exact positions from the provider ("row:col", row 1 = goalkeeper) when every starter has one
    if (lineup.every(p => p.grid && /^\d+:\d+$/.test(p.grid))) {
        const byRow = new Map();
        for (const p of lineup) {
            const [r] = p.grid.split(':').map(Number);
            byRow.set(r, [...(byRow.get(r) || []), p]);
        }
        return [...byRow.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, ps]) => ps.sort((a, b) => Number(b.grid.split(':')[1]) - Number(a.grid.split(':')[1])));
    }
    const gkFound = lineup.filter(p => /goal/i.test(p.position || ''));
    // no goalkeeper flagged: the provider lists him first
    const gk = gkFound.length ? gkFound : lineup.slice(0, 1);
    const outfield = lineup.filter(p => !gk.includes(p));
    const counts = (team.formation || '')
        .split('-')
        .map(n => parseInt(n, 10))
        .filter(n => Number.isFinite(n) && n > 0);
    const rows = [gk];
    if (counts.length && counts.reduce((a, b) => a + b, 0) === outfield.length) {
        let i = 0;
        for (const c of counts) {
            rows.push(outfield.slice(i, i + c));
            i += c;
        }
    }
    else {
        const by = (re) => outfield.filter(p => re.test(p.position || ''));
        const d = by(/def/i);
        const mid = by(/mid/i);
        const att = by(/off|att|for/i);
        const rest = outfield.filter(p => !d.includes(p) && !mid.includes(p) && !att.includes(p));
        [d, [...mid, ...rest], att].forEach(r => r.length && rows.push(r));
    }
    return rows;
}
/** Player page link: API-Football ids open directly; other ids are looked up by name within the team. */
function playerHref(pl, team, code) {
    if (pl.id >= 1000000000)
        return `/player/${pl.id}`;
    if (!pl.name || pl.name === '?' || pl.id < 0 && !team.id)
        return null;
    return `/player/find?${new URLSearchParams({ name: pl.name, team: String(team.id), ...(code ? { c: code } : {}), n: team.name }).toString()}`;
}
function lastName(name) {
    const parts = name.trim().split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1] : name;
}
/** Starts in the analysed games as small pips (filled = started). */
function StartPips({ n, of }) {
    return (_jsx("span", { className: "inline-flex gap-[2px]", "aria-label": tt("started {0} of {1}", { 0: n, 1: of }), children: Array.from({ length: of }, (_, i) => _jsx("span", { className: `w-[5px] h-[5px] rounded-full ${i < n ? 'bg-accent' : 'bg-white/30'}` }, i)) }));
}
function PitchToken({ p, side, of, href }) {
    const showStarts = typeof p.starts === 'number' && !!of;
    const title = `${p.name}${p.position ? ` · ${p.position}` : ''}${showStarts ? ` · ${tt("started {0} of {1}", { 0: p.starts, 1: of })}` : ''}`;
    const name = _jsx("span", { className: "block max-w-[68px] sm:max-w-[84px] truncate rounded-md bg-black/55 px-1.5 py-[2px] text-[11px] font-semibold leading-tight text-white", children: lastName(p.name) });
    return (_jsxs("div", { className: "flex flex-col items-center gap-1 w-[70px] sm:w-[84px]", title: title, children: [_jsx("div", { className: `w-9 h-9 sm:w-10 sm:h-10 rounded-full grid place-items-center shadow-[0_2px_6px_rgba(0,0,0,0.45)] ring-2 ring-white/85 ${side === 'home' ? 'bg-home' : 'bg-away'}`, children: _jsx("span", { className: "num text-sm font-extrabold text-white", children: p.shirtNumber ?? '' }) }), href ? _jsx(Link, { to: href, className: "hover:underline", children: name }) : name, showStarts && _jsx(StartPips, { n: p.starts, of: of })] }));
}
const POS_GROUPS = [
    { k: 'G', label: 'Goalkeeper', re: /goal/i },
    { k: 'D', label: 'Defence', re: /def|back/i },
    { k: 'M', label: 'Midfield', re: /mid/i },
    { k: 'F', label: 'Attack', re: /off|att|for|wing|striker/i }
];
/** The XI as a list by line, under the pitch — easy to read on a phone. */
function XiList({ team, side, of, code }) {
    const rows = formationRows(team);
    const lineup = rows.flat();
    if (!lineup.length)
        return null;
    // lines: from the provider position, or from the pitch row (GK, then the formation lines)
    const lineOf = (pl) => {
        const g = POS_GROUPS.find(x => x.re.test(pl.position || ''));
        if (g)
            return g.k;
        const r = rows.findIndex(row => row.includes(pl));
        return r === 0 ? 'G' : r === rows.length - 1 ? 'F' : r === 1 ? 'D' : 'M';
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [team.crest && _jsx("img", { src: team.crest, alt: "", className: "w-5 h-5 object-contain" }), _jsx("span", { className: "font-display font-bold text-ink", children: team.shortName || team.name }), team.formation && _jsx("span", { className: "num text-xs text-faint", children: team.formation })] }), _jsx("div", { className: "space-y-2", children: POS_GROUPS.map(g => {
                    const list = lineup.filter(pl => lineOf(pl) === g.k);
                    if (!list.length)
                        return null;
                    return (_jsxs("div", { children: [_jsx("div", { className: "text-[10px] font-bold uppercase tracking-wide text-faint mb-1", children: tt(g.label) }), _jsx("ul", { className: "space-y-1", children: list.map(pl => {
                                    const href = playerHref(pl, team, code);
                                    return (_jsxs("li", { className: "flex items-center gap-2.5 text-sm", children: [_jsx("span", { className: `num w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold text-white shrink-0 ${side === 'home' ? 'bg-home' : 'bg-away'}`, children: pl.shirtNumber ?? '' }), href ? _jsx(Link, { to: href, className: "text-ink hover:text-accent truncate", children: pl.name }) : _jsx("span", { className: "text-ink truncate", children: pl.name }), typeof pl.starts === 'number' && !!of && _jsx("span", { className: "ml-auto num text-[11px] text-faint whitespace-nowrap", children: tt("started {0} of {1}", { 0: pl.starts, 1: of }) })] }, pl.id));
                                }) })] }, g.k));
                }) })] }));
}
/** Both XIs on one pitch, facing each other: across on wide screens, top-to-bottom on phones. */
function Pitch({ home, away, probable = false, code }) {
    // a: 0..100 along the pitch (home goal → away goal), b: 0..100 across
    const place = (team, isHome) => {
        const rows = formationRows(team);
        const n = rows.length;
        return rows.flatMap((row, i) => row.map((pl, j) => {
            const t = n <= 1 ? 0 : i / (n - 1);
            const a = isHome ? 6 + t * 38 : 94 - t * 38;
            const b = ((j + 1) / (row.length + 1)) * 100;
            return { pl, a, b: isHome ? b : 100 - b, team, side: (isHome ? 'home' : 'away') };
        }));
    };
    const dots = [...place(home, true), ...place(away, false)];
    const ofOf = (t) => (probable ? t.basedOn : undefined);
    const head = (t, side) => (_jsxs("div", { className: `flex items-center gap-2 min-w-0 ${side === 'away' ? 'flex-row-reverse text-right' : ''}`, children: [_jsx("span", { className: `w-2.5 h-2.5 rounded-full shrink-0 ${side === 'home' ? 'bg-home' : 'bg-away'}` }), t.crest && _jsx("img", { src: t.crest, alt: "", className: "w-6 h-6 object-contain shrink-0" }), _jsxs("span", { className: "min-w-0", children: [_jsx("span", { className: "block font-display font-bold text-ink truncate", children: t.shortName || t.name }), _jsx("span", { className: "block num text-[11px] text-faint truncate", children: [t.formation, t.coach?.name].filter(Boolean).join(' · ') })] })] }));
    const grass = (deg) => ({ background: `repeating-linear-gradient(${deg}deg, rgb(28 120 66) 0 10%, rgb(33 131 73) 10% 20%)` });
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between gap-3 mb-3", children: [head(home, 'home'), probable && _jsx("span", { className: "shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-faint px-2 py-1 rounded-full border border-line", children: tt("Probable") }), head(away, 'away')] }), _jsxs("div", { className: "hidden sm:block relative w-full rounded-2xl overflow-hidden border border-line/60", style: { aspectRatio: '16 / 10', ...grass(90) }, children: [_jsxs("svg", { viewBox: "0 0 1000 625", className: "absolute inset-0 w-full h-full", preserveAspectRatio: "none", fill: "none", stroke: "rgba(255,255,255,0.5)", strokeWidth: "2", "aria-hidden": true, children: [_jsx("rect", { x: "15", y: "15", width: "970", height: "595", rx: "3" }), _jsx("line", { x1: "500", y1: "15", x2: "500", y2: "610" }), _jsx("circle", { cx: "500", cy: "312", r: "72" }), _jsx("rect", { x: "15", y: "150", width: "140", height: "325" }), _jsx("rect", { x: "15", y: "235", width: "50", height: "155" }), _jsx("rect", { x: "845", y: "150", width: "140", height: "325" }), _jsx("rect", { x: "935", y: "235", width: "50", height: "155" }), _jsx("path", { d: "M155 250 A70 70 0 0 1 155 375" }), _jsx("path", { d: "M845 250 A70 70 0 0 0 845 375" })] }), dots.map(d => (_jsx("div", { className: "absolute -translate-x-1/2 -translate-y-[22px]", style: { left: `${d.a}%`, top: `${d.b}%` }, children: _jsx(PitchToken, { p: d.pl, side: d.side, of: ofOf(d.team), href: playerHref(d.pl, d.team, code) }) }, `${d.side}${d.pl.id}`)))] }), _jsxs("div", { className: "sm:hidden relative w-full rounded-2xl overflow-hidden border border-line/60", style: { aspectRatio: '10 / 15', ...grass(0) }, children: [_jsxs("svg", { viewBox: "0 0 400 600", className: "absolute inset-0 w-full h-full", preserveAspectRatio: "none", fill: "none", stroke: "rgba(255,255,255,0.5)", strokeWidth: "1.5", "aria-hidden": true, children: [_jsx("rect", { x: "8", y: "8", width: "384", height: "584", rx: "2" }), _jsx("line", { x1: "8", y1: "300", x2: "392", y2: "300" }), _jsx("circle", { cx: "200", cy: "300", r: "45" }), _jsx("rect", { x: "90", y: "8", width: "220", height: "80" }), _jsx("rect", { x: "150", y: "8", width: "100", height: "30" }), _jsx("rect", { x: "90", y: "512", width: "220", height: "80" }), _jsx("rect", { x: "150", y: "562", width: "100", height: "30" })] }), dots.map(d => (_jsx("div", { className: "absolute -translate-x-1/2 -translate-y-[20px]", style: { top: `${4 + (100 - d.a) * 0.88}%`, left: `${d.b}%` }, children: _jsx(PitchToken, { p: d.pl, side: d.side, of: ofOf(d.team), href: playerHref(d.pl, d.team, code) }) }, `${d.side}${d.pl.id}`)))] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6 mt-5", children: [_jsx(XiList, { team: home, side: "home", of: ofOf(home), code: code }), _jsx(XiList, { team: away, side: "away", of: ofOf(away), code: code })] })] }));
}
/* ------------------------------------------------------------------ */
/* Live pitch: both XIs in their formation, with what happened to each */
/* player (goals, assists, cards, substitutions). From the event feed — */
/* no positions or ball tracking (our data provider doesn't have them).  */
/* ------------------------------------------------------------------ */
const nameKey = (n) => lastName(n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function LivePitch({ m, home, away, live }) {
    // events are matched to players by id, or by surname when the lineup and the events come from different feeds
    const same = (pl, x) => !!x && (x.id === pl.id || (!!x.name && nameKey(x.name) === nameKey(pl.name)));
    const info = (pl, teamId) => {
        const goals = (m.goals || []).filter(g => g.type !== 'OWN' && g.team.id === teamId && same(pl, g.scorer)).length;
        const own = (m.goals || []).filter(g => g.type === 'OWN' && same(pl, g.scorer)).length;
        const assists = (m.goals || []).filter(g => g.team.id === teamId && same(pl, g.assist)).length;
        const cards = (m.bookings || []).filter(b => b.team.id === teamId && same(pl, b.player));
        const yellow = cards.some(c => c.card === 'YELLOW');
        const red = cards.find(c => c.card === 'RED' || c.card === 'YELLOW_RED');
        return { goals, own, assists, yellow, red };
    };
    // who is in each starting slot now: follow the substitutions
    const slot = (starter, teamId) => {
        let cur = starter;
        const chain = [];
        for (const sub of [...(m.substitutions || [])].filter(x => x.team.id === teamId).sort((a, b) => a.minute - b.minute)) {
            if (same(cur, sub.playerOut)) {
                chain.push({ out: cur.name, in: sub.playerIn.name, minute: sub.minute });
                cur = { id: sub.playerIn.id, name: sub.playerIn.name, shirtNumber: null };
            }
        }
        return { cur, chain };
    };
    const side = (team, isHome) => {
        const rows = formationRows(team);
        const n = rows.length;
        return rows.flatMap((row, i) => row.map((pl, j) => {
            const t = n <= 1 ? 0 : i / (n - 1);
            const x = isHome ? 5 + t * 40 : 95 - t * 40;
            const y = ((j + 1) / (row.length + 1)) * 100;
            return { pl, x, y: isHome ? y : 100 - y, teamId: team.id };
        }));
    };
    const dots = [...side(home, true), ...side(away, false)];
    const ft = m.score?.fullTime;
    const Mark = ({ children, cls }) => _jsx("span", { className: `absolute grid place-items-center rounded-full text-[9px] font-extrabold leading-none ${cls}`, children: children });
    return (_jsxs("div", { children: [_jsxs("div", { className: "relative w-full rounded-2xl overflow-hidden border border-line/60", style: { aspectRatio: '16 / 10', background: 'repeating-linear-gradient(90deg, rgb(28 120 66) 0 10%, rgb(33 131 73) 10% 20%)' }, children: [_jsxs("svg", { viewBox: "0 0 1000 625", className: "absolute inset-0 w-full h-full", preserveAspectRatio: "none", fill: "none", stroke: "rgba(255,255,255,0.55)", strokeWidth: "2", "aria-hidden": true, children: [_jsx("rect", { x: "15", y: "15", width: "970", height: "595", rx: "3" }), _jsx("line", { x1: "500", y1: "15", x2: "500", y2: "610" }), _jsx("circle", { cx: "500", cy: "312", r: "72" }), _jsx("rect", { x: "15", y: "150", width: "140", height: "325" }), _jsx("rect", { x: "15", y: "235", width: "50", height: "155" }), _jsx("rect", { x: "845", y: "150", width: "140", height: "325" }), _jsx("rect", { x: "935", y: "235", width: "50", height: "155" }), _jsx("path", { d: "M155 250 A70 70 0 0 1 155 375" }), _jsx("path", { d: "M845 250 A70 70 0 0 0 845 375" })] }), _jsxs("div", { className: "absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1 rounded-full bg-black/55 backdrop-blur text-white text-xs font-bold", children: [live && _jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-live animate-pulseDot" }), _jsx("span", { children: home.tla || home.shortName || home.name }), _jsxs("span", { className: "num", children: [ft?.home ?? 0, " \u2013 ", ft?.away ?? 0] }), _jsx("span", { children: away.tla || away.shortName || away.name }), _jsx("span", { className: "text-white/70 font-semibold", children: live ? (m.status === 'PAUSED' ? tt("HT") : m.minute ? `${m.minute}'` : tt("Live")) : tt("FT") })] }), dots.map(({ pl, x, y, teamId }) => {
                        const { cur, chain } = slot(pl, teamId);
                        const a = info(pl, teamId), b = cur !== pl ? info(cur, teamId) : null;
                        const goals = a.goals + (b?.goals || 0), assists = a.assists + (b?.assists || 0), own = a.own + (b?.own || 0);
                        const red = (b || a).red || a.red;
                        const yellow = (b || a).yellow;
                        const isHome = teamId === home.id;
                        const title = [
                            chain.length ? `${chain.map(c => `${c.out} ⟶ ${c.in} (${c.minute}')`).join(', ')}` : pl.name,
                            goals ? `${goals} goal${goals > 1 ? 's' : ''}` : '', assists ? `${assists} assist${assists > 1 ? 's' : ''}` : '',
                            own ? 'own goal' : '', red ? tt("sent off {0}'", { 0: red.minute }) : yellow ? 'booked' : ''
                        ].filter(Boolean).join(' · ');
                        return (_jsxs("div", { className: "absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center w-[72px] sm:w-[84px]", style: { left: `${x}%`, top: `${y}%` }, title: title, children: [_jsxs("div", { className: `relative w-7 h-7 sm:w-9 sm:h-9 rounded-full grid place-items-center text-[11px] sm:text-xs font-extrabold num shadow-[0_2px_6px_rgba(0,0,0,0.45)] ${isHome ? 'bg-home text-white' : 'bg-away text-white'} ${red ? 'opacity-40 grayscale' : ''}`, children: [cur.shirtNumber ?? pl.shirtNumber ?? '', goals > 0 && _jsx(Mark, { cls: "-top-1.5 -right-2 w-4 h-4 bg-white text-black ring-1 ring-black/30", children: goals > 1 ? goals : '⚽' }), assists > 0 && _jsx(Mark, { cls: "-bottom-1 -right-2 w-4 h-4 bg-accent text-black", children: "A" }), own > 0 && _jsx(Mark, { cls: "-top-1.5 -left-2 w-4 h-4 bg-loss text-white", children: tt("OG") }), (yellow || red) && _jsx("span", { className: `absolute -top-1 -left-1.5 w-2.5 h-3.5 rounded-[2px] ring-1 ring-black/30 ${red ? 'bg-loss' : 'bg-draw'}` }), chain.length > 0 && _jsx(Mark, { cls: "-bottom-1 -left-2 w-4 h-4 bg-win text-black", children: "\u21C5" })] }), (() => {
                                    const href = playerHref(cur, isHome ? home : away, m.competition?.code);
                                    const cls = 'mt-0.5 text-[10px] sm:text-[11px] leading-tight text-white font-semibold text-center drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] truncate max-w-full';
                                    return href ? _jsx(Link, { to: href, className: `${cls} hover:underline`, children: lastName(cur.name) }) : _jsx("span", { className: cls, children: lastName(cur.name) });
                                })(), chain.length > 0 && (_jsx("span", { className: "text-[9px] leading-tight text-white/75 drop-shadow truncate max-w-full", children: tt("{0}' for {1}", { 0: chain[chain.length - 1].minute, 1: lastName(chain[chain.length - 1].out) }) }))] }, `${teamId}-${pl.id}`));
                    })] }), _jsxs("div", { className: "mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-muted", children: [_jsxs("span", { className: "inline-flex items-center gap-1.5", children: [_jsx("span", { className: "w-3.5 h-3.5 rounded-full bg-white text-black text-[8px] grid place-items-center", children: "\u26BD" }), tt("Goal")] }), _jsxs("span", { className: "inline-flex items-center gap-1.5", children: [_jsx("span", { className: "w-3.5 h-3.5 rounded-full bg-accent text-black text-[8px] font-extrabold grid place-items-center", children: "A" }), tt("Assist")] }), _jsxs("span", { className: "inline-flex items-center gap-1.5", children: [_jsx("span", { className: "w-2 h-3 rounded-[2px] bg-draw" }), tt("Yellow")] }), _jsxs("span", { className: "inline-flex items-center gap-1.5", children: [_jsx("span", { className: "w-2 h-3 rounded-[2px] bg-loss" }), tt("Red (greyed out)")] }), _jsxs("span", { className: "inline-flex items-center gap-1.5", children: [_jsx("span", { className: "w-3.5 h-3.5 rounded-full bg-win text-black text-[8px] grid place-items-center", children: "\u21C5" }), tt("Came on")] })] }), _jsx("p", { className: "mt-2 text-center text-[11px] text-faint", children: tt("Players in their starting formation; the pitch updates with goals, cards and substitutions. It does not show player or ball positions.") })] }));
}
function Bench({ team, code }) {
    const bench = team.bench || [];
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsxs("div", { className: "flex items-center gap-2 text-sm font-semibold text-ink", children: [team.crest && _jsx("img", { src: team.crest, alt: "", className: "w-4 h-4 object-contain" }), team.shortName || team.name, " ", tt("· bench")] }), team.coach?.name && _jsxs("span", { className: "text-[11px] text-faint", children: [tt("Coach"), ' ', team.coach.name] })] }), bench.length ? (_jsx("ul", { className: "grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted", children: bench.map(pl => (_jsxs("li", { className: "flex items-center gap-2 min-w-0", children: [_jsx("span", { className: "num w-5 text-right text-faint", children: pl.shirtNumber ?? '' }), (() => {
                            const href = playerHref(pl, team, code);
                            return href ? _jsx(Link, { to: href, className: "truncate hover:text-ink hover:underline", children: pl.name }) : _jsx("span", { className: "truncate", children: pl.name });
                        })()] }, pl.id))) })) : (_jsx("p", { className: "text-xs text-faint", children: tt("No bench data.") }))] }));
}
export default MatchDetail;
