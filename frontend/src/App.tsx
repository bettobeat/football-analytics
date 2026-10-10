import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, NavLink, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Home from './pages/Home'
import Team from './pages/Team'
import League from './pages/League'
import Player from './pages/Player'
import SearchBox from './components/SearchBox'
import MatchDetail from './pages/MatchDetail'
import AccuracySimple from './pages/AccuracySimple'
import Past from './pages/Past'
import DrawAlerts from './pages/DrawAlerts'
import UpsetWatch from './pages/UpsetWatch'
import { Terms, Privacy, NotFound } from './pages/Legal'
import Login from './pages/Login'
import Account from './pages/Account'
import Premium from './pages/Premium'
import Admin from './pages/Admin'
import Verify from './pages/Verify'
import Forgot from './pages/Forgot'
import PremiumGate from './components/PremiumGate'
import { AuthProvider, useAuth } from './lib/auth'
import { FavoritesProvider } from './lib/favorites'
import Favorites from './pages/Favorites'
import Assistant from './components/Assistant'
import AccessibilityMenu, { initA11y } from './components/Accessibility'
import Accessibility from './pages/Accessibility'
import Contact from './pages/Contact'
import Crm from './pages/Crm'
import SportSoon from './pages/SportSoon'
import SportSwitch from './components/SportSwitch'
import BbHome from './pages/bb/BbHome'
import BbGames from './pages/bb/BbGames'
import BbGame from './pages/bb/BbGame'
import BbLeague from './pages/bb/BbLeague'
import BbTeam from './pages/bb/BbTeam'
import BbPlayer from './pages/bb/BbPlayer'
import BbAccuracy from './pages/bb/BbAccuracy'
import BbPast from './pages/bb/BbPast'
import BbFavorites from './pages/bb/BbFavorites'
import { useBbConfig } from './lib/bb'
import { sportOfPath } from './lib/sports'
import { socket } from './lib/socket'
import { useTheme } from './lib/theme'
import { useUnlocks, resetDay } from './lib/unlocks'
import { t as tt, basename, applyHeadLang, LANGS, lang, setLang, type Lang } from './lib/i18n'

export function LogoMark({ size = 36 }: { size?: number }) {
  return <img src="/logo-mark.png" width={size} height={size} alt="" aria-hidden className="flex-shrink-0 rounded-[10px]" />
}

/** Pages only the admin sees; everyone else gets "not found". */
function AdminOnly({ children }: { children: ReactNode }) {
  const { access, loading, user, logout } = useAuth()
  if (loading) return null
  if (access === 'admin') return <>{children}</>
  // an admin whose session did not pass two-step login: sign in again with the code
  if (user?.isAdmin)
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-3">
        <h1 className="font-display text-2xl font-extrabold text-ink">Two-step login needed</h1>
        <p className="text-sm text-muted">
          {user.twoFactor
            ? 'This device signed in without the two-step code. Sign out and sign in again with your password and the code from your app.'
            : 'Admin access needs two-step login. Set it up on your account page, then come back.'}
        </p>
        {user.twoFactor ? (
          <button type="button" onClick={() => logout()} className="rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm">Sign out</button>
        ) : (
          <Link to="/account" className="inline-block rounded-xl bg-accent text-bg font-semibold px-4 py-2 text-sm">Go to account</Link>
        )}
      </div>
    )
  return <NotFound />
}

/** Model & data pages (past seasons): admin, or staff whose role has the 'Model & data' permission. */
function ModelOnly({ children }: { children: ReactNode }) {
  const { access, loading, can } = useAuth()
  if (loading) return null
  return access === 'admin' || can('model') ? <>{children}</> : <NotFound />
}

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 group shrink-0 whitespace-nowrap" aria-label={tt("SportLikely home")}>
      <LogoMark />
      <span className="hidden min-[380px]:inline-flex lg:hidden 2xl:inline-flex items-center" aria-hidden>
        <img src="/wordmark-dark.png" alt="" className="hidden dark:block h-[22px] w-auto" />
        <img src="/wordmark-light.png" alt="" className="block dark:hidden h-[22px] w-auto" />
      </span>
    </Link>
  )
}

