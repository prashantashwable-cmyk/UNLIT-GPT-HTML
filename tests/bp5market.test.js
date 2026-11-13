/* Blueprint B5 — Marketplace jobs, tapped through the screens: Admin makes a job Marketplace and asks 2-3 eligible
   companies; the customer compares (by record, not price) and picks; a declined company cannot be picked; the office can
   hold a pick; AIEC-contract steps are not offered on the job; the customer's contact reaches the chosen company only by
   a consent step; a payment part is done only when confirmed payments cover it, either side records and the other side
   or Finance confirms; commission once per confirmed payment; one AIEC inspection and the working licence before
   handover; a job nobody takes goes back to an AIEC contract. */
const { launch, miss } = require('./lib');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
(async () => {
  const { browser, page, errors } = await launch();
  await page.evaluate(() => { App.set.lang = 'en'; LANG = 'en'; App.set.introDone = true; App.set.guide = false; enterPractice(); }); await page.waitForTimeout(8000);
  const ev = f => page.evaluate(new Function('return (' + f + ')'));
  const act = (type, pid, data, as) => page.evaluate(([type, pid, data, as]) => perform(type, pid, data, { as, quiet: true }).then(r => ({ ok: r.ok, err: r.err && (r.err.k || r.err) })), [type, pid, data, as]);
  const as = async uid => { await page.evaluate(uid => { loginAs(S.users[uid]); ACT.permsDone(); Notify.hide(); W = null; App.form = {}; ACT.nav('home'); }, uid); await page.waitForTimeout(200); };
  const task = async (uid, k, pid) => { await as(uid); const ok = await page.evaluate(([uid, k, pid]) => { const n = myTasks(S.users[uid]).find(n => n.k === k && n.pid === pid); if (!n) return false; openTask(n); return true; }, [uid, k, pid]); await page.waitForTimeout(350); return ok; };
  const fill = async (k, v) => { await page.fill(`main [data-k="${k}"]`, String(v)); await page.waitForTimeout(60); };
  const pick = async (k, v) => { await page.click(`main .tile[data-a="pick"][data-k="${k}"][data-v="${v}"]`); await page.waitForTimeout(120); };
  const save = async () => { await page.click('[data-a="wizNext"]'); await page.waitForTimeout(450); };
  const photos = n => ev(`Array.from({ length: ${n} }, () => ({ id: 'E' + rid(10), m: 'x', kind: 'photo', label: 'work', t: nowISO(), gps: null, hash: 'h' + rid(8), dev: 'practice', q: {} }))`);
  const tasksOf = (uid, pid) => page.evaluate(([uid, pid]) => myTasks(S.users[uid]).filter(n => n.pid === pid).map(n => n.k), [uid, pid]);

  /* the practice job: compare */
  const M = await ev(`Object.values(S.projects).find(P => P.model === 'market').id`);
  assert(await ev(`(() => { const m = S.projects['${M}'].mkt; return m.rfq.to.length === 2 && Object.keys(m.quotes).length === 2; })()`), 'the practice company has a Marketplace job with two partner quotes');
  await as('PADMIN'); await page.evaluate(m => go('mktCompare', { uid: m }), M); await page.waitForTimeout(300);
  let txt = await page.innerText('main');
  assert(/Shree Lift Works/.test(txt) && /Om Elevator Services/.test(txt) && /Montanari/.test(txt) && /do not cover the same work/.test(txt) && /not by price/.test(txt), 'the comparison shows both companies, warns when scopes differ, and is listed by record');
  await as('PPART2'); await page.evaluate(m => go('mktCompare', { uid: m }), M); await page.waitForTimeout(250);
  assert(/Om Elevator/.test(await page.innerText('main')) && !/Montanari/.test(await page.innerText('main')), 'a company sees only its own quote');

  /* a new job, through the screens */
  const N = await ev(`Object.values(S.projects).find(P => P.stage === 'new').id`);
  assert((await act('LEAD_ACCEPTED', N, {}, 'PSALES')).ok, '(a new lead is accepted by Sales)');
  await as('PADMIN'); await page.evaluate(n => go('project', { pid: n, tab: 'info' }), N); await page.waitForTimeout(300);
  await page.click('main [data-v^="mktModel|"]'); await page.waitForTimeout(300); await pick('ok', 'market'); await save();
  assert(await ev(`S.projects['${N}'].model === 'market'`) && (await tasksOf('PADMIN', N)).includes('mkt_send_rfq') && !(await tasksOf('PSALES', N)).includes('make_quote'), 'Admin makes it a Marketplace job on the job page; the next step is asking companies, not an AIEC quote');
  assert((await act('RFQ_SENT', N, { to: ['PPART1'] }, 'PADMIN')).err === 'err_mkt_23', 'at least 2 companies');
  await act('PARTNER_STATUS_SET', null, { uid: 'PPART2', status: 'SUSPENDED', reason: 'Insurance papers missing' }, 'PADMIN');
  assert((await act('RFQ_SENT', N, { to: ['PPART1', 'PPART2'] }, 'PADMIN')).err === 'why_pstatus', 'a suspended company cannot be asked');
  await act('PARTNER_STATUS_SET', null, { uid: 'PPART2', status: 'ACTIVE', reason: 'Papers received' }, 'PADMIN');
  assert(await task('PADMIN', 'mkt_send_rfq', N), 'the office task opens the request wizard');
  await page.click('main .tile[data-k="sel.PPART1"]'); await page.waitForTimeout(100); await page.click('main .tile[data-k="sel.PPART2"]'); await page.waitForTimeout(100); await save();
  assert(await ev(`S.projects['${N}'].mkt.rfq.to.length === 2`) && (await tasksOf('PPART2', N)).includes('mkt_quote'), 'the request goes to two companies, who are asked to quote');
  /* a company quotes through its wizard */
  assert(await task('PPART1', 'mkt_quote', N), 'the company opens its quotation form');
  await fill('base', 900000); await fill('tax', 162000); await fill('freight', 20000); await fill('install', 70000); await save();
  await fill('oem', 'Make X machine'); await pick('civil', 'excl'); await pick('elec', 'incl'); await save();
  await fill('days', 40); await fill('m4', 10); await save();
  assert(/add up to 100%/.test(await page.innerText('main')), 'payment parts must add up to 100%');
  await fill('m4', 5); await save();
  assert(await ev(`mktQuoteTotal(S.projects['${N}'].mkt.quotes.PPART1) === 1152000`), 'the quotation is saved in the standard format');
  const Q = { base: 880000, tax: 158400, freight: 20000, install: 70000, oem: 'Make Y', civil: 'excl', elec: 'incl', excl: 'civil', days: 45, ms: [10, 30, 30, 25, 5], warranty: 12, amc: 18000, valid: 30 };
  assert((await act('PQUOTE_SENT', N, Q, 'PTECH')).err && (await act('PQUOTE_SENT', N, Q, 'PPART2')).ok, 'only an invited company can quote');
  /* pick, decline, no re-pick, hold */
  assert((await act('MK_PICKED', N, { partner: 'PPART2' }, 'PSALES')).ok, 'the pick is recorded (Sales on the customer\'s word)');
  assert(await task('PPART2', 'mkt_confirm', N), 'the picked company is asked to confirm');
  await pick('yes', 'no'); await save();
  assert(/reason/i.test(await page.innerText('main')), 'a decline needs a reason');
  await fill('note', 'Team busy until March'); await save();
  assert(await ev(`!S.projects['${N}'].mkt.pick && S.projects['${N}'].mkt.declined.includes('PPART2')`), 'the company declines; the customer can pick again');
  assert((await act('MK_PICKED', N, { partner: 'PPART2' }, 'PSALES')).err === 'err_mkt_declined', 'a company that declined cannot be picked again');
  await as('PSALES'); await page.evaluate(n => go('mktCompare', { uid: n }), N); await page.waitForTimeout(250);
  assert(/This company declined/.test(await page.innerText('main')) && (await page.$$('main [data-a="mktPick"]')).length === 1, 'the comparison marks the decline and offers only the other company');
  await page.click('main [data-a="mktPick"]'); await page.waitForTimeout(200); await page.click('[data-a="mktPickGo"]'); await page.waitForTimeout(350);
  assert(await ev(`S.projects['${N}'].mkt.pick.partner === 'PPART1'`), 'the other company is picked on the comparison screen');
  await as('PADMIN'); await page.evaluate(n => go('project', { pid: n, tab: 'info' }), N); await page.waitForTimeout(300);
  await page.click('main [data-v^="mktHold|"]'); await page.waitForTimeout(300); await fill('reason', 'Customer wants to visit a reference site first'); await pick('drop', 'no'); await save();
  assert(await ev(`!S.projects['${N}'].mkt.pick && !S.projects['${N}'].mkt.declined.includes('PPART1')`), 'Admin holds the pick with a reason (the button is on the job page)');
  assert((await act('MK_PICKED', N, { partner: 'PPART1' }, 'PSALES')).ok, 'picked again');
  await act('PARTNER_STATUS_SET', null, { uid: 'PPART1', status: 'SUSPENDED', reason: 'Licence copy under question' }, 'PADMIN');
  assert((await tasksOf('PADMIN', N)).includes('mkt_hold'), 'if the picked company can no longer take jobs, the office is told to hold the pick');
  await act('PARTNER_STATUS_SET', null, { uid: 'PPART1', status: 'ACTIVE', reason: 'Licence copy checked' }, 'PADMIN');
  assert(!(await tasksOf('PADMIN', N)).includes('mkt_hold') && (await act('MK_ANSWER', N, { yes: true }, 'PPART1')).ok, 'cleared; the company confirms the job');
  assert(await ev(`(() => { const P = S.projects['${N}']; return P.partner === 'PPART1' && P.stage === 'won' && P.mkt.terms.total === 1152000 && !canSee(S.users.PPART2, P); })()`), 'the job is won at the quoted terms; the other company no longer sees it');
  /* AIEC-contract steps are not part of this job */
  assert(await page.evaluate(n => { loginAs(S.users.PSALES); const P = S.projects[n]; return !allowed('AGREEMENT_PREPARED', P) && !allowed('PAYMENT_RECORDED', P) && !allowed('QUOTE_CREATED', P); }, N) && (await act('AGREEMENT_PREPARED', N, {}, 'PSALES')).err === 'err_access', 'AIEC agreement, AIEC payments and AIEC quotes are not offered or accepted on a Marketplace job');
  /* the customer's contact */
  assert(await page.evaluate(n => { App.me = S.users.PADMIN; const p = exportPack('person', 'PPART1'); return !JSON.stringify(p.events.filter(e => e.pid === n)).includes(S.projects[n].contact.phone); }, N), 'the winning company\'s file has no customer phone before the contact is shared');
  assert(await task('PSALES', 'mkt_introduce', N), 'Sales is asked to share the customer\'s contact');
  await save(); assert(/tapping the box/.test(await page.innerText('main')), 'sharing needs the consent tick');
  await pick('consent', 'yes'); await save();
  assert(await ev(`S.projects['${N}'].mkt.contact.phone === S.projects['${N}'].contact.phone`), 'the contact is shared with consent, as its own record');
  await as('PPART1'); await page.evaluate(n => go('project', { pid: n, tab: 'info' }), N); await page.waitForTimeout(300);
  assert(new RegExp(await ev(`S.projects['${N}'].contact.phone`)).test(await page.innerText('main')), 'the company now sees the customer\'s phone on the job');
  /* payments: a part is done when covered */
  assert(await task('PPART1', 'mkt_record_pay', N), 'the company opens "record payment" from its task');
  assert(await page.inputValue('main [data-k="amount"]') === '115200', 'the form starts with what is left for the part');
  await fill('amount', 1); await fill('utr', 'UTR0001'); await save();
  assert(await ev(`S.projects['${N}'].mkt.pays.length === 1 && S.projects['${N}'].mkt.pays[0].amount === 1`), 'a payment is recorded through the form');
  assert((await act('MK_PAY_RECORDED', N, { payId: 'MPAAAA0002', ms: 0, amount: 115199, utr: 'UTR0002' }, 'PPART1')).err === 'err_mkt_pay_wait', 'one payment per part waits at a time');
  assert((await act('MK_PAY_VERIFIED', N, { payId: await ev(`S.projects['${N}'].mkt.pays[0].id`), ok: true }, 'PPART1')).err === 'err_self_verify', 'the company cannot confirm its own entry');
  assert(await task('PFIN', 'mkt_verify_pay', N), 'Finance opens the confirmation from its task');
  await pick('ok', 'yes'); await save();
  assert(await ev(`(() => { const P = S.projects['${N}']; return P.mkt.pays[0].status === 'verified' && !mktMsDone(P, 0) && mktMsLeft(P, 0) === 115199 && Object.values(S.comm).length === 1 && Object.values(S.comm)[0].amt === 0; })()`), 'a ₹1 payment does not finish the 10% part: ₹1,15,199 is still to pay');
  assert((await act('MK_PAY_RECORDED', N, { payId: 'MPAAAA0003', ms: 0, amount: 200000, utr: 'UTR0003' }, 'PPART1')).err === 'err_mkt_amount', 'more than what is left for the part is refused');
  /* the customer records the rest; the company confirms */
  const salt = await ev(`S.users.PCUST.salt`), pin = await ev(`S.users.PCUST.pin`);
  assert((await act('USER_ADDED', null, { uid: 'MCUST', name: 'Mr. Pawar', role: 'customer', projectId: N, salt, pin }, 'PADMIN')).ok, '(the customer gets a login)');
  await as('MCUST'); txt = await page.innerText('main');
  assert(/Marketplace job/.test(txt) && /Booking/.test(txt) && !/Job \d+% done/.test(txt), 'the customer\'s home shows the Marketplace card, not the AIEC stage tracker');
  await page.click('main [data-v^="mktPay|"]'); await page.waitForTimeout(300); await fill('utr', 'CUSTUTR77'); await save();
  assert(await ev(`(() => { const p = S.projects['${N}'].mkt.pays[1]; return p && p.by === 'MCUST' && p.amount === 115199 && p.status === 'pending'; })()`), 'the customer records the payment they made');
  assert((await act('MK_PAY_VERIFIED', N, { payId: await ev(`S.projects['${N}'].mkt.pays[1].id`), ok: true }, 'MCUST')).err === 'err_self_verify' && (await tasksOf('PPART1', N)).includes('mkt_verify_pay'), 'the customer cannot confirm their own entry; the company is asked');
  assert((await act('MK_PAY_VERIFIED', N, { payId: await ev(`S.projects['${N}'].mkt.pays[1].id`), ok: true }, 'PPART1')).ok && await ev(`mktMsDone(S.projects['${N}'], 0) && sum(Object.values(S.comm).map(c => c.amt)) === 2304`), 'the company confirms; the part is done and the commission is 2% of what was paid (₹2,304)');
  const C1 = await ev(`Object.values(S.comm).find(c => c.amt === 2304).id`);
  assert((await act('COMM_STATUS', null, { cid: C1, status: 'PAID' }, 'PFIN')).err === 'err_choose', 'the ledger cannot jump to Paid');
  await as('PFIN'); await page.evaluate(() => go('commLedger')); await page.waitForTimeout(250);
  assert(/Bill sent/.test(await page.innerText('main')), 'the ledger says "Bill sent", not "Invoiced"');
  await page.click(`main [data-v="cmlStatus||cid|${C1}"]`); await page.waitForTimeout(300); await pick('status', 'INVOICED'); await fill('ref', 'BILL-1'); await save();
  assert(await ev(`S.comm['${C1}'].status === 'INVOICED'`), 'Finance moves it through the ledger screen');
  for (const s of ['DUE', 'PAID']) assert((await act('COMM_STATUS', null, { cid: C1, status: s, ref: 'R-' + s }, 'PFIN')).ok, 'ledger: ' + s);
  assert((await act('COMM_CREDIT', null, { cid: 'CNAAAA0001', of: C1, amount: 15199, note: 'Company refunded part of booking' }, 'PFIN')).ok && await ev(`S.comm.CNAAAA0001.amt === -304`), 'a refund gives a credit note');
  /* the other parts */
  for (const [i, amt] of [[1, 345600], [2, 345600], [3, 288000], [4, 57600]]) { const id = 'MPAAAA001' + i; assert((await act('MK_PAY_RECORDED', N, { payId: id, ms: i, amount: amt, utr: 'UTRX' + i }, 'PPART1')).ok && (await act('MK_PAY_VERIFIED', N, { payId: id, ok: true }, 'PFIN')).ok, 'part ' + (i + 1) + ' paid and confirmed'); }
  /* inspection and licence before handover */
  assert((await act('MK_DONE', N, { note: 'done' }, 'PPART1')).err === 'err_mkt_insp', 'no handover before the AIEC inspection');
  assert(await task('PPART1', 'mkt_ready', N), 'the company is asked to say when the lift is ready');
  await fill('note', 'Installation and tests finished'); await save();
  assert(await ev(`!!S.projects['${N}'].mkt.ready`) && (await tasksOf('PQC', N)).includes('mkt_inspect'), 'AIEC\'s QC is asked to inspect');
  assert(await task('PQC', 'mkt_inspect', N) && /Photos of the lift and machine room/.test(await page.innerText('main')), 'the inspection form opens with its photo step');
  assert((await act('MK_INSPECTED', N, { outcome: 'fail', points: '', ev: await photos(2) }, 'PQC')).err === 'err_reason' && (await act('MK_INSPECTED', N, { outcome: 'pass', ev: await photos(1) }, 'PQC')).err === 'err_photos', 'a fail needs its points; every inspection needs 2 photos');
  assert((await act('MK_INSPECTED', N, { outcome: 'fail', points: 'Landing door lock on 2nd floor loose', ev: await photos(2) }, 'PQC')).ok && (await tasksOf('PPART1', N)).includes('mkt_fix'), 'a failed inspection gives the company its points to fix');
  assert((await act('MK_READY', N, { note: 'Door lock fixed' }, 'PPART1')).ok && (await act('MK_INSPECTED', N, { outcome: 'pass', ev: await photos(2) }, 'PQC')).ok, 'fixed, inspected again, passed');
  assert((await act('MK_DONE', N, { note: 'done' }, 'PPART1')).err === 'err_lift_licence' && (await tasksOf('PADMIN', N)).includes('record_licence'), 'no handover without the working licence; the office is asked to record it');
  assert((await act('STATUTORY_SET', N, { item: 'inspection', date: await ev('todayStr()'), result: 'pass', note: 'Lift Inspector, Pune' }, 'PADMIN')).ok && (await act('STATUTORY_SET', N, { item: 'licence', no: 'PUNE/LIFT/M1/2026', holder: 'Shree Lift Works', expiry: await ev('addDays(365)') }, 'PADMIN')).ok, 'the office records the government inspection and the working licence');
  assert(await task('PPART1', 'mkt_handover', N), 'the company is asked to hand over');
  await fill('note', 'Lift working, papers given'); await save();
  assert(await ev(`S.projects['${N}'].stage === 'amc' && !!S.projects['${N}'].lift.code`), 'handover puts the lift into service (AMC) with its QR code');
  assert(await ev(`companyJobs('PPART1').some(P => P.id === '${N}') && !firstPass(S.projects['${N}'])`), 'the job counts in the company\'s record; a failed first inspection counts as rework');
  assert(await ev(`(() => { const a = JSON.stringify(S.projects['${N}']), c = JSON.stringify(S.comm); const S2 = rebuild(EVENTS); return a === JSON.stringify(S2.projects['${N}']) && c === JSON.stringify(S2.comm) && S2.rejected.length === 0; })()`), 'replaying the records gives the same job and ledger');

  /* nobody takes the job: follow-up, then back to an AIEC contract */
  const B = await ev(`Object.values(S.projects).find(P => P.stage === 'returned' || (P.stage === 'new' && P.id !== '${N}')).id`);
  if (await ev(`S.projects['${B}'].stage === 'returned'`)) await act('LEAD_RESUBMITTED', B, {}, await ev(`S.projects['${B}'].createdBy`));
  await act('LEAD_ACCEPTED', B, {}, 'PSALES');
  assert((await act('MODEL_SET', B, { model: 'market' }, 'PADMIN')).ok && (await act('RFQ_SENT', B, { to: ['PPART1', 'PPART2'] }, 'PADMIN')).ok, '(a second Marketplace job is sent to two companies)');
  /* a third company joins and is asked too */
  for (const [type, data] of [['USER_ADDED', { uid: 'PX3', name: 'Trio Lifts', role: 'partner', salt: 'practice', pin: await ev('S.users.PCUST.pin') }], ['PARTNER_PROFILE', { uid: 'PX3', licNo: 'MH/LIFT/2025/0099', licHolder: 'Trio Lifts', licAuthority: 'Electrical Inspector, Pune', licExpiry: await ev('addDays(300)') }]]) assert((await act(type, null, data, 'PADMIN')).ok, '(' + type + ' for a third company)');
  for (const d of await ev('REQ_DOCS.partner')) await act('DOC_VERIFIED', null, { uid: 'PX3', doc: d, status: 'verified' }, 'PADMIN');
  assert((await act('RFQ_SENT', B, { to: ['PPART1'] }, 'PADMIN')).err === 'err_mkt_23' && (await act('RFQ_SENT', B, { to: ['PX3'] }, 'PADMIN')).ok && await ev(`S.projects['${B}'].mkt.rfq.to.length === 3`), 'more companies can be asked later, up to three at a time, never the same one twice');
  await page.evaluate(b => { const m = S.projects[b].mkt; const old = new Date(Date.now() - 6 * 864e5).toISOString(); m.rfq.t = old; m.log.forEach(l => { l.t = old; }); }, B);
  assert(await ev(`needs0(S.projects['${B}']).some(n => n.k === 'mkt_followup')`), 'no quote for 5 days: the office gets a follow-up task');
  await as('PADMIN'); await page.evaluate(b => go('project', { pid: b, tab: 'info' }), B); await page.waitForTimeout(300);
  await page.click('main [data-v^="mktBack|"]'); await page.waitForTimeout(300); await fill('reason', 'No company quoted in a week'); await save();
  assert(await ev(`(() => { const P = S.projects['${B}']; return P.model === 'aiec' && !isMkt(P) && !canSee(S.users.PPART1, P) && !needs0(P).some(n => /^mkt_/.test(n.k)); })()`), 'Admin takes the job back to an AIEC contract; the companies stop seeing it and the normal steps return');

  /* ledger and KPI screens */
  assert(await ev(`(() => { const g = kpiData(7).find(x => x[0] === 'market'); return g && /\\d/.test(g[1][1][1]); })()`), 'the KPI board shows Marketplace numbers');
  const mm = await miss(page); assert(!mm.length, 'no missing words' + (mm.length ? ': ' + mm.join(' ') : ''));
  const errs = errors.filter(e => !/net::|Failed to fetch|ERR_|nominatim|CORS policy|leaflet/i.test(e)); assert(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close(); console.log('BP5 MARKET PASSED');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
