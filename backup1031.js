#!/usr/bin/env node
// Sharps Exchange backup. Saves the game data (not logins) to one encrypted file.
//   Back up:   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... BACKUP_PASSPHRASE=... node backup.js
//   Read one:  BACKUP_PASSPHRASE=... node backup.js decrypt backup/sharps-2026-10-27.enc [out.json]
// The file is encrypted (AES-256-GCM) so it is safe to keep as a workflow download even if the repo is public.
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const MAGIC = Buffer.from('SXB1');
const TABLES = ['game_state', 'league_settings', 'leagues', 'players', 'profiles', 'accounts', 'holdings', 'transactions', 'net_worth_hist', 'watch', 'chat', 'feed', 'injuries', 'kickoffs', 'usage'];
const key = (pass, salt) => crypto.scryptSync(pass, salt, 32);
function encrypt(buf, pass) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key(pass, salt), iv);
  const body = Buffer.concat([c.update(zlib.gzipSync(buf)), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]);
}
function decrypt(file, pass) {
  if (file.length < 48 || !file.subarray(0, 4).equals(MAGIC)) throw new Error('This is not a Sharps Exchange backup file.');
  const salt = file.subarray(4, 20), iv = file.subarray(20, 32), tag = file.subarray(32, 48);
  const d = crypto.createDecipheriv('aes-256-gcm', key(pass, salt), iv); d.setAuthTag(tag);
  try { return zlib.gunzipSync(Buffer.concat([d.update(file.subarray(48)), d.final()])); }
  catch (e) { throw new Error('Wrong passphrase, or the file is damaged.'); }
}
async function backup() {
  const url = process.env.SUPABASE_URL, k = process.env.SUPABASE_SERVICE_KEY, pass = process.env.BACKUP_PASSPHRASE;
  if (!pass) { console.log('No BACKUP_PASSPHRASE secret set, so no backup was made. Add it under Settings > Secrets > Actions.'); return; }
  if (!url || !k) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY first.');
  const H = { apikey: k, Authorization: 'Bearer ' + k };
  const out = { made: new Date().toISOString(), tables: {} };
  for (const t of TABLES) {
    let all = [];
    for (let from = 0; ; from += 1000) {
      const r = await fetch(url + '/rest/v1/' + t + '?select=*&limit=1000&offset=' + from, { headers: H });
      if (!r.ok) throw new Error(t + ': ' + r.status + ' ' + await r.text());
      const rows = await r.json(); all = all.concat(rows);
      if (rows.length < 1000) break;
    }
    out.tables[t] = all; console.log(t + ':', all.length, 'rows');
  }
  const dir = process.env.BACKUP_DIR || 'backup'; fs.mkdirSync(dir, { recursive: true });
  const name = path.join(dir, 'sharps-' + out.made.slice(0, 10) + '.enc');
  fs.writeFileSync(name, encrypt(Buffer.from(JSON.stringify(out)), pass));
  console.log('Saved', name, '(' + Math.round(fs.statSync(name).size / 1024) + ' KB, encrypted).');
}
if (require.main === module) {
  const a = process.argv.slice(2);
  (async () => {
    if (a[0] === 'decrypt') {
      const pass = process.env.BACKUP_PASSPHRASE; if (!pass || !a[1]) throw new Error('Usage: BACKUP_PASSPHRASE=... node backup.js decrypt file.enc [out.json]');
      const j = decrypt(fs.readFileSync(a[1]), pass); const o = a[2] || a[1].replace(/\.enc$/, '') + '.json'; fs.writeFileSync(o, j); console.log('Wrote', o);
    } else await backup();
  })().catch(e => { console.error('Failed:', e.message); process.exit(1); });
}
module.exports = { encrypt, decrypt };
