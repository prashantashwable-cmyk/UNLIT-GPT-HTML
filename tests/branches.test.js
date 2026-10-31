/* Side branches with a small team (Owner, field, partner company, supplier, customer): returned lead, Owner's discounted quotation,
   price below the floor with nobody to approve, site corrections, failed payment, failed final inspection, AMC ticket and service visit.
   At every step the actor must have the task, opening it must show its screen (not "no access"), and the record must succeed. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const ph = (n, label) => ev(`Array.from({ length: ${n} }, () => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: ${JSON.stringify(label || 'work')}, t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`);
  const sign = () => ev(`[{ id: 'E' + rid(10), m: 'x', kind: 'sign', t: nowISO(), hash: 'h' + rid(8) }]`);
  let pid = 'AIEC-B001';
  const stage = () => ev(`S.projects["${pid}"].stage`);
  const step = async (task, as, type, data) => {
    const r0 = await page.evaluate(([as, task, p]) => { const u = S.users[as]; loginAs(u); App.set.permsSeen = Object.assign({}, App.set.permsSeen, { [App.mode + as]: true }); Notify.hide(); W = null;
      const n = myTasks(u).find(n => n.k === task && (!p || !n.pid || n.pid === p)); if (!n) return { none: JSON.stringify(needs(S.projects[p]).map(x => x.k + ':' + x.roles.join('/'))) };
      try { openTask(n); } catch (e) { return { err: e.message }; }
      return {}; }, [as, task, pid]);
    if (!r0.none && !r0.err) { await page.waitForTimeout(250); Object.assign(r0, await page.evaluate(() => ({ route: App.route.name, txt: (document.querySelector('main') || {}).innerText || '' }))); }
    if (r0.none) throw new Error(`ASSERT: ${as} has no "${task}" task at ${await stage()}; open: ${r0.none}`);
    if (r0.err || /do not have access/.test(r0.txt) || r0.route === 'home' && task !== 'day_close') throw new Error(`ASSERT: opening "${task}" as ${as} failed: ${r0.err || r0.route + ' ' + r0.txt.slice(0, 120)}`);
    await page.evaluate(() => { W = null; });
    if (!type) { console.log('ok -', task, '→', as, '(opens', r0.route + ')'); return; }
    const r = await page.evaluate(([type, p, data, as]) => perform(type, p, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && JSON.stringify(r.err) })), [type, pid, data, as]);
    if (!r.ok) throw new Error(`ASSERT: ${as} could not do ${type} (${task}): ${r.err}`);
    console.log('ok -', task, '→', as);
  };
  await page.evaluate(async () => { for (const u of ['PSALES', 'PFIN', 'PQC', 'PADMIN']) await perform('USER_UPDATED', null, { uid: u, active: false }, { as: 'POWNER', quiet: true }); });
  const newLead = async (p, by) => page.evaluate(async ([p, by, e]) => (await perform('LEAD_CREATED', p, { safe: true, ev: e, gps: null, address: 'Baner, Pune', name: 'Mr. Rao', phone: '9822066601', shaft: 'yes', floors: 5, dupOf: [], consent: { call: 'yes', whatsapp: 'yes' } }, { as: by, quiet: true })).ok, [p, by, await ph(2, 'b')]);

  /* returned lead: back to whoever added it */
  assert(await newLead(pid, 'PFIELD'), 'a field worker adds a site');
  await step('review_lead', 'POWNER', 'LEAD_RETURNED', { reason: 'photo', note: 'Building photo is blurred' });
  await step('fix_lead', 'PFIELD', 'LEAD_RESUBMITTED', {});
  await step('review_lead', 'POWNER', 'LEAD_ACCEPTED', {});
  pid = 'AIEC-B002';
  assert(await newLead(pid, 'POWNER'), 'the Owner adds a site himself');
  await step('review_lead', 'POWNER', 'LEAD_RETURNED', { reason: 'phone', note: 'Wrong number' });
  await step('fix_lead', 'POWNER', 'LEAD_RESUBMITTED', {});
  pid = 'AIEC-B001';

  /* the Owner's own discount needs no approval; below the floor nobody can approve, so the Owner withdraws and quotes again */
  await step('call_customer', 'POWNER', 'CONTACT_LOGGED', { channel: 'call', outcome: 'interested', note: '' });
  await step('write_needs', 'POWNER', 'REQ_SAVED', { req: { use: 'apartment', stops: 5, capacity: '6', type: 'auto', finish: 'ss', shaft: 'yes', power: 'yes', timeline: '3m' } });
  await step('make_quote', 'POWNER', 'QUOTE_CREATED', { discountPct: 35, reason: 'Repeat customer', trade: 'amc' });
  assert(await stage() === 'quote_ready', 'the Owner\'s own discount (above the margin floor) needs no approval');
  await step('send_quote', 'POWNER', 'QUOTE_SENT', { channel: 'visit' });
  await step('get_decision', 'POWNER', 'QUOTE_CREATED', { discountPct: 75, reason: 'Customer insists', trade: 'none' });
  assert(await stage() === 'quote_approval', 'a price below the margin floor waits for a second person');
  assert((await page.evaluate(p => perform('QUOTE_DECISION', p, { decision: 'approve' }, { as: 'POWNER', quiet: true }).then(r => r.err), pid)) === 'err_same_person', 'the Owner cannot approve his own price below the floor');
  await step('withdraw_quote', 'POWNER', 'QUOTE_DECISION', { decision: 'reject', reason: 'Too low; offer 30% instead' });
  assert(await stage() === 'requirements', 'with nobody else to approve, the Owner withdraws it and the job is not stuck');
  await step('make_quote', 'POWNER', 'QUOTE_CREATED', { discountPct: 30, reason: 'Final offer', trade: 'advance' });
  await step('send_quote', 'POWNER', 'QUOTE_SENT', { channel: 'visit' });
  await step('get_decision', 'POWNER', 'DEAL_WON', {});
  await step('prepare_agreement', 'POWNER', 'AGREEMENT_PREPARED', {});
  await page.evaluate(async pid => { const salt = 'c'; await perform('USER_ADDED', null, { uid: 'BCUST', name: 'Mr. Rao', role: 'customer', projectId: pid, salt, pin: await pinHash('1234', salt) }, { as: 'POWNER', quiet: true }); }, pid);
  await step('sign_agreement', 'BCUST', 'AGREEMENT_SIGNED', { consent: true, signer: 'Mr. Rao', ev: await sign() });

  /* a payment not found in the bank */
  const amt = await ev(`payDue(S.projects["${pid}"]).amount`);
  await step('pay_now', 'BCUST', 'PAYMENT_RECORDED', { payId: 'PAY-B1', purpose: 'token', amount: amt, method: 'upi', ref: 'UTR-WRONG' });
  await step('verify_payment', 'POWNER', 'PAYMENT_STATUS', { payId: 'PAY-B1', status: 'failed', reason: 'No such UTR in the statement' });
  await page.evaluate(() => { loginAs(S.users.BCUST); go('pay', { pid: 'AIEC-B001' }); }); await page.waitForTimeout(150);
  assert(/not found in the bank/.test(await page.innerText('main')) && await page.$('[data-v^="custPaid|"]'), 'the customer is told it was not found and can report again');
  await step('pay_now', 'BCUST', 'PAYMENT_RECORDED', { payId: 'PAY-B2', purpose: 'token', amount: amt, method: 'upi', ref: 'UTR-RIGHT' });
  await step('verify_payment', 'POWNER', 'PAYMENT_STATUS', { payId: 'PAY-B2', status: 'confirmed', ref: 'STMT-B2' });

  /* site corrections */
  for (const k of await ev('PREP_ITEMS.map(x => x[0])')) await step('prepare_site', 'BCUST', 'PREP_ITEM_DONE', { item: k, ev: await ph(1, 'site') });
  await step('request_qc', 'BCUST', 'QC_REQUESTED', {});
  const site = async outcome => ({ meas: { width: 1800, depth: 1900, pit: 1500, head: 4200 }, checks: { plumb: 'yes', pit_dry: outcome === 'approved' ? 'yes' : 'no', power3: 'yes', barricade: 'yes', access: 'yes' }, outcome, items: outcome === 'corrections' ? [{ text: 'Pump the water out of the pit' }] : [], ev: await ph(2, 'site') });
  await step('inspect_site', 'POWNER', 'QC_SITE_RESULT', await site('corrections'));
  assert(await stage() === 'site_fix', 'the site needs a correction');
  await step('fix_site', 'BCUST', 'CORRECTION_DONE', { cid: await ev(`S.projects["${pid}"].corrections[0].id`), ev: await ph(1, 'site') });
  await step('request_qc', 'BCUST', 'QC_REQUESTED', {});
  await step('inspect_site', 'POWNER', 'QC_SITE_RESULT', await site('approved'));

  /* material and installation (as in the main flow) */
  await step('release', 'POWNER', 'RELEASED', { supplier: 'PSUP', tech: 'PTECH', drawings: 'DWG-B1', materials: await ev('materialList({ stops: 5, type: "auto", capacity: "6", finish: "ss" })') });
  if ((await page.evaluate(p => needs(S.projects[p]).map(n => n.k), pid)).includes('record_permit')) await step('record_permit', 'POWNER', 'STATUTORY_SET', { item: 'permit', no: 'EP/B1', date: await ev('todayStr()') });
  await step('accept_po', 'PSUP', 'PO_ACCEPTED', { date: await ev('addDays(2)') });
  await step('dispatch', 'PSUP', 'DISPATCHED', { packed: await ev(`S.projects["${pid}"].materials.map(m => m.k)`), seal: 'SB1', challan: 'DC/B1', serialMap: { m_machine: 'M1', m_controller: 'C1', m_governor: 'G1' }, ev: await ph(2) });
  await step('arrival', 'PTECH', 'ARRIVED', { gps: null, sealSeen: 'SB1', sealIntact: 'yes', condition: 'good', ev: await ph(2) });
  await step('pay_now', 'BCUST', 'PAYMENT_RECORDED', { payId: 'PAY-B3', purpose: 'arrival', amount: await ev(`payDue(S.projects["${pid}"]).amount`), method: 'bank', ref: 'NEFT-B3' });
  await step('verify_payment', 'POWNER', 'PAYMENT_STATUS', { payId: 'PAY-B3', status: 'confirmed', ref: 'STMT-B3' });
  await step('material_handover', 'PTECH', 'MATERIAL_HANDED', { items: await ev(`S.projects["${pid}"].materials.map(m => ({ k: m.k, q: m.q, status: 'ok' }))`), custName: 'Mr. Rao', signer: 'contact', custApp: true, ev: (await sign()).concat(await ph(1, 'storage')) });
  await step('mhand_cust_sign', 'BCUST', 'MATERIAL_RECEIPT_SIGNED', { custName: 'Mr. Rao', custody: true, ev: await sign() });
  await step('site_checkin', 'PTECH', 'SITE_CHECKED_IN', { day: await ev('safeDay()'), gps: null, reason: 'site_gps' });
  await step('safety_check', 'PTECH', 'SAFETY_CHECKED', { ev: await ev(`SAFETY_ITEMS.map(([k]) => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'safe_' + k, t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`) });
  for (let g = 0; g < 40 && !(await ev(`sopNext(S.projects["${pid}"]) >= SOP.length`)); g++) {
    if ((await page.evaluate(p => needs(S.projects[p]).map(x => x.k), pid)).includes('peer_check')) await step('peer_check', 'PSENIOR', 'PEER_CHECKED', { step: await ev(`peerWaiting(S.projects["${pid}"])[0]`), ok: true });
    else await step('install', 'PTECH', 'SOP_STEP_DONE', { step: await ev(`sopNext(S.projects["${pid}"])`), ev: await ph(1) });
  }
  await step('request_inspection', 'PTECH', 'INSPECTION_REQUESTED', {});

  /* final inspection fails, the team fixes it */
  const final = async (outcome) => ({ checks: await ev(`Object.fromEntries(QC_FINAL_CHECKS.map((k, i) => [k, ${outcome === 'fail' ? 'i === 0 ? "fail" : "pass"' : '"pass"'}]))`), crit: await ev('Object.fromEntries(QC_CRITICAL.map(k => [k, "pass"]))'), earthVal: '0.8 Ω', outcome, cause: outcome === 'fail' ? 'work' : undefined, note: outcome === 'fail' ? 'Door gap too wide' : '', items: outcome === 'fail' ? [{ text: 'Adjust the landing door gap' }] : [], stars: 4,
    ev: (await ph(2)).concat(await ev(`QC_CRITICAL.map(k => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'crit_' + k, t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`)) });
  await step('final_inspect', 'POWNER', 'QC_FINAL_RESULT', await final('fail'));
  assert(await stage() === 'install_fix', 'a failed final inspection sends the job back for fixing');
  const n1 = await page.evaluate(p => needs(S.projects[p]).map(n => n.k), pid);
  if (n1.includes('safety_check')) await step('safety_check', 'PTECH', 'SAFETY_CHECKED', { ev: await ev(`SAFETY_ITEMS.map(([k]) => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'safe_' + k, t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`) });
  await step('fix_install', 'PTECH', 'CORRECTION_DONE', { cid: await ev(`S.projects["${pid}"].corrections.find(c => c.scope === "install" && !c.done).id`), ev: await ph(1) });
  await step('request_inspection', 'PTECH', 'INSPECTION_REQUESTED', {});
  await step('final_inspect', 'POWNER', 'QC_FINAL_RESULT', await final('pass'));
  await step('pay_now', 'BCUST', 'PAYMENT_RECORDED', { payId: 'PAY-B4', purpose: 'final', amount: await ev(`payDue(S.projects["${pid}"]).amount`), method: 'upi', ref: 'UTR-B4' });
  await step('verify_payment', 'POWNER', 'PAYMENT_STATUS', { payId: 'PAY-B4', status: 'confirmed', ref: 'STMT-B4' });
  await step('sign_handover', 'BCUST', 'HANDOVER_SIGNED', { slot: 'customer', consent: true, signer: 'Mr. Rao', ev: await sign() });
  await step('sign_handover', 'PTECH', 'HANDOVER_SIGNED', { slot: 'tech', consent: true, signer: 'Raju', ev: await sign() });
  await step('sign_handover', 'POWNER', 'HANDOVER_SIGNED', { slot: 'qc', consent: true, signer: 'Owner', ev: await sign() });
  await step('record_licence', 'POWNER', 'STATUTORY_SET', { item: 'inspection', date: await ev('todayStr()'), result: 'pass' });
  await step('record_licence', 'POWNER', 'STATUTORY_SET', { item: 'licence', no: 'PUNE/LIFT/B1', holder: 'Shree Lift Works', expiry: await ev('addDays(365)') });
  await step('complete_handover', 'POWNER', 'HANDOVER_COMPLETED', {});
  assert(await stage() === 'amc', 'handed over after the corrections');

  /* after handover: a complaint and a service visit */
  await page.evaluate(p => perform('TICKET_OPENED', p, { tid: 'T-B1', kind: 'breakdown', text: 'Lift stopped at 2nd floor' }, { as: 'BCUST', quiet: true }), pid);
  await step('assign_ticket', 'POWNER', 'TICKET_ASSIGNED', { tid: 'T-B1', uid: 'PTECH', due: await ev('todayStr()') });
  await step('work_ticket', 'PTECH', 'TICKET_UPDATED', { tid: 'T-B1', status: 'resolved', note: 'Door contact cleaned' });
  await step('confirm_ticket', 'BCUST', 'TICKET_CLOSED', { tid: 'T-B1', ok: true });
  await page.evaluate(p => { S.projects[p].done.amc.visits[0] = todayStr(); }, pid);
  await step('amc_visit', 'PTECH', null);
  assert(await page.evaluate(p => { const orph = []; const act = Object.values(S.users).filter(u => u.active); for (const P of Object.values(S.projects)) for (const n of needs(P)) if (!act.some(u => canSee(u, P) && isMine(n, u))) orph.push(P.id + ':' + n.k); return orph.length === 0; }), 'no task anywhere is left without someone who can do it');
  await page.evaluate(() => { LANG = 'mr'; loginAs(S.users.POWNER); }); await page.waitForTimeout(100);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('BRANCHES PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
