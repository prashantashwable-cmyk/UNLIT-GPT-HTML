/* Screen stays on while working (forms, installation checklist, alerts, lift help page), off elsewhere and when switched off in settings. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => {
    window._req = 0; window._rel = 0;
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window._req++; const l = new EventTarget(); l.release = async () => { window._rel++; l.dispatchEvent(new Event('release')); }; return l; } } });
    App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice();
  }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const settle = () => page.waitForTimeout(150);
  await page.evaluate(() => { loginAs(S.users.PSENIOR); ACT.permsDone(); Notify.hide(); go('home'); }); await settle();
  assert(!(await ev('!!Wake.lock')), 'on the home screen the screen may turn off as usual');
  await page.evaluate(() => go('cl', { pid: 'AIEC-P003', kind: 'sop' })); await settle();
  assert(await ev('!!Wake.lock') && await ev('window._req') >= 1, 'on the installation checklist the screen stays on');
  await page.evaluate(() => go('home')); await settle();
  assert(!(await ev('!!Wake.lock')) && await ev('window._rel') >= 1, 'leaving it lets the screen turn off again');
  await page.evaluate(async () => { await wiz('safety', 'AIEC-P003'); }); await settle();
  assert(await ev('!!Wake.lock'), 'while filling a form the screen stays on');
  await page.evaluate(() => { W = null; go('home'); ACT.toggleWake(); }); await settle();
  assert(await ev('App.set.wake === false'), 'the setting can be switched off');
  await page.evaluate(() => go('cl', { pid: 'AIEC-P003', kind: 'sop' })); await settle();
  assert(!(await ev('!!Wake.lock')), 'when switched off it is never kept on');
  await page.evaluate(() => { ACT.toggleWake(); go('me'); }); await settle();
  for (const lang of ['hi', 'mr']) { await page.evaluate(lang => { LANG = lang; go('me'); }, lang); await page.waitForTimeout(60); }
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('WAKE PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
