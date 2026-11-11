/* Blueprint B5 — Marketplace jobs: Admin makes a job Marketplace, asks 2-3 eligible partners to quote in a standard
   format, the customer compares (listed by record, warned when scopes differ) and picks; the company confirms; the
   company records each customer payment and the customer or Finance confirms it; the commission is recorded once per
   confirmed payment, moves through the ledger, and a refund gives a credit note. The practice company has one such job. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(8000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  /* practice job */
  const M = await ev(`Object.values(S.projects).find(P => P.model === 'market').id`);
  assert(await ev(`(() => { const m = S.projects['${M}'].mkt; return m.rfq.to.length === 2 && Object.keys(m.quotes).length === 2; })()`), 'the practice company has a Marketplace job with two partner quotes');
  /* comparison */
  await page.evaluate(m => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('mktCompare', { uid: m }); }, M); await page.waitForTimeout(300);
  let txt = await page.innerText('main');
  assert(/Shree Lift Works/.test(txt) && /Om Elevator Services/.test(txt) && /Montanari/.test(txt) && /Electrical work/.test(txt), 'the comparison shows both companies side by side with scope');
  assert(/do not cover the same work/.test(txt), 'it warns when the scopes differ');
  assert(/not by price/.test(txt), 'it says the list is by record, not by price');
  const order = await page.$$eval('main .card h3', hs => hs.map(h => h.innerText));
  assert(/Shree/.test(order[0]), 'the cheaper quote is not put first just for price: ' + order.join(' | '));
  await page.evaluate(m => { loginAs(S.users.PPART2); ACT.permsDone(); Notify.hide(); go('mktCompare', { uid: m }); }, M); await page.waitForTimeout(250);
  txt = await page.innerText('main');
  assert(/Om Elevator/.test(txt) && !/Montanari/.test(txt), 'a partner sees only its own quote');
  /* a new job from the start */
  const N = await ev(`Object.values(S.projects).find(P => P.stage === 'new').id`);
  assert((await act('LEAD_ACCEPTED', N, {}, 'PSALES')).ok, '(a new lead is accepted by Sales)');
  assert(await page.evaluate(n => { loginAs(S.users.PADMIN); return /Make this a Marketplace job/.test(mktModelCard(S.projects[n])); }, N), 'an accepted lead offers Admin the Marketplace choice');
  assert((await act('RFQ_SENT', N, { to: ['PPART1', 'PPART2'] }, 'PADMIN')).err === 'err_access', 'an AIEC contract job cannot go to partners');
  assert((await act('MODEL_SET', N, { model: 'market' }, 'PSALES')).err, 'Sales cannot change the model');
  assert((await act('MODEL_SET', N, { model: 'market' }, 'PADMIN')).ok && await ev(`needs(S.projects['${N}']).some(n => n.k === 'mkt_send_rfq') && !needs(S.projects['${N}']).some(n => n.k === 'make_quote')`), 'Admin makes it Marketplace; the next step is asking partners, not an AIEC quote');
  assert((await act('RFQ_SENT', N, { to: ['PPART1'] }, 'PADMIN')).err === 'err_mkt_23', 'at least 2 companies');
  await act('PARTNER_STATUS_SET', null, { uid: 'PPART2', status: 'SUSPENDED', reason: 'Insurance papers missing' }, 'PADMIN');
  assert((await act('RFQ_SENT', N, { to: ['PPART1', 'PPART2'] }, 'PADMIN')).err === 'why_pstatus', 'a suspended company cannot be asked');
  await act('PARTNER_STATUS_SET', null, { uid: 'PPART2', status: 'ACTIVE', reason: 'Papers received' }, 'PADMIN');
  assert((await act('RFQ_SENT', N, { to: ['PPART1', 'PPART2'] }, 'PADMIN')).ok, 'the RFQ goes to two eligible companies');
  assert(await ev(`canSee(S.users.PPART2, S.projects['${N}']) && myTasks(S.users.PPART2).some(n => n.k === 'mkt_quote' && n.pid === '${N}')`), 'invited companies see the job and are asked to quote');
  const Q = { base: 900000, tax: 162000, freight: 20000, install: 70000, oem: 'Make X', civil: 'excl', elec: 'incl', excl: 'civil', days: 40, ms: [10, 30, 30, 25, 5], warranty: 12, amc: 18000, valid: 30 };
  assert((await act('PQUOTE_SENT', N, Object.assign({}, Q, { ms: [10, 30, 30, 25, 10] }), 'PPART1')).err === 'err_mkt_100', 'payment parts must add up to 100%');
  assert((await act('PQUOTE_SENT', N, Q, 'PTECH')).err, 'only an invited company can quote');
  assert((await act('PQUOTE_SENT', N, Q, 'PPART1')).ok && (await act('PQUOTE_SENT', N, Object.assign({}, Q, { base: 880000, elec: 'incl' }), 'PPART2')).ok, 'both companies quote');
  /* pick, decline, pick again, accept */
  assert((await act('MK_PICKED', N, { partner: 'PPART2' }, 'PSALES')).ok, 'the pick is recorded (Sales on the customer\'s word)');
  assert((await act('MK_ANSWER', N, { yes: false, note: '' }, 'PPART2')).err === 'err_reason', 'a decline needs a reason');
  assert((await act('MK_ANSWER', N, { yes: false, note: 'Team busy until March' }, 'PPART2')).ok && await ev(`!S.projects['${N}'].mkt.pick`), 'the company declines; the customer can pick again');
  assert((await act('MK_PICKED', N, { partner: 'PPART1' }, 'PSALES')).ok && (await act('MK_ANSWER', N, { yes: true }, 'PPART1')).ok, 'the second pick is confirmed');
  assert(await ev(`(() => { const P = S.projects['${N}']; return P.partner === 'PPART1' && P.stage === 'won' && P.mkt.terms.total === 1152000; })()`), 'the job is won by that company at its quoted terms');
  for (const u of ['PSALES', 'PPART1', 'PFIN', 'PADMIN', 'POWNER']) { await page.evaluate(([u, n]) => { loginAs(S.users[u]); ACT.permsDone(); Notify.hide(); ACT.nav('home'); if (canSee(S.users[u], S.projects[n])) go('project', { pid: n }); }, [u, N]); await page.waitForTimeout(150); }
  assert(await ev(`App.route.name === 'project'`), 'the won Marketplace job opens for the office and the company (no AIEC quote needed)');
  /* payments and commission */
  const pay = (id, ms, amount) => act('MK_PAY_RECORDED', N, { payId: id, ms, amount, utr: 'UTR' + id }, 'PPART1');
  assert((await pay('MPAAAA0001', 0, 115200)).ok, 'the company records the 10% booking payment with a UTR');
  assert((await pay('MPAAAA0002', 0, 115200)).err === 'err_already', 'not twice for the same part while waiting');
  assert(await ev(`commTotals().PENDING === 2304`), 'the commission is pending until the payment is confirmed (2% = ₹2,304)');
  assert((await act('MK_PAY_VERIFIED', N, { payId: 'MPAAAA0001', ok: true }, 'PPART1')).err, 'the company cannot confirm its own payment');
  assert((await act('MK_PAY_VERIFIED', N, { payId: 'MPAAAA0001', ok: true }, 'PFIN')).ok, 'Finance confirms it');
  assert(await ev(`(() => { const c = S.comm.CMPAAAA0001; return c && c.amt === 2304 && c.status === 'VERIFIED' && Object.keys(S.comm).length === 1; })()`), 'the commission is recorded once, in whole rupees');
  assert((await act('MK_PAY_VERIFIED', N, { payId: 'MPAAAA0001', ok: true }, 'PFIN')).err === 'err_already', 'a repeat cannot double it');
  assert((await act('COMM_STATUS', null, { cid: 'CMPAAAA0001', status: 'PAID' }, 'PFIN')).err === 'err_choose', 'it cannot jump to Paid without being invoiced');
  for (const s of ['INVOICED', 'DUE', 'PAID']) assert((await act('COMM_STATUS', null, { cid: 'CMPAAAA0001', status: s, ref: 'INV-' + s }, 'PFIN')).ok, 'ledger: ' + s);
  assert((await act('COMM_CREDIT', null, { cid: 'CNAAAA0001', of: 'CMPAAAA0001', amount: 200000, note: 'x' }, 'PFIN')).err === 'err_amount', 'a credit note cannot exceed the payment');
  assert((await act('COMM_CREDIT', null, { cid: 'CNAAAA0001', of: 'CMPAAAA0001', amount: 15200, note: 'Partner refunded part of booking' }, 'PFIN')).ok && await ev(`S.comm.CNAAAA0001.amt === -304`), 'a refund gives a credit note that reduces the commission');
  /* finish */
  const rest = [[1, 345600], [2, 345600], [3, 288000], [4, 57600]];
  for (const [i, amt] of rest) { const id = 'MPAAAA001' + i; await pay(id, i, amt); await act('MK_PAY_VERIFIED', N, { payId: id, ok: true }, 'PFIN'); }
  assert(await ev(`mktAllPaid(S.projects['${N}']) && myTasks(S.users.PPART1).some(n => n.k === 'mkt_handover' && n.pid === '${N}')`), 'when every part is confirmed the company is asked to hand over');
  assert((await act('MK_DONE', N, { note: 'Lift working, licence papers given' }, 'PPART1')).ok && await ev(`S.projects['${N}'].stage === 'amc' && !!S.projects['${N}'].lift.code`), 'handover puts the lift into service (AMC) with its QR code');
  assert(await ev(`(() => { const S2 = rebuild(EVENTS); return S2.projects['${N}'].stage === 'amc' && Object.keys(S2.comm).length === Object.keys(S.comm).length && S2.comm.CMPAAAA0001.status === 'PAID'; })()`), 'all of it survives a rebuild');
  /* ledger screen and KPI */
  await page.evaluate(() => { loginAs(S.users.PFIN); ACT.permsDone(); Notify.hide(); go('commLedger'); }); await page.waitForTimeout(250);
  txt = await page.innerText('main');
  assert(await ev(`App.route.name === 'commLedger'`) && /Credit note/.test(txt) && /Never marked paid without proof/.test(txt) && /Pending/.test(txt), 'Finance sees the ledger with totals by status and the credit note');
  assert(await ev(`(() => { const g = kpiData(7).find(x => x[0] === 'market'); return g && /\\d/.test(g[1][1][1]); })()`), 'the KPI board shows Marketplace numbers');
  /* project page */
  await page.evaluate(m => { loginAs(S.users.PADMIN); ACT.permsDone(); Notify.hide(); go('project', { pid: m, tab: 'info' }); }, M); await page.waitForTimeout(300);
  assert(/Marketplace job/.test(await page.innerText('main')) && !!(await page.$('[data-v^="mktCompare|"]')), 'the job page shows the Marketplace card with Compare');
  const mm = await miss(page); assert(!mm.length, 'no missing words' + (mm.length ? ': ' + mm.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy|leaflet/i.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('BP5 MARKET PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