function ThemeToggle({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="w-9 h-9 grid place-items-center rounded-xl border border-line/80 bg-surface text-muted hover:text-ink hover:border-faint transition-colors"
      title={theme === 'dark' ? tt("Switch to light") : tt("Switch to dark")}
      aria-label={tt("Toggle theme")}
    >
      {theme === 'dark' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  )
}

/** Language: a small select in the header; changing it opens the same page under the other prefix. */
function LangSwitch({ compact = false }: { compact?: boolean }) {
  // Header: globe + short code ("EN"), the full names are in the list. Footer: the full name.
  return (
    <label
      className={`relative inline-flex items-center gap-1.5 ${compact ? '' : 'h-9 px-2.5 rounded-xl border border-line/80 bg-surface hover:border-faint'} text-muted cursor-pointer`}
      title={tt('Language')}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
      {compact ? (
        <span className="text-sm font-semibold text-ink">{LANGS[lang].name}</span>
      ) : (
        <span className="text-sm font-bold text-ink uppercase">{lang}</span>
      )}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      <select
        value={lang}
        onChange={e => setLang(e.target.value as Lang)}
        aria-label={tt('Language')}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {(Object.keys(LANGS) as Lang[]).map(l => (
          <option key={l} value={l} className="text-ink bg-surface">{LANGS[l].name}</option>
        ))}
      </select>
    </label>
  )
}

function UserMenu() {
  const { user, access, staff, can, loading, logout } = useAuth()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => setOpen(false), [loc.pathname, loc.search])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  if (loading) return <div className="w-9 h-9" />
  if (!user)
    return (
      <Link
        to={['/login', '/signup', '/verify', '/forgot'].includes(loc.pathname) ? '/login' : `/login?next=${encodeURIComponent(loc.pathname)}`}
        className="px-3.5 py-2 rounded-xl bg-accent text-bg text-sm font-semibold whitespace-nowrap">
        {tt("Sign in")}</Link>
    )
  const badge = access === 'admin' ? 'Founder' : access === 'pro' ? 'Pro' : access === 'premium' ? 'Premium' : 'Free'
  const bbPast = sportOfPath(loc.pathname).id === 'basketball'
  const roleName = access === 'admin' ? 'Founder' : staff ? staff.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''
  const item = 'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-ink hover:bg-surface2'
  const icon = (d: string) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted shrink-0" aria-hidden><path d={d} /></svg>
  )
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl border border-line/80 bg-surface hover:border-faint transition-colors"
        title={user.email}
      >
        <span className="w-7 h-7 rounded-lg bg-accent/15 text-accent grid place-items-center text-xs font-bold uppercase">
          {(user.name || user.email).charAt(0)}
        </span>
        <span className={`text-[11px] font-semibold ${access === 'free' ? 'text-muted' : 'text-accent'}`}>{badge}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-60 z-[60] menu-panel p-1.5">
          <div className="px-3 py-2 border-b border-line/60 mb-1">
            <div className="text-sm font-semibold text-ink truncate">{user.name || user.email.split('@')[0]}</div>
            <div className="text-[11px] text-faint truncate">{user.email}</div>
          </div>
          <Link to="/account" role="menuitem" className={item}>{icon('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z')}{tt("Settings")}</Link>
          {(staff || can('model')) && (
            <>
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-faint">Staff{roleName ? ` · ${roleName}` : ''}</div>
              {staff && <Link to="/crm" role="menuitem" className={item}>{icon('M4 4h16v12H5.2L4 17.2V4zM8 9h8M8 12h5')}CRM</Link>}
              {access === 'admin' && (
                <Link to="/admin" role="menuitem" className={item}>{icon('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8')}Users</Link>
              )}
              {(access === 'admin' || can('model')) && (
                <Link to={bbPast ? '/basketball/past' : '/past'} role="menuitem" className={item}>{icon('M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2')}Past seasons</Link>
              )}
            </>
          )}
          <div className="border-t border-line/60 mt-1 pt-1">
            <button type="button" role="menuitem" onClick={() => { setOpen(false); logout() }} className={`${item} w-full text-left text-muted`}>
              {icon('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9')}{tt("Sign out")}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Reminder for signed-in users who haven't confirmed their email yet. */
