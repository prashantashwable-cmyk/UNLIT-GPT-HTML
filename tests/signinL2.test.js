/* Clear account states and refusals: a "not allowed" message names who can do it; a person whose access was stopped
   sees why and whom to call; the staff list explains a missing name; three PIN lock-outs in a row tell the office;
   an ended licence or certificate blocks work with a clear red message and what to do. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err), txt: r.err ? errText(r.err) : '' })), [type, pid, data, as]);
  const r1 = await act('LEGAL_SET', null, { uid: 'PTECH', k: 'height', no: 'X1', expiry: '2026-12-01' }, 'PSALES');
  assert(r1.err === 'err_role' && /Ask .+\./.test(r1.txt), 'a refusal names who can do it: ' + r1.txt);
  /* ended paper */
  assert((await act('LEGAL_SET', null, { uid: 'PTECH', k: 'height', no: 'WAH-1', expiry: '2026-10-01' }, 'PADMIN')).ok, 'a certificate that has ended is on record');
  await page.evaluate(() => { loginAs(S.users.PTECH); ACT.permsDone(); Notify.hide(); go('home'); }); await page.waitForTimeout(250);
  assert(/Work blocked: a paper has ended/.test(await page.innerText('main')) && /Work-at-height certificate ended/.test(await page.innerText('main')), 'the technician sees "work blocked" with the paper and what to do');
  /* PIN lock-outs */
  await page.evaluate(async () => { App.me = null; App.route = { name: 'pin', p: { uid: 'PSALES' } }; for (let i = 0; i < 15; i++) { App.set.lock = App.set.lock || {}; if (App.set.lock.PSALES) App.set.lock.PSALES.until = 0; App.form.pin = '9999'; await tryPin('PSALES'); } });
  await page.waitForTimeout(400);
  assert(await ev(`!!S.pinAlerts.PSALES && !S.pinAlerts.PSALES.seen`), 'after three lock-outs in a row the office is told');
  assert(await ev(`myTasks(S.users.PADMIN).some(n => n.k === 'pin_alert' && n.uid === 'PSALES')`), 'Admin gets "several wrong PIN tries: check with the person"');
  assert((await act('PIN_ALERT_SEEN', null, { uid: 'PSALES', note: 'He forgot it; new PIN given' }, 'PADMIN')).ok && !(await ev(`myTasks(S.users.PADMIN).some(n => n.k === 'pin_alert')`)), 'the office records what it found and the task goes');
  /* stopped access */
  assert((await act('USER_UPDATED', null, { uid: 'PFIELD', active: false }, 'POWNER')).ok && await ev(`!!S.users.PFIELD.stoppedT`), 'stopping a person keeps the date');
  await page.evaluate(() => { App.me = null; App.set.lastUser = 'PFIELD'; go('gate'); }); await page.waitForTimeout(250);
  assert(/Access for .+ was stopped on/.test(await page.innerText('#app')), 'on that phone, the gate says the access was stopped and to call the office');
  await page.evaluate(() => go('door', { kind: 'staff' })); await page.waitForTimeout(200);
  assert(/My name is not here/.test(await page.innerText('#app')), 'the staff list explains a missing name');
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('SIGN-IN L2 PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
