import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../lib/socket'

interface TeamHit { id: number; name: string; logo: string; national: boolean }
interface MatchHit { id: number; utcDate: string; status: string; competition: string; home: string; away: string; homeCrest?: string; awayCrest?: string }

/** Search teams (every club and national team we track) and their upcoming / live matches. "/" focuses it. */
export default function SearchBox({ compact = false, onDone }: { compact?: boolean; onDone?: () => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [teams, setTeams] = useState<TeamHit[]>([])
  const [matches, setMatches] = useState<MatchHit[]>([])
  const [loading, setLoading] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const nav = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(t.tagName)) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    const onClick = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick) }
  }, [])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setTeams([]); setMatches([]); return }
    setLoading(true)
    const t = setTimeout(() => {
      axios.get(`${API_URL}/search`, { params: { q: term } })
        .then(r => { setTeams(r.data.data.teams || []); setMatches(r.data.data.matches || []) })
        .catch(() => { setTeams([]); setMatches([]) })
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const done = () => { setOpen(false); setQ(''); onDone?.() }
  const show = open && q.trim().length >= 2

  return (
    <div ref={box} className={`relative ${compact ? 'w-full' : 'w-full max-w-md'}`}>
      <label className="flex items-center gap-2.5 h-11 px-4 rounded-2xl bg-surface2/70 border border-line/80 focus-within:border-accent/60 transition-colors">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted flex-shrink-0" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <span className="sr-only">Search</span>
        <input
          ref={input}
          type="search"
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Escape') setOpen(false)
            if (e.key === 'Enter' && teams[0]) { nav(`/team/${teams[0].id}`); done() }
          }}
          placeholder="Search teams, national teams, matches"
          className="flex-1 min-w-0 bg-transparent outline-none text-sm text-ink placeholder:text-faint"
        />
        {!compact && <kbd className="hidden md:inline text-[11px] text-faint border border-line rounded-md px-1.5 py-0.5">/</kbd>}
      </label>

      {show && (
        <div className="absolute left-0 right-0 mt-2 z-50 card p-2 max-h-[70vh] overflow-y-auto">
          {loading && !teams.length && !matches.length && <div className="px-3 py-3 text-sm text-faint">Searching…</div>}
          {!loading && !teams.length && !matches.length && <div className="px-3 py-3 text-sm text-faint">Nothing found for "{q.trim()}".</div>}
          {teams.length > 0 && (
            <div className="py-1">
              <div className="label px-3 pb-1">Teams</div>
              {teams.map(t => (
                <Link key={t.id} to={`/team/${t.id}`} onClick={done} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface2">
                  <img src={t.logo} alt="" width={24} height={24} className="w-6 h-6 object-contain" />
                  <span className="text-sm font-semibold text-ink">{t.name}</span>
                  {t.national && <span className="ml-auto text-[11px] text-faint">National team</span>}
                </Link>
              ))}
            </div>
          )}
          {matches.length > 0 && (
            <div className="py-1 border-t border-line/60 mt-1">
              <div className="label px-3 pt-2 pb-1">Matches</div>
              {matches.map(m => (
                <Link key={m.id} to={`/match/${m.id}`} onClick={done} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface2">
                  <span className="text-sm text-ink font-medium truncate">{m.home} – {m.away}</span>
                  <span className="ml-auto text-[11px] text-faint whitespace-nowrap">
                    {['IN_PLAY', 'PAUSED'].includes(m.status) ? 'Live' : new Date(m.utcDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
