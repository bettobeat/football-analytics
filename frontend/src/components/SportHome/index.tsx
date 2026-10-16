import { Link } from 'react-router-dom'
import { t as tt } from '../../lib/i18n'
import { useAuth } from '../../lib/auth'
import { useRevealState } from '../../lib/reveal'
import { FirstVisit, FeaturedHero, FeaturedCarousel, SideCard, Section, Rail, RecordCard, SpecialCard, ResultsCard, NewsBlock, NewsRail, PremiumCard } from './parts'
import type { SportAdapter } from './types'

export type { SportAdapter, SportHomeData, HGame, HTeam, HCell, HPick, HPred, HNews, HRecord, HSpecial, HResults } from './types'

/**
 * The home page of every sport (fix141) — the football home is the template. The layout lives here only; a sport
 * passes an adapter (data + labels). Rule (CLAUDE.md): new sports add an adapter, never their own home layout.
 *
 *  first visit (signed-out) · hero row: featured carousel | live / next kick-offs | news column (wide screens) ·
 *  your favorites · next matches · our record | the sport's special card | latest results · news + Premium (smaller screens)
 */
export default function SportHome({ adapter: a }: { adapter: SportAdapter }) {
  const { access } = useAuth()
  const d = a.useData()
  useRevealState()
  return (
    <div className="max-w-7xl 2xl:max-w-[1760px] mx-auto px-4 sm:px-6 py-6 sm:py-8 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_360px] 2xl:gap-8 2xl:items-start">
      <div className="space-y-10 min-w-0">
        {a.banner && <div className="rounded-2xl border border-draw/30 bg-draw/10 px-4 py-2.5 text-sm text-ink">{a.banner}</div>}

        {access === 'anon' && <FirstVisit a={a.intro} stats={d.introStats} />}

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
          {d.featured.length > 1 ? <FeaturedCarousel games={d.featured} a={a} /> : !d.featured.length && !d.loaded
            ? <div className="rounded-[32px] border border-white/10 min-h-[360px] sm:min-h-[460px] bg-surface2/40 animate-pulse" />
            : <FeaturedHero g={d.featured[0] || null} a={a} />}
          <SideCard d={d} a={a} />
        </div>

        {d.favorites.length > 0 && (
          <Section title={tt("Your favorites")} action={<Link to={a.labels.favorites} className="text-sm font-bold text-accent">{tt("All favorites →")}</Link>}>
            <Rail games={d.favorites} />
          </Section>
        )}

        {d.next.length > 0 && (
          <Section title={a.labels.nextSection} action={<Link to={a.labels.all.to} className="text-sm font-bold text-accent">{a.labels.all.label}</Link>}>
            <Rail games={d.next} />
          </Section>
        )}

        <div className="grid gap-5 lg:grid-cols-3">
          <RecordCard r={d.record} />
          <SpecialCard s={d.special} />
          <ResultsCard r={d.results} />
        </div>

        <div className={`grid gap-5 ${d.full ? '2xl:hidden' : 'xl:grid-cols-[2.4fr_1fr] 2xl:grid-cols-1'}`}>
          <div className="2xl:hidden"><NewsBlock news={d.news} full={d.full} loading={a.labels.newsLoading} /></div>
          {!d.full && <PremiumCard text={a.labels.premiumText} />}
        </div>
      </div>

      <aside className="hidden 2xl:block sticky top-20">
        <NewsRail news={d.news} loading={a.labels.newsLoading} />
      </aside>
    </div>
  )
}
