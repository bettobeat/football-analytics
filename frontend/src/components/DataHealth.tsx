import { useEffect, useState } from 'react'
import axios from 'axios'
import { API_URL } from '../lib/socket'
import { errorText } from '../lib/auth'

interface Check { id: string; label: string; level: 'ok' | 'warn' | 'fail'; detail: string; items?: string[] }
interface Report { level: 'ok' | 'warn' | 'fail'; at: string; checks: Check[] }

const DOT = { ok: 'bg-win', warn: 'bg-draw', fail: 'bg-loss' }
const WORD = { ok: 'OK', warn: 'Check', fail: 'Problem' }

/** Admin: is every data feed current, and does the data add up? Refreshes every minute while open. */
export default function DataHealth() {
  const [r, setR] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const [running, setRunning] = useState<string | null>(null)
  const runPlayers = () =>
    axios
      .get(`${API_URL}/data-audit/run`, { params: { bg: 1, email: 0 } })
      .then(() => setRunning('Player check started: it takes a few minutes. Press "Check now" later to see the result.'))
      .catch(e => setRunning(errorText(e)))

  const load = () =>
    axios
      .get(`${API_URL}/data-health`)
      .then(x => { setR(x.data.data); setError(null) })
      .catch(e => setError(errorText(e)))

  useEffect(() => {
    load()
    const t = setInterval(load, 60 * 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <section className="card p-5 sm:p-6 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <h2 className="font-display text-lg font-bold text-ink">Data health</h2>
          {r && (
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-surface2 text-ink`}>
              <span className={`w-2 h-2 rounded-full ${DOT[r.level]}`} aria-hidden />
              {r.level === 'ok' ? 'All good' : r.level === 'warn' ? 'Needs a look' : 'Problem'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-faint">
          {r && <span>Checked {new Date(r.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={runPlayers} className="font-bold text-muted hover:text-ink">Run player check</button>
          <button onClick={load} className="font-bold text-accent">Check now</button>
        </div>
      </div>
      {error && <p className="text-sm text-loss">{error}</p>}
      {running && <p className="text-xs text-muted mb-3">{running}</p>}
      {!r && !error && <p className="text-sm text-faint">Checking…</p>}
      {r && (
        <ul className="divide-y divide-line/50">
          {r.checks.map(c => (
            <li key={c.id} className="py-2.5">
              <button
                type="button"
                onClick={() => setOpen(open === c.id ? null : c.id)}
                disabled={!c.items?.length}
                className="w-full flex items-start gap-3 text-left"
              >
                <span className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${DOT[c.level]}`} aria-hidden />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-ink">{c.label} <span className="text-[11px] font-bold text-faint ml-1">{WORD[c.level]}</span></span>
                  <span className="block text-xs text-muted">{c.detail}</span>
                </span>
                {!!c.items?.length && <span className="text-[11px] text-accent font-bold whitespace-nowrap">{open === c.id ? 'Hide' : `${c.items.length} item${c.items.length === 1 ? '' : 's'}`}</span>}
              </button>
              {open === c.id && c.items && (
                <ul className="mt-2 ml-5 space-y-1 text-xs text-muted list-disc pl-4">
                  {c.items.map((it, i) => <li key={i}>{it}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
