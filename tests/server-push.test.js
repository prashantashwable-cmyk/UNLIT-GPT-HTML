/* Alerts from the company server: a push carries no text and only wakes the phone. An SOS wakes the office at once;
   ordinary news at most every 10 minutes per box. Only real phone push services are called. */
const { launch } = require('./lib');
const http = require('http');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
(async () => {
  /* a pretend phone push service that records what it receives */
  const got = [];
  const fake = http.createServer((req, res) => { let n = 0; req.on('data', c => { n += c.length; }); req.on('end', () => { got.push({ path: req.url, auth: req.headers.authorization || '', urgency: req.headers.urgency, ttl: req.headers.ttl, bytes: n }); res.writeHead(req.url.includes('gone') ? 410 : 201); res.end(); }); });
  await new Promise(r => fake.listen(0, '127.0.0.1', r)); const fp = fake.address().port, ep = id => `http://127.0.0.1:${fp}/ep/${id}`;
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const VAPID_PUBLIC = b64u(await crypto.subtle.exportKey('raw', pair.publicKey)), VAPID_PRIVATE = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d;
  const { startLocal } = await import('../server/local.mjs');
  const srv = await startLocal(0, { ADMIN_SECRET: 'test-secret-123', VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT: 'mailto:office@aiec.in', PUSH_TEST_HOST: '127.0.0.1' }), url = 'http://127.0.0.1:' + srv.port;
  const syncNow = pg => pg.evaluate(async () => { while (Sync.busy) await new Promise(r => setTimeout(r, 50)); await Sync.tick(); return Sync.state && Sync.state.st; });
  const api = (path, tok, box, method, body) => fetch(url + path, { method, headers: Object.assign({ Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, box ? { 'X-Box': box } : {}), body: body ? JSON.stringify(body) : undefined }).then(r => r.status);

  const A = await launch(), pa = A.page;
  await pa.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await pa.waitForTimeout(6000);
  await pa.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); });
  await pa.evaluate(u => Sync.enable(u, 'test-secret-123'), url); await syncNow(pa);
  const LEAD = await pa.evaluate(() => Object.values(S.projects).find(x => x.stage === 'installing').tech), H = await pa.evaluate(() => Object.values(S.projects).find(x => x.stage === 'installing').id);
  const techPack = await pa.evaluate(async uid => { const p = await finishPack(exportPack('person', uid)); p.sync = await Sync.creds('person', uid); return JSON.stringify(p); }, LEAD);
  const C = await launch(), pc = C.page;
  await pc.evaluate(async ([txt, uid]) => { App.set.lang = 'en'; LANG = 'en'; App.set.mode = 'practice'; await loadMode('practice'); await importText(txt); loginAs(S.users[uid]); }, [techPack, LEAD]);
  await syncNow(pc);
  const officeTok = await pa.evaluate(async () => Sync.tokenFor(await Sync.ck(), 'office')), techTok = await pc.evaluate(() => Sync.cfg().tok);

  /* phones ask to be woken */
  assert(await fetch(url + '/vapid').then(r => r.json()).then(j => j.key === VAPID_PUBLIC), 'the server shares its public push key');
  assert(await api('/push-sub', officeTok, null, 'POST', { endpoint: ep('office') }) === 200 && await api('/push-sub', techTok, LEAD, 'POST', { endpoint: ep('tech') }) === 200, 'office and technician phones register for alerts');
  assert(await api('/push-sub', techTok, LEAD, 'POST', { endpoint: 'https://evil.example.com/x' }) === 400 && await api('/push-sub', techTok, LEAD, 'POST', { endpoint: 'http://10.0.0.1/x' }) === 400, 'the server only calls real phone push services');

  /* SOS from the site wakes the office at once */
  got.length = 0;
  await pc.evaluate(() => perform('SOS_RAISED', null, { sid: 'S' + rid(8), gps: null, note: 'Fell from scaffold' }, { quiet: true }));
  await syncNow(pc);
  const sos = got.find(g => g.path === '/ep/office');
  assert(sos && sos.urgency === 'high' && sos.bytes === 0, 'an SOS wakes the office phone at once, with no text in the alert');
  const jwt = /vapid t=([^,]+), k=(.+)$/.exec(sos.auth);
  const [h, b, s] = jwt[1].split('.'), claims = JSON.parse(Buffer.from(b, 'base64url').toString());
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, Buffer.from(s, 'base64url'), new TextEncoder().encode(h + '.' + b));
  assert(ok && claims.aud === `http://127.0.0.1:${fp}` && claims.sub === 'mailto:office@aiec.in' && jwt[2] === VAPID_PUBLIC, 'the alert is signed with the company push key');

  /* ordinary news is spaced (start from a clear 10-minute window) */
  got.length = 0; srv.store.meta.delete('wake|office');
  await pc.evaluate(pid => perform('CHAT_POSTED', pid, { kind: 'message', text: 'Rails done' }, { quiet: true }), H); await syncNow(pc);
  const n1 = got.filter(g => g.path === '/ep/office').length;
  await pc.evaluate(pid => perform('CHAT_POSTED', pid, { kind: 'message', text: 'Brackets done' }, { quiet: true }), H); await syncNow(pc);
  const n2 = got.filter(g => g.path === '/ep/office').length;
  assert(n1 === 1 && n2 === 1 && got[0].urgency === 'normal', 'ordinary news wakes the office once, then waits 10 minutes');

  /* the office's news wakes the technician */
  got.length = 0;
  await syncNow(pa);
  await pa.evaluate(pid => perform('CHAT_POSTED', pid, { kind: 'message', text: 'Come to the office at 5' }, { quiet: true }), H); await syncNow(pa);
  assert(got.some(g => g.path === '/ep/tech'), 'the office\'s message wakes the technician\'s phone');
  assert(got.every(g => g.bytes === 0 && g.ttl), 'no alert ever carries any data');

  /* a phone that left the push service is forgotten; a removed person's alerts stop */
  await api('/push-sub', officeTok, null, 'POST', { endpoint: ep('gone-phone') });
  await pc.evaluate(() => perform('SOS_RAISED', null, { sid: 'S' + rid(8), gps: null, note: 'Test' }, { quiet: true })); await syncNow(pc);
  assert(![...srv.store.subs.keys()].includes(ep('gone-phone')), 'a phone the push service no longer knows is removed');
  await pa.evaluate(uid => perform('USER_UPDATED', null, { uid, active: false }, { as: 'POWNER', quiet: true }), LEAD); await syncNow(pa);
  assert(![...srv.store.subs.keys()].includes(ep('tech')), 'removing a person also removes their phone\'s alerts');

  await srv.close(); fake.close(); for (const x of [A, C]) await x.browser.close();
  console.log('SERVER PUSH PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
