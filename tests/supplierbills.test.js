/* Supplier bills: the supplier sends its invoice for a dispatched order, the office checks it (with a deduction for damaged parts),
   and Finance pays it only after the customer's own payment for the material is confirmed; a second person pays. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const tasks = uid => page.evaluate(uid => myTasks(S.users[uid]).map(n => n.k), uid);
  const H = 'AIEC-P004', day = await ev('safeDay()');
  const copy = await ev(`[{ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'invoice', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }]`);
  const inv = (iid, extra) => Object.assign({ iid, no: 'SUP/24/' + iid, amount: 500000, gst: 90000, date: day, ev: copy }, extra || {});

  /* sending */
  assert((await act('SUPPLIER_INVOICE', 'AIEC-P005', inv('I0'), 'PSUP')).err === 'err_stage', 'no bill before the order is dispatched');
  assert((await act('SUPPLIER_INVOICE', H, inv('I0'), 'PSALES')).ok === false, 'only the supplier sends a bill');
  assert((await act('SUPPLIER_INVOICE', H, inv('I0', { ev: [] }), 'PSUP')).err === 'err_invoice_copy', 'a photo of the bill is needed');
  assert((await act('SUPPLIER_INVOICE', H, inv('I0', { amount: 0 }), 'PSUP')).err === 'err_fill', 'the amount is needed');
  assert((await act('SUPPLIER_INVOICE', H, inv('I0', { date: '2999-01-01' }), 'PSUP')).err === 'err_fill', 'no future bill date');
  assert((await act('SUPPLIER_INVOICE', H, inv('I1'), 'PSUP')).ok, 'the supplier sends the bill');
  assert((await act('SUPPLIER_INVOICE', H, inv('I1'), 'PSUP')).err === 'err_dup_id', 'the same bill is not sent twice');
  assert((await tasks('PADMIN')).includes('approve_invoice'), 'the office is asked to check the bill');

  /* checking */
  assert((await act('SUP_INVOICE_DECIDED', H, { iid: 'I1', ok: true, deduct: 20000 }, 'PADMIN')).err === 'err_reason', 'a deduction needs a reason');
  assert((await act('SUP_INVOICE_DECIDED', H, { iid: 'I1', ok: true, deduct: 9e9, note: 'x' }, 'PADMIN')).err === 'err_amount', 'a deduction is not more than the bill');
  assert((await act('SUP_INVOICE_DECIDED', H, { iid: 'I1', ok: true, deduct: 20000, note: 'Damaged door panel' }, 'PADMIN')).ok, 'the office approves with a deduction');
  assert(await ev(`invPayable(S.projects["${H}"].invoices[0]) === 570000`), 'the amount to pay is bill + GST − deduction');
  assert((await act('SUP_INVOICE_DECIDED', H, { iid: 'I1', ok: true, deduct: 0 }, 'PADMIN')).err === 'err_already', 'decided once');

  /* paying waits for the customer's payment */
  assert(!(await tasks('PFIN')).includes('pay_invoice'), 'no payment task while the customer has not paid for the material');
  assert((await act('SUP_INVOICE_PAID', H, { iid: 'I1', ref: 'NEFT123' }, 'PFIN')).err === 'err_cust_not_cleared', 'paying before the customer\'s payment is refused');
  const amt = await ev(`S.projects["${H}"].schedule.arrival`);
  assert((await act('PAYMENT_RECORDED', H, { payId: 'PAY-T1', purpose: 'arrival', amount: amt, method: 'upi', ref: 'UPI99887766' }, 'PSALES')).ok && (await act('PAYMENT_STATUS', H, { payId: 'PAY-T1', status: 'confirmed', ref: 'BANK' }, 'PFIN')).ok, 'the customer\'s arrival payment is recorded and found in the bank');
  assert((await tasks('PFIN')).includes('pay_invoice'), 'now Finance is asked to pay the supplier');
  assert((await act('SUP_INVOICE_PAID', H, { iid: 'I1', ref: ' ' }, 'PFIN')).err === 'err_ref', 'a bank reference is needed');
  assert((await act('SUP_INVOICE_PAID', H, { iid: 'I1', ref: 'NEFT123' }, 'PFIN')).ok && await ev(`S.projects["${H}"].invoices[0].status === "paid"`), 'Finance pays the supplier');
  assert(!(await tasks('PFIN')).includes('pay_invoice') && !(await tasks('PADMIN')).includes('approve_invoice'), 'nothing left open');
  assert(await ev(`csvRows('payments').some(r => r[1] === 'I1' && r[3] === -570000 && r[5] === 'paid' && r[10] === 'NEFT123')`), 'the paid bill is in the payments spreadsheet as money out');

  /* a rejected bill can be sent again */
  assert((await act('SUPPLIER_INVOICE', 'AIEC-P003', inv('I2'), 'PSUP')).ok && (await act('SUP_INVOICE_DECIDED', 'AIEC-P003', { iid: 'I2', ok: false }, 'PADMIN')).err === 'err_reason', 'a rejection needs a reason');
  assert((await act('SUP_INVOICE_DECIDED', 'AIEC-P003', { iid: 'I2', ok: false, note: 'Wrong GST number' }, 'PADMIN')).ok, 'the office rejects a wrong bill');
  await page.evaluate(() => { loginAs(S.users.PSUP); ACT.permsDone(); Notify.hide(); go('supbills'); }); await page.waitForTimeout(150);
  const sb = await page.innerText('main');
  assert(/SUP\/24\/I1/.test(sb) && /SUP\/24\/I2/.test(sb) && await page.$('[data-a="wizOpen"][data-v="supInvoice|AIEC-P003"]'), 'the supplier sees its bills and can send a new one for the rejected bill');

  /* the wizard */
  await page.evaluate(async () => { await wiz('supInvoice', 'AIEC-P003'); }); await page.waitForTimeout(150);
  await page.fill('[data-k="no"]', 'SUP/24/9'); await page.fill('[data-k="amount"]', '400000'); await page.fill('[data-k="gst"]', '72000');
  await page.click('[data-a="wizNext"]'); await page.waitForTimeout(150);
  assert(await ev('!!W') && /photo|Photo/.test(await page.innerText('main')), 'the wizard asks for the photo of the bill');
  await page.evaluate(c => { W.ctx.ph = c; }, copy); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(400);
  assert(await ev(`S.projects["AIEC-P003"].invoices.some(x => x.no === "SUP/24/9" && x.status === "submitted")`), 'the bill is sent from the wizard');

  /* the office decides from the wizard */
  await page.evaluate(async () => { loginAs(S.users.PADMIN); const x = S.projects['AIEC-P003'].invoices.find(i => i.no === 'SUP/24/9'); await wiz('invDecide', 'AIEC-P003', { iid: x.id }); }); await page.waitForTimeout(150);
  await page.click('[data-a="pick"][data-k="ok"][data-v="yes"]'); await page.click('[data-a="wizNext"]'); await page.waitForTimeout(400);
  assert(await ev(`S.projects["AIEC-P003"].invoices.find(i => i.no === "SUP/24/9").status === "approved"`), 'approved from the wizard');
  assert((await tasks('PFIN')).includes('pay_invoice'), 'Finance is asked to pay (the customer paid for this job\'s material)');

  assert(await page.evaluate(() => { S = rebuild(EVENTS.slice()); return !S.rejected.length; }), 'everything rebuilds with nothing refused');
  for (const lang of ['en', 'hi', 'mr']) for (const [uid, name, p] of [['PSUP', 'supbills', {}], ['PADMIN', 'project', { pid: H }], ['PFIN', 'project', { pid: 'AIEC-P003' }], ['PSUP', 'project', { pid: H }]]) {
    await page.evaluate(([lang, uid, name, p]) => { LANG = lang; App.set.lang = lang; loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); go(name, p); }, [lang, uid, name, p]); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`sideways scroll on ${name} (${lang})`);
  }
  await page.evaluate(async () => { LANG = 'mr'; loginAs(S.users.PSUP); await wiz('supInvoice', 'AIEC-P003'); }); await page.waitForTimeout(100);
  await page.evaluate(async () => { loginAs(S.users.PFIN); const x = S.projects['AIEC-P003'].invoices.find(i => i.status === 'approved'); await wiz('invPay', 'AIEC-P003', { iid: x.id }); }); await page.waitForTimeout(100);
  await page.evaluate(async () => { loginAs(S.users.PADMIN); S.projects['AIEC-P003'].invoices.push({ id: 'X', no: 'n', amount: 1, gst: 0, date: safeDay(), ev: [], status: 'submitted', hist: [] }); await wiz('invDecide', 'AIEC-P003', { iid: 'X' }); W.ctx.ok = 'yes'; render(); }); await page.waitForTimeout(100);
  const m = await miss(page);
  assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('SUPPLIER BILLS PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
