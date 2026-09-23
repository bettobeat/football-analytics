import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Server } from 'socket.io';
import http from 'http';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import logger from './utils/logger';

// Load .env from backend root (in production the host injects env vars and there is no file)
const envResult = dotenv.config();
if (envResult.error && process.env.NODE_ENV !== 'production') {
  console.error('❌ Error loading .env:', envResult.error.message);
}
console.log('API Key:', process.env.FOOTBALL_DATA_API_KEY ? '✅ SET' : '❌ NOT SET');

// Import after env is loaded
import footballDataAPI from './services/footballDataAPI';
import { recordPredictions, settlePending, accuracy, recentSettled, trackingStatus, computeMetrics } from './services/tracking';
import { historyStatus, teamMapStatus, GROUPS } from './services/history';
import { modelV2Status, runBacktest, runBacktestAll, backtestProgress, backtestRows, backtestRunsList } from './services/historyModel';
import { oddsTick, oddsStatus, fetchCompetitionOdds, SPORT_KEYS } from './services/odds';
import { MODEL_V3, modelV3Status, runBacktestV3, runBacktestV3All, backtestProgressV3, prepareModelV3, CONV } from './services/gridModel';

const isDev = (process.env.NODE_ENV || 'development') !== 'production';

// In development accept any local origin (Vite may switch ports, 127.0.0.1 vs localhost, etc.)
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim());
const corsOrigin = isDev ? true : allowedOrigins;

// Private beta credentials (see the gate below); empty password = open site
const SITE_USER = process.env.SITE_USER || '';
const SITE_PASSWORD = process.env.SITE_PASSWORD || '';
const SITE_AUTH = SITE_PASSWORD ? 'Basic ' + Buffer.from(`${SITE_USER}:${SITE_PASSWORD}`).toString('base64') : '';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  // Socket.io bypasses Express middleware, so the gate is applied here too
  allowRequest: (req, cb) => cb(null, !SITE_AUTH || req.headers.authorization === SITE_AUTH)
});

// Middleware (CSP off: the site loads Google Fonts and club crests from other hosts)
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});

// ---------- Private beta gate ----------
// Set SITE_USER + SITE_PASSWORD (e.g. on Railway) and the whole site — pages and API — asks for them.
// Uses the browser's own login prompt, so it works on phones and is remembered per device.
// Health check stays open so the host can monitor the service. Unset = open site (local dev).
if (SITE_PASSWORD) {
  app.use((req, res, next) => {
    if (req.path === '/api/health') return next();
    if (req.headers.authorization === SITE_AUTH) return next();
    res.set('WWW-Authenticate', 'Basic realm="Bet To Beat - private beta", charset="UTF-8"');
    res.status(401).send('Private beta. Sign in to continue.');
  });
  logger.info('Private beta gate enabled (SITE_USER / SITE_PASSWORD)');
}

function sendError(res: express.Response, error: any, fallback: string) {
  const status = error?.response?.status || 500;
  const message = error?.response?.data?.message || error?.message || fallback;
  logger.error(fallback, { status, message });
  res.status(status).json({ error: fallback, message });
}

// ---------- REST ----------

