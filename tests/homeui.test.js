/* Office home from the second review: what changed since yesterday comes first; one urgent strip instead of five signals
   (the SOS button stays); one search finds a job by number, mobile or lift code; sections can be pinned; task cards say
   what / which job / why now; a refusal stays on screen until the next saved action. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const home = async uid => { await page.evaluate(uid => { loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); App.form = {}; go('home'); }, uid); await page.waitForTimeout(250); };

  /* a busy morning: escalations and urgent work open together */
  await page.evaluate(() => { S.projects['AIEC-P006'].since = new Date(Date.now() - 12 * 864e5).toISOString(); S.projects['AIEC-P005'].since = new Date(Date.now() - 6 * 864e5).toISOString(); });
  await home('PADMIN');
  const first = await page.evaluate(() => { const m = document.querySelector('main'); const kids = [...m.children].map(e => e.id || e.className); return kids.slice(0, 3).join(','); });
  assert(/sy/.test(first), 'the first card on the office home is "Since yesterday": ' + first);
  const items = await ev('prioItems(App.me, App.tasks.map((n, i) => [n, i]).filter(([n]) => isHot(n))).length');
  assert(items >= 2, 'several urgent things are open (' + items + ')');
  assert(await page.evaluate(() => document.querySelectorAll('#prio .task').length === 1 && !document.querySelector('main > .task[data-a="nav"][data-v="escalations"]')), 'they show as one strip with the most serious first, not one banner each');
  assert(new RegExp('\\+' + (items - 1) + ' more need attention').test(await page.innerText('#prio')), 'the strip says how many more');
  await page.click('[data-a="prioAll"]'); await page.waitForTimeout(200);
  assert(await page.evaluate(n => document.querySelectorAll('#ov .task').length === n, items), 'one tap shows the full list');
  await page.evaluate(() => closeSheet());
  assert(await page.$('#sosBtn') !== null || !(await ev('SOS_ROLES.includes(App.me.role)')), 'the SOS button stays where it is');

  /* search */
  const P = await ev('(P => ({ id: P.id, phone: P.contact.phone, code: P.lift && P.lift.code }))(S.projects["AIEC-P001"])');
  for (const [q, what] of [[P.id.toLowerCase(), 'job number'], [String(P.phone).slice(-6), 'mobile'], [P.code, 'lift code']]) {
    await page.fill('[data-f="gq"]', q); await page.waitForTimeout(250);
    assert(await page.evaluate(id => [...document.querySelectorAll('#gres [data-a="openProject"]')].some(b => b.dataset.v === id), P.id), 'the office search finds the job by ' + what);
  }
  await page.fill('[data-f="gq"]', 'zzzz-nothing'); await page.waitForTimeout(200);
  assert(/No job matches/.test(await page.innerText('#gres')), 'and says when nothing matches');
  await page.fill('[data-f="gq"]', '');

  /* pinned sections */
  const before = await page.evaluate(() => [...document.querySelectorAll('main details.fold')].map(d => d.dataset.fold).join(','));
  await page.evaluate(() => { ACT.pinSec('dash'); closeSheet(); }); await page.waitForTimeout(200);
  const after = await page.evaluate(() => [...document.querySelectorAll('main details.fold')].map(d => d.dataset.fold).join(','));
  assert(after.split(',')[0] === 'dash' && before.split(',')[0] !== 'dash', 'a pinned section moves to the top: ' + before + ' → ' + after);
  await page.evaluate(() => { ACT.pinSec('dash'); closeSheet(); });
  await home('POWNER');
  assert(await page.evaluate(() => [...document.querySelectorAll('main details.fold')].map(d => d.dataset.fold)[0] === 'dash'), 'the Head Quarter sees money (the dashboard) first by default');

  /* task cards: what, which job, why now (then the two bars) */
  await home('PSALES');
  const lines = await page.evaluate(() => [...document.querySelectorAll('main .task[data-a="openTask"]')].map(c => { const g = c.querySelector('.grow'), cnt = el => el.innerText.split('\n').filter(x => x.trim()).length; return cnt(g) - [...g.querySelectorAll('.tbar')].reduce((s, b) => s + cnt(b), 0); }));
  assert(lines.length && lines.every(n => n <= 3), 'every task card is at most 3 lines before its bars: ' + lines.join(','));

  /* a refusal stays */
  await page.evaluate(async () => { await perform('CONFIG_SET', null, { key: 'gst', value: 99 }, { as: 'POWNER' }); }); await page.waitForTimeout(5600);
  assert(/Not saved:[\s\S]*Allowed: 0 to 28/.test(await page.innerText('#errbar')), 'a refusal is still on screen after the message would have gone');
  await page.evaluate(() => go('projects')); await page.waitForTimeout(150);
  assert(await page.$('#errbar'), 'it stays while moving between screens');
  await page.evaluate(async () => { await perform('CHAT_POSTED', 'AIEC-P003', { text: 'ok' }, { as: 'PADMIN', quiet: true }); render(); }); await page.waitForTimeout(150);
  assert(!(await page.$('#errbar')), 'and goes away after the next saved action');

  for (const lang of ['hi', 'mr']) { await page.evaluate(l => { LANG = l; App.set.lang = l; loginAs(S.users.PADMIN); go('home'); }, lang); await page.waitForTimeout(150); if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll ' + lang); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('HOME UI PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
