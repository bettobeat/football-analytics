import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../../lib/socket';
import { t, LOCALE } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { useFavorites } from '../../lib/favorites';
import { useRevealState } from '../../lib/reveal';
import { useBbConfig, useBbFavorites, bbLeagueFav } from '../../lib/bb';
import { FavStar } from '../../lib/favorites';
import { GamesByDay, Skeleton } from './parts';
/** Your basketball teams and leagues, and all their games in the next 14 days — like football's Favorites page. */
export default function BbFavorites() {
    const { user } = useAuth();
    const { remove, synced } = useFavorites();
    const favs = useBbFavorites();
    const cfg = useBbConfig();
    const [games, setGames] = useState(null);
    useRevealState();
    useEffect(() => {
        document.title = t('{0} · SportLikely', { 0: t('Favorites') });
        let cancelled = false;
        axios.get(`${API_URL}/basketball/games`, { params: { days: 14 } })
            .then(r => !cancelled && setGames(r.data.data || []))
            .catch(() => !cancelled && setGames([]));
        return () => { cancelled = true; };
    }, [user]);
    const mine = useMemo(() => (games || []).filter(g => g.state !== 'done' && favs.reasons(g).length > 0), [games, favs.all.length]);
    const nextOf = (ref, kind) => mine.find(g => favs.reasons(g).some(f => f.kind === kind && f.ref === ref));
    const logos = Object.fromEntries((cfg?.leagues || []).map(l => [l.code, l.logo]));
    const notStarred = (cfg?.leagues || []).filter(l => !favs.leagues.some(f => f.ref === l.code));
    return (_jsxs("div", { className: "max-w-5xl mx-auto px-4 sm:px-6 py-6 lg:py-8 space-y-8 pb-28 xl:pb-10", children: [_jsx("div", { className: "flex flex-wrap items-end justify-between gap-4", children: _jsxs("div", { children: [_jsxs("h1", { className: "font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink flex items-center gap-3", children: [_jsx("svg", { viewBox: "0 0 24 24", className: "w-8 h-8 text-accent", fill: "currentColor", "aria-hidden": true, children: _jsx("path", { d: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" }) }), t('Favorites')] }), _jsx("p", { className: "mt-1 text-sm text-muted", children: user ? (synced ? t('Saved to your account, on every device.') : t('Saving to your account…')) : (_jsxs(_Fragment, { children: [t('Saved in this browser.'), " ", _jsx(Link, { to: "/signup", className: "font-bold text-accent", children: t('Create a free account') }), " ", t('to keep them on every device.')] })) })] }) }), ['bb-team', 'bb-league'].map(kind => {
                const list = kind === 'bb-team' ? favs.teams : favs.leagues;
                return (_jsxs("section", { children: [_jsx("h2", { className: "font-display text-lg font-bold text-ink mb-3", children: kind === 'bb-team' ? t('Teams') : t('Leagues') }), list.length === 0 ? (_jsx("p", { className: "text-sm text-faint", children: kind === 'bb-team' ? t('Star a team on its page or on a game page.') : t('Star a league on its page or in the Games list.') })) : (_jsx("div", { className: "grid gap-3 sm:grid-cols-2", children: list.map(f => {
                                const nx = nextOf(f.ref, kind);
                                return (_jsxs("div", { className: "card p-4 flex items-center gap-3", children: [f.img ? _jsx("img", { src: f.img, alt: "", className: "w-9 h-9 object-contain flex-shrink-0" }) : _jsx("span", { className: "w-9 h-9 rounded-full bg-surface2 flex-shrink-0" }), _jsxs(Link, { to: kind === 'bb-team' ? `/basketball/team/${f.ref}` : `/basketball/league/${f.ref}`, className: "min-w-0 flex-1", children: [_jsx("span", { className: "block font-bold text-ink truncate hover:text-accent", children: f.name }), _jsx("span", { className: "block text-xs text-faint truncate", children: nx ? t('Next: {0} – {1}, {2}', { 0: nx.home.name, 1: nx.away.name, 2: new Date(nx.kickoff).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }) }) : games ? t('No game in the next 14 days') : '' })] }), _jsx("button", { type: "button", onClick: () => remove(f.kind, f.ref), className: "text-xs text-faint hover:text-loss px-2 py-1", "aria-label": t('Remove {0} from favorites', { 0: f.name }), children: t('Remove') })] }, f.ref));
                            }) })), kind === 'bb-league' && notStarred.length > 0 && (_jsx("div", { className: "mt-3 flex flex-wrap gap-2", children: notStarred.map(l => (_jsxs("span", { className: "inline-flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full border border-line/80 text-xs text-muted", children: [l.logo && _jsx("img", { src: l.logo, alt: "", className: "w-4 h-4 object-contain" }), l.name, _jsx(FavStar, { size: "sm", fav: bbLeagueFav(l) })] }, l.code))) }))] }, kind));
            }), _jsxs("section", { children: [_jsx("h2", { className: "font-display text-lg font-bold text-ink mb-3", children: t('Their next games') }), !games ? _jsx(Skeleton, { rows: 4, h: "h-16" }) : favs.all.length === 0 ? (_jsx("p", { className: "text-sm text-faint", children: t('Star a team or a league and its games show up here.') })) : (_jsx(GamesByDay, { games: mine, logos: logos, empty: t('None of your favorites play in this period.') }))] })] }));
}