app.get('/api/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// Upcoming + live matches. ?days=30 (1-30). Served from memory.
app.get('/api/matches/upcoming', async (req, res) => {
  try {
    const days = parseInt(String(req.query.days || '30'), 10) || 30;
    const matches = footballDataAPI.withPredictions(await footballDataAPI.getUpcomingMatches(days));
    res.json({
      data: matches,
      count: matches.length,
      days,
      cacheAgeMs: footballDataAPI.windowAge,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch upcoming matches');
  }
});

app.get('/api/matches/live', async (_req, res) => {
  try {
    const matches = footballDataAPI.withPredictions(await footballDataAPI.getLiveMatches());
    res.json({ data: matches, count: matches.length, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch live matches');
  }
});

app.get('/api/matches/:id(\\d+)', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const match = await footballDataAPI.getMatch(id);
    res.json({ data: match, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch match');
  }
});

// Everything for the match page: match + events + lineups + stats + h2h + standings + form
app.get('/api/matches/:id(\\d+)/details', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const details = await footballDataAPI.getMatchDetails(id);
    res.json({ data: details, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch match details');
  }
});

app.get('/api/matches/:id(\\d+)/head2head', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const h2h = await footballDataAPI.getHeadToHead(id);
    res.json({ data: h2h, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch head-to-head');
  }
});

app.get('/api/leagues', async (_req, res) => {
  try {
    const leagues = await footballDataAPI.getLeagues();
    res.json({ data: leagues, count: leagues.length, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch leagues');
  }
});

app.get('/api/leagues/:code/standings', async (req, res) => {
  try {
    const standings = await footballDataAPI.getStandings(req.params.code.toUpperCase());
    res.json({ data: standings, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch standings');
  }
});

app.get('/api/leagues/:code/scorers', async (req, res) => {
  try {
    const limit = parseInt(String(req.query.limit || '40'), 10) || 40;
    const scorers = await footballDataAPI.getScorers(req.params.code.toUpperCase(), limit);
    res.json({ data: scorers, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch scorers');
  }
});

app.get('/api/teams/:id(\\d+)', async (req, res) => {
  try {
    const team = await footballDataAPI.getTeam(parseInt(req.params.id, 10));
    res.json({ data: team, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch team');
  }
});

// ---------- Market odds (The Odds API) ----------

app.get('/api/odds/status', (_req, res) => {
  try {
    res.json({ data: oddsStatus(), timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to read odds status');
  }
});

// Manual fetch for one competition (costs 1 credit) — handy for testing the matching
app.post('/api/odds/refresh', async (req, res) => {
  try {
    const code = String(req.query.competition || '').toUpperCase();
    if (!SPORT_KEYS[code]) return res.status(400).json({ error: `Unknown competition. One of: ${Object.keys(SPORT_KEYS).join(', ')}` });
    const fixtures = (await footballDataAPI.getUpcomingMatches(30)).filter(m => m.competition?.code === code);
    const result = await fetchCompetitionOdds(code, fixtures);
    res.json({ data: { ...result, fixtures: fixtures.length, status: oddsStatus() }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Odds refresh failed');
  }
});

// ---------- Prediction tracking / accuracy ----------

app.get('/api/accuracy', (req, res) => {
  try {
    const days = parseInt(String(req.query.days || '90'), 10) || 90;
    const competition = req.query.competition ? String(req.query.competition).toUpperCase() : undefined;
    const model = req.query.model ? String(req.query.model) : undefined;
    res.json({ data: accuracy(days, competition, model), timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to compute accuracy');
  }
});

app.get('/api/accuracy/recent', (req, res) => {
  try {
    const days = parseInt(String(req.query.days || '90'), 10) || 90;
    const competition = req.query.competition ? String(req.query.competition).toUpperCase() : undefined;
    const limit = parseInt(String(req.query.limit || '100'), 10) || 100;
    const model = req.query.model ? String(req.query.model) : undefined;
    res.json({ data: recentSettled(days, competition, limit, model), timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to list settled predictions');
  }
});

app.get('/api/accuracy/status', (_req, res) => {
  try {
    res.json({ data: trackingStatus(), timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to read tracking status');
  }
});

// Manually trigger settlement (handy for testing)
app.post('/api/accuracy/settle', async (_req, res) => {
  try {
    const result = await settlePending((from, to) => footballDataAPI.getMatchesInRange(from, to));
    res.json({ data: result, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Settlement failed');
  }
});

// ---------- History data, model v2, backtests ----------

app.get('/api/history/status', (_req, res) => {
  try {
    res.json({ data: { history: historyStatus(), model: modelV2Status(), modelV3: modelV3Status(), groups: GROUPS }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to read history status');
  }
});

app.get('/api/history/teams', (_req, res) => {
  try {
    res.json({ data: teamMapStatus(), timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to read team map');
  }
});

// Re-download history and refit (force)
app.post('/api/history/sync', async (_req, res) => {
  try {
    const r = await footballDataAPI.prepareHistoryModel(true);
    res.json({ data: r, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'History sync failed');
  }
});

// Model v3 (grid): rebuild state now, or read its configuration
app.post('/api/model/v3/rebuild', (_req, res) => {
  try {
    res.json({ data: { groups: prepareModelV3(), status: modelV3Status() }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Model v3 rebuild failed');
  }
});
app.get('/api/model/v3/status', (_req, res) => {
  res.json({ data: modelV3Status(), timestamp: new Date().toISOString() });
});

// Start a walk-forward backtest (runs in the background).
// ?season=2526&group=E (group optional = all) &model=dc-history-v2|grid-v3
// For grid-v3, conversion constants can be overridden for calibration: &gapScale=0.05&kDraw=1.5&drawBase.big=240 …
const runBacktestHandler = (req: express.Request, res: express.Response) => {
  const season = String(req.query.season || '2526');
  const group = req.query.group ? String(req.query.group).toUpperCase() : undefined;
  const model = String(req.query.model || 'dc-history-v2');
  if (backtestProgress() || backtestProgressV3()) {
    res.status(409).json({ error: 'A backtest is already running', progress: backtestProgress() || backtestProgressV3() });
    return;
  }
  let job: Promise<any>;
  if (model === MODEL_V3) {
    const conv: any = {};
    for (const [k, v] of Object.entries(req.query)) {
      if (['season', 'group', 'model'].includes(k)) continue;
      const num = parseFloat(String(v));
      if (!Number.isFinite(num)) continue;
      const [a, b] = k.split('.');
      if (b) conv[a] = { ...((CONV as any)[a] || {}), ...(conv[a] || {}), [b]: num };
      else conv[a] = num;
    }
    job = group ? runBacktestV3(season, group, conv) : runBacktestV3All(season, conv);
  } else {
    job = group ? runBacktest(season, group) : runBacktestAll(season);
  }
  job.catch(err => logger.error('Backtest failed', { message: err.message }));
  res.json({ data: { started: true, season, group: group || 'ALL', model }, timestamp: new Date().toISOString() });
};
app.post('/api/backtest/run', runBacktestHandler);
app.get('/api/backtest/run', runBacktestHandler); // GET alias so a run can be started from a browser tab

app.get('/api/backtest/progress', (_req, res) => {
  res.json({ data: backtestProgress() || backtestProgressV3(), timestamp: new Date().toISOString() });
});

// Backtest results. ?season=2425&group=E&minEvidence=0
app.get('/api/backtest', (req, res) => {
  try {
    const season = String(req.query.season || '2425');
    const group = req.query.group ? String(req.query.group).toUpperCase() : undefined;
    const minEvidence = parseFloat(String(req.query.minEvidence || '0')) || 0;
    const oddsKind = String(req.query.odds || 'close') === 'early' ? 'early' : 'close';
    const edge = parseFloat(String(req.query.edge || '0.05')) || 0.05;
    const model = String(req.query.model || 'dc-history-v2');
    const rows = backtestRows(season, group, minEvidence, model);
    const metrics = computeMetrics(
      rows.map(r => ({
        p_home: r.p_home,
        p_draw: r.p_draw,
        p_away: r.p_away,
        odds_home: oddsKind === 'early' ? r.early_h : r.odds_home,
        odds_draw: oddsKind === 'early' ? r.early_d : r.odds_draw,
        odds_away: oddsKind === 'early' ? r.early_a : r.odds_away,
        outcome: r.outcome,
        groupKey: r.division,
        groupName: r.division
      })),
      { edgeThreshold: edge }
    );
    res.json({
      data: {
        ...metrics,
        season,
        model,
        group: group || null,
        minEvidence,
        odds: oddsKind,
        edge,
        runs: backtestRunsList(),
        progress: backtestProgress() || backtestProgressV3(),
        sample: rows.slice(0, 200)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    sendError(res, error, 'Failed to read backtest');
  }
});

// ---------- WebSocket ----------

io.on('connection', socket => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on('subscribe_match', (matchId: number) => {
    socket.join(`match:${matchId}`);
  });

  socket.on('unsubscribe_match', (matchId: number) => {
    socket.leave(`match:${matchId}`);
  });

  socket.on('disconnect', reason => {
    logger.info(`Client disconnected: ${socket.id} (${reason})`);
  });
});

app.set('io', io);

// Push live scores to all clients every 60s (only when someone is connected)
const LIVE_POLL_MS = parseInt(process.env.LIVE_POLL_MS || '60000', 10);
setInterval(async () => {
  try {
    const live = footballDataAPI.withPredictions(await footballDataAPI.getLiveMatches());
    recordPredictions(live); // locks anything that has kicked off
    io.emit('matches:live', { data: live, timestamp: new Date().toISOString() });
    // Per-match rooms get their own update (score / status / minute)
    for (const m of live) {
      io.to(`match:${m.id}`).emit('match:live', m);
    }
  } catch (error: any) {
    logger.warn('Live poll failed', { message: error.message });
  }
}, LIVE_POLL_MS);

// ---------- Static site (production: this one process serves the API and the built frontend) ----------

const STATIC_DIR = process.env.STATIC_DIR || path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(path.join(STATIC_DIR, 'index.html'))) {
  // Hashed assets can be cached for a long time; index.html must always be fresh
  app.use(express.static(STATIC_DIR, { index: false, maxAge: '7d' }));
  app.get(/^(?!\/api\/|\/socket\.io\/).*/, (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
  });
  logger.info(`Serving frontend from ${STATIC_DIR}`);
}

// ---------- Errors ----------

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(`Error: ${err.message}`);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
  logger.info(`WebSocket server ready (CORS: ${isDev ? 'any origin [dev]' : allowedOrigins.join(', ')})`);
  // Save/refresh predictions every time the fixture window is refreshed
  footballDataAPI.onWindowRefreshed = matches => recordPredictions(matches);
  // Warm the fixture window now and keep it fresh in the background
  footballDataAPI.startBackgroundRefresh();
  // Settle finished matches every 10 minutes (first run after 1 minute)
  const settle = () =>
    settlePending((from, to) => footballDataAPI.getMatchesInRange(from, to)).catch(err =>
      logger.warn('Settle job failed', { message: err.message })
    );
  setTimeout(settle, 60 * 1000);
  setInterval(settle, parseInt(process.env.SETTLE_INTERVAL_MS || '600000', 10));
  // Market odds: decide every 10 minutes which competitions deserve a fetch (budget-aware)
  const odds = () =>
    footballDataAPI
      .getUpcomingMatches(30)
      .then(ms => oddsTick(ms))
      .catch(err => logger.warn('Odds job failed', { message: err.message }));
  setTimeout(odds, 90 * 1000);
  setInterval(odds, parseInt(process.env.ODDS_TICK_MS || '600000', 10));
});

export { app, io };
