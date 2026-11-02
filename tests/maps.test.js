/* Maps (OCT file): the rider sees km travelled today and this month, area covered, "try here next" squares near good
   leads, and the rider board; the office sees each person's last place today (filter by role) and late jobs. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));

  /* a rider's day: three photo places about 1 km apart */
  await page.evaluate(() => { const now = Date.now(); [[18.5204, 73.8567], [18.5294, 73.8567], [18.5384, 73.8567]].forEach(([lat, lng], i) => { const id = 'EMAP' + i; S.evidence[id] = { id, by: 'PFIELD', t: new Date(now - (3 - i) * 600000).toISOString(), gps: { lat, lng, acc: 8 }, kind: 'photo' }; }); });
  const rs = await ev('riderStats("PFIELD")');
  assert(rs.kmDay >= 1.8 && rs.kmDay <= 2.2, 'km travelled today is counted from the rider\'s photo places: ' + rs.kmDay + ' km');
  assert(rs.kmMonth >= rs.kmDay && rs.area >= 3, 'this month and the area covered (half-km squares): ' + rs.kmMonth + ' km, ' + rs.area + ' squares');
  assert(Array.isArray(rs.next) && rs.next.length >= 1, '"try here next" suggests squares near good leads: ' + rs.next.length);
  await page.evaluate(() => { loginAs(S.users.PFIELD); ACT.permsDone(); Notify.hide(); go('map'); }); await page.waitForTimeout(300);
  const rm = await page.innerText('main');
  assert(/Today: [\d.]+ km/.test(rm) && /This month:/.test(rm) && /Area covered/.test(rm) && /Try here next/.test(rm), 'the rider\'s map shows today, this month, area covered and where to try next');
  assert(/Riders, last 30 days/.test(rm), 'and the rider board');

  /* the office: people and late jobs */
  await page.evaluate(() => { const now = Date.now(); S.evidence.EMAPT = { id: 'EMAPT', by: 'PTECH', t: new Date(now - 300000).toISOString(), gps: { lat: 18.51, lng: 73.84, acc: 9 }, kind: 'photo' }; loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); App.form = {}; go('map'); }); await page.waitForTimeout(250);
  assert(await page.$('[data-a="mfilter"][data-v="people"]') && await page.$('[data-a="mfilter"][data-v="late"]'), 'the office map has People and Late jobs filters');
  await page.click('[data-a="mfilter"][data-v="people"]'); await page.waitForTimeout(250);
  const pm = await page.innerText('main');
  assert(/Raju Pawar · last seen/.test(pm) && /Ramesh Jadhav · last seen/.test(pm), 'People shows each worker\'s last place today');
  await page.click('[data-a="mrole"][data-v="tech"]'); await page.waitForTimeout(200);
  const pt = await page.innerText('main');
  assert(/Raju Pawar · last seen/.test(pt) && !/Ramesh Jadhav · last seen/.test(pt), 'and can be filtered by role');
  await page.evaluate(() => { S.projects['AIEC-P006'].since = new Date(Date.now() - 12 * 864e5).toISOString(); App.form.mf = 'late'; render(); }); await page.waitForTimeout(200);
  const late = await ev('App.mapData.ps.map(P => P.id)');
  assert(late.includes('AIEC-P006') && late.length < await ev('visibleProjects(App.me).filter(P => P.site.gps).length'), 'Late jobs shows only escalated jobs: ' + late.join(','));
  await page.evaluate(() => { loginAs(S.users.PTECH); ACT.permsDone(); go('map'); }); await page.waitForTimeout(200);
  assert(!(await page.$('[data-a="mfilter"][data-v="people"]')), 'only the office sees where people are');

  for (const lang of ['hi', 'mr']) { await page.evaluate(l => { LANG = l; App.set.lang = l; loginAs(S.users.PFIELD); go('map'); }, lang); await page.waitForTimeout(150); if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll ' + lang); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('MAPS PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
