/* "Where jobs wait": days per step from the dated stage history, whose action moved each job on, jobs waiting now,
   who jobs waited on most, and money from due to confirmed. Only Head Quarter and Admin see it. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { page, browser, errors } = await launch({ viewport: { width: 360, height: 760 } });
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const main = () => page.innerText('main');

  /* a job with known dates: 2 days new→accepted (Sales), 5 days accepted→contacted (Sales), still contacted */
  const r = await page.evaluate(() => {
    const day = n => new Date(Date.now() - n * 864e5).toISOString();
    S.projects.TESTW = Object.assign({}, S.projects[S.order[0]], { id: 'TESTW', stage: 'contacted', since: day(3), done: null, payments: [],
      hist: [{ s: 'new', t: day(10), by: 'PFIELD' }, { s: 'accepted', t: day(8), by: 'PSALES' }, { s: 'contacted', t: day(3), by: 'PSALES' }] });
    const w = stageWaits(0), only = s => { const sv = S.projects; const keep = {}; keep.TESTW = sv.TESTW; S.projects = keep; const x = stageWaits(0); S.projects = sv; return x; };
    const x = only(), a = x.stages.find(y => y.s === 'accepted'), n = x.stages.find(y => y.s === 'new');
    return { a: a && [a.n, Math.round(a.avg * 10) / 10, a.role], n: n && [n.n, Math.round(n.avg * 10) / 10, n.role], who: x.who.map(y => [y.uid, Math.round(y.days)]), any: w.stages.length };
  });
  assert(JSON.stringify(r.n) === JSON.stringify([1, 2, 'sales']) && JSON.stringify(r.a) === JSON.stringify([1, 5, 'sales']), 'days per step and who moved it on are added up correctly: ' + JSON.stringify(r));
  assert(r.who[0][0] === 'PSALES' && r.who[0][1] === 7, 'the person jobs waited on is counted with their total days');
  assert(r.any > 3, 'the practice company gives several steps');

  await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('home'); }); await page.waitForTimeout(300);
  assert(await page.$('[data-a="nav"][data-v="waits"]') && /Slowest step \(30 days\)/.test(await main()), 'Admin\'s home shows the slowest step and opens the screen');
  await page.click('[data-a="nav"][data-v="waits"]'); await page.waitForTimeout(300);
  const txt = await main();
  assert(/Slowest steps/.test(txt) && /Waiting now/.test(txt) && /waits on/.test(txt), 'the screen shows slowest steps and waiting jobs');
  const order = await page.evaluate(() => { const w = stageWaits(App.form.wjDays === undefined ? 30 : App.form.wjDays).stages; return w.every((x, i) => !i || w[i - 1].avg >= x.avg); });
  assert(order, 'slowest step first');
  assert(/TESTW/.test(txt) && /Waiting for: Priya|Waiting for: Sales/.test(txt), 'a waiting job shows how long and who the next step belongs to');
  const n30 = await page.evaluate(() => stageWaits(30).stages.reduce((a, x) => a + x.n, 0)), nAll = await page.evaluate(() => stageWaits(0).stages.reduce((a, x) => a + x.n, 0));
  await page.click('[data-a="waitsPeriod"][data-v="0"]'); await page.waitForTimeout(200);
  assert(nAll >= n30 && await page.evaluate(() => App.form.wjDays === 0), 'the period can be changed');
  await page.click('[data-a="openProject"][data-v="TESTW"]'); await page.waitForTimeout(200);
  assert(await page.evaluate(() => App.route.name === 'project'), 'a waiting job opens with one tap');

  await page.evaluate(() => { loginAs(S.users.PTECH); ACT.permsDone(); go('waits'); }); await page.waitForTimeout(200);
  assert(!/Slowest steps/.test(await main()), 'other roles cannot open it');
  await page.evaluate(() => { loginAs(S.users.POWNER); ACT.permsDone(); go('me'); }); await page.waitForTimeout(200);
  assert(await page.$('[data-a="nav"][data-v="waits"]'), 'Head Quarter finds it under Me');

  for (const lang of ['hi', 'mr']) { await page.evaluate(l => { LANG = l; App.set.lang = l; go('waits'); }, lang); await page.waitForTimeout(150);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll ' + lang); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('WAITS PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
