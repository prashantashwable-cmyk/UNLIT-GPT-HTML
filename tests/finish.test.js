/* Finishing touches: colour themes, sync status, a field worker's day summary, yearly safety test, trial job before leading, privacy notice. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  assert(await ev('S.rejected.length === 0'), 'practice data loads with nothing refused');

  /* themes */
  await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('me'); }); await page.waitForTimeout(200);
  assert(await page.$('[data-a="setTheme"][data-v="dark"]'), 'settings offer colour themes');
  await page.evaluate(() => ACT.setTheme('dark')); await page.waitForTimeout(150);
  const bg = await ev('getComputedStyle(document.body).backgroundColor');
  assert(await ev('document.documentElement.dataset.theme') === 'dark' && bg === 'rgb(20, 22, 27)', 'dark theme for night work: ' + bg);
  await page.evaluate(() => ACT.setTheme('contrast')); await page.waitForTimeout(100);
  assert(await ev('getComputedStyle(document.body).backgroundColor') === 'rgb(255, 255, 255)' && await ev('App.set.theme') === 'contrast', 'strong contrast for bright sun, remembered');
  await page.evaluate(() => ACT.setTheme('auto')); await page.waitForTimeout(100);

  /* sync status */
  await page.evaluate(async () => { const p = exportPack('full'); await importText(JSON.stringify(p)); go('data'); }); await page.waitForTimeout(250);
  const dt = await page.innerText('main');
  assert(/Sync status/.test(dt) && /This phone/.test(dt) && /Files loaded lately/.test(dt) && await ev('App.set.imports.length') >= 1, 'the data screen shows sync status: phones, newest records and files loaded');

  /* field worker's day */
  await act('CONFIG_SET', null, { key: 'officeNumber', value: '02041234567' }, 'POWNER');
  await act('CONFIG_SET', null, { key: 'payLeadValid', value: 150 }, 'POWNER');
  await page.evaluate(() => { loginAs(S.users.PFIELD); ACT.permsDone(); Notify.hide(); window._opened = []; window.open = u => { window._opened.push(u); return null; }; go('report'); }); await page.waitForTimeout(200);
  assert(/Earned today/.test(await page.innerText('main')), 'the day report shows today\'s estimated earnings');
  await page.click('[data-a="sendDay"]'); await page.waitForTimeout(100);
  const sent = await ev('decodeURIComponent(window._opened[0] || "")');
  assert(sent.startsWith('https://wa.me/912041234567') && /day summary/.test(sent) && /Sites added/i.test(sent), 'the day summary is prepared as a WhatsApp message to the office');

  /* yearly safety test */
  assert(await ev('onboarding("PSENIOR").ready'), 'the senior technician is ready for work');
  await page.evaluate(() => { S.workers.PSENIOR.training.safety.t = new Date(Date.now() - 400 * 864e5).toISOString(); });
  assert(await ev('!onboarding("PSENIOR").ready && onboarding("PSENIOR").steps.some(x => x.module === "safety" && x.expired)'), 'after 12 months the safety test must be taken again');
  await page.evaluate(() => { loginAs(S.users.PSENIOR); go('training'); }); await page.waitForTimeout(150);
  assert(/Time to take this test again/.test(await page.innerText('main')), 'the training screen says so');
  const ans = await ev('TRAIN.find(x => x[0] === "safety")[2]');
  assert((await act('TRAINING_PASSED', null, { module: 'safety', answers: ans, score: 3 }, 'PSENIOR')).ok && await ev('onboarding("PSENIOR").ready'), 'passing it again makes the technician ready');
  await act('CONFIG_SET', null, { key: 'safetyRetest', value: 0 }, 'POWNER');
  await page.evaluate(() => { S.workers.PSENIOR.training.safety.t = new Date(Date.now() - 900 * 864e5).toISOString(); });
  assert(await ev('onboarding("PSENIOR").ready'), 'with the rule at 0 it never expires');

  /* trial job */
  await page.evaluate(async () => { const salt = 'z'; await perform('USER_ADDED', null, { uid: 'PLAT', name: 'Lateral Tech', role: 'tech', grade: 'technician', company: 'PPART1', trial: true, salt, pin: await pinHash('1234', salt) }, { as: 'PADMIN', quiet: true }); });
  const P3 = 'AIEC-P003';
  assert(await ev('trialNeeded("PLAT") && canLead("PLAT", S.projects["AIEC-P005"])'), 'a technician added at Technician level can lead ordinary jobs while the trial is pending');
  await page.evaluate(async () => { const salt = 'q'; await perform('USER_ADDED', null, { uid: 'PLS', name: 'Lateral Senior', role: 'tech', grade: 'senior', company: 'PPART1', trial: true, salt, pin: await pinHash('1234', salt) }, { as: 'POWNER', quiet: true }); });
  assert(await ev('!canLead("PLS", S.projects["AIEC-P003"]) && canLead("PLS", S.projects["AIEC-P005"])'), 'a Senior added directly cannot lead a big job before the trial');
  await page.evaluate(() => { const P = S.projects['AIEC-P002']; const o = { tech: P.tech, out: P.qcFinal.slice() }; P.tech = 'PLS'; P.qcFinal = []; apply(S, { id: 'X-auto', t: nowISO(), by: 'PQC', type: 'QC_FINAL_RESULT', pid: P.id, data: { outcome: 'pass', checks: {} } }); window._autoTrial = !trialNeeded('PLS') && canLead('PLS', S.projects['AIEC-P003']); P.tech = o.tech; P.qcFinal = o.out; });
  assert(await ev('window._autoTrial'), 'their first lead job that passes final inspection counts as the trial; then big jobs are allowed');
  assert((await act('TRIAL_RESULT', P3, { uid: 'PLAT', ok: true }, 'PQC')).err === 'err_trial_crew', 'the trial must be a job where the person was in the team');
  assert((await act('CREW_ADDED', P3, { uid: 'PLAT' }, 'PADMIN')).ok, 'the office puts the person in a job\'s team');
  assert((await act('TRIAL_RESULT', P3, { uid: 'PLAT', ok: false }, 'PQC')).err === 'err_reason', '"needs another trial" needs a reason');
  assert((await act('TRIAL_RESULT', P3, { uid: 'PLAT', ok: true }, 'PTECH')).err === 'err_access', 'only QC, the office or the Senior lead of the job records it');
  assert((await act('TRIAL_RESULT', P3, { uid: 'PLAT', ok: true, note: 'Careful with wiring' }, 'PQC')).ok && await ev('!trialNeeded("PLAT") && canLead("PLAT", S.projects["AIEC-P005"])'), 'after a passed trial job the trial is done (big jobs then follow the normal level rules)');
  assert(await ev('!trialNeeded("PTECH") && !trialNeeded("PSENIOR")'), 'people who grew through the ladder or were added before need no trial');
  await page.evaluate(() => { loginAs(S.users.PADMIN); go('worker', { uid: 'PLAT' }); }); await page.waitForTimeout(150);
  assert(/Trial job passed/.test(await page.innerText('main')), 'the worker profile shows the trial job');
  assert(await page.evaluate(() => { S = rebuild(EVENTS.slice()); return !S.rejected.length; }), 'everything rebuilds with nothing refused');

  /* privacy notice: a real company, first login */
  const B = await launch(); const pb = B.page;
  await pb.evaluate(async () => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; App.set.mode = 'real'; await loadMode('real'); App.form = { org: 'Test Lifts', name: 'Asha Owner', pin1: '123456', pin2: '123456' }; await ACT.createOrg(); });
  await pb.waitForTimeout(1500);
  await pb.evaluate(() => { App.set.permsSeen = {}; loginAs(App.me); }); await pb.waitForTimeout(200);
  const pt = await pb.innerText('main');
  assert(/Privacy notice/.test(pt) && /Digital Personal Data Protection Act, 2023/.test(pt) && /Tapping "I agree\. Start" records/.test(pt) && /stay inside the company/.test(pt), 'the first-login screen shows the privacy notice in short, the law, and what tapping records');
  await pb.evaluate(() => ACT.permsDone()); await pb.waitForTimeout(800);
  assert(await pb.evaluate(() => S.privacy && S.privacy[App.me.uid] && S.privacy[App.me.uid].v === PRIVACY_V && EVENTS.some(e => e.type === 'PRIVACY_ACCEPTED' && e.sig)), 'reading it is a signed record');
  await pb.evaluate(() => go('privacy')); await pb.waitForTimeout(150);
  assert(/Read on/.test(await pb.innerText('main')), 'the privacy page shows when it was read');
  if (B.errors.length) { console.error(B.errors.join('\n')); process.exit(1); }
  await B.browser.close();
  assert(!(await ev('EVENTS.some(e => e.type === "PRIVACY_ACCEPTED")')), 'practice mode records nothing');

  for (const lang of ['en', 'hi', 'mr']) for (const th of ['dark', 'contrast']) for (const [uid, name, p] of [['PADMIN', 'data', {}], ['PFIELD', 'report', {}], ['PADMIN', 'worker', { uid: 'PLAT' }], ['PADMIN', 'privacy', {}], ['PSALES', 'home', {}]]) {
    await page.evaluate(([lang, th, uid, name, p]) => { LANG = lang; App.set.lang = lang; App.set.theme = th; applyTheme(); loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go(name, p); }, [lang, th, uid, name, p]); await page.waitForTimeout(50);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang}, ${th})`);
  }
  await page.evaluate(() => { LANG = 'mr'; App.set.theme = 'auto'; applyTheme(); App.set.permsSeen = {}; loginAs(S.users.PTECH); }); await page.waitForTimeout(100);
  await page.evaluate(() => { loginAs(S.users.PADMIN); go('me'); }); await page.waitForTimeout(100);
  await page.evaluate(async () => { S.users.PLAT.trial = true; S.workers.PLAT.trials = []; go('worker', { uid: 'PLAT' }); await wiz('trial', 'AIEC-P003', { uid: 'PLAT' }); }); await page.waitForTimeout(100);
  await page.evaluate(() => { W = null; go('worker', { uid: 'PLAT' }); }); await page.waitForTimeout(100);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('FINISH PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
