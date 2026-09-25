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
import { historyStatus, teamMapStatus, GROUPS, syncAll } from './services/history';
import { modelV2Status, runBacktest, runBacktestAll, backtestProgress, backtestRows, backtestRunsList } from './services/historyModel';
import { oddsTick, oddsStatus, fetchCompetitionOdds, SPORT_KEYS } from './services/odds';
import { syncSquadValues, squadValuesStatus, startSquadValuesScheduler, squadCompetitions } from './services/squadValues';
import { syncClubValueHistory, clubValueHistoryStatus, findClub } from './services/squadHistory';
import { compareModels } from './services/compareModels';
import { gapReport } from './services/gapReport';
import { pastSeasons, pastPredictions, dataInventory, leaguePatterns } from './services/pastView';
import { marketTest, drawTest, anchoredDrawTest } from './services/marketTest';
import { clvTick, clvReport, startClvScheduler, clvProbe } from './services/clv';
import {
  isAfMatchId, isAfCode, afUpcoming, afLive, afWithPredictions, getAfMatchDetails, getAfStandings, getAfScorers,
  afCompetitions, pollAfLive, startAfMatchesScheduler, afWindowStatus, refreshAfWindow, onAfWindow, isKnownAfFixture, afExtrasForFd
} from './services/afMatches';
import { buildNationalElo, syncNationalHistory, nationalEloStatus, startNationalEloScheduler } from './services/nationalElo';
import { buildClubElo, syncEuropeanCups, clubEloStatus, startClubEloScheduler, clubValueReport } from './services/clubElo';
import { nationalValueSearch, historyMatchReport } from './services/squadValues';
import { drawAlertsReport } from './services/drawAlerts';
import { startApiFootballScheduler, afStatus, afTick, rebuildAfFeatures, afGet, afRemaining, xgCoverage } from './services/apiFootball';
import {
  signup, login, changePassword, setPlan, adminResetPassword, listUsers, userStats, createSession, destroySession, userForToken,
  parseCookies, setSessionCookie, clearSessionCookie, SESSION_COOKIE, accessOf, canSeeFull, teaseDeep, AuthError, Access, User,
  sendVerification, verifyEmail, requestPasswordReset, resetPassword, setMarketingOptIn, usersCsv, verificationRequired
} from './services/auth';
import { MODEL_V3, modelV3Status, runBacktestV3, runBacktestV3All, backtestProgressV3, prepareModelV3, CONV, sweepV3, autoVariants, parseCompactVariants, sweepProgress, backfillV3, setRelOverride, SweepVariant, tuneLeaguesV3, leagueTuneProgress, leagueConvStatus, clearLeagueConv } from './services/gridModel';

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
// Read token for maintenance: GET /api/...?token=<API_READ_TOKEN> passes the gate (pages and sockets stay locked)
const API_READ_TOKEN = process.env.API_READ_TOKEN || '';

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

// Each socket joins 'full' (premium/admin) or 'teaser' (anonymous/free) — predictions are trimmed for 'teaser'
io.use((socket, next) => {
  try {
    const cookies = parseCookies(socket.request.headers.cookie);
    const user = userForToken(cookies[SESSION_COOKIE]);
    socket.data.full = canSeeFull(accessOf(user));
  } catch {
    socket.data.full = false;
  }
  next();
});

