import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../lib/socket'
import { useAuth } from '../lib/auth'
import { useFavorites, type Favorite, type FavKind } from '../lib/favorites'
import SearchBox from '../components/SearchBox'
import { MatchRow, SectionTitle, dayKey, dayLabel, LIVE, ENDED, type APIMatch } from './Dashboard'

const TITLES: Record<FavKind, string> = { league: 'Leagues', team: 'Teams', player: 'Players' }

function hrefOf(f: Favorite) {
  if (f.kind === 'league') return `/league/${f.code || f.ref}`
  if (f.kind === 'player') return `/player/${f.ref}`
  const id = f.ids?.[0]
  return id ? `/team/${id}?${new URLSearchParams({ n: f.name }).toString()}` : `/matches`
}

/** The page of your favorite leagues, teams and players, and all their coming games with our predictions. */
export default function Favorites() {
  const { user } = useAuth()
  const { list, remove, reasons, synced } = useFavorites()
  const [matches, setMatches] = useState<APIMatch[] | null>(null)

  useEffect(() => {
    let cancelled = false
    axios
      .get(`${API_URL}/matches/upcoming`, { params: { days: 30 } })
      .then(r => !cancelled && setMatches(r.data.data || []))
      .catch(() => !cancelled && setMatches([]))
    return () => {
      cancelled = true
    }
  }, [user])

  const games = useMemo(
    () => (matches || []).filter(m => !ENDED.has(m.status) && reasons(m).length > 0).sort((a, b) => a.utcDate.localeCompare(b.utcDate)),
    [matches, reasons]
  )
  const live = games.filter(m => LIVE.has(m.status))
  const byDay = useMemo(() => {
    const g = new Map<number, APIMatch[]>()
    for (const m of games) if (!LIVE.has(m.status)) g.set(dayKey(m.utcDate), [...(g.get(dayKey(m.utcDate)) || []), m])
    return [...g.entries()].sort((a, b) => a[0] - b[0])
  }, [games])

  // next game for each favorite (shown on its card)
  const nextOf = (f: Favorite) => games.find(m => reasons(m).includes(f))

  const groups = (['team', 'player', 'league'] as FavKind[]).map(k => [k, list.filter(f => f.kind === k)] as const)

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 lg:py-8 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink flex items-center gap-3">
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-accent" fill="currentColor" aria-hidden>
              <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" />
            </svg>
            Favorites
          </h1>
          <p className="mt-1 text-sm text-muted">
            {user ? (
              synced ? 'Saved to your account, on every device you sign in on.' : 'Saving to your account…'
            ) : (
              <>
                Saved in this browser.{' '}
                <Link to="/login?next=%2Ffavorites" className="font-bold text-accent">Sign in</Link> to keep them on your phone and computer.
              </>
            )}
          </p>
        </div>
        <div className="w-full sm:w-80">
          <SearchBox />
        </div>
      </div>

      {list.length === 0 ? (
        <div className="card p-8 sm:p-10 text-center space-y-3">
          <p className="text-lg font-semibold text-ink">Follow the teams, leagues and players you care about</p>
          <p className="text-sm text-muted max-w-lg mx-auto">
            Search above, open a team, league or player and tap the star. You can also star a league from the list on the Matches page. Their games
            then appear here, are marked with a star everywhere, and come first on the Matches page.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Link to="/matches" className="h-10 px-4 rounded-xl bg-accent text-bg font-bold text-sm grid place-items-center">Browse matches</Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {groups.map(([kind, items]) => (
            <section key={kind} className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display font-bold text-ink">{TITLES[kind]}</h2>
                <span className="num text-xs text-faint">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-faint">
                  {kind === 'league' ? 'Star a league on its page or in the Matches list.' : `Star a ${kind} on its page.`}
                </p>
              ) : (
                <ul className="space-y-1">
                  {items.map(f => {
                    const nx = nextOf(f)
                    return (
                      <li key={f.ref} className="group flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface2/60">
                        {f.img ? (
                          <img src={f.img} alt="" className={`w-8 h-8 flex-shrink-0 ${f.kind === 'player' ? 'rounded-full object-cover' : 'object-contain'}`} />
                        ) : (
                          <span className="w-8 h-8 rounded-full bg-surface2 flex-shrink-0" />
                        )}
                        <Link to={hrefOf(f)} className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-ink truncate">{f.name}</span>
                          <span className="block text-[11px] text-faint truncate">
                            {nx
                              ? `Next: ${nx.homeTeam.shortName || nx.homeTeam.name} – ${nx.awayTeam.shortName || nx.awayTeam.name}, ${new Date(nx.utcDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`
                              : f.kind === 'player' && f.teamName
                                ? f.teamName
                                : matches
                                  ? 'No game in the next 30 days'
                                  : ''}
                          </span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => remove(f.kind, f.ref)}
                          className="w-7 h-7 grid place-items-center rounded-lg text-faint hover:text-loss hover:bg-loss/10 flex-shrink-0"
                          title={`Remove ${f.name}`}
                          aria-label={`Remove ${f.name} from favorites`}
                        >
                          ×
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {list.length > 0 && (
        <div>
          <SectionTitle label="Their next games" sub="next 30 days, with our predictions" />
          {matches === null ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="card h-14 animate-pulse bg-surface2/60" />)}
            </div>
          ) : games.length === 0 ? (
            <div className="card p-8 text-center text-sm text-muted">None of your favorites play in the next 30 days.</div>
          ) : (
            <div className="space-y-6">
              {live.length > 0 && (
                <section>
                  <SectionTitle label="Live now" accent="live" />
                  <div className="card overflow-hidden divide-y divide-line/50">
                    {live.map(m => <MatchRow key={m.id} match={m} showComp />)}
                  </div>
                </section>
              )}
              {byDay.map(([ts, list]) => (
                <section key={ts}>
                  <SectionTitle label={dayLabel(ts)} count={list.length} />
                  <div className="card overflow-hidden divide-y divide-line/50">
                    {list.map(m => (
                      <div key={m.id}>
                        <MatchRow match={m} showComp />
                        <WhyLine favs={reasons(m)} />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Which favorites a game is for: "Arsenal · Saka". */
function WhyLine({ favs }: { favs: Favorite[] }) {
  return <div className="px-3 sm:px-4 -mt-1.5 pb-2 pl-[68px] sm:pl-[72px] text-[11px] text-accent/90 truncate">★ {favs.map(f => f.name).join(' · ')}</div>
}
