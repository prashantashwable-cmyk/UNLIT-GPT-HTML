/* Locked backups of the whole company on the server. Head Quarter keeps a recovery code on paper; with the server address,
   the setup secret and that code, a brand-new phone brings the whole company back even if every office phone is lost. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { startLocal } = await import('../server/local.mjs');
  const srv = await startLocal(0, { ADMIN_SECRET: 'test-secret-123' }), url = 'http://127.0.0.1:' + srv.port;
  const syncNow = pg => pg.evaluate(async () => { while (Sync.busy) await new Promise(r => setTimeout(r, 50)); await Sync.tick(); return Sync.state && Sync.state.st; });
  const A = await launch(), pa = A.page;
  await pa.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await pa.waitForTimeout(6000);
  await pa.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); });
  await pa.evaluate(u => Sync.enable(u, 'test-secret-123'), url);
  assert(await syncNow(pa) === 'ok', 'without a recovery code, sync works and there is simply no backup yet');
  await pa.evaluate(() => go('server')); await pa.waitForTimeout(100);
  assert(/No backup yet/.test(await pa.innerText('main')) && !(await pa.$('[data-a="bkCode"]')), 'the office sees there is no backup; only Head Quarter can make the recovery code');

  /* Head Quarter makes the recovery code: the first backup goes up */
  await pa.evaluate(() => { loginAs(S.users.POWNER); ACT.permsDone(); Notify.hide(); go('server'); }); await pa.waitForTimeout(150);
  await pa.click('[data-a="bkCode"]'); await pa.waitForTimeout(4000);
  const code = await pa.evaluate(() => (document.querySelector('#ov .card div') || {}).textContent || '');
  assert(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){5}$/.test(code) && /shown only once/.test(await pa.innerText('#ov')), 'Head Quarter gets a recovery code to write on paper');
  const metas = [...srv.store.objs.keys()].filter(k => k.endsWith('/meta'));
  assert(metas.length === 1, 'the first backup is on the server');
  const all = [...srv.store.objs.values()].join('');
  const custName = await pa.evaluate(() => Object.values(S.projects).find(P => P.contact && P.contact.name).contact.name);
  assert(!all.includes(custName) && !all.includes('aiec-elevator-os') && !all.includes(code.replace(/-/g, '')), 'the backup on the server is locked: no names, no records, no code');
  await pa.evaluate(() => closeSheet());

  /* one backup a day */
  await syncNow(pa);
  assert([...srv.store.objs.keys()].filter(k => k.endsWith('/meta')).length === 1, 'a second sync the same day does not make another backup');
  for (let i = 0; i < 8; i++) { await pa.evaluate(() => Sync.backup(true)); await pa.waitForTimeout(1100); }
  assert([...srv.store.objs.keys()].filter(k => k.endsWith('/meta')).length === 7, 'only the newest 7 backups are kept');

  /* every office phone is lost: a brand-new phone */
  const n = await pa.evaluate(() => EVENTS.length), stages = await pa.evaluate(() => Object.values(S.projects).map(P => P.id + ':' + P.stage).sort().join(','));
  const E = await launch(), pe = E.page;
  await pe.evaluate(async () => { App.set.lang = 'en'; LANG = 'en'; App.set.mode = 'practice'; await loadMode('practice'); App.me = null; go('restore'); }); await pe.waitForTimeout(150);
  await pe.fill('[data-f="rsUrl"]', url); await pe.fill('[data-f="rsSecret"]', 'wrong-secret'); await pe.fill('[data-f="rsCode"]', code);
  await pe.click('[data-a="rsGo"]'); await pe.waitForTimeout(800);
  assert(/setup secret is not right/.test(await pe.innerText('main')), 'a wrong setup secret cannot even list the backups');
  await pe.fill('[data-f="rsSecret"]', 'test-secret-123'); await pe.fill('[data-f="rsCode"]', 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF');
  await pe.click('[data-a="rsGo"]'); await pe.waitForTimeout(2000);
  assert(/does not open the backup/.test(await pe.innerText('main')) && !(await pe.evaluate(() => !!S.org)), 'a wrong recovery code cannot open it');
  await pe.fill('[data-f="rsCode"]', code.toLowerCase()); await pe.click('[data-a="rsGo"]'); await pe.waitForTimeout(6000);
  assert(await pe.evaluate(() => App.route.name) === 'door' && await pe.evaluate(() => EVENTS.length) === n, 'the right code brings back every record');
  assert(await pe.evaluate(() => Object.values(S.projects).map(P => P.id + ':' + P.stage).sort().join(',')) === stages, 'every job is in the same state');
  assert(await pe.evaluate(() => Sync.cfg() && Sync.cfg().role === 'office'), 'the new phone is an office phone on the server again');
  await pe.evaluate(() => loginAs(S.users.PADMIN));
  assert(await syncNow(pe) === 'ok', 'and keeps working with the server');
  const media = await pa.evaluate(async () => { const k = EVENTS.flatMap(e => (e.data && e.data.ev) || []).find(x => x.m).m; return k; });
  assert(await pe.evaluate(async k => !!(await getMedia(k)), media), 'photos come back too');

  /* screens */
  for (const lang of ['en', 'hi', 'mr']) {
    await pe.evaluate(lang => { LANG = lang; App.set.lang = lang; App.me = null; go('restore'); }, lang); await pe.waitForTimeout(60);
    if (await pe.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll on restore (' + lang + ')');
    await pa.evaluate(lang => { LANG = lang; App.set.lang = lang; go('server'); }, lang); await pa.waitForTimeout(60);
    if (await pa.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll on server (' + lang + ')');
  }
  const m1 = await miss(pa), m2 = await miss(pe);
  assert(!m1.length && !m2.length, 'no missing words' + (m1.concat(m2).length ? ': ' + m1.concat(m2).join(' ') : ''));
  await srv.close(); for (const x of [A, E]) await x.browser.close();
  console.log('SERVER BACKUP PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
