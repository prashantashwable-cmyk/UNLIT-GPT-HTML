/* Safer sign-in for money and control: refunds, waivers, role changes, rule changes and data exports ask for the PIN
   again (with a 2-minute grace after a PIN); cancelling or a wrong PIN changes nothing and three wrong PINs lock the
   app; fingerprint unlock is optional and the PIN keeps working; one staff login used on two phones in 7 days tells
   the office, who record what they found. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  await page.evaluate(() => { loginAs(S.users.POWNER); ACT.permsDone(); Notify.hide(); go('home'); App.forceRecheck = true; App.pinAt = 0; }); await page.waitForTimeout(250);
  /* a rule change asks for the PIN */
  await page.evaluate(() => { window._r = perform('CONFIG_SET', null, { key: 'sundayWork', value: 1 }); }); await page.waitForTimeout(250);
  assert(/Enter your PIN again/.test(await page.innerText('#ov')), 'a rule change asks for the PIN again, saying why');
  await page.click('#ov [data-a="closeSheet"]'); await page.waitForTimeout(150);
  assert((await page.evaluate(() => window._r.then(r => r.err))) === 'err_pin_recheck' && await ev(`S.config.sundayWork !== 1`), 'closing the box changes nothing');
  await page.evaluate(() => { window._r = perform('CONFIG_SET', null, { key: 'sundayWork', value: 1 }); }); await page.waitForTimeout(200);
  await page.fill('#rpin', '9999'); await page.click('[data-a="recheckGo"]'); await page.waitForTimeout(250);
  assert(/Wrong PIN/.test(await page.innerText('#ov')), 'a wrong PIN is refused and says how many tries are left');
  await page.fill('#rpin', '1111'); await page.click('[data-a="recheckGo"]'); await page.waitForTimeout(300);
  assert((await page.evaluate(() => window._r.then(r => r.ok))) && await ev(`S.config.sundayWork === 1`), 'the right PIN lets the change through');
  assert((await page.evaluate(() => perform('CONFIG_SET', null, { key: 'sundayWork', value: 0 }).then(r => r.ok))) && !(await page.$('#rpin')), 'no second ask within two minutes');
  /* what needs it and what does not */
  assert(await ev(`RECHECK('REFUND_DECIDED', {}) && RECHECK('REFUND_PAID', {}) && RECHECK('CHARGE_SETTLED', { how: 'waived' }) && !RECHECK('CHARGE_SETTLED', { how: 'paid' }) && RECHECK('USER_UPDATED', { role: 'admin' }) && !RECHECK('USER_UPDATED', { phone: '9' }) && RECHECK('DATA_EXPORTED', {}) && !RECHECK('PAYMENT_RECORDED', {})`), 'refunds, waivers, role changes, rules and exports need it; normal work does not');
  /* an export asks too */
  await page.evaluate(() => { App.pinAt = 0; window._x = exportFile('person', App.me.uid); }); await page.waitForTimeout(250);
  assert(/Enter your PIN again/.test(await page.innerText('#ov')), 'taking data off the phone asks for the PIN');
  await page.click('#ov [data-a="closeSheet"]'); await page.waitForTimeout(150);
  /* three wrong PINs lock the app */
  await page.evaluate(() => { App.pinAt = 0; window._r = perform('USER_UPDATED', null, { uid: 'PSALES', role: 'admin' }); }); await page.waitForTimeout(200);
  for (let i = 0; i < 3; i++) { await page.fill('#rpin', '0000'); await page.click('[data-a="recheckGo"]'); await page.waitForTimeout(150); }
  assert(await ev(`App.locked && App.route.name === 'pin'`) && await ev(`S.users.PSALES.role === 'sales'`), 'three wrong PINs lock the app and the role is not changed');
  await page.evaluate(() => { App.form.pin = '1111'; return tryPin('POWNER'); }); await page.waitForTimeout(200);
  /* fingerprint: optional, PIN-protected to turn on, PIN still works */
  await page.evaluate(() => { Bio.ok = true; navigator.credentials.create = async () => ({ rawId: new Uint8Array([1, 2, 3]).buffer }); navigator.credentials.get = async () => ({ id: 'x' }); App.pinAt = 0; go('me'); }); await page.waitForTimeout(200);
  assert(/Fingerprint or face unlock/.test(await page.textContent('main')), 'Me offers fingerprint unlock where the phone has it');
  await page.evaluate(() => { window._b = ACT.bioToggle(); }); await page.waitForTimeout(200);
  assert(!!(await page.$('#rpin')), 'turning it on asks for the PIN first');
  await page.fill('#rpin', '1111'); await page.click('[data-a="recheckGo"]'); await page.waitForTimeout(300);
  assert(await ev(`Bio.has('POWNER')`), 'fingerprint unlock is on for this person on this phone');
  await page.evaluate(() => { App.me = null; go('pin', { uid: 'POWNER' }); }); await page.waitForTimeout(200);
  assert(await page.$('[data-a="bioLogin"]') && await page.$('.pinpad'), 'the PIN screen offers the fingerprint and keeps the PIN pad');
  await page.click('[data-a="bioLogin"]'); await page.waitForTimeout(300);
  assert(await ev(`App.me && App.me.uid === 'POWNER'`), 'the fingerprint signs in');
  await page.evaluate(() => { navigator.credentials.get = async () => { throw new Error('no'); }; App.me = null; go('pin', { uid: 'POWNER' }); }); await page.waitForTimeout(150);
  await page.click('[data-a="bioLogin"]'); await page.waitForTimeout(200);
  assert(await ev(`!App.me`), 'a refused fingerprint does not sign in');
  await page.evaluate(() => { App.form.pin = '1111'; return tryPin('POWNER'); }); await page.waitForTimeout(200);
  /* one login on two phones */
  assert(await ev(`!devAlert(S, 'PTECH', nowISO())`), 'one phone: no alert');
  await page.evaluate(() => { const d0 = App.set.dev; App.set.dev = 'PHONE-B-xyz'; return perform('DEVICE_USED', null, {}, { as: 'PTECH', quiet: true }).then(() => { App.set.dev = d0; }); });
  assert(await ev(`devAlert(S, 'PTECH', nowISO()) && myTasks(S.users.PADMIN).some(n => n.k === 'dev_alert' && n.uid === 'PTECH')`), 'a second phone within 7 days gives the office a task');
  assert(await ev(`!devAlert(S, 'PTECH', new Date(Date.now() + 8 * 864e5).toISOString())`), 'phones used more than 7 days apart do not alert');
  await page.evaluate(() => { const d0 = App.set.dev; App.set.dev = 'PHONE-C-abc'; return perform('DEVICE_USED', null, {}, { as: 'POWNER', quiet: true }).then(() => { App.set.dev = d0; }); });
  assert(await ev(`!devAlert(S, 'POWNER', nowISO())`), 'the Owner on phone and laptop does not alert');
  await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('home'); }); await page.waitForTimeout(200);
  await page.evaluate(() => wiz('devAlert', null, { uid: 'PTECH' })); await page.waitForTimeout(200);
  assert(/Used on 2 phones/.test(await page.innerText('#app')), 'the office sees how many phones');
  assert((await page.evaluate(() => perform('DEVICE_ALERT_SEEN', null, { uid: 'PTECH', note: 'New phone; old one broke' }, { quiet: true }).then(r => r.ok))) && await ev(`!devAlert(S, 'PTECH', nowISO())`), 'the office records what it found and the alert goes');
  assert(await ev(`(() => { const S2 = rebuild(EVENTS); return !devAlert(S2, 'PTECH', nowISO()) && S2.devAck.PTECH.notes.length === 1; })()`), 'the same result after a rebuild');
  const mm = await miss(page); assert(!mm.length, 'no missing words' + (mm.length ? ': ' + mm.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('SIGN-IN L4 PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
