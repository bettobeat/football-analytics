---
slug: how-it-works
title: How SportLikely's predictions work | SportLikely
description: What our model looks at before every football and basketball game, how it turns that into percentages, and how we test it in public.
related: double-chance, win-percentages
---
# How our predictions work

Before every game, our model rates both teams from data and turns those ratings into chances: who wins, whether there is a draw, how many goals or points. No opinions, no tips, the same method for every match.

## What the model looks at (football)

- **Squad strength**: the market value of each team's players, the strongest single signal we have.
- **Long-term strength**: a rating that moves after every result, adjusted for how strong the opponent was.
- **Attack and defence**: goals and expected goals (xG) scored and conceded, with recent games counting more.
- **The confirmed line-up**: about an hour before kick-off we recalculate with the players who actually start.
- **Injuries and suspensions**: weighted by how important the missing players are to their team.
- **Rest**: days since the last match and crowded schedules.
- **Home and away form**, and head-to-head as a small extra.

## What the model looks at (basketball)

Points scored and allowed per possession, pace, the quality of the players each team actually uses, home court, rest and back-to-back games, and the NBA injury report.

## From ratings to percentages

Each football match gets three percentages (home win, draw, away win) that add up to 100. From those come our double-chance pick (the two most likely results) and our goals numbers: over 2.5 goals and both teams to score. In basketball we give the winner's chance, the expected margin and the total points.

## A model that keeps learning

Every night the model is checked against the new results. A new version only replaces the current one if it is more accurate on matches it has never seen. If it isn't, nothing changes.

## Tested in public

Every prediction is saved before the game starts and never edited. After the final whistle we score it and count every match, not only the good ones.

## What it can't do

Sport is uncertain. A team we give 60% still fails to win four times in ten. News after the line-ups, a red card or a penalty can change any game. Our numbers are probabilities, not promises, and not advice to place money on anything. 18+.
