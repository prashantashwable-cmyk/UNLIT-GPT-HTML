/* The builder's site engineer counter-signs the day's safety check (in person, or the customer in their app); the customer
   is told gently when work is paused; a near miss never counts against anyone and is rewarded. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const P = await page.evaluate(() => { const P = Object.values(S.projects).find(x => x.stage === 'installing'); const d = safeDay(); P.safety = P.safety || {}; P.safety[d] = { by: P.tech, t: nowISO(), ev: [], status: 'ok', reviews: [], prev: [] }; P.incidents.forEach(i => { i.open = false; }); P.blockers.forEach(b => { b.open = false; }); return P.id; });
  const tech = await page.evaluate(p => S.projects[p].tech, P), day = await page.evaluate(() => safeDay());
  const sig = await page.evaluate(() => [{ id: 'E' + rid(8), m: 'x', kind: 'sign', label: 'sig', t: nowISO(), gps: null, hash: 'h1', dev: 'practice', q: {} }]);

  await page.evaluate(([u, p]) => { loginAs(S.users[u]); ACT.permsDone(); Notify.hide(); go('project', { pid: p }); }, [tech, P]); await page.waitForTimeout(300);
  assert(await page.$(`[data-a="csOpen"][data-v="${P}"]`), 'the technician is offered "Get today\'s safety check counter-signed"');
  assert((await act('SAFETY_COUNTERSIGNED', P, { day, signer: '', ev: sig }, tech)).err === 'err_fill', 'the site engineer\'s name is needed');
  assert((await act('SAFETY_COUNTERSIGNED', P, { day, signer: 'Er. Joshi' }, tech)).err === 'err_sign', 'and their signature');
  assert((await act('SAFETY_COUNTERSIGNED', P, { day, signer: 'Er. Joshi', ev: sig }, tech)).ok, 'the builder\'s site engineer counter-signs on the technician\'s phone');
  assert((await act('SAFETY_COUNTERSIGNED', P, { day, signer: 'Again', ev: sig }, tech)).err === 'err_already', 'once per day');
  await page.evaluate(p => { loginAs(S.users.PADMIN); go('safetylog', { pid: p }); }, P); await page.waitForTimeout(300);
  assert(/Counter-signed by Er\. Joshi/.test(await page.innerText('main')), 'the printable safety log shows the counter-signature');

  /* the customer can acknowledge in their own app */
  const r2 = await page.evaluate(p => { const P = S.projects[p], d = addDays(-1).slice(0, 10); P.safety[d] = { by: P.tech, t: nowISO(), ev: [], status: 'ok', reviews: [], prev: [] }; P.customer = 'PCUST'; S.users.PCUST.projects = uniq((S.users.PCUST.projects || []).concat(p)); return d; }, P);
  assert((await act('SAFETY_COUNTERSIGNED', P, { day: r2, signer: 'Mrs. Kale' }, 'PCUST')).ok, 'the customer can acknowledge a day\'s safety check in their app');

  /* customer sees a gentle pause line */
  await page.evaluate(p => { const P = S.projects[p]; P.incidents.push({ id: 'IX', type: 'hazard', open: true, t: nowISO(), by: P.tech, note: 'x' }); loginAs(S.users.PCUST); App.set.custSite = { PCUST: p }; go('home'); }, P); await page.waitForTimeout(300);
  assert(/paused today for a safety check\. Your technician is safe/.test(await page.innerText('main')), 'the customer is told work is paused for safety, not left guessing');
  assert(!/hazard|x$/.test(await page.evaluate(() => document.querySelector('.warnbox') ? document.querySelector('.warnbox').innerText : '')), 'without the incident\'s details');
  await page.evaluate(p => { const P = S.projects[p]; P.incidents = P.incidents.filter(i => i.id !== 'IX'); P.blockers.push({ id: 'BX', open: true, role: 'supplier', t: nowISO() }); render(); }, P); await page.waitForTimeout(200);
  assert(/paused: waiting for Supplier/.test(await page.innerText('main')), 'or that it waits for the supplier');

  /* near miss */
  const before = await page.evaluate(u => activeStrikes(u), tech);
  assert((await act('INCIDENT_RAISED', P, { type: 'near_miss', note: 'Loose plank at landing 3, fixed' }, tech)).ok, 'a near miss is reported');
  assert(await page.evaluate(([u, b]) => activeStrikes(u) === b && badgesOf(u).includes('b_near_miss'), [tech, before]), 'it never counts as a strike, and earns the "Safety watcher" badge');
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('SAFETY SIGN PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
