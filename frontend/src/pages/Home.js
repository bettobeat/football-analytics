import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RecentResults from '../components/RecentResults';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL, socket } from '../lib/socket';
import { useAuth } from '../lib/auth';
import { isCovered, revealMatch, useRevealState, justRevealed } from '../lib/reveal';
import { matchFame } from '../lib/fame';
import CountUp from '../components/CountUp';
import { RevealChip } from '../components/Reveal';
import { useFavorites } from '../lib/favorites';
import { t as tt, LOCALE } from '../lib/i18n';
/** "BBC Sport · Premier League": the outlet and the first league the story is filed under */
const srcLine = (n) => [n.source, n.leagues?.[0]?.name].filter(Boolean).join(' · ');
const LIVE = new Set(['IN_PLAY', 'PAUSED', 'LIVE']);
const MAIN = ['grid-v3', 'elo-intl', 'elo-euro'];
const tn = (t) => t.shortName || t.name;
const when = (iso) => new Date(iso).toLocaleString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const ago = (iso) => {
    if (!iso)
        return '';
    const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return m < 60 ? tt("{0} min ago", { 0: m }) : m < 1440 ? tt("{0} h ago", { 0: Math.round(m / 60) }) : tt("{0} d ago", { 0: Math.round(m / 1440) });
};
/** Our main prediction for a match: v3 (leagues), v3 national-team engine, v3 European-cup engine, else what the match carries. */
function mainPred(m) {
    return m.predictions?.find(p => MAIN.includes(p.model)) || m.prediction || null;
}
const hasPct = (p) => !!p && !p.locked && typeof p.home === 'number';
const topPct = (p) => Math.max(p.home, p.draw, p.away);
const MAJOR = /champions league|world cup|euro(pean championship)?\b|nations league|copa am[eé]rica|europa league|conference league/i;
/** Lower = bigger stage: Champions League, the top leagues, major national-team / European competitions, then the rest. */
function priority(m) {
    if (m.competition.code === 'CL')
        return 0;
    if ((m.competition.rank ?? 9) <= 1)
        return 1;
    if (MAJOR.test(m.competition.name) && !/qualif/i.test(m.competition.name))
        return 2;
    if (MAJOR.test(m.competition.name))
        return 3;
    return 5;
}
/** Big featured match: the two crests, blown up and blurred, paint the background in the teams' own colours. */
function FeaturedHero({ m, p, label }) {
    if (!m)
        return (_jsxs("div", { className: "relative overflow-hidden rounded-[32px] border border-white/10 min-h-[360px] sm:min-h-[460px] bg-[linear-gradient(160deg,#0F1A2B_0%,#0A0F17_60%,#07090D_100%)] p-10 flex flex-col justify-center gap-3 text-[#EEF1F6]", children: [_jsxs("div", { className: "font-display text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.05]", children: [tt("Sports predictions,"), _jsx("br", {}), tt("tested in public.")] }), _jsx("p", { className: "text-[#C9D0DB] max-w-lg", children: tt("The next fixtures appear here as soon as they are scheduled.") })] }));
    const k = p ? (p.pick || (hasPct(p) ? (p.home >= p.draw && p.home >= p.away ? 'H' : p.away >= p.draw ? 'A' : 'D') : null)) : null;
    const side = (t) => (_jsxs(Link, { to: `/team/${t.id}?c=${m.competition.code}&n=${encodeURIComponent(t.name)}`, className: "group flex flex-col items-center gap-3 sm:gap-4 min-w-0", children: [_jsx("span", { className: "relative grid place-items-center w-24 h-24 sm:w-36 sm:h-36 rounded-full bg-white/[0.06] border border-white/10 backdrop-blur-md shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] transition-transform group-hover:scale-[1.04]", children: _jsx(Crest, { team: t, size: 72 }) }), _jsx("span", { className: "font-display font-extrabold text-lg sm:text-3xl tracking-tight text-center leading-tight max-w-full break-words", children: tn(t) })] }));
    const roll = justRevealed(m.id);
    const pill = (o, label, v) => (_jsxs("div", { className: `glass px-3 py-2.5 sm:px-4 text-center ${k === o ? 'ring-2 ring-[#C8FF3D]/70' : ''} ${roll && k === o ? 'animate-pop' : ''}`, children: [_jsx("div", { className: "text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9AA3B2] truncate", children: label }), _jsx("div", { className: `font-display font-extrabold text-xl sm:text-2xl ${k === o ? 'text-[#C8FF3D]' : 'text-white'}`, children: v < 0.5 ? '<1%' : _jsx(CountUp, { value: v, suffix: "%", animate: roll, delay: o === 'H' ? 0 : o === 'D' ? 120 : 240 }) })] }));
    return (_jsxs("div", { className: "relative overflow-hidden rounded-[32px] border border-white/10 min-h-[420px] sm:min-h-[480px] bg-[#0A0E15] text-[#EEF1F6] isolate", children: [m.homeTeam.crest && _jsx("img", { src: m.homeTeam.crest, alt: "", "aria-hidden": true, className: "absolute -z-10 -left-24 top-1/2 -translate-y-1/2 w-[560px] h-[560px] object-contain blur-[80px] opacity-50 saturate-150" }), m.awayTeam.crest && _jsx("img", { src: m.awayTeam.crest, alt: "", "aria-hidden": true, className: "absolute -z-10 -right-24 top-1/2 -translate-y-1/2 w-[560px] h-[560px] object-contain blur-[80px] opacity-50 saturate-150" }), _jsx("div", { "aria-hidden": true, className: "absolute inset-0 -z-10 bg-[radial-gradient(600px_260px_at_50%_-60px,rgba(255,255,255,0.16),transparent_70%),linear-gradient(to_bottom,rgba(7,9,13,0.1),rgba(7,9,13,0.75))]" }), _jsx("svg", { "aria-hidden": true, viewBox: "0 0 1000 400", preserveAspectRatio: "none", className: "absolute -z-10 left-[-10%] w-[120%] bottom-0 h-[55%] opacity-30", style: { transform: 'perspective(600px) rotateX(55deg)', transformOrigin: 'bottom' }, children: _jsxs("g", { fill: "none", stroke: "#C8FF3D", strokeWidth: "2", children: [_jsx("rect", { x: "20", y: "10", width: "960", height: "380" }), _jsx("line", { x1: "500", y1: "10", x2: "500", y2: "390" }), _jsx("circle", { cx: "500", cy: "200", r: "70" }), _jsx("rect", { x: "20", y: "110", width: "140", height: "180" }), _jsx("rect", { x: "840", y: "110", width: "140", height: "180" })] }) }), _jsxs("div", { className: "relative h-full p-5 sm:p-9 flex flex-col gap-6 sm:gap-8", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-center sm:justify-between gap-2", children: [_jsx("span", { className: "text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#07090D] bg-[#C8FF3D] px-3 py-1.5 rounded-full", children: label || tt("Featured match") }), _jsxs("span", { className: "glass !rounded-full inline-flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm text-[#C9D0DB]", children: [m.competition.emblem && _jsx("img", { src: m.competition.emblem, alt: "", width: 16, height: 16, className: "w-4 h-4 object-contain" }), m.competition.name] })] }), _jsxs("div", { className: "grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6 flex-1", children: [side(m.homeTeam), _jsxs("div", { className: "flex flex-col items-center gap-2", children: [_jsx("span", { className: "font-display font-extrabold text-3xl sm:text-6xl text-white/90 tracking-tight", children: tt("VS") }), _jsx("span", { className: "text-xs sm:text-sm font-bold text-white", children: new Date(m.utcDate).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) }), _jsx("span", { className: "text-[11px] sm:text-xs text-[#9AA3B2]", children: new Date(m.utcDate).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }) })] }), side(m.awayTeam)] }), _jsxs("div", { className: "flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6", children: [_jsxs("div", { className: "flex-1 space-y-2", children: [_jsx("div", { className: "text-[11px] font-bold uppercase tracking-[0.1em] text-[#9AA3B2] text-center sm:text-left", children: tt("v3 prediction") }), hasPct(p) && isCovered(m.id, m.status, true) ? (_jsx(RevealChip, { dark: true, onReveal: () => revealMatch(m.id) })) : hasPct(p) ? (_jsxs("div", { className: "grid grid-cols-3 gap-2 sm:gap-3", children: [pill('H', tn(m.homeTeam), p.home), pill('D', tt('Draw'), p.draw), pill('A', tn(m.awayTeam), p.away)] })) : (_jsxs("div", { className: "flex flex-wrap items-center justify-center sm:justify-start gap-3 text-sm", children: [_jsxs("span", { className: "glass !rounded-full px-4 py-2 font-semibold inline-flex items-center gap-2", children: [_jsx(Lock, {}), " ", tt("Prediction locked")] }), _jsx(Link, { to: `/match/${m.id}`, className: "inline-flex items-center gap-1.5 text-[#C8FF3D] font-semibold", children: tt("Unlock it →") })] }))] }), _jsx(Link, { to: `/match/${m.id}`, className: "h-12 px-7 inline-flex items-center justify-center rounded-2xl bg-[#C8FF3D] text-[#07090D] font-extrabold shadow-[0_10px_30px_-10px_rgba(200,255,61,0.6)] hover:brightness-105", children: tt("Full analysis") })] })] })] }));
}
/*
 * Several big games (Oct 2026): the featured card becomes a swipeable row. Swipe / arrows / dots; it moves on by itself
 * every 8 s until the visitor touches it (never with reduced motion). The next card peeks in on phones.
 */
function FeaturedCarousel({ matches }) {
    const track = useRef(null);
    const [at, setAt] = useState(0);
    const [held, setHeld] = useState(false);
    const go = useCallback((i) => {
        const el = track.current;
        if (!el)
            return;
        const n = (i + matches.length) % matches.length;
        const slide = el.children[n];
        if (slide)
            el.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
    }, [matches.length]);
    const onScroll = () => {
        const el = track.current;
        if (!el)
            return;
        const kids = [...el.children];
        let best = 0, dist = Infinity;
        kids.forEach((k, i) => { const d = Math.abs(k.offsetLeft - el.scrollLeft); if (d < dist) {
            dist = d;
            best = i;
        } });
        setAt(best);
    };
    useEffect(() => {
        if (held || matches.length < 2)
            return;
        if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
            return;
        const id = window.setTimeout(() => go(at + 1), 8000);
        return () => window.clearTimeout(id);
    }, [at, held, go, matches.length]);
    const hold = () => setHeld(true);
    const arrow = (dir) => (_jsx("button", { type: "button", onClick: () => { hold(); go(at + dir); }, "aria-label": dir < 0 ? tt('Previous match') : tt('Next match'), className: `hidden sm:grid absolute top-1/2 -translate-y-1/2 ${dir < 0 ? 'left-3' : 'right-3'} z-10 w-10 h-10 place-items-center rounded-full bg-black/40 border border-white/15 text-white backdrop-blur-md hover:bg-black/60 transition-colors`, children: _jsx("svg", { viewBox: "0 0 24 24", className: "w-5 h-5", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round", children: dir < 0 ? _jsx("path", { d: "M15 5l-7 7 7 7" }) : _jsx("path", { d: "M9 5l7 7-7 7" }) }) }));
    return (_jsxs("section", { className: "relative min-w-0", "aria-roledescription": "carousel", "aria-label": tt('Featured matches'), onMouseEnter: hold, onTouchStart: hold, onFocus: hold, children: [_jsx("div", { ref: track, onScroll: onScroll, className: "relative flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar scroll-smooth", children: matches.map((m, i) => (_jsx("div", { className: "shrink-0 basis-[90%] sm:basis-full snap-start min-w-0 [&>*]:h-full", "aria-roledescription": "slide", "aria-label": `${i + 1} / ${matches.length}`, children: _jsx(FeaturedHero, { m: m, p: mainPred(m), label: `${tt('Featured match')} · ${i + 1}/${matches.length}` }) }, m.id))) }), arrow(-1), arrow(1), _jsx("div", { className: "mt-3 flex items-center justify-center gap-1.5", children: matches.map((m, i) => (_jsx("button", { type: "button", onClick: () => { hold(); go(i); }, "aria-label": `${tn(m.homeTeam)} – ${tn(m.awayTeam)}`, "aria-current": i === at ? 'true' : undefined, className: `h-1.5 rounded-full transition-all ${i === at ? 'w-6 bg-accent' : 'w-1.5 bg-faint/50 hover:bg-faint'}` }, m.id))) })] }));
}
function Crest({ team, size = 28 }) {
    return team.crest ? (_jsx("img", { src: team.crest, alt: "", width: size, height: size, className: "object-contain flex-shrink-0", style: { width: size, height: size } })) : (_jsx("span", { className: "rounded-full bg-surface2 grid place-items-center text-[10px] font-display font-bold text-muted flex-shrink-0", style: { width: size, height: size }, children: (team.tla || team.name).slice(0, 3).toUpperCase() }));
}
function Lock() {
    return (_jsxs("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [_jsx("rect", { x: "5", y: "11", width: "14", height: "10", rx: "2" }), _jsx("path", { d: "M8 11V7a4 4 0 0 1 8 0v4" })] }));
}
function Section({ title, action, children }) {
    return (_jsxs("section", { className: "space-y-3.5", children: [_jsxs("div", { className: "flex items-baseline justify-between gap-3", children: [_jsx("h2", { className: "font-display text-lg sm:text-xl font-bold text-ink", children: title }), action] }), children] }));
}
export default function Home() {
    const { access, loading: authLoading } = useAuth();
    const full = access === 'pro' || access === 'admin';
    const [upcoming, setUpcoming] = useState([]);
    const [live, setLive] = useState([]);
    const [summary, setSummary] = useState(null);
    const [news, setNews] = useState([]);
    const [alerts, setAlerts] = useState([]);
    useRevealState();
    // Speed (Oct 2026): the lists load at once, together with the sign-in check — the login cookie goes with every
    // request, so the first answer is already the right one for this user. They are loaded again only when the user
    // signs in or out on this page.
    const loadMatches = useCallback(() => {
        axios.get(`${API_URL}/matches/upcoming`, { params: { days: 14 } }).then(r => setUpcoming(r.data.data || [])).catch(() => undefined);
        axios.get(`${API_URL}/matches/live`).then(r => setLive(r.data.data || [])).catch(() => undefined);
    }, []);
    useEffect(() => {
        loadMatches();
        // the live box must match the Matches page even if the live socket drops: re-check every minute
        const timer = setInterval(loadMatches, 60 * 1000);
        axios.get(`${API_URL}/public/summary`).then(r => setSummary(r.data.data)).catch(() => undefined);
        axios.get(`${API_URL}/news`, { params: { limit: 10 } }).then(r => setNews(r.data.data || [])).catch(() => undefined);
        const onLive = (msg) => setLive(msg.data || []);
        socket.on('matches:live', onLive);
        return () => { socket.off('matches:live', onLive); clearInterval(timer); };
    }, [loadMatches]);
    const firstAccess = useRef(null);
    useEffect(() => {
        if (authLoading)
            return;
        if (firstAccess.current === null) {
            firstAccess.current = access;
            return;
        } // first answer: lists already match it
        if (firstAccess.current !== access) {
            firstAccess.current = access;
            loadMatches();
        }
    }, [access, authLoading, loadMatches]);
    useEffect(() => {
        if (!full) {
            setAlerts([]);
            return;
        }
        axios.get(`${API_URL}/draw-alerts`).then(r => setAlerts(r.data.data.picks || [])).catch(() => undefined);
    }, [full]);
    const notStarted = useMemo(() => upcoming.filter(m => !LIVE.has(m.status) && new Date(m.utcDate).getTime() > Date.now()), [upcoming]);
    // featured: the biggest competition playing in the next week (Champions League > top leagues > major national-team
    // competitions > the rest); within it the biggest teams (lib/fame)
    const featured = useMemo(() => {
        const week = notStarted.filter(m => new Date(m.utcDate).getTime() < Date.now() + 7 * 86400000 && mainPred(m));
        if (!week.length)
            return null;
        const best = Math.min(...week.map(priority));
        const pool = week.filter(m => priority(m) === best);
        // the biggest teams first (a one-sided game like Albania–San Marino is never featured when a bigger one is on),
        // then the closer game, then the earlier one
        const lopsided = (m) => { const p = mainPred(m); return hasPct(p) && topPct(p) >= 85 ? 1 : 0; };
        return [...pool].sort((a, b) => lopsided(a) - lopsided(b) ||
            matchFame(b.homeTeam, b.awayTeam) - matchFame(a.homeTeam, a.awayTeam) ||
            (hasPct(mainPred(a)) && hasPct(mainPred(b)) ? topPct(mainPred(a)) - topPct(mainPred(b)) : 0) ||
            a.utcDate.localeCompare(b.utcDate))[0];
    }, [notStarted, full]);
    // more big games for the featured carousel (Oct 2026): the featured one plus up to 5 other big games of the next
    // 7 days (a famous club on at least one side, not one-sided), shown in kick-off order — swipe to see them
    const featuredList = useMemo(() => {
        if (!featured)
            return [];
        const lopsided = (m) => { const p = mainPred(m); return hasPct(p) && topPct(p) >= 85; };
        const others = notStarted
            .filter(m => m.id !== featured.id && new Date(m.utcDate).getTime() < Date.now() + 7 * 86400000 && mainPred(m))
            .filter(m => matchFame(m.homeTeam, m.awayTeam) >= 8.5 && !lopsided(m))
            .sort((a, b) => matchFame(b.homeTeam, b.awayTeam) - matchFame(a.homeTeam, a.awayTeam) || priority(a) - priority(b) || a.utcDate.localeCompare(b.utcDate))
            .slice(0, 5);
        return [featured, ...others].sort((a, b) => a.utcDate.localeCompare(b.utcDate));
    }, [notStarted, featured]);
    const featuredIds = useMemo(() => new Set(featuredList.map(m => m.id)), [featuredList]);
    // next kick-offs: the biggest games of the next 48 hours (then the next ones by time), in kick-off order
    const soonest = useMemo(() => {
        const rest = notStarted.filter(m => m.id !== featured?.id && !featuredIds.has(m.id));
        const near = rest.filter(m => new Date(m.utcDate).getTime() < Date.now() + 48 * 3600 * 1000)
            .sort((a, b) => priority(a) - priority(b) || a.utcDate.localeCompare(b.utcDate)).slice(0, 5);
        const fill = rest.filter(m => !near.includes(m)).sort((a, b) => a.utcDate.localeCompare(b.utcDate)).slice(0, 5 - near.length);
        return [...near, ...fill].sort((a, b) => a.utcDate.localeCompare(b.utcDate));
    }, [notStarted, featured, featuredIds]);
    const { reasons: favReasons } = useFavorites();
    // favorites first: their next games get their own row on top
    const favNext = useMemo(() => notStarted.filter(m => favReasons(m).length > 0).sort((a, b) => a.utcDate.localeCompare(b.utcDate)).slice(0, 10), [notStarted, favReasons]);
    const next = useMemo(() => {
        const ranked = [...notStarted].filter(m => !favNext.includes(m)).sort((a, b) => ((a.competition.rank ?? 9) <= 1 ? 0 : 1) - ((b.competition.rank ?? 9) <= 1 ? 0 : 1) || a.utcDate.localeCompare(b.utcDate));
        return ranked.filter(m => m.id !== featured?.id && !featuredIds.has(m.id)).slice(0, 10).sort((a, b) => a.utcDate.localeCompare(b.utcDate));
    }, [notStarted, featured, featuredIds]);
    const nextCard = (m) => {
        const p = mainPred(m);
        const pct = hasPct(p);
        const strongPick = pct && topPct(p) >= 60;
        const k = p ? (p.pick || (pct ? (p.home >= p.draw && p.home >= p.away ? 'H' : p.away >= p.draw ? 'A' : 'D') : null)) : null;
        return (_jsxs(Link, { to: `/match/${m.id}`, className: "card card-hover snap-start flex-shrink-0 w-[272px] p-4 flex flex-col gap-4", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsxs("span", { className: "flex items-center gap-1.5 min-w-0 text-[11px] text-faint", children: [m.competition.emblem && _jsx("img", { src: m.competition.emblem, alt: "", width: 14, height: 14, className: "w-3.5 h-3.5 object-contain" }), _jsx("span", { className: "truncate", children: m.competition.name })] }), _jsx("span", { className: "text-[11px] font-bold text-ink bg-surface2/80 px-2 py-0.5 rounded-full whitespace-nowrap", children: new Date(m.utcDate).toLocaleString(LOCALE, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) })] }), _jsxs("div", { className: "space-y-2.5", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Crest, { team: m.homeTeam, size: 32 }), _jsx("span", { className: "font-bold truncate", children: tn(m.homeTeam) })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Crest, { team: m.awayTeam, size: 32 }), _jsx("span", { className: "font-bold truncate", children: tn(m.awayTeam) })] })] }), pct && isCovered(m.id, m.status, true) ? (_jsx(RevealChip, { onReveal: () => revealMatch(m.id) })) : pct ? (_jsxs("div", { className: "space-y-2", children: [_jsx("div", { className: "grid grid-cols-3 gap-1.5 text-center", children: ['H', 'D', 'A'].map(o => (_jsxs("span", { className: `rounded-xl py-1.5 text-xs font-bold num ${k === o ? (o === 'H' ? 'bg-home/20 text-home' : o === 'D' ? 'bg-draw/20 text-draw' : 'bg-away/20 text-away') : 'bg-surface2/70 text-muted'}`, children: [_jsx("span", { className: "block text-[10px] font-semibold opacity-80", children: o === 'H' ? '1' : o === 'D' ? 'X' : '2' }), _jsx(CountUp, { value: o === 'H' ? p.home : o === 'D' ? p.draw : p.away, suffix: "%", animate: justRevealed(m.id), delay: o === 'H' ? 0 : o === 'D' ? 100 : 200 })] }, o))) }), strongPick ? _jsx("span", { className: "inline-block text-[11px] font-extrabold text-bg bg-accent px-2 py-0.5 rounded-full", children: tt("Strong pick") }) : null] })) : p ? (_jsxs("div", { className: "flex items-center justify-between text-xs rounded-xl bg-surface2/70 px-3 py-2", children: [_jsxs("span", { className: "text-muted inline-flex items-center gap-1.5", children: [_jsx(Lock, {}), " ", tt("Prediction locked")] }), _jsx("span", { className: "text-accent font-semibold", children: tt("Unlock") })] })) : (_jsx("div", { className: "text-xs text-faint", children: tt("No prediction yet") }))] }, m.id));
    };
    const liveMain = live[0];
    const fp = featured ? mainPred(featured) : null;
    return (_jsxs("div", { className: "max-w-7xl 2xl:max-w-[1760px] mx-auto px-4 sm:px-6 py-6 sm:py-8 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_360px] 2xl:gap-8 2xl:items-start", children: [_jsxs("div", { className: "space-y-10 min-w-0", children: [access === 'anon' && (_jsxs("section", { className: "rounded-3xl border border-accent/30 bg-[linear-gradient(135deg,rgb(var(--accent)/0.10),rgb(var(--surface)/0.6)_60%)] p-5 sm:p-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center", children: [_jsxs("div", { className: "min-w-0 space-y-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("h1", { className: "font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-ink leading-tight", children: tt("Sports predictions, tested in public") }), _jsx("p", { className: "text-sm sm:text-base text-muted max-w-2xl", children: tt("Know what is likely before kick-off, and why.") })] }), _jsx("ul", { className: "grid gap-2.5 sm:grid-cols-3 max-w-3xl", children: [
                                            [tt("Every match"), tt("Football now, basketball next: win chances, goals or points, and the reasons behind each pick.")],
                                            [tt("Checked in public"), tt("Every prediction is saved before kick-off and scored after the game.")],
                                            [tt("Free to start"), tt("2 full picks every week. No card needed.")]
                                        ].map(([h, d]) => (_jsxs("li", { className: "flex gap-2.5 rounded-2xl bg-surface/60 border border-line/60 px-3.5 py-3", children: [_jsx("span", { className: "mt-0.5 w-5 h-5 rounded-full bg-accent text-bg grid place-items-center shrink-0", "aria-hidden": true, children: _jsx("svg", { viewBox: "0 0 24 24", className: "w-3 h-3", fill: "none", stroke: "currentColor", strokeWidth: "3.2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M5 12.5l4.5 4.5L19 7.5" }) }) }), _jsxs("span", { className: "min-w-0", children: [_jsx("span", { className: "block text-sm font-bold text-ink", children: h }), _jsx("span", { className: "block text-xs text-muted leading-snug mt-0.5", children: d })] })] }, h))) }), _jsxs("div", { className: "flex flex-col sm:flex-row gap-2", children: [_jsx(Link, { to: "/signup", className: "h-11 px-6 rounded-2xl bg-accent text-bg font-extrabold grid place-items-center", children: tt("Get 2 free picks a week") }), _jsx(Link, { to: "/accuracy", className: "h-11 px-5 rounded-2xl border border-line text-ink font-semibold grid place-items-center hover:border-faint", children: tt("See our record") })] })] }), summary?.v3?.hitRate != null && (_jsxs("div", { className: "grid grid-cols-2 lg:grid-cols-1 gap-3 lg:w-56", children: [_jsxs("div", { className: "rounded-2xl bg-surface/70 border border-line px-4 py-3", children: [_jsxs("div", { className: "font-display text-3xl font-extrabold text-accent num leading-none", children: [summary.v3.hitRate, "%"] }), _jsx("div", { className: "text-xs text-ink font-semibold mt-1.5", children: tt("of our picks were right") }), _jsx("div", { className: "text-[11px] text-faint", children: tt("last {0} days", { 0: summary.days }) })] }), summary.v3.strong60?.hitRate != null && (_jsxs("div", { className: "rounded-2xl bg-surface/70 border border-line px-4 py-3", children: [_jsxs("div", { className: "font-display text-3xl font-extrabold text-accent num leading-none", children: [summary.v3.strong60.hitRate, "%"] }), _jsx("div", { className: "text-xs text-ink font-semibold mt-1.5", children: tt("when we were 60%+ sure") })] }))] }))] })), _jsxs("div", { className: "grid gap-5 lg:grid-cols-[1.75fr_1fr]", children: [featuredList.length > 1 ? _jsx(FeaturedCarousel, { matches: featuredList }) : _jsx(FeaturedHero, { m: featured, p: fp }), _jsxs("div", { className: "card p-5 sm:p-6 flex flex-col gap-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h2", { className: "font-display text-lg font-bold", children: live.length ? tt("Live now") : tt("Next kick-offs") }), _jsxs("span", { className: `inline-flex items-center gap-2 text-xs font-bold px-3 py-1 rounded-full ${live.length ? 'text-live bg-live/10' : 'text-faint bg-surface2/70'}`, children: [_jsx("span", { className: `w-1.5 h-1.5 rounded-full ${live.length ? 'bg-live animate-pulseDot' : 'bg-faint'}` }), live.length ? tt("{0} live", { 0: live.length }) : tt("No live games")] })] }), liveMain ? (_jsxs(_Fragment, { children: [_jsxs(Link, { to: `/match/${liveMain.id}`, className: "glass p-4 space-y-3 hover:bg-white/10 transition-colors", children: [_jsx("div", { className: "text-xs text-faint text-center truncate", children: liveMain.competition.name }), _jsxs("div", { className: "grid grid-cols-[1fr_auto_1fr] items-center gap-2", children: [_jsxs("div", { className: "flex flex-col items-center gap-2 min-w-0", children: [_jsx(Crest, { team: liveMain.homeTeam, size: 52 }), _jsx("span", { className: "text-sm font-bold truncate max-w-full", children: tn(liveMain.homeTeam) })] }), _jsxs("div", { className: "flex flex-col items-center gap-1.5", children: [_jsxs("span", { className: "font-display font-extrabold text-4xl", children: [liveMain.score?.fullTime?.home ?? 0, " \u2013 ", liveMain.score?.fullTime?.away ?? 0] }), _jsx("span", { className: "text-xs font-extrabold text-bg bg-win px-2.5 py-0.5 rounded-full", children: liveMain.minute ? `${liveMain.minute}'` : tt("Live") })] }), _jsxs("div", { className: "flex flex-col items-center gap-2 min-w-0", children: [_jsx(Crest, { team: liveMain.awayTeam, size: 52 }), _jsx("span", { className: "text-sm font-bold truncate max-w-full", children: tn(liveMain.awayTeam) })] })] }), _jsx("div", { className: "text-center text-xs text-muted", children: tt("Live stats, lineups and events →") })] }), _jsxs("div", { className: "space-y-1", children: [live.slice(1, 6).map(m => (_jsxs(Link, { to: `/match/${m.id}`, className: "flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface2/60 text-sm", children: [_jsx("span", { className: "text-[11px] font-bold text-win w-8", children: m.minute ? `${m.minute}'` : tt("Live") }), _jsxs("span", { className: "truncate flex-1", children: [tn(m.homeTeam), " \u2013 ", tn(m.awayTeam)] }), _jsxs("b", { className: "font-display", children: [m.score?.fullTime?.home ?? 0, "\u2013", m.score?.fullTime?.away ?? 0] })] }, m.id))), live.length > 6 && _jsxs(Link, { to: "/matches", className: "block px-2 pt-1 text-sm font-semibold text-accent", children: [tt("All"), ' ', live.length, " ", tt("live games →")] })] })] })) : soonest.length ? (_jsxs("div", { className: "flex flex-col gap-1.5", children: [soonest.map(m => (_jsxs(Link, { to: `/match/${m.id}`, className: "flex items-center gap-3 p-2.5 rounded-2xl hover:bg-surface2/60 transition-colors", children: [_jsxs("div", { className: "flex -space-x-2 flex-shrink-0", children: [_jsx("span", { className: "rounded-full bg-surface2 p-1 ring-2 ring-surface", children: _jsx(Crest, { team: m.homeTeam, size: 24 }) }), _jsx("span", { className: "rounded-full bg-surface2 p-1 ring-2 ring-surface", children: _jsx(Crest, { team: m.awayTeam, size: 24 }) })] }), _jsxs("span", { className: "min-w-0 flex-1", children: [_jsxs("span", { className: "block text-sm font-bold truncate", children: [tn(m.homeTeam), " \u2013 ", tn(m.awayTeam)] }), _jsx("span", { className: "block text-[11px] text-faint truncate", children: m.competition.name })] }), _jsxs("span", { className: "text-right flex-shrink-0", children: [_jsx("span", { className: "block text-xs font-bold text-ink", children: new Date(m.utcDate).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) }), _jsx("span", { className: "block text-[11px] text-faint", children: new Date(m.utcDate).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }) })] })] }, m.id))), _jsx(Link, { to: "/matches", className: "mt-1 px-2 text-sm font-bold text-accent", children: tt("All matches →") })] })) : (_jsx("div", { className: "flex-1 grid place-items-center text-center text-sm text-muted py-6", children: tt("No games scheduled yet.") }))] })] }), favNext.length > 0 && (_jsx(Section, { title: tt("Your favorites"), action: _jsx(Link, { to: "/favorites", className: "text-sm font-bold text-accent", children: tt("All favorites →") }), children: _jsx("div", { className: "rail flex gap-3.5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x", children: favNext.map(m => nextCard(m)) }) })), next.length > 0 && (_jsx(Section, { title: tt("Next matches"), action: _jsx(Link, { to: "/matches", className: "text-sm font-bold text-accent", children: "All matches \u2192" }), children: _jsx("div", { className: "rail flex gap-3.5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x", children: next.map(m => nextCard(m)) }) })), _jsxs("div", { className: "grid gap-5 lg:grid-cols-3", children: [_jsxs("div", { className: "rounded-3xl p-6 border border-accent/30 bg-[linear-gradient(160deg,rgb(var(--accent)/0.10),rgb(var(--surface)/0.6))] flex flex-col gap-4", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("h2", { className: "font-display text-lg font-bold", children: tt("Our record") }), summary && _jsx("span", { className: "text-xs text-muted", children: tt("last {0} days", { 0: summary.days }) })] }), summary && summary.v3.hitRate !== null ? (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex justify-between font-bold", children: [_jsx("span", { children: tt("All our picks") }), _jsxs("span", { className: "font-display text-accent", children: [summary.v3.hitRate, "%"] })] }), _jsx("div", { className: "h-2.5 rounded-full bg-surface2", children: _jsx("div", { className: "h-full rounded-full bg-accent", style: { width: `${summary.v3.hitRate}%` } }) })] }), summary.v3.strong60?.hitRate != null && (_jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex justify-between font-bold text-muted", children: [_jsx("span", { children: tt("Strong picks (60%+)") }), _jsxs("span", { className: "font-display", children: [summary.v3.strong60.hitRate, "%"] })] }), _jsx("div", { className: "h-2.5 rounded-full bg-surface2", children: _jsx("div", { className: "h-full rounded-full bg-win", style: { width: `${summary.v3.strong60.hitRate}%` } }) })] }))] })) : (_jsx("div", { className: "text-sm text-muted", children: tt("Loading the record…") })), _jsx("p", { className: "text-sm text-muted leading-relaxed", children: tt("Picks right, every game counted. Each prediction is saved before kick-off and never edited.") }), _jsx(Link, { to: "/accuracy", className: "mt-auto text-sm font-bold text-accent", children: tt("See the full record →") })] }), _jsxs("div", { className: "card p-6 flex flex-col gap-4", children: [_jsx("div", { className: "flex items-center justify-between gap-2", children: _jsx("h2", { className: "font-display text-lg font-bold", children: tt("Draw picks") }) }), full ? (alerts.length ? (alerts.slice(0, 3).map(a => (_jsxs(Link, { to: `/match/${a.matchId}`, className: "rounded-2xl p-4 bg-draw/10 border border-draw/25 space-y-2 hover:bg-draw/15 transition-colors", children: [_jsxs("div", { className: "flex justify-between text-[11px] text-faint", children: [_jsx("span", { children: a.league }), _jsx("span", { children: when(a.date) })] }), _jsxs("div", { className: "font-extrabold", children: [a.home, " \u2013 ", a.away] }), _jsxs("div", { className: "text-xs text-muted", children: [tt("Draw chance"), ' ', _jsxs("b", { className: "text-draw", children: [Math.round(a.ourDraw), "%"] })] })] }, a.matchId)))) : (_jsx("p", { className: "text-sm text-muted", children: tt("No draw picks this week yet. They appear when the coming games are scheduled.") }))) : (_jsxs("div", { className: "rounded-2xl p-4 bg-surface2/60 space-y-2", children: [_jsxs("div", { className: "flex items-center gap-2 font-bold", children: [_jsx(Lock, {}), " ", summary?.drawAlerts?.picks ? tt("{n, plural, one {# draw pick} other {# draw picks}} this week", { n: summary.drawAlerts.picks }) : tt("Draw picks")] }), _jsx("p", { className: "text-sm text-muted", children: tt("The 2 games of the week most likely to end in a draw, picked by our model. Part of Pro.") })] })), _jsx(Link, { to: full ? '/draw-alerts' : '/premium', className: "mt-auto text-sm font-bold text-accent", children: full ? tt("All draw picks →") : tt("Unlock draw picks →") })] }), _jsx("div", { className: "card p-3 flex flex-col", children: _jsx(RecentResults, { limit: 50, days: 30, compact: true, large: true, listClass: "max-h-[340px] overflow-y-auto overscroll-contain pr-1" }) })] }), _jsxs("div", { className: `grid gap-5 ${full ? '2xl:hidden' : 'xl:grid-cols-[2.4fr_1fr] 2xl:grid-cols-1'}`, children: [_jsx("div", { className: "2xl:hidden", children: _jsx(Section, { title: tt("Around the world"), children: news.length ? (_jsx("div", { className: "grid gap-4 md:grid-cols-[1.25fr_1fr]", children: (() => {
                                            const lead = news.find(n => n.image) || news[0];
                                            const rest = news.filter(n => n !== lead).slice(0, full ? 6 : 5);
                                            return (_jsxs(_Fragment, { children: [_jsxs("a", { href: lead.link, target: "_blank", rel: "noreferrer", className: "card card-hover overflow-hidden flex flex-col", children: [lead.image && (_jsxs("span", { className: "relative block aspect-[16/9] bg-surface2 overflow-hidden", children: [_jsx("img", { src: lead.image, alt: "", loading: "lazy", className: "absolute inset-0 w-full h-full object-cover", onError: e => { e.currentTarget.parentElement.style.display = 'none'; } }), _jsx("span", { className: "absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" }), _jsx("span", { className: "absolute left-4 bottom-3 text-[11px] font-extrabold uppercase tracking-wide text-[#C8FF3D]", children: lead.source })] })), _jsxs("span", { className: "p-5 flex flex-col gap-2 flex-1", children: [!lead.image && _jsx("span", { className: "text-[11px] font-extrabold uppercase tracking-wide text-accent", children: lead.source }), _jsx("span", { className: "font-display text-lg sm:text-xl font-bold leading-snug text-ink", children: lead.title }), lead.summary && _jsx("span", { className: "text-sm text-muted line-clamp-3", children: lead.summary }), _jsxs("span", { className: "mt-auto pt-2 text-[11px] text-faint", children: [lead.published ? `${ago(lead.published)} · ` : '', tt("opens {0}", { 0: lead.source })] })] })] }), _jsx("div", { className: "card p-2 flex flex-col", children: rest.map(n => (_jsxs("a", { href: n.link, target: "_blank", rel: "noreferrer", className: "flex gap-3 p-2.5 rounded-2xl hover:bg-surface2/60 transition-colors", children: [_jsx("span", { className: "w-24 h-16 sm:w-28 sm:h-[72px] rounded-xl overflow-hidden bg-surface2 flex-shrink-0 grid place-items-center", children: n.image ? (_jsx("img", { src: n.image, alt: "", loading: "lazy", className: "w-full h-full object-cover", onError: e => { e.currentTarget.style.display = 'none'; } })) : (_jsx("span", { className: "text-[10px] font-extrabold uppercase tracking-wide text-faint px-1 text-center", children: n.source })) }), _jsxs("span", { className: "min-w-0 flex flex-col gap-1", children: [_jsx("span", { className: "text-sm font-bold leading-snug text-ink line-clamp-2", children: n.title }), _jsxs("span", { className: "text-[11px] text-faint", children: [srcLine(n), n.published ? ` · ${ago(n.published)}` : ''] })] })] }, n.link))) })] }));
                                        })() })) : (_jsx("div", { className: "card p-6 text-sm text-muted", children: tt("Loading the latest football news…") })) }) }), !full && (_jsxs("div", { className: "rounded-3xl p-7 border border-home/40 bg-[linear-gradient(150deg,#1B2A55_0%,#101624_70%)] text-[#EEF1F6] flex flex-col gap-4 self-start", children: [_jsx("span", { className: "self-start text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#07090D] bg-[#C8FF3D] px-3 py-1 rounded-full", children: tt("Premium") }), _jsx("h2", { className: "font-display text-2xl font-bold leading-tight", children: tt("See the numbers behind every pick") }), _jsx("p", { className: "text-sm text-[#C9D0DB] leading-relaxed", children: tt("Full percentages, the v3 breakdown, draw picks, strong picks, team analysis and the complete track record.") }), _jsx(Link, { to: "/premium", className: "h-12 rounded-2xl bg-[#C8FF3D] text-[#07090D] font-extrabold grid place-items-center", children: tt("Go Premium") })] }))] })] }), _jsx("aside", { className: "hidden 2xl:block sticky top-20", children: _jsx(NewsRail, { news: news }) })] }));
}
function NewsRail({ news }) {
    const lead = news.find(n => n.image) || news[0];
    const rest = lead ? news.filter(n => n !== lead).slice(0, 8) : [];
    return (_jsxs("section", { className: "card p-3 max-h-[calc(100vh-6.5rem)] overflow-y-auto flex flex-col gap-2", children: [_jsx("h2", { className: "font-display text-lg font-bold px-2 pt-1", children: tt("Around the world") }), !lead ? (_jsx("p", { className: "px-2 pb-2 text-sm text-muted", children: tt("Loading the latest football news…") })) : (_jsxs(_Fragment, { children: [_jsxs("a", { href: lead.link, target: "_blank", rel: "noreferrer", className: "rounded-2xl overflow-hidden bg-surface2/40 hover:bg-surface2/70 transition-colors flex flex-col", children: [lead.image && (_jsxs("span", { className: "relative block aspect-[16/9] bg-surface2 overflow-hidden", children: [_jsx("img", { src: lead.image, alt: "", loading: "lazy", className: "absolute inset-0 w-full h-full object-cover", onError: e => { e.currentTarget.parentElement.style.display = 'none'; } }), _jsx("span", { className: "absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" }), _jsx("span", { className: "absolute left-3 bottom-2 text-[10px] font-extrabold uppercase tracking-wide text-[#C8FF3D]", children: lead.source })] })), _jsxs("span", { className: "p-3 flex flex-col gap-1.5", children: [!lead.image && _jsx("span", { className: "text-[10px] font-extrabold uppercase tracking-wide text-accent", children: lead.source }), _jsx("span", { className: "font-display font-bold leading-snug text-ink", children: lead.title }), lead.summary && _jsx("span", { className: "text-xs text-muted line-clamp-2", children: lead.summary }), _jsx("span", { className: "text-[11px] text-faint", children: lead.published ? ago(lead.published) : lead.source })] })] }), rest.map(n => (_jsxs("a", { href: n.link, target: "_blank", rel: "noreferrer", className: "flex gap-3 p-2 rounded-2xl hover:bg-surface2/60 transition-colors", children: [_jsx("span", { className: "w-20 h-14 rounded-xl overflow-hidden bg-surface2 flex-shrink-0 grid place-items-center", children: n.image ? (_jsx("img", { src: n.image, alt: "", loading: "lazy", className: "w-full h-full object-cover", onError: e => { e.currentTarget.style.display = 'none'; } })) : (_jsx("span", { className: "text-[9px] font-extrabold uppercase tracking-wide text-faint px-1 text-center", children: n.source })) }), _jsxs("span", { className: "min-w-0 flex flex-col gap-1", children: [_jsx("span", { className: "text-[13px] font-bold leading-snug text-ink line-clamp-2", children: n.title }), _jsxs("span", { className: "text-[11px] text-faint", children: [srcLine(n), n.published ? ` · ${ago(n.published)}` : ''] })] })] }, n.link)))] }))] }));
}
