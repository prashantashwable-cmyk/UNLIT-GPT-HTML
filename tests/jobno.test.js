/* Job numbers people read: AIEC-<city>-<year>-<5 digits>, the next free number; older jobs keep theirs. If two phones
   made the same number while offline, after merging the histories the later one gets "-B" on every phone, and no job
   is lost. Search and tapping a number in chat find the job by either number. */
const { launch } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const P = {}; const lead = (k, extra) => page.evaluate(([k, extra]) => { const pid = newPid(); window.__p = Object.assign(window.__p || {}, { [k]: pid }); return perform('LEAD_CREATED', pid, Object.assign({ safe: true, ev: [1, 2].map(() => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'site', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} })), address: 'Wakad, Pune', name: 'Mr. Shah', phone: '9822077701', shaft: 'yes', floors: 4 }, extra || {}), { as: 'PFIELD', quiet: true }).then(r => r.ok); }, [k, extra]);
  assert(await ev(`jobNo(S.projects['AIEC-P001']) === 'AIEC-P001'`), 'older jobs keep their numbers');
  const y = await ev('todayStr().slice(0, 4)');
  assert(await lead('AIEC-T1') && await lead('AIEC-T2'), 'two new leads');
  const n1 = await ev(`S.projects[__p['AIEC-T1']].no`), n2 = await ev(`S.projects[__p['AIEC-T2']].no`);
  assert(n1 === `AIEC-PUN-${y}-00001` && n2 === `AIEC-PUN-${y}-00002`, 'new jobs get AIEC-PUN-<year>-00001, 00002: ' + n1 + ', ' + n2);
  assert(await page.evaluate(() => perform('CONFIG_SET', null, { key: 'cityCode', value: 'pune' }, { as: 'POWNER', quiet: true }).then(r => r.err && (r.err.k || r.err))) === 'err_pay_detail', 'the city code is 3 capital letters');
  assert(await page.evaluate(() => perform('CONFIG_SET', null, { key: 'cityCode', value: 'MUM' }, { as: 'POWNER', quiet: true }).then(r => r.ok)), 'the Owner sets another city');
  assert(await lead('AIEC-T3') && await ev(`S.projects[__p['AIEC-T3']].no === 'AIEC-MUM-${y}-00001'`), 'each city counts from 1');
  /* the same number made on two phones offline */
  assert(await lead('AIEC-T4', { no: n2 }), 'a lead from another phone carries a number already used here');
  assert(await ev(`S.projects[__p['AIEC-T4']].no === "${n2}-B" && S.projects[__p['AIEC-T2']].no === "${n2}"`), 'it is kept, as ' + n2 + '-B');
  const re = await ev(`(() => { const all = sortEvents(EVENTS.slice()); const st = rebuild(all); return [st.projects[__p['AIEC-T2']].no, st.projects[__p['AIEC-T4']].no]; })()`);
  assert(re[0] === n2 && re[1] === n2 + '-B', 'replaying the history gives the same numbers');
  /* display, search, links */
  await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('project', { pid: __p['AIEC-T1'], tab: 'info' }); }); await page.waitForTimeout(250);
  assert((await page.innerText('#app')).includes(n1), 'the job page shows the new number');
  await page.evaluate(n => { App.form.gq = n; go('home'); }, n1); await page.waitForTimeout(250);
  assert(await ev(`gsearch().includes(__p['AIEC-T1'])`), 'search finds the job by its number');
  await page.evaluate(async n => { await perform('CHAT_POSTED', 'AIEC-P003', { text: 'Same supplier as ' + n }, { as: 'PADMIN', quiet: true }); go('project', { pid: 'AIEC-P003', tab: 'chat' }); }, n1); await page.waitForTimeout(300);
  assert(await page.$(`.pidlink[data-v="${await ev("__p['AIEC-T1']")}"]`), 'a job number written in chat opens that job');
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('JOB NUMBERS PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
