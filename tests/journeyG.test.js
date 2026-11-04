/* Service proof and AMC choice (v4 journey): for lifts handed over from now, a service visit is saved only with the
   6-letter code from that lift's sticker; renewals offer Comprehensive vs Non-comprehensive side by side, and the
   chosen plan is kept with the renewal. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const ph = () => ev(`[{ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'amc', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }]`);
  const A = await ev(`(P => { P.done.t = nowISO(); return P.id; })(Object.values(S.projects).find(P => P.stage === 'amc'))`);
  const T = await ev(`S.projects["${A}"].tech`), code = await ev(`S.projects["${A}"].lift.code`), vi = await ev(`(P => P.done.amc.visits.findIndex((d, i) => !P.service[i]))(S.projects["${A}"])`);
  const checks = { ride: 'pass', doors: 'pass', alarm: 'pass', brake: 'pass', ropes: 'pass', oil: 'pass', pit: 'pass' };
  assert((await act('SERVICE_DONE', A, { visit: vi, checks, ev: await ph() }, T)).err === 'err_lift_code', 'a service visit needs the lift\'s sticker code');
  assert((await act('SERVICE_DONE', A, { visit: vi, checks, ev: await ph(), qr: 'ZZZZZZ' }, T)).err === 'err_lift_code', 'another lift\'s code is refused');
  assert((await act('SERVICE_DONE', A, { visit: vi, checks, ev: await ph(), qr: ' ' + code.toLowerCase().slice(0, 3) + '-' + code.slice(3) }, T)).ok && await ev(`S.projects["${A}"].service[${vi}].qr === true`), 'the right code (any case, with spaces or dashes) saves the visit');
  await page.evaluate(async ([A, T]) => { loginAs(S.users[T]); await wiz('service', A, { visit: 1 }); }, [A, T]); await page.waitForTimeout(200);
  assert(/Lift code from the sticker/.test(await page.innerText('#app')), 'the visit screen starts by asking for the sticker code');
  await page.evaluate(() => { W = null; });
  /* AMC choice */
  assert((await act('CONFIG_SET', null, { key: 'amcCompPrice', value: 32000 }, 'POWNER')).ok, 'the Owner sets a comprehensive AMC price');
  assert((await act('AMC_RENEWED', A, { years: 1, amount: 32000, plan: 'gold' }, 'PSALES')).err === 'err_choose', 'only the two plans exist');
  assert((await act('AMC_RENEWED', A, { years: 1, amount: 32000, plan: 'comp' }, 'PSALES')).ok && await ev(`S.projects["${A}"].renewals.slice(-1)[0].plan === 'comp'`), 'a comprehensive renewal is kept with its plan');
  await page.evaluate(A => { loginAs(S.users.PSALES); go('doc', { pid: A, kind: 'amcoffer' }); }, A); await page.waitForTimeout(200);
  const txt = await page.innerText('main');
  assert(/Comprehensive \(parts included\)/.test(txt) && /Non-comprehensive/.test(txt) && /Spare parts/.test(txt), 'a printable offer compares the two plans');
  await page.evaluate(async A => { await wiz('renew', A); }, A); await page.waitForTimeout(200);
  assert(/Which maintenance contract\?/.test(await page.innerText('#app')), 'renewal starts with the choice of plan');
  await page.evaluate(() => { W = null; go('home'); });
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('JOURNEY G PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
