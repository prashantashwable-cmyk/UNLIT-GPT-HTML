/* The map is on the first page for every role, right after "Start my next task"; the Map tab left the bottom menu
   and the full map is one tap away. Each role sees only what it may: a technician their own jobs, a customer only
   their own lift. Offline the simple plot shows. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const as = async uid => { await page.evaluate(uid => { loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); App.form = {}; go('home'); }, uid); await page.waitForTimeout(300); };
  const pins = () => page.$$eval('#hsvg [data-a="mapPin"]', gs => gs.map(g => g.dataset.v));
  for (const uid of ['POWNER', 'PADMIN', 'PFIN', 'PSALES', 'PFIELD', 'PTECH', 'PCUST', 'PSUP']) {
    await as(uid);
    const r = await page.evaluate(() => { const card = document.getElementById('hsvg') || [...document.querySelectorAll('main .card')].find(c => /🗺️/.test(c.textContent)); const nx = document.querySelector('main [data-a="openTask"]');
      return { has: !!card, after: !nx || !card || !!(nx.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING), tab: !!document.querySelector('nav.nav [data-v="map"]') }; });
    assert(r.has && r.after && !r.tab, `${uid}: map on the first page after "Start my next task", no Map tab`);
  }
  /* what each sees */
  await as('PTECH');
  const tp = await pins(), mine = await ev(`visibleProjects(S.users.PTECH).filter(P => P.site.gps && P.stage !== 'lost' && (P.tech === 'PTECH' || (P.crew || []).includes('PTECH') || myTasks(S.users.PTECH).some(n => n.pid === P.id))).map(P => P.id)`);
  assert(tp.length && tp.every(id => mine.includes(id)), 'the technician sees only their own jobs (' + tp.length + ')');
  await page.click('#hsvg [data-a="mapPin"]'); await page.waitForTimeout(250);
  assert(await ev(`App.route.name === 'home'`) && /Directions/.test(await page.innerText('main')), 'tapping a pin shows the job and directions on the home page');
  await as('PCUST');
  const cp = await pins(), own = await ev(`custJobs(S.users.PCUST)`);
  assert(cp.length >= 1 && cp.every(id => own.includes(id)), 'the customer sees only their own lift');
  assert(!(await page.$('main [data-a="nav"][data-v="map"]')), 'the customer has no full map of other sites');
  await as('PADMIN');
  await page.click('main [data-a="nav"][data-v="map"]'); await page.waitForTimeout(300);
  assert(await ev(`App.route.name === 'map'`) && await page.$('[data-a="mfilter"][data-v="late"]'), '"Full map" opens the big map with its filters');
  assert(await ev(`(NAV.sales.some(x => x[0] === 'chat'))`), 'sales got Chat back in the menu');
  /* offline: the plot is there and no street map is attempted */
  await as('PTECH');
  assert(await page.$('#hsvg svg.map') && await ev(`document.getElementById('hmap').hidden`), 'offline the simple plot shows');
  const mm = await miss(page); assert(!mm.length, 'no missing words' + (mm.length ? ': ' + mm.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy|leaflet/i.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('HOME MAP PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
