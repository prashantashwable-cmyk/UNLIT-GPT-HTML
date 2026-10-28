/* Fairness: pay, credit and strikes follow who actually did the work; strikes only when one person alone was stuck. */
const { launch } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; });
  await page.evaluate(() => enterPractice()); await page.waitForTimeout(5000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const sum = (uid, what) => page.evaluate(([uid, what]) => earnings(uid).filter(l => !what || l.what === what).reduce((a, l) => a + l.amount, 0), [uid, what]);

  /* --- Phase 1 --- */
  const bonus0 = await sum('PTECH', 'earn_qc_bonus'), lead0 = await ev('jobsOf("PTECH").lead.length'), crew0 = await sum('PTRAIN', 'earn_crew_job');
  assert((await act('ASSIGNED', 'AIEC-P002', { role: 'tech', uid: 'PSENIOR' }, 'PADMIN')).ok, 'office moves the finished job AIEC-P002 to another lead');
  assert(await sum('PTECH', 'earn_qc_bonus') === bonus0 && await ev('jobsOf("PTECH").lead.length') === lead0 && await ev('jobsOf("PSENIOR").lead.every(P => P.id !== "AIEC-P002")'), 'the QC bonus and lead credit stay with the technician who did the job');
  assert((await act('CREW_REMOVED', 'AIEC-P002', { uid: 'PTRAIN' }, 'PADMIN')).err === 'err_stage' && await sum('PTRAIN', 'earn_crew_job') === crew0, 'crew cannot be changed after final QC passed, and earned crew pay stays');
  assert((await act('CREW_ADDED', 'AIEC-P002', { uid: 'PHELP' }, 'PADMIN')).err === 'err_stage', 'nobody can be added to a finished job\'s crew to get credit');
  assert(await ev('doneLead(S.projects["AIEC-P001"])') === 'PTECH', 'the handover rating goes to the lead who did the job');

  /* escalation strikes: not for someone else's delay */
  const strikes = uid => page.evaluate(uid => activeStrikes(uid), uid);
  const s0 = await strikes('PTECH');
  await page.evaluate(() => { S.projects['AIEC-P004'].since = new Date(Date.now() - 20 * 864e5).toISOString(); });
  const k4 = await ev('needs(S.projects["AIEC-P004"]).find(n => n.k === "escalated").eid');
  assert((await act('ESC_ACTED', 'AIEC-P004', { key: k4, ref: 'x', level: 3, action: 'called', until: await ev('addDays(1)'), note: 'Waiting for arrival payment', about: ['PTECH'] }, 'POWNER')).ok && await strikes('PTECH') === s0, 'a step waiting on Finance/supplier gives the technician no strike (data in the event is ignored)');
  assert((await act('ESC_ACTED', null, { key: 'fake|x|', level: 3, action: 'called', until: await ev('addDays(1)'), note: 'x', about: ['PTECH'] }, 'POWNER')).ok && await strikes('PTECH') === s0, 'a made-up escalation cannot create a strike');
  await page.evaluate(() => { const P = S.projects['AIEC-P003']; P.since = new Date(Date.now() - 20 * 864e5).toISOString(); });
  const k3 = await ev('escKey("AIEC-P003", "install", "installing")');
  const sS = await strikes('PSENIOR');
  assert((await act('ESC_ACTED', 'AIEC-P003', { key: k3, ref: 'install', level: 3, action: 'called', until: await ev('addDays(1)'), note: 'Blocked by scaffolding' }, 'POWNER')).ok && await strikes('PSENIOR') === sS, 'no strike while the job has an open work problem (blocker)');
  assert(!(await ev('needs(S.projects["AIEC-P003"]).some(n => n.k === "escalated" && n.ref === "install")')), 'the installation timer pauses while a blocker is open');
  await act('BLOCKER_RESOLVED', 'AIEC-P003', { bid: await ev('S.projects["AIEC-P003"].blockers.find(b => b.open).id'), note: 'Scaffolding delivered' }, 'PADMIN');
  if (await ev('S.projects["AIEC-P003"].blockers.some(b => b.open)')) await page.evaluate(() => { S.projects['AIEC-P003'].blockers.forEach(b => { b.open = false; }); });
  /* today's safety check is done, so the waiting step is the installation itself */
  await page.evaluate(() => perform('SITE_CHECKED_IN', 'AIEC-P003', { day: safeDay(), gps: S.projects['AIEC-P003'].site.gps }, { as: S.projects['AIEC-P003'].tech, quiet: true }));
  await page.evaluate(() => perform('SAFETY_CHECKED', 'AIEC-P003', { ev: SAFETY_ITEMS.map(([k]) => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'safe_' + k, t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} })) }, { as: 'PSENIOR', quiet: true }));
  await page.evaluate(() => { const P = S.projects['AIEC-P003']; P.since = new Date(Date.now() - 20 * 864e5).toISOString(); });
  await act('ESC_ACTED', 'AIEC-P003', { key: k3, ref: 'install', level: 3, action: 'called', until: await ev('addDays(1)'), note: 'Called the lead' }, 'POWNER');
  await act('ESC_ACTED', 'AIEC-P003', { key: k3, ref: 'install', level: 3, action: 'new_date', until: await ev('addDays(1)'), note: 'Called again' }, 'POWNER');
  assert(await strikes('PSENIOR') === sS + 1, 'only the lead\'s own long-stuck step gives a strike, and only one per stuck task');

  /* one strike per QC event; Sales-recorded rating counts half and is not a strike */
  assert(await page.evaluate(() => { const P = S.projects['AIEC-P002']; P.qcFinal.unshift({ t: nowISO(), by: 'PQC', outcome: 'fail', cause: 'work', stars: 1, lead: 'PTRAIN', crew: [] }); S.reviews.push({ id: 'Rq', uid: 'PTRAIN', by: 'PQC', src: 'qc', stars: 1, pid: 'AIEC-P002', ref: 'qcf0', t: nowISO() }); const n = strikesOf('PTRAIN').filter(k => k.pid === 'AIEC-P002' && /qc_fail|low_rating/.test(k.reason)).length; P.qcFinal.shift(); S.reviews.pop(); return n === 1; }), 'a failed inspection with low stars counts as one strike, not two');
  assert(await page.evaluate(() => { S.reviews.push({ id: 'Rs', uid: 'PHELP', by: 'PSALES', src: 'customer', stars: 1, pid: 'AIEC-P001', ref: 'x', t: nowISO(), salesRecorded: true }); const sk = strikesOf('PHELP').some(k => k.id === 'rev:Rs'); const w = starsOf('PHELP', 'customer'); S.reviews.pop(); return !sk && w.count === 1; }), 'a low rating typed in by Sales is not a strike');

  /* pay */
  assert((await act('PAY_DISPUTED', null, { uid: 'PQC', week: await ev('weeksFor("PQC")[0].week'), reason: 'Two inspections missing' }, 'PQC')).ok, 'QC Inspectors can ask about their pay');
  const tid = await ev('S.projects["AIEC-P001"].tickets.find(x => x.status === "open").id');
  await act('TICKET_ASSIGNED', 'AIEC-P001', { tid, uid: 'PTECH', due: await ev('addDays(1)') }, 'PADMIN');
  await act('TICKET_UPDATED', 'AIEC-P001', { tid, status: 'resolved', note: 'Fixed door roller', ev: [] }, 'PTECH');
  await act('TICKET_CLOSED', 'AIEC-P001', { tid, ok: true, note: '' }, 'PADMIN');
  assert(await sum('PTECH', 'earn_repair') > 0, 'a confirmed repair is paid to the person who fixed it');
  await act('USER_UPDATED', null, { uid: 'PPART1', active: false }, 'POWNER');
  assert(await ev('globalNeeds(S.users.POWNER, true).some(n => n.k === "approve_pay" && n.uid === "PPART1")'), 'a company that stopped working with AIEC still appears for pay approval while bills are unpaid');
  await act('USER_UPDATED', null, { uid: 'PPART1', active: true }, 'POWNER');
  const notSampled = await ev('(() => { const P = S.projects["AIEC-P003"]; return Object.keys(P.sop).map(Number).find(i => !spotDue().some(x => x.key === P.id + ":" + i)); })()');
  if (notSampled != null) assert((await act('SPOT_CHECKED', 'AIEC-P003', { step: notSampled, ok: false, note: 'x' }, 'PQC')).err === 'err_not_sampled', 'a spot check can only be done on steps the app picked');

  /* --- Phase 2 --- */
  assert(await ev('activeJobs("PTECH").lead') === 1, 'a technician waiting only for material or payment is not counted as busy (only the job at handover with his signature due)');
  assert(await ev('leadOk("PTECH", "normal") && activeJobs("PTECH").lead < S.config.maxActiveJobs') && !(await ev('jobWhyNot("PPART1", Object.values(S.posts).find(p => p.kind === "lead" && postLive(p)) || { kind: "lead", pid: "AIEC-P007", card: { size: "normal" } })')), 'so his company can apply for a new lead job with him');
  assert((await act('PROJECT_CANCELLED', 'AIEC-P007', { reason: 'Customer backed out' }, 'PADMIN')).err === 'err_role', 'only the Owner can cancel a won project');
  assert((await act('PROJECT_CANCELLED', 'AIEC-P007', { reason: 'Customer backed out after signing' }, 'POWNER')).ok && await ev('S.projects["AIEC-P007"].stage') === 'lost' && await ev('Object.values(S.posts).filter(p => p.pid === "AIEC-P007").every(p => p.status !== "open")') && !(await ev('globalNeeds(S.users.POWNER, true).some(n => n.pid === "AIEC-P007")')), 'cancelling a signed project closes its posts and stops its tasks');
  await act('USER_UPDATED', null, { uid: 'PTRAIN', active: false }, 'POWNER');
  assert((await act('ASSIGNED', 'AIEC-P005', { role: 'tech', uid: 'PTRAIN' }, 'PADMIN')).err === 'err_inactive', 'work cannot be given to someone who left');
  await act('USER_UPDATED', null, { uid: 'PSUP', active: false }, 'POWNER');
  assert(await ev('myTasks(S.users.PADMIN).some(n => n.k === "reassign_work" && n.uid === "PSUP")'), 'when someone leaves, the office gets "give this work to someone else" for each job they held');
  await act('USER_UPDATED', null, { uid: 'PSUP', active: true }, 'POWNER');
  assert((await act('ASSIGNED', 'AIEC-P001', { role: 'tech', uid: 'PSENIOR' }, 'PADMIN')).ok && await ev('needs(S.projects["AIEC-P001"]).every(n => n.k !== "amc_visit" || n.uids[0] === "PSENIOR")'), 'the service technician of a finished lift can be changed');
  await page.evaluate(() => { S.projects['AIEC-P001'].amcEnd = addDays(-40); });
  assert(await ev('needs(S.projects["AIEC-P001"]).some(n => n.k === "amc_renew")'), 'a lapsed contract asks for renewal');
  assert((await act('AMC_ENDED', 'AIEC-P001', { reason: 'Customer did not renew' }, 'PSALES')).ok && !(await ev('needs(S.projects["AIEC-P001"]).some(n => ["amc_renew", "amc_visit"].includes(n.k))')), 'ending the contract stops renewal and visit reminders');
  const svc = await ev('(Object.values(S.posts).find(p => p.kind === "service") || {}).id');
  if (svc) assert(await ev(`!postLive(S.posts["${svc}"])`), 'a job post for work that no longer applies closes by itself');
  await act('DEMOTED', null, { uid: 'PSENIOR', to: 'technician', reason: 'Test' }, 'POWNER');
  assert(await ev('myTasks(S.users.PADMIN).some(n => n.k === "reassign_work" && n.pid === "AIEC-P003")') && (await act('SOP_STEP_DONE', 'AIEC-P003', { step: await ev('sopNext(S.projects["AIEC-P003"])'), ev: [] }, 'PSENIOR')).err === 'err_cant_lead', 'after a demotion the big job asks for a new lead, and the demoted person cannot continue it');

  assert(await page.evaluate(() => { const a = JSON.stringify(['PTECH', 'PSENIOR', 'PTRAIN', 'PHELP', 'PQC'].map(u => [activeStrikes(u), earnings(u).length])); S = rebuild(EVENTS.slice()); return a === JSON.stringify(['PTECH', 'PSENIOR', 'PTRAIN', 'PHELP', 'PQC'].map(u => [activeStrikes(u), earnings(u).length])); }), 'strikes and pay rebuild the same from events');
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('FAIRNESS PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
