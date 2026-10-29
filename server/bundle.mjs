/* Makes the two files for setting up on Cloudflare from a phone:
   dist/aiec-server-worker.js  - the whole company server in one file, to paste into the Worker editor
   dist/aiec-app-website.zip   - the app itself, for "Upload your static files" (Cloudflare Pages)
   Run:  node server/bundle.mjs */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = new URL('..', import.meta.url).pathname;
mkdirSync(root + 'dist', { recursive: true });
const core = readFileSync(root + 'server/core.mjs', 'utf8');
const worker = readFileSync(root + 'server/worker.mjs', 'utf8').replace(/^import .*\n/m, '');
writeFileSync(root + 'dist/aiec-server-worker.js', `/* AIEC Elevator OS - company server (Cloudflare Worker), made by server/bundle.mjs from core.mjs + worker.mjs.
   Paste this whole file into the Worker editor. Bindings needed: D1 database as "DB", R2 bucket as "BACKUP" (optional, for backups).
   Secrets: ADMIN_SECRET (required), VAPID_PUBLIC / VAPID_PRIVATE / VAPID_SUBJECT (optional, for alerts). */\n` + core + '\n' + worker);
writeFileSync(root + 'dist/schema.sql', readFileSync(root + 'server/schema.sql', 'utf8'));
execFileSync('python3', ['-c', `import zipfile,sys
z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED)
for f in sys.argv[2:]: z.write(f, f.split('/')[-1])
z.close()`, root + 'dist/aiec-app-website.zip', ...['AIEC-Elevator-OS.html', 'index.html', 'sw.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'].map(f => root + f)]);
console.log('made dist/aiec-server-worker.js, dist/schema.sql, dist/aiec-app-website.zip');