// Middleware (CSP off: the site loads Google Fonts and club crests from other hosts)
// Railway terminates TLS in front of us: trust the first proxy so req.ip / req.secure are real
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.originalUrl.replace(/([?&]token=)[^&]+/g, '$1***')}`);
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
    if (API_READ_TOKEN && req.method === 'GET' && req.path.startsWith('/api/') && req.query.token === API_READ_TOKEN) return next();
    res.set('WWW-Authenticate', 'Basic realm="Bet To Beat - private beta", charset="UTF-8"');
    res.status(401).send('Private beta. Sign in to continue.');
  });
  logger.info('Private beta gate enabled (SITE_USER / SITE_PASSWORD)');
}

// ---------- Accounts: who is asking, and what they may see ----------
// anon / free  → matches, leagues, teams (predictions trimmed to the pick)
// premium      → + full predictions, Accuracy page data
// admin        → everything (maintenance, backtests, syncs, user admin). ADMIN_EMAILS or the read token (GET only).
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User | null;
      access?: Access;
    }
  }
}

app.use((req, _res, next) => {
  const cookies = parseCookies(req.headers.cookie);
  let user: User | null = null;
  try {
    user = userForToken(cookies[SESSION_COOKIE]);
  } catch (e: any) {
    logger.warn('Session lookup failed', { message: e.message });
  }
  req.user = user;
  req.access = accessOf(user);
  // Maintenance read token: admin reads, but never the user data (/api/admin/*)
  if (API_READ_TOKEN && req.method === 'GET' && req.query.token === API_READ_TOKEN) {
    if (req.path.startsWith('/api/admin')) return _res.status(403).json({ error: 'Not allowed with the read token' });
    req.access = 'admin';
  }
  next();
});

const OPEN_API = /^\/api\/(health$|auth\/|matches(\/|$)|leagues(\/|$)|teams\/)/;
const PREMIUM_GET_API = /^\/api\/(accuracy(\/recent|\/status)?|backtest|history\/status|clv|past\/(seasons|predictions|data|patterns)|draw-alerts)$/;

app.use('/api', (req, res, next) => {
  const p = req.originalUrl.split('?')[0];
  const access = req.access || 'anon';
  if (OPEN_API.test(p)) {
    // Trim predictions for anonymous and free users
    if (!canSeeFull(access) && p.startsWith('/api/matches')) {
      const json = res.json.bind(res);
      res.json = (body: any) => json(teaseDeep(body));
    }
    return next();
  }
  if (access === 'admin') return next();
  if (req.method === 'GET' && PREMIUM_GET_API.test(p)) {
    if (access === 'premium') return next();
    return res.status(access === 'anon' ? 401 : 402).json({ error: access === 'anon' ? 'Sign in required' : 'Premium required', premium: true });
  }
  return res.status(access === 'anon' ? 401 : 403).json({ error: 'Not allowed' });
});

function authFail(res: express.Response, e: any) {
  if (e instanceof AuthError) return res.status(e.status).json({ error: e.message });
  logger.error('Auth error', { message: e?.message });
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

function sessionPayload(user: User | null) {
  return { user, access: accessOf(user), verificationRequired };
}

// Only JSON bodies on auth POSTs (with SameSite=Lax cookies this blocks cross-site form posts)
function jsonOnly(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.is('application/json')) return res.status(415).json({ error: 'JSON body required' });
  next();
}

app.get('/api/auth/me', (req, res) => {
  res.set('Cache-Control', 'no-store');
  // Keep the browser cookie in step with the sliding session (30 days from the last visit)
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (req.user && token) setSessionCookie(res, token, new Date(Date.now() + 30 * 86400000), req.secure);
  res.json(sessionPayload(req.user || null));
});

app.post('/api/auth/signup', jsonOnly, async (req, res) => {
  try {
    const user = signup(req.body?.email, req.body?.password, req.body?.name, req.ip || '', req.body?.optIn === true);
    const s = createSession(user.id, req.headers['user-agent']);
    setSessionCookie(res, s.token, s.expires, req.secure);
    // Send the confirmation code; if the email fails the account still exists and the code can be re-sent
    let codeSent = false;
    try {
      await sendVerification(user);
      codeSent = verificationRequired;
    } catch (e: any) {
      logger.warn('Verification email not sent at sign-up', { message: e?.message });
    }
    res.status(201).json({ ...sessionPayload(user), codeSent });
  } catch (e) {
    authFail(res, e);
  }
});

app.post('/api/auth/verify', jsonOnly, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in required' });
  try {
    res.json(sessionPayload(verifyEmail(req.user, req.body?.code)));
  } catch (e) {
    authFail(res, e);
  }
});

app.post('/api/auth/verify/resend', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in required' });
  try {
    await sendVerification(req.user);
    res.json({ ok: true });
  } catch (e) {
    authFail(res, e);
  }
});

app.post('/api/auth/forgot', jsonOnly, async (req, res) => {
  try {
    await requestPasswordReset(req.body?.email, req.ip || '');
    res.json({ ok: true });
  } catch (e) {
    authFail(res, e);
  }
});

app.post('/api/auth/reset', jsonOnly, (req, res) => {
  try {
    const user = resetPassword(req.body?.email, req.body?.code, req.body?.password, req.ip || '');
    const s = createSession(user.id, req.headers['user-agent']);
    setSessionCookie(res, s.token, s.expires, req.secure);
    res.json(sessionPayload(user));
  } catch (e) {
    authFail(res, e);
  }
});

app.post('/api/auth/preferences', jsonOnly, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in required' });
  try {
    res.json(sessionPayload(setMarketingOptIn(req.user.id, req.body?.optIn === true)));
  } catch (e) {
    authFail(res, e);
  }
});

app.post('/api/auth/login', jsonOnly, (req, res) => {
  try {
    const user = login(req.body?.email, req.body?.password, req.ip || '');
    const s = createSession(user.id, req.headers['user-agent']);
    setSessionCookie(res, s.token, s.expires, req.secure);
    res.json(sessionPayload(user));
  } catch (e) {
    authFail(res, e);
  }
});

app.post('/api/auth/logout', (req, res) => {
  destroySession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
  clearSessionCookie(res, req.secure);
  res.json(sessionPayload(null));
});

app.post('/api/auth/password', jsonOnly, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in required' });
  try {
    changePassword(req.user.id, req.body?.current, req.body?.next);
    const s = createSession(req.user.id, req.headers['user-agent']);
    setSessionCookie(res, s.token, s.expires, req.secure);
    res.json({ ok: true });
  } catch (e) {
    authFail(res, e);
  }
});

// ---------- Admin: users and plans (payments will call setPlan later) ----------

app.get('/api/admin/users.csv', (_req, res) => {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="bettobeat-users-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.set('Cache-Control', 'no-store');
  res.send(usersCsv());
});

app.get('/api/admin/users', (_req, res) => {
  res.json({ data: listUsers(), stats: userStats() });
});

app.post('/api/admin/users/:id(\\d+)/plan', jsonOnly, (req, res) => {
  try {
    const plan = req.body?.plan === 'premium' ? 'premium' : 'free';
    const untilDate = req.body?.until ? new Date(String(req.body.until)) : null;
    if (untilDate && isNaN(untilDate.getTime())) return res.status(400).json({ error: 'Invalid end date' });
    const until = untilDate ? untilDate.toISOString() : null;
    res.json({ data: setPlan(parseInt(req.params.id, 10), plan, until) });
  } catch (e) {
    authFail(res, e);
  }
});

app.post('/api/admin/users/:id(\\d+)/password', jsonOnly, (req, res) => {
  try {
    adminResetPassword(parseInt(req.params.id, 10), req.body?.password);
    res.json({ ok: true });
  } catch (e) {
    authFail(res, e);
  }
});

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
    const fd = footballDataAPI.withPredictions(await footballDataAPI.getUpcomingMatches(days));
    // + extra competitions from API-Football (national teams, cups, more leagues)
    const matches = [...fd, ...afWithPredictions(afUpcoming(days))].sort((a: any, b: any) => a.utcDate.localeCompare(b.utcDate));
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
    const matches = [...footballDataAPI.withPredictions(await footballDataAPI.getLiveMatches()), ...afWithPredictions(afLive())];
    res.json({ data: matches, count: matches.length, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch live matches');
  }
});

app.get('/api/matches/:id(\\d+)', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isAfMatchId(id) && !isKnownAfFixture(id)) return res.status(404).json({ error: 'Match not found' });
    const match = isAfMatchId(id) ? (await getAfMatchDetails(id)).match : await footballDataAPI.getMatch(id);
    res.json({ data: match, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch match');
  }
});

// Everything for the match page: match + events + lineups + stats + h2h + standings + form
app.get('/api/matches/:id(\\d+)/details', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isAfMatchId(id) && !isKnownAfFixture(id)) return res.status(404).json({ error: 'Match not found' });
    const details: any = isAfMatchId(id) ? await getAfMatchDetails(id) : await footballDataAPI.getMatchDetails(id);
    // Football-Data.org has no statistics / lineups on our plan: fill them from API-Football (free for everyone)
    if (!isAfMatchId(id)) {
      try {
        const x = await afExtrasForFd(details.match);
        if (x) {
          const m = (details.match = { ...details.match, homeTeam: { ...details.match.homeTeam }, awayTeam: { ...details.match.awayTeam } });
          for (const [side, t] of [['homeTeam', x.home], ['awayTeam', x.away]] as const) {
            const cur = m[side];
            const hasStats = cur.statistics && typeof cur.statistics === 'object' && !('msg' in cur.statistics) && Object.keys(cur.statistics).length;
            if (!hasStats && t.statistics && Object.keys(t.statistics).length) cur.statistics = t.statistics;
            if (!(cur.lineup?.length) && t.lineup.length) {
              cur.lineup = t.lineup;
              cur.bench = t.bench;
              cur.formation = cur.formation || t.formation;
              cur.coach = cur.coach?.name ? cur.coach : t.coach;
            }
          }
          if ((m.minute === null || m.minute === undefined) && x.minute !== null) m.minute = x.minute;
          if (m.homeTeam.lineup?.length) details.probableLineups = null;
        }
      } catch (e: any) {
        logger.warn('Live extras failed', { id, message: e.message });
      }
    }
    res.json({ data: details, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch match details');
  }
});

app.get('/api/matches/:id(\\d+)/head2head', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isAfMatchId(id) && !isKnownAfFixture(id)) return res.status(404).json({ error: 'Match not found' });
    const h2h = isAfMatchId(id) ? (await getAfMatchDetails(id)).head2head : await footballDataAPI.getHeadToHead(id);
    res.json({ data: h2h, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch head-to-head');
  }
});

app.get('/api/leagues', async (_req, res) => {
  try {
    const leagues = [...(await footballDataAPI.getLeagues()), ...afCompetitions()];
    res.json({ data: leagues, count: leagues.length, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch leagues');
  }
});

app.get('/api/leagues/:code/standings', async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const standings = isAfCode(code) ? await getAfStandings(code) : await footballDataAPI.getStandings(code);
    res.json({ data: standings, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch standings');
  }
});

app.get('/api/leagues/:code/scorers', async (req, res) => {
  try {
    const limit = parseInt(String(req.query.limit || '40'), 10) || 40;
    const code = req.params.code.toUpperCase();
    const scorers = isAfCode(code) ? await getAfScorers(code, limit) : await footballDataAPI.getScorers(code, limit);
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

// Load one extra (older) season of results, e.g. ?season=2324 — for out-of-sample backtests
app.get('/api/history/sync-season', async (req, res) => {
  try {
    const season = String(req.query.season || '');
    if (!/^\d{4}$/.test(season)) { res.status(400).json({ error: 'season=YYYY (e.g. 2324)' }); return; }
    const r = await syncAll([season], false);
    prepareModelV3();
    res.json({ data: { total: r.total, summary: r.summary.filter(x => x.season === season) }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Season sync failed');
  }
});

// National-team Elo: status, or ?sync=1 to (re)load international results first
app.get('/api/model/elo', async (req, res) => {
  try {
    if (req.query.sync === '1') { await syncNationalHistory(req.query.force === '1'); buildNationalElo(); }
    else if (req.query.rebuild === '1') buildNationalElo();
    res.json({ data: nationalEloStatus(), timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'National Elo failed');
  }
});

// European club Elo: status, or ?sync=1 to load UEFA cup results first
// Admin checks for squad-value name matching: ?q= searches Transfermarkt names
app.get('/api/model/euro/values', (req, res) => {
  res.json({ data: clubValueReport(req.query.q ? String(req.query.q) : undefined), timestamp: new Date().toISOString() });
});
app.get('/api/model/elo/values', (req, res) => {
  res.json({ data: nationalValueSearch(String(req.query.q || '')), timestamp: new Date().toISOString() });
});

app.get('/api/model/euro', async (req, res) => {
  try {
    if (req.query.sync === '1') { await syncEuropeanCups(req.query.force === '1'); buildClubElo(); }
    else if (req.query.rebuild === '1') buildClubElo();
    res.json({ data: clubEloStatus(), timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Club Elo failed');
  }
});

// Refit v2 and rebuild v3 now (GET, e.g. after loading new leagues' history)
app.get('/api/history/refit', async (_req, res) => {
  try {
    const r = await footballDataAPI.prepareHistoryModel(false);
    prepareModelV3();
    res.json({ data: r, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Refit failed');
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

// Squad values (v3 row #1): status, or force a re-download and rebuild v3 state
// Point-in-time squad values (monthly history). ?sync=1 rebuilds, ?club=FC Porto shows a sample
app.get('/api/model/v3/squad/history', async (req, res) => {
  try {
    if (req.query.sync === '1') await syncClubValueHistory(squadCompetitions(), true);
    res.json({ data: clubValueHistoryStatus(req.query.club ? String(req.query.club) : undefined), timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Club value history failed');
  }
});

// Admin: find a club in the Transfermarkt dump (clubs.csv, players.csv, monthly history). ?q=coventry
app.get('/api/model/v3/squad/find', async (req, res) => {
  try {
    if (req.query.fd) { res.json({ data: historyMatchReport(String(req.query.group || '').toUpperCase(), String(req.query.fd).split(',')), timestamp: new Date().toISOString() }); return; }
    res.json({ data: await findClub(String(req.query.q || '')), timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Club search failed');
  }
});
app.get('/api/model/v3/squad', (_req, res) => {
  res.json({ data: squadValuesStatus(), timestamp: new Date().toISOString() });
});
const squadSyncHandler = async (_req: express.Request, res: express.Response) => {
  try {
    const r = await syncSquadValues(true);
    if (r) { prepareModelV3(); rebuildAfFeatures(); }
    res.json({ data: { synced: r, status: squadValuesStatus() }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Squad values sync failed');
  }
};
app.post('/api/model/v3/squad/sync', squadSyncHandler);

// API-Football feed (injuries, suspensions, confirmed lineups): status and a manual sync
// Admin: raw API-Football answer for a fixture (to check what the provider has). ?path=/fixtures/statistics&fixture=123
app.get('/api/af/raw', async (req, res) => {
  const pathQ = String(req.query.path || '/fixtures');
  if (!['/fixtures', '/fixtures/statistics', '/fixtures/lineups', '/fixtures/events', '/leagues'].includes(pathQ)) return res.status(400).json({ error: 'path not allowed' });
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.query)) if (!['path', 'token', 'c'].includes(k)) params[k] = String(v);
  try {
    res.json({ data: await afGet(pathQ, params), timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/af/xg', (_req, res) => {
  res.json({ data: xgCoverage(), timestamp: new Date().toISOString() });
});

app.get('/api/af/status', async (_req, res) => {
  try {
    res.json({ data: await afStatus(), timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'API-Football status failed');
  }
});
// Live closing-line value: v3 at the open price vs the closing price
app.get('/api/clv', (req, res) => {
  try {
    res.json({ data: clvReport(parseInt(String(req.query.days || '90'), 10) || 90), timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'CLV report failed');
  }
});
app.get('/api/clv/probe', async (req, res) => {
  try {
    res.json({ data: await clvProbe(req.query.fixture ? Number(req.query.fixture) : undefined), timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'CLV probe failed');
  }
});
app.get('/api/clv/tick', async (_req, res) => {
  res.json({ data: await clvTick(), timestamp: new Date().toISOString() });
});

app.get('/api/af/window', async (req, res) => {
  if (req.query.refresh === '1') await refreshAfWindow().catch(() => undefined);
  res.json({ data: afWindowStatus(), timestamp: new Date().toISOString() });
});

app.get('/api/af/sync', (_req, res) => {
  afTick(true).catch(() => undefined);
  res.json({ data: { started: true }, timestamp: new Date().toISOString() });
});

// Backfill v3 predictions for the tracked matches v2 already has (walk-forward, flagged backfilled=1)
const backfillHandler = (req: express.Request, res: express.Response) => {
  try {
    res.json({ data: backfillV3('dc-history-v2', req.query.redo === '1'), timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'v3 backfill failed');
  }
};
app.post('/api/model/v3/backfill', backfillHandler);
app.get('/api/model/v3/backfill', backfillHandler);
app.get('/api/model/v3/squad/sync', squadSyncHandler);

// Start a walk-forward backtest (runs in the background).
// ?season=2526&group=E (group optional = all) &model=dc-history-v2|grid-v3
// For grid-v3, conversion constants can be overridden for calibration: &gapScale=0.05&kDraw=1.5&drawBase.big=240 …
const runBacktestHandler = (req: express.Request, res: express.Response) => {
  const season = String(req.query.season || '2526');
  const group = req.query.group ? String(req.query.group).toUpperCase() : undefined;
  const model = String(req.query.model || 'dc-history-v2');
  if (backtestProgress() || backtestProgressV3() || sweeping || leagueTuning) {
    res.status(409).json({ error: 'A backtest is already running', progress: backtestProgress() || backtestProgressV3() });
    return;
  }
  let job: Promise<any>;
  if (model === MODEL_V3) {
    const conv: any = {};
    for (const [k, v] of Object.entries(req.query)) {
      if (['season', 'group', 'model', 'divisions', 'r', 'token'].includes(k)) continue;
      const num = parseFloat(String(v));
      if (!Number.isFinite(num)) continue;
      const [a, b] = k.split('.');
      if (b) conv[a] = { ...((CONV as any)[a] || {}), ...(conv[a] || {}), [b]: num };
      else conv[a] = num;
    }
    const allDivs = req.query.divisions === 'all'; // include second divisions (Championship, Segunda, Serie B, 2. BL, Ligue 2)
    // relevance override for this run only, compact syntax: r=1:0,0,0,0 (row #1 off)
    const rel = req.query.r ? parseCompactVariants(String(req.query.r))[0]?.rel || null : null;
    if (rel) setRelOverride(rel);
    job = (group ? runBacktestV3(season, group, conv, allDivs) : runBacktestV3All(season, conv, allDivs)).finally(() => { if (rel) setRelOverride(null); });
  } else {
    job = group ? runBacktest(season, group) : runBacktestAll(season);
  }
  job.catch(err => logger.error('Backtest failed', { message: err.message }));
  res.json({ data: { started: true, season, group: group || 'ALL', model }, timestamp: new Date().toISOString() });
};
app.post('/api/backtest/run', runBacktestHandler);
app.get('/api/backtest/run', runBacktestHandler); // GET alias so a run can be started from a browser tab

// v3 sweep: score many variants in memory, in the background; nothing is stored in the DB.
//   GET /api/backtest/sweep?season=2526&auto=rel|rows|conv     → start (auto lists: every relevance cell ±1 / each row off,half,x2 / conv nudges)
//   GET /api/backtest/sweep?season=2526&r=#1:0,0,0,0;#7:2,4,6,8/#21:4,6,8,6   → compact relevance variants (mismatch,standard,even,big)
//   GET /api/backtest/sweep?season=2526&v=[{"name":"x","conv":{"gapScale":0.2},"rel":{"#1":{"even":5}}}]
//   GET /api/backtest/sweep/result                              → progress while running, then the last table
// Base conv for every variant: dot-params as on the run endpoint (&homeGap=0.07&drawBase.even=340). &groups=E,SP limits leagues.
let sweeping = false;
let lastSweep: any = null;
const sweepHandler = (req: express.Request, res: express.Response) => {
  if (sweeping || leagueTuning || backtestProgressV3()) { res.status(409).json({ error: 'A sweep or backtest is already running', progress: sweepProgress }); return; }
  const q: any = { ...(req.query || {}), ...(req.body || {}) };
  const season = String(q.season || '2526');
  const groups = q.groups ? (Array.isArray(q.groups) ? q.groups : String(q.groups).split(',')).map((g: string) => g.toUpperCase()) : undefined;
  let variants: SweepVariant[] = [];
  try {
    if (q.variants) variants = q.variants;
    if (q.v) variants = variants.concat(JSON.parse(String(q.v)));
    if (q.r) variants = variants.concat(parseCompactVariants(String(q.r)));
    if (q.auto) for (const a of String(q.auto).split(',')) variants = variants.concat(autoVariants(a, q.step ? Number(q.step) : 1));
  } catch (err: any) { res.status(400).json({ error: `Bad variants: ${err.message}` }); return; }
  const base: any = q.base && typeof q.base === 'object' ? q.base : {};
  for (const [k, v] of Object.entries(req.query)) {
    if (['season', 'groups', 'auto', 'step', 'v', 'r', 'token'].includes(k)) continue;
    const num = parseFloat(String(v));
    if (!Number.isFinite(num)) continue;
    const [a, b] = k.split('.');
    if (b) base[a] = { ...((CONV as any)[a] || {}), ...(base[a] || {}), [b]: num };
    else base[a] = num;
  }
  sweeping = true;
  lastSweep = { running: true, startedAt: new Date().toISOString(), variants: variants.length };
  sweepV3(season, variants, base, groups)
    .then(out => { lastSweep = { running: false, ...out }; })
    .catch(err => { lastSweep = { running: false, error: err.message }; logger.error('Sweep failed', { message: err.message }); })
    .finally(() => { sweeping = false; });
  res.json({ data: { started: true, season, variants: variants.length, groups: groups || 'ALL', base }, timestamp: new Date().toISOString() });
};
app.get('/api/backtest/sweep', sweepHandler);
app.post('/api/backtest/sweep', sweepHandler);
app.get('/api/backtest/sweep/result', (_req, res) => {
  res.json({ data: sweeping ? { running: true, progress: sweepProgress } : lastSweep, timestamp: new Date().toISOString() });
});

// Per-league v3 settings (draw / home advantage / favourite strength per division), fitted on one season and
// kept only if they also win on the next one.
//   GET /api/model/v3/league-tune?train=2425&test=2526&extra=2627[&apply=1]   → start in the background
//   GET /api/model/v3/league-tune/result                                     → progress, then the report
//   GET /api/model/v3/league-conv[?clear=1]                                  → settings in use (clear = back to shared model)
let leagueTuning = false;
let lastLeagueTune: any = null;
app.get('/api/model/v3/league-tune', (req, res) => {
  if (leagueTuning || sweeping || backtestProgressV3()) { res.status(409).json({ error: 'A tune, sweep or backtest is already running', progress: leagueTuneProgress }); return; }
  const train = String(req.query.train || '2425'), test = String(req.query.test || '2526'), extra = String(req.query.extra || '2627');
  const apply = req.query.apply === '1';
  leagueTuning = true;
  lastLeagueTune = { running: true, startedAt: new Date().toISOString() };
  tuneLeaguesV3(train, test, extra, apply)
    .then(out => { lastLeagueTune = { running: false, ...out }; })
    .catch(err => { lastLeagueTune = { running: false, error: err.message }; logger.error('League tune failed', { message: err.message }); })
    .finally(() => { leagueTuning = false; });
  res.json({ data: { started: true, train, test, extra, apply }, timestamp: new Date().toISOString() });
});
app.get('/api/model/v3/league-tune/result', (_req, res) => {
  res.json({ data: leagueTuning ? { running: true, progress: leagueTuneProgress } : lastLeagueTune, timestamp: new Date().toISOString() });
});
app.get('/api/model/v3/league-conv', (req, res) => {
  if (req.query.clear === '1') clearLeagueConv();
  res.json({ data: leagueConvStatus(), timestamp: new Date().toISOString() });
});

// Draw alerts page (premium): upcoming alerts, live record, backtest seasons
app.get('/api/draw-alerts', (_req, res) => {
  try {
    res.json({ data: drawAlertsReport(), timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Draw alerts failed');
  }
});

// Market-anchored draw model: market early draw + k × (v3 − market), picks at the best early price
app.get('/api/backtest/draws-anchored', (req, res) => {
  try {
    res.json({ data: anchoredDrawTest(String(req.query.season || '2526'), String(req.query.model || MODEL_V3)), timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Anchored draw test failed');
  }
});

// Draw value test: v3's draw picks priced at Pinnacle / average / best available / best at close
app.get('/api/backtest/draws', (req, res) => {
  try {
    res.json({ data: drawTest(String(req.query.season || '2526'), String(req.query.model || MODEL_V3)), timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Draw test failed');
  }
});

// Can we beat the market? Information (blend), closing-line value and per-division edges: ?season=2526&model=grid-v3
app.get('/api/backtest/market', (req, res) => {
  try {
    res.json({ data: marketTest(String(req.query.season || '2526'), String(req.query.model || MODEL_V3)), timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Market test failed');
  }
});

// Head-to-head diagnostics on the same backtested matches: ?season=2526&a=dc-history-v2&b=grid-v3
// ---------- Past predictions page (walk-forward backtests) + data inventory ----------
app.get('/api/past/seasons', (_req, res) => {
  try { res.json({ data: pastSeasons(), timestamp: new Date().toISOString() }); } catch (e: any) { sendError(res, e, 'Past seasons failed'); }
});
app.get('/api/past/predictions', (req, res) => {
  try {
    const q = req.query;
    res.json({
      data: pastPredictions({
        season: String(q.season || '2526'), model: String(q.model || 'grid-v3'),
        division: q.division ? String(q.division) : undefined, team: q.team ? String(q.team).slice(0, 40) : undefined,
        result: q.result ? String(q.result) : undefined, page: parseInt(String(q.page || '1'), 10), limit: parseInt(String(q.limit || '50'), 10)
      }),
      timestamp: new Date().toISOString()
    });
  } catch (e: any) { sendError(res, e, 'Past predictions failed'); }
});
app.get('/api/past/patterns', (_req, res) => {
  try { res.json({ data: leaguePatterns(), timestamp: new Date().toISOString() }); } catch (e: any) { sendError(res, e, 'League patterns failed'); }
});
app.get('/api/past/data', (_req, res) => {
  try { res.json({ data: dataInventory(), timestamp: new Date().toISOString() }); } catch (e: any) { sendError(res, e, 'Data inventory failed'); }
});

// Where the model loses to the market + which missing information would help (admin)
app.get('/api/backtest/gap', (req, res) => {
  try {
    res.json({ data: gapReport(String(req.query.season || '2526'), String(req.query.model || 'grid-v3')), timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Gap report failed');
  }
});

app.get('/api/backtest/compare', (req, res) => {
  try {
    const season = String(req.query.season || '2526');
    const a = String(req.query.a || 'dc-history-v2');
    const b = String(req.query.b || MODEL_V3);
    res.json({ data: compareModels(season, a, b), timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Compare failed');
  }
});

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
        ...metrics, // includes `model` (the model's metrics) and `market`
        season,
        modelName: model,
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

  const tier = socket.data.full ? 'full' : 'teaser';
  socket.join(tier);

  socket.on('subscribe_match', (matchId: number) => {
    const id = Number(matchId);
    if (!Number.isInteger(id) || id <= 0) return;
    // one match page at a time is plenty: drop older match rooms
    for (const room of socket.rooms) if (room.startsWith('match:') && room !== `match:${id}:${tier}`) socket.leave(room);
    socket.join(`match:${id}:${tier}`);
  });

  socket.on('unsubscribe_match', (matchId: number) => {
    socket.leave(`match:${matchId}:${tier}`);
  });

  socket.on('disconnect', reason => {
    logger.info(`Client disconnected: ${socket.id} (${reason})`);
  });
});

app.set('io', io);

// Push live scores to all clients every 60s (only when someone is connected)
const LIVE_POLL_MS = parseInt(process.env.LIVE_POLL_MS || '60000', 10);
let livePolling = false;
setInterval(async () => {
  if (livePolling) return; // a slow poll (API waits) must not overlap the next one
  livePolling = true;
  try {
    const fdLive = footballDataAPI.withPredictions(await footballDataAPI.getLiveMatches());
    recordPredictions(fdLive); // locks anything that has kicked off (Football-Data.org matches only)
    const live = [...fdLive, ...afWithPredictions(await pollAfLive())];
    const ts = new Date().toISOString();
    io.to('full').emit('matches:live', { data: live, timestamp: ts });
    io.to('teaser').emit('matches:live', teaseDeep({ data: live, timestamp: ts }));
    // Per-match rooms get their own update (score / status / minute)
    for (const m of live) {
      io.to(`match:${m.id}:full`).emit('match:live', m);
      io.to(`match:${m.id}:teaser`).emit('match:live', teaseDeep({ m }).m);
    }
  } catch (error: any) {
    logger.warn('Live poll failed', { message: error.message });
  } finally {
    livePolling = false;
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
  // Same for API-Football competitions (national teams, UEFA cups, extra leagues)
  onAfWindow(matches => recordPredictions(afWithPredictions(matches)));
  // Warm the fixture window now and keep it fresh in the background
  footballDataAPI.startBackgroundRefresh();
  // Settle finished matches every 10 minutes (first run after 1 minute)
  const settle = () =>
    settlePending(
      (from, to) => footballDataAPI.getMatchesInRange(from, to),
      async ids => (afRemaining() > 50 ? ((await afGet('/fixtures', { ids: ids.join('-') })).response || []) : [])
    ).catch(err =>
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
  // Squad market values for model v3 (weekly; first attempt after the history sync has team names)
  startSquadValuesScheduler(() => { prepareModelV3(); rebuildAfFeatures(); });
  // Injuries / suspensions / confirmed lineups (API-Football) for model v3 rows #12 and #13
  startApiFootballScheduler();
  // Live closing-line value tracking (open price + v3 at 48 h, closing price in the last 35 min)
  startClvScheduler();
  // Extra competitions (national teams, Europa/Conference League, Israel, Saudi, more European leagues)
  startAfMatchesScheduler();
  // National-team Elo from international results since 2014 (API-Football)
  startNationalEloScheduler();
  // European club Elo (UEFA cups + domestic results + squad values)
  startClubEloScheduler();
});

export { app, io };
