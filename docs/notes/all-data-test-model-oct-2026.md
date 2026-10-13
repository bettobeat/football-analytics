# "All data" test model (13 Oct 2026) — built in Cowork on the DB copy of 10 Oct

## Setup
- Data: af_fixtures (21,589 finished games, 27 divisions, 2024→10 Oct 2026), history_matches (shots, corners, cards, referee, odds), af_lineups (all games), af_injuries, af_player_season (previous-season ratings/minutes/goals/age per player id), squad_values + squad_players (lineup value via playerKey), h2h.
- 43 pre-match features: Elo (margin-weighted, k×1.5 early season) + learned league home edge; EWMA (α 0.15) goals/xG/shots on target/shots/corners/yellow cards for and against; luck (goals − xG last 10); form 5; draw rate 20; home-only / away-only points; rest days, games in 14 days; league draw and home rates; H2H last 10; squad value log ratio; confirmed-XI value, previous-season rating, goals, minutes, age, unknown players; injuries count, injuries weighted by last-season minutes×rating, top scorers out; referee goals/cards/draw rate; season stage.
- Fit: multinomial logistic regression (standardised, C 0.5) and gradient-boosted trees, 50/50 blend. Train = 2024-25 + 2025-26 (17,325 games after an 8-game warm-up). Test = 894 games from 1 Sep 2026.

## Results (log loss / hit rate)
All 894 test games: market 1.007 / 50.6% · Elo+value only 1.029 · + ratings 1.024 · + lineup & injuries 1.018 · everything 1.020.
Same 739 games where v3 (live weights) has a prediction: v3 1.0320 / 47.9% · everything-model 1.0345 / 47.8% · market 1.0183 / 49.9% · v3 + everything 50/50: 1.0294 / 49.1%.
Published league picks matched (124 of 192): v3 1.0119 / 51.6% · new 1.0079 / 47.6% · market 1.0006 / 48.4% · 50/50 1.0050 / 52.4%.

## What carried the signal (permutation importance, logit)
Elo +0.014, squad value +0.012, H2H count +0.004, XI value +0.004, shots on target allowed +0.003, XI rating +0.002, xG for +0.002, XI goals +0.001, luck +0.001, injuries count +0.001. Zero: corners, cards, form, draw rates, rest/congestion, referee, league rates, XI minutes/age/unknowns, injury quality, shots total.

## Published picks vs bookmakers (192 league games)
Same pick as the bookmaker favourite in 154/192, both right 53% there. Disagreements 38: we 39.5%, book 36.8%. 51 of 192 were draws; we picked draw 3 times (0 right). Draw probabilities calibrated by band (22–26% → 24% real, 26–30 → 27%, 30–35 → 35%).

## Draw experiments — nothing beats the market on draws
- v3 vs bookmaker draw price on 10,224 games of 2026: where our draw % is above the implied price, real draws come in below both (edge +2–4 pp → 23% real vs our 28%; +4–6 → 20%; +6 → 16%).
- Draw-heavy teams: 69 teams with ≥4 draws (303 drawn games) — we picked draw in 2. Walk-forward rule "call draw when a team has 3+/5, 4+/8 … draws": hit rate drops in every version (47.2% → 43.5–46.6%); draw-prone teams go on to draw 26–29% vs 26% average.
- Feature sweep for draws (evenness, team draw rates, H2H draws, rest, cards/corners/referee, stacked binary draw model, decision rules): draw log loss 0.5695–0.5760 vs market 0.5683 (live) and 0.5721–0.5760 vs 0.5705 (all 2026). Every variant slightly worse than the market.
- Conclusion: with current data the draw cannot be predicted better than the bookmakers by re-weighting; only untested route is a real goals model.
