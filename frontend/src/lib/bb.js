import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from './socket';
import { t, LOCALE } from './i18n';
import { useAuth } from './auth';
import { useFavorites } from './favorites';
let configPromise = null;
let configValue = null;
let configUser = undefined;
/** Who may see the basketball site (admins before launch, everyone after). Loaded once per visit and per sign-in. */
export function useBbConfig() {
    const { user, loading } = useAuth();
    const who = loading ? undefined : user ? String(user.id ?? user.email) : null;
    const [cfg, setCfg] = useState(configUser === who ? configValue : null);
    useEffect(() => {
        if (who === undefined)
            return;
        if (configUser !== who) {
            configUser = who;
            configValue = null;
            configPromise = null;
        }
        if (configValue) {
            setCfg(configValue);
            return;
        }
        configPromise || (configPromise = axios.get(`${API_URL}/basketball/config`, { withCredentials: true })
            .then(r => {
            configValue = r.data.data;
            // leagues added from the admin panel bring their own flag for the countries menu
            for (const l of configValue.leagues || [])
                if (l.flag && !BB_COUNTRY[l.code])
                    BB_COUNTRY[l.code] = l.flag;
            return configValue;
        })
            .catch(() => (configValue = { public: false, open: false, leagues: [] })));
        let alive = true;
        configPromise.then(v => alive && setCfg(v));
        return () => { alive = false; };
    }, [who]);
    return cfg;
}
/** League order on the pages (biggest first) and the country of each league for the flags menu. */
export const BB_ORDER = ['NBA', 'EL', 'ACB', 'BSL', 'EC', 'LBA', 'LNB', 'GBL', 'BBL', 'BCL', 'ABA', 'LKL', 'FEC', 'NBL', 'JBL', 'CBA', 'NBB', 'BSN'];
export const bbRank = (code) => { const i = BB_ORDER.indexOf(code); return i < 0 ? 99 : i; };
export const BB_COUNTRY = {
    NBA: 'us', EL: 'eu', ACB: 'es', LBA: 'it', BSL: 'tr', LNB: 'fr', BBL: 'de', GBL: 'gr', LKL: 'lt',
    EC: 'eu', BCL: 'eu', ABA: 'eu', FEC: 'eu', NBL: 'au', JBL: 'jp', CBA: 'cn', NBB: 'br', BSN: 'pr'
};
export const BB_STATUS = {
    Q1: t('Q1'), Q2: t('Q2'), Q3: t('Q3'), Q4: t('Q4'), OT: t('OT'), BT: t('Break'), HT: t('Half-time'),
    FT: t('Final'), AOT: t('Final (OT)'), POST: t('Postponed'), CANC: t('Cancelled'), SUSP: t('Suspended'), AWD: t('Awarded'), ABD: t('Abandoned')
};
/** "Q4 · 5 min left" (or just "Q4" / "Half-time" when there is no clock). */
export const liveLabel = (g, short = false) => {
    const base = BB_STATUS[g.status] || t('Live');
    if (!g.clock)
        return base;
    return short ? `${base} · ${g.clock.left}'` : `${base} · ${t('{0} min left', { 0: g.clock.left })}`;
};
export const timeOf = (iso) => new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
export const dayOf = (iso) => new Date(iso).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
/** The team we pick, its chance, and colours. */
export function pickOf(g) {
    const p = g.prediction;
    if (!p || !p.pick)
        return null;
    const team = p.pick === 'H' ? g.home : g.away;
    const pct = p.pick === 'H' ? p.pHome : p.pAway;
    return { side: p.pick, team, pct: pct ?? null, color: p.pick === 'H' ? 'text-home' : 'text-away' };
}
/** Spread as people read it: "Lakers −4.5". */
export function spreadText(g) {
    const s = g.prediction?.spread;
    if (s === undefined || s === null)
        return null;
    const fav = s >= 0 ? g.home : g.away;
    return `${fav.name} −${Math.abs(s).toFixed(1)}`;
}
/* ---------- favorites (basketball teams and leagues, in the same account list as football's) ---------- */
export const bbTeamFav = (team, league) => ({ kind: 'bb-team', ref: String(team.id), name: team.name, img: team.logo, code: league || null, ids: [team.id] });
export const bbLeagueFav = (l) => ({ kind: 'bb-league', ref: l.code, name: l.name, img: l.logo, code: l.code });
/** Basketball favorites and why a game is one of them. */
export function useBbFavorites() {
    const { list } = useFavorites();
    const teams = list.filter(f => f.kind === 'bb-team');
    const leagues = list.filter(f => f.kind === 'bb-league');
    const reasons = (g) => [
        ...leagues.filter(f => f.ref === g.league.code),
        ...teams.filter(f => f.ref === String(g.home.id) || f.ref === String(g.away.id))
    ];
    return { teams, leagues, all: [...teams, ...leagues], reasons };
}
