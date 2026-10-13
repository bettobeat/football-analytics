import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, NavLink, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import SearchBox from './components/SearchBox';
import PremiumGate from './components/PremiumGate';
import { AuthProvider, useAuth } from './lib/auth';
import { FavoritesProvider } from './lib/favorites';
import Assistant from './components/Assistant';
import AccessibilityMenu, { initA11y } from './components/Accessibility';
import FeedbackButton from './components/FeedbackButton';
import ConsoleGate from './components/ConsoleGate';
import SportSwitch from './components/SportSwitch';
import { useBbConfig } from './lib/bb';
import { sportOfPath } from './lib/sports';
import { socket } from './lib/socket';
import { useTheme } from './lib/theme';
import { useUnlocks, resetDay } from './lib/unlocks';
import { reportError } from './lib/report';
import { t as tt, basename, applyHeadLang, LANGS, lang, setLang } from './lib/i18n';
/**
 * Speed (Oct 2026): every page is its own small file, loaded when it is first opened, so the home page no longer
 * downloads the whole site (admin, CRM, basketball…) before showing anything. The most visited pages are fetched
 * quietly in the background a moment after the first page is up.
 * After a new version is deployed, the old page files no longer exist: a tab that was open from before reloads once
 * and gets the new version (instead of a blank page).
 */
const RELOAD_KEY = 'sl-chunk-reload';
function page(load) {
    return lazy(() => load().then(m => { try {
        sessionStorage.removeItem(RELOAD_KEY);
    }
    catch { /* ignore */ } return m; }, err => {
        let tried = false;
        try {
            tried = sessionStorage.getItem(RELOAD_KEY) === '1';
            sessionStorage.setItem(RELOAD_KEY, '1');
        }
        catch { /* ignore */ }
        if (!tried) {
            window.location.reload();
            return new Promise(() => undefined);
        }
        throw err;
    }));
}
const loadDashboard = () => import('./pages/Dashboard');
const loadMatch = () => import('./pages/MatchDetail');
const loadLeague = () => import('./pages/League');
const Dashboard = page(loadDashboard);
const MatchDetail = page(loadMatch);
const League = page(loadLeague);
const Team = page(() => import('./pages/Team'));
const Player = page(() => import('./pages/Player'));
const AccuracySimple = page(() => import('./pages/AccuracySimple'));
const Past = page(() => import('./pages/Past'));
const DrawAlerts = page(() => import('./pages/DrawAlerts'));
const UpsetWatch = page(() => import('./pages/UpsetWatch'));
const Login = page(() => import('./pages/Login'));
const Account = page(() => import('./pages/Account'));
const Premium = page(() => import('./pages/Premium'));
const Admin = page(() => import('./pages/Admin'));
const Verify = page(() => import('./pages/Verify'));
const Forgot = page(() => import('./pages/Forgot'));
const Favorites = page(() => import('./pages/Favorites'));
const MyPicks = page(() => import('./pages/MyPicks'));
const Accessibility = page(() => import('./pages/Accessibility'));
const Contact = page(() => import('./pages/Contact'));
const Join = page(() => import('./pages/Join'));
const Crm = page(() => import('./pages/Crm'));
const SportSoon = page(() => import('./pages/SportSoon'));
const BbHome = page(() => import('./pages/bb/BbHome'));
const BbGames = page(() => import('./pages/bb/BbGames'));
const BbGame = page(() => import('./pages/bb/BbGame'));
const BbLeague = page(() => import('./pages/bb/BbLeague'));
const BbTeam = page(() => import('./pages/bb/BbTeam'));
const BbPlayer = page(() => import('./pages/bb/BbPlayer'));
const BbAccuracy = page(() => import('./pages/bb/BbAccuracy'));
const BbPast = page(() => import('./pages/bb/BbPast'));
const BbFavorites = page(() => import('./pages/bb/BbFavorites'));
const Terms = page(() => import('./pages/Legal').then(m => ({ default: m.Terms })));
const Privacy = page(() => import('./pages/Legal').then(m => ({ default: m.Privacy })));
const NotFound = page(() => import('./pages/Legal').then(m => ({ default: m.NotFound })));
/**
 * Safety net (Oct 2026): if something on a page breaks, only that page shows a short message (with "try again"),
 * instead of the whole site going blank. Reset when the visitor goes to another page.
 */
