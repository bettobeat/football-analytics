# SportLikely

Football match-prediction platform. Real fixtures, live scores and a statistical
outcome model for the big European leagues.

## What it does

- Upcoming fixtures for the next 30 days across 9 competitions
  (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League,
  Eredivisie, Primeira Liga, Championship) — served from memory, refreshed
  every 5 minutes.
- Live scores pushed to the browser over WebSocket (Socket.io).
- Match page: score & minute, goals / cards / substitutions, lineups and bench,
  match statistics (where the data provider has them), head-to-head history,
  league position and form for both teams.
- Prediction for every match: home / draw / away probabilities, expected goals,
  over 2.5, both-teams-to-score, most likely scorelines, and a confidence level.

## Prediction models

Two models run side by side; both are tracked so they can be compared.

**v2 — `dc-history-v2` (shown on the site when available)**
Dixon-Coles model fitted by maximum likelihood on three seasons of results from
football-data.co.uk (`backend/src/services/dixonColes.ts`, `historyModel.ts`).
Attack, defence, home advantage and the low-score correction are estimated per
country (top division + second division where available), with older matches
weighted down (half-life 180 days) and shrinkage toward average for teams with
little data. Refitted every 6 hours.

**v1 — `poisson-dc-v1` (fallback, e.g. Champions League)**
Poisson model driven by the current league table
(`backend/src/services/predictionModel.ts`).

## Tracking and backtesting

- Every refresh, each model's prediction for every upcoming match is saved to
  SQLite (`backend/data/bet-to-beat.sqlite`). At kick-off it is frozen; after the
  match the result is pulled and the prediction scored.
- `/accuracy` shows hit rate, Brier score, log loss, calibration, and flat-stake
  P/L at bookmaker odds for the live predictions and — in the Backtest tab — a
  walk-forward test over 2025-26 against Pinnacle closing and early odds.

## Stack

- **Backend**: Node.js, Express, TypeScript, Socket.io, Axios
- **Frontend**: React 18, Vite, TypeScript, TailwindCSS, socket.io-client
- **Data**: [Football-Data.org](https://www.football-data.org/) v4 API
- **Storage**: SQLite (Node's built-in `node:sqlite`, Node ≥ 22.13 / 24) — Postgres later if needed

## Running locally

```
# backend
cd backend
npm install
cp .env.example .env    # add FOOTBALL_DATA_API_KEY
npm run dev             # http://localhost:3001

# frontend
cd frontend
npm install
npm run dev             # http://localhost:3000 (proxies /api and /socket.io to :3001)
```

Backend `.env` options:

```
FOOTBALL_DATA_API_KEY=...
FOOTBALL_DATA_BASE_URL=https://api.football-data.org/v4
PORT=3001
COMPETITIONS=PL,PD,SA,BL1,FL1,CL,DED,PPL,ELC   # optional override
LIVE_POLL_MS=60000                             # live-score push interval
ODDS_API_KEY=...                               # the-odds-api.com key → market odds on every match
ODDS_DAILY_BUDGET=16                           # credits/day (free tier = 500/month); raise on a paid plan
ODDS_REGIONS=eu                                # bookmaker region(s); each region costs 1 credit per fetch
ODDS_BOOKMAKER=pinnacle                        # preferred book for the main line (else median of all books)
```

## Market odds

With `ODDS_API_KEY` set, the server pulls h2h odds from The Odds API for every competition:
a fetch every ~8 h in the two days before a match, and every ~75 min in the last two hours
(the closing line, which is what tracking stores). One fetch per competition costs one
credit, so a budget-aware scheduler (`backend/src/services/odds.ts`) stays inside the
daily budget and prioritises the big competitions. Odds are matched to fixtures by
kick-off time and team name, shown on every match card and match page (margin-free
probabilities and model-vs-market gap), and stored on the prediction at kick-off so the
Accuracy page can score the model against the market.

`GET /api/odds/status` shows credits and last fetch per competition;
`POST /api/odds/refresh?competition=PL` forces one fetch (1 credit).

## Deploying (Railway)

One container serves the API and the built site; the SQLite file lives on a
persistent volume so tracking survives restarts and redeploys.

1. Railway → **New Project → Deploy from GitHub repo** → pick this repo.
   The root `Dockerfile` and `railway.json` are picked up automatically
   (multi-stage build: `vite build` → `tsc` → Node 24 runtime).
2. **Variables** on the service:
   ```
   FOOTBALL_DATA_API_KEY=...
   DATA_DIR=/data
   ODDS_API_KEY=...        # optional, market odds
   ```
   (`NODE_ENV=production`, `PORT` and `STATIC_DIR` are set by the image.)
3. **Volume**: add one to the service, mount path `/data`.
4. **Settings → Networking → Generate Domain** (or attach your own; Railway
   gives you the CNAME). Health check is `/api/health`.

After the first boot the server syncs three seasons of history, fits model v2
and starts tracking — about a minute. Every `git push` to `main` redeploys.

Local production run (same as the container):

```
cd frontend && npx vite build
cd ../backend && npm run build && set NODE_ENV=production && node dist/index.js
```

## API

```
GET /api/matches/upcoming?days=30      fixtures + predictions
GET /api/matches/live                  matches in play
GET /api/matches/:id/details           match + prediction + h2h + standings + form
GET /api/matches/:id/head2head
GET /api/leagues
GET /api/leagues/:code/standings
GET /api/teams/:id
GET /api/health
GET /api/odds/status · POST /api/odds/refresh?competition=PL
GET /api/accuracy?days=90&competition=PL&model=dc-history-v2
GET /api/accuracy/recent · /api/accuracy/status · POST /api/accuracy/settle
GET /api/history/status · GET /api/history/teams · POST /api/history/sync
POST /api/backtest/run?season=2425[&group=E] · GET /api/backtest?season=2425[&group=E]
```

WebSocket events: `matches:live` (all live matches, every 60 s),
`match:live` (per match, after `subscribe_match`).
