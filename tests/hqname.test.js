/* Privacy: the Owner's personal name is never shown in the app; everyone sees HEAD QUARTER. The only exception is the
   top card of the Owner's own Me page. Old records that carry the name rebuild to HEAD QUARTER; a person moved off
   the Owner role gets their own name back. */
const fs = require('fs');
const path = require('path');
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'AIEC-Elevator-OS.html'), 'utf8');
  const hits = src.split('\n').filter(l => /prashant|wable/i.test(l));
  assert(hits.length === 2 && hits.some(l => /^const APP_OWNER/.test(l)) && hits.some(l => /^const APP_URL/.test(l)), 'the name is in the app file only for the Owner\'s own Me card (and the web address)');
  const { page, browser, errors } = await launch();
  const NAME = 'Ravindra Q Testowner';
  await page.evaluate(async n => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; App.set.mode = 'real'; await loadMode('real');
    App.form = { org: 'Test Lifts', name: n, pin1: '1234', pin2: '1234' }; await ACT.createOrg(); }, NAME);
  await page.waitForTimeout(1500);
  const owner = await page.evaluate(() => App.me.uid);
  const all = () => page.evaluate(() => document.body.innerText + ' ' + document.body.textContent);
  await page.evaluate(() => { ACT.permsDone(); Notify.hide(); go('home'); }); await page.waitForTimeout(250);
  let txt = await all();
  assert(!txt.includes('Ravindra') && /HEAD QUARTER/.test(txt), 'the Owner\'s home shows HEAD QUARTER, not the name');
  await page.evaluate(() => go('me')); await page.waitForTimeout(250);
  assert(await page.evaluate(n => document.querySelector('main .hero').innerText.includes(n), NAME), 'the Owner\'s own Me card shows their name');
  assert(await page.evaluate(() => { const c = [...document.querySelectorAll('main .card')].find(x => /🏛️/.test(x.textContent)); return !c || !/Ravindra/.test(c.textContent); }), 'the HQ card does not show the name');
  const meRest = await page.evaluate(() => [...document.querySelectorAll('main > *')].filter(x => !x.classList.contains('hero')).map(x => x.textContent).join(' '));
  assert(!meRest.includes('Ravindra'), 'nowhere else on the Me page');
  await page.evaluate(() => go('about')); await page.waitForTimeout(200);
  txt = await all(); assert(!txt.includes('Ravindra') && /© HEAD QUARTER/.test(txt), 'About shows © HEAD QUARTER');
  /* other people's view */
  await page.evaluate(async () => { const salt = 'abcdabcd'; await perform('USER_ADDED', null, { uid: 'UADM1', name: 'Sunita', role: 'admin', salt, pin: await pinHash('5555', salt), pinLen: 4 }, { quiet: true }); });
  await page.evaluate(() => { loginAs(S.users.UADM1); ACT.permsDone(); Notify.hide(); go('users'); }); await page.waitForTimeout(300);
  txt = await all(); assert(!txt.includes('Ravindra') && /HEAD QUARTER/.test(txt), 'Admin\'s people list shows HEAD QUARTER');
  await page.evaluate(() => go('chat')); await page.waitForTimeout(200);
  assert(!(await all()).includes('Ravindra'), 'chat does not show the name');
  await page.evaluate(() => { App.me = null; go('door', { kind: 'staff' }); }); await page.waitForTimeout(200);
  txt = await all(); assert(!txt.includes('Ravindra') && /HEAD QUARTER/.test(txt), 'the sign-in list shows HEAD QUARTER');
  await page.evaluate(u => go('pin', { uid: u }), owner); await page.waitForTimeout(150);
  assert(!(await all()).includes('Ravindra'), 'the PIN screen does not show the name');
  assert(await page.evaluate(u => userName(u) === 'HEAD QUARTER' && rebuild(EVENTS).users[u].name === 'HEAD QUARTER', owner), 'old records rebuild to HEAD QUARTER');
  /* role moved off Owner: own name again */
  assert(await page.evaluate(() => { const x = { role: 'owner', name: 'Asha' }; hqName(x); const a = x.name === 'HEAD QUARTER' && x.realName === 'Asha'; x.role = 'admin'; hqName(x); return a && x.name === 'Asha' && !x.realName; }), 'a person moved off the Owner role shows their own name again');
  /* practice company too */
  await page.evaluate(() => enterPractice()); await page.waitForTimeout(6000);
  assert(await page.evaluate(() => S.users.POWNER.name === 'HEAD QUARTER'), 'the practice Owner is HEAD QUARTER');
  const mm = await miss(page); assert(!mm.length, 'no missing words' + (mm.length ? ': ' + mm.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('HQ NAME PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
