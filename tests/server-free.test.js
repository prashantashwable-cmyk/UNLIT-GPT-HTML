/* The free-plan server (Cloudflare Durable Object with SQLite), with nothing set up by hand: no setup secret, no database to
   create, no alert keys. The first office phone claims it; restore needs only the recovery code. Runs the same storage code
   on node:sqlite. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { startLocal, sqliteStore } = await import('../server/local.mjs');
  /* AIEC_SERVER_URL runs the same test against a real Cloudflare engine (npx wrangler dev in server/) */
  const ext = process.env.AIEC_SERVER_URL, srv = ext ? { close: async () => { } } : await startLocal(0, {}, await sqliteStore()), url = ext || 'http://127.0.0.1:' + srv.port;
  const syncNow = pg => pg.evaluate(async () => { while (Sync.busy) await new Promise(r => setTimeout(r, 50)); await Sync.tick(); return Sync.state && Sync.state.st; });
  const health = await fetch(url + '/health').then(r => r.json());
  assert(health.ok && !health.ready && health.push, 'a new server is ready to be claimed, with alerts already possible');
  assert(/^[A-Za-z0-9_-]{80,90}$/.test((await fetch(url + '/vapid').then(r => r.json())).key), 'the server made its own alert key');

  /* the office phone claims it with no secret */
  const A = await launch(), pa = A.page;
  await pa.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await pa.waitForTimeout(6000);
  await pa.evaluate(() => { loginAs(S.users.POWNER); ACT.permsDone(); Notify.hide(); go('server'); }); await pa.waitForTimeout(150);
  assert(/only if one was set on Cloudflare/.test(await pa.innerText('main')), 'the setup secret is marked as not needed');
  await pa.fill('[data-f="srvUrl"]', url); await pa.click('[data-a="srvOn"]'); await pa.waitForTimeout(3000);
  assert(await pa.evaluate(() => Sync.cfg() && Sync.cfg().role === 'office'), 'the first office phone claims the server without any secret');

  /* another company (a different office key) cannot take it over */
  const X = await launch(), px = X.page;
  await px.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; enterPractice(); }); await px.waitForTimeout(6000);
  await px.evaluate(() => { loginAs(S.users.POWNER); });
  assert(await px.evaluate(u => Sync.enable(u, ''), url) === 'err_server_claimed', 'a stranger\'s phone cannot claim it afterwards');

  /* people sync; a technician's phone works through it */
  const LEAD = await pa.evaluate(() => Object.values(S.projects).find(x => x.stage === 'installing').tech), H = await pa.evaluate(() => Object.values(S.projects).find(x => x.stage === 'installing').id);
  assert(await syncNow(pa) === 'ok', 'the office phone syncs');
  const techPack = await pa.evaluate(async uid => { const p = await finishPack(exportPack('person', uid)); p.sync = await Sync.creds('person', uid); return JSON.stringify(p); }, LEAD);
  const C = await launch(), pc = C.page;
  await pc.evaluate(async ([txt, uid]) => { App.set.lang = 'en'; LANG = 'en'; App.set.mode = 'practice'; await loadMode('practice'); await importText(txt); loginAs(S.users[uid]); }, [techPack, LEAD]);
  await pc.evaluate(pid => perform('CHAT_POSTED', pid, { kind: 'message', text: 'Free plan works' }, { quiet: true }), H);
  await syncNow(pc); await syncNow(pa);
  assert(await pa.evaluate(pid => S.projects[pid].chat.some(m => m.text === 'Free plan works'), H), 'the technician\'s update reaches the office through the free-plan server');

  /* backup and restore with the recovery code only */
  await pa.evaluate(() => go('server')); await pa.waitForTimeout(100);
  await pa.click('[data-a="bkCode"]'); await pa.waitForTimeout(5000);
  const code = await pa.evaluate(() => (document.querySelector('#ov .card div') || {}).textContent || '');
  assert(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){5}$/.test(code), 'Head Quarter gets the recovery code; the first backup goes up');
  await pa.evaluate(() => closeSheet());
  assert((await fetch(url + '/backups', { headers: { 'X-Restore': 'f'.repeat(64) } })).status === 403, 'a made-up proof cannot even list the backups');
  const n = await pa.evaluate(() => EVENTS.length);
  const E = await launch(), pe = E.page;
  await pe.evaluate(async () => { App.set.lang = 'en'; LANG = 'en'; App.set.mode = 'practice'; await loadMode('practice'); App.me = null; go('restore'); }); await pe.waitForTimeout(150);
  await pe.fill('[data-f="rsUrl"]', url); await pe.fill('[data-f="rsCode"]', 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF'); await pe.click('[data-a="rsGo"]');
  /* a real server far away answers more slowly, so wait for the answer rather than a fixed time */
  await pe.waitForFunction(() => /does not open the backup/.test(document.querySelector('main').innerText), null, { timeout: 30000 }).catch(() => { });
  assert(/does not open the backup/.test(await pe.innerText('main')), 'a wrong recovery code is refused');
  await pe.fill('[data-f="rsCode"]', code); await pe.click('[data-a="rsGo"]');
  await pe.waitForFunction(n => EVENTS.length === n && Sync.cfg(), n, { timeout: 60000 }).catch(() => { });
  assert(await pe.evaluate(() => EVENTS.length) === n && await pe.evaluate(() => Sync.cfg() && Sync.cfg().role === 'office'), 'with only the server address and the recovery code, a new phone brings back the whole company');

  for (const lang of ['en', 'hi', 'mr']) {
    await pe.evaluate(lang => { LANG = lang; App.set.lang = lang; App.me = null; go('restore'); }, lang); await pe.waitForTimeout(60);
    if (await pe.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll (' + lang + ')');
  }
  const m = await miss(pe); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await srv.close(); for (const x of [A, X, C, E]) await x.browser.close();
  console.log('SERVER FREE PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
