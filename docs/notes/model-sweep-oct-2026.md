# Model sweep (13 Oct 2026) — 42 variants of the feature model, out of sample

Scored on the live period (894 games since 1 Sep 2026, trained on 2024-25 + 2025-26) and on all of 2026 (6,125 games, trained on 2024-02 → 2025-12). Bookmakers: live 1.0072 / 50.6%, all-2026 1.0036 / 50.6%. v3 live weights on its 739 live-period games: 1.0320 / 47.9%.

## What was varied (log loss on all 2026)
- Rating speed: Elo K 12/20/30, EWMA α 0.08/0.15/0.25, early-season factor 1.0/1.5/2.5, margin multiplier on/off → 1.0172–1.0179. All within noise.
- Feature sets: strength only 1.0216 · + ratings 1.0200 · + XI/injuries 1.0189 · core 1.0172 · core + all extras 1.0191. Removing squad value costs 0.0026, Elo 0.0025, lineup value 0.0005, xG 0.0003.
- Training window 1 season 1.0195 / 2 seasons 1.0172 / all 1.0169. Recency weights (half-life 180/365/730 d): no effect. Regularisation C 0.02–5: identical. Trees alone 1.0182–1.0207. Per-division models: worse (1.0287). Stage interactions, parallel rating speeds, temperature scaling: no effect.
- Ensembles: logit + trees 50/50 → 1.0155 (live 1.0178); logit + trees + extras-logit → 1.0154 (live 1.0177). Best of everything.

## Against v3 and the market
Best ensemble on v3's 739 games: 1.0319 vs v3 1.0320 (tie). v3 + ensemble 50/50: 1.0283 (−0.004 vs v3, ≈ +1 pp hit). Gap to the bookmakers: 1.0154 vs 1.0036 on 6,125 games (≈ 49.5% vs 50.6% picks). No setting closes it.

## Conclusion
The 1X2 model is at its data limit. Parameter tuning is done; the measurable improvement left is the ensemble + blending with v3 (= v3-mix). Further gains need new information (lineup-time re-pricing, faster injury source, a goals/xG model), not tuning.
