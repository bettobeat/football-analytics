# NFL model nfl-v1 (fix139, 16 Oct 2026) + college ncaa-v1 (fix142)

## ncaa-v1 (fix142, college football, league 2)

Same code (`nflModel.ts`, every function takes the league), own settings tuned on college games only, stored under `model2|params` / `model2|report`. NFL settings got the new knobs fixed at the old behaviour (reg 1/3 to 1500, fcs 0, movCap 99) — the NFL walk-forward report is byte-identical to fix139 on the test data.

- **Regression between seasons**: toward the mean Elo of the team's conference (tuned share `reg`, grid 0.1–0.6), not toward 1500.
- **FCS teams** (and teams we have no row for) start `fcs` Elo below 1500 (grid 100–500).
- **Blowouts**: the margin multiplier is capped at `movCap` (grid 1.8–3.0, 99 = no cap).
- **Home field**: grids 40–130 (before 2020) / 30–120 (from 2020) — college home field is expected bigger than the NFL.
- **Neutral sites**: the venue name does not match the home team's stadium (bowls, kickoff games); without a stadium, post-season = neutral.
- **Rest / bye**, QB and efficiency: same as the NFL, only where box scores exist (last 3 seasons); the blend is kept only if it lowers the test log loss.
- **Report**: per season all games and FBS vs FBS (`seasons[].fbsOnly`, `fbs` total), baselines (home team, better record, Elo only), calibration. `GET /api/admin/nfl-model?league=2` (`&rebuild=1`).
- **Strong pick**: 75%+ (college has more mismatches).
- Test on a fake 40-team league (24 FBS / 16 FCS, 7 seasons, hidden strengths): hit 71%, LL 0.555 all games, 64.7% / 0.628 FBS vs FBS; home team baseline 64.7% / 0.653. Says only that the pipeline learns; the real numbers come from the server.


Code: `backend/src/services/nflModel.ts`. Data: `services/nfl.ts` tables (nfl_games, nfl_team_stats, nfl_player_stats, nfl_injuries). No odds anywhere.

## What it is
- **A. Elo** (538 style): start 1500, K tuned, margin-of-victory multiplier ln(|m|+1) × 2.2 / (0.001 × winner's Elo gap + 2.2),
  1/3 back to 1500 between seasons, home field tuned separately before 2020 and from 2020, rest: bye week (≥ 12.5 days) +,
  short week (≤ 5.5 days) − (both tuned), neutral site (international venues, Super Bowl) = no home field.
- **B. QB**: starter = most pass attempts in the game. QB value = rolling ANY/A ((yds + 20·TD − 45·INT − sack yds) / (att + sacks)),
  decayed 0.985 per game, shrunk (200 attempts) toward a replacement level 0.7 below the league mean (most low-sample passers are
  backups). Usual starter = most attempts over the team's recent games (older games × 0.75), so a backup becomes "usual" after
  2–3 starts. When this game's starter ≠ usual starter: Elo ± qbW × value gap (qbW tuned). Upcoming games: the usual starter
  unless the injury report has him Out / Doubtful / IR → the team's next QB by attempts this season. Inactives: the provider has
  no inactives list, so only the injury report is used.
- **C. Efficiency** (games with box scores): exp-weighted (0.15) yards per play for / against, turnovers given / taken,
  third-down %, red-zone %, sacks.
- **D. Blend**: standardised logistic on [A+B Elo gap, efficiency gaps], fitted on the training seasons only. Used only if the
  walk-forward test log loss beats A+B by 0.0005+; else A+B.
- Outputs: pHome (ties ≈ 0), expected margin (Elo gap / 25, or from the blend's p), expected total (points for / against
  ratings + league average, rate `alpha` tuned on total MAE). Strong pick = 70%+.

## Test (never on fitting data)
Each of the last 5 seasons (≥ 30 finished games, first season = warm-up): settings tuned on all earlier seasons only, then that
season predicted game by game (ratings update after each game, as live). Report per season + total: games, hit %, log loss,
Brier, margin MAE, total MAE, calibration bins 50-60/60-70/70-80/80+, baselines home team / better record / Elo only.
One log line per season: `nfl-v1 2024: hit …% LL … over … games (home …%, Elo …%) · with efficiency: …`, then a total line
saying which version is kept. `GET /api/admin/nfl-model` (admin) = the full report; `?rebuild=1` re-tunes in the background.

**Real numbers: not known yet.** The server holds the data; locally only a synthetic league was available (32 teams, 2016–2026,
built-in QB / efficiency effects). On it: A+B LL 0.6466 / hit 61.4%, with efficiency 0.6351 / 63.5% → D kept; home team 59.1%,
better record 59.3%. Those numbers only show the pipeline works — open `/api/admin/nfl-model` after the box-score backfill.

## Live
- Settings re-tuned every Tuesday (or when > 8 days old / missing; needs ≥ 200 finished games) from the NFL scheduler tick.
- Ratings replay from the stored settings whenever a game has finished (≈ 50 ms).
- Predictions of the next 9 days saved in `nfl_predictions` every 30-min tick (after the injury report) and after each final;
  frozen at kick-off (only `kickoff > now` rows are rewritten; shown only when made_at ≤ kickoff).
- Box-score backfill: last 10 seasons, newest first, 150 games (300 calls) per 30-min tick, daily reserve kept.

## Who sees what
Paid plans: numbers + why before kick-off. Free / signed-out: locked (no pick) until full time, then the numbers and ✓/✗.
Team page model tiles (Elo + rank, QB value, attack / defence ratings, next game win %): paid. Our record on a team: admins.
Backtest: admins only. NFL itself stays admin-only until `NFL_PUBLIC=1`.

## To check on the server
1. Box scores arriving for old seasons (Admin → NFL data / log "NFL box scores: n").
2. `passersOf` finds the Passing group (field names guessed: comp/att, yards, touch downs, interceptions, sacks "n-yds").
   If `data.withQb` in the report is 0, the names differ → fix the regexes.
3. The report: keep D only if it beats A+B; does qbW tune above 0? (On synthetic data the QB effect was small.)
