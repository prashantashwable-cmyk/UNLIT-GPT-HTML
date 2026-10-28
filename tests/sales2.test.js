/* Sales and money, part 2: call/WhatsApp consent and opt-out, tower-aware duplicates, field worker earnings, cabin payment milestone,
   token on top of the price, refund after cancellation (worked out, Owner decides, second finance person pays), payment receipt. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const photos = (n, label) => ev(`Array.from({ length: ${n} }, (_, i) => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: '${label || 'work'}' + (${label ? "'_' + SAFETY_ITEMS[i][0]" : "''"}), t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`);
  const tasks = (uid, pid) => page.evaluate(([uid, pid]) => myTasks(S.users[uid]).filter(n => !pid || n.pid === pid).map(n => n.k), [uid, pid]);
  assert(await ev('S.rejected.length === 0'), 'practice data loads with nothing refused');

  /* consent and opt-out */
  const lead = { safe: true, ev: await photos(2), gps: null, address: 'Tower B, Kothrud, Pune', landmark: '', name: 'Mr. Bapat', phone: '9822099999', noPhone: false, shaft: 'yes', floors: 5, dupOf: [], tower: 'B', contactRole: 'manager', consent: { call: 'yes', whatsapp: 'no' } };
  assert((await act('LEAD_CREATED', 'AIEC-T001', lead, 'PFIELD')).ok && await ev('S.projects["AIEC-T001"].consent.whatsapp') === 'no' && await ev('S.projects["AIEC-T001"].lead.tower') === 'B', 'a new lead keeps the tower, who the contact is and what they agreed to');
  await act('LEAD_ACCEPTED', 'AIEC-T001', {}, 'PSALES');
  assert((await act('MSG_LOGGED', 'AIEC-T001', { mid: 'M1', template: 'intro', text: 'Hello' }, 'PSALES')).err === 'err_no_consent', 'no WhatsApp message when the contact said no to WhatsApp');
  await page.evaluate(() => { loginAs(S.users.PSALES); ACT.permsDone(); Notify.hide(); go('project', { pid: 'AIEC-T001' }); }); await page.waitForTimeout(200);
  assert((await act('MSG_LOGGED', 'AIEC-P007', { mid: 'M2', template: 'intro', text: 'Hello' }, 'PSALES')).ok, 'messages to a contact who did not object still work');
  assert((await act('OPT_OUT', 'AIEC-P007', { channel: 'nothing' }, 'PSALES')).err === 'err_choose', 'opting out needs a channel');
  assert((await act('OPT_OUT', 'AIEC-P007', { channel: 'whatsapp', note: 'Asked on call' }, 'PSALES')).ok && !(await ev('mayContact(S.projects["AIEC-P007"], "whatsapp")')) && await ev('mayContact(S.projects["AIEC-P007"], "call")'), 'the contact asks to stop WhatsApp: calls are still allowed');
  assert((await act('MSG_LOGGED', 'AIEC-P007', { mid: 'M3', template: 'intro', text: 'Hello again' }, 'PSALES')).err === 'err_no_consent', 'after opting out, no more WhatsApp messages');
  assert((await act('OPT_OUT', 'AIEC-P007', { channel: 'all' }, 'PFIELD')).ok === false, 'a field worker cannot change it');

  /* duplicates in another tower are not duplicates */
  const gps = await ev('S.projects["AIEC-P010"].site.gps');
  await page.evaluate(() => { S.projects['AIEC-P010'].lead.tower = 'A'; });
  assert(gps && await page.evaluate(gps => findDuplicates({ gps, tower: 'C', phone: '', noPhone: true }).every(P => P.id !== 'AIEC-P010'), gps), 'the same building but another tower is a new lead');
  assert(await page.evaluate(gps => findDuplicates({ gps, tower: 'a ', phone: '', noPhone: true }).some(P => P.id === 'AIEC-P010'), gps), 'the same tower is a duplicate');

  /* field worker earnings */
  const before = await ev('earnings("PFIELD").length');
  assert(before === 0 || await ev('earnings("PFIELD").every(x => x.amount === 0)'), 'with no field pay set, a field worker earns nothing');
  await act('CONFIG_SET', null, { key: 'payLeadValid', value: 200 }, 'POWNER');
  await act('CONFIG_SET', null, { key: 'leadWonPct', value: 1 }, 'POWNER');
  const e = await ev('earnings("PFIELD")');
  assert(e.some(x => x.what === 'earn_lead_valid' && x.amount === 200) && e.some(x => x.what === 'earn_lead_won' && x.amount > 0), 'a field worker earns for each accepted lead and a share of each won deal');
  await page.evaluate(() => { loginAs(S.users.PFIELD); ACT.permsDone(); Notify.hide(); go('earn', { uid: 'PFIELD' }); }); await page.waitForTimeout(200);
  assert(/Field worker pay|lead/i.test(await page.innerText('main')) && /200/.test(await page.innerText('main')), 'the field worker sees their own pay');

  /* payment plan: cabin milestone and token on top */
  assert(await ev('JSON.stringify(paySchedule({ token: 10000, tokenMode: 0, arrivalPct: 80, cabinPct: 10 }, 1000000))') === JSON.stringify({ token: 10000, arrival: 790000, final: 100000, cabin: 100000 }), 'with a cabin milestone the plan is token, arrival, cabin and final');
  assert(await ev('(s => s.token + s.arrival + s.cabin + s.final)(paySchedule({ token: 10000, tokenMode: 1, arrivalPct: 80, cabinPct: 10 }, 1000000))') === 1010000, 'a token "on top" is added to the price');
  const H = 'AIEC-P003';
  await page.evaluate(H => { S.projects[H].schedule.cabin = 50000; }, H);
  await act('SAFETY_CHECKED', H, { ev: await photos(4, 'safe') }, 'PSENIOR');
  assert(await ev(`sopNext(S.projects["${H}"])`) === 5 && (await act('SOP_STEP_DONE', H, { step: 5, ev: await photos(1) }, 'PSENIOR')).err === 'err_payment_gate', 'the cabin step waits for the cabin payment');
  assert((await tasks('PSENIOR', H)).includes('wait_cabin_pay'), 'the technician sees "waiting for the cabin payment"');
  assert((await act('PAYMENT_RECORDED', H, { purpose: 'cabin', amount: 49000, method: 'upi', ref: 'UPI1' }, 'PSALES')).err === 'err_amount', 'the cabin payment must match the plan');
  assert((await act('PAYMENT_RECORDED', H, { payId: 'PAY-CAB1', purpose: 'cabin', amount: 50000, method: 'upi', ref: 'UPI1' }, 'PSALES')).ok, 'Sales records the cabin payment');
  const payId = await ev(`S.projects["${H}"].payments.find(p => p.purpose === "cabin").id`);
  assert((await act('PAYMENT_STATUS', H, { payId, status: 'confirmed', ref: 'BANK-9' }, 'PFIN')).ok && (await act('SOP_STEP_DONE', H, { step: 5, ev: await photos(1) }, 'PSENIOR')).ok, 'once Finance confirms it, the cabin step can be done');

  /* receipt */
  await page.evaluate(([H, payId]) => { loginAs(S.users.PSALES); ACT.permsDone(); Notify.hide(); go('project', { pid: H, tab: 'money' }); }, [H, payId]); await page.waitForTimeout(200);
  await page.click(`[data-a="receipt"][data-v="${H}|${payId}"]`); await page.waitForTimeout(200);
  const rc = await page.innerText('main');
  assert(/Payment receipt/.test(rc) && /Dr\. Patil/.test(rc) && /50,000|50000/.test(rc) && await page.$('[data-a="print"]'), 'a confirmed payment has a printable receipt with the customer and amount');
  await page.evaluate(([H, payId]) => { loginAs(S.users.PSENIOR); go('receipt', { pid: H, pay: payId }); }, [H, payId]); await page.waitForTimeout(150);
  assert(!/Payment receipt/.test(await page.innerText('main')), 'a technician cannot open a receipt');

  /* refund after cancellation */
  const R = 'AIEC-P004'; /* material arrived, token paid */
  assert((await act('PROJECT_CANCELLED', R, { reason: 'Society meeting said no' }, 'POWNER')).ok && await ev(`refundRule(S.projects["${R}"])`) === 'dispatched', 'the order is cancelled after material was sent: the refund rule is "after dispatch"');
  assert((await tasks('PFIN', R)).includes('refund_calc'), 'Finance is asked to work out the refund');
  assert(await ev(`refundSuggest(S.projects["${R}"], { freight: 1500 })`) === 8500, 'the suggested refund is what was paid minus freight');
  assert((await act('REFUND_PROPOSED', R, { amount: 8000, deduct: { freight: 1500 } }, 'PFIN')).err === 'err_reason', 'a different amount needs a reason');
  assert((await act('REFUND_PROPOSED', R, { amount: 20000, deduct: {}, note: 'x' }, 'PFIN')).err === 'err_amount', 'never more than was paid');
  assert((await act('REFUND_PROPOSED', R, { amount: 8500, deduct: { freight: 1500 } }, 'PFIN')).ok && (await tasks('POWNER', R)).includes('refund_decide'), 'Finance proposes the refund; the Owner decides');
  assert((await act('REFUND_DECIDED', R, { ok: true }, 'PADMIN')).ok === false, 'only the Owner decides');
  assert((await act('REFUND_PAID', R, { ref: 'NEFT1' }, 'PFIN')).err === 'err_already', 'nothing is paid before the Owner agrees');
  assert((await act('REFUND_DECIDED', R, { ok: true }, 'POWNER')).ok && (await tasks('PFIN', R)).includes('refund_pay'), 'the Owner agrees; Finance pays');
  assert((await act('REFUND_PAID', R, { ref: '' }, 'PFIN')).err === 'err_ref', 'paying needs the bank reference');
  assert((await act('REFUND_PAID', R, { ref: 'NEFT-778' }, 'PFIN')).ok && await ev(`S.projects["${R}"].refund.status`) === 'paid', 'the refund is paid and recorded');
  const tf = await page.evaluate(() => { App.me = S.users.PADMIN; return JSON.stringify(exportPack('person', 'PTECH').events.filter(e => e.type.startsWith('REFUND'))); });
  assert(!/8500|NEFT-778/.test(tf), 'refund amounts are not in a technician\'s file');
  const rej = await page.evaluate(() => { S = rebuild(EVENTS.slice()); return S.rejected.map(x => x.ev.type + ':' + (x.ev.data.purpose || x.ev.data.payId || x.ev.data.step)); });
  /* the test put the cabin milestone straight into the plan, so only the cabin payment and the step after it are refused on rebuild */
  assert(rej.every(x => /^(PAYMENT_RECORDED:cabin|PAYMENT_STATUS:PAY-CAB1|SOP_STEP_DONE:5)$/.test(x)), 'everything else rebuilds with nothing refused: ' + rej.join(' '));

  /* screens in three languages */
  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of [['POWNER', 'project', { pid: R, tab: 'money' }], ['PSALES', 'receipt', { pid: H, pay: payId }], ['PFIELD', 'earn', { uid: 'PFIELD' }], ['POWNER', 'rules', {}]]) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  await page.evaluate(async () => { LANG = 'mr'; loginAs(S.users.PSALES); await wiz('optOut', 'AIEC-P008'); }); await page.waitForTimeout(100);
  await page.evaluate(async () => { loginAs(S.users.PFIELD); await wiz('lead'); W.ctx.safe = 'yes'; W.step = 4; render(); }); await page.waitForTimeout(150);
  await page.evaluate(async () => { const P = S.projects['AIEC-P005']; P.stage = 'lost'; P.lost = { reason: 'cancelled', note: 'x', t: nowISO(), from: 'material_order' }; P.refund = null; loginAs(S.users.PFIN); await wiz('refund', 'AIEC-P005'); }); await page.waitForTimeout(100);
  await page.evaluate(async () => { const P = S.projects['AIEC-P005']; P.refund = { status: 'proposed', amount: 0, deduct: {}, rule: 'ordered', by: 'PFIN' }; loginAs(S.users.POWNER); await wiz('refundDecide', 'AIEC-P005'); }); await page.waitForTimeout(100);
  await page.evaluate(async () => { S.projects['AIEC-P005'].refund.status = 'approved'; loginAs(S.users.PFIN); await wiz('refundPay', 'AIEC-P005'); }); await page.waitForTimeout(100);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('SALES2 PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
