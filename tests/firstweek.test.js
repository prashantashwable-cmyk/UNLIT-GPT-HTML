/* A new person's first minutes and first week: a short start page, no pop-up of every open job, a calm practice note with
   a guided first job, the first-week card (who to call, buddy, first site), repeated jobs grouped, read-aloud on notes,
   and the office's view of new people with a buddy who is asked to help when someone is stuck. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { page, browser, errors } = await launch({ viewport: { width: 360, height: 760 } });
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const main = () => page.innerText('main');

  /* the first screen after the first login is short */
  await page.evaluate(() => { loginAs(S.users.PTECH); }); await page.waitForTimeout(1200);
  assert(await page.evaluate(() => App.route.name) === 'perms', 'the first login shows the start page once');
  const words = (await main()).split(/\s+/).length;
  assert(words < 110 && /I agree\. Start/.test(await page.innerText('.foot')), 'it is short (' + words + ' words) with one clear button');
  assert(!(await page.$('#ntf .ntf')), 'no pop-up of every open job covers the screen');
  assert(await page.evaluate(() => document.querySelector('.top').getBoundingClientRect().height < 70), 'the top bar fits in one line on a small phone');
  await page.click('[data-a="permsDone"]'); await page.waitForTimeout(300);

  /* practice: calm note with a guided first job */
  assert(/This is a practice company/.test(await main()) && await page.$('[data-a="calmTry"]'), 'practice explains that late work is on purpose and offers a first job');
  await page.click('[data-a="calmTry"]'); await page.waitForTimeout(400);
  assert(await page.evaluate(() => App.route.name === 'wiz' || App.route.name === 'cl' || App.route.name === 'project'), 'the guided first job opens');
  await page.evaluate(() => { W = null; go('home'); }); await page.waitForTimeout(200);
  assert(!/This is a practice company/.test(await main()), 'the note does not come back');

  /* a new technician approved today */
  await page.evaluate(async () => { loginAs(S.users.PADMIN); ACT.permsDone();
    const salt = 'abcdabcdabcdabcd'; await run([['USER_ADDED', null, { uid: 'UNEW1', name: 'Santosh Gaikwad', role: 'tech', salt, pin: await pinHash('2468', salt), pinLen: 4 }], ['WORKER_PROFILE', null, { uid: 'UNEW1', phone: '9876512345', area: 'Pune', skills: ['install'], availability: 'available' }]]); });
  await page.evaluate(() => { go('home'); }); await page.waitForTimeout(200);
  assert(/New people \(first 2 weeks\)/.test(await main()), 'Admin sees the new people card');
  await page.evaluate(() => { document.querySelector('[data-fold="newpeople"]') && document.querySelector('[data-fold="newpeople"]').setAttribute('open', ''); }); await page.waitForTimeout(100);
  assert(/Santosh Gaikwad/.test(await main()) && /Has not used the app yet/.test(await main()), 'it shows who has not started');
  await page.evaluate(() => ACT.buddyPick('UNEW1')); await page.waitForTimeout(150);
  const buddy = await page.evaluate(() => document.querySelector('#ov [data-a="buddySet"]').dataset.v.split('|')[1]);
  await page.click(`#ov [data-a="buddySet"][data-v="UNEW1|${buddy}"]`); await page.waitForTimeout(300);
  assert(await page.evaluate(b => S.workers.UNEW1.buddy === b, buddy), 'Admin picks a buddy');

  await page.evaluate(() => { loginAs(S.users.UNEW1); ACT.permsDone(); Notify.hide(); go('home'); }); await page.waitForTimeout(300);
  const nh = await main();
  assert(/Your first week/.test(nh) && /If you are stuck, call/.test(nh) && /Your buddy/.test(nh), 'the new technician sees who to call and their buddy');
  assert(!/No company/.test(nh), 'no confusing "No company" chip');
  assert(await page.evaluate(() => { const d = document.querySelector('details[data-fold="onb"]'); return !d || d.open; }), 'the first-week steps are open');

  /* stuck for 2 days: the buddy is asked to help */
  await page.evaluate(() => { S.users.UNEW1.t = new Date(Date.now() - 3 * 864e5).toISOString(); });
  assert(await page.evaluate(b => myTasks(S.users[b]).some(n => n.k === 'help_newbie' && n.uid === 'UNEW1'), buddy), 'the buddy gets "Help the new person get started" when they are stuck');
  await page.evaluate(b => { loginAs(S.users[b]); ACT.permsDone(); Notify.hide(); const i = App.tasks.findIndex(n => n.k === 'help_newbie'); ACT.openTask(String(i)); }, buddy); await page.waitForTimeout(300);
  assert(/Help the new person/.test(await page.innerText('#ov')) && /9876512345/.test(await page.innerText('#ov')), 'the buddy sees the person, their number and their steps');
  await page.evaluate(() => closeSheet());

  /* repeated jobs are grouped */
  await page.evaluate(() => { loginAs(S.users.PADMIN); Notify.hide(); App.form = {}; go('home'); }); await page.waitForTimeout(300);
  const grouped = await page.evaluate(() => [...document.querySelectorAll('[data-a="taskGroup"]')].map(b => b.dataset.v));
  assert(grouped.length >= 1, 'the same job three or more times shows once with a count: ' + grouped.join(','));
  await page.click(`[data-a="taskGroup"][data-v="${grouped[0]}"]`); await page.waitForTimeout(200);
  assert(!(await page.$(`[data-a="taskGroup"][data-v="${grouped[0]}"]`)), 'one tap opens them');

  /* read aloud on notes */
  await page.evaluate(() => { loginAs(S.users.PFIELD); ACT.permsDone(); Notify.hide(); const i = App.tasks.findIndex(n => n.k === 'fix_lead'); ACT.openTask(String(i)); }); await page.waitForTimeout(300);
  assert(await page.$('[data-a="sayText"]'), 'the reason a lead came back can be read aloud');

  /* supplier: the answer comes first, the button says what it does */
  await page.evaluate(() => { W = null; loginAs(S.users.PSUP); ACT.permsDone(); Notify.hide(); const i = App.tasks.findIndex(n => n.k === 'accept_po'); ACT.openTask(String(i)); }); await page.waitForTimeout(300);
  assert(/Send my answer/.test(await page.innerText('.foot')) && await page.evaluate(() => document.querySelector('main [data-k="ok"]').getBoundingClientRect().top < 500), 'the supplier sees Accept / Cannot first, and "Send my answer"');

  for (const lang of ['hi', 'mr']) { await page.evaluate(l => { W = null; LANG = l; App.set.lang = l; loginAs(S.users.UNEW1); go('home'); }, lang); await page.waitForTimeout(150);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll ' + lang); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('FIRST WEEK PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
