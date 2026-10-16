import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { API_URL } from '../../lib/socket'
import { t as tt } from '../../lib/i18n'
import { useAuth } from '../../lib/auth'
import { useNflConfig, useNflFavorites, NFL_STATUS, weekLabel, nick, nflRid, nflRstatus, type NflGame, type Standings } from '../../lib/nfl'
import { winnerPred, winnerRecordRows, upsetItems } from './winner'
import type { SportAdapter, SportHomeData, HGame, HNews, HResult } from './types'

/** NFL's adapter for components/SportHome (fix141): the data and labels of the NFL home. */

const STRONG = 70
/** Primetime: Thursday / Sunday / Monday night games start 00:00–03:59 UTC (8:15 pm Eastern). */
const primetime = (g: NflGame) => new Date(g.kickoff).getUTCHours() < 4

function toGame(g: NflGame): HGame {
  const team = (s: NflGame['home']) => ({ id: s.id, name: s.name, short: nick(s.name), logo: s.logo, href: `/american-football/team/${s.id}` })
  return {
    id: g.id, href: `/american-football/game/${g.id}`, reveal: { id: nflRid(g), status: nflRstatus(g) }, kickoff: g.kickoff,
    competition: { name: `NFL · ${weekLabel(g.weekKey)}` }, home: team(g.home), away: team(g.away),
    live: g.state === 'live' ? { label: NFL_STATUS[g.status] || tt('LIVE'), score: [g.score?.home ?? 0, g.score?.away ?? 0] } : null,
    pred: winnerPred(g.prediction, nick(g.home.name), nick(g.away.name), STRONG)
  }
}

interface Home { season: number | null; live: NflGame[]; games: NflGame[]; upcoming: NflGame[]; results: NflGame[]; standings: Standings | null }