/** $15 Premium: a nudge when the monthly unlocks run low (10 or fewer left). */
function UnlocksBanner() {
  const { access } = useAuth()
  const u = useUnlocks(access === 'premium')
  if (access !== 'premium' || !u || u.left === null || u.left > 10) return null
  return (
    <div className="border-b border-accent/30 bg-accent/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-ink">
          {u.left === 0 ? (
            <>{tt("You've used all {0} unlocks this month. They renew on {1}.", { 0: u.allowance, 1: resetDay(u.resetsAt) })}</>
          ) : (
            <><b className="num">{u.left}</b> {tt("{n, plural, one {unlock} other {unlocks}} left this month. You're using SportLikely a lot.", { n: u.left })}</>
          )}
        </span>
        <Link to="/premium" className="px-3 py-1 rounded-lg bg-accent text-bg text-xs font-extrabold">
          {tt("Pro is unlimited →")}</Link>
      </div>
    </div>
  )
}

function VerifyBanner() {
  const { needsVerification } = useAuth()
  const loc = useLocation()
  if (!needsVerification || loc.pathname === '/verify') return null
  return (
    <div className="bg-draw/15 border-b border-draw/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 text-sm text-ink flex flex-wrap items-center justify-between gap-2">
        <span>{tt("Confirm your email to finish creating your account.")}</span>
        <Link to={`/verify?next=${encodeURIComponent(loc.pathname)}`} className="font-semibold text-draw">
          {tt("Enter code →")}</Link>
      </div>
    </div>
  )
}

/** Basketball menu (Oct 2026): Home · Games · Favorites · Accuracy · Past seasons (admin). */
function BbNavLinks({ cls }: { cls: (a: { isActive: boolean }) => string }) {
  const { access } = useAuth()
  return (
    <>
      <NavLink to="/basketball" end className={cls}>{tt("Home")}</NavLink>
      <NavLink to="/basketball/games" className={cls}>{tt("Games")}</NavLink>
      <NavLink to="/basketball/favorites" className={cls}>{tt("Favorites")}</NavLink>
      <NavLink to="/basketball/accuracy" className={cls}>{tt("Accuracy")}</NavLink>
      {access !== 'pro' && access !== 'admin' && <NavLink to="/premium" className={cls}>{access === 'premium' ? tt("Go Pro") : tt("Premium")}</NavLink>}
    </>
  )
}

/** The open sport's basketball section is live for this visitor (admins before launch, everyone after). */
function useBbOpen() {
  const loc = useLocation()
  const cfg = useBbConfig()
  // while the config loads on a basketball page, show the basketball menus (no flash of the football ones)
  return sportOfPath(loc.pathname).id === 'basketball' && (cfg === null ? true : !!cfg.open)
}

/** Footer data line for the sport on screen. */
function DataLine() {
  const bb = sportOfPath(useLocation().pathname).id === 'basketball'
  return <p>{bb ? tt("Data: API-Basketball, balldontlie (NBA players and injuries).") : tt("Data: Football-Data.org, API-Football, football-data.co.uk, Transfermarkt (squad values).")}</p>
}

function NavLinks({ cls }: { cls: (a: { isActive: boolean }) => string }) {
  const { access } = useAuth()
  const bb = useBbOpen()
  if (bb) return <BbNavLinks cls={cls} />
  return (
    <>
      <NavLink to="/" end className={cls}>
        {tt("Home")}</NavLink>
      <NavLink to="/matches" className={cls}>
        {tt("Matches")}</NavLink>
      <NavLink to="/favorites" className={cls}>
        {tt("Favorites")}</NavLink>
      <NavLink to="/draw-alerts" className={cls}>
        {tt("Draw picks")}</NavLink>
      <NavLink to="/upset-watch" className={cls}>
        {tt("Upset watch")}</NavLink>
      <NavLink to="/accuracy" className={cls}>
        {tt("Accuracy")}</NavLink>
      {access !== 'pro' && access !== 'admin' && (
        <NavLink to="/premium" className={cls}>
          {access === 'premium' ? tt("Go Pro") : tt("Premium")}
        </NavLink>
      )}
      {/* Oct 2026: Past seasons, Users and CRM live in the account menu (top right), staff only */}
    </>
  )
}

const TAB_ICONS: Record<string, string> = {
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
}

