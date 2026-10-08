import { useEffect, useState } from 'react'
import axios from 'axios'
import { API_URL } from '../lib/socket'

interface Visitors {
  onlineNow: number; onlineSignedIn: number; onlineWindowMin: number
  today: number; last7: number; last30: number; returning30: number
  daily: { day: string; visitors: number; signedIn: number; hits: number }[]
  countingSince: string | null
}

/** Admin: people on the site now, and unique visitors (one per IP) today / 7 / 30 days, with a 30-day bar chart. */
export default function VisitorsCard() {
  const [v, setV] = useState<Visitors | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let off = false
    const load = () => axios.get(`${API_URL}/admin/visitors`).then(r => { if (!off) { setV(r.data.data); setErr(false) } }).catch(() => !off && setErr(true))
    load()
    const iv = setInterval(load, 30000)
    return () => { off = true; clearInterval(iv) }
  }, [])
  if (err && !v) return null

  // the last 30 days, missing days as 0
  const days: { day: string; visitors: number; signedIn: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    const r = v?.daily.find(x => x.day === d)
    days.push({ day: d, visitors: r?.visitors || 0, signedIn: r?.signedIn || 0 })
  }
  const max = Math.max(1, ...days.map(d => d.visitors))
  const tile = (label: string, value: number | string | undefined, sub?: string, live = false) => (
    <div className={`rounded-xl border px-4 py-3 ${live ? 'border-live/40 bg-live/[0.07]' : 'border-line/60 bg-surface2/50'}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
        {live && <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulseDot" />}{label}
      </div>
      <div className={`num text-2xl font-extrabold leading-none mt-1.5 ${live ? 'text-live' : 'text-ink'}`}>{value ?? '–'}</div>
      {sub && <div className="text-[11px] text-faint mt-1">{sub}</div>}
    </div>
  )
  return (
    <section className="card p-5 sm:p-6 mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="font-display text-lg font-bold text-ink">Visitors</h2>
        <span className="text-xs text-faint">one visitor = one IP address · admins and bots not counted{v?.countingSince ? ` · counting since ${new Date(v.countingSince).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tile('Online now', v?.onlineNow, v ? `${v.onlineSignedIn} signed in · last ${v.onlineWindowMin} min` : undefined, true)}
        {tile('Today', v?.today)}
        {tile('Last 7 days', v?.last7)}
        {tile('Last 30 days', v?.last30, v ? `${v.returning30} came back on another day` : undefined)}
      </div>
      <div className="mt-5">
        <div className="flex items-end gap-[3px] h-28">
          {days.map(d => (
            <div key={d.day} className="group relative flex-1 h-full flex flex-col justify-end" title={`${d.day}: ${d.visitors} visitors, ${d.signedIn} signed in`}>
              <div className="w-full rounded-t-[3px] bg-accent/70 group-hover:bg-accent transition-colors flex flex-col justify-end overflow-hidden" style={{ height: `${(d.visitors / max) * 100}%`, minHeight: d.visitors ? 2 : 0 }}>
                <div className="w-full bg-home/80" style={{ height: d.visitors ? `${(d.signedIn / d.visitors) * 100}%` : 0 }} />
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-faint mt-1.5 num">
          <span>{new Date(days[0].day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-accent/70" />visitors per day</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-home/80" />signed in</span>
          </span>
          <span>Today</span>
        </div>
      </div>
    </section>
  )
}
