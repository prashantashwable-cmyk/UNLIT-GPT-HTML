/* Site quality: the 42-point inspector checklist inside the installation steps ("No" needs a note and becomes a problem to
   fix before inspection), serial numbers read on site against what the supplier sent, and legal papers (BOCW, ESIC,
   safety training) that stop new installation work when they end. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const photos = (n, label) => ev(`Array.from({ length: ${n} }, () => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: '${label || 'work'}', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`);
  const tasks = (uid, pid) => page.evaluate(([uid, pid]) => myTasks(S.users[uid]).filter(n => !pid || n.pid === pid).map(n => n.k), [uid, pid]);
  const sgn = () => ev(`[{ id: 'E' + rid(10), m: 'x', kind: 'sign', t: nowISO(), hash: 'h' + rid(8) }]`);

  assert(await ev('S.rejected.length === 0'), 'practice data loads with nothing refused');
  assert(await ev('ISC.length === 42 && new Set(ISC.map(x => x[0])).size === 42 && ISC.every(([n, s]) => s === -1 || (s >= 0 && s < SOP.length))'), 'all 42 inspector points are placed on an installation step');
  assert(await ev('ISC.filter(x => x[2]).map(x => x[0]).join() === "13,14,17,21,22,27,32,35,37"'), 'governor, buffers, interlocks, ARD, UCMP, earthing, load and safety-chain tests must pass');

  /* the checklist inside a step */
  const H = 'AIEC-P003', T = 'PSENIOR';
  await act('SITE_CHECKED_IN', H, { day: await ev('safeDay()'), gps: await ev(`S.projects["${H}"].site.gps`) }, T);
  await act('SAFETY_CHECKED', H, { ev: await ev(`SAFETY_ITEMS.map(([k]) => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'safe_' + k, t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`) }, T);
  const nx = () => ev(`sopNext(S.projects["${H}"])`);
  assert(await nx() === 5, 'the job is at the cabin step');
  const s5 = async extra => act('SOP_STEP_DONE', H, Object.assign({ step: 5, ev: await photos(1) }, extra), T);
  assert((await s5({})).err === 'err_isc_all', 'a step with inspector points cannot be saved without answering them');
  assert((await s5({ isc: { 26: 'no' } })).err === 'err_isc_note', '"No" needs a note');
  assert((await s5({ isc: { 26: 'no' }, iscNote: { 26: 'Capacity plate not fixed yet' } })).ok, 'with the note the step is saved');
  assert(await ev(`(P => P.isc[26].a === "no" && openCorr(P, "install").some(c => c.isc === 26 && /Capacity plate/.test(c.text)))(S.projects["${H}"])`), 'the "No" became a problem to fix, linked to point 26');
  assert((await tasks(T, H)).includes('fix_install'), 'the technician gets "fix installation problems" while work goes on');
  /* steps 6 to 9 */
  while (await nx() < 10) {
    const st = await nx(); const r = await act('SOP_STEP_DONE', H, { step: st, isc: await ev(`iscYes(${st})`), read: await ev(`readYes(${st}, S.projects["${H}"]) || null`), ev: await photos(1) }, T);
    if (r.err === 'err_peer_check') { assert((await act('PEER_CHECKED', H, { step: await ev(`peerWaiting(S.projects["${H}"])[0]`), ok: true }, 'PTECH')).ok, 'co-worker check'); continue; }
    assert(r.ok, 'step ' + st + ' done with its inspector points: ' + r.err);
  }
  if (await ev(`peerWaiting(S.projects["${H}"]).length`)) await act('PEER_CHECKED', H, { step: await ev(`peerWaiting(S.projects["${H}"])[0]`), ok: true }, 'PTECH');
  const bad = await ev('Object.fromEntries(iscFor(10).map(x => [x[0], "yes"]))');
  bad[21] = 'na';
  assert((await act('SOP_STEP_DONE', H, { step: 10, isc: bad, ev: await photos(1) }, T)).err === 'err_isc_must', 'the ARD test (must pass) cannot be "Not here"');
  bad[21] = 'yes';
  assert((await act('SOP_STEP_DONE', H, { step: 10, isc: bad, ev: await photos(1) }, T)).ok, 'safety devices step saved');
  if (await ev(`peerWaiting(S.projects["${H}"]).length`)) await act('PEER_CHECKED', H, { step: await ev(`peerWaiting(S.projects["${H}"])[0]`), ok: true }, 'PTECH');
  const last = await ev('Object.fromEntries(iscFor(11).map(x => [x[0], "yes"]))'); last[34] = 'na';
  assert((await act('SOP_STEP_DONE', H, { step: 11, isc: last, read: await ev(`readYes(11, S.projects["${H}"]) || null`), ev: await photos(1) }, T)).ok, 'last step saved ("remote monitoring" not fitted = Not here)');
  assert((await act('INSPECTION_REQUESTED', H, {}, T)).err === 'err_snags_open', 'the inspection cannot be asked while a checklist problem is open');
  { const tk = await tasks(T, H); assert(tk.includes('fix_install') && !tk.includes('request_inspection'), 'the task is to fix the open problem: ' + JSON.stringify(tk)); }
  const cid = await ev(`openCorr(S.projects["${H}"], "install")[0].id`);
  assert((await act('CORRECTION_DONE', H, { cid, ev: await photos(1), note: 'Plate fixed' }, T)).ok, 'the technician fixes it with a photo');
  assert((await tasks(T, H)).includes('request_inspection') && (await act('INSPECTION_REQUESTED', H, {}, T)).ok, 'then the inspection can be asked');

  /* the wizard asks the points of that step */
  await page.evaluate(async () => { const P = Object.values(S.projects).find(x => x.stage === 'installing') || S.projects['AIEC-P003']; loginAs(S.users.PSENIOR); ACT.permsDone(); Notify.hide(); await wiz('sopstep', P.id, { step: 9 }); W.ctx.ph = [{ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'work', t: nowISO(), gps: null, hash: 'h1', dev: 'practice', q: {} }]; render(); }); await page.waitForTimeout(200);
  await page.click('[data-a="wizNext"]'); await page.waitForTimeout(250);
  const wz = await page.innerText('#app');
  assert(/Inspector checklist/.test(wz) && /Door interlock|Emergency alarm|3-phase supply/.test(wz) && /must pass/.test(wz) && /Not here/.test(wz), 'the step wizard shows its inspector points with Yes / No / Not here');
  await page.click('[data-a="pick"][data-k="isc.23"][data-v="no"]'); await page.waitForTimeout(150);
  assert(/What is wrong at this point/.test(await page.innerText('#app')), 'choosing "No" asks what is wrong');

  /* weak points for the office */
  await page.evaluate(() => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('waits'); }); await page.waitForTimeout(250);
  const wt = await page.innerText('main');
  assert(/Checklist points that fail most/.test(wt) && /26\. Capacity plate/.test(wt) && /By lead technician/.test(wt), 'the office sees which points fail most, and by whom');

  /* serial numbers at the material handover */
  const A = 'AIEC-P004', tech = await ev(`S.projects["${A}"].tech`), sent = await ev(`S.projects["${A}"].dispatch.serialMap`);
  const amt = await ev(`S.projects["${A}"].schedule.arrival`);
  await act('PAYMENT_RECORDED', A, { payId: 'PAY-SQ1', purpose: 'arrival', amount: amt, method: 'upi', ref: 'UPI99887766' }, 'PSALES');
  await act('PAYMENT_STATUS', A, { payId: 'PAY-SQ1', status: 'confirmed', ref: 'BANK' }, 'PFIN');
  const items = await ev(`S.projects["${A}"].materials.map(m => ({ k: m.k, q: m.q, status: 'ok' }))`);
  const hand = async seen => act('MATERIAL_HANDED', A, { items, custName: 'Mr. Joshi', signer: 'contact', custody: true, serialSeen: seen, ev: (await sgn()).concat(await sgn(), await photos(1, 'storage')) }, tech);
  const k0 = Object.keys(sent)[0];
  assert((await hand(Object.assign({}, sent, { [k0]: '' }))).err === 'err_serial', 'every serial the supplier sent must be read on site');
  const swapped = Object.assign({}, sent, { [k0]: 'XYZ-999' }), lower = Object.fromEntries(Object.entries(sent).map(([k, v]) => [k, ' ' + v.toLowerCase() + ' ']));
  assert(await ev(`normSerial(${JSON.stringify(lower[k0])}) === normSerial(${JSON.stringify(sent[k0])})`), 'small/capital letters and spaces do not count as a difference');
  assert((await hand(swapped)).ok, 'the handover is saved with a swapped part');
  assert(await ev(`(P => P.serialHold && P.serialHold.bad.join() === "${k0}" && !P.serialHold.ok)(S.projects["${A}"])`), 'the swapped part is caught');
  if (await ev(`S.projects["${A}"].stage !== "installing"`)) await page.evaluate(A => { const P = S.projects[A]; P.stage = 'installing'; }, A);
  assert(await page.evaluate(([tech, A]) => myWaits(S.users[tech]).some(n => n.k === 'wait_serial' && n.pid === A), [tech, A]) && (await tasks('PADMIN', A)).includes('serial_mismatch'), 'installation waits; the office is asked to check the parts');
  assert((await act('SOP_STEP_DONE', A, { step: 0, isc: await ev('iscYes(0)'), ev: await photos(1) }, tech)).err === 'err_serial_mismatch', 'the first installation step is held');
  await page.evaluate(A => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); wiz('serialFix', A); }, A); await page.waitForTimeout(250);
  const sf = await page.innerText('#app');
  assert(sf.includes(sent[k0]) && sf.includes('XYZ-999'), 'the office sees what was sent and what was found');
  assert((await act('SERIAL_RESOLVED', A, {}, 'PADMIN')).err === 'err_reason' && (await act('SERIAL_RESOLVED', A, { note: 'Supplier sent the right machine; label misprinted, confirmed by call' }, 'PADMIN')).ok, 'the office settles it with a reason');
  assert(!(await page.evaluate(([tech, A]) => myWaits(S.users[tech]).some(n => n.k === 'wait_serial' && n.pid === A), [tech, A])), 'then installation can start');

  /* legal papers */
  const past = await ev('addDays(-2)'), soon = await ev('addDays(10)'), far = await ev('addDays(300)');
  assert((await act('LEGAL_SET', null, { uid: 'PTECH', k: 'bocw', no: '', expiry: far }, 'PADMIN')).err === 'err_fill', 'a paper needs its number');
  assert((await act('LEGAL_SET', null, { uid: 'PTECH', k: 'esic', no: 'ESIC-1234', expiry: soon }, 'PADMIN')).ok, 'ESIC recorded, ending in 10 days');
  assert((await tasks('PTECH')).includes('legal_renew') && (await tasks('PADMIN')).includes('legal_renew'), 'the person and the office are reminded to renew it');
  assert(await ev('techWhyNot("PTECH") === null'), 'still valid: work goes on');
  assert((await act('LEGAL_SET', null, { uid: 'PTECH', k: 'bocw', no: 'BOCW/MH/55', expiry: past }, 'PADMIN')).ok, 'an ended BOCW registration is recorded');
  assert(await ev('techWhyNot("PTECH") === "err_wallet_expired"'), 'an ended paper stops new installation work');
  assert((await act('ASSIGNED', 'AIEC-P005', { role: 'tech', uid: 'PTECH' }, 'PADMIN')).err === 'err_wallet_expired', 'the office cannot give a new job to that person');
  await page.evaluate(() => { loginAs(S.users.PADMIN); go('worker', { uid: 'PTECH' }); }); await page.waitForTimeout(250);
  const wk = await page.innerText('main');
  assert(/Legal papers for site work/.test(wk) && /BOCW registration/.test(wk) && /ended/.test(wk) && /valid till/.test(wk) && /Safety training certificate[\s\S]*not recorded/.test(wk), 'the person\'s page shows each paper with its date');
  assert((await act('LEGAL_SET', null, { uid: 'PTECH', k: 'bocw', no: 'BOCW/MH/55', expiry: far }, 'PADMIN')).ok && await ev('techWhyNot("PTECH") === null'), 'once renewed, work can be given again');

  for (const lang of ['hi', 'mr']) { await page.evaluate(l => { LANG = l; App.set.lang = l; go('worker', { uid: 'PTECH' }); }, lang); await page.waitForTimeout(150); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('SITE QUALITY PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
