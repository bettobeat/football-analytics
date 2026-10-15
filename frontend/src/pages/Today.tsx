import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../lib/socket'
import { t as tt, LOCALE, lang } from '../lib/i18n'

/*
 * Today's predictions (fix124): today's games grouped by league, one line of facts each (form, last meeting, table or
 * season record), linking to the game pages. Never the pick or a % here — the game page shows the prediction.
 * Football: /predictions/today, basketball: /basketball/predictions/today.
 */

interface Game { id: number; kickoff: string; home: string; away: string; score: [number, number] | null; line: string }
interface Group { league: string; code: string | null; games: Game[] }

const localDay = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Today({ sport }: { sport: 'football' | 'basketball' }) {
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [failed, setFailed] = useState(false)
  const bb = sport === 'basketball'

  useEffect(() => {
    document.title = tt('{0} · SportLikely', { 0: bb ? tt("Basketball predictions today") : tt("Football predictions today") })
    setGroups(null); setFailed(false)
    axios.get(`${API_URL}/today`, { params: { sport, lang, day: localDay() } })
      .then(r => setGroups(r.data.data?.groups || []))
      .catch(() => setFailed(true))
  }, [sport])

  const gameLink = (id: number) => (bb ? `/basketball/game/${id}` : `/match/${id}`)
  const leagueLink = (code: string | null) => (code ? (bb ? `/basketball/league/${code}` : `/league/${code}`) : null)
  const total = groups?.reduce((s, g) => s + g.games.length, 0) || 0

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">{bb ? tt("Basketball predictions today") : tt("Football predictions today")}</h1>
        <p className="text-sm text-muted">
          {new Date().toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })}
          {groups && total > 0 && <> · {tt("{0} games", { 0: total })}</>}
        </p>
        <p className="text-sm text-muted">{tt("Recent form and the last meeting for every game today. Open a game for our prediction.")}</p>
      </header>

      {failed && <div className="card p-6 text-center text-sm text-muted">{tt("Could not load today's games. Try again in a minute.")}</div>}
      {!failed && !groups && <div className="min-h-[40vh] grid place-items-center"><span className="w-8 h-8 rounded-full border-2 border-line border-t-accent animate-spin" aria-label={tt('Loading…')} /></div>}
      {groups && !groups.length && (
        <div className="card p-6 text-center space-y-3">
          <p className="text-sm text-muted">{tt("No games today.")}</p>
          <Link to={bb ? '/basketball/games' : '/matches'} className="text-sm font-bold text-accent">{bb ? tt('All games →') : tt("All matches →")}</Link>
        </div>
      )}

      {groups?.map(g => {
        const href = leagueLink(g.code)
        return (
          <section key={g.code || g.league} className="card p-3 sm:p-4 space-y-1">
            <h2 className="font-display text-base font-bold px-2 pt-1">
              {href ? <Link to={href} className="hover:text-accent">{g.league}</Link> : g.league}
            </h2>
            <ul className="divide-y divide-line/50">
              {g.games.map(x => (
                <li key={x.id}>
                  <Link to={gameLink(x.id)} className="flex items-start gap-3 px-2 py-2.5 rounded-xl hover:bg-surface2/60 transition-colors">
                    <span className="w-12 flex-shrink-0 text-xs font-bold text-ink pt-0.5 num">
                      {x.score ? `${x.score[0]}–${x.score[1]}` : new Date(x.kickoff).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink break-words">{x.home} vs {x.away}</span>
                      {x.line && <span className="block text-xs text-muted break-words">{x.line}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