function useNflData(): SportHomeData {
  const { access } = useAuth()
  const full = access === 'pro' || access === 'admin'
  const [d, setD] = useState<Home | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [record, setRecord] = useState<{ bands?: { min: number; n: number; pct: number | null }[] } | null>(null)
  const [news, setNews] = useState<HNews[]>([])
  useEffect(() => {
    const load = () => axios.get(`${API_URL}/nfl/home`).then(r => setD(r.data.data)).catch(() => undefined).finally(() => setLoaded(true))
    load()
    axios.get(`${API_URL}/nfl/record`, { params: { days: 30 } }).then(r => setRecord(r.data.data)).catch(() => setRecord({}))
    axios.get(`${API_URL}/news`, { params: { sport: 'american-football', limit: 10 } }).then(r => setNews(r.data.data || [])).catch(() => undefined)
    const iv = setInterval(load, 60 * 1000) // live scores
    return () => clearInterval(iv)
  }, [access])

  const notStarted = useMemo(() => (d?.upcoming || []).filter(g => new Date(g.kickoff).getTime() > Date.now()), [d])
  const week = useMemo(() => (d?.games || []).filter(g => g.state === 'upcoming' && new Date(g.kickoff).getTime() > Date.now()), [d])
  // featured: the week's biggest games — both teams' win % added up, primetime a bit higher; up to 4, in kick-off order
  const featured = useMemo(() => {
    const pct = new Map((d?.standings?.rows || []).map(r => [r.team.id, r.games ? r.pct : 0.5]))
    const score = (g: NflGame) => (pct.get(g.home.id) ?? 0.5) + (pct.get(g.away.id) ?? 0.5) + (primetime(g) ? 0.25 : 0)
    return [...week].sort((a, b) => score(b) - score(a) || a.kickoff.localeCompare(b.kickoff)).slice(0, 4).sort((a, b) => a.kickoff.localeCompare(b.kickoff))
  }, [week, d?.standings])
  const featuredIds = useMemo(() => new Set(featured.map(g => g.id)), [featured])
  const favs = useNflFavorites()
  const favNext = useMemo(() => notStarted.filter(g => favs.reasons(g).length > 0).slice(0, 10), [notStarted, favs.teams.length])
  const soonest = useMemo(() => notStarted.filter(g => !featuredIds.has(g.id)).slice(0, 5), [notStarted, featuredIds])
  const next = useMemo(() => week.filter(g => !featuredIds.has(g.id) && !favNext.includes(g)), [week, featuredIds, favNext])

  const resultRows: HResult[] | null = d ? d.results.map(g => {
    const p = g.prediction
    const pick = p && !p.locked && p.pick ? p.pick : p?.pick || null
    const won = (s: 'H' | 'A') => !!g.score && (s === 'H' ? g.score.home > g.score.away : g.score.away > g.score.home)
    return {
      id: g.id, href: `/american-football/game/${g.id}`, competition: `NFL · ${weekLabel(g.weekKey)}`, date: g.kickoff,
      home: { name: g.home.name, logo: g.home.logo, score: g.score?.home ?? '', won: won('H') },
      away: { name: g.away.name, logo: g.away.logo, score: g.score?.away ?? '', won: won('A') },
      pick: pick ? { words: nick(pick === 'H' ? g.home.name : g.away.name), pct: null, strong: false } : null,
      hit: p?.hit ?? null
    }
  }) : null

  return {
    loaded, full, news,
    featured: featured.map(toGame), live: (d?.live || []).map(toGame), soonest: soonest.map(toGame), favorites: favNext.map(toGame), next: next.map(toGame),
    record: {
      rows: record ? winnerRecordRows(record.bands) : null, aside: tt("last {0} days", { 0: 30 }),
      note: tt("Picks right, every game counted. Each prediction is saved before kick-off and never edited."),
      link: null,
      empty: { title: tt("Predictions start soon"), text: tt("Once our NFL model is live, every prediction is saved before kick-off and checked after the game, here and in public.") }
    },
    special: {
      title: tt("Upset watch"), tone: 'loss', open: full,
      items: upsetItems(notStarted, g => g.prediction ? { id: g.id, href: `/american-football/game/${g.id}`, league: `NFL · ${weekLabel(g.weekKey)}`, date: g.kickoff, home: nick(g.home.name), away: nick(g.away.name), pHome: g.prediction.pHome, pAway: g.prediction.pAway, locked: g.prediction.locked } : null),
      empty: tt("No upsets on the radar this week."),
      locked: { title: tt("Upset watch"), text: tt("The 2 games where our model gives the underdog the best chance. Part of Pro.") },
      link: full ? { to: '/american-football/games', label: tt("All games →") } : { to: '/premium', label: tt("Unlock upset watch →") }
    },
    results: { rows: resultRows, days: 30, link: null }
  }
}

/** NFL's adapter; the admin preview line comes from the config (not public yet). */
export function useNflAdapter(): SportAdapter {
  const cfg = useNflConfig()
  return {
    field: 'gridiron',
    banner: cfg && !cfg.public ? tt('Admin preview · not public yet') : null,
    labels: {
      featured: tt("Featured game"), modelPrediction: tt("{0} prediction", { 0: 'nfl-v1' }), nextList: tt("Next kick-offs"), nextSection: tt("Next games"),
      all: { to: '/american-football/games', label: tt("All games →") }, today: { to: '/american-football/today', label: tt("Today's predictions →") },
      favorites: '/american-football/favorites', liveDetail: tt("Live score and box score →"),
      emptyHero: [tt("American football,"), tt("tested in public."), tt("The next games appear here as soon as they are scheduled.")],
      newsLoading: tt("Loading the latest news…"),
      premiumText: tt("Win chances, point spread, total points and the predicted score for every game, team analysis and the complete track record.")
    },
    intro: {
      title: tt("American football predictions"),
      text: tt("Who wins every NFL game, with the chance of each side, the expected score and the reasons behind each pick. Every prediction is saved before kick-off and checked in public."),
      bullets: [
        [tt("Every game"), tt("Win chances, point spread and total points, with the reasons behind each pick.")],
        [tt("Checked in public"), tt("Every prediction is saved before kick-off and scored after the game.")],
        [tt("Free to start"), tt("2 full picks every week. No card needed.")]
      ],
      cta: { to: '/signup', label: tt("Get 2 free picks a week") },
      second: { to: '/american-football/games', label: tt("See the games") }
    },
    useData: useNflData
  }
}
