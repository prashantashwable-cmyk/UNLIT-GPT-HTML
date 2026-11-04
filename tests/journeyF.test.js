/* "Not licensed: do not use" (v4 journey): a working lift without its licence shows a red warning to the customer and
   on the job; a notice in three languages is printed for the landing doors; the technician records the controller
   left in inspection mode (photo), and switches it to normal service only once the licence is recorded. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const ph = () => ev(`[{ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'liftmode', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }]`);
  const H = await ev(`(P => { P.t = nowISO(); if (P.statutory) P.statutory.licence = null; P.customer = P.customer || 'PCUST'; return P.id; })(Object.values(S.projects).find(P => P.stage === 'handover'))`);
  const T = await ev(`S.projects["${H}"].tech`), C = await ev(`S.projects["${H}"].customer`);
  assert(await ev(`unlicensed(S.projects["${H}"])`), 'a handed-over lift without a licence is flagged');
  await page.evaluate(C => { loginAs(S.users[C]); ACT.permsDone(); Notify.hide(); go('home'); }, C); await page.waitForTimeout(250);
  assert(/DO NOT USE THIS LIFT/.test(await page.innerText('main')), 'the customer sees a red "do not use" warning');
  await page.evaluate(H => go('doc', { pid: H, kind: 'nolicence' }), H); await page.waitForTimeout(200);
  const txt = await page.innerText('main');
  assert(/DO NOT USE THIS LIFT/.test(txt) && /इस्तेमाल न करें/.test(txt) && /वापरू नका/.test(txt), 'the landing-door notice prints in English, Hindi and Marathi together');
  assert(await ev(`needs(S.projects["${H}"]).some(n => n.k === 'set_insp_mode' && n.urgent)`), 'the technician must leave the controller in inspection mode');
  assert((await act('LIFT_MODE_SET', H, { mode: 'normal', ev: await ph() }, T)).err === 'err_lift_licence', 'normal service is refused without the licence');
  assert((await act('LIFT_MODE_SET', H, { mode: 'inspection', ev: [] }, T)).err === 'err_photos', 'the mode needs a photo of the controller');
  assert((await act('LIFT_MODE_SET', H, { mode: 'inspection', ev: await ph() }, T)).ok && !(await ev(`needs(S.projects["${H}"]).some(n => n.k === 'set_insp_mode')`)), 'inspection mode is recorded');
  await page.evaluate(H => { S.projects[H].statutory = Object.assign({}, S.projects[H].statutory, { licence: { no: 'LIC-1', expiry: addDays(300), date: todayStr() } }); }, H);
  assert(!(await ev(`unlicensed(S.projects["${H}"])`)) && await ev(`needs(S.projects["${H}"]).some(n => n.k === 'set_normal_mode')`), 'once the licence is recorded, the warning goes and the technician switches to normal service');
  assert((await act('LIFT_MODE_SET', H, { mode: 'normal', ev: await ph() }, T)).ok, 'normal service recorded');
  for (const lang of ['hi', 'mr']) { await page.evaluate(([l, H]) => { LANG = l; App.set.lang = l; go('project', { pid: H, tab: 'info' }); }, [lang, H]); await page.waitForTimeout(150); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('JOURNEY F PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
