/* Career ladder: levels, who may lead which job, stars with review counts, trust, promotion, pay by level, spot checks, strikes and appeals, celebrations. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; });
  await page.evaluate(() => enterPractice()); await page.waitForTimeout(5000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const tasks = uid => page.evaluate(uid => myTasks(S.users[uid]).map(n => n.k), uid);
  const cfg = async o => { for (const [key, value] of Object.entries(o)) await act('CONFIG_SET', null, { key, value }, 'POWNER'); };

  assert(await ev('S.rejected.length') === 0, 'practice data with the ladder loads with no refused entries');
  assert(await ev('[gradeOf("PTRAIN"), gradeOf("PHELP"), gradeOf("PTECH"), gradeOf("PSENIOR"), gradeOf("PQC")].join()') === 'trainee,helper,technician,senior,qc', 'five levels: Trainee, Helper, Technician, Senior, QC');

  /* who may lead which job */
  assert(await ev('jobSize(S.projects["AIEC-P003"])') === 'big' && await ev('S.projects["AIEC-P003"].tech') === 'PSENIOR', 'the hospital job is big and is led by the Senior');
  assert((await act('ASSIGNED', 'AIEC-P003', { role: 'tech', uid: 'PTECH' }, 'PADMIN')).err === 'err_cant_lead', 'a Technician cannot lead a big job');
  assert((await act('ASSIGNED', 'AIEC-P005', { role: 'tech', uid: 'PTRAIN' }, 'PADMIN')).err === 'err_cant_lead', 'a Trainee cannot lead any job');
  assert((await act('ASSIGNED', 'AIEC-P005', { role: 'tech', uid: 'PHELP' }, 'PADMIN')).err === 'err_cant_lead', 'a Helper cannot lead any job');
  assert((await act('CREW_ADDED', 'AIEC-P005', { uid: 'PTRAIN' }, 'PADMIN')).ok && await ev('canSee(S.users.PTRAIN, S.projects["AIEC-P005"])'), 'a Trainee joins as crew and can see the job');
  assert((await act('CREW_ADDED', 'AIEC-P005', { uid: 'PHELP' }, 'PTECH')).err === 'err_access', 'only a Senior lead (or the office) adds crew');
  assert((await act('SOP_STEP_DONE', 'AIEC-P003', { step: await ev('sopNext(S.projects["AIEC-P003"])'), ev: [] }, 'PHELP')).ok === false, 'crew cannot save installation steps (only the lead)');

  /* stars with review count */
  const pt = await ev('starsOf("PTECH")');
  assert(pt.count === 3 && /★ \d\.\d \(3 reviews\)/.test(await ev('starChip("PTECH")')), 'stars show the fair average and the review count: ' + (await ev('starChip("PTECH")')).replace(/<[^>]+>/g, ''));
  assert(/New \(1 reviews\)/.test(await ev('starChip("PTRAIN")')), 'fewer than 3 reviews shows "New"');
  assert(await ev('(() => { const s = starsOf("PHELP"); return s.count === 1 && s.avg === 5 && s.fair < 5; })()'), 'one 5-star review does not give a perfect fair average');
  assert((await act('CUSTOMER_RATED', 'AIEC-P001', { ref: 'handover', stars: 1, name: 'X' }, 'PSALES')).err === 'err_already', 'only one customer review per job');
  assert((await act('CREW_RATED', 'AIEC-P002', { uid: 'PTRAIN', stars: 5 }, 'PSENIOR')).ok === false, 'only the lead of the job rates its crew');
  assert((await tasks('PTECH')).includes('rate_crew'), 'the lead gets "Rate your crew" after QC passes');
  assert(await ev('rankWorkers([S.users.PTRAIN, S.users.PTECH, S.users.PHELP]).map(u => u.uid)[0]') === 'PTECH', 'pickers list the best rated first');
  assert(await ev('firstPass({ qcFinal: [{ outcome: "fail", cause: "material" }] }) && !firstPass({ qcFinal: [{ outcome: "fail", cause: "work" }] })'), 'a material or site fault does not count against the installer');

  /* rating through the screens: the lead rates the trainee with the star picker */
  await page.evaluate(() => { loginAs(S.users.PTECH); ACT.permsDone(); Notify.hide(); wiz('rateCrew', 'AIEC-P002', { uid: 'PTRAIN' }); }); await page.waitForTimeout(250);
  await page.click('[data-a="wizNext"]'); await page.waitForTimeout(100);
  assert(await ev('W && !!W.err'), 'stars must be chosen');
  await page.click('.starrow [data-v="4"]'); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(400);
  assert(await ev('starsOf("PTRAIN", "lead").count') === 2, 'the crew rating is saved');

  /* promotion: Trainee → Helper once the (Owner-approved) targets are met */
  await page.evaluate(() => { loginAs(S.users.PTRAIN); ACT.permsDone(); Notify.hide(); Notify.check({ silent: true }); });
  assert(!(await ev('ladderStatus("PTRAIN").ready')) && (await act('PROMOTED', null, { uid: 'PTRAIN', to: 'helper' }, 'PADMIN')).err === 'err_targets', 'promotion is refused until every target is met');
  await cfg({ lvHelperJobs: 2, lvHelperReviews: 2, lvHelperDays: 0 });
  await act('TRAINING_PASSED', null, { module: 'safety', answers: await ev('TRAIN.find(x => x[0] === "safety")[2]'), score: 3 }, 'PTRAIN');
  assert(await ev('ladderStatus("PTRAIN").ready') && (await tasks('PADMIN')).includes('promotion_ready'), 'targets met → the Admin gets "Promotion ready"');
  const payBefore = await ev('earnings("PTRAIN").find(l => l.what === "earn_crew_job").amount');
  assert(payBefore === 1800, 'Trainee crew pay is 60% of ₹3,000: ₹' + payBefore);
  assert((await act('PROMOTED', null, { uid: 'PTRAIN', to: 'helper' }, 'PTRAIN')).ok === false, 'nobody promotes themself');
  const n0 = await ev('(App.notifyLog || []).length');
  assert((await act('PROMOTED', null, { uid: 'PTRAIN', to: 'helper', note: 'Good start' }, 'PADMIN')).ok && await ev('gradeOf("PTRAIN")') === 'helper', 'the Admin promotes to Helper');
  assert(await ev('earnings("PTRAIN").find(l => l.what === "earn_crew_job").amount') === 1800, 'work done before the promotion keeps the old rate');
  const cel = await page.evaluate(n => { Notify.check(); return (App.notifyLog || []).slice(n); }, n0);
  assert(cel.some(x => x.kind === 'cheer' && /Helper/.test(x.title)), 'the worker gets a celebration with a cheer sound: ' + (cel[0] && cel[0].title));

  /* promotion to QC: Owner only, needs QC training and a practical test; the role changes */
  await cfg({ lvQcJobs: 0, lvQcPass: 0, lvQcStars: 0, lvQcReviews: 0, lvQcTrust: 0 });
  await act('TRAINING_PASSED', null, { module: 'qc', answers: [2, 1, 0], score: 3 }, 'PSENIOR');
  const shot = await ev('[{ id: "E" + rid(10), m: "x", kind: "photo", label: "skill", t: nowISO(), gps: null, hash: "h" + rid(8), dev: "practice", q: {} }]');
  assert((await act('SKILL_CHECKED', null, { uid: 'PSENIOR', level: 'qc', pass: true, note: 'Inspected a lift correctly', ev: shot }, 'PSENIOR')).ok === false, 'nobody tests themself');
  assert((await act('SKILL_CHECKED', null, { uid: 'PSENIOR', level: 'qc', pass: true, note: 'Inspected a lift correctly', ev: shot }, 'PQC')).ok, 'QC records the practical test');
  assert(await ev('ladderStatus("PSENIOR").ready') && (await tasks('POWNER')).includes('promotion_ready') && !(await tasks('PADMIN')).includes('promotion_ready'), 'promotion to QC goes to the Owner only');
  assert((await act('PROMOTED', null, { uid: 'PSENIOR', to: 'qc' }, 'PADMIN')).err === 'err_role', 'the Admin cannot make a QC Inspector');
  assert((await act('PROMOTED', null, { uid: 'PSENIOR', to: 'qc', note: 'Ready' }, 'POWNER')).ok && await ev('S.users.PSENIOR.role') === 'qc', 'the Owner promotes to QC; the role becomes QC');
  assert((await act('ASSIGNED', 'AIEC-P003', { role: 'qc', uid: 'PSENIOR' }, 'POWNER')).err === 'err_own_job', 'a QC Inspector never inspects a job they worked on');
  assert((await act('USER_UPDATED', null, { uid: 'PTECH', role: 'qc' }, 'POWNER')).err === 'err_use_ladder', 'nobody becomes QC by a simple role change');

  /* spot checks: fair, repeatable sample; a bad one is 2 strikes */
  const spots = await ev('spotDue().map(x => x.key).join()');
  assert(spots && await page.evaluate(() => { const a = spotDue().map(x => x.key).join(); S = rebuild(EVENTS.slice()); return a === spotDue().map(x => x.key).join(); }), 'the spot-check sample is the same after a rebuild: ' + spots);
  const sp = await ev('spotDue()[0]');
  assert((await act('SPOT_CHECKED', sp.pid, { step: sp.step, ok: false, note: 'x' }, sp.by === 'PSENIOR' ? 'PSENIOR' : 'PTECH')).ok === false, 'workers cannot spot-check their own work');
  const before = await page.evaluate(uid => activeStrikes(uid), sp.by);
  assert((await act('SPOT_CHECKED', sp.pid, { step: sp.step, ok: false, note: 'Photo is from another site' }, 'PQC')).ok && await page.evaluate(uid => activeStrikes(uid), sp.by) === before + 2, 'a bad spot check adds 2 strikes');

  /* strikes: low rating → strike; appeal → decision; expiry; effects */
  assert(await ev('activeStrikes("PHELP")') === 1 && (await tasks('POWNER')).includes('strike_appeal'), 'the helper\'s appealed strike waits for a decision by someone who did not give it');
  assert((await act('STRIKE_DECIDED', null, { uid: 'PHELP', sid: await ev('strikesOf("PHELP")[0].id'), decision: 'remove', reason: 'x' }, 'PADMIN')).err === 'err_same_person', 'the person who reported it cannot decide the appeal');
  assert((await act('STRIKE_DECIDED', null, { uid: 'PHELP', sid: await ev('strikesOf("PHELP")[0].id'), decision: 'remove', reason: 'Supplier team caused it' }, 'POWNER')).ok && await ev('activeStrikes("PHELP")') === 0, 'the Owner removes the strike after the appeal');
  await act('CREW_RATED', 'AIEC-P001', { uid: 'PHELP', stars: 2, note: 'x' }, 'PTECH').then(r => r);
  await page.evaluate(async () => { await perform('CUSTOMER_RATED', 'AIEC-P002', { ref: 'handover', stars: 2, note: 'Late', name: 'Mrs. Kale' }, { as: 'PSALES', quiet: true }); });
  const tk = await ev('strikesOf("PTECH").filter(k => k.active).length');
  assert(tk >= 1 || (await ev('S.projects["AIEC-P002"].done')) == null, 'a 1–2 star rating creates a strike (or the job is not finished yet)');
  assert(await ev('strikesOf("PHELP", new Date(Date.now() + 91 * 864e5).toISOString()).every(k => !k.active)'), 'strikes stop counting after 90 days');
  await page.evaluate(() => { const P = S.projects['AIEC-P001']; ['a', 'b', 'c'].forEach((x, i) => S.reviews.push({ id: 'T' + x, uid: 'PTECH', by: 'PQC', src: 'qc', stars: 1, pid: 'AIEC-P001', ref: 'test' + i, t: nowISO() })); });
  const nS = await ev('activeStrikes("PTECH")');
  assert(nS >= 3 && !(await ev('canLead("PTECH", S.projects["AIEC-P005"])')), `${nS} strikes: crew only, cannot lead`);
  assert(nS >= 4 ? (await tasks('PADMIN')).includes('suspend_review') && !(await tasks('POWNER')).includes('suspend_review') : (await tasks('PADMIN')).includes('review_meeting'), nS >= 4 ? '4+ strikes: suspension review goes to the Admin, not the Head Quarter' : '3 strikes: review meeting for the Admin');
  assert((await act('REVIEW_HELD', null, { uid: 'PTECH', note: 'Talked about quality; extra spot checks for a month' }, 'POWNER')).ok && !(await tasks('POWNER')).includes('suspend_review') && !(await tasks('PADMIN')).includes('review_meeting'), 'the meeting is recorded and the task closes');
  assert(await ev('ladderStatus("PTECH").checks.find(c => c.k === "lc_no_strikes").ok') === false, 'strikes pause promotion');

  /* screens in three languages */
  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of [['PTRAIN', 'ladder', { uid: 'PTRAIN' }], ['PADMIN', 'ladder', { uid: 'PHELP' }], ['PTECH', 'reviews', { uid: 'PTECH' }], ['PADMIN', 'workers', {}], ['PHELP', 'home', {}], ['PCUST', 'home', {}], ['PSALES', 'leaders', {}], ['PADMIN', 'project', { pid: 'AIEC-P003' }]]) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  for (const [uid, id, pid, o] of [['PTECH', 'skill', null, { uid: 'PHELP' }], ['PADMIN', 'promote', null, { uid: 'PHELP' }], ['PHELP', 'appeal', null, { sid: 'x' }], ['PQC', 'spot', 'AIEC-P003', { step: 0 }], ['PADMIN', 'crewAdd', 'AIEC-P004', {}], ['PSALES', 'rate', 'AIEC-P001', { ref: 'visit:0', about: 'PTECH' }]])
    await page.evaluate(([uid, id, pid, o]) => { loginAs(S.users[uid]); wiz(id, pid, o); }, [uid, id, pid, o]), await page.waitForTimeout(80);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('LADDER PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
