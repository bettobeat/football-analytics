# SportLikely — backlog and decisions (updated 13 Oct 2026)

Next free fix number: **fix112**. Keep this file current: when you ship something, move it to "Done" with its fix number.

## Now / next
- **Basketball launch (~18 Oct)**: set `BASKETBALL_PUBLIC=1`, change "basketball coming" wording. Before that, open `/api/bb/live-test?tune=1` (admin) to check the live win chance on all 18 leagues with bb-v3's own predictions (it was fitted on public NBA data; see basketball.md).
- **Self-learning loop** (Yarin, 13 Oct, after the basketball launch): nightly champion/challenger refit of v3 / elo-euro / bb-v3 on data up to 30 days ago, scored on the last 30 days (log loss + Brier, 300+ games), swap only when better; per-league settings drift weekly (`/api/model/v3/league-tune`); calibration watchdog per league and market; weekly "why did we miss" factor report; new-league verdict after 150 settled games. Everything logged in Admin with one-click rollback.
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
