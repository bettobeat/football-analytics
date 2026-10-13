import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { sportOfPath } from '../lib/sports';
import axios from 'axios';
import { API_URL } from '../lib/socket';
import { t as tt, LOCALE } from '../lib/i18n';
/** Search leagues, teams (every club and national team we track), players and upcoming / live matches. "/" focuses it. */
export default function SearchBox({ compact = false, onDone }) {
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const [teams, setTeams] = useState([]);
    const [matches, setMatches] = useState([]);
    const [comps, setComps] = useState([]);
    const [players, setPlayers] = useState([]);
    const [bb, setBb] = useState(null);
    const onBasketball = sportOfPath(useLocation().pathname).id === 'basketball';
    const [loading, setLoading] = useState(false);
    const input = useRef(null);
    const box = useRef(null);
    const nav = useNavigate();
    useEffect(() => {
        const onKey = (e) => {
            const t = e.target;
            if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(t.tagName)) {
                e.preventDefault();
                input.current?.focus();
            }
        };
        const onClick = (e) => { if (box.current && !box.current.contains(e.target))
            setOpen(false); };
        window.addEventListener('keydown', onKey);
        window.addEventListener('mousedown', onClick);
        return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick); };
    }, []);
    useEffect(() => {
        const term = q.trim();
        if (term.length < 2) {
            setTeams([]);
            setMatches([]);
            setComps([]);
            setPlayers([]);
            setBb(null);
            return;
        }
        setLoading(true);
        const t = setTimeout(() => {
            axios.get(`${API_URL}/search`, { params: { q: term } })
                .then(r => { setTeams(r.data.data.teams || []); setMatches(r.data.data.matches || []); setComps(r.data.data.competitions || []); setPlayers(r.data.data.players || []); setBb(r.data.data.basketball || null); })
                .catch(() => { setTeams([]); setMatches([]); setComps([]); setPlayers([]); setBb(null); })
                .finally(() => setLoading(false));
        }, 250);
        return () => clearTimeout(t);
    }, [q]);
    const done = () => { setOpen(false); setQ(''); onDone?.(); };
    const show = open && q.trim().length >= 2;
    const bbAny = !!bb && (bb.teams.length + bb.players.length + bb.leagues.length + bb.games.length) > 0;
    const any = teams.length + matches.length + comps.length + players.length > 0 || bbAny;
    // basketball results: their own block, first on the basketball pages, after football elsewhere
    const bbBlock = bbAny && bb ? (_jsxs("div", { className: "py-1", children: [_jsxs("div", { className: "flex items-center gap-2 px-3 pt-1 pb-1", children: [_jsx("span", { className: "text-[11px] font-extrabold uppercase tracking-wider text-accent", children: tt("Basketball") }), _jsx("span", { className: "h-px flex-1 bg-line/60" })] }), bb.leagues.map(l => (_jsxs(Link, { to: `/basketball/league/${l.code}`, onClick: done, className: "flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface2", children: [l.logo ? _jsx("img", { src: l.logo, alt: "", width: 24, height: 24, className: "w-6 h-6 object-contain" }) : _jsx("span", { className: "w-6 h-6 rounded-full bg-surface2" }), _jsx("span", { className: "text-sm font-semibold text-ink", children: l.name }), _jsx("span", { className: "ml-auto text-[11px] text-faint", children: l.country })] }, `bl${l.code}`))), bb.teams.length > 0 && _jsx("div", { className: "label px-3 pt-2 pb-1", children: tt("Teams") }), bb.teams.map(x => (_jsxs(Link, { to: `/basketball/team/${x.id}`, onClick: done, className: "flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface2", children: [x.logo ? _jsx("img", { src: x.logo, alt: "", width: 24, height: 24, className: "w-6 h-6 object-contain" }) : _jsx("span", { className: "w-6 h-6 rounded-full bg-surface2" }), _jsx("span", { className: "text-sm font-semibold text-ink", children: x.name }), _jsx("span", { className: "ml-auto text-[11px] text-faint", children: x.league })] }, `bt${x.id}`))), bb.players.length > 0 && _jsx("div", { className: "label px-3 pt-2 pb-1", children: tt("Players") }), bb.players.map(p => (_jsxs(Link, { to: `/basketball/player/${p.id}`, onClick: done, className: "flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface2", children: [_jsx("span", { className: "w-6 h-6 rounded-full bg-surface2 grid place-items-center text-[10px] font-bold text-muted flex-shrink-0", children: p.name.split(' ').map(w => w[0]).slice(0, 2).join('') }), _jsx("span", { className: "text-sm font-semibold text-ink truncate", children: p.name }), _jsxs("span", { className: "ml-auto flex items-center gap-1.5 text-[11px] text-faint min-w-0", children: [p.teamLogo && _jsx("img", { src: p.teamLogo, alt: "", width: 14, height: 14, className: "w-3.5 h-3.5 object-contain flex-shrink-0" }), _jsx("span", { className: "truncate", children: [p.team, p.position].filter(Boolean).join(' · ') })] })] }, `bp${p.id}`))), bb.games.length > 0 && _jsx("div", { className: "label px-3 pt-2 pb-1", children: tt("Games") }), bb.games.map(g => (_jsxs(Link, { to: `/basketball/game/${g.id}`, onClick: done, className: "flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface2", children: [_jsxs("span", { className: "text-sm text-ink font-medium truncate", children: [g.home, " \u2013 ", g.away] }), _jsx("span", { className: "ml-auto text-[11px] text-faint whitespace-nowrap", children: ['Q1', 'Q2', 'Q3', 'Q4', 'OT', 'BT', 'HT'].includes(g.status || '') ? tt("Live") : new Date(g.kickoff).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }) })] }, `bg${g.id}`)))] })) : null;
    return (_jsxs("div", { ref: box, className: `relative ${compact ? 'w-full' : 'w-full max-w-md'}`, children: [_jsxs("label", { className: "flex items-center gap-2.5 h-11 px-4 rounded-2xl bg-surface2/70 border border-line/80 focus-within:border-accent/60 transition-colors", children: [_jsxs("svg", { width: "17", height: "17", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", className: "text-muted flex-shrink-0", "aria-hidden": true, children: [_jsx("circle", { cx: "11", cy: "11", r: "7" }), _jsx("path", { d: "M20 20l-3.5-3.5" })] }), _jsx("span", { className: "sr-only", children: tt("Search") }), _jsx("input", { ref: input, type: "search", value: q, onChange: e => { setQ(e.target.value); setOpen(true); }, onFocus: () => setOpen(true), onKeyDown: e => {
                            if (e.key === 'Escape')
                                setOpen(false);
                            if (e.key === 'Enter') {
                                const bbFirst = onBasketball || (!teams.length && !players.length && !comps.length);
                                if (bbFirst && bb?.leagues[0] && !bb.teams[0]) {
                                    nav(`/basketball/league/${bb.leagues[0].code}`);
                                    done();
                                    return;
                                }
                                if (bbFirst && bb?.teams[0]) {
                                    nav(`/basketball/team/${bb.teams[0].id}`);
                                    done();
                                    return;
                                }
                                if (bbFirst && bb?.players[0]) {
                                    nav(`/basketball/player/${bb.players[0].id}`);
                                    done();
                                    return;
                                }
                                if (comps[0] && !teams[0]) {
                                    nav(`/league/${comps[0].code}`);
                                    done();
                                }
                                else if (teams[0]) {
                                    nav(`/team/${teams[0].id}`);
                                    done();
                                }
                                else if (players[0]) {
                                    nav(`/player/${players[0].id}`);
                                    done();
                                }
                            }
                        }, placeholder: tt("Search leagues, teams, players"), className: "flex-1 min-w-0 bg-transparent outline-none text-sm text-ink placeholder:text-faint" }), !compact && _jsx("kbd", { className: "hidden md:inline text-[11px] text-faint border border-line rounded-md px-1.5 py-0.5", children: "/" })] }), show && (_jsxs("div", { className: "absolute left-0 right-0 mt-2 z-[60] menu-panel p-2 max-h-[70vh] overflow-y-auto", children: [loading && !any && _jsx("div", { className: "px-3 py-3 text-sm text-faint", children: tt("Searching…") }), !loading && !any && _jsxs("div", { className: "px-3 py-3 text-sm text-faint", children: [tt("Nothing found for \""), q.trim(), "\"."] }), onBasketball && bbBlock, onBasketball && bbAny && (teams.length + matches.length + comps.length + players.length > 0) && (_jsxs("div", { className: "flex items-center gap-2 px-3 pt-3 pb-1", children: [_jsx("span", { className: "text-[11px] font-extrabold uppercase tracking-wider text-accent", children: tt("Football") }), _jsx("span", { className: "h-px flex-1 bg-line/60" })] })), comps.length > 0 && (_jsxs("div", { className: "py-1", children: [_jsx("div", { className: "label px-3 pb-1", children: tt("Leagues and competitions") }), comps.map(c => (_jsxs(Link, { to: `/league/${c.code}`, onClick: done, className: "flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface2", children: [c.emblem ? _jsx("img", { src: c.emblem, alt: "", width: 24, height: 24, className: "w-6 h-6 object-contain" }) : _jsx("span", { className: "w-6 h-6 rounded-full bg-surface2" }), _jsx("span", { className: "text-sm font-semibold text-ink", children: c.name }), c.country && _jsx("span", { className: "ml-auto text-[11px] text-faint", children: c.country })] }, c.code)))] })), teams.length > 0 && (_jsxs("div", { className: `py-1 ${comps.length ? 'border-t border-line/60 mt-1' : ''}`, children: [_jsx("div", { className: "label px-3 pb-1", children: tt("Teams") }), teams.map(t => (_jsxs(Link, { to: `/team/${t.id}`, onClick: done, className: "flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface2", children: [_jsx("img", { src: t.logo, alt: "", width: 24, height: 24, className: "w-6 h-6 object-contain" }), _jsx("span", { className: "text-sm font-semibold text-ink", children: t.name }), t.national && _jsx("span", { className: "ml-auto text-[11px] text-faint", children: tt("National team") })] }, t.id)))] })), players.length > 0 && (_jsxs("div", { className: `py-1 ${comps.length || teams.length ? 'border-t border-line/60 mt-1' : ''}`, children: [_jsx("div", { className: "label px-3 pb-1", children: tt("Players") }), players.map(p => (_jsxs(Link, { to: `/player/${p.id}`, onClick: done, className: "flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface2", children: [_jsx("span", { className: "photo-duo w-6 h-6 rounded-full overflow-hidden flex-shrink-0", children: _jsx("img", { src: `https://media.api-sports.io/football/players/${p.id}.png`, alt: "", width: 24, height: 24, loading: "lazy", className: "w-full h-full object-cover", onError: e => { e.currentTarget.style.visibility = 'hidden'; } }) }), _jsx("span", { className: "text-sm font-semibold text-ink truncate", children: p.name }), _jsxs("span", { className: "ml-auto flex items-center gap-1.5 text-[11px] text-faint min-w-0", children: [p.team && _jsx("img", { src: p.teamLogo, alt: "", width: 14, height: 14, className: "w-3.5 h-3.5 object-contain flex-shrink-0" }), _jsx("span", { className: "truncate", children: [p.team || p.country, p.position].filter(Boolean).join(' · ') })] })] }, p.id)))] })), matches.length > 0 && (_jsxs("div", { className: "py-1 border-t border-line/60 mt-1", children: [_jsx("div", { className: "label px-3 pt-2 pb-1", children: tt("Matches") }), matches.map(m => (_jsxs(Link, { to: `/match/${m.id}`, onClick: done, className: "flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface2", children: [_jsxs("span", { className: "text-sm text-ink font-medium truncate", children: [m.home, " \u2013 ", m.away] }), _jsx("span", { className: "ml-auto text-[11px] text-faint whitespace-nowrap", children: ['IN_PLAY', 'PAUSED'].includes(m.status) ? tt("Live") : new Date(m.utcDate).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }) })] }, m.id)))] })), !onBasketball && bbBlock && _jsx("div", { className: teams.length + matches.length + comps.length + players.length > 0 ? 'border-t border-line/60 mt-1 pt-1' : '', children: bbBlock })] }))] }));
}
