/* Company server (stage 1): phones sync by themselves through an encrypted mailbox. The office turns it on with the setup secret;
   each person's phone gets exactly what their file would have; the server never sees readable data; removing a person stops their phone. */
const { launch } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { startLocal } = await import('../server/local.mjs');
  const srv = await startLocal(0, { ADMIN_SECRET: 'test-secret-123' }), url = 'http://127.0.0.1:' + srv.port;
  const syncNow = pg => pg.evaluate(async () => { while (Sync.busy) await new Promise(r => setTimeout(r, 50)); await Sync.tick(); return Sync.state && Sync.state.st; });

  /* office phone A */
  const A = await launch(), pa = A.page;
  await pa.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await pa.waitForTimeout(6000);
  await pa.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); });
  assert(await pa.evaluate(u => Sync.enable(u, 'wrong'), url) === 'err_server_secret', 'a wrong setup secret is refused');
  assert(await pa.evaluate(() => Sync.enable('not a url', 'x')) === 'err_server_url', 'a wrong address is refused');
  assert(await pa.evaluate(u => Sync.enable(u, 'test-secret-123'), url) === null, 'the office turns the server on');
  await syncNow(pa);
  const want = await pa.evaluate(() => Object.values(S.users).filter(u => u.active && !['owner', 'admin'].includes(u.role)).length);
  assert(await pa.evaluate(() => Sync.cfg().boxes.length) === want && (await srv.store.listBoxes()).length === want, 'every active person gets a box on the server');
  const custName = await pa.evaluate(() => Object.values(S.projects).find(P => P.contact && P.contact.name).contact.name);
  const blobs = JSON.stringify(srv.store.msgs);
  assert(srv.store.msgs.length > 0 && !blobs.includes(custName) && !blobs.includes('aiec-elevator-os') && !blobs.includes('PADMIN'), 'the server holds only locked messages (no names, no records readable)');

  /* second office phone B joins with the full file and gets the company key */
  const fullPack = await pa.evaluate(async () => { const p = await finishPack(exportPack('full')); p.sync = await Sync.creds('full'); return JSON.stringify(p); });
  const B = await launch(), pb = B.page;
  await pb.evaluate(async txt => { App.set.lang = 'en'; LANG = 'en'; App.set.mode = 'practice'; await loadMode('practice'); await importText(txt); loginAs(S.users.PADMIN); }, fullPack);
  assert(await pb.evaluate(() => Sync.cfg() && Sync.cfg().role === 'office'), 'a second office phone joins the server through its file');

  /* technician phone C with its person file */
  const LEAD = await pa.evaluate(() => Object.values(S.projects).find(x => x.stage === 'installing').tech);
  const H = await pa.evaluate(() => Object.values(S.projects).find(x => x.stage === 'installing').id);
  const techPack = await pa.evaluate(async uid => { const p = await finishPack(exportPack('person', uid)); p.sync = await Sync.creds('person', uid); return JSON.stringify(p); }, LEAD);
  assert(!/"ck"/.test(techPack), 'a person\'s file never carries the company key');
  const C = await launch(), pc = C.page;
  await pc.evaluate(async ([txt, uid]) => { App.set.lang = 'en'; LANG = 'en'; App.set.mode = 'practice'; await loadMode('practice'); await importText(txt); loginAs(S.users[uid]); }, [techPack, LEAD]);
  assert(await pc.evaluate(uid => Sync.cfg() && Sync.cfg().role === 'person' && Sync.cfg().box === uid, LEAD), 'the technician\'s phone is connected through their file');
  assert(await syncNow(pc) === 'ok', 'the technician\'s phone syncs');

  /* technician → office */
  await pc.evaluate(([pid]) => perform('CHAT_POSTED', pid, { kind: 'message', text: 'Rails fixed on floor 3' }, { quiet: true }), [H]);
  assert(await syncNow(pc) === 'ok', 'the technician sends their update');
  await syncNow(pa); await syncNow(pb);
  assert(await pa.evaluate(pid => S.projects[pid].chat.some(m => m.text === 'Rails fixed on floor 3'), H), 'the office phone receives it by itself');
  assert(await pb.evaluate(pid => S.projects[pid].chat.some(m => m.text === 'Rails fixed on floor 3'), H), 'the second office phone receives it too');

  /* office → technician */
  await pa.evaluate(pid => perform('CHAT_POSTED', pid, { kind: 'message', text: 'Good. Check the governor next' }, { quiet: true }), H);
  await syncNow(pa); await syncNow(pc);
  assert(await pc.evaluate(pid => S.projects[pid].chat.some(m => m.text === 'Good. Check the governor next'), H), 'the office\'s message reaches the technician by itself');
  assert(await pc.evaluate(() => !Object.values(S.projects).some(P => P.payments.some(p => p.amount))), 'the technician\'s phone still gets no payment amounts');
  const B2 = await pb.evaluate(() => Object.keys(S.projects).length);
  assert(await pc.evaluate(n => Object.keys(S.projects).length < n, B2), 'and only their own jobs');

  /* who may do what on the server */
  const tok = await pc.evaluate(() => Sync.cfg().tok);
  const call = (path, o) => fetch(url + path, o).then(r => r.status);
  assert(await call('/recv/inbox', { headers: { Authorization: 'Bearer ' + tok, 'X-Box': LEAD } }) === 403, 'a technician cannot read the office inbox');
  const other = (await srv.store.listBoxes()).find(b => b !== LEAD);
  assert(await call('/recv/' + other, { headers: { Authorization: 'Bearer ' + tok, 'X-Box': LEAD } }) === 403, 'or anyone else\'s box');
  assert(await call('/send/' + other, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'X-Box': LEAD, 'Content-Type': 'application/json' }, body: JSON.stringify({ blob: 'abc' }) }) === 403, 'or put into anyone else\'s box');
  assert(await call('/recv/' + LEAD, { headers: { Authorization: 'Bearer ' + 'x'.repeat(48), 'X-Box': LEAD } }) === 401, 'a wrong token is refused');
  const m0 = srv.store.msgs.find(m => m.box === LEAD);
  assert(await pc.evaluate(async b => { try { await Sync.unlock(new Uint8Array(32), b); return false; } catch (e) { return true; } }, m0.blob), 'a message cannot be opened without that person\'s key');

  /* removing a person stops their phone */
  await pa.evaluate(uid => perform('USER_UPDATED', null, { uid, active: false }, { as: 'POWNER', quiet: true }), LEAD);
  await syncNow(pa);
  assert(!(await srv.store.listBoxes()).includes(LEAD), 'when the office removes the person, their box is deleted');
  assert(await syncNow(pc) === 'revoked' && /removed from the server/.test(await pc.evaluate(() => Sync.line())), 'their phone is told it was removed');

  /* server down: work goes on, it just waits */
  await srv.close();
  await pa.evaluate(pid => perform('CHAT_POSTED', pid, { kind: 'message', text: 'Offline note' }, { quiet: true }), H);
  assert(await syncNow(pa) === 'err' && await pa.evaluate(pid => S.projects[pid].chat.some(m => m.text === 'Offline note'), H), 'with the server down, work is saved on the phone and sync waits');

  /* the screen */
  for (const lang of ['en', 'hi', 'mr']) {
    await pa.evaluate(lang => { LANG = lang; App.set.lang = lang; go('server'); }, lang); await pa.waitForTimeout(80);
    if (await pa.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll on server (' + lang + ')');
  }
  const { miss } = require('./lib'); const mm = await miss(pa);
  assert(!mm.length, 'no missing words' + (mm.length ? ': ' + mm.join(' ') : ''));
  for (const x of [A, B, C]) await x.browser.close();
  console.log('SERVER SYNC PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
