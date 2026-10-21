/* Notifications with sound: new work rings once, escalations ring louder, quiet hours, phone notifications in the background. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => {
    App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false;
    window.__notes = []; window.Notification = function (title, o) { window.__notes.push({ title, body: o.body }); }; window.Notification.permission = 'granted'; window.Notification.requestPermission = async () => 'granted';
  });
  await page.evaluate(() => enterPractice()); await page.waitForTimeout(4500);
  /* a lead added on another phone (arrives without ringing the sender's own check) */
  await page.evaluate(() => { const ph = () => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'building', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} });
    window.__lead = pid => perform('LEAD_CREATED', pid, { safe: true, ev: [ph(), ph()], gps: { lat: 18.5, lng: 73.8, acc: 10 }, address: 'Test road', landmark: '', name: 'Mr. ' + pid, phone: '9822001234', shaft: 'yes', floors: 4 }, { as: 'PFIELD', noSave: true, quiet: true }); });
  const log = () => page.evaluate(() => (App.notifyLog || []).slice());

  await page.evaluate(() => { loginAs(S.users.PSALES); ACT.permsDone(); }); await page.waitForTimeout(1300);
  let l = await log();
  assert(l.length === 1 && /new tasks for you|New work/.test(l[0].title), 'logging in announces the waiting work once: ' + (l[0] && l[0].title));
  assert(await page.$('#ntf .ntf'), 'a message appears at the top of the screen');
  assert((await page.evaluate(() => Notify.check())).length === 0 && (await log()).length === 1, 'nothing new → no second sound');

  /* new work arriving from another phone */
  await page.evaluate(async () => { await window.__lead('AIEC-PX1'); });
  const fresh = await page.evaluate(() => Notify.check().map(n => n.k));
  l = await log();
  assert(fresh.includes('review_lead') && l.length === 2 && l[1].kind === 'task' && /Check new lead|review/i.test(l[1].title + l[1].body), 'a new lead for Sales rings the "new task" sound: ' + l[1].title);

  /* the same work moving up the escalation ladder rings again, louder */
  await page.evaluate(() => { loginAs(S.users.POWNER); ACT.permsDone(); }); await page.waitForTimeout(1300);
  const n0 = (await log()).length;
  await page.evaluate(() => { S.projects['AIEC-P005'].since = new Date(Date.now() - 2 * 864e5).toISOString(); Notify.check({ silent: true }); S.projects['AIEC-P005'].since = new Date(Date.now() - 8 * 864e5).toISOString(); });
  await page.evaluate(() => Notify.check());
  l = await log();
  assert(l.length === n0 + 1 && l[l.length - 1].kind === 'alarm' && /stuck/i.test(l[l.length - 1].title), 'work reaching the Owner level plays the siren: ' + l[l.length - 1].title);

  /* quiet hours */
  await page.evaluate(() => { Notify.save('quiet', true); const h = new Date(); const f = n => String(n).padStart(2, '0'); Notify.save('qFrom', f(h.getHours()) + ':00'); Notify.save('qTo', f((h.getHours() + 2) % 24) + ':00'); });
  await page.evaluate(async () => { await window.__lead('AIEC-PX2'); loginAs(S.users.PSALES); });
  await page.waitForTimeout(1300);
  l = await log();
  assert(l[l.length - 1].quiet === true, 'during quiet hours a new task shows silently');
  await page.evaluate(() => Notify.save('quiet', false));

  /* app in the background → phone notification */
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); });
  await page.evaluate(async () => { await window.__lead('AIEC-PX3'); Notify.check(); });
  await page.waitForTimeout(300);
  const notes = await page.evaluate(() => window.__notes);
  assert(notes.length === 1 && /AIEC-PX3/.test(notes[0].body), 'in the background a phone notification is shown: ' + JSON.stringify(notes[0]));
  await page.evaluate(() => { delete document.hidden; });

  /* own actions never ring */
  const before = (await log()).length;
  await page.evaluate(() => perform('LEAD_ACCEPTED', 'AIEC-PX3', {}, { quiet: true }));
  await page.evaluate(() => Notify.check());
  assert((await log()).length === before, 'my own action does not ring for the next step I already know about');

  /* settings screen */
  await page.evaluate(() => go('notify')); await page.waitForTimeout(200);
  await page.click('[data-a="ntfTest"][data-v="alarm"]'); await page.waitForTimeout(200);
  assert(await page.evaluate(() => !!Notify.ctx), 'tapping a test button plays the sound (audio started)');
  await page.click('[data-a="ntfToggle"][data-v="sound"]'); await page.waitForTimeout(100);
  assert(await page.evaluate(() => Notify.set().sound === false && App.set.notify.sound === false), 'sound can be switched off and is remembered');
  await page.click('[data-a="ntfVol"][data-v="3"]');
  assert(await page.evaluate(() => Notify.set().vol === 3), 'volume can be set');
  for (const lang of ['en', 'hi', 'mr']) {
    await page.evaluate(lang => { LANG = lang; go('notify'); }, lang); await page.waitForTimeout(80);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll on notify (' + lang + ')');
    await page.evaluate(() => { Notify.banner(t('ntf_many', { n: 3 }), t('tk_review_lead') + ' · AIEC-P001', 'alarm'); });
  }
  await page.evaluate(() => go('perms')); await page.waitForTimeout(80);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('NOTIFICATIONS PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
