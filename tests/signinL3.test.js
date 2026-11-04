/* Menus made for each role (v4): the technician gets Today / Material / Steps / Damage / Pay (+ Me), the customer
   My lift / Pay / Papers / Help (+ Me), Sales Today / Leads / Call next / Map / Me; office menus stay as they were.
   Every tab opens a working page, chat stays reachable from Me when it leaves the menu, and the technician's Pay
   page shows counted work and who pays them, never rupee rates. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const as = async uid => { await page.evaluate(uid => { loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go('home'); }, uid); await page.waitForTimeout(250); };
  const menu = () => page.$$eval('nav.nav button', bs => bs.map(b => b.dataset.v));
  const tab = async v => { await page.click(`nav.nav button[data-v="${v}"]`); await page.waitForTimeout(250); return page.innerText('#app'); };
  /* technician */
  await as('PTECH');
  assert(JSON.stringify(await menu()) === JSON.stringify(['home', 'stock', 'steps', 'damage', 'mywork', 'me']), 'technician menu: Today, Material, Steps, Damage, Pay, Me');
  assert(/Today/.test(await page.innerText('nav.nav')), 'home is called "Today" for the technician');
  assert(/Material|Van|Store/i.test(await tab('stock')), 'Material opens the van stock');
  const steps = await tab('steps'); assert(/installation steps/.test(steps), 'Steps lists the technician\'s jobs');
  if (await page.$('main [data-a="openCl"]')) { await page.click('main [data-a="openCl"]'); await page.waitForTimeout(250); assert(await page.evaluate(() => App.route.name === 'cl' && App.route.p.kind === 'sop'), 'a job in Steps opens its step list'); }
  assert(/broken or missing material/.test(await tab('damage')), 'Damage explains reporting before fitting');
  const pay = await tab('mywork');
  assert(/pays you/.test(pay) && !/₹/.test(await page.innerText('main')), 'Pay says who pays and shows no rupee amounts');
  await tab('me'); assert(await page.$('main [data-a="nav"][data-v="chat"]'), 'chat is still reachable from Me');
  /* customer */
  await as('PCUST');
  assert(JSON.stringify(await menu()) === JSON.stringify(['home', 'mypay', 'docs', 'chat', 'me']), 'customer menu: My lift, Pay, Papers, Help, Me');
  const cp = await tab('mypay'); assert(/Pay/.test(cp) && await page.evaluate(() => App.route.name === 'mypay'), 'customer Pay opens without picking a job');
  assert(/Help/.test(await page.innerText('nav.nav')), 'chat is called Help for the customer');
  /* sales */
  await as('PSALES');
  assert(JSON.stringify(await menu()) === JSON.stringify(['home', 'projects', 'callnext', 'map', 'me']), 'sales menu: Today, Leads, Call next, Map, Me');
  assert(/most important first|No calls due/.test(await tab('callnext')), 'Call next opens the call list');
  await tab('me'); assert(await page.$('main [data-a="nav"][data-v="chat"]'), 'sales reaches chat from Me');
  /* office unchanged */
  await as('PADMIN');
  assert(JSON.stringify(await menu()) === JSON.stringify(['home', 'projects', 'map', 'chat', 'me']), 'office menu unchanged');
  await page.evaluate(() => go('me')); await page.waitForTimeout(200);
  assert(!(await page.$('main [data-a="nav"][data-v="chat"]')), 'no duplicate chat tile when chat is in the menu');
  /* a wrong role on a role page goes home */
  assert(await page.evaluate(() => { go('mywork'); return /class="nav/.test(document.getElementById('app').innerHTML); }), 'role pages are safe for other roles');
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('SIGN-IN L3 PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
