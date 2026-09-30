import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../lib/socket'
import { errorText } from '../lib/auth'

/*
 * Draw picks (Pro): the 2 games of the coming 7 days where a draw is most likely by our estimate, among games where
 * the draw odds are worth it. One short record line underneath (the same choice made week by week on past games).
 */

interface Pick {
  matchId: number; league: string; date: string; home: string; away: string
  homeCrest?: string | null; awayCrest?: string | null
  marketDraw: number; ourDraw: number; price: number; edge: number
}
interface PicksRecord { n: number; wins: number; hitRate: number | null; roi: number | null; since: string | null }
interface Report { picks: Pick[]; picksRecord: PicksRecord }

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const sign = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `${x > 0 ? '+' : ''}${x}%`)

function Crest({ src, name }: { src?: string | null; name: string }) {
  return src ? (
    <img src={src} alt="" className="w-14 h-14 sm:w-16 sm:h-16 object-contain drop-shadow" />
  ) : (
    <span className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-surface2 grid place-items-center font-display font-bold text-muted">{name.slice(0, 2).toUpperCase()}</span>
  )
}

function PickCard({ p, n }: { p: Pick; n: number }) {
  const max = 50
  return (
    <Link to={`/match/${p.matchId}`} className="card card-hover relative overflow-hidden p-5 sm:p-6 flex flex-col gap-5 border-draw/40">
      <div className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full bg-draw/15 blur-3xl" />
      <div className="relative flex items-center justify-between gap-3 text-xs">
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className="px-2 py-0.5 rounded-full bg-draw/20 text-draw font-extrabold uppercase tracking-wider text-[10px] whitespace-nowrap">Draw pick {n}</span>
          <span className="text-muted truncate">{p.league}</span>
        </span>
        <span className="text-muted whitespace-nowrap">{when(p.date)}</span>
      </div>

      <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex flex-col items-center gap-2 text-center min-w-0">
          <Crest src={p.homeCrest} name={p.home} />
          <span className="font-display font-bold text-ink leading-tight truncate max-w-full">{p.home}</span>
        </div>
        <div className="text-center">
          <div className="font-display text-4xl sm:text-5xl font-extrabold text-draw num leading-none">{Math.round(p.ourDraw)}%</div>
          <div className="text-[11px] text-muted mt-1">draw chance</div>
        </div>
        <div className="flex flex-col items-center gap-2 text-center min-w-0">
          <Crest src={p.awayCrest} name={p.away} />
          <span className="font-display font-bold text-ink leading-tight truncate max-w-full">{p.away}</span>
        </div>
      </div>

      <div className="relative space-y-1.5">
        <div className="flex items-center gap-2 text-xs">
          <span className="w-24 text-muted shrink-0">Bookmakers</span>
          <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
            <div className="h-full bg-muted/60 rounded-full" style={{ width: `${Math.min(100, (p.marketDraw / max) * 100)}%` }} />
          </div>
          <span className="num w-12 text-right text-muted">{Math.round(p.marketDraw)}%</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-24 text-ink font-semibold shrink-0">Our estimate</span>
          <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
            <div className="h-full bg-draw rounded-full" style={{ width: `${Math.min(100, (p.ourDraw / max) * 100)}%` }} />
          </div>
          <span className="num w-12 text-right font-bold text-ink">{Math.round(p.ourDraw)}%</span>
        </div>
      </div>

      <div className="relative grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface2/60 p-3">
          <div className="text-[11px] text-faint">Draw odds</div>
          <div className="font-display text-xl font-extrabold text-ink num">{p.price.toFixed(2)}</div>
        </div>
        <div className="rounded-xl bg-surface2/60 p-3">
          <div className="text-[11px] text-faint">Value at these odds</div>
          <div className="font-display text-xl font-extrabold text-win num">{sign(p.edge)}</div>
        </div>
      </div>

      <span className="relative text-sm font-bold text-accent">Full match analysis →</span>
    </Link>
  )
}

export default function DrawAlerts() {
  const [data, setData] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Draw picks · Bet To Beat'
    axios
      .get(`${API_URL}/draw-alerts`)
      .then(r => setData(r.data.data))
      .catch(e => setError(errorText(e)))
  }, [])

  if (error) return <div className="max-w-5xl mx-auto px-4 py-10 text-loss">{error}</div>

  const rec = data?.picksRecord
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Draw picks</h1>
        <p className="text-muted mt-2 max-w-2xl">
          The 2 games of the coming week where a draw is most likely, and the draw odds are worth it. Updated as the odds move.
        </p>
      </div>

      {!data ? (
        <div className="grid gap-5 md:grid-cols-2">
          {[0, 1].map(i => <div key={i} className="card h-[420px] animate-pulse" />)}
        </div>
      ) : data.picks.length === 0 ? (
        <div className="card p-8 text-center space-y-2">
          <div className="font-display text-lg font-bold text-ink">No draw pick this week yet</div>
          <p className="text-sm text-muted max-w-md mx-auto">
            We only pick a draw when our chance is clearly above what the odds say. New games and odds come in every day, so check back.
          </p>
        </div>
      ) : (
        <div className={`grid gap-5 ${data.picks.length > 1 ? 'md:grid-cols-2' : 'max-w-xl'}`}>
          {data.picks.map((p, i) => <PickCard key={p.matchId} p={p} n={i + 1} />)}
        </div>
      )}

      {rec && (
        <p className="text-sm text-muted">
          {rec.n > 0 ? (
            <>
              <span className="font-semibold text-ink">Our draw picks so far:</span>{' '}
              <span className="num">{rec.wins} of {rec.n}</span> ended in a draw
              {rec.roi !== null && (
                <>
                  {' · '}
                  <span className={`num font-semibold ${rec.roi >= 0 ? 'text-win' : 'text-loss'}`}>{sign(rec.roi)}</span> at the odds
                </>
              )}
              {rec.since && <span className="text-faint"> · since {new Date(rec.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
            </>
          ) : (
            'The record starts with this week’s picks.'
          )}
        </p>
      )}

      <p className="text-xs text-faint max-w-2xl leading-relaxed">
        A draw is never a sure thing: even our strongest draw calls come in about 1 time in 3. The odds pay about 3 to 4 times
        the stake, so the value is over many picks, not in any single game. Probabilities, not promises.
      </p>
    </div>
  )
}