/** Phone: app-style tab bar at the bottom, with a search sheet. */
function BottomTabs() {
  const bb = useBbOpen()
  const [searching, setSearching] = useState(false)
  const loc = useLocation()
  useEffect(() => setSearching(false), [loc.pathname])
  const tab = (to: string, label: string, end = false) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `h-14 flex flex-col items-center justify-center gap-1 rounded-2xl transition-colors ${isActive ? 'bg-accent text-bg' : 'text-muted'}`
      }
    >
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={TAB_ICONS[label]} />
      </svg>
      <span className="text-[10px] font-bold">{tt(label)}</span>
    </NavLink>
  )
  return (
    <>
      {searching && (
        <div className="xl:hidden fixed inset-0 z-50 bg-bg/95 backdrop-blur-md p-4 pt-6">
          <div className="flex items-center gap-2">
            <div className="flex-1"><SearchBox compact onDone={() => setSearching(false)} /></div>
            <button onClick={() => setSearching(false)} className="h-11 px-3 text-sm font-semibold text-muted">{tt("Close")}</button>
          </div>
        </div>
      )}
      <nav aria-label={tt("Tabs")} className="xl:hidden fixed left-3 right-3 bottom-3 z-40 grid grid-cols-6 gap-1 p-1.5 rounded-3xl bg-surface/85 backdrop-blur-xl border border-line/80 shadow-lift sm:max-w-lg sm:mx-auto">
        {bb ? (
          <>
            {tab('/basketball', 'Home', true)}
            {tab('/basketball/games', 'Games')}
            {tab('/basketball/favorites', 'Favorites')}
            {tab('/basketball/accuracy', 'Accuracy')}
            {tab('/', 'Football', true)}
          </>
        ) : (
          <>
            {tab('/', 'Home', true)}
            {tab('/matches', 'Matches')}
            {tab('/favorites', 'Favorites')}
            {tab('/draw-alerts', 'Draws')}
            {tab('/accuracy', 'Accuracy')}
          </>
        )}
        <button onClick={() => setSearching(true)} className="h-14 flex flex-col items-center justify-center gap-1 rounded-2xl text-muted" aria-label={tt("Search")}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={TAB_ICONS.Search} />
          </svg>
          <span className="text-[10px] font-bold">{tt("Search")}</span>
        </button>
      </nav>
    </>
  )
}

const TITLES: [RegExp, string][] = [
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
]
/** Browser tab title per page (the match page sets its own once the teams are loaded). */
function PageTitle() {
  const loc = useLocation()
  useEffect(() => {
    applyHeadLang(loc.pathname)
    const t = TITLES.find(([re]) => re.test(loc.pathname))?.[1]
    document.title = t && t !== 'Home' ? tt("{0} · SportLikely", { 0: t }) : tt("SportLikely · Sports predictions, tested in public")
  }, [loc.pathname])
  return null
}

initA11y()

function App() {
  return (
    <AuthProvider>
      <FavoritesProvider>
        <Shell />
      </FavoritesProvider>
    </AuthProvider>
  )
}

