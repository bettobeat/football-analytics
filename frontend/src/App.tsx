import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, NavLink, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
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

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 group min-w-0">
      <span className="relative grid place-items-center w-9 h-9 rounded-xl bg-accent text-bg font-display font-extrabold text-sm tracking-tight shadow-card">
        B2B
      </span>
      <span className="hidden min-[380px]:inline font-display font-bold text-lg tracking-tight text-ink">
        Bet<span className="text-accent">To</span>Beat
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
        Matches
      </NavLink>
      <NavLink to="/accuracy" className={cls}>
        Accuracy
      </NavLink>
      <NavLink to="/draw-alerts" className={cls}>
        Draw alerts
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

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Matches'],
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
    document.title = t && t !== 'Matches' ? `${t} · Bet To Beat` : 'Bet To Beat · Football predictions tested against the bookmakers'
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
    `px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
      isActive ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink'
    }`

  return (
    <Router>
      <div className="min-h-screen">
        <header className="sticky top-0 z-40 backdrop-blur-md bg-bg/80 border-b border-line/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            <Logo />
            <nav className="hidden sm:flex items-center gap-1">
              <NavLinks cls={navCls} />
            </nav>
            <div className="flex items-center gap-3">
              <div
                className={`hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
                  connected
                    ? 'border-win/30 text-win bg-win/10'
                    : 'border-loss/30 text-loss bg-loss/10'
                }`}
                title={connected ? 'Live updates connected' : 'Reconnecting…'}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-win animate-pulseDot' : 'bg-loss'}`} />
                {connected ? 'Live' : 'Offline'}
              </div>
              <ThemeToggle theme={theme} onToggle={toggle} />
              <UserMenu />
            </div>
          </div>
          {/* mobile nav */}
          <div className="sm:hidden border-t border-line/60">
            <div className="max-w-7xl mx-auto px-4 flex gap-1 py-1.5 overflow-x-auto">
              <NavLinks cls={navCls} />
            </div>
          </div>
        </header>

        <PageTitle />
        <VerifyBanner />
        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
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

        <footer className="max-w-7xl mx-auto px-4 sm:px-6 py-10 text-xs text-faint space-y-2">
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
      </div>
    </Router>
  )
}

export default App
