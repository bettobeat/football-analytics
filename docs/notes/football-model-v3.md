# Football model v3 (grid-v3) — what was tuned, tested and rejected

Code: `backend/src/services/gridModel.ts` (rows, `CONV`, `buildState`, `scoreMatch`, backtests, sweeps),
`v3Tuner.ts` (full tune), `h2hGuard.ts` (common-sense check), `squadValues.ts`, `apiFootball.ts` (lineups/injuries/xG),
`history.ts` (3 seasons of results per group, `GROUPS`), `trial.ts` (leagues in testing).
Admin endpoints: `/api/model/v3/status`, `/api/backtest/run`, `/api/backtest/sweep`, `/api/model/v3/tune`,
`/api/model/v3/league-tune`, `/api/model/v3/tuned`, `/api/model/goals-calibration`.
Rule for every change: accepted only if log loss / Brier improve on games the fit never saw (walk-forward, later seasons).

## Full tune (6 Oct 2026) — live
- Train 2024-25 + 2025-26 (8,005 games, 12 live divisions), test 2026-27 (652 games). Test log loss 0.9913 → 0.9794
  (market 0.9775), Brier 0.592 → 0.585 (market 0.583), hit 49.2 → 50.2 (market 50.5). Gap to the market 0.014 → 0.002.
- Shared row weights live: Squad value 12.25 · Missing players 4.25 (frozen) · Confirmed XI 7.5 · Elo 7.25 · Attack 2.875 ·
  Defence 3.25 · Freshness 4.125 · Home/away record 1.875 · H2H 1.125 · Form 0 · Draw-prone 0.75 · League draw rate 0 · Derby 0.
- Conv: gapScale 0.22, homeGap 0.079, drawPoisScale 0.938, drawStretch 0.575, drawGapK 0.106, drawClose 80, gapCube 0.5,
  floorOutsider 28.75, floorDraw 120, drawCap standard 400 / even 340 / big 340, kDraw 1. Stored in `v3_tuned`.
- State knobs all within ±0.001 (half-lives, eloK, valueSpread, xgBlend, injK, xiK…) — nothing worth changing.
- Goals markets: O2.5 log loss 0.687, BTTS 0.690, hit 56.5 / 54.4% — weak but calibrated (GOAL_SCALE 1.05). A shots/xG goals
  model is the next candidate (gap ~0.01–0.02).

## Per-league settings (25 Sep 2026) — live for 5 divisions
- `v3_league_conv` per division (draw points, home gap, stretch, cube, close-game draw), fitted on 2024-25, kept only if it
  beats the shared model on 2025-26. Passed: E1, I2, N1, P1, SP1. Failed (shared model): E0, D1, F1, I1, B1, T1, G1, SC0, SC1,
  D2, F2, SP2. Lesson: league-level differences are mostly captured already; the market's edge is team-level information.

## Common-sense check + H2H archive (9 Oct 2026) — live
- Trigger: Málaga (last) 37% vs Espanyol. Live: `h2hArchive: 1` (10 seasons of football-data.co.uk in `h2h_archive`,
  H2H row only), `poisBlend: 0.25` (25% of the expected-goals 1X2 mixed in), guard `guardPts: 8, guardUsePpg: 1,
  guardH2H: 0.2, guardMargin: 20`: a team the rows rate weaker AND ≥8 pts behind over its last 10 (or ≤20% of H2H points
  in ≥5 meetings) can't be the favourite; reasons say so. Lower home advantage was worse — keep it.
- Yarin's principle: picks must make sense when someone looks at the stats, even when the record gain is small.