function Shell() {
  const [connected, setConnected] = useState(socket.connected)
  const { theme, toggle } = useTheme()

  useEffect(() => {
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    if (!socket.connected) socket.connect()
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [])

  const navCls = ({ isActive }: { isActive: boolean }) =>
    `px-2.5 2xl:px-3 py-1.5 rounded-full text-[13px] transition-colors whitespace-nowrap ${isActive ? 'bg-ink text-bg font-bold' : 'text-muted font-medium hover:text-ink'}`

  return (
    <Router basename={basename}>
      <div className="min-h-screen">
        <div className="stage" aria-hidden />
        <a href="#main" className="skip-link">{tt("Skip to content")}</a>
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-bg/70 border-b border-line/50">
          <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 h-16 sm:h-[72px] flex items-center gap-2 sm:gap-3">
            <SportSwitch />
            <Logo />
            <nav className="hidden xl:flex shrink-0 items-center gap-0.5 p-1 rounded-full bg-surface2/60 border border-line/60">
              <NavLinks cls={navCls} />
            </nav>
            <div className="hidden lg:block flex-1 min-w-[160px] max-w-lg ml-auto">
              <SearchBox />
            </div>
            <div className="flex shrink-0 items-center gap-2 ml-auto lg:ml-0">
              <div
                className={`hidden md:inline-flex items-center gap-2 px-2.5 2xl:px-3 py-1.5 h-9 rounded-full text-xs font-bold ${
                  connected ? 'text-live bg-live/10' : 'text-faint bg-surface2'
                }`}
                title={connected ? tt("Live updates connected") : tt("Reconnecting…")}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-live animate-pulseDot' : 'bg-faint'}`} />
                <span className="hidden 2xl:inline">{connected ? tt("Live") : tt("Offline")}</span>
              </div>
              <div className="hidden md:block"><LangSwitch /></div>
              <ThemeToggle theme={theme} onToggle={toggle} />
              <UserMenu />
            </div>
          </div>
        </header>

        <PageTitle />
        <VerifyBanner />
        <UnlocksBanner />
        <main id="main" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/matches" element={<Dashboard />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/team/:id" element={<Team />} />
            <Route path="/league/:code" element={<League />} />
            <Route path="/player/:id" element={<Player />} />
            <Route path="/match/:id" element={<MatchDetail />} />
            <Route
              path="/accuracy"
              element={<AccuracySimple />}
            />
            <Route
              path="/upset-watch"
              element={
                <PremiumGate title="Upset watch" pro>
                  <UpsetWatch />
                </PremiumGate>
              }
            />
            <Route
              path="/draw-alerts"
              element={
                <PremiumGate title="Draw picks" pro>
                  <DrawAlerts />
                </PremiumGate>
              }
            />
            <Route
              path="/past"
              element={<ModelOnly><Past /></ModelOnly>}
            />
            <Route path="/login" element={<Login mode="login" />} />
            <Route path="/signup" element={<Login mode="signup" />} />
            <Route path="/account" element={<Account />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/forgot" element={<Forgot />} />
            <Route path="/premium" element={<Premium />} />
            <Route path="/admin" element={<AdminOnly><Admin /></AdminOnly>} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/accessibility" element={<Accessibility />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/crm" element={<Crm />} />
            <Route path="/basketball/*" element={<BbRoutes />} />
            <Route path="/tennis/*" element={<SportSoon sport="tennis" />} />
            <Route path="/american-football/*" element={<SportSoon sport="american-football" />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>

        <footer className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-28 xl:pb-10 text-xs text-faint space-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to="/terms" className="hover:text-ink">{tt("Terms")}</Link>
            <Link to="/privacy" className="hover:text-ink">{tt("Privacy")}</Link>
            <Link to="/accessibility" className="hover:text-ink">{tt("Accessibility")}</Link>
            <Link to="/premium" className="hover:text-ink">{tt("Premium")}</Link>
            <Link to="/contact" className="hover:text-ink">{tt("Contact us")}</Link>
            <span className="ml-auto"><LangSwitch compact /></span>
          </div>
          <p>
            {tt("SportLikely · predictions are probabilities, not promises. Information only, not betting advice. 18+. If gambling stops being fun, stop and")}{' '}
            <a href="https://www.begambleaware.org" target="_blank" rel="noreferrer" className="underline hover:text-ink">{tt("get help")}</a>.
          </p>
          <DataLine />
        </footer>
        <BottomTabs />
        <Assistant />
        <AccessibilityMenu />
      </div>
    </Router>
  )
}

export default App

/** Basketball section: the full site for admins (before launch) and everyone once BASKETBALL_PUBLIC is on. */
function BbRoutes() {
  const cfg = useBbConfig()
  // keep the page's height while the config loads (no footer jumping up into an empty page)
  if (!cfg) return <div className="min-h-[80vh] grid place-items-center"><span className="w-8 h-8 rounded-full border-2 border-line border-t-accent animate-spin" aria-label={tt('Loading…')} /></div>
  if (!cfg.open) return <SportSoon sport="basketball" />
  return (
    <Routes>
      <Route index element={<BbHome />} />
      <Route path="games" element={<BbGames />} />
      <Route path="game/:id" element={<BbGame />} />
      <Route path="league/:code" element={<BbLeague />} />
      <Route path="team/:id" element={<BbTeam />} />
      <Route path="player/:id" element={<BbPlayer />} />
      <Route path="favorites" element={<BbFavorites />} />
      <Route path="accuracy" element={<BbAccuracy />} />
      <Route path="past" element={<ModelOnly><BbPast /></ModelOnly>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