class PageBoundary extends Component {
    constructor() {
        super(...arguments);
        Object.defineProperty(this, "state", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: { failed: false }
        });
    }
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(err) { console.error('page error', err); reportError(err, 'page'); }
    render() {
        if (!this.state.failed)
            return this.props.children;
        return (_jsx("div", { className: "min-h-[60vh] grid place-items-center px-4", children: _jsxs("div", { className: "card p-8 text-center space-y-3 max-w-md", children: [_jsx("div", { className: "font-display text-lg font-bold text-ink", children: tt("Something went wrong on this page") }), _jsx("p", { className: "text-sm text-muted", children: tt("The rest of the site works. Try again, or go back to the home page.") }), _jsxs("div", { className: "flex justify-center gap-2 pt-1", children: [_jsx("button", { type: "button", onClick: () => window.location.reload(), className: "px-4 py-2 rounded-xl bg-accent text-bg font-semibold text-sm", children: tt("Try again") }), _jsx("a", { href: basename + '/', className: "px-4 py-2 rounded-xl border border-line text-ink font-semibold text-sm", children: tt("Home") })] })] }) }));
    }
}
function PageGuard({ children }) {
    const loc = useLocation();
    return _jsx(PageBoundary, { children: children }, loc.pathname);
}
function PageLoading() {
    return _jsx("div", { className: "min-h-[70vh] grid place-items-center", children: _jsx("span", { className: "w-8 h-8 rounded-full border-2 border-line border-t-accent animate-spin", "aria-label": tt('Loading…') }) });
}
export function LogoMark({ size = 36 }) {
    return _jsx("img", { src: "/logo-mark.png", width: size, height: size, alt: "", "aria-hidden": true, className: "flex-shrink-0 rounded-[10px]" });
}
/** Pages only the admin sees; everyone else gets "not found". */
function AdminOnly({ children }) {
    const { access, loading, user, logout } = useAuth();
    if (loading)
        return null;
    if (access === 'admin')
        return _jsx(_Fragment, { children: children });
    // an admin whose session did not pass two-step login: sign in again with the code
    if (user?.isAdmin)
        return (_jsxs("div", { className: "max-w-md mx-auto px-4 py-16 text-center space-y-3", children: [_jsx("h1", { className: "font-display text-2xl font-extrabold text-ink", children: "Two-step login needed" }), _jsx("p", { className: "text-sm text-muted", children: user.twoFactor
                        ? 'This device signed in without the two-step code. Sign out and sign in again with your password and the code from your app.'
                        : 'Admin access needs two-step login. Set it up on your account page, then come back.' }), user.twoFactor ? (_jsx("button", { type: "button", onClick: () => logout(), className: "rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm", children: "Sign out" })) : (_jsx(Link, { to: "/account", className: "inline-block rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm", children: "Go to account" }))] }));
    return _jsx(NotFound, {});
}
/** Model & data pages (past seasons): admin, or staff whose role has the 'Model & data' permission. */
function ModelOnly({ children }) {
    const { access, loading, can } = useAuth();
    if (loading)
        return null;
    return access === 'admin' || can('model') ? _jsx(_Fragment, { children: children }) : _jsx(NotFound, {});
}
function Logo() {
    return (_jsxs(Link, { to: "/", className: "flex items-center gap-2.5 group shrink-0 whitespace-nowrap", "aria-label": tt("SportLikely home"), children: [_jsx(LogoMark, {}), _jsxs("span", { className: "hidden min-[380px]:inline-flex lg:hidden 2xl:inline-flex items-center", "aria-hidden": true, children: [_jsx("img", { src: "/wordmark-dark.png", alt: "", className: "hidden dark:block h-[22px] w-auto" }), _jsx("img", { src: "/wordmark-light.png", alt: "", className: "block dark:hidden h-[22px] w-auto" })] })] }));
}
function ThemeToggle({ theme, onToggle }) {
    return (_jsx("button", { onClick: onToggle, className: "w-9 h-9 grid place-items-center rounded-xl border border-line/80 bg-surface text-muted hover:text-ink hover:border-faint transition-colors", title: theme === 'dark' ? tt("Switch to light") : tt("Switch to dark"), "aria-label": tt("Toggle theme"), children: theme === 'dark' ? (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", children: [_jsx("circle", { cx: "12", cy: "12", r: "4" }), _jsx("path", { d: "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" })] })) : (_jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" }) })) }));
}
/** Language: a small select in the header; changing it opens the same page under the other prefix. */
function LangSwitch({ compact = false }) {
    // Header: globe + short code ("EN"), the full names are in the list. Footer: the full name.
    return (_jsxs("label", { className: `relative inline-flex items-center gap-1.5 ${compact ? '' : 'h-9 px-2.5 rounded-xl border border-line/80 bg-surface hover:border-faint'} text-muted cursor-pointer`, title: tt('Language'), children: [_jsxs("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: [_jsx("circle", { cx: "12", cy: "12", r: "9" }), _jsx("path", { d: "M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" })] }), compact ? (_jsx("span", { className: "text-sm font-semibold text-ink", children: LANGS[lang].name })) : (_jsx("span", { className: "text-sm font-bold text-ink uppercase", children: lang })), _jsx("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: _jsx("path", { d: "m6 9 6 6 6-6" }) }), _jsx("select", { value: lang, onChange: e => setLang(e.target.value), "aria-label": tt('Language'), className: "absolute inset-0 w-full h-full opacity-0 cursor-pointer", children: Object.keys(LANGS).map(l => (_jsx("option", { value: l, className: "text-ink bg-surface", children: LANGS[l].name }, l))) })] }));
}
function UserMenu() {
    const { user, access, staff, can, loading, logout } = useAuth();
    const loc = useLocation();
    const [open, setOpen] = useState(false);
    const box = useRef(null);
    useEffect(() => setOpen(false), [loc.pathname, loc.search]);
    useEffect(() => {
        if (!open)
            return;
        const onDown = (e) => { if (box.current && !box.current.contains(e.target))
            setOpen(false); };
        const onKey = (e) => { if (e.key === 'Escape')
            setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);
    if (loading)
        return _jsx("div", { className: "w-9 h-9" });
    if (!user)
        return (_jsx(Link, { to: ['/login', '/signup', '/verify', '/forgot'].includes(loc.pathname) ? '/login' : `/login?next=${encodeURIComponent(loc.pathname)}`, className: "px-3.5 py-2 rounded-xl bg-accent text-bg text-sm font-semibold whitespace-nowrap", children: tt("Sign in") }));
    const badge = access === 'admin' ? 'Founder' : access === 'pro' ? 'Pro' : access === 'premium' ? 'Premium' : 'Free';
    const bbPast = sportOfPath(loc.pathname).id === 'basketball';
    const roleName = access === 'admin' ? 'Founder' : staff ? staff.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
    const item = 'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-ink hover:bg-surface2';
    const icon = (d) => (_jsx("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", className: "text-muted shrink-0", "aria-hidden": true, children: _jsx("path", { d: d }) }));
    return (_jsxs("div", { ref: box, className: "relative", children: [_jsxs("button", { type: "button", onClick: () => setOpen(v => !v), "aria-haspopup": "menu", "aria-expanded": open, className: "flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl border border-line/80 bg-surface hover:border-faint transition-colors", title: user.email, children: [_jsx("span", { className: "w-7 h-7 rounded-lg bg-accent/15 text-accent grid place-items-center text-xs font-bold uppercase", children: (user.name || user.email).charAt(0) }), _jsx("span", { className: `text-[11px] font-semibold ${access === 'free' ? 'text-muted' : 'text-accent'}`, children: badge }), _jsx("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", className: `text-muted transition-transform ${open ? 'rotate-180' : ''}`, "aria-hidden": true, children: _jsx("path", { d: "m6 9 6 6 6-6" }) })] }), open && (_jsxs("div", { role: "menu", className: "absolute right-0 mt-2 w-60 z-[60] menu-panel p-1.5", children: [_jsxs("div", { className: "px-3 py-2 border-b border-line/60 mb-1", children: [_jsx("div", { className: "text-sm font-semibold text-ink truncate", children: user.name || user.email.split('@')[0] }), _jsx("div", { className: "text-[11px] text-faint truncate", children: user.email })] }), _jsxs(Link, { to: "/my-picks", role: "menuitem", className: item, children: [icon('M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9'), tt("My picks")] }), _jsxs(Link, { to: "/account", role: "menuitem", className: item, children: [icon('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'), tt("Settings")] }), (staff || can('model')) && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-faint", children: ["Staff", roleName ? ` · ${roleName}` : ''] }), staff && _jsxs(Link, { to: "/crm", role: "menuitem", className: item, children: [icon('M4 4h16v12H5.2L4 17.2V4zM8 9h8M8 12h5'), "CRM"] }), access === 'admin' && (_jsxs(Link, { to: "/admin", role: "menuitem", className: item, children: [icon('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8'), "Users"] })), (access === 'admin' || can('model')) && (_jsxs(Link, { to: bbPast ? '/basketball/past' : '/past', role: "menuitem", className: item, children: [icon('M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2'), "Past seasons"] }))] })), _jsx("div", { className: "border-t border-line/60 mt-1 pt-1", children: _jsxs("button", { type: "button", role: "menuitem", onClick: () => { setOpen(false); logout(); }, className: `${item} w-full text-left text-muted`, children: [icon('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9'), tt("Sign out")] }) })] }))] }));
}
/** Reminder for signed-in users who haven't confirmed their email yet. */
/** $15 Premium: a nudge when the monthly unlocks run low (10 or fewer left). */
function UnlocksBanner() {
    const { access } = useAuth();
    const u = useUnlocks(access === 'premium');
    if (access !== 'premium' || !u || u.left === null || u.left > 10)
        return null;
    return (_jsx("div", { className: "border-b border-accent/30 bg-accent/10", children: _jsxs("div", { className: "max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-sm", children: [_jsx("span", { className: "text-ink", children: u.left === 0 ? (_jsx(_Fragment, { children: tt("You've used all {0} unlocks this month. They renew on {1}.", { 0: u.allowance, 1: resetDay(u.resetsAt) }) })) : (_jsxs(_Fragment, { children: [_jsx("b", { className: "num", children: u.left }), " ", tt("{n, plural, one {unlock} other {unlocks}} left this month. You're using SportLikely a lot.", { n: u.left })] })) }), _jsx(Link, { to: "/premium", className: "px-3 py-1 rounded-lg bg-accent text-bg text-xs font-extrabold", children: tt("Pro is unlimited →") })] }) }));
}
function VerifyBanner() {
    const { needsVerification } = useAuth();
    const loc = useLocation();
    if (!needsVerification || loc.pathname === '/verify')
        return null;
    return (_jsx("div", { className: "bg-draw/15 border-b border-draw/30", children: _jsxs("div", { className: "max-w-7xl mx-auto px-4 sm:px-6 py-2 text-sm text-ink flex flex-wrap items-center justify-between gap-2", children: [_jsx("span", { children: tt("Confirm your email to finish creating your account.") }), _jsx(Link, { to: `/verify?next=${encodeURIComponent(loc.pathname)}`, className: "font-semibold text-draw", children: tt("Enter code →") })] }) }));
}
/** Basketball menu (Oct 2026): Home · Games · Favorites · Accuracy · Past seasons (admin). */
function BbNavLinks({ cls }) {
    const { access } = useAuth();
    return (_jsxs(_Fragment, { children: [_jsx(NavLink, { to: "/basketball", end: true, className: cls, children: tt("Home") }), _jsx(NavLink, { to: "/basketball/games", className: cls, children: tt("Games") }), _jsx(NavLink, { to: "/basketball/favorites", className: cls, children: tt("Favorites") }), _jsx(NavLink, { to: "/basketball/accuracy", className: cls, children: tt("Accuracy") }), access !== 'pro' && access !== 'admin' && _jsx(NavLink, { to: "/premium", className: cls, children: access === 'premium' ? tt("Go Pro") : tt("Premium") })] }));
}
/** The open sport's basketball section is live for this visitor (admins before launch, everyone after). */
function useBbOpen() {
    const loc = useLocation();
    const cfg = useBbConfig();
    // while the config loads on a basketball page, show the basketball menus (no flash of the football ones)
    return sportOfPath(loc.pathname).id === 'basketball' && (cfg === null ? true : !!cfg.open);
}
/** Footer data line for the sport on screen. */
function DataLine() {
    const bb = sportOfPath(useLocation().pathname).id === 'basketball';
    return _jsx("p", { children: bb ? tt("Data: API-Basketball, balldontlie (NBA players and injuries).") : tt("Data: Football-Data.org, API-Football, football-data.co.uk, Transfermarkt (squad values).") });
}
function NavLinks({ cls }) {
    const { access } = useAuth();
    const bb = useBbOpen();
    if (bb)
        return _jsx(BbNavLinks, { cls: cls });
    return (_jsxs(_Fragment, { children: [_jsx(NavLink, { to: "/", end: true, className: cls, children: tt("Home") }), _jsx(NavLink, { to: "/matches", className: cls, children: tt("Matches") }), _jsx(NavLink, { to: "/favorites", className: cls, children: tt("Favorites") }), _jsx(NavLink, { to: "/draw-alerts", className: cls, children: tt("Draw picks") }), _jsx(NavLink, { to: "/upset-watch", className: cls, children: tt("Upset watch") }), _jsx(NavLink, { to: "/accuracy", className: cls, children: tt("Accuracy") }), access !== 'pro' && access !== 'admin' && (_jsx(NavLink, { to: "/premium", className: cls, children: access === 'premium' ? tt("Go Pro") : tt("Premium") }))] }));
}
const TAB_ICONS = {
    Home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
    Matches: 'M4 5h16v14H4zM4 10h16M9 5v14',
    Alerts: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0',
    Draws: 'M5 12h14M5 7h14M5 17h14',
    Accuracy: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    Favorites: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z',
    Search: 'M11 18a7 7 0 1 0 0-14a7 7 0 0 0 0 14M20 20l-3.5-3.5',
    Games: 'M4 5h16v14H4zM4 10h16M9 5v14',
    Football: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18M12 7l3.5 2.5-1.3 4h-4.4l-1.3-4z',
    Premium: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z'
};
/** Phone: app-style tab bar at the bottom, with a search sheet. */
function BottomTabs() {
    const bb = useBbOpen();
    const [searching, setSearching] = useState(false);
    const loc = useLocation();
    useEffect(() => setSearching(false), [loc.pathname]);
    const tab = (to, label, end = false) => (_jsxs(NavLink, { to: to, end: end, className: ({ isActive }) => `h-14 flex flex-col items-center justify-center gap-1 rounded-2xl transition-colors ${isActive ? 'bg-accent text-bg' : 'text-muted'}`, children: [_jsx("svg", { width: "21", height: "21", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: _jsx("path", { d: TAB_ICONS[label] }) }), _jsx("span", { className: "text-[10px] font-bold", children: tt(label) })] }));
    return (_jsxs(_Fragment, { children: [searching && (_jsx("div", { className: "xl:hidden fixed inset-0 z-50 bg-bg/95 backdrop-blur-md p-4 pt-6", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "flex-1", children: _jsx(SearchBox, { compact: true, onDone: () => setSearching(false) }) }), _jsx("button", { onClick: () => setSearching(false), className: "h-11 px-3 text-sm font-semibold text-muted", children: tt("Close") })] }) })), _jsxs("nav", { "aria-label": tt("Tabs"), className: "xl:hidden fixed left-3 right-3 bottom-3 z-40 grid grid-cols-6 gap-1 p-1.5 rounded-3xl bg-surface/85 backdrop-blur-xl border border-line/80 shadow-lift sm:max-w-lg sm:mx-auto", children: [bb ? (_jsxs(_Fragment, { children: [tab('/basketball', 'Home', true), tab('/basketball/games', 'Games'), tab('/basketball/favorites', 'Favorites'), tab('/basketball/accuracy', 'Accuracy'), tab('/', 'Football', true)] })) : (_jsxs(_Fragment, { children: [tab('/', 'Home', true), tab('/matches', 'Matches'), tab('/favorites', 'Favorites'), tab('/draw-alerts', 'Draws'), tab('/accuracy', 'Accuracy')] })), _jsxs("button", { onClick: () => setSearching(true), className: "h-14 flex flex-col items-center justify-center gap-1 rounded-2xl text-muted", "aria-label": tt("Search"), children: [_jsx("svg", { width: "21", height: "21", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: _jsx("path", { d: TAB_ICONS.Search }) }), _jsx("span", { className: "text-[10px] font-bold", children: tt("Search") })] })] })] }));
}
const TITLES = [
    [/^\/$/, tt('Home')],
    [/^\/matches/, tt('Matches')],
    [/^\/favorites/, tt('Favorites')],
    [/^\/team\//, tt('Team')],
    [/^\/league\//, tt('League')],
    [/^\/player\//, tt('Player')],
    [/^\/match\//, tt('Match')],
    [/^\/accuracy/, tt('Accuracy')],
    [/^\/draw-alerts/, tt('Draw picks')],
    [/^\/upset-watch/, tt('Upset watch')],
    [/^\/past/, tt('Past seasons')],
    [/^\/premium/, tt('Premium')],
    [/^\/login/, tt('Sign in')],
    [/^\/signup/, tt('Create account')],
    [/^\/account/, tt('Account')],
    [/^\/terms/, tt('Terms of use')],
    [/^\/privacy/, tt('Privacy policy')],
    [/^\/accessibility/, tt('Accessibility statement')],
    [/^\/contact/, tt('Contact us')],
    [/^\/admin/, 'Users']
];
/** Browser tab title per page (the match page sets its own once the teams are loaded). */
function PageTitle() {
    const loc = useLocation();
    useEffect(() => {
        applyHeadLang(loc.pathname);
        const t = TITLES.find(([re]) => re.test(loc.pathname))?.[1];
        document.title = t && t !== 'Home' ? tt("{0} · SportLikely", { 0: t }) : tt("SportLikely · Sports predictions, tested in public");
    }, [loc.pathname]);
    return null;
}
initA11y();
function App() {
    return (_jsx(AuthProvider, { children: _jsx(FavoritesProvider, { children: _jsx(Shell, {}) }) }));
}
function Shell() {
    const [connected, setConnected] = useState(socket.connected);
    const { theme, toggle } = useTheme();
    useEffect(() => {
        const onConnect = () => setConnected(true);
        const onDisconnect = () => setConnected(false);
        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        if (!socket.connected)
            socket.connect();
        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
        };
    }, []);
    // fetch the most visited pages in the background once the first page is up (instant when clicked)
    useEffect(() => {
        const t = setTimeout(() => { loadDashboard().catch(() => undefined); loadMatch().catch(() => undefined); loadLeague().catch(() => undefined); }, 3000);
        return () => clearTimeout(t);
    }, []);
    const navCls = ({ isActive }) => `px-2.5 2xl:px-3 py-1.5 rounded-full text-[13px] transition-colors whitespace-nowrap ${isActive ? 'bg-ink text-bg font-bold' : 'text-muted font-medium hover:text-ink'}`;
    return (_jsx(Router, { basename: basename, children: _jsxs("div", { className: "min-h-screen", children: [_jsx("div", { className: "stage", "aria-hidden": true }), _jsx("a", { href: "#main", className: "skip-link", children: tt("Skip to content") }), _jsx("header", { className: "sticky top-0 z-40 backdrop-blur-xl bg-bg/70 border-b border-line/50", children: _jsxs("div", { className: "max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 h-16 sm:h-[72px] flex items-center gap-2 sm:gap-3", children: [_jsx(SportSwitch, {}), _jsx(Logo, {}), _jsx("nav", { className: "hidden xl:flex shrink-0 items-center gap-0.5 p-1 rounded-full bg-surface2/60 border border-line/60", children: _jsx(NavLinks, { cls: navCls }) }), _jsx("div", { className: "hidden lg:block flex-1 min-w-[160px] max-w-lg ml-auto", children: _jsx(SearchBox, {}) }), _jsxs("div", { className: "flex shrink-0 items-center gap-2 ml-auto lg:ml-0", children: [_jsxs("div", { className: `hidden md:inline-flex items-center gap-2 px-2.5 2xl:px-3 py-1.5 h-9 rounded-full text-xs font-bold ${connected ? 'text-live bg-live/10' : 'text-faint bg-surface2'}`, title: connected ? tt("Live updates connected") : tt("Reconnecting…"), children: [_jsx("span", { className: `w-1.5 h-1.5 rounded-full ${connected ? 'bg-live animate-pulseDot' : 'bg-faint'}` }), _jsx("span", { className: "hidden 2xl:inline", children: connected ? tt("Live") : tt("Offline") })] }), _jsx("div", { className: "hidden md:block", children: _jsx(LangSwitch, {}) }), _jsx(ThemeToggle, { theme: theme, onToggle: toggle }), _jsx(UserMenu, {})] })] }) }), _jsx(PageTitle, {}), _jsx(VerifyBanner, {}), _jsx(UnlocksBanner, {}), _jsx("main", { id: "main", tabIndex: -1, children: _jsx(PageGuard, { children: _jsx(Suspense, { fallback: _jsx(PageLoading, {}), children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(Home, {}) }), _jsx(Route, { path: "/matches", element: _jsx(Dashboard, {}) }), _jsx(Route, { path: "/favorites", element: _jsx(Favorites, {}) }), _jsx(Route, { path: "/my-picks", element: _jsx(MyPicks, {}) }), _jsx(Route, { path: "/team/:id", element: _jsx(Team, {}) }), _jsx(Route, { path: "/league/:code", element: _jsx(League, {}) }), _jsx(Route, { path: "/player/:id", element: _jsx(Player, {}) }), _jsx(Route, { path: "/match/:id", element: _jsx(MatchDetail, {}) }), _jsx(Route, { path: "/accuracy", element: _jsx(AccuracySimple, {}) }), _jsx(Route, { path: "/upset-watch", element: _jsx(PremiumGate, { title: "Upset watch", pro: true, children: _jsx(UpsetWatch, {}) }) }), _jsx(Route, { path: "/draw-alerts", element: _jsx(PremiumGate, { title: "Draw picks", pro: true, children: _jsx(DrawAlerts, {}) }) }), _jsx(Route, { path: "/past", element: _jsx(ModelOnly, { children: _jsx(Past, {}) }) }), _jsx(Route, { path: "/login", element: _jsx(Login, { mode: "login" }) }), _jsx(Route, { path: "/signup", element: _jsx(Login, { mode: "signup" }) }), _jsx(Route, { path: "/account", element: _jsx(Account, {}) }), _jsx(Route, { path: "/verify", element: _jsx(Verify, {}) }), _jsx(Route, { path: "/forgot", element: _jsx(Forgot, {}) }), _jsx(Route, { path: "/premium", element: _jsx(Premium, {}) }), _jsx(Route, { path: "/admin", element: _jsx(AdminOnly, { children: _jsx(ConsoleGate, { children: _jsx(Admin, {}) }) }) }), _jsx(Route, { path: "/terms", element: _jsx(Terms, {}) }), _jsx(Route, { path: "/privacy", element: _jsx(Privacy, {}) }), _jsx(Route, { path: "/accessibility", element: _jsx(Accessibility, {}) }), _jsx(Route, { path: "/contact", element: _jsx(Contact, {}) }), _jsx(Route, { path: "/join/:code", element: _jsx(Join, {}) }), _jsx(Route, { path: "/crm", element: _jsx(ConsoleGate, { children: _jsx(Crm, {}) }) }), _jsx(Route, { path: "/basketball/*", element: _jsx(BbRoutes, {}) }), _jsx(Route, { path: "/tennis/*", element: _jsx(SportSoon, { sport: "tennis" }) }), _jsx(Route, { path: "/american-football/*", element: _jsx(SportSoon, { sport: "american-football" }) }), _jsx(Route, { path: "*", element: _jsx(NotFound, {}) })] }) }) }) }), _jsxs("footer", { className: "max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-28 xl:pb-10 text-xs text-faint space-y-2", children: [_jsxs("div", { className: "flex flex-wrap gap-x-4 gap-y-1", children: [_jsx(Link, { to: "/terms", className: "hover:text-ink", children: tt("Terms") }), _jsx(Link, { to: "/privacy", className: "hover:text-ink", children: tt("Privacy") }), _jsx(Link, { to: "/accessibility", className: "hover:text-ink", children: tt("Accessibility") }), _jsx(Link, { to: "/premium", className: "hover:text-ink", children: tt("Premium") }), _jsx(Link, { to: "/contact", className: "hover:text-ink", children: tt("Contact us") }), _jsx("span", { className: "ml-auto", children: _jsx(LangSwitch, { compact: true }) })] }), _jsxs("p", { children: [tt("SportLikely · predictions are probabilities, not promises. Information only, not betting advice. 18+. If gambling stops being fun, stop and"), ' ', _jsx("a", { href: "https://www.begambleaware.org", target: "_blank", rel: "noreferrer", className: "underline hover:text-ink", children: tt("get help") }), "."] }), _jsx(DataLine, {})] }), _jsx(BottomTabs, {}), _jsx(Assistant, {}), _jsx(FeedbackButton, {}), _jsx(AccessibilityMenu, {})] }) }));
}
export default App;
/** Basketball section: the full site for admins (before launch) and everyone once BASKETBALL_PUBLIC is on. */
function BbRoutes() {
    const cfg = useBbConfig();
    // keep the page's height while the config loads (no footer jumping up into an empty page)
    if (!cfg)
        return _jsx("div", { className: "min-h-[80vh] grid place-items-center", children: _jsx("span", { className: "w-8 h-8 rounded-full border-2 border-line border-t-accent animate-spin", "aria-label": tt('Loading…') }) });
    if (!cfg.open)
        return _jsx(SportSoon, { sport: "basketball" });
    return (_jsxs(Routes, { children: [_jsx(Route, { index: true, element: _jsx(BbHome, {}) }), _jsx(Route, { path: "games", element: _jsx(BbGames, {}) }), _jsx(Route, { path: "game/:id", element: _jsx(BbGame, {}) }), _jsx(Route, { path: "league/:code", element: _jsx(BbLeague, {}) }), _jsx(Route, { path: "team/:id", element: _jsx(BbTeam, {}) }), _jsx(Route, { path: "player/:id", element: _jsx(BbPlayer, {}) }), _jsx(Route, { path: "favorites", element: _jsx(BbFavorites, {}) }), _jsx(Route, { path: "accuracy", element: _jsx(BbAccuracy, {}) }), _jsx(Route, { path: "past", element: _jsx(ModelOnly, { children: _jsx(BbPast, {}) }) }), _jsx(Route, { path: "*", element: _jsx(NotFound, {}) })] }));
}
