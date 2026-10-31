/* Head Quarter forgot the PIN: only the recovery code on paper can set a new one, on a phone that holds the company's
   recovery key. Wrong codes are counted and locked out; Admin still cannot change Head Quarter's PIN. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { page, browser, errors } = await launch();
  await page.evaluate(async () => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; App.set.mode = 'real'; await loadMode('real');
    App.form = { org: 'Test Lifts', name: 'Prashant Wable', pin1: '1234', pin2: '1234' }; await ACT.createOrg(); });
  await page.waitForTimeout(1500);
  const owner = await page.evaluate(() => App.me.uid), main = () => page.innerText('main');
  /* the owner adds an Admin and makes the recovery code */
  const admin = await page.evaluate(async () => { const salt = 'abcdabcd'; await perform('USER_ADDED', null, { uid: 'UADM1', name: 'Sunita', role: 'admin', salt, pin: await pinHash('5555', salt), pinLen: 4 }, { quiet: true }); return 'UADM1'; });
  const code = await page.evaluate(() => Sync.newRecovery());
  assert(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){5}$/.test(code), 'Head Quarter has a recovery code on paper');

  /* Head Quarter forgot the PIN */
  await page.evaluate(u => { App.me = null; App.form = {}; go('pin', { uid: u }); }, owner); await page.waitForTimeout(200);
  assert(await page.$('[data-a="pinRecover"]'), 'the PIN screen offers "Forgot PIN? Use the recovery code"');
  await page.evaluate(() => { App.me = null; App.form = {}; go('pin', { uid: 'UADM1' }); }); await page.waitForTimeout(150);
  assert(!(await page.$('[data-a="pinRecover"]')), 'not for other people (Admin asks Head Quarter)');
  await page.evaluate(u => go('pin', { uid: u }), owner); await page.waitForTimeout(150);
  await page.click('[data-a="pinRecover"]'); await page.waitForTimeout(300);
  await page.fill('[data-f="prCode"]', 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF'); await page.fill('[data-f="prPin1"]', '2468'); await page.fill('[data-f="prPin2"]', '2468');
  await page.click('[data-a="pinRecoverGo"]'); await page.waitForTimeout(2500);
  assert(/does not match\. 4 tries left/.test(await main()) && !(await page.evaluate(() => App.me)), 'a wrong code is refused and counted');
  await page.fill('[data-f="prCode"]', code.toLowerCase()); await page.click('[data-a="pinRecoverGo"]'); await page.waitForTimeout(3000);
  assert(await page.evaluate(u => App.me && App.me.uid === u, owner), 'the right code (any letter case) sets the new PIN and logs Head Quarter in');
  assert(await page.evaluate(async u => S.users[u].pin === await pinHash('2468', S.users[u].salt) && S.users[u].pin !== await pinHash('1234', S.users[u].salt), owner), 'the new PIN works and the old one does not');
  assert(await page.evaluate(() => { S = rebuild(EVENTS.slice()); return !S.rejected.length; }), 'the change is a normal signed record; everything rebuilds');

  /* Admin still cannot change Head Quarter's PIN */
  const r = await page.evaluate(async ([o, a]) => { const salt = 'x1x1x1x1'; const x = await perform('USER_UPDATED', null, { uid: o, pin: await pinHash('0000', salt), salt, pinLen: 4 }, { as: a, quiet: true }); return x.ok; }, [owner, admin]);
  assert(!r, 'Admin still cannot change Head Quarter\'s PIN');

  /* too many wrong tries lock it */
  await page.evaluate(u => { App.me = null; App.form = {}; go('pin', { uid: u }); }, owner); await page.waitForTimeout(150);
  await page.click('[data-a="pinRecover"]'); await page.waitForTimeout(300);
  await page.fill('[data-f="prPin1"]', '1111'); await page.fill('[data-f="prPin2"]', '1111');
  for (let i = 0; i < 5; i++) { await page.fill('[data-f="prCode"]', 'ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZ' + i); await page.click('[data-a="pinRecoverGo"]'); await page.waitForTimeout(2200); }
  assert(/Too many wrong tries/.test(await main()), 'five wrong codes lock it for 15 minutes');
  await page.fill('[data-f="prCode"]', code); await page.click('[data-a="pinRecoverGo"]'); await page.waitForTimeout(800);
  assert(/Too many wrong tries/.test(await main()) && !(await page.evaluate(() => App.me)), 'even the right code waits until the lock ends');

  /* a phone without the recovery key says so honestly */
  await page.evaluate(async u => { await KV.del(App.ns + 'bk'); App.set.prLock = {}; App.me = null; go('pin', { uid: u }); }, owner); await page.waitForTimeout(150);
  await page.click('[data-a="pinRecover"]'); await page.waitForTimeout(300);
  assert(/has no recovery key/.test(await main()) && !(await page.$('[data-a="pinRecoverGo"]')), 'a phone without the recovery key explains what to do instead');

  for (const lang of ['hi', 'mr']) { await page.evaluate(l => { LANG = l; App.set.lang = l; render(); }, lang); await page.waitForTimeout(100);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll ' + lang); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('PIN RECOVER PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
