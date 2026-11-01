/* Suppliers and government inspection: the supplier has 24 hours to answer an order (then the office is asked to call or
   change supplier), each supplier's on-time record shows where the office picks one, and a failed government inspection
   records the failed checklist points and who must fix them. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const tasks = (uid, pid) => page.evaluate(([uid, pid]) => myTasks(S.users[uid]).filter(n => !pid || n.pid === pid).map(n => n.k), [uid, pid]);

  /* 24 hours to answer an order */
  const O = await ev('Object.values(S.projects).find(P => P.po && !P.po.accepted && !P.po.declined).id');
  assert(await ev('S.config.poAnswerHours === 24'), 'a supplier has 24 hours to answer an order (a setting)');
  await page.evaluate(O => { S.projects[O].po.t = new Date(Date.now() - 2 * 3600e3).toISOString(); }, O);
  const lbl = await ev(`(P => { loginAs(S.users.PSUP); return timeOf(myTasks(S.users.PSUP).find(n => n.k === "accept_po" && n.pid === P.id), P).label; })(S.projects["${O}"])`);
  assert(/h of 24 h/.test(lbl), 'the supplier\'s deadline bar counts the hours: ' + lbl);
  assert(!(await tasks('PADMIN', O)).includes('po_silent'), 'within the hours the office is not disturbed');
  await page.evaluate(O => { S.projects[O].po.t = new Date(Date.now() - 30 * 3600e3).toISOString(); }, O);
  assert((await tasks('PADMIN', O)).includes('po_silent'), 'after 24 hours of silence the office is asked to call or change supplier');

  /* supplier record */
  const sc = await ev('supScore("PSUP")');
  assert(sc.n >= 1 && sc.pct >= 0 && sc.pct <= 100, 'each supplier has an on-time record: ' + JSON.stringify(sc));
  assert(/On time \d+% of \d+ orders/.test(await ev('supLine("PSUP")')), 'it reads in words');
  await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('worker', { uid: 'PSUP' }); }); await page.waitForTimeout(250);
  assert(/Supplier record/.test(await page.innerText('main')), 'the supplier\'s page shows the record');
  const R = await ev('(Object.values(S.projects).find(P => P.stage === "site_ok") || {}).id || ""');
  if (R) { await page.evaluate(async R => { await wiz('release', R); }, R); await page.waitForTimeout(250); assert(/On time|New supplier/.test(await page.innerText('#app')), 'choosing a supplier for a job shows each one\'s record'); }
  else assert(/On time|New supplier/.test(await ev('(W = { pid: null }, personTiles("supplier", "supplier"))')), 'choosing a supplier shows each one\'s record');
  assert(/below 85%/.test(await ev(`(() => { const P = Object.values(S.projects).find(x => x.dispatch && x.po && x.po.accepted && x.dispatch.by === "PSUP"); const k = P.po.accepted.date; P.po.accepted.date = "2000-01-01"; const all = Object.values(S.projects).filter(x => x.dispatch && x.dispatch.by === "PSUP" && x.po && x.po.accepted), keep = all.map(x => x.po.accepted.date); all.forEach(x => x.po.accepted.date = "2000-01-01"); const l = supLine("PSUP"); all.forEach((x, i) => x.po.accepted.date = keep[i]); P.po.accepted.date = k; return l; })()`)), 'a supplier under 85% on time is flagged: give fewer new orders');

  /* failed government inspection */
  const H = 'AIEC-P002', tech = await ev(`S.projects["${H}"].tech`);
  assert((await act('STATUTORY_SET', H, { item: 'inspection', date: await ev('safeDay()'), result: 'fail' }, 'PADMIN')).err === 'err_items', 'a failed inspection needs the list of fixes');
  assert((await act('STATUTORY_SET', H, { item: 'inspection', date: await ev('safeDay()'), result: 'fail', note: 'ARD did not hold; interlock 2nd floor' }, 'PADMIN')).err === 'err_choose', 'and who must fix it');
  assert((await act('STATUTORY_SET', H, { item: 'inspection', date: await ev('safeDay()'), result: 'fail', note: 'ARD did not hold; interlock 2nd floor', owner: 'tech', points: [99] }, 'PADMIN')).err === 'err_choose', 'only real checklist points');
  assert((await act('STATUTORY_SET', H, { item: 'inspection', date: await ev('safeDay()'), result: 'fail', note: 'ARD did not hold; interlock 2nd floor', owner: 'tech', points: [17, 21] }, 'PADMIN')).ok, 'saved with the failed points and the owner');
  assert((await tasks(tech, H)).includes('inspection_rework'), 'the lead technician gets "inspection failed — fix the points"');
  await page.evaluate(H => { loginAs(S.users.PADMIN); go('project', { pid: H, tab: 'info' }); }, H); await page.waitForTimeout(300);
  const pg = await page.innerText('main');
  assert(/17\. Door interlock/.test(pg) && /21\. ARD/.test(pg) && /fix by: Technician/.test(pg), 'the project shows the failed points and who fixes them');
  await page.evaluate(() => go('waits')); await page.waitForTimeout(250);
  assert(/Checklist points that fail most[\s\S]*(17\. Door interlock|21\. ARD)/.test(await page.innerText('main')), 'failed government inspections count in "points that fail most"');
  assert((await act('STATUTORY_SET', H, { item: 'inspection', date: await ev('safeDay()'), result: 'pass' }, 'PADMIN')).ok && !(await tasks(tech, H)).includes('inspection_rework'), 'a passed re-inspection closes the rework');

  /* wizard */
  await page.evaluate(async H => { loginAs(S.users.PADMIN); await wiz('statutory', H, { item: 'inspection' }); W.ctx.result = 'fail'; render(); }, H); await page.waitForTimeout(250);
  const wt = await page.innerText('#app');
  assert(/Who must fix it/.test(wt) && /Points the Inspector failed/.test(wt) && /22\. UCMP/.test(wt), 'the inspection form asks who fixes it and which points failed');

  for (const lang of ['hi', 'mr']) { await page.evaluate(l => { LANG = l; App.set.lang = l; go('worker', { uid: 'PSUP' }); }, lang); await page.waitForTimeout(150); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('SUPPLY PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
