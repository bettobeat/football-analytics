#!/usr/bin/env node
/**
 * Turn an off-site backup (sportlikely-YYYYMMDD-HHMMSS.sqlite.gz.enc) back into the database file.
 *
 *   Windows (cmd):   set BACKUP_KEY=<the value from Railway>  &&  node scripts\decrypt-backup.js <file.enc>
 *   Mac / Linux:     BACKUP_KEY=<the value from Railway> node scripts/decrypt-backup.js <file.enc>
 *
 * Writes <name>.sqlite next to the input. No packages needed (plain Node 18+).
 * To restore: stop the service, replace bet-to-beat.sqlite on the volume with this file (delete the -wal and -shm
 * files next to it), start the service.
 */
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');

const file = process.argv[2];
if (!file || !process.env.BACKUP_KEY) {
  console.error('Usage: BACKUP_KEY=... node scripts/decrypt-backup.js <file.sqlite.gz.enc>');
  process.exit(1);
}
const buf = fs.readFileSync(file);
if (buf.subarray(0, 5).toString() !== 'SLBK1') { console.error('Not a SportLikely backup file.'); process.exit(1); }
const key = crypto.createHash('sha256').update(process.env.BACKUP_KEY).digest();
const iv = buf.subarray(5, 17);
const tag = buf.subarray(buf.length - 16);
const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
d.setAuthTag(tag);
let gz;
try {
  gz = Buffer.concat([d.update(buf.subarray(17, buf.length - 16)), d.final()]);
} catch {
  console.error('Wrong BACKUP_KEY, or the file is damaged.');
  process.exit(1);
}
const out = file.replace(/\.sqlite\.gz\.enc$/, '') + '.sqlite';
fs.writeFileSync(out, zlib.gunzipSync(gz));
console.log(`Done: ${out}`);
