/* Main screens show only urgent work; everything else is folded and remembers how the person left it. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; });
  await page.evaluate(() => enterPractice()); await page.waitForTimeout(4500);
  await page.evaluate(() => { loginAs(S.users.POWNER); ACT.permsDone(); Notify.hide(); }); await page.waitForTimeout(200);
  const vis = sel => page.evaluate(sel => [...document.querySelectorAll(sel)].filter(e => e.checkVisibility()).length, sel);
  const hot = await page.evaluate(() => App.tasks.filter(isHot).length), all = await page.evaluate(() => App.tasks.length);
  assert(await vis('main > .task[data-a="openTask"]') === Math.min(hot, 8), `only urgent work is shown open (${hot} of ${all})`);
  assert(await page.evaluate(() => ['tasks', 'queues', 'dash'].every(k => { const d = document.querySelector(`details[data-fold="${k}"]`); return d && !d.open; })), 'other work, queues and the dashboard start folded');
  assert(await vis('.kpis') === 0, 'dashboard numbers are hidden until opened');
  await page.click('details[data-fold="dash"] > summary'); await page.waitForTimeout(150);
  assert(await vis('.kpis') === 1, 'one tap opens the dashboard');
  await page.evaluate(() => { go('me'); go('home'); }); await page.waitForTimeout(150);
  assert(await page.evaluate(() => document.querySelector('details[data-fold="dash"]').open), 'it stays open after moving between screens');
  await page.click('details[data-fold="tasks"] > summary'); await page.waitForTimeout(150);
  const n = await vis('details[data-fold="tasks"] .task');
  await page.locator('details[data-fold="tasks"] .task').first().click(); await page.waitForTimeout(250);
  assert(n === all - hot && await page.evaluate(() => App.route.name !== 'home' || !!W), 'folded work opens like any other task');
  /* Owner and Admin have different lists */
  const oa = await page.evaluate(() => { const f = u => myTasks(S.users[u]).filter(n => n.k !== 'escalated').map(n => n.k + '|' + (n.pid || n.uid || '') + '|' + (n.week || '')); return { o: f('POWNER'), a: f('PADMIN') }; });
  assert(oa.a.length && !oa.o.some(x => oa.a.includes(x)), 'Head Quarter and Admin never get the same task: ' + oa.o.map(x => x.split('|')[0]).join(',') + ' / ' + oa.a.map(x => x.split('|')[0]).join(','));
  /* approving a discount above Admin's limit is a Head Quarter decision by the company's own rule */
  assert(oa.o.every(x => /^(second_approval|check_docs|strike_appeal|promotion_ready|sos|resolve_incident|approve_quote)/.test(x)), 'the Head Quarter gets no day-to-day work, only decisions about the Admin, discounts above the Admin limit and alarms: ' + oa.o.map(x => x.split('|')[0]).join(','));
  assert(oa.a.some(x => /^(approve_quote|approve_pay)/.test(x)), 'the Admin gets quotation and pay approvals');
  assert(await page.evaluate(() => { const P = S.projects['AIEC-P006']; P.since = new Date(Date.now() - 4 * 864e5).toISOString(); return myTasks(S.users.POWNER).some(n => n.k === 'escalated' && n.pid === 'AIEC-P006') === false && myTasks(S.users.PADMIN).some(n => n.k === 'escalated' && n.pid === 'AIEC-P006'); }), 'late field work goes to the Admin first');
  assert(await page.evaluate(() => { const P = S.projects['AIEC-P003']; const b = P.blockers.find(x => x.open); b.t = new Date(Date.now() - 4 * 864e5).toISOString(); return !myTasks(S.users.POWNER).some(n => n.k === 'escalated' && n.ref === 'resolve_blocker'); }), "the Admin's own late work does not go to the Head Quarter before the last level");
  assert(await page.evaluate(() => { const P = S.projects['AIEC-P003']; const b = P.blockers.find(x => x.open); b.t = new Date(Date.now() - 10 * 864e5).toISOString(); return myTasks(S.users.POWNER).some(n => n.k === 'escalated' && n.ref === 'resolve_blocker'); }), "still stuck after the last reminder: it reaches the Head Quarter");
  await page.evaluate(() => { loginAs(S.users.POWNER); ACT.permsDone(); Notify.hide(); });
  /* customer and technician */
  await page.evaluate(() => { loginAs(S.users.PCUST); ACT.permsDone(); Notify.hide(); }); await page.waitForTimeout(200);
  assert(await vis('.tiles .tile[data-a="openDocP"]') === 0 && await page.$('details[data-fold="cdocs"]'), 'customer papers and help are folded');
  const pageH = {}; await page.evaluate(() => { App.set.fold = {}; });
  for (const uid of ['POWNER', 'PADMIN', 'PTECH', 'PSALES', 'PCUST']) { await page.evaluate(uid => { loginAs(S.users[uid]); ACT.permsDone(); }, uid); await page.waitForTimeout(80); pageH[uid] = await page.evaluate(() => document.documentElement.scrollHeight); }
  console.log('page heights', JSON.stringify(pageH));
  assert(pageH.POWNER < 2600 && pageH.PADMIN < 2600, 'Owner/Admin home is short');
  for (const lang of ['hi', 'mr']) { await page.evaluate(lang => { LANG = lang; loginAs(S.users.POWNER); go('home'); }, lang); await page.waitForTimeout(60); if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll ' + lang); }
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('HOME FOLD PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
