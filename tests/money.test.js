/* Money and store control (role-wise specs): store / van / site stock that never goes below zero, with a low-stock
   task and a sent-used-returned match per site; site expenses need a receipt and a second person's approval and feed a
   cost sheet whose bottom line is "gross contribution", not profit; suppliers are compared with a reason; money owed is
   shown by age; a goods receipt note; a 10-year cost in the quotation; a receipts-and-payments file for the accountant. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(6000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const receipt = () => ev(`[{ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'receipt', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }]`);
  const J = await ev(`Object.values(S.projects).find(P => P.stage === 'installing').id`), tech = await ev(`S.projects["${J}"].tech`);

  /* stock */
  assert((await act('STOCK_ITEM_SET', null, { sku: 'rail', name: 'T89 rail', unit: 'pcs', reorder: 10 }, 'PADMIN')).err === 'err_sku', 'item codes are capital letters and numbers');
  assert((await act('STOCK_ITEM_SET', null, { sku: 'RAIL-T89', name: 'T89 guide rail', unit: 'pcs', reorder: 10 }, 'PADMIN')).ok, 'the office adds a stock item with a reorder level');
  const mv = (from, to, qty, as, note) => act('STOCK_MOVED', null, { sku: 'RAIL-T89', qty, from, to, note }, as);
  assert((await mv('supplier', 'store', 8, 'PADMIN')).ok && (await mv('store', 'van:' + tech, 3, 'PADMIN')).ok, 'bought into the store, then put in the technician\'s van');
  assert((await mv('store', 'van:' + tech, 100, 'PADMIN')).err === 'err_stock_short', 'stock never goes below zero');
  assert((await mv('supplier', 'van:' + tech, 1, tech)).err === 'err_access', 'a technician cannot book stock in from a supplier');
  assert((await mv('van:' + tech, 'site:' + J, 2, tech)).ok && (await mv('site:' + J, 'used', 1, tech)).ok && (await mv('site:' + J, 'store', 1, tech)).ok, 'the technician moves stock from the van to the site, uses one and returns one');
  assert(await ev(`stockQty('store', 'RAIL-T89') === 6 && stockQty('van:${tech}', 'RAIL-T89') === 1 && stockQty('site:${J}', 'RAIL-T89') === 0`), 'store, van and site balances add up');
  assert(await ev(`myTasks(S.users.PADMIN).some(n => n.k === 'stock_low')`), 'below the reorder level the office gets "stock below reorder level"');
  await page.evaluate(J => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('project', { pid: J, tab: 'info' }); }, J); await page.waitForTimeout(300);
  let txt = await page.innerText('main');
  assert(/Stock at this site/.test(txt) && /Sent/.test(txt) && /Used/.test(txt), 'the job shows sent, used, returned and left over');
  await page.evaluate(() => go('stock')); await page.waitForTimeout(200);
  assert(/T89 guide rail/.test(await page.innerText('main')), 'the stock screen lists items with store and van balances');

  /* expenses */
  assert((await act('EXPENSE_ADDED', J, { xid: 'X-AAA1', cat: 'transport', amount: 1800, note: 'Tempo for rails', ev: [] }, tech)).err === 'err_receipt', 'an expense needs a photo of the receipt');
  assert((await act('EXPENSE_ADDED', J, { xid: 'X-AAA1', cat: 'transport', amount: 1800, note: 'Tempo for rails', ev: await receipt() }, tech)).ok, 'the technician adds a site expense with its receipt');
  assert(await ev(`needs(S.projects["${J}"]).some(n => n.k === 'decide_expense' && n.xid === 'X-AAA1')`), 'someone in the office is asked to approve it');
  assert((await act('EXPENSE_ADDED', J, { xid: 'X-AAA2', cat: 'stay', amount: 900, note: 'Lodge', ev: await receipt() }, 'PADMIN')).ok && (await act('EXPENSE_DECIDED', J, { xid: 'X-AAA2', ok: true }, 'PADMIN')).err === 'err_same_person', 'nobody approves their own expense while someone else can');
  const fin = await ev(`(Object.values(S.users).find(u => u.role === 'finance' && u.active) || S.users.POWNER).uid`);
  assert((await act('EXPENSE_DECIDED', J, { xid: 'X-AAA1', ok: false }, fin)).err === 'err_reason', 'a refusal needs a reason');
  assert((await act('EXPENSE_DECIDED', J, { xid: 'X-AAA1', ok: true }, fin)).ok, 'approved');
  const pc = await ev(`profitCard(S.projects["${J}"])`);
  assert(/Gross contribution/.test(pc) && /not profit/.test(pc) && /Site expenses \(approved\)/.test(pc), 'the cost sheet counts approved expenses and calls the result gross contribution, not profit');

  /* suppliers compared */
  const sups = await ev(`Object.values(S.users).filter(u => u.role === 'supplier' && u.active).map(u => u.uid)`);
  const SO = await ev(`(P => { P.stage = 'site_ok'; return P.id; })(Object.values(S.projects).find(P => P.stage === 'qc_site' || P.stage === 'site_ok'))`);
  assert((await act('SUP_COMPARED', SO, { rows: [{ uid: sups[0], amount: 500000, days: 20 }], pick: sups[0], reason: 'x' }, 'PADMIN')).err === 'err_two_suppliers', 'at least two suppliers are compared');
  if (sups.length >= 2) {
    assert((await act('SUP_COMPARED', SO, { rows: [{ uid: sups[0], amount: 500000, days: 20 }, { uid: sups[1], amount: 480000, days: 35 }], pick: sups[0] }, 'PADMIN')).err === 'err_reason', 'the choice needs a reason');
    assert((await act('SUP_COMPARED', SO, { rows: [{ uid: sups[0], amount: 500000, days: 20 }, { uid: sups[1], amount: 480000, days: 35 }], pick: sups[0], reason: 'Faster delivery for the builder date' }, 'PADMIN')).ok, 'the comparison and the reason are kept');
  }

  /* money owed by age */
  await page.evaluate(() => go('ageing')); await page.waitForTimeout(200);
  txt = await page.innerText('#app');
  assert(/Money owed to us/.test(txt) && /0–30 days/.test(txt) && /over 90 days/.test(txt), 'money owed is shown in 0–30 / 31–60 / 61–90 / over 90 days');
  assert(await ev(`ageRows().every(x => x.days >= 0 && x.amt > 0)`), 'each row has its age and amount');

  /* goods receipt note */
  await page.evaluate(J => go('doc', { pid: J, kind: 'grn' }), J); await page.waitForTimeout(200);
  txt = await page.innerText('main');
  assert(/Goods receipt note/.test(await page.innerText('#app')) && /Delivery challan/.test(txt) && /Received on site/.test(txt), 'a goods receipt note is made from the dispatch and the handover on site');

  /* 10-year cost */
  assert((await act('CONFIG_SET', null, { key: 'amcYearly', value: 12000 }, 'POWNER')).ok && (await act('CONFIG_SET', null, { key: 'powerYearly', value: 5000 }, 'POWNER')).ok, 'the Owner sets the yearly AMC and electricity');
  const Q = await ev(`Object.values(S.projects).find(P => P.quotes.length).id`);
  const dq = await ev(`docQuote(S.projects["${Q}"])`);
  assert(/10 years of owning this lift/.test(dq) && dq.includes(await ev('money(9 * 12000)')), 'the quotation shows the 10-year cost of owning the lift');

  /* accountant file */
  const rows = await ev(`csvRows('tally')`);
  assert(rows[0].join(',') === 'Date,Voucher type,Ledger,Amount,Reference,Narration' && rows.some(r => r[1] === 'Receipt') && rows.some(r => r[1] === 'Payment' && /Site expenses/.test(r[2])), 'receipts and payments export in a Tally / Zoho import layout');
  assert((await act('DATA_EXPORTED', null, { kind: 'tally', rows: rows.length - 1 }, 'POWNER')).ok, 'the export is logged');

  for (const lang of ['hi', 'mr']) { await page.evaluate(l => { LANG = l; App.set.lang = l; loginAs(S.users.PADMIN); go('stock'); }, lang); await page.waitForTimeout(150); await page.evaluate(() => go('ageing')); await page.waitForTimeout(100); if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('sideways scroll ' + lang); }
  const m = await miss(page); assert(!m.length, 'no missing words' + (m.length ? ': ' + m.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy/.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('MONEY PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
