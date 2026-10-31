/* Full lead-to-handover run in REAL mode, driven only through the UI. */
const path = require('path');
const { launch, tap, miss, OUT } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); };
(async () => {
  const { browser, page, errors } = await launch();
  const W8 = ms => page.waitForTimeout(ms);
  let shotN = 0; const shot = n => page.screenshot({ path: path.join(OUT, `e2e_${String(++shotN).padStart(2, '0')}_${n}.png`) });
  const next = async () => { await tap(page, '[data-a="wizNext"]', { wait: 250 }); };
  const pick = async (k, v) => tap(page, `[data-a="pick"][data-k="${k}"][data-v="${v}"]`);
  const fill = async (k, v) => { await page.fill('#f_' + k.replace(/\W/g, '_'), String(v)); await W8(60); };
  const stage = pid => page.evaluate(p => S.projects[p].stage, pid);
  const err = async () => { const e = await page.$('.err'); return e ? e.innerText() : ''; };
  const photo = async key => {
    await tap(page, `[data-a="cam"][data-k="${key}"]`, { wait: 300 });
    await page.waitForFunction(() => { const v = document.querySelector('#ov video'); return v && v.videoWidth > 0; }, null, { timeout: 10000 });
    await tap(page, '#ov [data-x="shot"]', { wait: 300 });
    await tap(page, '#ov [data-x="use"]', { wait: 200 });
    await page.waitForFunction(() => !document.querySelector('#ov .overlay'), null, { timeout: 10000 });
    await W8(150);
  };
  const sign = async key => {
    await tap(page, `[data-a="sign"][data-k="${key}"]`, { wait: 200 });
    const box = await page.locator('#ov canvas').boundingBox();
    await page.mouse.move(box.x + 20, box.y + 100); await page.mouse.down();
    for (let i = 0; i < 30; i++) await page.mouse.move(box.x + 20 + i * 10, box.y + 100 + Math.sin(i) * 40);
    await page.mouse.up();
    await tap(page, '#ov [data-x="ok"]', { wait: 300 });
  };
  const PINS = {};
  const login = async name => {
    await page.evaluate(() => ACT.logout()); await W8(150);
    const uid = await page.evaluate(n => Object.values(S.users).find(u => u.name === n).uid, name);
    /* after logging out the phone shows the three doors: customers use the customer door, everyone else the staff door */
    await tap(page, `[data-a="door"][data-v="${await page.evaluate(id => S.users[id].role === 'customer' ? 'cust' : 'staff', uid)}"]`);
    await tap(page, `[data-a="loginUser"][data-v="${uid}"]`);
    for (const d of PINS[name]) await tap(page, `.pinpad button[data-v="${d}"]`, { wait: 40 });
    await W8(300);
    if (await page.$('[data-a="permsDone"]')) await tap(page, '[data-a="permsDone"]');
    assert(await page.$('.hero'), 'logged in as ' + name);
  };
  const startTask = async (expectKey) => {
    await page.evaluate(() => ACT.nav('home')); await W8(150);
    const first = await page.evaluate(() => App.tasks && App.tasks[0] && App.tasks[0].k);
    if (expectKey) assert(first === expectKey, `expected task ${expectKey} got ${first}`);
    await tap(page, '[data-a="openTask"][data-v="0"]', { wait: 300 });
  };
  const doneOk = async label => { assert(await page.$('.big-i') && (await page.innerText('main')).length > 0, label); const t = await page.evaluate(() => App.route.name); assert(t === 'done' || t === 'cl', label + ' ended on ' + t + ' ' + await err()); };

  /* --- first launch: English, set up company --- */
  await tap(page, '[data-a="splashSkip"]');
  await tap(page, '[data-a="setLang"][data-v="en"]');
  await tap(page, '[data-a="nav"][data-v="newOrg"]');
  await fill('name', 'Olivia Owner'); await fill('pin1', '1234'); await fill('pin2', '1234');
  await tap(page, '[data-a="createOrg"]', { wait: 400 });
  PINS['Olivia Owner'] = '1234';
  await tap(page, '[data-a="permsDone"]');
  await shot('owner_home_empty');

  /* --- owner adds the team (PINs come from the screen) --- */
  const team = [['Adam Admin', 'admin'], ['Ravi Field', 'field'], ['Sam Sales', 'sales'], ['Fiona Finance', 'finance'], ['Quinn QC', 'qc'], ['Supa Supplier', 'supplier'], ['Lift Partner Co', 'partner'], ['Tara Tech', 'tech']];
  await page.evaluate(() => ACT.nav('users')); await W8(150);
  for (const [name, role] of team) {
    await tap(page, '[data-a="userAdd"]');
    await page.fill('#f_nuName', name);
    await tap(page, `[data-a="nuRole"][data-v="${role}"]`);
    /* an experienced installer: the Owner starts them as Technician so they may lead the job */
    if (role === 'tech') await tap(page, '[data-a="nuGrade"][data-v="technician"]');
    /* installers work for a licensed partner company */
    if (role === 'tech') await tap(page, `[data-a="nuCo"][data-v="${await page.evaluate(() => Object.values(S.users).find(u => u.role === 'partner').uid)}"]`);
    await page.fill('#f_nuName', name);
    await tap(page, '[data-a="userSave"]', { wait: 300 });
    const txt = await page.innerText('#ov');
    PINS[name] = txt.match(/\b(\d{4})\b/)[1];
    await page.evaluate(() => closeSheet());
  }
  console.log('team PINs', JSON.stringify(PINS));
  /* the partner company's lift licence: details typed in, licence copy checked by the office */
  const co = await page.evaluate(() => Object.values(S.users).find(u => u.role === 'partner').uid);
  await page.evaluate(uid => go('worker', { uid }), co); await W8(150);
  await tap(page, `[data-a="wizOpen"][data-v="partnerLic||uid|${co}"]`, { wait: 250 });
  await fill('licNo', 'MH/LIFT/2026/0099'); await fill('licExpiry', '2030-03-31'); await next();
  await tap(page, `[data-a="docVerify"][data-v="${co}|license|verified"]`, { wait: 200 }); await tap(page, '[data-a="docVerifyGo"]', { wait: 300 });
  assert(await page.evaluate(uid => licenceOk(uid) && !techWhyNot(Object.values(S.users).find(u => u.role === 'tech').uid), co), 'the partner company has a valid licence and its technician can be sent to sites');

  /* --- 1. field worker adds a site --- */
  await login('Ravi Field');
  await tap(page, '[data-a="addSite"]', { wait: 300 });
  await next(); assert((await err()).length > 0, 'safety must be confirmed first');
  await pick('safe', 'yes'); await next();
  await next(); assert((await err()).includes('photo'), 'building photo required');
  await photo('b'); await shot('lead_building'); await next();
  await photo('s'); await next();
  await next(); // optional context photo
  await W8(500); await fill('address', 'Plot 12, Sinhagad Road, Pune'); await fill('landmark', 'Near Big Temple'); await shot('lead_location'); await next();
  await fill('name', 'Mr. Deshmukh'); await fill('phone', '12345'); await next(); assert((await err()).toLowerCase().includes('10'), 'phone validation');
  await fill('phone', '9876543210'); await next(); assert((await err()).includes('WhatsApp'), 'call and WhatsApp consent must be asked');
  await pick('crole', 'owner'); await pick('cCall', 'yes'); await pick('cWa', 'yes'); await next();
  await pick('shaft', 'yes'); await tap(page, '[data-a="step"][data-v="1"]'); await tap(page, '[data-a="step"][data-v="1"]'); await tap(page, '[data-a="step"][data-v="1"]'); await tap(page, '[data-a="step"][data-v="1"]');
  await next();
  await shot('lead_review');
  await next();
  await doneOk('lead saved'); await shot('lead_done');
  const pid = await page.evaluate(() => S.order[0]);
  assert(await stage(pid) === 'new', 'stage new');
  /* RBAC: a field worker cannot accept their own lead */
  const r1 = await page.evaluate(p => perform('LEAD_ACCEPTED', p, {}, { quiet: true }), pid);
  assert(!r1.ok && r1.err.k === 'err_role', 'field cannot accept lead');

  /* --- 2. sales: review → call → needs → quote → send → won → agreement --- */
  await login('Sam Sales');
  await startTask('review_lead'); await shot('sales_review'); await pick('dec', 'accept'); await next(); await doneOk('accepted');
  await startTask('call_customer'); await pick('channel', 'call'); await next(); await pick('outcome', 'interested'); await next(); await fill('note', 'Wants lift before Diwali'); await next(); await doneOk('call');
  assert(await stage(pid) === 'contacted', 'contacted');
  await startTask('write_needs');
  await pick('use', 'apartment'); await next(); await next(); await pick('capacity', '6'); await next(); await pick('type', 'auto'); await next(); await pick('finish', 'ss'); await next();
  await pick('shaft', 'yes'); await pick('power', 'yes'); await pick('timeline', '1m'); await next(); await next(); await doneOk('needs');
  await startTask('make_quote');
  await tap(page, '[data-a="disc"][data-v="5"]'); await next(); assert((await err()).length, 'discount reason required');
  await fill('reason', 'Festival offer'); await shot('quote_price'); await next(); await next(); await doneOk('quote');
  assert(await stage(pid) === 'quote_ready', 'quote within limit is ready: ' + await stage(pid));
  await startTask('send_quote'); await pick('channel', 'whatsapp'); await next(); await doneOk('sent');
  await startTask('get_decision'); await pick('dec', 'lower'); await next(); // customer's offer, then a new quotation version
  assert(await page.evaluate(() => W && W.id) === 'counter', 'lower price asks what the customer offers');
  await fill('amount', '700000'); await next(); await page.waitForTimeout(300);
  assert(await page.evaluate(() => W && W.id) === 'quote', 'lower price opens a new quotation');
  for (let i = 0; i < 7; i++) await tap(page, '[data-a="disc"][data-v="5"]');
  await fill('reason', 'Customer asked for big discount'); await next(); await shot('quote_needs_approval'); await next(); await doneOk('quote v2');
  assert(await stage(pid) === 'quote_approval', 'big discount needs approval');
  /* sales cannot approve it */
  const r2 = await page.evaluate(p => perform('QUOTE_DECISION', p, { decision: 'approve' }, { quiet: true }), pid);
  assert(!r2.ok, 'sales cannot approve quotation');

  assert(!(await page.evaluate(() => myTasks(Object.values(S.users).find(u => u.role === 'owner')).some(n => n.k === 'approve_quote'))), 'the Head Quarter is not asked: the Admin approves');
  await login('Adam Admin');
  await startTask('approve_quote'); await shot('admin_approve'); await pick('decision', 'reject'); await next(); await next(); assert((await err()).length, 'reject needs reason');
  await fill('reason', 'Too low. Max 30%.'); await next(); await doneOk('rejected');
  assert(await stage(pid) === 'requirements', 'rejected goes back to requirements');

  await login('Sam Sales');
  await startTask('make_quote'); for (let i = 0; i < 2; i++) await tap(page, '[data-a="disc"][data-v="5"]'); await fill('reason', 'Owner limit'); await next(); await next(); await doneOk('quote v3');
  await startTask('send_quote'); await pick('channel', 'visit'); await next();
  await startTask('get_decision'); await pick('dec', 'yes'); await next(); await shot('decision_yes'); await next(); await doneOk('won');
  assert(await stage(pid) === 'won', 'won');
  await startTask('prepare_agreement'); await next(); await doneOk('agreement prepared');
  await tap(page, '[data-a="custAccess"]', { wait: 300 }); await next();
  const custText = await page.innerText('main'); PINS['Mr. Deshmukh'] = custText.match(/PIN:\s*(\d{4})/)[1];
  await startTask('sign_agreement'); await next(); assert((await err()).length, 'consent needed');
  await tap(page, '[data-a="toggle"][data-k="consent"]'); await next(); await next(); await sign('sig'); await shot('agreement_sign'); await next(); await doneOk('signed');
  assert(await stage(pid) === 'signed', 'signed');
  await startTask('record_payment'); await pick('method', 'upi'); await next(); await fill('ref', 'UTR123456'); await next(); await next(); await doneOk('token recorded');
  /* sales cannot confirm money */
  const r3 = await page.evaluate(p => perform('PAYMENT_STATUS', p, { payId: S.projects[p].payments[0].id, status: 'confirmed', ref: 'x' }, { quiet: true }), pid);
  assert(!r3.ok, 'sales cannot confirm payment');

  /* --- 3. finance confirms token --- */
  await login('Fiona Finance');
  await startTask('verify_payment'); await shot('finance_verify'); await pick('status', 'confirmed'); await next(); await fill('ref', 'HDFC-STMT-991'); await next(); await doneOk('token confirmed');
  assert(await stage(pid) === 'site_prep', 'site_prep after verified token');

  /* --- 4. customer prepares the site --- */
  await login('Mr. Deshmukh');
  await shot('customer_home');
  await startTask('prepare_site'); await shot('customer_checklist');
  for (const k of ['shaft', 'pit', 'power', 'clean', 'light', 'barricade']) {
    await tap(page, `[data-a="clItem"][data-v="prep|${k}"]`, { wait: 250 });
    await photo('ph'); await next();
  }
  await tap(page, '[data-a="clAction"][data-v="QC_REQUESTED"]', { wait: 300 }); await doneOk('qc requested');
  assert(await stage(pid) === 'qc_site', 'qc_site');
  /* customer sees only their own project */
  assert(await page.evaluate(() => visibleProjects(App.me).length) === 1, 'customer sees one project');

  /* --- 5. QC site inspection: corrections first, then approval --- */
  await login('Quinn QC');
  await startTask('inspect_site'); await next();
  for (const [m, v] of [['width', 1800], ['depth', 1900], ['pit', 1500], ['head', 4200]]) await fill('meas.' + m, v);
  await next();
  for (const c of ['plumb', 'pit_dry', 'power3', 'access']) await pick('checks.' + c, 'yes');
  await pick('checks.barricade', 'no'); await next();
  await photo('ph'); await photo('ph'); await next();
  await pick('outcome', 'approved'); await next(); assert((await err()).length, 'cannot approve with a failed check');
  await pick('outcome', 'corrections'); await next(); await shot('qc_corrections'); await next(); await next(); await doneOk('qc corrections');
  assert(await stage(pid) === 'site_fix', 'site_fix');
  await login('Mr. Deshmukh');
  await startTask('fix_site'); await tap(page, '[data-a="clItem"]', { wait: 250 }); await photo('ph'); await next();
  await tap(page, '[data-a="clAction"][data-v="QC_REQUESTED"]', { wait: 300 });
  await login('Quinn QC');
  await startTask('inspect_site'); await next();
  for (const [m, v] of [['width', 1800], ['depth', 1900], ['pit', 1500], ['head', 4200]]) await fill('meas.' + m, v);
  await next(); for (const c of ['plumb', 'pit_dry', 'power3', 'barricade', 'access']) await pick('checks.' + c, 'yes');
  await next(); await photo('ph'); await photo('ph'); await next(); await pick('outcome', 'approved'); await next(); await next(); await doneOk('qc approved');
  assert(await stage(pid) === 'site_ok', 'site_ok');

  /* --- 6. admin releases drawings --- */
  await login('Adam Admin');
  await startTask('release');
  const sup = await page.evaluate(() => Object.values(S.users).find(u => u.role === 'supplier').uid);
  const tec = await page.evaluate(() => Object.values(S.users).find(u => u.role === 'tech').uid);
  await pick('supplier', sup); await next(); await pick('tech', tec); await next(); await next(); await next(); await doneOk('released');
  assert(await stage(pid) === 'material_order', 'material_order');

  /* --- 7. supplier dispatches --- */
  await login('Supa Supplier');
  assert(await page.evaluate(p => !seeF(App.me, 'phone'), pid), 'supplier cannot see phone');
  await startTask('accept_po'); await shot('purchase_order'); await pick('ok', 'yes'); await next(); await next(); await doneOk('order accepted');
  assert(await page.evaluate(p => !!S.projects[p].po.accepted, pid), 'the supplier accepted the purchase order with a dispatch date');
  await startTask('dispatch');
  const mats = await page.evaluate(p => S.projects[p].materials.map(m => m.k), pid);
  for (const k of mats) await tap(page, `[data-a="toggleIn"][data-v="${k}"]`, { wait: 40 });
  await next(); await next(); assert((await err()).length > 0, 'serial numbers are required');
  for (const k of ['m_machine', 'm_controller', 'm_governor']) if (mats.includes(k)) await fill('serialMap.' + k, k.slice(2, 5).toUpperCase() + '-7781');
  await fill('challan', 'DC/7781'); await shot('dispatch_serials'); await next(); await fill('seal', 'SEAL-7781'); await fill('vehicle', 'MH12 XY 4455'); await next(); await photo('ph'); await photo('ph'); await next(); await next(); await doneOk('dispatched');

  /* --- 8. technician records arrival; handover blocked until arrival payment confirmed --- */
  await login('Tara Tech');
  await startTask('arrival'); await W8(500); await next(); await fill('sealSeen', 'SEAL-7781'); await pick('sealIntact', 'yes'); await next(); await pick('condition', 'good'); await next(); await photo('ph'); await photo('ph'); await next(); await doneOk('arrived');
  assert(await stage(pid) === 'arrived', 'arrived');
  const r4 = await page.evaluate(p => perform('MATERIAL_HANDED', p, { items: [], custName: 'x', ev: [] }, { quiet: true }), pid);
  assert(!r4.ok && r4.err === 'err_payment_gate', 'payment gate blocks material handover: ' + JSON.stringify(r4.err));
  await login('Sam Sales'); await startTask('record_payment'); await pick('method', 'bank'); await next(); await fill('ref', 'NEFT778'); await next(); await next();
  await login('Fiona Finance'); await startTask('verify_payment'); await pick('status', 'confirmed'); await next(); await fill('ref', 'STMT-1002'); await next();
  await login('Tara Tech');
  await startTask('material_handover'); await shot('material_handover'); await next(); await photo('store'); await next();
  assert(!(await page.$('[data-a="sign"][data-k="csig"]')), 'the customer has the app: no customer signature on the technician\'s phone');
  await next(); await sign('tsig'); await next(); await doneOk('material counted');
  assert(await stage(pid) === 'arrived', 'installation waits for the customer\'s signature');
  await login('Mr. Deshmukh');
  await startTask('mhand_cust_sign'); await shot('material_customer_list'); await next();
  await sign('csig'); await next(); assert((await err()).length > 0, 'the customer must accept to keep the material safe');
  await tap(page, '[data-a="toggle"][data-k="custody"]'); await shot('material_custody'); await next(); await doneOk('material signed by customer');
  assert(await stage(pid) === 'installing', 'installing');
  /* no installation before the permission to erect is recorded */
  await login('Tara Tech');
  assert(await page.evaluate(() => App.tasks[0] && App.tasks[0].k === 'wait_permit'), 'the technician waits: permission to erect not recorded yet');
  await login('Adam Admin');
  assert(await page.evaluate(p => App.tasks.some(n => n.k === 'record_permit' && n.pid === p && n.urgent), pid), 'Admin has an urgent "record the permit" task');
  await page.evaluate(p => wiz('statutory', p, { item: 'permit' }), pid); await W8(250);
  await fill('no', 'EP/PUNE/0099/2026'); await next(); await doneOk('permit recorded');
  await login('Tara Tech');

  /* --- 9. daily safety check (4 photos), then installation SOP, one blocker on the way --- */
  await startTask('site_checkin'); await W8(900); await shot('site_checkin'); await next(); await doneOk('checked in');
  await startTask('safety_check');
  for (const k of ['ppe', 'scaffold', 'barricade', 'earthing']) await photo('s_' + k);
  await next(); await tap(page, '[data-a="toggle"][data-k="ok"]'); await next(); await doneOk('safety check');
  await startTask('install'); await shot('sop_list');
  for (let i = 0; i < 12; i++) {
    if (i === 3) {
      await tap(page, `[data-a="clItem"][data-v="sop|${i}"]`, { wait: 250 });
      await tap(page, '[data-a="raiseBlocker"]', { wait: 250 }); await pick('reason', 'material'); await next(); await next(); await next(); await doneOk('blocker');
      await login('Supa Supplier'); await startTask('resolve_blocker'); await fill('note', 'Sent missing rail brackets'); await next(); await doneOk('blocker solved');
      await login('Tara Tech'); await startTask('install');
    }
    await tap(page, `[data-a="clItem"][data-v="sop|${i}"]`, { wait: 250 });
    await photo('ph'); await next();
    /* doors, wiring and safety devices: a co-worker (here the QC Inspector) checks the photos before the next step */
    if ([8, 9, 10].includes(i)) {
      await login('Quinn QC'); await startTask('peer_check'); await pick('ok', 'yes'); await next(); await doneOk('co-worker check');
      await login('Tara Tech'); await startTask(i === 10 ? 'install' : 'install');
    }
  }
  await tap(page, '[data-a="clAction"][data-v="INSPECTION_REQUESTED"]', { wait: 300 }); await doneOk('inspection requested');

  /* --- 10. final QC: fail once, fix, then pass --- */
  await login('Quinn QC');
  await startTask('final_inspect'); await next();
  for (const c of ['ride', 'level', 'doors', 'alarm', 'plate', 'safetydev']) await pick('checks.' + c, 'pass');
  await pick('checks.wiring', 'fail'); await next(); for (const k of ['earthing', 'brakes', 'governor', 'interlocks']) { await pick('crit.' + k, 'pass'); await photo('critPh.' + k); } await next(); await photo('ph'); await photo('ph'); await next(); await shot('qcf_fail'); await next();
  await pick('cause', 'work'); await next(); await next(); await pick('stars', '2'); await next(); await doneOk('qc final fail');
  assert(await stage(pid) === 'install_fix', 'install_fix');
  await login('Tara Tech'); await startTask('fix_install'); await tap(page, '[data-a="clItem"]', { wait: 250 }); await photo('ph'); await next();
  await tap(page, '[data-a="clAction"][data-v="INSPECTION_REQUESTED"]', { wait: 300 });
  await login('Quinn QC'); await startTask('final_inspect'); await next();
  for (const c of ['ride', 'level', 'doors', 'alarm', 'plate', 'safetydev', 'wiring']) await pick('checks.' + c, 'pass');
  await next(); for (const k of ['earthing', 'brakes', 'governor', 'interlocks']) { await pick('crit.' + k, 'pass'); await photo('critPh.' + k); } await next(); await photo('ph'); await photo('ph'); await next(); await pick('outcome', 'pass'); await next(); await pick('stars', '4'); await next(); await doneOk('qc final pass');
  assert(await stage(pid) === 'final_pay', 'final_pay');

  /* --- 11. final payment --- */
  await login('Sam Sales'); await startTask('record_payment'); await pick('method', 'cheque'); await next(); await fill('ref', 'CHQ 000123'); await next(); await next();
  await login('Fiona Finance'); await startTask('verify_payment'); await pick('status', 'confirmed'); await next(); await fill('ref', 'STMT-2001'); await next();
  assert(await stage(pid) === 'handover', 'handover');

  /* --- 12. handover: customer, technician, QC sign; QC completes --- */
  for (const [who, slot] of [['Mr. Deshmukh', 'customer'], ['Tara Tech', 'tech'], ['Quinn QC', 'qc']]) {
    await login(who); await startTask('sign_handover');
    await tap(page, `[data-a="clItem"][data-v="hand|${slot}"]`, { wait: 250 });
    await tap(page, '[data-a="toggle"][data-k="consent"]'); await next(); await next(); await sign('sig'); await next();
  }
  await shot('handover_list');
  assert(!(await page.$('[data-a="clAction"][data-v="HANDOVER_COMPLETED"]')), 'handover cannot be completed before the lift licence is recorded');
  /* the office records the Lift Inspector's visit and the lift licence */
  await login('Olivia Owner');
  await page.evaluate(p => wiz('statutory', p, { item: 'inspection' }), pid); await W8(250);
  await pick('result', 'pass'); await next(); await doneOk('inspection recorded');
  await page.evaluate(p => wiz('statutory', p, { item: 'licence' }), pid); await W8(250);
  await fill('no', 'PUNE/LIFT/0099/2026'); await fill('expiry', '2027-12-31'); await next(); await doneOk('licence recorded');
  await login('Quinn QC'); await startTask('complete_handover');
  await tap(page, '[data-a="clAction"][data-v="HANDOVER_COMPLETED"]', { wait: 300 }); await doneOk('handover complete');
  assert(await stage(pid) === 'amc', 'amc');
  await tap(page, '[data-a="openDocP"]', { wait: 400 }); await shot('handover_doc');

  /* --- 13. owner dashboard + audit --- */
  await login('Olivia Owner'); await shot('owner_dashboard');
  await page.evaluate(p => ACT.openProject(p), pid); await W8(200); await tap(page, '[data-a="tab"][data-v="timeline"]'); await shot('timeline');
  const summary = await page.evaluate(p => ({ events: EVENTS.length, rejected: S.rejected.length, stage: S.projects[p].stage, quotes: S.projects[p].quotes.length, pays: S.projects[p].payments.map(x => x.purpose + ':' + x.status) }), pid);
  console.log('SUMMARY', JSON.stringify(summary));

  /* --- 14. reload: state rebuilt from events must match --- */
  console.log('MISSING (before reload)', (await miss(page)).join(', ') || 'none');
  await page.reload(); await W8(800);
  await page.evaluate(() => { window.__miss = new Set(); const o = t; window.t = (k, v) => { if (!L[k]) window.__miss.add(k); return o(k, v); }; });
  const after = await page.evaluate(p => ({ stage: S.projects[p].stage, rejected: S.rejected.length, events: EVENTS.length }), pid);
  console.log('AFTER RELOAD', JSON.stringify(after));
  assert(after.stage === 'amc' && after.rejected === 0, 'rebuild after reload');

  /* --- 15. forged import is refused --- */
  await login('Olivia Owner');
  const forged = await page.evaluate(async p => {
    const field = Object.values(S.users).find(u => u.role === 'field').uid;
    const pack = exportPack('full');
    pack.events = pack.events.concat([{ id: 'FORGE-1', n: 1, t: new Date().toISOString(), by: field, type: 'DEAL_REOPENED', pid: p, data: { reason: 'hack' }, dev: 'X' },
      { id: 'FORGE-2', n: 2, t: new Date().toISOString(), by: field, type: 'CONFIG_SET', pid: null, data: { key: 'minMargin', value: 0 }, dev: 'X' }]);
    return importText(JSON.stringify(pack));
  }, pid);
  console.log('FORGED IMPORT', JSON.stringify(forged));
  assert(forged.ok && forged.added === 0 && forged.rejected === 2, 'forged events refused');

  console.log('MISSING', (await miss(page)).join(', ') || 'none');
  console.log('ERRORS', errors.join('\n') || 'none');
  console.log('E2E PASSED');
  await browser.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
