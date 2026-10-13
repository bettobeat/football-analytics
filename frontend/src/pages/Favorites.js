import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../lib/socket';
import { useAuth } from '../lib/auth';
import { useFavorites } from '../lib/favorites';
import SearchBox from '../components/SearchBox';
import { MatchRow, SectionTitle, dayKey, dayLabel, LIVE, ENDED } from './Dashboard';
import { t, LOCALE } from '../lib/i18n';
const TITLES = { league: t('Leagues'), team: t('Teams'), player: t('Players'), 'bb-league': t('Leagues'), 'bb-team': t('Teams') };
function hrefOf(f) {
    if (f.kind === 'league')
        return `/league/${f.code || f.ref}`;
    if (f.kind === 'player')
        return `/player/${f.ref}`;
    const id = f.ids?.[0];
    return id ? `/team/${id}?${new URLSearchParams({ n: f.name }).toString()}` : `/matches`;
}
/** The page of your favorite leagues, teams and players, and all their coming games with our predictions. */
export default function Favorites() {
    const { user } = useAuth();
    const { list, remove, reasons, synced } = useFavorites();
    const [matches, setMatches] = useState(null);
    useEffect(() => {
        let cancelled = false;
        axios
            .get(`${API_URL}/matches/upcoming`, { params: { days: 30 } })
            .then(r => !cancelled && setMatches(r.data.data || []))
            .catch(() => !cancelled && setMatches([]));
        return () => {
            cancelled = true;
        };
    }, [user]);
    const games = useMemo(() => (matches || []).filter(m => !ENDED.has(m.status) && reasons(m).length > 0).sort((a, b) => a.utcDate.localeCompare(b.utcDate)), [matches, reasons]);
    const live = games.filter(m => LIVE.has(m.status));
    const byDay = useMemo(() => {
        const g = new Map();
        for (const m of games)
            if (!LIVE.has(m.status))
                g.set(dayKey(m.utcDate), [...(g.get(dayKey(m.utcDate)) || []), m]);
        return [...g.entries()].sort((a, b) => a[0] - b[0]);
    }, [games]);
    // next game for each favorite (shown on its card)
    const nextOf = (f) => games.find(m => reasons(m).includes(f));
    const groups = ['team', 'player', 'league'].map(k => [k, list.filter(f => f.kind === k)]);
    return (_jsxs("div", { className: "max-w-5xl mx-auto px-4 sm:px-6 py-6 lg:py-8 space-y-8", children: [_jsxs("div", { className: "flex flex-wrap items-end justify-between gap-4", children: [_jsxs("div", { children: [_jsxs("h1", { className: "font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink flex items-center gap-3", children: [_jsx("svg", { viewBox: "0 0 24 24", className: "w-8 h-8 text-accent", fill: "currentColor", "aria-hidden": true, children: _jsx("path", { d: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" }) }), t("Favorites")] }), _jsx("p", { className: "mt-1 text-sm text-muted", children: user ? (synced ? t("Saved to your account, on every device you sign in on.") : t("Saving to your account…")) : (_jsxs(_Fragment, { children: [t("Saved in this browser."), ' ', _jsx(Link, { to: "/login?next=%2Ffavorites", className: "font-bold text-accent", children: t("Sign in") }), " ", t("to keep them on your phone and computer.")] })) })] }), _jsx("div", { className: "w-full sm:w-80", children: _jsx(SearchBox, {}) })] }), list.length === 0 ? (_jsxs("div", { className: "card p-8 sm:p-10 text-center space-y-3", children: [_jsx("p", { className: "text-lg font-semibold text-ink", children: t("Follow the teams, leagues and players you care about") }), _jsx("p", { className: "text-sm text-muted max-w-lg mx-auto", children: t("Search above, open a team, league or player and tap the star. You can also star a league from the list on the Matches page. Their games then appear here, are marked with a star everywhere, and come first on the Matches page.") }), _jsx("div", { className: "flex flex-wrap justify-center gap-2 pt-1", children: _jsx(Link, { to: "/matches", className: "h-10 px-4 rounded-xl bg-accent text-bg font-bold text-sm grid place-items-center", children: t("Browse matches") }) })] })) : (_jsx("div", { className: "grid gap-4 md:grid-cols-3", children: groups.map(([kind, items]) => (_jsxs("section", { className: "card p-4", children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("h2", { className: "font-display font-bold text-ink", children: TITLES[kind] }), _jsx("span", { className: "num text-xs text-faint", children: items.length })] }), items.length === 0 ? (_jsx("p", { className: "text-xs text-faint", children: kind === 'league' ? t("Star a league on its page or in the Matches list.") : t("Star a {0} on its page.", { 0: kind }) })) : (_jsx("ul", { className: "space-y-1", children: items.map(f => {
                                const nx = nextOf(f);
                                return (_jsxs("li", { className: "group flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface2/60", children: [f.img ? (_jsx("img", { src: f.img, alt: "", className: `w-8 h-8 flex-shrink-0 ${f.kind === 'player' ? 'rounded-full object-cover' : 'object-contain'}` })) : (_jsx("span", { className: "w-8 h-8 rounded-full bg-surface2 flex-shrink-0" })), _jsxs(Link, { to: hrefOf(f), className: "min-w-0 flex-1", children: [_jsx("span", { className: "block text-sm font-semibold text-ink truncate", children: f.name }), _jsx("span", { className: "block text-[11px] text-faint truncate", children: nx ? t("Next: {0} – {1}, {2}", { 0: nx.homeTeam.shortName || nx.homeTeam.name, 1: nx.awayTeam.shortName || nx.awayTeam.name, 2: new Date(nx.utcDate).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }) }) : f.kind === 'player' && f.teamName ? f.teamName : matches ? t("No game in the next 30 days") : '' })] }), _jsx("button", { type: "button", onClick: () => remove(f.kind, f.ref), className: "w-7 h-7 grid place-items-center rounded-lg text-faint hover:text-loss hover:bg-loss/10 flex-shrink-0", title: t("Remove {0}", { 0: f.name }), "aria-label": t("Remove {0} from favorites", { 0: f.name }), children: "\u00D7" })] }, f.ref));
                            }) }))] }, kind))) })), list.length > 0 && (_jsxs("div", { children: [_jsx(SectionTitle, { label: t("Their next games"), sub: t("next 30 days, with our predictions") }), matches === null ? (_jsx("div", { className: "space-y-2", children: Array.from({ length: 4 }).map((_, i) => _jsx("div", { className: "card h-14 animate-pulse bg-surface2/60" }, i)) })) : games.length === 0 ? (_jsx("div", { className: "card p-8 text-center text-sm text-muted", children: t("None of your favorites play in the next 30 days.") })) : (_jsxs("div", { className: "space-y-6", children: [live.length > 0 && (_jsxs("section", { children: [_jsx(SectionTitle, { label: t("Live now"), accent: "live" }), _jsx("div", { className: "card overflow-hidden divide-y divide-line/50", children: live.map(m => _jsx(MatchRow, { match: m, showComp: true }, m.id)) })] })), byDay.map(([ts, list]) => (_jsxs("section", { children: [_jsx(SectionTitle, { label: dayLabel(ts), count: list.length }), _jsx("div", { className: "card overflow-hidden divide-y divide-line/50", children: list.map(m => (_jsxs("div", { children: [_jsx(MatchRow, { match: m, showComp: true }), _jsx(WhyLine, { favs: reasons(m) })] }, m.id))) })] }, ts)))] }))] }))] }));
}
/** Which favorites a game is for: "Arsenal · Saka". */
function WhyLine({ favs }) {
    return _jsxs("div", { className: "px-3 sm:px-4 -mt-1.5 pb-2 pl-[68px] sm:pl-[72px] text-[11px] text-accent/90 truncate", children: ["\u2605 ", favs.map(f => f.name).join(' · ')] });
}
