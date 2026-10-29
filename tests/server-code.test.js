/* Login on a new phone with a one-time code from the office: the person's data waits on the company server, locked with the code.
   Wrong codes are counted (5 tries), a code works once, and expires. No file needs to be sent. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { startLocal } = await import('../server/local.mjs');
  const srv = await startLocal(0, { ADMIN_SECRET: 'test-secret-123' }), url = 'http://127.0.0.1:' + srv.port;
  const A = await launch(), pa = A.page;
  await pa.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await pa.waitForTimeout(6000);
  await pa.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); });
  const LEAD = await pa.evaluate(() => Object.values(S.projects).find(x => x.stage === 'installing').tech);

  /* office: the button appears only with the server on */
  await pa.evaluate(uid => { go('users'); ACT.userOpen(uid); }, LEAD); await pa.waitForTimeout(150);
  assert(!(await pa.$('[data-a="codeFor"]')), 'no login code before the company server is on');
  await pa.evaluate(() => closeSheet());
  assert(await pa.evaluate(u => Sync.enable(u, 'test-secret-123'), url) === null, 'the office turns the server on');
  await pa.evaluate(uid => ACT.userOpen(uid), LEAD); await pa.waitForTimeout(150);
  await pa.click('[data-a="codeFor"]'); await pa.waitForTimeout(150);
  await pa.fill('[data-f="codePhone"]', '98220 11223'); await pa.click('[data-a="codeMake"]'); await pa.waitForTimeout(2500);
  const code = await pa.evaluate(() => App.form.codeOut);
  assert(/^\d{6}$/.test(code) && /Tell them this code on a phone call/.test(await pa.innerText('#ov')), 'the office gets a 6-digit code to tell on a call');
  const inv = [...srv.store.invites.values()][0];
  assert(inv && !JSON.stringify(inv).includes(code) && !inv.blob.includes('aiec-elevator-os'), 'the server keeps only a locked file and a fingerprint of the code');

  /* new phone */
  const D = await launch(), pd = D.page;
  await pd.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.mode = 'practice'; }); await pd.evaluate(() => loadMode('practice'));
  await pd.evaluate(() => go('door', { kind: 'staff' })); await pd.waitForTimeout(100);
  assert(await pd.$('[data-a="nav"][data-v="codeLogin"]'), 'the staff door offers "I have a login code"');
  await pd.click('[data-a="nav"][data-v="codeLogin"]'); await pd.waitForTimeout(100);
  await pd.fill('[data-f="clUrl"]', url); await pd.fill('[data-f="clPhone"]', '9822011223');
  await pd.fill('[data-f="clCode"]', code === '111111' ? '222222' : '111111'); await pd.click('[data-a="codeOpen"]'); await pd.waitForTimeout(1500);
  assert(/Wrong code\. 4 tries left/.test(await pd.innerText('main')), 'a wrong code says how many tries are left');
  await pd.fill('[data-f="clCode"]', code); await pd.click('[data-a="codeOpen"]'); await pd.waitForTimeout(3000);
  assert(await pd.evaluate(() => App.route.name) === 'door' && await pd.$(`[data-a="loginUser"]`), 'the right code brings their data; they choose their name');
  assert(await pd.evaluate(uid => !!S.users[uid] && Sync.cfg() && Sync.cfg().role === 'person' && Sync.cfg().box === uid, LEAD), 'the new phone is connected to the server for automatic sync');
  assert(srv.store.invites.size === 0, 'the code works once and is then deleted');

  /* used, expired, too many tries */
  assert(await pd.evaluate(([u, c]) => Sync.openCode(u, '9822011223', c).then(r => r.err), [url, code]) === 'code_gone', 'the same code cannot be used again');
  const r2 = await pa.evaluate(uid => Sync.invite(uid, '9822011223'), LEAD);
  for (let i = 0; i < 5; i++) await pd.evaluate(([u, c]) => Sync.openCode(u, '9822011223', c), [url, r2.code === '123456' ? '654321' : '123456']);
  assert(srv.store.invites.size === 0 && await pd.evaluate(([u, c]) => Sync.openCode(u, '9822011223', c).then(r => r.err), [url, r2.code]) === 'code_gone', 'after 5 wrong tries the code is deleted');
  const r3 = await pa.evaluate(uid => Sync.invite(uid, '9822011223'), LEAD);
  for (const v of srv.store.invites.values()) v.exp = '2000-01-01T00:00:00.000Z';
  assert(await pd.evaluate(([u, c]) => Sync.openCode(u, '9822011223', c).then(r => r.err), [url, r3.code]) === 'code_gone', 'an expired code does not work');
  assert(await pa.evaluate(uid => Sync.invite(uid, '12345'), LEAD).then(r => r.err) === 'err_phone', 'a wrong mobile number is refused');

  /* the join link carries the server address, so new phones need not type it */
  assert(await pa.evaluate(u => new URLSearchParams(joinUrl().split('#')[1]).get('s') === u, url), 'the join link carries the server address');
  assert(await pa.evaluate(() => parseJoin('#j=1&n=X&s=https%3A%2F%2Fsync.example.in').srv === 'https://sync.example.in' && parseJoin('#j=1&n=X&s=javascript:alert(1)').srv === ''), 'only a real https address is taken from a link');

  for (const lang of ['en', 'hi', 'mr']) {
    await pd.evaluate(lang => { LANG = lang; App.set.lang = lang; App.me = null; go('codeLogin'); }, lang); await pd.waitForTimeout(80);
    if (await pd.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll (' + lang + ')');
  }
  await pa.evaluate(uid => { LANG = 'mr'; App.form.codeUid = uid; App.form.codeOut = null; codeSheet(); }, LEAD); await pa.waitForTimeout(80);
  const m1 = await miss(pa), m2 = await miss(pd);
  assert(!m1.length && !m2.length, 'no missing words' + (m1.concat(m2).length ? ': ' + m1.concat(m2).join(' ') : ''));
  await srv.close(); for (const x of [A, D]) await x.browser.close();
  console.log('SERVER CODE PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
