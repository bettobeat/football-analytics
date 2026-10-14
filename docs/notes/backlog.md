# SportLikely — backlog and decisions (updated 13 Oct 2026)

Next free fix number: **fix119**.

**Accuracy pages hidden from public on 14 Oct, Yarin's decision, until redesigned** (`/accuracy`, `/basketball/accuracy`: admins only, non-admins go to the sport's home; no nav tabs or record links for visitors; noindex, out of the sitemap; `/api/accuracy*` and `/api/public/record` still work). Keep this file current: when you ship something, move it to "Done" with its fix number.

## Now / next
- **Basketball launch (~18 Oct)**: set `BASKETBALL_PUBLIC=1`, change "basketball coming" wording. Before that, open `/api/bb/live-test?tune=1` (admin) to check the live win chance on all 18 leagues with bb-v3's own predictions (it was fitted on public NBA data; see basketball.md).
- **v3-mix check on the server** (fix113 is in shadow): open `/api/admin/v3-mix?backtest=1` (and run a 2627 grid-v3 backtest for the second comparison). If v3-mix ≤ v3, leave `mix_mode` on auto (the daily job publishes it once both 60-day windows pass) or set `?mode=on`. Watch the first 07:00 reports. Basketball self-learning: not built (Yarin asked football first).
- **Weekly automated review** (scheduled task): site, model, data health, error log, unsettled games, leagues in testing → report + safe fixes pushed.
- **3-day free trial** on every paid plan (decided 13 Oct) — built with payments (checkout trial in the provider), Plans page badge "3 days free", "Trial ends <date>" in Account, reminder email a day before, one trial per account.
- **Payments before the company exists** (discussed 11 Oct): Lemon Squeezy preferred (ask them in writing: predictions/stats for fans, no betting, no odds). Then wire the webhook (`setPlan(userId, plan, until, 'payment', amount)`) and remove `BILLING_TEST_MODE`. Paddle bans betting-related products; PayPal Israel weak for subscriptions.
- **Pictures for every player and team** (MUST FIX, Yarin 9 Oct): basketball player photos don't exist in API-Basketball/balldontlie; NBA headshots on cdn.nba.com need a licence (don't hotlink). 10 of 242 basketball team logos missing at API-Sports. Need a licensed source.
- AI support chat on the site (reuses `services/assistant.ts`, needs `ANTHROPIC_API_KEY`; estimate cost first).
- DMARC `p=reject` in early Nov (currently `p=quarantine`; edit the existing `_dmarc` TXT record in Spaceship, never add a second). Then BIMI.

## Known issues / to check
- Data health: 1 game past kick-off + 4 h not settled (13 Oct). Daily data check 94.6% (target ~97%).
- "Team page →" link under Man City on the match page opened "We couldn't find this team yet" (13 Oct) — team id / link issue to check.
- Railway region: requests take ~210 ms; EU West may be faster (back up first).
- Native-speaker review of the six translations.
- Search Console sitemap status; next international break: check the national-team H2H row.
- Draw picks: review the record at ~30 picks. Upset watch: raise the threshold to 32% if it keeps under-delivering.
- Model ideas: relegated clubs overrated (squad value ranked within the division) → absolute scale; add League Two / SC2 history; goals model from shots/xG; "Best bet" per match.

