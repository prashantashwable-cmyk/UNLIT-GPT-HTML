/* Automatic onboarding for new workers and the escalation ladder: reminder → Admin → Owner, with office actions. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; });
  await page.evaluate(() => enterPractice()); await page.waitForTimeout(4500);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err })), [type, pid, data, as]);
  const tasksOf = uid => page.evaluate(uid => myTasks(S.users[uid]).map(n => ({ k: n.k, ref: n.ref, level: n.level || 0, uid: n.uid, pid: n.pid })), uid);

  assert(await ev('S.rejected.length') === 0, 'practice data loads with no refused entries');
  assert(await ev('onboarding("PSALES").ready && !onboarding("PTECH").ready && !onboarding("PFIELD2").ready'), 'practice team: most are ready, the technician and one field worker are still onboarding');

  /* automatic onboarding for a new person */
  await page.evaluate(async () => { const salt = 'x'; await perform('USER_ADDED', null, { uid: 'PNEWT', name: 'New Tech', role: 'tech', salt, pin: await pinHash('1111', salt) }, { as: 'PADMIN', quiet: true }); });
  let ob = await ev('onboarding("PNEWT")');
  assert(ob.total === 8 && ob.done === 0, 'adding a technician starts an 8-step onboarding checklist (profile, 3 documents, 4 trainings)');
  let tk = await tasksOf('PNEWT');
  assert(tk.some(n => n.k === 'onb_profile') && tk.some(n => n.k === 'training'), 'the new person automatically gets "fill your profile" and training tasks');
  assert((await tasksOf('PADMIN')).some(n => n.k === 'check_docs' && n.uid === 'PNEWT'), 'the office automatically gets "check documents" for the new person');
  assert(!(await tasksOf('PADMIN')).some(n => n.k === 'escalated' && n.uid === 'PNEWT'), 'no escalation on day one');
  await page.evaluate(() => { S.users.PNEWT.t = new Date(Date.now() - 8 * 864e5).toISOString(); });
  assert((await tasksOf('PADMIN')).some(n => n.k === 'escalated' && n.ref === 'onboarding' && n.uid === 'PNEWT' && n.level === 2), 'onboarding not finished after 7 days → Admin');
  assert(!(await tasksOf('POWNER')).some(n => n.k === 'escalated' && n.uid === 'PNEWT'), '…but not yet the Owner');
  await page.evaluate(() => { S.users.PNEWT.t = new Date(Date.now() - 15 * 864e5).toISOString(); });
  assert((await tasksOf('POWNER')).some(n => n.k === 'escalated' && n.uid === 'PNEWT' && n.level === 3), 'after 14 days → Owner');
  assert(!(await tasksOf('PNEWT')).some(n => n.k === 'escalated'), 'the worker never sees their own escalation');
  /* finish onboarding */
  assert((await act('WORKER_PROFILE', null, { uid: 'PNEWT', phone: '9822000099', area: 'Pune', availability: 'available', skills: ['install'] }, 'PNEWT')).ok, 'worker fills profile');
  for (const d of ['id', 'address', 'safety_cert']) await act('DOC_VERIFIED', null, { uid: 'PNEWT', doc: d, status: 'verified' }, 'PADMIN');
  for (const [m, a] of await ev('TRAIN.filter(x => x[1].includes("tech")).map(x => [x[0], x[2]])')) await act('TRAINING_PASSED', null, { module: m, answers: a, score: 3 }, 'PNEWT');
  assert(await ev('onboarding("PNEWT").ready && isAuthorised("PNEWT")'), 'all steps done → "Ready for work" and allowed to install');
  assert(!(await tasksOf('POWNER')).some(n => n.uid === 'PNEWT') && !(await tasksOf('PNEWT')).some(n => ['onb_profile', 'training'].includes(n.k)), 'onboarding tasks and escalations disappear by themselves');

  /* project ladder */
  const pid = 'AIEC-P005'; /* material_order: waiting for the supplier */
  const setAge = d => page.evaluate(([pid, d]) => { S.projects[pid].since = new Date(Date.now() - d * 864e5 - 3600e3).toISOString(); }, [pid, d]);
  await setAge(0);
  assert(!(await tasksOf('PSUP')).find(n => n.pid === pid).level, 'fresh work has no escalation');
  await setAge(1);
  assert((await tasksOf('PSUP')).find(n => n.pid === pid).level === 1 && !(await tasksOf('PADMIN')).some(n => n.k === 'escalated' && n.pid === pid && n.ref === 'dispatch'), 'after 1 day: reminder shown to the supplier only');
  await setAge(3);
  assert((await tasksOf('PADMIN')).some(n => n.k === 'escalated' && n.pid === pid && n.ref === 'dispatch' && n.level === 2) && !(await tasksOf('POWNER')).some(n => n.k === 'escalated' && n.pid === pid && n.ref === 'dispatch'), 'after 3 days: Admin, not Owner');
  await setAge(7);
  assert((await tasksOf('POWNER')).some(n => n.k === 'escalated' && n.pid === pid && n.ref === 'dispatch' && n.level === 3), 'after 7 days: Owner');

  /* office acts through the wizard: reassign to another supplier */
  await page.evaluate(async () => { const salt = 'y'; await perform('USER_ADDED', null, { uid: 'PSUP2', name: 'Second Supplier', role: 'supplier', salt, pin: await pinHash('1111', salt) }, { as: 'PADMIN', quiet: true }); });
  await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); go('escalations'); }); await page.waitForTimeout(200);
  const idx = await page.evaluate(pid => App.tasks.findIndex(n => n.pid === pid && n.ref === 'dispatch'), pid);
  assert(idx >= 0 && /Escalations/.test(await page.innerText('header')), 'escalations screen lists the stuck order');
  await page.click(`[data-a="openTask"][data-v="${idx}"]`); await page.waitForTimeout(250);
  assert(await page.$('[data-a="pick"][data-k="action"][data-v="reassign"]'), 'reassign is offered when another supplier exists');
  await page.click('[data-a="pick"][data-k="action"][data-v="reassign"]'); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(150);
  await page.click('[data-a="pick"][data-k="uid"][data-v="PSUP2"]'); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(150);
  await page.click('[data-a="wizNext"]'); await page.waitForTimeout(150);
  assert(await ev('W && !!W.err'), 'a note is required');
  await page.fill('#f_note', 'Kaveri has no truck this week'); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(500);
  assert(await ev(`S.projects["${pid}"].supplier === "PSUP2"`), 'the order moved to the second supplier');
  assert(!(await tasksOf('POWNER')).some(n => n.k === 'escalated' && n.pid === pid && n.ref === 'dispatch') && (await tasksOf('PSUP2')).some(n => n.pid === pid && !n.level), 'escalation cleared and the clock restarts for the new supplier');

  /* "I spoke to them" twice and still stuck → straight to the Owner */
  const pid2 = 'AIEC-P006'; /* qc_site: waiting for QC */
  await page.evaluate(pid2 => { S.projects[pid2].since = new Date(Date.now() - 4 * 864e5).toISOString(); }, pid2);
  const e2 = await page.evaluate(pid2 => needs(S.projects[pid2]).find(n => n.k === 'escalated'), pid2);
  assert(e2 && e2.level === 2, 'QC inspection waiting 4 days is at Admin level');
  const tomorrow = await ev('addDays(1)');
  assert(!(await act('ESC_ACTED', pid2, { key: e2.eid, ref: e2.ref, level: 2, action: 'called', until: await ev('addDays(10)'), note: 'x' }, 'PADMIN')).ok, 'a new date more than 7 days away is refused');
  assert(!(await act('ESC_ACTED', pid2, { key: e2.eid, ref: e2.ref, level: 2, action: 'called', until: tomorrow, note: 'x' }, 'PSALES')).ok, 'only Owner/Admin can act on escalations');
  assert((await act('ESC_ACTED', pid2, { key: e2.eid, ref: e2.ref, level: 2, action: 'called', until: tomorrow, note: 'Vijay will go tomorrow' }, 'PADMIN')).ok, 'admin records "I spoke to them"');
  assert(!(await page.evaluate(pid2 => needs(S.projects[pid2]).some(n => n.k === 'escalated'), pid2)), 'escalation waits until the agreed date');
  assert((await page.evaluate(pid2 => needs(S.projects[pid2]).find(n => n.k === 'inspect_site').level, pid2)) === 2, 'the QC person still sees the "Admin informed" warning');
  await act('ESC_ACTED', pid2, { key: e2.eid, ref: e2.ref, level: 2, action: 'called', until: tomorrow, note: 'Called again' }, 'PADMIN');
  await page.evaluate(k => { S.escAck[k].until = addDays(-1); }, e2.eid);
  const e3 = await page.evaluate(pid2 => needs(S.projects[pid2]).find(n => n.k === 'escalated'), pid2);
  assert(e3 && e3.level === 3 && e3.roles.includes('owner'), 'acted on twice and still stuck → Owner, even before 7 days');
  assert(await ev('S.escLog.length >= 3 && rebuild(EVENTS).escLog.length === S.escLog.length'), 'every office action is kept and rebuilt from events');

  /* overdue ticket */
  const tid = await ev('S.projects["AIEC-P001"].tickets[0].id');
  await act('TICKET_ASSIGNED', 'AIEC-P001', { tid, uid: 'PTECH', due: await ev('addDays(-4)') }, 'PADMIN');
  const te = await page.evaluate(() => needs(S.projects['AIEC-P001']).find(n => n.k === 'escalated' && n.ref === 'work_ticket'));
  assert(te && te.level === 2, 'ticket 4 days past its date → Admin');

  /* words and layout in all languages */
  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of [['PADMIN', 'escalations', {}], ['POWNER', 'home', {}], ['PTECH', 'home', {}], ['PADMIN', 'worker', { uid: 'PTECH' }], ['PADMIN', 'workers', {}], ['POWNER', 'rules', {}]]) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  await page.evaluate(() => { LANG = 'mr'; loginAs(S.users.PADMIN); go('escalations'); }); await page.waitForTimeout(100);
  await page.click('[data-a="openTask"][data-v="0"]'); await page.waitForTimeout(150);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('ESCALATION PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
