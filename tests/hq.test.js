/* The Head Quarter stays out of day-to-day work: with an Admin, approvals, refunds and covering a missing Sales/Finance/QC person
   go to the Admin; the Head Quarter gets only last-level escalations, SOS/injury alarms and decisions about the Admin, and can view
   everyone's open work. With no Admin, the Head Quarter takes the work so nothing gets stuck. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const tasks = uid => page.evaluate(uid => myTasks(S.users[uid]).map(n => n.k), uid);
  const DAY = ['approve_quote', 'approve_pay', 'answer', 'refund_decide', 'suspend_review', 'verify_payment', 'release', 'resolve_blocker', 'complete_handover', 'record_licence', 'decide_claim'];

  const o = await tasks('POWNER'), a = await tasks('PADMIN');
  assert(!o.some(k => DAY.includes(k)), 'with an Admin, the Head Quarter has no day-to-day tasks: ' + o.join(','));
  assert(a.includes('approve_quote') || a.includes('approve_pay'), 'the Admin has the approvals');

  /* chat approval requests go to the Admin */
  await act('CHAT_POSTED', 'AIEC-P003', { kind: 'approval', text: 'Extra scaffolding 2 days?', toRole: 'admin' }, 'PSALES');
  assert((await tasks('PADMIN')).includes('answer') && !(await tasks('POWNER')).includes('answer'), 'a chat approval request goes to the Admin');
  await page.evaluate(() => loginAs(S.users.PADMIN));
  assert(!(await ev('chatPeople(S.projects["AIEC-P003"]).list.some(x => x.role === "owner")')), 'the Head Quarter is not offered in the job chat');

  /* covering a missing Finance person: the Admin, not the Head Quarter */
  await act('USER_UPDATED', null, { uid: 'PFIN', active: false }, 'POWNER');
  const pend = await ev(`(P => P.payments.find(p => p.status === "pending"))(S.projects["AIEC-P007"])`);
  assert((await tasks('PADMIN')).includes('verify_payment') && !(await tasks('POWNER')).includes('verify_payment'), 'no Finance person: the Admin checks payments');
  assert((await act('PAYMENT_STATUS', 'AIEC-P007', { payId: pend.id, status: 'confirmed', ref: 'STMT' }, 'POWNER')).ok === false, 'the Head Quarter does not cover while there is an Admin');
  assert((await act('PAYMENT_STATUS', 'AIEC-P007', { payId: pend.id, status: 'confirmed', ref: 'STMT' }, 'PADMIN')).ok, 'the Admin confirms it');

  /* alarms reach both */
  await act('INCIDENT_RAISED', 'AIEC-P003', { type: 'injury', note: 'Cut hand', action: 'First aid', ev: [] }, await ev('S.projects["AIEC-P003"].tech'));
  const inj = await ev(`S.projects["AIEC-P003"].incidents.filter(i => i.open && i.type === "injury").length`);
  if (inj) assert((await tasks('POWNER')).includes('resolve_incident') && (await tasks('PADMIN')).includes('resolve_incident'), 'an injury alarms both the Admin and the Head Quarter');

  /* the Head Quarter's view of everyone's work */
  await page.evaluate(() => { loginAs(S.users.POWNER); ACT.permsDone(); Notify.hide(); go('home'); }); await page.waitForTimeout(200);
  assert(await page.$('details[data-fold="allwork"]') && /Everyone's open work/.test(await page.innerText('main')), 'the Head Quarter\'s home shows everyone\'s open work');
  await page.evaluate(() => { document.querySelector('details[data-fold="allwork"]').open = true; }); await page.waitForTimeout(100);
  assert(/Admin|Finance|Technician|Sales/i.test(await page.$eval('details[data-fold="allwork"]', d => d.innerText)) && !(await page.$('details[data-fold="allwork"] [data-a="openTask"]')), 'listed by role, view only');

  /* no Admin: the Head Quarter takes the work so nothing is stuck */
  await act('USER_UPDATED', null, { uid: 'PADMIN', active: false }, 'POWNER');
  const o2 = await tasks('POWNER');
  assert(o2.some(k => DAY.includes(k)), 'with no Admin, the Head Quarter gets the office work: ' + o2.filter(k => DAY.includes(k)).join(','));
  assert(await page.evaluate(() => { S = rebuild(EVENTS.slice()); return !S.rejected.length; }), 'everything rebuilds with nothing refused');

  for (const lang of ['en', 'hi', 'mr']) {
    await page.evaluate(lang => { LANG = lang; App.set.lang = lang; loginAs(S.users.POWNER); go('home'); const d = document.querySelector('details[data-fold="allwork"]'); if (d) d.open = true; }, lang); await page.waitForTimeout(80);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll (${lang})`);
  }
  await act('USER_UPDATED', null, { uid: 'PADMIN', active: true }, 'POWNER');
  await page.evaluate(() => { loginAs(S.users.POWNER); go('home'); const d = document.querySelector('details[data-fold="allwork"]'); if (d) d.open = true; }); await page.waitForTimeout(100);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('HQ PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
