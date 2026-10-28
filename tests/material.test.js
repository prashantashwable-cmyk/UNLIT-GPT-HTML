/* Material: purchase order the supplier accepts or declines, serial numbers and challan at dispatch, the customer's representative,
   safe keeping of the material at delivery, part claims (damaged, missing, extra) decided by the office and sent by the supplier. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const photos = (n, label) => ev(`Array.from({ length: ${n} }, () => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: '${label || 'work'}', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`);
  const signs = () => ev(`[1, 2].map(() => ({ id: 'E' + rid(10), m: 'x', kind: 'sign', t: nowISO(), hash: 'h' + rid(8) }))`);
  const tasks = (uid, pid) => page.evaluate(([uid, pid]) => myTasks(S.users[uid]).filter(n => !pid || n.pid === pid).map(n => n.k), [uid, pid]);
  assert(await ev('S.rejected.length === 0'), 'practice data loads with nothing refused');
  assert(await ev('(P => P.po.accepted && P.dispatch.challan && P.dispatch.serialMap.m_machine && P.mhand.custody && P.mhand.storage.length === 1)(S.projects["AIEC-P001"])'), 'practice data: an accepted order, challan and serial numbers, material kept safe with a storage photo');

  /* purchase order */
  const O = 'AIEC-P005';
  assert(await ev(`/^PO-P005-1$/.test(S.projects["${O}"].po.no)`) && (await tasks('PSUP', O)).includes('accept_po'), 'releasing the material makes a purchase order; the supplier is asked to accept it');
  await page.evaluate(O => { loginAs(S.users.PSUP); ACT.permsDone(); Notify.hide(); go('doc', { pid: O, kind: 'po' }); }, O); await page.waitForTimeout(200);
  const po = await page.innerText('main');
  assert(/Purchase order/.test(po) && /PO-P005-1/.test(po) && /Machine/.test(po) && !/9822000004/.test(po), 'the supplier sees the order with parts and quantities, without the customer\'s phone');
  await page.evaluate(O => { loginAs(S.users.PTECH); go('doc', { pid: O, kind: 'po' }); }, O); await page.waitForTimeout(150);
  assert(!/PO-P005-1/.test(await page.innerText('main')), 'a technician cannot open the purchase order');
  assert((await act('PO_ACCEPTED', O, { date: '2020-01-01' }, 'PSUP')).err === 'err_date', 'a dispatch date in the past is refused');
  assert((await act('PO_DECLINED', O, {}, 'PSUP')).err === 'err_reason', 'declining needs a reason');
  assert((await act('PO_DECLINED', O, { reason: 'Machine out of stock for 6 weeks' }, 'PSUP')).ok && (await tasks('PADMIN', O)).includes('po_declined'), 'the supplier declines; the office is asked to choose another supplier');
  assert((await act('DISPATCHED', O, { packed: [], seal: 'S', ev: [] }, 'PSUP')).err === 'err_po_declined', 'nothing can be dispatched on a declined order');
  assert((await act('ASSIGNED', O, { role: 'supplier', uid: 'PSUP' }, 'PADMIN')).ok && await ev(`S.projects["${O}"].po.no`) === 'PO-P005-2' && !(await ev(`S.projects["${O}"].po.declined`)), 'choosing a supplier again makes a new order number');
  const d2 = await ev('addDays(2)');
  assert((await act('PO_ACCEPTED', O, { date: d2 }, 'PSUP')).ok && (await tasks('PSUP', O)).includes('dispatch'), 'the supplier accepts with a dispatch date, then is asked to dispatch');
  await page.evaluate(O => { S.projects[O].po.accepted.date = addDays(-1); }, O);
  assert((await tasks('PADMIN', O)).includes('po_late') && await page.evaluate(O => myTasks(S.users.PSUP).find(n => n.k === 'dispatch' && n.pid === O).urgent, O), 'after the promised date the office sees "supplier is late" and the dispatch task turns urgent');
  const mats = await ev(`S.projects["${O}"].materials.map(m => m.k)`);
  const base = { packed: mats, seal: 'SEAL-505', vehicle: 'MH12 X 1', ev: await photos(2) };
  assert((await act('DISPATCHED', O, base, 'PSUP')).err === 'err_challan', 'dispatch needs the delivery challan number');
  assert((await act('DISPATCHED', O, Object.assign({ challan: 'DC/505' }, base), 'PSUP')).err === 'err_serial', 'dispatch needs the serial numbers of the machine, controller and governor');
  assert((await act('DISPATCHED', O, Object.assign({ challan: 'DC/505', serialMap: { m_machine: 'MC-1', m_controller: 'CT-1', m_governor: 'GV-1' } }, base), 'PSUP')).ok && await ev(`S.projects["${O}"].dispatch.serialMap.m_governor`) === 'GV-1', 'with challan and serials the material is dispatched');

  /* representative and safe keeping */
  const A = 'AIEC-P004', tech = await ev('S.projects["AIEC-P004"].tech');
  const sch = await ev(`S.projects["${A}"].schedule.arrival`);
  await act('PAYMENT_RECORDED', A, { payId: 'PAY-ARR4', purpose: 'arrival', amount: sch, method: 'bank', ref: 'NEFT-4' }, 'PSALES');
  assert((await act('PAYMENT_STATUS', A, { payId: 'PAY-ARR4', status: 'confirmed', ref: 'BANK-4' }, 'PFIN')).ok, 'the arrival payment is confirmed');
  const rep = { name: 'Mr. Sathe', phone: '9822077777', relation: 'secretary' };
  assert((await act('REP_SET', A, rep, 'PSALES')).err === 'err_rep_proof', 'a representative needs a photo of the letter or ID');
  assert((await act('REP_SET', A, Object.assign({}, rep, { phone: '123', ev: await photos(1, 'rep') }), 'PSALES')).err === 'err_phone', '…and a valid phone number');
  assert((await act('REP_SET', A, Object.assign({}, rep, { ev: await photos(1, 'rep') }), 'PTECH')).ok === false, 'a technician cannot name a representative');
  assert((await act('REP_SET', A, Object.assign({}, rep, { ev: await photos(1, 'rep') }), 'PSALES')).ok && await ev(`S.projects["${A}"].rep.relation`) === 'secretary', 'Sales names the society secretary as representative');
  const items = await ev(`S.projects["${A}"].materials.map(m => ({ k: m.k, q: m.q, status: m.k === 'm_cabin' ? 'damaged' : 'ok' }))`);
  const hand = async extra => act('MATERIAL_HANDED', A, Object.assign({ items, custName: 'Mr. Sathe', signer: 'rep', ev: await signs() }, extra), tech);
  assert((await hand({})).err === 'err_custody', 'the representative must accept to keep the material safe');
  assert((await hand({ custody: true })).err === 'err_storage_photo', 'a photo of the storage place is needed');
  assert((await act('CLAIM_RAISED', A, { cid: 'C-H1', line: 'm_cabin', kind: 'damaged', qty: 1, note: 'Damaged at handover', src: 'handover' }, tech)).ok, 'a damaged line at the handover becomes a part claim');
  assert((await hand({ custody: true, ev: (await signs()).concat(await photos(1, 'storage')) })).ok && await ev(`S.projects["${A}"].stage`) === 'installing' && await ev(`S.projects["${A}"].mhand.signer`) === 'rep', 'the representative signs; installation can start while the claim goes on');
  assert(!(await ev(`openIncidents(S.projects["${A}"]).length`)), 'a part claim does not stop the work');

  /* part claims */
  assert((await act('CLAIM_RAISED', A, { cid: 'C-2', line: 'm_cabin', kind: 'damaged', qty: 1, note: 'x', src: 'handover' }, tech)).err === 'err_photos', 'after the handover a damaged part needs a photo');
  assert((await act('CLAIM_RAISED', A, { cid: 'C-3', line: 'm_escalator', kind: 'extra', qty: 1, note: 'x', ev: await photos(1) }, tech)).err === 'err_not_in_list', 'parts not on the job\'s list cannot be claimed');
  assert((await act('CLAIM_RAISED', A, { cid: 'C-4', line: 'm_governor', kind: 'damaged', qty: 1, note: 'Governor seal cracked', serial: 'GV-404', emergency: true, ev: await photos(1, 'claim') }, tech)).ok, 'the technician reports a cracked governor as a safety emergency');
  assert(await page.evaluate(A => { const n = myTasks(S.users.PADMIN).find(n => n.k === 'decide_claim' && n.cid === 'C-4'); return n && n.urgent && Notify.kind(n) === 'alarm'; }, A), 'the office gets an urgent alarm to decide');
  assert((await act('CLAIM_DECIDED', A, { cid: 'C-4', ok: true }, 'PSALES')).ok === false && (await act('CLAIM_DECIDED', A, { cid: 'C-4', ok: false }, 'PADMIN')).err === 'err_reason', 'only the office decides, and "no" needs a reason');
  assert((await act('CLAIM_DECIDED', A, { cid: 'C-4', ok: true }, 'PADMIN')).ok && (await tasks('PSUP', A)).includes('send_claim'), 'the office approves; the supplier is asked to send the part');
  assert((await act('CLAIM_SENT', A, { cid: 'C-4', challan: '' }, 'PSUP')).err === 'err_challan' && (await act('CLAIM_SENT', A, { cid: 'C-4', challan: 'DC/R-9' }, 'PSUP')).ok, 'the supplier sends it with a challan number');
  assert((await tasks(tech, A)).includes('receive_claim'), 'the technician is asked to receive it');
  assert((await act('CLAIM_RECEIVED', A, { cid: 'C-4' }, tech)).err === 'err_photos' && (await act('CLAIM_RECEIVED', A, { cid: 'C-4', ev: await photos(1) }, tech)).ok && await ev(`S.projects["${A}"].claims.find(c => c.id === "C-4").status`) === 'received', 'with a photo of the new part the claim is closed');

  /* privacy and rebuild */
  for (const uid of ['PTECH', 'PSUP', 'PPART1']) {
    const f = await page.evaluate(uid => { App.me = S.users.PADMIN; return JSON.stringify(exportPack('person', uid).events.filter(e => e.type === 'REP_SET')); }, uid);
    assert(!/Sathe|9822077777/.test(f), `the representative's name and phone are not in the file for ${uid}`);
  }
  assert(await page.evaluate(() => { S = rebuild(EVENTS.slice()); return !S.rejected.length; }), 'everything rebuilds with nothing refused');
  await page.evaluate(A => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('project', { pid: A, tab: 'info' }); }, A); await page.waitForTimeout(200);
  const info = await page.innerText('main');
  assert(/Material, order and claims/.test(info) && /Mr\. Sathe/.test(info) && /On the way|Received/.test(info) && /Waiting for the office/.test(info), 'the job shows the order, representative, safe keeping and claims');

  /* screens in three languages */
  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of [['PADMIN', 'project', { pid: A, tab: 'info' }], ['PSUP', 'project', { pid: O, tab: 'info' }], ['PSUP', 'doc', { pid: O, kind: 'po' }], [tech, 'project', { pid: A, tab: 'info' }], ['PSUP', 'home', {}]]) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  const steps = async (as, w, pid, o, n) => { for (let i = 0; i < n; i++) { await page.evaluate(async ([as, w, pid, o, i]) => { LANG = 'mr'; if (!W || W.id !== w) { loginAs(S.users[as]); await wiz(w, pid, o); } W.step = i; render(); }, [as, w, pid, o, i]); await page.waitForTimeout(60); } await page.evaluate(() => { W = null; }); };
  await page.evaluate(() => { const P = S.projects['AIEC-P008']; Object.assign(P, { stage: 'material_order', supplier: 'PSUP', materials: materialList({ stops: 4, type: 'auto', capacity: '6', finish: 'ss' }), po: { no: 'PO-P008-1', t: nowISO(), supplier: 'PSUP', needBy: addDays(7) }, poN: 1, drawings: { ref: 'D' } }); });
  await steps('PSUP', 'poAccept', 'AIEC-P008', {}, 1);
  await page.evaluate(() => { W = null; }); await page.evaluate(async () => { loginAs(S.users.PSUP); await wiz('poAccept', 'AIEC-P008'); W.ctx.ok = 'yes'; W.step = 1; render(); }); await page.waitForTimeout(60);
  await page.evaluate(async () => { W.ctx.ok = 'no'; W.step = 2; render(); }); await page.waitForTimeout(60);
  await steps('PSUP', 'dispatch', 'AIEC-P008', {}, 5);
  await steps('PSALES', 'rep', 'AIEC-P008', {}, 2);
  await steps(tech, 'claim', A, {}, 3);
  await page.evaluate(() => { const P = S.projects['AIEC-P008']; Object.assign(P, { stage: 'arrived', tech: S.projects['AIEC-P004'].tech, rep: { name: 'R', relation: 'family', phone: '9822000000' } }); });
  await steps(tech, 'mhand', 'AIEC-P008', {}, 4);
  await page.evaluate(() => { S.projects['AIEC-P004'].claims.push({ id: 'C-9', line: 'm_cabin', kind: 'missing', qty: 1, note: 'x', status: 'raised', t: nowISO(), by: 'PTECH', ev: [], hist: [] }); });
  await steps('PADMIN', 'claimDecide', A, { cid: 'C-9' }, 1);
  await steps('PSUP', 'claimSend', A, { cid: 'C-4' }, 1);
  await steps(tech, 'claimReceive', A, { cid: 'C-4' }, 1);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('MATERIAL PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
