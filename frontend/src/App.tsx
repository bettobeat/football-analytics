import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, NavLink, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Home from './pages/Home'
import Team from './pages/Team'
import SearchBox from './components/SearchBox'
import MatchDetail from './pages/MatchDetail'
import AccuracySimple from './pages/AccuracySimple'
import Past from './pages/Past'
import DrawAlerts from './pages/DrawAlerts'
import { Terms, Privacy, NotFound } from './pages/Legal'
import Login from './pages/Login'
import Account from './pages/Account'
import Premium from './pages/Premium'
import Admin from './pages/Admin'
import Verify from './pages/Verify'
import Forgot from './pages/Forgot'
import PremiumGate from './components/PremiumGate'
import { AuthProvider, useAuth } from './lib/auth'
import { socket } from './lib/socket'
import { useTheme } from './lib/theme'

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden className="flex-shrink-0">
      <rect width="36" height="36" rx="10" fill="#C8FF3D" />
      <path d="M11 25V11h7.5a4 4 0 0 1 0 8H11m7.5 0H20a3 3 0 0 1 0 6h-9" fill="none" stroke="#07090D" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 14l3-3m0 0h-3m3 0v3" fill="none" stroke="#07090D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 group min-w-0" aria-label="Bet To Beat home">
      <LogoMark />
      <span className="hidden min-[380px]:inline font-display font-bold text-lg tracking-tight text-ink">
        bet<span className="text-accent">to</span>beat
      </span>
    </Link>
  )
}

