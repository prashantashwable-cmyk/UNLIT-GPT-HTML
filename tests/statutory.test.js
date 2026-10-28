/* Statutory records (permit, Lift Inspector visit, lift licence), on hold with approval, moving a stage back, disputes. */
const path = require('path');
const { launch, miss, OUT } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const SHOTS = process.env.SHOT_DIR || OUT;
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const tasks = (uid, pid) => page.evaluate(([uid, pid]) => myTasks(S.users[uid]).filter(n => !pid || n.pid === pid).map(n => n.k), [uid, pid]);
  const HO = 'AIEC-P002'; /* at handover, customer signature and licence missing */

  assert(await ev('S.rejected.length === 0 && liftLicenceOk(S.projects["AIEC-P001"]) && !!statOf(S.projects["AIEC-P003"]).permit'), 'practice data has permits and a lift licence for the finished lift');

  /* lift licence before handover */
  await act('HANDOVER_SIGNED', HO, { slot: 'customer', consent: true, signer: 'Mrs. Kale', ev: [{ id: 'E' + Date.now(), m: 'x', kind: 'sign', t: new Date().toISOString(), hash: 'h' }] }, 'PCUST');
  assert((await act('HANDOVER_COMPLETED', HO, {}, 'PADMIN')).err === 'err_lift_licence', 'handover is refused without a lift licence');
  assert((await tasks('PADMIN', HO)).includes('record_licence'), 'the office gets "record Lift Inspector visit and licence"');
  assert((await act('STATUTORY_SET', HO, { item: 'licence', no: 'L-1', holder: 'Shree Lift Works', expiry: '2028-01-01' }, 'PADMIN')).err === 'err_inspection_first', 'the licence comes after a passed Lift Inspector visit');
  assert((await act('STATUTORY_SET', HO, { item: 'inspection', date: '2026-10-20', result: 'fail' }, 'PADMIN')).err === 'err_items', 'a failed inspection needs the list of fixes');
  assert((await act('STATUTORY_SET', HO, { item: 'inspection', date: '2026-10-20', result: 'pass' }, 'PSALES')).ok === false, 'only the office records statutory papers');
  assert((await act('STATUTORY_SET', HO, { item: 'inspection', date: '2026-10-20', result: 'pass' }, 'PADMIN')).ok, 'the office records the passed inspection');
  assert((await act('STATUTORY_SET', HO, { item: 'licence', no: 'L-1', holder: 'Shree Lift Works', expiry: '2026-01-01' }, 'PADMIN')).err === 'err_fill', 'an expired licence date is refused');
  assert((await act('STATUTORY_SET', HO, { item: 'licence', no: 'PUNE/LIFT/002/2026', holder: 'Shree Lift Works', expiry: '2027-10-31' }, 'PADMIN')).ok, 'the office records the licence');
  assert((await act('HANDOVER_COMPLETED', HO, {}, 'PADMIN')).ok, 'now the lift can be handed over');
  await page.evaluate(() => { statOf(S.projects['AIEC-P001']).licence.expiry = addDays(20); });
  assert((await tasks('POWNER', 'AIEC-P001')).concat(await tasks('PADMIN', 'AIEC-P001')).includes('lift_licence_due'), 'a licence ending within 60 days asks for renewal');
  await page.evaluate(() => { statOf(S.projects['AIEC-P001']).licence.expiry = addDays(-1); });
  const shot = await ev('[{ id: "E" + rid(10), m: "x", kind: "photo", label: "amc", t: nowISO(), gps: null, hash: "h" + rid(8), dev: "practice", q: {} }]');
  assert((await act('SERVICE_DONE', 'AIEC-P001', { visit: 0, checks: { ride: 'pass', doors: 'pass', alarm: 'pass', brake: 'pass', ropes: 'pass', oil: 'pass', pit: 'pass' }, ev: shot }, 'PTECH')).err === 'err_lift_licence', 'no service visit on a lift whose licence has expired');
  await page.evaluate(() => { statOf(S.projects['AIEC-P001']).licence.expiry = addDays(300); });

  /* on hold */
  const SAR = 'AIEC-P004';
  const hold = await ev(`S.projects["${SAR}"].holds[0]`);
  assert(hold && hold.status === 'pending' && (await tasks('PADMIN', SAR)).includes('hold_request'), 'the technician\'s hold request waits for the office');
  assert((await act('HOLD_REQUESTED', SAR, { reason: 'weather', note: 'Rain' }, 'PTECH')).err === 'err_hold_open', 'only one hold at a time');
  assert((await act('HOLD_DECIDED', SAR, { hid: hold.id, ok: true }, 'PTECH')).ok === false, 'only the office decides');
  assert((await act('HOLD_DECIDED', SAR, { hid: hold.id, ok: true }, 'PADMIN')).ok && await ev(`onHold(S.projects["${SAR}"])`), 'the office approves: the job is on hold');
  await page.evaluate(SAR => { const P = S.projects[SAR]; P.since = new Date(Date.now() - 10 * 864e5).toISOString(); }, SAR);
  assert(!(await page.evaluate(SAR => needs(S.projects[SAR]).some(n => n.k === 'escalated'), SAR)), 'no escalation while on hold');
  const H = 'AIEC-P003';
  await act('HOLD_REQUESTED', H, { reason: 'supplier', note: 'Waiting for the governor part' }, 'POWNER');
  const before = await page.evaluate(H => { const P = S.projects[H], h = P.holds[0]; h.from = new Date(Date.now() - 5 * 864e5).toISOString(); return installUsed(P); }, H);
  await act('HOLD_ENDED', H, { hid: await ev(`S.projects["${H}"].holds[0].id`) }, 'PADMIN');
  const used = await page.evaluate(H => { const P = S.projects[H]; return [installUsed(P), Math.floor((Date.now() - Date.parse(P.mhand.t)) / 864e5)]; }, H);
  assert(used[0] === before && used[1] - used[0] >= 4, 'held days are not counted in the installation target: ' + used.join(' of '));

  /* stage back and dispute */
  assert((await act('STAGE_BACK', 'AIEC-P005', { to: 'site_ok' }, 'PADMIN')).err === 'err_reason', 'moving back needs a reason');
  assert((await act('STAGE_BACK', 'AIEC-P005', { to: 'signed', reason: 'x' }, 'PADMIN')).ok === false, 'only one step back to the allowed stage');
  assert((await act('STAGE_BACK', 'AIEC-P005', { to: 'site_ok', reason: 'Drawings were wrong; release again' }, 'PADMIN')).ok && await ev('S.projects["AIEC-P005"].stage') === 'site_ok', 'the office moves the order back to "site approved" to release again');
  assert((await act('DISPUTE_SET', 'AIEC-P001', { note: 'Customer says door noise not fixed' }, 'PSALES')).ok && (await tasks('POWNER', 'AIEC-P001')).concat(await tasks('PADMIN', 'AIEC-P001')).includes('dispute_open'), 'a dispute is marked and the office sees it');
  assert((await act('DISPUTE_CLEARED', 'AIEC-P001', { note: 'Door roller changed' }, 'PSALES')).ok === false && (await act('DISPUTE_CLEARED', 'AIEC-P001', { note: 'Door roller changed' }, 'PADMIN')).ok, 'the office settles it');
  assert(await page.evaluate(() => { const a = JSON.stringify(['AIEC-P001', 'AIEC-P002', 'AIEC-P003', 'AIEC-P004', 'AIEC-P005'].map(id => [S.projects[id].stage, S.projects[id].statutory, S.projects[id].holds, S.projects[id].dispute])); S = rebuild(EVENTS.slice()); return !S.rejected.length; }), 'everything rebuilds from records with nothing refused');

  /* screens */
  await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('project', { pid: 'AIEC-P003', tab: 'info' }); }); await page.waitForTimeout(250);
  assert(/Permit, inspection and licence/.test(await page.innerText('main')), 'the job shows its permit, inspection and licence');
  await page.screenshot({ path: path.join(SHOTS, 'statutory_project.png') });
  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of [['PADMIN', 'project', { pid: 'AIEC-P004', tab: 'info' }], ['PADMIN', 'project', { pid: 'AIEC-P001', tab: 'info' }], ['PTECH', 'project', { pid: 'AIEC-P004', tab: 'info' }], ['PADMIN', 'home', {}]]) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  for (const [w, pid, o] of [['statutory', 'AIEC-P003', {}], ['hold', 'AIEC-P003', {}], ['stageBack', 'AIEC-P005', {}], ['dispute', 'AIEC-P003', {}]]) { await page.evaluate(async ([w, pid, o]) => { LANG = 'mr'; loginAs(S.users.PADMIN); await wiz(w, pid, o); }, [w, pid, o]); await page.waitForTimeout(100); }
  await page.evaluate(async () => { await wiz('statutory', 'AIEC-P003', { item: 'licence' }); }); await page.waitForTimeout(100);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('STATUTORY PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
