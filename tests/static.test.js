/* Fast checks that need no browser (seconds): the app's script parses; every word key is defined once and has English,
   Hindi and Marathi; every word the code asks for by name exists; the file stays inside its size budget. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const FILE = path.resolve(__dirname, '..', 'AIEC-Elevator-OS.html');
const BUDGET = 2.0 * 1024 * 1024; /* raise it on purpose, never by accident */
try {
  const html = fs.readFileSync(FILE, 'utf8'), bytes = Buffer.byteLength(html);
  assert(bytes <= BUDGET, `app file ${(bytes / 1048576).toFixed(2)} MB is inside the ${(BUDGET / 1048576).toFixed(1)} MB budget`);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]), app = scripts.sort((a, b) => b.length - a.length)[0];
  new vm.Script(app, { filename: 'app.js' });
  assert(true, 'the app script parses');
  /* a second top-level function or constant with the same name silently replaces the first */
  const fnames = [...html.matchAll(/^(?:async )?function ([A-Za-z0-9_$]+)\(/gm)].map(m => m[1]).concat([...html.matchAll(/^(?:const|let) ([A-Za-z0-9_$]+) =/gm)].map(m => m[1]));
  const fd = fnames.filter((n, i) => fnames.indexOf(n) !== i);
  assert(!fd.length, `no top-level function or constant is defined twice (${fnames.length} names)` + (fd.length ? ': ' + fd.join(', ') : ''));

  /* the word table */
  const i = app.indexOf('const L = {'), j = app.indexOf('\n};', i);
  const body = app.slice(i, j + 3), keys = [...body.matchAll(/^\s{2}([A-Za-z0-9_]+):\s*\[/gm)].map(m => m[1]);
  const seen = new Map(); for (const k of keys) seen.set(k, (seen.get(k) || 0) + 1);
  const dups = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
  assert(!dups.length, `no word key is defined twice (${keys.length} keys)` + (dups.length ? ': ' + dups.join(', ') : ''));
  const L = vm.runInNewContext('(' + body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1) + ')');
  const bad = Object.entries(L).filter(([, v]) => !Array.isArray(v) || v.length < 3 || v.slice(0, 3).some(x => typeof x !== 'string' || !x.trim())).map(([k]) => k);
  assert(!bad.length, 'every word has English, Hindi and Marathi' + (bad.length ? ': ' + bad.slice(0, 10).join(', ') : ''));
  /* {placeholders} must be the same in all three languages, or a translation shows a raw "{n}" */
  const ph = s => [...String(s).matchAll(/\{([a-z]+)\}/gi)].map(m => m[1]).sort().join();
  const phBad = Object.entries(L).filter(([, v]) => Array.isArray(v) && (ph(v[0]) !== ph(v[1]) || ph(v[0]) !== ph(v[2]))).map(([k]) => k);
  assert(!phBad.length, 'placeholders like {n} match in all three languages' + (phBad.length ? ': ' + phBad.slice(0, 10).join(', ') : ''));
  /* words asked for by name in the code */
  const code = app.slice(0, i) + app.slice(j + 3);
  const asked = new Set([...code.matchAll(/\bt\('([a-z][A-Za-z0-9_]*)'[,)]/g)].map(m => m[1]));
  const missing = [...asked].filter(k => !(k in L));
  assert(!missing.length, `every word the code asks for by name exists (${asked.size} checked)` + (missing.length ? ': ' + missing.slice(0, 15).join(', ') : ''));
  console.log('STATIC PASSED');
} catch (e) { console.error('FAILED', e.message); process.exit(1); }
