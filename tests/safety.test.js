/* Site safety: SOS (hold 1 s, company rescue number first), daily safety check before work, hazard stops work, safety-critical QC items, fuller incident form, daily safety log. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const photos = (n, label) => ev(`Array.from({ length: ${n} }, () => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: '${label || 'site'}', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`);
  const safePhotos = () => ev(`SAFETY_ITEMS.map(([k]) => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'safe_' + k, t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`);
  const tasks = uid => page.evaluate(uid => myTasks(S.users[uid]).map(n => n.k), uid);
  const H = 'AIEC-P003'; /* hospital job, installing, lead PSENIOR, company PPART1 */
  const sop = () => act('SOP_STEP_DONE', H, { step: sopNext(S.projects[H]), ev: [] }, 'PSENIOR');
  const sopOk = async () => page.evaluate(async H => { const P = S.projects[H]; const r = await perform('SOP_STEP_DONE', H, { step: sopNext(P), ev: [{ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'work', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }] }, { as: 'PSENIOR', quiet: true }); return { ok: r.ok, err: r.err && (r.err.k || r.err) }; }, H);

  assert(await ev('S.rejected.length === 0 && Object.values(S.projects).some(P => Object.keys(P.safety || {}).length)'), 'practice data has daily safety checks for past work days and no refused records');

  /* daily safety check */
  assert((await tasks('PSENIOR'))[0] === 'safety_check', 'the lead\'s first task today is the daily safety check');
  assert((await sopOk()).err === 'err_safety_check', 'no installation step before today\'s safety check');
  assert((await act('SAFETY_CHECKED', H, { ev: (await safePhotos()).slice(0, 3) }, 'PSENIOR')).err === 'err_safety_photos', 'all 4 safety photos are needed');
  assert((await act('SAFETY_CHECKED', H, { ev: await safePhotos() }, 'PTECH')).err === 'err_access', 'only the job\'s lead sends the check');
  assert((await act('SAFETY_CHECKED', H, { ev: await safePhotos() }, 'PSENIOR')).ok, 'the lead sends 4 photos: helmet/harness, scaffolding, barricade, earthing');
  assert((await sopOk()).ok, 'work starts at once after the check');
  assert((await tasks('PPART1')).includes('review_safety'), 'the partner company is asked to look at today\'s photos');
  const day = await ev('safeDay()');
  assert((await act('SAFETY_REVIEWED', H, { day, ok: false }, 'PPART1')).err === 'err_reason', 'stopping work needs a reason');
  assert((await act('SAFETY_REVIEWED', H, { day, ok: false, note: 'No barricade on 3rd floor' }, 'PPART2')).err === 'err_access', 'another company cannot review this job');
  assert((await act('SAFETY_REVIEWED', H, { day, ok: false, note: 'No barricade on 3rd floor' }, 'PPART1')).ok, 'the company marks today\'s check "not safe"');
  assert((await sopOk()).err === 'err_safety_check' && (await tasks('PSENIOR'))[0] === 'safety_check', 'work stops; the lead must send a new check');
  assert((await act('SAFETY_CHECKED', H, { ev: await safePhotos() }, 'PSENIOR')).ok && (await sopOk()).ok, 'after a new check work goes on');
  assert(await page.evaluate(() => { const at = '2026-10-18T19:00:00.000Z'; return safeDay(at) === '2026-10-19'; }), 'the safety day follows India time');

  /* hazard stops work */
  assert((await act('INCIDENT_RAISED', H, { type: 'hazard', note: 'Live wire hanging near the pit', action: 'Power switched off', witnesses: 'Ganesh', ev: await photos(1) }, 'PPART1')).ok, 'the company reports a hazard with action taken and witness');
  assert((await sopOk()).err === 'err_incident' && await ev(`stopIncidents(S.projects["${H}"]).length === 1`), 'the hazard stops installation');
  assert((await act('SAFETY_CHECKED', H, { ev: await safePhotos() }, 'PSENIOR')).ok === false, 'no new safety check while work is stopped');
  const iid = await ev(`stopIncidents(S.projects["${H}"])[0].id`);
  assert((await act('INCIDENT_RESOLVED', H, { iid, note: 'OK to restart' }, 'PADMIN')).err === 'err_inc_close', 'closing needs the root cause and the fix');
  assert((await act('INCIDENT_RESOLVED', H, { iid, note: 'OK to restart', cause: 'Temporary cable left by builder', fix: 'Cable removed, panel locked' }, 'PADMIN')).err === 'err_photos', 'a stop-work incident needs a photo of the place made safe');
  assert((await act('INCIDENT_RESOLVED', H, { iid, note: 'OK', cause: 'x', fix: 'y', ev: await photos(1) }, 'PPART1')).ok === false, 'only the office closes it');
  assert((await act('INCIDENT_RESOLVED', H, { iid, note: 'OK to restart', cause: 'Temporary cable left by builder', fix: 'Cable removed, panel locked', ev: await photos(1, 'made_safe') }, 'PADMIN')).ok && (await sopOk()).ok, 'after closing, work goes on');
  assert((await act('INCIDENT_RAISED', 'AIEC-P001', { type: 'hazard', note: 'Pit light broken, water in pit' }, 'PTECH')).ok, 'a hazard can be reported on a lift in service (AMC)');
  const shot = await photos(1);
  assert((await act('SERVICE_DONE', 'AIEC-P001', { visit: 0, checks: { ride: 'pass', doors: 'pass', alarm: 'pass', brake: 'pass', ropes: 'pass', oil: 'pass', pit: 'pass' }, ev: shot }, 'PTECH')).err === 'err_work_stopped', 'no service visit while the hazard is open');
  assert((await act('INCIDENT_RAISED', 'AIEC-P001', { type: 'near_miss', note: 'x' }, 'PTECH')).ok === false, 'only stop-work kinds can be reported after handover');

  /* SOS */
  await page.evaluate(async () => { await perform('CONFIG_SET', null, { key: 'sosNumber', value: '9822099999' }, { as: 'POWNER', quiet: true }); });
  assert(await ev('S.config.sosNumber') === '9822099999' && (await act('CONFIG_SET', null, { key: 'sosNumber', value: 'call me' }, 'POWNER')).err === 'err_phone', 'the Owner sets the company rescue number (digits only)');
  await page.evaluate(H => { loginAs(S.users.PSENIOR); ACT.permsDone(); Notify.hide(); go('project', { pid: H }); }, H); await page.waitForTimeout(300);
  assert(await page.$('#sosBtn'), 'a red SOS button is on the technician\'s screen');
  await page.dispatchEvent('#sosBtn', 'pointerdown'); await page.waitForTimeout(200); await page.dispatchEvent('#sosBtn', 'pointerup'); await page.waitForTimeout(200);
  assert(await ev('S.sosOrder.length') === 0, 'a short tap does not send SOS');
  await page.dispatchEvent('#sosBtn', 'pointerdown'); await page.waitForTimeout(1300); await page.waitForTimeout(5500);
  const sos = await ev('S.sos[S.sosOrder[0]]');
  assert(sos && sos.by === 'PSENIOR' && sos.pid === H && sos.gps && sos.gps.lat, 'holding for 1 second saves SOS with GPS and the job: ' + JSON.stringify(sos));
  const sheet = await page.innerHTML('#ov');
  assert(sheet.indexOf('tel:9822099999') < sheet.indexOf('tel:112') && sheet.includes('tel:9822099999') && sheet.includes('sms:9822099999'), 'the SOS sheet calls the company rescue number first, then 112, and can SMS the location');
  assert(await ev(`stopIncidents(S.projects["${H}"]).some(i => i.type === "sos")`), 'SOS stops work on that site');
  assert((await tasks('PADMIN')).includes('sos') && (await tasks('PPART1')).includes('sos') && !(await tasks('PPART2')).includes('sos') && !(await tasks('PSENIOR')).includes('sos'), 'the office and the person\'s company get the SOS alarm (not other companies)');
  assert(await page.evaluate(() => { const n = myTasks(S.users.PADMIN).find(x => x.k === 'sos'); return Notify.kind(n) === 'alarm'; }), 'it rings as an alarm');
  assert((await act('SOS_CLOSED', null, { sid: sos.id, note: 'He slipped, not hurt' }, 'PPART1')).ok === false && (await act('SOS_CLOSED', null, { sid: sos.id, note: 'He slipped, not hurt' }, 'PADMIN')).ok, 'the office confirms the person is safe');
  assert(!(await tasks('PADMIN')).includes('sos'), 'the alarm stops');

  /* QC safety-critical items */
  const qc = await page.evaluate(async H => {
    const P = S.projects[H]; P.stage = 'qc_final';
    const base = { checks: Object.fromEntries(QC_FINAL_CHECKS.map(k => [k, 'pass'])), outcome: 'pass', stars: 5, ev: [1, 2].map(() => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'qc', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} })) };
    const crit = v => Object.fromEntries(QC_CRITICAL.map(k => [k, v(k)]));
    const cph = QC_CRITICAL.map(k => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'crit_' + k, t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }));
    const r1 = await perform('QC_FINAL_RESULT', H, base, { as: 'PQC', quiet: true });
    const r2 = await perform('QC_FINAL_RESULT', H, Object.assign({}, base, { crit: crit(() => 'pass') }), { as: 'PQC', quiet: true });
    const r3 = await perform('QC_FINAL_RESULT', H, Object.assign({}, base, { crit: crit(k => k === 'brakes' ? 'fail' : 'pass'), ev: base.ev.concat(cph) }), { as: 'PQC', quiet: true });
    P.stage = 'installing';
    return [r1.err, r2.err, r3.err];
  }, H);
  assert(qc[0] === 'err_crit' && qc[1] === 'err_crit_photos' && qc[2] === 'err_approve_fail', 'final QC needs each safety-critical item with its own photo, and one critical fail cannot pass: ' + qc.join(' '));

  /* incident form through the screen */
  await page.evaluate(H => { closeSheet(); loginAs(S.users.PSENIOR); Notify.hide(); wiz('incidentNew', H, { type: 'injury' }); }, H); await page.waitForTimeout(200);
  assert(/stops all work/.test(await page.innerText('main')), 'choosing "someone was hurt" warns that work stops');
  await page.click('[data-a="wizNext"]'); await page.waitForTimeout(150);
  await page.fill('#f_note', 'Helper cut his hand on a bracket'); await page.fill('#f_action', 'First aid given, glove changed'); await page.fill('#f_witnesses', 'Mahesh');
  await page.click('[data-a="wizNext"]'); await page.waitForTimeout(150); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(500);
  assert(await ev(`S.projects["${H}"].incidents.some(i => i.type === "injury" && i.open && i.action && i.witnesses === "Mahesh")`), 'the injury is saved with action taken and witnesses');

  /* safety log */
  await page.evaluate(H => { loginAs(S.users.PPART1); Notify.hide(); go('safetylog', { pid: H }); }, H); await page.waitForTimeout(250);
  const log = await page.innerText('main');
  assert(/Safety check not accepted/.test(log) && /Hazard on site/.test(log) && /Temporary cable left by builder/.test(log) && await page.$('[data-a="print"]'), 'the safety log shows checks, the rejected one, the hazard with cause and fix, and a print button');
  await page.evaluate(() => { loginAs(S.users.PCUST); go('safetylog', { pid: 'AIEC-P002' }); }); await page.waitForTimeout(200);
  assert(/Safety check done/.test(await page.innerText('main')), 'the customer sees the safety log of their lift');

  /* screens and words in three languages */
  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of [['PPART1', 'safetylog', { pid: H }], ['PSENIOR', 'project', { pid: H }], ['PSENIOR', 'cl', { pid: H, kind: 'sop' }], ['PADMIN', 'home', {}], ['POWNER', 'rules', {}]]) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  await page.evaluate(H => { LANG = 'mr'; loginAs(S.users.PSENIOR); wiz('safety', H); }, H); await page.waitForTimeout(150);
  await page.evaluate(async H => { loginAs(S.users.PQC); S.projects[H].stage = 'qc_final'; await wiz('qcfinal', H); W.step = 2; render(); }, H); await page.waitForTimeout(150);
  await page.evaluate(H => { S.projects[H].stage = 'installing'; loginAs(S.users.PADMIN); const i = S.projects[H].incidents.find(x => x.open); wiz('incident', H, { iid: i.id }); }, H); await page.waitForTimeout(150);
  await page.evaluate(() => { loginAs(S.users.PSENIOR); ACT.permsDone(); }); await page.waitForTimeout(100);
  await page.evaluate(() => sosNow()); await page.waitForTimeout(5500);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('SAFETY PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
