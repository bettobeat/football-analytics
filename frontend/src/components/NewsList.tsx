import { useEffect, useState } from 'react'
import axios from 'axios'
import { API_URL } from '../lib/socket'
import { t } from '../lib/i18n'

/** News stories (headline, outlet, time, link to the original article) — shared by team, league and basketball pages. */
export interface NewsItem { title: string; link: string; source: string; published: string | null; summary?: string; image?: string | null; leagues?: { code: string; name: string }[] }

export const newsAgo = (iso: string | null) => {
  if (!iso) return ''
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return m < 60 ? t('{0} min ago', { 0: m }) : m < 1440 ? t('{0} h ago', { 0: Math.round(m / 60) }) : t('{0} d ago', { 0: Math.round(m / 1440) })
}

/** Load news: params as for /api/news (sport, league, team, short, teamId, limit). null = loading. */
export function useNews(params: Record<string, string | number | undefined>, enabled = true) {
  const [items, setItems] = useState<NewsItem[] | null>(null)
  const key = JSON.stringify(params)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setItems(null)
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))
    axios.get(`${API_URL}/news`, { params: clean }).then(r => !cancelled && setItems(r.data.data || [])).catch(() => !cancelled && setItems([]))
    return () => { cancelled = true }
  }, [key, enabled])
  return items
}

/** A list of stories with thumbnails. */
export function NewsRows({ items, showLeague = false, max = 12 }: { items: NewsItem[]; showLeague?: boolean; max?: number }) {
  return (
    <ul className="space-y-1">
      {items.slice(0, max).map(n => (
        <li key={n.link}>
          <a href={n.link} target="_blank" rel="noreferrer" className="flex gap-3 p-2 rounded-xl hover:bg-surface2/60 transition-colors">
            <span className="w-20 h-14 rounded-lg overflow-hidden bg-surface2 flex-shrink-0 grid place-items-center">
              {n.image ? (
                <img src={n.image} alt="" loading="lazy" className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display = 'none' }} />
              ) : (
                <span className="text-[9px] font-extrabold uppercase tracking-wide text-faint px-1 text-center">{n.source}</span>
              )}
            </span>
            <span className="min-w-0 flex flex-col gap-1">
              <span className="text-[13px] font-bold leading-snug text-ink line-clamp-2">{n.title}</span>
              <span className="text-[11px] text-faint">{[n.source, showLeague ? n.leagues?.[0]?.name : null].filter(Boolean).join(' · ')}{n.published ? ` · ${newsAgo(n.published)}` : ''}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

/** Lead story with a big picture, then a list — the football home's news block. */
export function NewsLead({ items, max = 7 }: { items: NewsItem[]; max?: number }) {
  const lead = items.find(n => n.image) || items[0]
  if (!lead) return null
  const rest = items.filter(n => n !== lead).slice(0, max - 1)
  return (
    <div className="grid gap-4 md:grid-cols-[1.25fr_1fr]">
      <a href={lead.link} target="_blank" rel="noreferrer" className="card card-hover overflow-hidden flex flex-col">
        {lead.image && (
          <span className="relative block aspect-[16/9] bg-surface2 overflow-hidden">
            <img src={lead.image} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} />
            <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            <span className="absolute left-4 bottom-3 text-[11px] font-extrabold uppercase tracking-wide text-[#C8FF3D]">{lead.source}</span>
          </span>
        )}
        <span className="p-5 flex flex-col gap-2 flex-1">
          {!lead.image && <span className="text-[11px] font-extrabold uppercase tracking-wide text-accent">{lead.source}</span>}
          <span className="font-display text-lg sm:text-xl font-bold leading-snug text-ink">{lead.title}</span>
          {lead.summary && <span className="text-sm text-muted line-clamp-3">{lead.summary}</span>}
          <span className="mt-auto pt-2 text-[11px] text-faint">{lead.published ? `${newsAgo(lead.published)} · ` : ''}{t('opens {0}', { 0: lead.source })}</span>
        </span>
      </a>
      <div className="card p-2 flex flex-col"><NewsRows items={rest} showLeague /></div>
    </div>
  )
}