## Done (newest first)
- fix118 (14 Oct): record pages admin-only (`RecordGate`, `RecordLink` in App.tsx / components); double chance leads: `publicRecord().doubleChance.bands` (90%+, 80–90, 70–80) and `/api/public/summary.doubleChance`; Home hero cards "X% right · double chance" and "X% when we're 90%+ sure · double chance" (80%+ when the 90%+ band has < 30 games); "Double chance · 1X · 78%" chip on the match page prediction card and the featured carousel (`DoubleChanceChip`); AccuracySimple shows the safer calls first with the new bands.
- fix117 (13 Oct): privacy page credits the country data actually in use (`geoCredit()`, public `/api/public/geo-source`): DB-IP (CC BY 4.0) normally, iptoasn.com (public domain) when that one is loaded; DB-IP is the fallback text if the call fails.
- fix116 (13 Oct): visitor countries — `geo.ts` checks every download (gzip / text / web page → error, broken gzip → error), reads CSV or TSV, sorts ranges; sources in order: DB-IP monthly (this, last month) → DB-IP via jsDelivr (v4 + v6 CSV) → iptoasn.com ip2country (public domain); saved data replaced only after a good read; source in `DATA_DIR/geo/source.txt`; retry hourly while nothing is loaded. After deploy: Railway log "geo: country data from … loaded".
- fix115 (13 Oct): one live score everywhere (`liveScores.ts`): every Football-Data.org match shows the fresher of API-Football / Football-Data.org (AF when finished or ≤ 2 min old, unless FD says finished and is newer) in the list, the live push and the match page; live loop every 20 s (FD fresh every 3rd tick, AF live=all every tick while games are on). Check during live games: `/api/admin/live-book`.
- fix114 (13 Oct): sticky bars transparent at rest, frosted (`bg-bg/85 backdrop-blur-xl`) only while pinned (`lib/useStuck.ts`, `components/StickyBar.tsx`): day titles (football + basketball `SectionTitle`), match/game page tab bars; leagues sheet header solid `bg-surface`. Checked at 375 / 1440 px: no band at rest, frosted while rows scroll under.
- fix113 (13 Oct): feature model (`featureModel.ts`, feat-v1: logit + boosted trees on Elo, xG/goals/shots EWMA, luck, home/away points, squad + XI value, XI ratings, injuries) and v3-mix (50/50 with grid-v3, league games only), in shadow until it passes; daily champion / challenger at 04:00 UTC with guardrail rollback (`modelDaily.ts`, `model_daily`, Admin card, `/api/admin/model-daily`); 07:00 Israel-time morning report email. Research notes copied in: `all-data-test-model-oct-2026.md`, `model-sweep-oct-2026.md`.
- fix112 (13 Oct): news headlines and summaries never cut (no line-clamp on Home lead/rows, the wide-screen news rail, `NewsList.tsx`, League page); news rail items `shrink-0` so the column scrolls instead of squeezing the lead story; news deduped by headline (lowercase, no punctuation/spaces) in `news.ts` `newsFor`, keeping the copy with a picture; Home hero and its side card lose the lime frame (`border-line/40`). Checked dark + light at 375 / 1440 / 1700 px.
- fix111 (13 Oct): sticky bars translucent + blurred, no black stripe over the dark stage gradient: day titles (`SectionTitle` in `Dashboard.tsx` and `bb/parts.tsx`) `bg-bg/35 backdrop-blur-lg`, match/game page tab bars `bg-bg/35`, leagues sheet header `bg-bg/40`; site header kept at `bg-bg/70` (its bottom border hides the edge). Checked dark + light at 375 / 1440 px.
- fix110 (13 Oct): basketball live win chance (`bbLive.ts`): live win % + projected final score on the game page, game rows, live boxes, basketball home and a new "Live now" card on league pages; from the tip-off prediction, the score and the time left. NBA quarter test (2,495 games out of sample): log loss after Q1 / Q2 / Q3 0.567 / 0.488 / 0.358, 70 / 76 / 84% right, calibrated. Admin test on every league: `/api/bb/live-test?tune=1`.
- fix109 (13 Oct): Champions League clubs matched to API-Football ratings (`clubElo.matchFdTeam`); clubs without a squad value count as €12m; n<2 instead of n<8 → no more v1 fallback for CL games. Out-of-sample 705 cup games: log loss 0.958 → 0.952, hit 56.2 → 58.4%. Phone: accessibility + feedback buttons shrunk.
- fix108 (13 Oct): basketball leagues from Admin (`bbLeagueConfig.ts`, `bbLeagueCoverage.ts`, routes `/api/admin/bb-league-coverage`, `/api/admin/bb-extra-leagues`); `LeaguesCard sport="basketball"`.
- fix107 (13 Oct): featured-match carousel on Home (up to 6 big games of the next 7 days, swipe/arrows/dots, auto-advance 8 s); match page header stacked on phones.
- fix106 (13 Oct): football leagues from Admin (`leagueConfig.ts`, `leagueCoverage.ts`; each added league = v3 group `AF<id>` with history from API-Football fixtures, in testing by default; routes `/api/admin/league-coverage`, `/api/admin/extra-leagues`). `lib/leagueCountry.ts` flags for ~80 more countries.
- fix105 (12 Oct): "Your picks" for every account (winner / O-U 2.5 / BTTS; basketball winner + points line) with `/my-picks` personal record; `userPicks.ts`, `YourPicks.tsx`, `MyPicks.tsx`.
- fix101–104 (12 Oct): faster loading (lazy pages, 1-year asset cache), player stats refresh after games, H2H crash fix + page safety net, site error reports (Admin → Site errors).
- fix99–100 (11 Oct): basketball result checks (`bbResults.ts`), YouTube embed Referrer-Policy.
- fix83–98 (10–11 Oct): highlights tab, staff console + 2FA, daily backups (backups.md), beta testers, staff activity log, visitor countries, league page live box, suspended/postponed states, model test tools, per-competition record (admin).
- 9–10 Oct: privacy policy + account data export/delete, SEO (sitemap ~1,077 URLs), record page with calibration, live win chance (half-time test log loss 1.003 → 0.824), upset watch (Pro), contact form, business email, two-step login, security log, CRM with roles.
- 6–8 Oct: rename to SportLikely, 7 languages, accessibility, v3 full tune, v2 hidden, match page tabs, favorites, Flashscore-style lists, basketball site (18 leagues, bb-v3), balldontlie NBA data, 15 football leagues in testing.

## Launch checklist
- Company (Cyprus) + bank account + D-U-N-S; Apple Developer ($99/yr) and Google Play ($25) accounts.
- Payments live, `BILLING_TEST_MODE` removed, `PREMIUM_UNLOCKS` back to 60 if lowered.
- iPhone app (Capacitor + TestFlight), push notifications.
- Legal review; `OPERATOR` name/address in `Legal.tsx`.
- Beta testers (20–50): invite system ready.
- Every player and team has a picture. Logo next to emails (BIMI).

## After launch
- Tennis, then UFC. Marketing: football creators with codes + revenue share; the public record as weekly content.
