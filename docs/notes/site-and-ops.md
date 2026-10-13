# Site structure, accounts, admin and operations

## Product decisions (Yarin)
- One site, sport switcher left of the logo (football live; basketball from ~18 Oct; tennis, American football "coming soon"
  with a notify-me list `sport_waitlist`). Every sport built like football. Past seasons admin-only on every sport.
- Football menu: Home · Matches · Favorites · Draw picks (Pro) · Upset watch (Pro) · Accuracy. Match tabs: Prediction ·
  Statistics · Lineups & injuries · Schedule & rest · H2H · Standings (· Highlights after the game).
- Basketball menu: Home · Games · Favorites · Upset alerts (Pro) · Accuracy. Game tabs: Prediction · Stats · Injuries &
  lineups · Schedule & rest · H2H · Standings.
- Plans: Free (2 full picks a week, live scores, tables, player pages), Premium $15 (60 unlocks a month), Pro $30 unlimited +
  draw picks + upset watch, Pro 6 months $144, Pro yearly $249. 3-day money back; 3-day free trial decided (not built).
  Users can cancel (reason required), delete the account (quiet link, password + DELETE), download their data.
- Home: featured-match carousel (big games of the next 7 days, `lib/fame.ts`), live box, favorites row, next matches, our
  record (last 30 days), draw picks, latest results, world football news (RSS headlines + link out, no copying).
- Languages: en + de, es, fr, it, pt, tr. Accessibility statement (English only) and floating accessibility menu.
- Copy on the record page: "Under 20 games is too few". Leagues in testing show "New league · in testing".

## Accounts & security
- Email + password; email confirmation; two-step (TOTP, `twoFactor.ts`, secrets encrypted with `TOTP_KEY` — never change
  it); admin access only from an mfa session; `ADMIN_2FA_REQUIRED=1`; staff console with roles/permissions (`roles.ts`,
  `staffConsole.ts`), staff can't change their own console password. Security log (`security_log`, IP + browser, 90 days).
  Staff activity log. Beta testers via invite codes (`testers.ts`). Feedback button for testers/staff → CRM inbox.
- CRM inside the admin area (`crm.ts`, `pages/Crm.tsx`): users, plans, cancellations, contact messages, feedback.
- Maintenance read tokens may read admin stats but never `/api/admin/*`.

## Operations
- Railway: one service, `DATA_DIR=/data` volume (5 GB), SQLite. Deploy on push to `main`. Variables: `API_FOOTBALL_KEY`
  (API-Football Ultra 75k/day; same key works for API-Basketball Ultra), `BALLDONTLIE_KEY`, `FOOTBALL_DATA_KEY`,
  `TOTP_KEY`, `BACKUP_KEY`, `BACKUP_S3_*`, `ADMIN_EMAILS`, `TRIAL_COMPETITIONS`, `BB_TRIAL_LEAGUES`, `BASKETBALL_PUBLIC`,
  `BILLING_TEST_MODE` (remove before launch), `RESEND_*` (email), `ANTHROPIC_API_KEY` (assistant, parked).
- Backups (`backup.ts`): daily 02:40 UTC `VACUUM INTO` → gzip, last 3 on the volume, encrypted copies to Cloudflare R2
  (30 days). Restore: `node backend/scripts/decrypt-backup.js <file>` with `BACKUP_KEY`, replace the sqlite on the volume,
  delete -wal/-shm. Admin card "Database backups" with "Back up now" and download (needs a fresh two-step code).
- Data health (`dataHealth.ts`, `/api/data-health`): feeds, settling, duplicates, probabilities, tables, player pages
  (`dataAudit.ts` daily; target ~97% matched). Site errors from visitors' browsers (`clientErrors.ts`, Admin → Site errors,
  email on a new problem).
- Email: Google Workspace (yarin@sportlikely.com; contact@, privacy@, billing@ aliases; support@ group), Resend for
  transactional mail, SPF/DKIM/DMARC pass (`p=quarantine` → `p=reject` early Nov).
- SEO (`seo.ts`): per-page titles/descriptions/canonical/hreflang/JSON-LD, crawler HTML, `/sitemap.xml` (~1,077 URLs),
  private pages (my-picks, account, admin) excluded.
- Request budget: API-Football ~27k/day used of 75k (13 Oct) incl. backfills; API-Basketball ~1k/day. Each added football
  league costs ~50–100 requests/day; a basketball league a few hundred once, then a few a day.

## Admin pages (frontend `pages/Admin.tsx`)
Overview: visitors, site errors, backups, basketball results to check, **Football leagues** and **Basketball leagues**
(coverage scan, add leagues, in-testing switch, remove), accounts tiles, data health, why people leave, contact messages,
security log. Users tab: accounts list with roles/plans. Model tools are API-only (see football-model-v3.md).