## Squad values, lineups, player quality (25–26 Sep 2026)
- Squad value (row #1) weight kept at 10 after sweeps (lower was worse on both seasons). Floor: every club ≥ half its division
  median (`squadFloorRatio 0.5`), floored values shown with "~". No manual entry of values (Yarin).
- Rows #12 confirmed XI and #13 injuries confirmed useful in top leagues (log loss 0.985 → 0.983). `xiNet` (replacements)
  tested, no gain, off. Player-quality row #1p (minutes-weighted strength from API-Football player seasons) tested: no gain,
  off (Elo already carries it).
- Lineups complete for E0, SP1, I1, D1, F1, N1, P1 from 2024-25; second divisions have no injuries this season in
  API-Football (D2, F2, I2, SP2, SC0, SC1).

## Weak leagues check (10 Oct 2026)
- Championship / second divisions trail the bookmakers by 2–6 hit-rate points and 15–21 Brier points (top divisions 7–12);
  the market itself only hits 46–48% there. Nothing broken.
- Relegated clubs in their first season are the worst slice (we make them 60–69% favourites, they win 48%). Tried squad-value
  multipliers/caps/Elo entry percentiles: no overall gain; knobs `relegSquadMult`, `relegSquadCap`, `relegSquadGames` left off.
  Promoted clubs are fine. Ideas: absolute (log) squad scale, League Two / SC2 history for promoted clubs.
- Row on/off sweeps per country: no single row moves Brier by more than ±1 point except squad value in Germany.

## 15 leagues in testing (7 Oct 2026) — `TRIAL_COMPETITIONS`
- 2. Bundesliga AF79, Serie B AF136, LaLiga 2 AF141, Ligue 2 AF62, Scottish Championship AF180, League One AF41, Brazil AF71,
  Argentina AF128, MLS AF253, Liga MX AF262, J1 AF98, Denmark AF119, Poland AF106, Norway AF103, Sweden AF113. Decision:
  keep all, improve the weak ones. Calendar-year leagues use `seasonForDivision` (2026 → "2627").
- Brier gap to closing odds ×1000: Scottish Championship 2.7, Argentina 8.2, Japan 9.7, Poland 11.4 (close to top leagues);
  2. Bundesliga 14.8, MLS 15.4, Liga MX 15.9, Ligue 2 16.7; League One 18.7, LaLiga 2 19.4, Brazil 19.4, Serie B 21.2,
  Denmark 21.7, Sweden 22.7, Norway 33.3. Candidates to make public: SC1, ARG, JPN, POL (pending Yarin).
- Leagues added later from Admin → Football leagues use the same mechanism (code `AF<id>`, group of their own, history from
  API-Football fixtures, no odds).

## Draw picks / upset watch
- Draw picks rule (`drawAlerts.ts`): v3 draw ≥ 30%, anchored mkt + 0.75×(v3−mkt), edge 2–20%, not La Liga, skip when both
  teams drew 32%+ of last 20. Backtests 2024-26: ~31% draws, +7–8 ROI; 2026-27 start was variance. Review at ~100 alerts.
- Upset alerts vs the market failed the backtest (best of 228 rules not above noise). Live instead: model-only **Upset watch**
  (Pro): underdog ≥ 30% and favourite leads by ≥ 10 points; calibration said 30.9%, happened 28.7% (635 games).
- Bookmaker odds are used only to measure the model (admin) — never shown, never an input.

## UEFA cups (`clubElo.ts`, elo-euro) and national teams (`nationalElo.ts`, elo-intl)
- elo-euro: Elo over domestic (af_fixtures) + cup results, seeded from squad value; grid engine (Elo, squad value, goals,
  form, rest, home, per-cup draw threshold) refitted on every build and auto-selected by out-of-sample log loss.
  13 Oct 2026: Football-Data.org CL team names are matched to API-Football clubs in `matchFdTeam` (exact → club words →
  fuzzy ≥ 0.6); clubs with no squad value count as €12m (`MISSING_VALUE`); clubs with ≥2 games get a (low-confidence)
  number instead of the v1 fallback. Test (705 cup games): log loss 0.952, hit 58.4%.
- elo-intl: 8,864 internationals since 2014; grid (Elo gap, squad value, goal ratings, form, rest, home by kind, friendly
  scale); 2-year test log loss 0.852, hit 61%. Goals weight kept as fitted (Yarin's decision, 27 Sep).

## Live win chance (`liveChance.ts`)
- Half-time test on 10,650 games: log loss 1.003 → 0.824, hit 49.7 → 61.4%, well calibrated. Basketball needs the same.