function ThemeToggle({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="w-9 h-9 grid place-items-center rounded-xl border border-line/80 bg-surface text-muted hover:text-ink hover:border-faint transition-colors"
      title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      aria-label="Toggle theme"
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

function UserMenu() {
  const { user, access, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="w-9 h-9" />
  if (!user)
    return (
      <Link
        to={['/login', '/signup', '/verify', '/forgot'].includes(loc.pathname) ? '/login' : `/login?next=${encodeURIComponent(loc.pathname)}`}
        className="px-3.5 py-2 rounded-xl bg-accent text-bg text-sm font-semibold whitespace-nowrap">
        Sign in
      </Link>
    )
  const badge = access === 'admin' ? 'Admin' : access === 'premium' ? 'Premium' : 'Free'
  return (
    <Link
      to="/account"
      className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-xl border border-line/80 bg-surface hover:border-faint transition-colors"
      title={user.email}
    >
      <span className="w-7 h-7 rounded-lg bg-accent/15 text-accent grid place-items-center text-xs font-bold uppercase">
        {(user.name || user.email).charAt(0)}
      </span>
      <span className={`text-[11px] font-semibold ${access === 'free' ? 'text-muted' : 'text-accent'}`}>{badge}</span>
    </Link>
  )
}

/** Reminder for signed-in users who haven't confirmed their email yet. */
function VerifyBanner() {
  const { needsVerification } = useAuth()
  const loc = useLocation()
  if (!needsVerification || loc.pathname === '/verify') return null
  return (
    <div className="bg-draw/15 border-b border-draw/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 text-sm text-ink flex flex-wrap items-center justify-between gap-2">
        <span>Confirm your email to finish creating your account.</span>
        <Link to={`/verify?next=${encodeURIComponent(loc.pathname)}`} className="font-semibold text-draw">
          Enter code →
        </Link>
      </div>
    </div>
  )
}

function NavLinks({ cls }: { cls: (a: { isActive: boolean }) => string }) {
  const { access } = useAuth()
  return (
    <>
      <NavLink to="/" end className={cls}>
        Home
      </NavLink>
      <NavLink to="/matches" className={cls}>
        Matches
      </NavLink>
      <NavLink to="/draw-alerts" className={cls}>
        Draw alerts
      </NavLink>
      <NavLink to="/accuracy" className={cls}>
        Accuracy
      </NavLink>
      <NavLink to="/past" className={cls}>
        Past seasons
      </NavLink>
      {access !== 'premium' && access !== 'admin' && (
        <NavLink to="/premium" className={cls}>
          Premium
        </NavLink>
      )}
      {access === 'admin' && (
        <NavLink to="/admin" className={cls}>
          Users
        </NavLink>
      )}
    </>
  )
}

const TAB_ICONS: Record<string, string> = {
  Home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  Matches: 'M4 5h16v14H4zM4 10h16M9 5v14',
  Alerts: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0',
  Accuracy: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  Search: 'M11 18a7 7 0 1 0 0-14a7 7 0 0 0 0 14M20 20l-3.5-3.5'
}

/** Phone: app-style tab bar at the bottom, with a search sheet. */
function BottomTabs() {
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
      <span className="text-[10px] font-bold">{label}</span>
    </NavLink>
  )
  return (
    <>
      {searching && (
        <div className="lg:hidden fixed inset-0 z-50 bg-bg/95 backdrop-blur-md p-4 pt-6">
          <div className="flex items-center gap-2">
            <div className="flex-1"><SearchBox compact onDone={() => setSearching(false)} /></div>
            <button onClick={() => setSearching(false)} className="h-11 px-3 text-sm font-semibold text-muted">Close</button>
          </div>
        </div>
      )}
      <nav aria-label="Tabs" className="lg:hidden fixed left-3 right-3 bottom-3 z-40 grid grid-cols-5 gap-1 p-1.5 rounded-3xl bg-surface/85 backdrop-blur-xl border border-line/80 shadow-lift sm:max-w-lg sm:mx-auto">
        {tab('/', 'Home', true)}
        {tab('/matches', 'Matches')}
        {tab('/draw-alerts', 'Alerts')}
        {tab('/accuracy', 'Accuracy')}
        <button onClick={() => setSearching(true)} className="h-14 flex flex-col items-center justify-center gap-1 rounded-2xl text-muted" aria-label="Search">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={TAB_ICONS.Search} />
          </svg>
          <span className="text-[10px] font-bold">Search</span>
        </button>
      </nav>
    </>
  )
}

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Home'],
  [/^\/matches/, 'Matches'],
  [/^\/team\//, 'Team'],
  [/^\/match\//, 'Match'],
  [/^\/accuracy/, 'Accuracy'],
  [/^\/draw-alerts/, 'Draw alerts'],
  [/^\/past/, 'Past seasons'],
  [/^\/premium/, 'Premium'],
  [/^\/login/, 'Sign in'],
  [/^\/signup/, 'Create account'],
  [/^\/account/, 'Account'],
  [/^\/terms/, 'Terms of use'],
  [/^\/privacy/, 'Privacy policy'],
  [/^\/admin/, 'Users']
]
/** Browser tab title per page (the match page sets its own once the teams are loaded). */
function PageTitle() {
  const loc = useLocation()
  useEffect(() => {
    const t = TITLES.find(([re]) => re.test(loc.pathname))?.[1]
    document.title = t && t !== 'Home' ? `${t} · Bet To Beat` : 'Bet To Beat · Football predictions tested against the bookmakers'
  }, [loc.pathname])
  return null
}

function App() {
  return (
    <AuthProvider>
      <Shell />
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
    `px-3.5 py-1.5 rounded-full text-sm transition-colors whitespace-nowrap ${
      isActive ? 'bg-ink text-bg font-bold' : 'text-muted font-medium hover:text-ink'
    }`

  return (
    <Router>
      <div className="min-h-screen">
        <div className="stage" aria-hidden />
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-bg/70 border-b border-line/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-[72px] flex items-center gap-3 lg:gap-5">
            <Logo />
            <nav className="hidden lg:flex items-center gap-0.5 p-1 rounded-full bg-surface2/60 border border-line/60">
              <NavLinks cls={navCls} />
            </nav>
            <div className="hidden lg:block flex-1 min-w-[180px] max-w-md ml-auto">
              <SearchBox />
            </div>
            <div className="flex items-center gap-2.5 ml-auto lg:ml-0">
              <div
                className={`hidden md:inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
                  connected ? 'text-live bg-live/10' : 'text-faint bg-surface2'
                }`}
                title={connected ? 'Live updates connected' : 'Reconnecting…'}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-live animate-pulseDot' : 'bg-faint'}`} />
                {connected ? 'Live' : 'Offline'}
              </div>
              <ThemeToggle theme={theme} onToggle={toggle} />
              <UserMenu />
            </div>
          </div>
        </header>

        <PageTitle />
        <VerifyBanner />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/matches" element={<Dashboard />} />
            <Route path="/team/:id" element={<Team />} />
            <Route path="/match/:id" element={<MatchDetail />} />
            <Route
              path="/accuracy"
              element={
                <PremiumGate title="Accuracy">
                  <AccuracySimple />
                </PremiumGate>
              }
            />
            <Route
              path="/draw-alerts"
              element={
                <PremiumGate title="Draw alerts">
                  <DrawAlerts />
                </PremiumGate>
              }
            />
            <Route
              path="/past"
              element={
                <PremiumGate title="Past seasons">
                  <Past />
                </PremiumGate>
              }
            />
            <Route path="/login" element={<Login mode="login" />} />
            <Route path="/signup" element={<Login mode="signup" />} />
            <Route path="/account" element={<Account />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/forgot" element={<Forgot />} />
            <Route path="/premium" element={<Premium />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>

        <footer className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-28 lg:pb-10 text-xs text-faint space-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to="/terms" className="hover:text-ink">Terms</Link>
            <Link to="/privacy" className="hover:text-ink">Privacy</Link>
            <Link to="/premium" className="hover:text-ink">Premium</Link>
          </div>
          <p>
            Bet To Beat · predictions are probabilities, not promises. Information only, not betting advice. 18+. If gambling stops being fun,
            stop and{' '}
            <a href="https://www.begambleaware.org" target="_blank" rel="noreferrer" className="underline hover:text-ink">get help</a>.
          </p>
          <p>Data: Football-Data.org, API-Football, football-data.co.uk, Transfermarkt (squad values), bookmaker odds via The Odds API.</p>
        </footer>
        <BottomTabs />
      </div>
    </Router>
  )
}

export default App
