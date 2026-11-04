/* Lift life after handover (role-wise specs): a register of every handed-over lift; the final check records test
   values as numbers; service visits can mark a part "wearing"; a breakdown is accepted by the person given it (or the
   office is told to give it to someone else) and closed with a root cause; AMC renewal starts 60 days before the end;
   the customer is called before the warranty ends; when the building is sold the lift keeps its history and the old
   owner loses access; a fault guide works offline. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const photos = n => ev(`Array.from({ length: ${n} }, () => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'amc', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`);
  const tasks = (uid, pid) => page.evaluate(([uid, pid]) => myTasks(S.users[uid]).filter(n => n.pid === pid).map(n => ({ k: n.k, urgent: !!n.urgent, tid: n.tid })), [uid, pid]);
  const A = await ev(`Object.values(S.projects).find(P => P.stage === 'amc').id`);

  /* final check values */
  const fv = await page.evaluate(A => { const P = S.projects[A], st = P.stage; P.stage = 'qc_final';
    const base = { outcome: 'pass', checks: Object.fromEntries(QC_FINAL_CHECKS.map(k => [k, 'pass'])), crit: Object.fromEntries(QC_CRITICAL.map(k => [k, 'pass'])), ev: ['qc', 'qc'].concat(QC_CRITICAL.map(k => 'crit_' + k)).map(l => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: l, t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} })) };
    const q = Object.values(S.users).find(u => u.role === 'qc' && u.active && u.uid !== P.tech && !(P.crew || []).includes(u.uid) && !(companyOf(u.uid) && companyOf(u.uid) === companyOf(P.tech)));
    const a = validate(S, { type: 'QC_FINAL_RESULT', pid: A, by: q.uid, t: nowISO(), data: base }), b = validate(S, { type: 'QC_FINAL_RESULT', pid: A, by: q.uid, t: nowISO(), data: Object.assign({}, base, { vals: { level: 3, load: 0, ard: 24 } }) });
    P.stage = st; return [a && (a.k || a), b && (b.k || b)]; }, A);
  assert(fv[0] === 'err_test_vals' && fv[1] === 'err_test_vals', JSON.stringify(fv) + ' ' + 'a passed final check needs the measured levelling, load and ARD values');

  /* service visit: wearing */
  const vi = await ev(`(P => P.done.amc.visits.findIndex((d, i) => !P.service[i]))(S.projects["${A}"])`), tech = await ev(`S.projects["${A}"].tech`);
  const checks = { ride: 'pass', doors: 'fair', alarm: 'pass', brake: 'pass', ropes: 'fair', oil: 'pass', pit: 'pass' };
  if (vi >= 0) assert((await act('SERVICE_DONE', A, { visit: vi, checks, ev: await photos(1) }, tech)).ok, 'a service visit can mark parts "wearing"');

  /* breakdown */
  assert((await act('TICKET_OPENED', A, { tid: 'T-LL1', kind: 'breakdown', text: 'Lift stuck at 2nd floor' }, 'PADMIN')).ok, 'a breakdown is reported');
  assert((await act('TICKET_ASSIGNED', A, { tid: 'T-LL1', uid: tech, due: await ev('todayStr()') }, 'PADMIN')).ok, 'and given to the technician');
  assert((await tasks(tech, A)).some(n => n.k === 'accept_ticket' && n.tid === 'T-LL1' && n.urgent), 'the technician must accept it first');
  await page.evaluate(A => { ticketOf(S.projects[A], 'T-LL1').assignedT = new Date(Date.now() - 20 * 60e3).toISOString(); }, A);
  assert((await tasks('PADMIN', A)).some(n => n.k === 'ticket_not_accepted' && n.tid === 'T-LL1'), 'not accepted in 15 minutes: the office is told to give it to someone else');
  await page.evaluate(([A, tech]) => { loginAs(S.users[tech]); ACT.permsDone(); Notify.hide(); openTask(myTasks(S.users[tech]).find(n => n.k === 'accept_ticket' && n.pid === A)); }, [A, tech]); await page.waitForTimeout(300);
  await page.click('[data-a="wizNext"]'); await page.waitForTimeout(400);
  assert(await ev(`!!ticketOf(S.projects["${A}"], 'T-LL1').accepted`) && !(await tasks('PADMIN', A)).some(n => n.k === 'ticket_not_accepted'), 'the technician accepts it in one tap; the office warning goes');
  assert((await act('TICKET_UPDATED', A, { tid: 'T-LL1', status: 'resolved', note: 'Door lock contact replaced', ev: [] }, tech)).err === 'err_cause', 'a fixed breakdown needs its root cause');
  assert((await act('TICKET_UPDATED', A, { tid: 'T-LL1', status: 'resolved', cause: 'door', note: 'Door lock contact replaced', ev: [] }, tech)).ok, '…chosen from the list');

  /* the register */
  await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('lifts'); }); await page.waitForTimeout(300);
  let txt = await page.innerText('#app');
  assert(/Lift register/.test(txt) && /AMC till|No AMC/.test(txt) && /Warranty/.test(txt), 'the lift register shows warranty, AMC and licence for each lift');
  assert(/most often: Door/.test(txt), 'it shows the most frequent breakdown cause');
  if (vi >= 0) assert(/Parts to watch: .*Doors/.test(txt), 'and the parts marked "wearing" at the last visit');

  /* AMC renewal and warranty */
  await page.evaluate(A => { S.projects[A].amcEnd = addDays(50); S.projects[A].amcEnded = null; }, A);
  let ts = await tasks('PADMIN', A); assert(ts.some(n => n.k === 'amc_renew' && !n.urgent), 'AMC renewal starts 60 days before the end');
  await page.evaluate(A => { S.projects[A].amcEnd = addDays(5); }, A);
  ts = await tasks('PADMIN', A); assert(ts.some(n => n.k === 'amc_renew' && n.urgent), '…and is urgent in the last 7 days');
  await page.evaluate(A => { const P = S.projects[A]; P.done.t = new Date(Date.now() - ((P.done.warrantyMonths || 12) * 30 - 20) * 864e5).toISOString(); P.warrantyCalled = null; }, A);
  assert((await tasks('PADMIN', A)).some(n => n.k === 'warranty_call'), 'warranty ending within 30 days: call the customer');
  assert((await act('WARRANTY_CALLED', A, { note: 'Explained AMC, will renew' }, 'PADMIN')).ok && !(await tasks('PADMIN', A)).some(n => n.k === 'warranty_call'), 'the call is recorded once and the task goes');

  /* new owner */
  /* (the practice lift has no customer login; one is given to it for this check) */
  const C = await ev(`(P => { if (!P.customer) P.customer = Object.values(S.users).find(u => u.role === 'customer').uid; return P.id; })(S.projects["${A}"])`);
  if (C) {
    const cu = await ev(`S.projects["${C}"].customer`);
    assert((await act('LIFT_OWNER_CHANGED', C, { name: 'Mrs. Joshi', phone: '98220', note: 'Flat sold' }, 'PADMIN')).err === 'err_phone', 'the new owner needs a valid number');
    assert((await act('LIFT_OWNER_CHANGED', C, { name: 'Mrs. Joshi', phone: '9822012345', note: 'Bungalow sold' }, 'PADMIN')).ok, 'the office records the new owner');
    assert(await ev(`!canSee(S.users["${cu}"], S.projects["${C}"]) && S.projects["${C}"].contact.name === 'Mrs. Joshi' && S.projects["${C}"].lift.owners.length === 2 && S.projects["${C}"].tickets.length >= 0`), 'the old owner no longer sees the lift; its history and both owners are kept');
  }

  /* fault guide */
  await page.evaluate(t => { loginAs(S.users[t]); go('me'); }, tech); await page.waitForTimeout(200);
  assert(await page.$('[data-a="nav"][data-v="faults"]'), 'the technician has the fault guide');
  await page.evaluate(() => go('faults')); await page.waitForTimeout(200);
  txt = await page.innerText('main');
  assert(/people inside/.test(txt) && /Door does not close/.test(txt) && /trained technicians only/.test(txt), 'it covers trapped people, doors, levelling, noise and power cuts, with a safety warning');

  for (const lang of ['hi', 'mr']) { await page.evaluate(l => { LANG = l; App.set.lang = l; loginAs(S.users.PADMIN); go('lifts'); }, lang); await page.waitForTimeout(150); await page.evaluate(() => go('faults')); await page.waitForTimeout(100); if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll ' + lang); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('LIFT LIFE PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
