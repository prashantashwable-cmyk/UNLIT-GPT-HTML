/* A small company: Owner, field worker, a partner company with its technicians, a supplier and the customer — no Sales, Finance, QC or Admin.
   One new job goes from lead to handover. At every step the person who acts must have the task for it (no dead ends),
   and after signing the agreement the customer sees how to pay, reports the payment, and the Owner checks it. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const pid = 'AIEC-S001';
  const ph = (n, label) => ev(`Array.from({ length: ${n} }, (_, i) => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: ${JSON.stringify(label || 'work')}, t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`);
  const sign = () => ev(`[{ id: 'E' + rid(10), m: 'x', kind: 'sign', t: nowISO(), hash: 'h' + rid(8) }]`);
  /* the step must be in the actor's own task list, and must then succeed */
  const step = async (task, as, type, data, p = pid) => {
    const has = await page.evaluate(([as, task, p]) => myTasks(S.users[as]).some(n => n.k === task && (!p || n.pid === p)), [as, task, p]);
    if (!has) { const who = await page.evaluate(p => JSON.stringify(needs(S.projects[p]).map(n => n.k + ':' + n.roles.join('/'))), p); throw new Error(`ASSERT: ${as} has no "${task}" task at stage ${await ev(`S.projects["${p}"].stage`)}; open: ${who}`); }
    const r = await page.evaluate(([type, p, data, as]) => perform(type, p, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && JSON.stringify(r.err) })), [type, p, data, as]);
    if (!r.ok) throw new Error(`ASSERT: ${as} could not do ${type} (${task}): ${r.err}`);
    console.log('ok -', task, '→', as);
  };
  const stage = () => ev(`S.projects["${pid}"].stage`);

  /* only the Owner in the office */
  await page.evaluate(async () => { for (const u of ['PSALES', 'PFIN', 'PQC', 'PADMIN']) await perform('USER_UPDATED', null, { uid: u, active: false }, { as: 'POWNER', quiet: true }); });
  assert(await ev('!["PSALES", "PFIN", "PQC", "PADMIN"].some(isActive)'), 'Sales, Finance, QC and Admin have left; the Owner runs the office');

  /* lead and sale */
  const r0 = await page.evaluate(async ([pid, ev2]) => (await perform('LEAD_CREATED', pid, { safe: true, ev: ev2, gps: null, address: 'Sai Park, Baner, Pune', name: 'Mr. Joshi', phone: '9822055501', shaft: 'yes', floors: 5, dupOf: [], consent: { call: 'yes', whatsapp: 'yes' } }, { as: 'PFIELD', quiet: true })).ok, [pid, await ph(2, 'b')]);
  assert(r0, 'the field worker adds the site');
  await step('review_lead', 'POWNER', 'LEAD_ACCEPTED', {});
  await step('call_customer', 'POWNER', 'CONTACT_LOGGED', { channel: 'call', outcome: 'interested', note: '' });
  await step('write_needs', 'POWNER', 'REQ_SAVED', { req: { use: 'apartment', stops: 5, capacity: '6', type: 'auto', finish: 'ss', shaft: 'yes', power: 'yes', timeline: '3m' } });
  await step('make_quote', 'POWNER', 'QUOTE_CREATED', { discountPct: 0 });
  await step('send_quote', 'POWNER', 'QUOTE_SENT', { channel: 'visit' });
  await step('get_decision', 'POWNER', 'DEAL_WON', {});
  await step('prepare_agreement', 'POWNER', 'AGREEMENT_PREPARED', {});
  await page.evaluate(async pid => { const salt = 'c'; await perform('USER_ADDED', null, { uid: 'SCUST', name: 'Mr. Joshi', role: 'customer', projectId: pid, salt, pin: await pinHash('1234', salt) }, { as: 'POWNER', quiet: true }); }, pid);
  await step('sign_agreement', 'SCUST', 'AGREEMENT_SIGNED', { consent: true, signer: 'Mr. Joshi', ev: await sign() });
  assert(await stage() === 'signed', 'the customer signed the agreement on their own phone');

  /* how the customer pays (the reported bug) */
  await page.evaluate(() => { loginAs(S.users.SCUST); ACT.permsDone(); Notify.hide(); go('home'); }); await page.waitForTimeout(250);
  let txt = await page.innerText('main');
  assert(/How to pay/.test(txt) && /Pay the next amount/.test(txt) && /Token/i.test(txt), 'the customer\'s home shows the amount due and a "pay the next amount" task');
  await page.click('[data-a="payInfo"]'); await page.waitForTimeout(250);
  txt = await page.innerText('main');
  const upi = await page.getAttribute('a[href^="upi://pay"]', 'href');
  assert(/aiec\.practice@okhdfc/.test(txt) && /HDFC0000001/.test(txt) && /000111222333/.test(txt) && /AIEC-S001/.test(txt) && await page.$('main svg path'), 'the pay screen shows UPI (app button and QR), the bank account, IFSC and what to write in remarks');
  assert(upi.includes('pa=aiec.practice%40okhdfc') && upi.includes('am=10000') && upi.includes('cu=INR'), 'the UPI button opens the UPI app with the company ID and the exact amount: ' + upi);
  assert(/personal account/.test(txt), 'it warns to pay only into the company account');
  await page.click('[data-a="wizOpen"][data-v^="custPaid|"]'); await page.waitForTimeout(200);
  await page.click('[data-a="pick"][data-k="method"][data-v="upi"]'); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(150);
  await page.fill('#f_ref', 'UTR998877665'); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(400);
  assert(await ev(`S.projects["${pid}"].payments.some(p => p.recordedBy === "SCUST" && p.status === "pending" && p.ref === "UTR998877665")`), 'the customer reports "I have paid" with the UPI reference');
  const pay1 = await ev(`S.projects["${pid}"].payments[0].id`);
  await step('verify_payment', 'POWNER', 'PAYMENT_STATUS', { payId: pay1, status: 'confirmed', ref: 'BANK-STMT-1' });
  assert(await stage() === 'site_prep', 'with no Finance person, the Owner finds it in the bank and confirms; the job moves on');

  /* site preparation and site QC */
  for (const k of await ev('PREP_ITEMS.map(x => x[0])')) await step('prepare_site', 'SCUST', 'PREP_ITEM_DONE', { item: k, ev: await ph(1, 'site') });
  await step('request_qc', 'SCUST', 'QC_REQUESTED', {});
  await step('inspect_site', 'POWNER', 'QC_SITE_RESULT', { meas: { width: 1800, depth: 1900, pit: 1500, head: 4200 }, checks: { plumb: 'yes', pit_dry: 'yes', power3: 'yes', barricade: 'yes', access: 'yes' }, outcome: 'approved', ev: await ph(2, 'site') });

  /* material */
  const tech = 'PTECH';
  await step('release', 'POWNER', 'RELEASED', { supplier: 'PSUP', tech, drawings: 'DWG-S001', materials: await ev('materialList({ stops: 5, type: "auto", capacity: "6", finish: "ss" })') });
  const open = async p => page.evaluate(p => needs(S.projects[p]).map(n => n.k), pid);
  if ((await open()).includes('record_permit')) await step('record_permit', 'POWNER', 'STATUTORY_SET', { item: 'permit', no: 'EP/S001/2026', date: await ev('todayStr()') });
  await step('accept_po', 'PSUP', 'PO_ACCEPTED', { date: await ev('addDays(2)') });
  const mats = await ev(`S.projects["${pid}"].materials.map(m => m.k)`);
  await step('dispatch', 'PSUP', 'DISPATCHED', { packed: mats, seal: 'SEAL-S1', vehicle: 'MH12 1', challan: 'DC/S1', serialMap: { m_machine: 'MC-S1', m_controller: 'CT-S1', m_governor: 'GV-S1' }, ev: await ph(2) });
  await step('arrival', tech, 'ARRIVED', { gps: null, sealSeen: 'SEAL-S1', sealIntact: 'yes', condition: 'good', ev: await ph(2) });
  const due2 = await ev(`payDue(S.projects["${pid}"])`);
  assert(due2 && due2.purpose === 'arrival', 'the arrival payment is now due');
  await step('pay_now', 'SCUST', 'PAYMENT_RECORDED', { payId: 'PAY-S2', purpose: 'arrival', amount: due2.amount, method: 'bank', ref: 'NEFT-S2' });
  await step('verify_payment', 'POWNER', 'PAYMENT_STATUS', { payId: 'PAY-S2', status: 'confirmed', ref: 'BANK-STMT-2' });
  const items = await ev(`S.projects["${pid}"].materials.map(m => ({ k: m.k, q: m.q, status: 'ok' }))`);
  await step('material_handover', tech, 'MATERIAL_HANDED', { items: items, custName: 'Mr. Joshi', signer: 'contact', custApp: true, ev: (await sign()).concat(await ph(1, 'storage')) });
  await step('mhand_cust_sign', 'SCUST', 'MATERIAL_RECEIPT_SIGNED', { custName: 'Mr. Joshi', custody: true, ev: await sign() });

  /* installation: safety check, steps, co-worker checks by the company's senior */
  await step('site_checkin', tech, 'SITE_CHECKED_IN', { day: await ev('safeDay()'), gps: null, reason: 'site_gps' });
  await step('safety_check', tech, 'SAFETY_CHECKED', { ev: await ev(`SAFETY_ITEMS.map(([k]) => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'safe_' + k, t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`) });
  for (let guard = 0; guard < 40; guard++) {
    const n = await page.evaluate(p => needs(S.projects[p]).map(x => x.k), pid);
    if (n.includes('peer_check')) { const st = await ev(`peerWaiting(S.projects["${pid}"])[0]`); await step('peer_check', 'PSENIOR', 'PEER_CHECKED', { step: st, ok: true }); continue; }
    if (await ev(`sopNext(S.projects["${pid}"]) >= SOP.length`)) break;
    await step('install', tech, 'SOP_STEP_DONE', { step: await ev(`sopNext(S.projects["${pid}"])`), ev: await ph(1) });
  }
  await step('request_inspection', tech, 'INSPECTION_REQUESTED', {});
  await step('final_inspect', 'POWNER', 'QC_FINAL_RESULT', { checks: await ev('Object.fromEntries(QC_FINAL_CHECKS.map(k => [k, "pass"]))'), crit: await ev('Object.fromEntries(QC_CRITICAL.map(k => [k, "pass"]))'), earthVal: '0.8 Ω', outcome: 'pass', stars: 5,
    ev: (await ph(2)).concat(await ev(`QC_CRITICAL.map(k => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'crit_' + k, t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`)) });
  const due3 = await ev(`payDue(S.projects["${pid}"])`);
  await step('pay_now', 'SCUST', 'PAYMENT_RECORDED', { payId: 'PAY-S3', purpose: 'final', amount: due3.amount, method: 'upi', ref: 'UTR-S3' });
  await step('verify_payment', 'POWNER', 'PAYMENT_STATUS', { payId: 'PAY-S3', status: 'confirmed', ref: 'BANK-STMT-3' });

  /* handover: customer, technician, and the Owner in place of QC; then permit papers and licence */
  await step('sign_handover', 'SCUST', 'HANDOVER_SIGNED', { slot: 'customer', consent: true, signer: 'Mr. Joshi', ev: await sign() });
  await step('sign_handover', tech, 'HANDOVER_SIGNED', { slot: 'tech', consent: true, signer: 'Raju', ev: await sign() });
  await step('sign_handover', 'POWNER', 'HANDOVER_SIGNED', { slot: 'qc', consent: true, signer: 'Owner', ev: await sign() });
  if ((await open()).includes('record_licence')) {
    await step('record_licence', 'POWNER', 'STATUTORY_SET', { item: 'inspection', date: await ev('todayStr()'), result: 'pass' });
    await step('record_licence', 'POWNER', 'STATUTORY_SET', { item: 'licence', no: 'PUNE/LIFT/S001', holder: 'Shree Lift Works', expiry: await ev('addDays(365)') });
  }
  await step('complete_handover', 'POWNER', 'HANDOVER_COMPLETED', {});
  assert(await stage() === 'amc', 'the lift is handed over and under maintenance: no dead end with a small team');

  /* with a Finance person, the separation stays: the Owner is not given Finance's check, and the one who recorded cannot confirm */
  assert(await page.evaluate(() => { const R = RULES.PAYMENT_STATUS; S.users.PFIN.active = true; const r = ownerCovers(S, R, { type: 'PAYMENT_STATUS', data: { payId: 'x' } }, S.users.POWNER, null); S.users.PFIN.active = false; return r === false; }), 'when a Finance person exists, the Owner does not stand in for them');
  assert(await page.evaluate(() => { S = rebuild(EVENTS.slice()); return !S.rejected.length; }), 'everything rebuilds with nothing refused');

  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of [['POWNER', 'pay', { pid: 'AIEC-P007' }], ['POWNER', 'rules', {}]]) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  await page.evaluate(async () => { LANG = 'mr'; const P = S.projects['AIEC-P007']; P.customer = 'SCUST'; S.users.SCUST.projectId = 'AIEC-P007'; P.payments = []; loginAs(S.users.SCUST); go('home'); }); await page.waitForTimeout(150);
  await page.evaluate(() => go('pay', { pid: 'AIEC-P007' })); await page.waitForTimeout(150);
  await page.evaluate(async () => { await wiz('custPaid', 'AIEC-P007'); W.step = 1; render(); }); await page.waitForTimeout(100);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('SMALLTEAM PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
