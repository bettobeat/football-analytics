import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../lib/socket'
import { errorText } from '../lib/auth'

/**
 * Player page: /player/<API-Football id>. /player/find?name=&team=&c=&n= looks a scorer up first (Football-Data ids).
 */

interface SiteTeam { id: number; name: string; logo: string }
interface Row {
  league: { id?: number; code: string | null; name: string; logo?: string; country?: string; flag?: string }
  team: SiteTeam | null
  position?: string | null
  apps: number
  goals: number
  starts?: number
  minutes?: number
  assists?: number
  rating?: number | null
  yellow?: number
  red?: number
  shots?: number | null
  shotsOn?: number | null
  keyPasses?: number | null
  passAcc?: number | null
  tackles?: number | null
  interceptions?: number | null
  dribbles?: number | null
  duelsWon?: number | null
  duels?: number | null
  saves?: number | null
  conceded?: number | null
  penScored?: number | null
}
interface Season { season: number; label: string; rows: Row[]; totals: { apps: number; goals: number; starts?: number; minutes?: number; assists?: number; yellow?: number; red?: number; rating?: number | null } }
interface PlayerData {
  player: { id: number; name: string; firstname?: string; lastname?: string; age: number | null; birth?: { date?: string; place?: string; country?: string } | null; nationality: string | null; height: string | null; weight: string | null; photo: string }
  team: SiteTeam | null
  position: string | null
  number: number | null
  status: { out: boolean; type?: string; since?: string | null; until?: string | null }
  seasons: Season[]
  sidelined: { type: string; start: string; end: string | null }[]
  international?: (Row & { from: string | null; to: string | null })[]
  transfers: { date: string; type: string; from: SiteTeam; to: SiteTeam }[]
  premium: boolean
  locked?: string[]
  stale?: boolean
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

function Card({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface2/50 border border-line/60 px-3 py-3 text-center">
      <div className="text-[11px] text-faint">{label}</div>
      <div className={`font-display text-2xl font-extrabold num ${accent ? 'text-accent' : 'text-ink'}`}>{value}</div>
    </div>
  )
}

function Lock() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

const mon = (d: string) => new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
const span = (a: string | null, b: string | null) => (a && b ? (mon(a) === mon(b) ? mon(a) : `${mon(a)} – ${mon(b)}`) : '')

const teamHref = (t: SiteTeam) => `/team/${t.id}`

export default function Player() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [data, setData] = useState<PlayerData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [si, setSi] = useState(0)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    setSi(0)
    if (id === 'find') {
      axios
        .get(`${API_URL}/player-page/find`, { params: Object.fromEntries(params.entries()) })
        .then(r => !cancelled && nav(`/player/${r.data.data.id}`, { replace: true }))
        .catch(() => !cancelled && setError(`We couldn't find ${params.get('name') || 'this player'}'s page yet.`))
    } else {
      axios
        .get(`${API_URL}/player-page/${id}`)
        .then(r => !cancelled && setData(r.data.data))
        .catch(e => !cancelled && setError(errorText(e)))
    }
    return () => {
      cancelled = true
    }
  }, [id, params, nav])

  useEffect(() => {
    if (data?.player.name) document.title = `${data.player.name} · Bet To Beat`
  }, [data])

  if (error)
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-muted">{error}</p>
        <Link to="/" className="inline-block mt-4 text-sm font-bold text-accent">Back to home →</Link>
      </div>
    )
  if (!data)
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="card h-44 animate-pulse bg-surface2/60" />
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="card h-20 animate-pulse bg-surface2/60" />)}</div>
      </div>
    )

  const p = data.player
  const season = data.seasons[si]
  const full = data.premium
  const t = season?.totals
  const main = season?.rows[0]
  const gk = /goal/i.test(data.position || '')

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* ---------- header ---------- */}
      <section className="card relative overflow-hidden p-5 sm:p-7">
        <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ background: 'radial-gradient(600px 240px at 12% 0%, rgb(var(--accent)), transparent 70%)' }} />
        <div className="relative flex flex-wrap items-center gap-5 sm:gap-7">
          <img src={p.photo} alt="" className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl object-cover bg-surface2 ring-2 ring-line" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
              {data.position && <span className="px-2 py-0.5 rounded-full bg-surface2/80 text-muted font-semibold">{data.position}</span>}
              {data.number && <span className="num">#{data.number}</span>}
              {data.status.out ? (
                <span className="px-2 py-0.5 rounded-full bg-loss/15 text-loss font-bold">
                  Out · {data.status.type}
                  {data.status.until ? ` until ${fmt(data.status.until)}` : ''}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-win/15 text-win font-bold">Available</span>
              )}
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{p.name}</h1>
            {data.team && (
              <Link to={teamHref(data.team)} className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink">
                <img src={data.team.logo} alt="" className="w-5 h-5 object-contain" />
                {data.team.name}
              </Link>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {p.age !== null && (<><dt className="text-faint">Age</dt><dd className="text-ink font-semibold num">{p.age}</dd></>)}
            {p.nationality && (<><dt className="text-faint">Nationality</dt><dd className="text-ink font-semibold">{p.nationality}</dd></>)}
            {p.height && (<><dt className="text-faint">Height</dt><dd className="text-ink font-semibold">{p.height}</dd></>)}
            {p.birth?.date && (<><dt className="text-faint">Born</dt><dd className="text-ink font-semibold">{fmt(p.birth.date)}</dd></>)}
          </dl>
        </div>
      </section>

      {data.stale && <p className="text-xs text-faint">Showing the last saved copy; live data is paused for today.</p>}

      {/* ---------- season stats ---------- */}
      {season ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-ink">Season {season.label}</h2>
            {data.seasons.length > 1 && (
              <div className="seg">
                {data.seasons.map((s, i) => (
                  <button key={s.season} onClick={() => setSi(i)} className={`seg-btn ${si === i ? 'seg-btn-active' : ''}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Apps" value={t.apps} />
            <Stat label="Goals" value={t.goals} accent />
            <Stat label="Assists" value={full ? t.assists ?? 0 : <span className="text-faint text-base inline-flex items-center gap-1"><Lock /> Pro</span>} />
            <Stat label="Minutes" value={full ? (t.minutes ?? 0).toLocaleString('en-GB') : <span className="text-faint text-base inline-flex items-center gap-1"><Lock /> Pro</span>} />
            <Stat label="Rating" value={full ? t.rating ?? '–' : <span className="text-faint text-base inline-flex items-center gap-1"><Lock /> Pro</span>} />
            <Stat label="Cards" value={full ? <span><span className="text-draw">{t.yellow ?? 0}</span><span className="text-faint text-base"> / </span><span className="text-loss">{t.red ?? 0}</span></span> : <span className="text-faint text-base inline-flex items-center gap-1"><Lock /> Pro</span>} />
          </div>

          <Card title="By competition">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-[11px] text-faint">
                    <th className="text-left font-medium py-1.5 pl-2">Competition</th>
                    <th className="text-left font-medium py-1.5">Team</th>
                    <th className="text-right font-medium py-1.5 num w-12">Apps</th>
                    {full && <th className="text-right font-medium py-1.5 num w-14">Min</th>}
                    <th className="text-right font-medium py-1.5 num w-12">Goals</th>
                    {full && <th className="text-right font-medium py-1.5 num w-12">Ast</th>}
                    {full && <th className="text-right font-medium py-1.5 num w-14 pr-2">Rating</th>}
                  </tr>
                </thead>
                <tbody>
                  {season.rows.map((r, i) => (
                    <tr key={i} className="border-t border-line/50">
                      <td className="py-2 pl-2">
                        <span className="flex items-center gap-2 min-w-0">
                          {r.league.logo && <img src={r.league.logo} alt="" className="w-5 h-5 object-contain bg-white/90 rounded p-0.5" />}
                          {r.league.code ? (
                            <Link to={`/league/${r.league.code}`} className="truncate text-ink hover:text-accent">{r.league.name}</Link>
                          ) : (
                            <span className="truncate text-ink">{r.league.name}</span>
                          )}
                        </span>
                      </td>
                      <td className="py-2">
                        {r.team && (
                          <Link to={teamHref(r.team)} className="flex items-center gap-2 min-w-0 text-muted hover:text-ink">
                            <img src={r.team.logo} alt="" className="w-4 h-4 object-contain" />
                            <span className="truncate">{r.team.name}</span>
                          </Link>
                        )}
                      </td>
                      <td className="py-2 text-right num text-muted">{r.apps}</td>
                      {full && <td className="py-2 text-right num text-muted">{r.minutes}</td>}
                      <td className="py-2 text-right num font-bold text-ink">{r.goals}</td>
                      {full && <td className="py-2 text-right num text-muted">{r.assists}</td>}
                      {full && (
                        <td className={`py-2 pr-2 text-right num font-bold ${r.rating ? (r.rating >= 7.3 ? 'text-win' : r.rating >= 6.9 ? 'text-accent' : 'text-draw') : 'text-faint'}`}>{r.rating ?? '–'}</td>
                      )}
                    </tr>
                  ))}
                  {season.rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-faint">No games this season yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {full && main && (
            <Card title={`Detail · ${main.league.name}`}>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                {gk ? (
                  <>
                    <Stat label="Saves" value={main.saves ?? '–'} />
                    <Stat label="Conceded" value={main.conceded ?? '–'} />
                    <Stat label="Pass accuracy" value={main.passAcc != null ? `${main.passAcc}%` : '–'} />
                    <Stat label="Duels won" value={main.duels ? `${main.duelsWon ?? 0}/${main.duels}` : '–'} />
                  </>
                ) : (
                  <>
                    <Stat label="Shots (on target)" value={main.shots != null ? `${main.shots} (${main.shotsOn ?? 0})` : '–'} />
                    <Stat label="Key passes" value={main.keyPasses ?? '–'} />
                    <Stat label="Tackles + interceptions" value={main.tackles != null || main.interceptions != null ? (main.tackles || 0) + (main.interceptions || 0) : '–'} />
                    <Stat label="Duels won" value={main.duels ? `${main.duelsWon ?? 0}/${main.duels}` : '–'} />
                  </>
                )}
              </div>
            </Card>
          )}
        </>
      ) : (
        <div className="card p-6 text-sm text-muted">No season data for this player yet.</div>
      )}

      {data.international && data.international.length > 0 && (
        <Card title="National team">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-[11px] text-faint">
                  <th className="text-left font-medium py-1.5 pl-2">Competition</th>
                  <th className="text-left font-medium py-1.5">Played</th>
                  <th className="text-right font-medium py-1.5 num w-12">Apps</th>
                  <th className="text-right font-medium py-1.5 num w-12">Goals</th>
                  {full && <th className="text-right font-medium py-1.5 num w-12 pr-2">Ast</th>}
                </tr>
              </thead>
              <tbody>
                {data.international.map((r, i) => (
                  <tr key={i} className="border-t border-line/50">
                    <td className="py-2 pl-2">
                      <span className="flex items-center gap-2 min-w-0">
                        {r.team && <img src={r.team.logo} alt="" className="w-4 h-4 object-contain" />}
                        <span className="truncate text-ink">{r.league.name}</span>
                        {r.team && <span className="text-[11px] text-faint truncate">· {r.team.name}</span>}
                      </span>
                    </td>
                    <td className="py-2 text-[11px] text-faint whitespace-nowrap">{span(r.from, r.to)}</td>
                    <td className="py-2 text-right num text-muted">{r.apps}</td>
                    <td className="py-2 text-right num font-bold text-ink">{r.goals}</td>
                    {full && <td className="py-2 pr-2 text-right num text-muted">{r.assists}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-faint">National-team games are listed by tournament, not counted in the club season above.</p>
        </Card>
      )}

      {!full && data.locked && (
        <div className="rounded-3xl p-6 border border-home/40 bg-[linear-gradient(150deg,#1B2A55_0%,#101624_70%)] text-[#EEF1F6] flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="font-display text-lg font-bold">Every stat with Premium</div>
            <p className="text-sm text-[#C9D0DB]">{data.locked.join(' · ')}</p>
          </div>
          <Link to="/premium" className="h-11 px-6 rounded-2xl bg-[#C8FF3D] text-[#07090D] font-extrabold grid place-items-center">Go Premium</Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        {data.transfers.length > 0 && (
          <Card title="Career moves">
            <ul className="space-y-1">
              {data.transfers.map((tr, i) => (
                <li key={i} className="flex items-center gap-3 py-2 border-b border-line/50 last:border-0 text-sm">
                  <span className="w-20 text-[11px] text-faint">{fmt(tr.date)}</span>
                  <Link to={teamHref(tr.from)} className="flex items-center gap-1.5 min-w-0 text-muted hover:text-ink">
                    <img src={tr.from.logo} alt="" className="w-4 h-4 object-contain" />
                    <span className="truncate">{tr.from.name}</span>
                  </Link>
                  <span className="text-faint">→</span>
                  <Link to={teamHref(tr.to)} className="flex items-center gap-1.5 min-w-0 font-semibold text-ink hover:text-accent">
                    <img src={tr.to.logo} alt="" className="w-4 h-4 object-contain" />
                    <span className="truncate">{tr.to.name}</span>
                  </Link>
                  <span className="ml-auto text-[11px] text-faint whitespace-nowrap">{tr.type}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {full && data.sidelined.length > 0 && (
          <Card title="Injuries & suspensions">
            <ul className="space-y-1">
              {data.sidelined.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2 border-b border-line/50 last:border-0 text-sm">
                  <span className="text-ink truncate">{s.type}</span>
                  <span className="text-[11px] text-faint whitespace-nowrap">
                    {fmt(s.start)} – {s.end ? fmt(s.end) : 'now'}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}
