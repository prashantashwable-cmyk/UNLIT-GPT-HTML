/* Service after handover has an owner: fault tickets go to the service lead the office chooses; without one to QC; without QC
   to Admin; never to Sales. A person trapped (or a late ticket) still also alarms the office. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const has = (uid, tid) => page.evaluate(([uid, tid]) => myTasks(S.users[uid]).some(n => n.k === 'assign_ticket' && n.tid === tid), [uid, tid]);
  const A = 'AIEC-P001', today = await page.evaluate(() => todayStr());
  assert((await act('TICKET_OPENED', A, { tid: 'T-S1', kind: 'breakdown', sev: 'routine', text: 'Door slow to close' }, 'PSALES')).ok, 'a fault call is recorded');
  assert(await has('PQC', 'T-S1') && !(await has('PSALES', 'T-S1')) && !(await has('PADMIN', 'T-S1')), 'with no service lead, QC decides who fixes it; not Sales, not Admin');

  /* Admin chooses a service lead on the People screen */
  await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('users'); }); await page.waitForTimeout(250);
  assert(/Service lead \(fault tickets\): Not chosen: QC decides/.test(await page.innerText('main')), 'People shows who owns fault tickets');
  await page.click('[data-a="svcPick"]'); await page.waitForTimeout(150);
  await page.click('#ov [data-a="svcSet"][data-v="PSENIOR"]'); await page.waitForTimeout(300);
  assert(await page.evaluate(() => S.serviceLead === 'PSENIOR'), 'Admin picks a senior technician as service lead');
  assert(await has('PSENIOR', 'T-S1') && !(await has('PQC', 'T-S1')), 'the ticket now goes only to the service lead');
  assert((await act('TICKET_ASSIGNED', A, { tid: 'T-S1', uid: 'PQC', due: today }, 'PQC')).err === 'err_access', 'QC can no longer decide it');
  await page.evaluate(() => { loginAs(S.users.PSENIOR); ACT.permsDone(); Notify.hide(); const i = App.tasks.findIndex(n => n.k === 'assign_ticket'); ACT.openTask(String(i)); }); await page.waitForTimeout(300);
  assert(await page.evaluate(() => App.route.name === 'wiz' && W.id === 'ticketAssign'), 'on their own phone the service lead opens "choose who fixes"');
  await page.evaluate(() => { W = null; loginAs(S.users.PADMIN); });
  assert((await act('TICKET_ASSIGNED', A, { tid: 'T-S1', uid: 'PTECH', due: today }, 'PSENIOR')).ok, 'the service lead gives it to a technician');

  /* a person trapped also alarms the office */
  assert((await act('TICKET_OPENED', A, { tid: 'T-S2', kind: 'breakdown', sev: 'trapped', text: 'Person stuck' }, 'PSALES')).ok, 'a person-trapped call is recorded');
  assert(await has('PSENIOR', 'T-S2') && await has('PADMIN', 'T-S2'), 'it goes to the service lead and also alarms Admin');

  /* back to QC; and with no QC, to Admin */
  assert((await act('SERVICE_LEAD_SET', null, { uid: '' }, 'PADMIN')).ok && await has('PQC', 'T-S2'), 'clearing the service lead hands tickets back to QC');
  assert((await act('SERVICE_LEAD_SET', null, { uid: 'PCUST' }, 'PADMIN')).err === 'err_pick_person', 'a customer cannot be service lead');
  assert((await act('SERVICE_LEAD_SET', null, { uid: 'PSENIOR' }, 'PSALES')).err, 'Sales cannot choose the service lead');
  await page.evaluate(() => { S.users.PQC.active = false; });
  assert((await act('TICKET_OPENED', A, { tid: 'T-S3', kind: 'breakdown', sev: 'routine', text: 'Noise' }, 'PSALES')).ok && await has('PADMIN', 'T-S3') && !(await has('PSALES', 'T-S3')), 'with no QC either, Admin decides');
  await page.evaluate(() => { S.users.PQC.active = true; });
  assert(await page.evaluate(() => rebuild(EVENTS) && S.rejected.length === 0), 'everything rebuilds with nothing refused (older Sales assignments stay valid)');

  for (const lang of ['hi', 'mr']) { await page.evaluate(l => { LANG = l; App.set.lang = l; loginAs(S.users.PADMIN); go('users'); ACT.svcPick(); }, lang); await page.waitForTimeout(150);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll ' + lang); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('SERVICE PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
