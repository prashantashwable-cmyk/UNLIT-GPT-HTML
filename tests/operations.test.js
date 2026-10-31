/* After handover and around the workflow: WhatsApp templates, AMC visits and tickets, two-person approval,
   worker onboarding and training, technician weekly pay, leaderboard, helper, address from GPS and reused photos. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, ctx, page, errors } = await launch();
  await ctx.route(/^https:\/\/nominatim\.openstreetmap\.org\/reverse/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ display_name: 'Lane 5, Kothrud, Pune, Maharashtra, 411038, India' }) }));
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; });
  await page.evaluate(() => enterPractice()); await page.waitForTimeout(4000);
  const P = (pid, f) => page.evaluate(([pid, f]) => (new Function('P', 'return ' + f))(S.projects[pid]), [pid, f]);
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err })), [type, pid, data, as]);

  assert(await page.evaluate(() => S.rejected.length) === 0, 'practice data loads with no refused entries');
  assert(await P('AIEC-P001', 'P.stage === "amc" && P.tickets.length >= 1 && !!P.amcEnd'), 'practice AMC project has a contract end date and a ticket');
  assert(await page.evaluate(() => S.workers.PTECH.profile.area === 'Pune West' && !!S.workers.PTECH.training.app), 'practice technician has a profile and training');

  /* 8. WhatsApp template through the wizard */
  await page.evaluate(() => { loginAs(S.users.PSALES); ACT.permsDone(); wiz('wa', 'AIEC-P007'); }); await page.waitForTimeout(250);
  await page.click('[data-a="pick"][data-k="tpl"][data-v="payment"]'); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(250);
  const txt = await page.inputValue('#f_text');
  assert(/Mrs\. Deshpande/.test(txt) && /AIEC-P007/.test(txt) && !/\{\w+\}/.test(txt), 'template is filled with the customer name, project number and amount');
  await page.click('[data-a="wizNext"]'); await page.waitForTimeout(200);
  assert(await page.evaluate(() => W && W.err === t('err_wa_open')), 'cannot save before opening WhatsApp');
  await page.click('[data-a="waOpen"]'); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(500);
  const mid = await P('AIEC-P007', 'P.msgs.length === 1 && P.msgs[0].status === "opened" && P.msgs[0].id');
  assert(mid, 'sent message is logged on the project as "no reply yet"');
  assert((await act('MSG_STATUS', 'AIEC-P007', { mid, status: 'replied' }, 'PSALES')).ok && await P('AIEC-P007', 'P.msgs[0].status === "replied"'), 'reply can be recorded');
  assert(!(await act('MSG_LOGGED', 'AIEC-P007', { mid: 'X1', template: 'intro', text: 'hi' }, 'PSUP')).ok, 'supplier cannot send customer messages');
  assert((await act('TEMPLATE_SET', null, { tid: 'c1', name: 'Diwali offer', text: { en: 'Happy Diwali {name}', hi: '', mr: '' } }, 'PADMIN')).ok, 'admin can add a custom template');
  assert(!(await act('TEMPLATE_SET', null, { tid: 'c2', name: 'x', text: { en: 'x' } }, 'PSALES')).ok, 'sales cannot change templates');

  /* 9. AMC: ticket lifecycle, service visit, renewal */
  const tid = await P('AIEC-P001', 'P.tickets[0].id');
  assert(await page.evaluate(() => myTasks(S.users.PQC).some(n => n.k === 'assign_ticket') && !myTasks(S.users.PSALES).some(n => n.k === 'assign_ticket')), 'QC (no service lead chosen) gets the "choose who fixes" task, not Sales');
  await page.evaluate(() => loginAs(S.users.PADMIN));
  assert((await act('TICKET_ASSIGNED', 'AIEC-P001', { tid, uid: 'PTECH', due: '2099-01-01' }, 'PADMIN')).ok, 'ticket assigned to technician');
  await page.evaluate(() => loginAs(S.users.PTECH));
  assert(await page.evaluate(() => myTasks(App.me).some(n => n.k === 'work_ticket')), 'technician gets the "fix the problem" task');
  assert(!(await act('TICKET_UPDATED', 'AIEC-P001', { tid, status: 'resolved', note: 'done' }, 'PFIELD')).ok, 'another worker cannot update the ticket');
  assert((await act('TICKET_UPDATED', 'AIEC-P001', { tid, status: 'resolved', note: 'Door roller changed', ev: [] }, 'PTECH')).ok, 'technician marks it fixed');
  assert((await act('TICKET_CLOSED', 'AIEC-P001', { tid, ok: false, note: 'Still noisy' }, 'PADMIN')).ok && await P('AIEC-P001', 'P.tickets[0].status === "in_progress" && P.tickets[0].hist.some(h => h.status === "reopened")'), 'not fixed → ticket opens again');
  await act('TICKET_UPDATED', 'AIEC-P001', { tid, status: 'resolved', note: 'Door track cleaned', ev: [] }, 'PTECH');
  assert((await act('TICKET_CLOSED', 'AIEC-P001', { tid, ok: true, note: '' }, 'PADMIN')).ok && await P('AIEC-P001', 'P.tickets[0].status === "closed" && P.tickets[0].hist.length >= 5'), 'fixed → closed with full history');
  const checks = { ride: 'pass', doors: 'fail', alarm: 'pass', brake: 'pass', ropes: 'pass', oil: 'pass', pit: 'pass' };
  const ev1 = await page.evaluate(() => [{ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'amc', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }]);
  assert(!(await act('SERVICE_DONE', 'AIEC-P001', { visit: 0, checks, ev: ev1 }, 'PSALES')).ok, 'only the technician can do a service visit');
  assert((await act('SERVICE_DONE', 'AIEC-P001', { visit: 0, checks, met: 'Mr. Gokhale', ev: ev1 }, 'PTECH')).ok && await P('AIEC-P001', '!!P.service[0]'), 'technician saves service visit with checks and photo');
  assert(!(await act('SERVICE_DONE', 'AIEC-P001', { visit: 0, checks, ev: ev1 }, 'PTECH')).ok, 'the same visit cannot be saved twice');
  const end0 = await P('AIEC-P001', 'P.amcEnd');
  assert((await act('AMC_RENEWED', 'AIEC-P001', { years: 2, amount: 28000 }, 'PSALES')).ok && (await P('AIEC-P001', 'P.amcEnd')) > end0, 'AMC renewal extends the contract');
  assert(!(await act('AMC_RENEWED', 'AIEC-P002', { years: 1, amount: 1 }, 'PSALES')).ok, 'cannot renew before handover');

  /* 10. escalation and two-person approval */
  assert(await page.evaluate(() => { const st = S.config.escalateDays; S.config.escalateDays = 0; const ok = needs(S.projects['AIEC-P006']).some(n => n.k === 'escalated'); S.config.escalateDays = st; return ok; }), 'waiting work is sent up to the Owner/Admin after the set days');
  assert((await act('CONFIG_SET', null, { key: 'dualControl', value: 1 }, 'POWNER')).ok, 'owner switches on two-person approval');
  const r1 = await act('DEAL_REOPENED', 'AIEC-P009', { reason: 'Customer called back' }, 'POWNER');
  const aid = await page.evaluate(() => S.approvalOrder[S.approvalOrder.length - 1]);
  assert(r1.ok && aid && await P('AIEC-P009', 'P.stage === "lost"'), 'risky action becomes an approval request, nothing changes yet');
  assert(!(await act('APPROVAL_DECIDED', null, { aid, decision: 'approve' }, 'POWNER')).ok, 'the person who asked cannot approve it');
  await page.evaluate(() => loginAs(S.users.PADMIN));
  assert(await page.evaluate(() => myTasks(App.me).some(n => n.k === 'second_approval')), 'admin gets the second-approval task');
  assert((await act('APPROVAL_DECIDED', null, { aid, decision: 'approve', reason: 'OK' }, 'PADMIN')).ok && await P('AIEC-P009', 'P.stage !== "lost"'), 'second person approves → action happens');
  assert(await page.evaluate(() => rebuild(EVENTS).projects['AIEC-P009'].stage === S.projects['AIEC-P009'].stage && rebuild(EVENTS).rejected.length === 0), 'rebuilding from events gives the same result');
  await act('CONFIG_SET', null, { key: 'dualControl', value: 0 }, 'POWNER');

  /* 11. onboarding: profile, documents, training */
  assert(!(await act('WORKER_PROFILE', null, { uid: 'PTECH', area: 'x' }, 'PFIELD')).ok, 'a worker cannot change another worker\'s profile');
  assert(!(await act('DOC_VERIFIED', null, { uid: 'PADMIN', doc: 'id', status: 'verified' }, 'PADMIN')).ok, 'nobody can check their own documents');
  assert((await act('TRAINING_PASSED', null, { module: 'lead', answers: [0, 0, 0], score: 1 }, 'PFIELD')).err === 'err_quiz', 'wrong answers do not pass training');
  assert((await act('TRAINING_PASSED', null, { module: 'lead', answers: [2, 0, 1], score: 3 }, 'PFIELD')).ok, 'correct answers pass training');
  await page.evaluate(() => loginAs(S.users.PFIELD)); await page.evaluate(() => wiz('train', null, { module: 'app' })); await page.waitForTimeout(200);
  for (let i = 0; i < 3; i++) { await page.click('[data-a="wizNext"]'); await page.waitForTimeout(120); }
  for (const a of [0, 1, 2]) { await page.click(`[data-a="pick"][data-k="a.${[0, 1, 2].indexOf(a)}"][data-v="${a}"]`); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(150); }
  await page.waitForTimeout(400);
  assert(await page.evaluate(() => !!S.workers.PFIELD.training.app), 'training wizard (3 lessons, 3 questions) passes the module');
  await act('CONFIG_SET', null, { key: 'requireTraining', value: 1 }, 'POWNER');
  assert(await page.evaluate(() => !isAuthorised('PTECH') || S.workers.PTECH.training.safety), 'technician without safety training is not authorised');
  await act('CONFIG_SET', null, { key: 'requireTraining', value: 0 }, 'POWNER');

  /* 12. weekly pay: AIEC pays the technicians' company (Licensed Partner Company) */
  const wk = await page.evaluate(() => { const now = weekKey(nowISO()); const w = weeksFor('PPART1').find(x => x.week < now && x.total > 0); return w && { week: w.week, total: w.total }; });
  assert(wk && wk.total > 0, 'the company bill is worked out from its technicians\' saved steps (' + (wk && wk.total) + ')');
  const nowWk = await page.evaluate(() => weekKey(nowISO()));
  assert((await act('PAY_APPROVED', null, { uid: 'PPART1', week: nowWk, computed: 0, adjust: 0, amount: 0 }, 'POWNER')).err === 'err_week_open', 'the running week cannot be approved');
  assert(!(await act('PAY_APPROVED', null, { uid: 'PPART1', week: wk.week, computed: 1, adjust: 0, amount: 999999 }, 'POWNER')).ok, 'approved amount must match the worked-out amount');
  assert((await act('PAY_APPROVED', null, { uid: 'PPART1', week: wk.week, computed: wk.total, adjust: 0, amount: wk.total }, 'POWNER')).ok, 'owner approves the week');
  assert(!(await act('PAY_PAID', null, { uid: 'PPART1', week: wk.week, ref: 'B1' }, 'POWNER')).ok, 'only Finance can pay');
  assert((await act('PAY_PAID', null, { uid: 'PPART1', week: wk.week, ref: 'NEFT-123' }, 'PFIN')).ok, 'Finance records the payment with a bank reference');
  assert((await act('PAY_DISPUTED', null, { uid: 'PPART1', week: wk.week, reason: 'One step missing' }, 'PPART1')).ok, 'the company can ask a question about its bill');
  await page.evaluate(() => loginAs(S.users.PADMIN));
  assert(await page.evaluate(() => myTasks(App.me).some(n => n.k === 'pay_dispute')), 'admin gets the pay question task');
  assert((await act('PAY_DISPUTE_ANSWERED', null, { uid: 'PPART1', week: wk.week, note: 'Checked: all steps counted' }, 'PADMIN')).ok, 'admin answers it');

  /* 14. helper and 16. address */
  const hs = await page.evaluate(() => helperSearch('how do I record a payment').map(x => x.title));
  assert(hs.length && /payment/i.test(hs[0]), 'helper finds the payment answer: ' + hs[0]);
  await page.evaluate(() => { LANG = 'mr'; }); const hm = await page.evaluate(() => helperSearch('पेमेंट कसे नोंदवायचे').length); await page.evaluate(() => { LANG = 'en'; });
  assert(hm > 0, 'helper works in Marathi');
  assert(await page.evaluate(() => lookupAddress({ lat: 18.5, lng: 73.8 })) === 'Lane 5, Kothrud, Pune, Maharashtra, 411038', 'address is found from GPS when online');

  /* reused photo */
  const dupe = await page.evaluate(() => { const e = Object.values(S.evidence).find(x => x.kind === 'photo'); e.dev = 'D1'; const f = similarEvidence(e.hash, null, 'other'); e.dev = 'practice'; return !!f; });
  assert(dupe, 'a photo already used elsewhere is recognised');

  /* every new screen renders in all three languages for the right roles, with no missing words */
  const screens = [['PADMIN', 'templates', {}], ['PADMIN', 'workers', {}], ['PADMIN', 'worker', { uid: 'PTECH' }], ['PTECH', 'earn', { uid: 'PTECH' }], ['PFIN', 'earn', { uid: 'PPART1' }], ['PPART1', 'earn', { uid: 'PPART1' }],
    ['PFIELD', 'training', {}], ['PSALES', 'leaders', {}], ['PTECH', 'helper', {}], ['PTECH', 'project', { pid: 'AIEC-P001' }], ['PSALES', 'project', { pid: 'AIEC-P007' }], ['POWNER', 'rules', {}], ['PADMIN', 'home', {}], ['PTECH', 'home', {}], ['PFIN', 'home', {}], ['PADMIN', 'me', {}]];
  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of screens) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(60);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (wide) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  await page.evaluate(() => { LANG = 'mr'; loginAs(S.users.PSALES); go('project', { pid: 'AIEC-P001' }); }); await page.waitForTimeout(100);
  await page.evaluate(() => { const b = document.querySelector('[data-a="tab"][data-v="info"]'); if (b) b.click(); }); await page.waitForTimeout(100);
  for (const w of [['service', 'AIEC-P001', { visit: 1 }, 'PTECH'], ['ticket', 'AIEC-P001', {}, 'PSALES'], ['renew', 'AIEC-P001', {}, 'PSALES'], ['wprofile', null, { uid: 'PTECH' }, 'PTECH']]) {
    await page.evaluate(([id, pid, o, uid]) => { loginAs(S.users[uid]); wiz(id, pid, o); }, w); await page.waitForTimeout(120);
  }
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('OPERATIONS PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
